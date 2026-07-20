/**
 * One-shot: read Dutchie catalog CSV directly, parse with =prefix fix, normalize
 * categories/strains, prepend CDN base to bare image filenames, dedupe by name,
 * filter junk, and replace coll_products atomically.
 *
 * Usage:  node /opt/districtcure/scripts/import-and-clean.js <csv-path>
 */
'use strict';
require('dotenv').config({ path: '/opt/districtcure/.env' });
const fs = require('fs');
const { Pool } = require('pg');

const CSV = process.argv[2];
if (!CSV || !fs.existsSync(CSV)) { console.error('Missing or invalid CSV path:', CSV); process.exit(1); }

// Dutchie's CDN base for product images (filenames come out of their CSV bare).
const IMAGE_BASE = 'https://leaflogixmedia.blob.core.windows.net/product-image/';

function parseCsv(text) {
  const rows = [];
  let cur = [], cell = '', inQ = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"' && src[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cur.push(cell); cell = ''; }
      else if (c === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell || cur.length) { cur.push(cell); rows.push(cur); }
  return rows.map(r => r.map(cell => cell.replace(/^=(?=$|[^=])/, ''))).filter(r => r.some(c => c && c.trim()));
}

const MOJIBAKE = [['Ã©','é'],['Ã¨','è'],['Ã«','ë'],['Ã¯','ï'],['Ã¶','ö'],['Ã¼','ü'],['Ã±','ñ'],['Ã¡','á'],['Ã­','í'],['Ã³','ó'],['Ãº','ú'],['Ã¢','â'],['Ã®','î'],['Ãª','ê']];
function fix(s) { if (!s) return ''; let o = String(s); for (const [b,g] of MOJIBAKE) o = o.split(b).join(g); return o.trim(); }
function pick(row, ...names) { for (const n of names) { if (row[n] != null && String(row[n]).trim() !== '') return fix(row[n]); } return ''; }

