/**
 * PostgreSQL-backed persistence with the SAME interface the app already uses.
 *
 * Design: each document collection is a table `coll_<name>` with columns
 *   (id TEXT PK, data JSONB, seq BIGSERIAL, updated_at TIMESTAMPTZ).
 * Singletons live in `app_singletons (name TEXT PK, data JSONB)`.
 *
 * Reads are served synchronously from an in-memory cache (hydrated at init),
 * exactly like the old JSON store — so no call sites had to change. Writes go
 * to the cache AND PostgreSQL (the durable system of record).
 *
 * On first boot, any empty table is seeded from the matching data/<name>.json
 * file (the previous live data) or the in-code defaults — this performs the
 * one-time migration automatically. The legacy JSON store is kept at
 * store.legacy.js for rollback.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

let pool = null;
const caches   = new Map();  // name -> array (collection) | object (singleton)
const registry = [];         // { kind, name, defaults }

function safeName(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`[store] invalid name: ${name}`);
  return name;
}
const tableFor = (name) => `coll_${safeName(name)}`;

function readJsonFile(name, fallback) {
  const f = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(f)) return fallback;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.error(`[store] corrupt ${name}.json:`, e.message); return fallback; }
}

// Serialize writes per store so concurrent updates can't interleave
const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release; const next = new Promise(r => (release = r));
  locks.set(key, prev.then(() => next));
  await prev;
  try { return await fn(); }
  finally { release(); if (locks.get(key) === next) locks.delete(key); }
}

// ─── PostgreSQL helpers ─────────────────────────────────────────
async function pgUpsert(name, doc) {
  await pool.query(
    `INSERT INTO ${tableFor(name)} (id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = now()`,
    [String(doc.id), JSON.stringify(doc)]
  );
}
async function pgDelete(name, id) {
  await pool.query(`DELETE FROM ${tableFor(name)} WHERE id = $1`, [String(id)]);
}
async function pgReplaceAll(name, arr) {
  const t = tableFor(name);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${t}`);
    for (const doc of arr) {
      await client.query(
        `INSERT INTO ${t} (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
        [String(doc.id), JSON.stringify(doc)]
      );
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function pgLoadAll(name) {
  const { rows } = await pool.query(`SELECT data FROM ${tableFor(name)} ORDER BY seq ASC`);
  return rows.map(r => r.data);
}
async function pgSetSingleton(name, value) {
  await pool.query(
    `INSERT INTO app_singletons (name, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (name) DO UPDATE SET data = $2::jsonb, updated_at = now()`,
    [name, JSON.stringify(value)]
  );
}

// ─── Public API (unchanged interface) ───────────────────────────
function collection(name, defaults = []) {
  safeName(name);
  registry.push({ kind: 'collection', name, defaults });
  if (!caches.has(name)) caches.set(name, Array.isArray(defaults) ? structuredClone(defaults) : []);
  return {
    all:  () => structuredClone(caches.get(name) || []),
    find: (pred) => (caches.get(name) || []).find(pred),
    get:  (id) => (caches.get(name) || []).find(x => x.id === id),
    set: async (arr) => withLock(name, async () => {
      caches.set(name, arr);
      await pgReplaceAll(name, arr);
      return arr;
    }),
    upsert: async (item) => withLock(name, async () => {
      const cache = caches.get(name) || [];
      const i = cache.findIndex(x => x.id === item.id);
      let merged;
      if (i >= 0) { merged = { ...cache[i], ...item }; cache[i] = merged; }
      else { merged = item; cache.push(merged); }
      caches.set(name, cache);
      await pgUpsert(name, merged);
      return merged;
    }),
    remove: async (id) => withLock(name, async () => {
      const cache = caches.get(name) || [];
      const before = cache.length;
      const next = cache.filter(x => x.id !== id);
      caches.set(name, next);
      if (next.length !== before) await pgDelete(name, id);
      return before - next.length;
    }),
    reload: async () => { const rows = await pgLoadAll(name); caches.set(name, rows); return rows; },
  };
}

function singleton(name, defaults = {}) {
  safeName(name);
  registry.push({ kind: 'singleton', name, defaults });
  if (!caches.has(name)) caches.set(name, structuredClone(defaults));
  const key = `__singleton_${name}`;
  return {
    get: () => structuredClone(caches.get(name) || {}),
    set: async (value) => withLock(key, async () => {
      caches.set(name, value);
      await pgSetSingleton(name, value);
      return value;
    }),
    patch: async (patch) => withLock(key, async () => {
      const merged = { ...(caches.get(name) || {}), ...patch };
      caches.set(name, merged);
      await pgSetSingleton(name, merged);
      return merged;
    }),
  };
}

// ─── Startup: connect, ensure schema, hydrate cache, migrate ────
async function init() {
  pool = new Pool({
    host:     process.env.PGHOST     || '127.0.0.1',
    port:     parseInt(process.env.PGPORT || '5432'),
    user:     process.env.PGUSER     || 'dc_app',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'districtcure',
    max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000,
  });
  pool.on('error', (e) => console.error('[store] pg pool error:', e.message));
  await pool.query('SELECT 1');  // fail fast if DB unreachable
  await pool.query(`CREATE TABLE IF NOT EXISTS app_singletons (
    name TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`);

  let migrated = 0;
  for (const reg of registry) {
    if (reg.kind === 'collection') {
      const t = tableFor(reg.name);
      await pool.query(`CREATE TABLE IF NOT EXISTS ${t} (
        id TEXT PRIMARY KEY, data JSONB NOT NULL, seq BIGSERIAL, updated_at TIMESTAMPTZ DEFAULT now())`);
      let rows = await pgLoadAll(reg.name);
      if (rows.length === 0) {
        const seed = readJsonFile(reg.name, Array.isArray(reg.defaults) ? reg.defaults : []);
        if (Array.isArray(seed) && seed.length) {
          await pgReplaceAll(reg.name, seed);
          rows = await pgLoadAll(reg.name);
          migrated += rows.length;
        }
      }
      caches.set(reg.name, rows);
    } else {
      const { rows } = await pool.query(`SELECT data FROM app_singletons WHERE name = $1`, [reg.name]);
      if (rows.length) {
        caches.set(reg.name, rows[0].data);
      } else {
        const seed = readJsonFile(reg.name, reg.defaults);
        caches.set(reg.name, seed);
        await pgSetSingleton(reg.name, seed);
        migrated += 1;
      }
    }
  }
  console.log(`[store] PostgreSQL ready — ${registry.length} stores hydrated${migrated ? `, migrated ${migrated} records` : ''}`);
}

async function close() { if (pool) await pool.end(); }

module.exports = { collection, singleton, init, close, DATA_DIR };
