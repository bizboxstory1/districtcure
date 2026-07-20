/**
 * JSON file persistence with atomic writes + in-process locking.
 * One file per collection in /opt/districtcure/data/.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise(r => { release = r; });
  locks.set(key, prev.then(() => next));
  await prev;
  try { return await fn(); }
  finally { release(); if (locks.get(key) === next) locks.delete(key); }
}

function fileFor(name) { return path.join(DATA_DIR, `${name}.json`); }

function readSync(name, fallback) {
  const f = fileFor(name);
  if (!fs.existsSync(f)) return fallback;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.error(`[store] corrupt ${name}.json:`, e.message); return fallback; }
}

async function writeAtomic(name, value) {
  return withLock(name, async () => {
    const f   = fileFor(name);
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.promises.rename(tmp, f);
    return value;
  });
}

function collection(name, defaults = []) {
  let cache = readSync(name, defaults);
  return {
    all:    () => structuredClone(cache),
    find:   (pred) => cache.find(pred),
    get:    (id) => cache.find(x => x.id === id),
    set:    async (arr) => { cache = arr; await writeAtomic(name, cache); return cache; },
    upsert: async (item) => {
      const i = cache.findIndex(x => x.id === item.id);
      if (i >= 0) cache[i] = { ...cache[i], ...item };
      else cache.push(item);
      await writeAtomic(name, cache);
      return item;
    },
    remove: async (id) => {
      const before = cache.length;
      cache = cache.filter(x => x.id !== id);
      if (cache.length !== before) await writeAtomic(name, cache);
      return before - cache.length;
    },
    reload: () => { cache = readSync(name, defaults); return cache; },
  };
}

function singleton(name, defaults = {}) {
  let cache = readSync(name, defaults);
  return {
    get: () => structuredClone(cache),
    set: async (value) => { cache = value; await writeAtomic(name, cache); return cache; },
    patch: async (patch) => { cache = { ...cache, ...patch }; await writeAtomic(name, cache); return cache; },
  };
}

module.exports = { collection, singleton, DATA_DIR };