function normalizeCategory(rawCat, name) {
  const c = String(rawCat || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (c.includes('vape') || c.includes('vaporizer') || /cartridge|disposable|\bcart\b|\bdisp\b|dompen|pod\b/.test(n)) return 'Vapes';
  if (c.includes('pre-roll') || c.includes('preroll') || /\bprl\b|pre[- ]?roll/.test(n)) return 'Pre-Rolls';
  if (c.includes('concentrate') || /shatter|crumble|badder|sugar|rosin|\bsauce\b/.test(n)) return 'Concentrates';
  if (c.includes('tincture') || /tincture/.test(n)) return 'Tinctures';
  if (c.includes('topical') || /bath salt|salve|\bgel\b|lotion|balm/.test(n)) return 'Topicals';
  if (c.includes('edible') || /gummy|gummies|lozenge|troche|capsule|chocolate/.test(n)) return 'Edibles';
  if (c.includes('flower') || c.includes('bud')) return 'Flower';
  if (c.includes('accessor')) return 'Accessories';
  return 'Flower';
}
function extractStrain(dutchieStrainType, name) {
  const explicit = String(dutchieStrainType || '').toLowerCase().trim();
  if (['indica','sativa','hybrid','cbd'].includes(explicit)) return explicit;
  const n = String(name || '').toLowerCase();
  if (/\bsativa\b/.test(n)) return 'sativa';
  if (/\bindica\b/.test(n)) return 'indica';
  if (/\bhybrid\b/.test(n)) return 'hybrid';
  return '';
}
function fixCannabinoid(v, label) {
  if (!v) return '';
  const str = String(v).trim();
  const pct = str.match(/([\d.]+)\s*%/);
  if (pct) { const n = parseFloat(pct[1]); if (n > 0 && n <= 100) return `${label} ${n}%`; }
  return '';
}
function emojiFor(cat) {
  return { Flower:'🌿','Pre-Rolls':'🌱', Concentrates:'💎', Vapes:'💨', Edibles:'🍬', Tinctures:'💧', Topicals:'🧴', Accessories:'🛠' }[cat] || '🌿';
}
function isJunk(p) {
  const n = String(p.name || '').toLowerCase();
  if (/\b(coke|gatorade|pepsi|sprite|carrot 16oz|cran apple|kiwi lemon|ginger ale|design\/glass tray|large corn pipe|medium corn pipe|small corn pipe|small lighter|super jumbo lighter|big grinder|small grinder|zack.?s cake|super silver dawg)\b/.test(n)) return true;
  if ((Number(p.price) || 0) <= 1) return true;    // placeholder prices
  return false;
}
function fixImage(raw) {
  const s = fix(raw);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return IMAGE_BASE + s;
}

(async () => {
  const pool = new Pool();
  const client = await pool.connect();
  try {
    const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
    if (rows.length < 2) throw new Error('CSV has no data rows');
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
    const data = rows.slice(1).map(r => { const o = {}; headers.forEach((h,i) => o[h] = (r[i]||'').trim()); return o; });
    console.log(`Parsed ${data.length} CSV rows.`);

    const products = data.map(row => {
      const name     = pick(row, 'product', 'product name', 'name');
      const brand    = pick(row, 'brand', 'vendor', 'producer');
      const rawCat   = pick(row, 'category', 'menu category');
      const category = normalizeCategory(rawCat, name);
      const strainRaw= pick(row, 'strain type', 'strain');
      const strain   = extractStrain(strainRaw, name);
      const price    = Number(pick(row, 'price', 'location price')) || 0;
      const quantity = Math.max(0, parseInt(pick(row, 'available'), 10) || 0);
      const thc      = fixCannabinoid(pick(row, 'thc content'), 'THC');
      const cbd      = fixCannabinoid(pick(row, 'cbd content'), 'CBD');
      const weight   = pick(row, 'size', 'product grams', 'net weight');
      const image    = fixImage(pick(row, 'image url', 'image'));
      const desc     = pick(row, 'online description', 'alternate description');
      return { name, brand, category, strain, price, quantity, thc, cbd, weight, image, description: desc, emoji: emojiFor(category), available: quantity > 0, badge: '', compareAt: null };
    }).filter(p => p.name);
    console.log(`Mapped ${products.length} products.`);

    // Junk filter
    const nonJunk = products.filter(p => !isJunk(p));
    console.log(`Dropped ${products.length - nonJunk.length} junk items.`);

    // Dedupe by (name lowercase + weight lowercase). Keep the best row + sum quantities.
    const rank = (p) => (p.image?4:0) + (p.description?.length>10?2:0) + (p.brand?2:0) + (p.thc?1:0) + (p.quantity>0?3:0) + (p.price>0?1:0);
    const byKey = new Map();
    for (const p of nonJunk) {
      const key = p.name.toLowerCase() + '|' + (p.weight || '').toLowerCase();
      const ex = byKey.get(key);
      if (!ex) { byKey.set(key, p); continue; }
      const [win, lose] = rank(p) > rank(ex) ? [p, ex] : [ex, p];
      for (const f of ['image','description','brand','thc','cbd','strain']) if (!win[f] && lose[f]) win[f] = lose[f];
      win.quantity = (Number(win.quantity)||0) + (Number(lose.quantity)||0);
      win.available = win.quantity > 0;
      byKey.set(key, win);
    }
    const final = [...byKey.values()];
    console.log(`Deduped to ${final.length} unique products.`);

    const now = new Date().toISOString();
    final.forEach((p, i) => { p.id = `p-${String(i+1).padStart(4,'0')}`; p.updatedAt = now; });

    await client.query('BEGIN');
    await client.query('DELETE FROM coll_products');
    for (const p of final) await client.query('INSERT INTO coll_products (id, data) VALUES ($1, $2)', [p.id, p]);
    await client.query('COMMIT');

    const byCat = {};
    final.forEach(p => byCat[p.category] = (byCat[p.category] || 0) + 1);
    console.log('\n=== FINAL BREAKDOWN ===');
    Object.entries(byCat).sort((a,b) => b[1] - a[1]).forEach(([c,n]) => console.log('  ' + c.padEnd(14), n));
    console.log(`\n  With image URL: ${final.filter(p => p.image).length} / ${final.length}`);
    console.log(`  With strain:    ${final.filter(p => p.strain).length} / ${final.length}`);
    console.log(`  In stock (>0):  ${final.filter(p => p.available).length} / ${final.length}`);
    console.log(`  With THC%:      ${final.filter(p => p.thc).length} / ${final.length}`);
  } catch (e) {
    console.error('IMPORT FAILED:', e.message, e.stack);
    await client.query('ROLLBACK').catch(() => {});
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
