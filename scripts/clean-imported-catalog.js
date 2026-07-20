/**
 * One-shot cleanup for the Dutchie-CSV import that landed with Excel's ="value" protection
 * prefix leaking into every field. Also normalizes categories, extracts strain from names,
 * fixes UTF-8-double-encoded chars, filters junk, and deduplicates by product name.
 *
 * Idempotent: safe to run multiple times.
 * Usage:  node /opt/districtcure/scripts/clean-imported-catalog.js
 */
'use strict';
require('dotenv').config({ path: '/opt/districtcure/.env' });
const { Pool } = require('pg');

const pool = new Pool();

// UTF-8 misinterpreted as Latin-1 by whoever generated the CSV → common two-byte sequences.
const MOJIBAKE = [
  ['Ã©', 'é'], ['Ã¨', 'è'], ['Ã«', 'ë'], ['Ã¯', 'ï'], ['Ã¶', 'ö'], ['Ã¼', 'ü'],
  ['Ã±', 'ñ'], ['Ã¡', 'á'], ['Ã­', 'í'], ['Ã³', 'ó'], ['Ãº', 'ú'], ['Ã¢', 'â'],
  ['Ã®', 'î'], ['Ãª', 'ê'], ['â€™', '\''], ['â€œ', '"'], ['â€', '"'], ['â€"', '—'],
];
function fixEncoding(s) {
  if (!s) return s;
  let out = String(s);
  for (const [bad, good] of MOJIBAKE) out = out.split(bad).join(good);
  return out;
}
function stripExcelEq(s) {
  if (s == null) return '';
  return String(s).replace(/^=(?=$|[^=])/, '').trim();
}
function clean(s) { return fixEncoding(stripExcelEq(s)); }

// Category normalization — Dutchie has a dozen category variants, we want six clean buckets.
function normalizeCategory(raw, name) {
  const c = String(raw || '').toLowerCase().trim();
  const n = String(name || '').toLowerCase();
  if (c.includes('vape') || c.includes('vaporizer') || n.includes('cartridge') || n.includes(' cart') || n.includes('disposable') || n.includes(' disp')) return 'Vapes';
  if (c.includes('pre-roll') || c.includes('preroll') || c.includes('pre roll') || n.includes('prl') || n.includes('pre-roll') || n.includes('preroll')) return 'Pre-Rolls';
  if (c.includes('concentrate') || c.includes('shatter') || c.includes('crumble') || c.includes('badder') || c.includes('sugar') || c.includes('rosin') || c.includes('sauce')) return 'Concentrates';
  if (c.includes('tincture') || n.includes('tincture')) return 'Tinctures';
  if (c.includes('topical') || c.includes('salve') || c.includes('balm') || c.includes('lotion') || n.includes('bath salt') || n.includes('salve') || n.includes('gel ')) return 'Topicals';
  if (c.includes('edible') || c.includes('gummy') || c.includes('chocolate') || n.includes('gummies') || n.includes('lozenge') || n.includes('troche') || n.includes('capsule')) return 'Edibles';
  if (c.includes('flower') || c.includes('bud')) return 'Flower';
  if (c.includes('accessor')) return 'Accessories';
  return 'Accessories'; // unknown → accessories bucket
}

function extractStrain(existingStrain, name, dutchieStrainType) {
  const explicit = String(dutchieStrainType || '').toLowerCase().trim();
  if (['indica','sativa','hybrid','cbd'].includes(explicit)) return explicit;
  const n = String(name || '').toLowerCase();
  if (/\bsativa\b/.test(n)) return 'sativa';
  if (/\bindica\b/.test(n)) return 'indica';
  if (/\bhybrid\b/.test(n)) return 'hybrid';
  const s = String(existingStrain || '').toLowerCase().trim();
  if (['indica','sativa','hybrid','cbd'].includes(s)) return s;
  return ''; // leave blank; storefront handles blank as generic
}

function fixThcCbd(v, label) {
  if (!v) return '';
  const str = String(v).trim();
  // If already "THC XX%" or "CBD X%" then normalize spacing.
  const already = str.match(/^(THC|CBD)\s*[\d.]+\s*%?$/i);
  if (already) {
    const n = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (!isNaN(n) && n > 0 && n <= 100) return `${label} ${n}%`;
    return '';
  }
  // Extract a plausible percentage.
  const pct = str.match(/([\d.]+)\s*%/);
  if (pct) {
    const n = parseFloat(pct[1]);
    if (!isNaN(n) && n > 0 && n <= 100) return `${label} ${n}%`;
  }
  // "22 mg" doesn't make sense as THC% on flower — reject unless we can rescue it.
  return '';
}

// Emoji by normalized category.
function emojiFor(cat) {
  return { Flower: '🌿', 'Pre-Rolls': '🌱', Concentrates: '💎', Vapes: '💨',
           Edibles: '🍬', Tinctures: '💧', Topicals: '🧴', Accessories: '🛠' }[cat] || '🌿';
}

// Junk filter. Beverages, deprecated $0/$1 items, obvious test products.
const JUNK_NAMES = /\b(coke|gatorade|pepsi|sprite|carrot 16oz|cran apple|kiwi lemon|ginger ale|design\/glass tray|large corn pipe|medium corn pipe|small corn pipe|small lighter|super jumbo lighter|big grinder|small grinder|design ?\/? ?glass|super silver dawg|zack.?s cake|pink lemonade)\b/i;
function isJunk(p) {
  const price = Number(p.price) || 0;
  const name = String(p.name || '').toLowerCase();
  if (JUNK_NAMES.test(name)) return true;
  if (price <= 1) return true;                              // $0 or $1 = placeholder
  if (price <= 3 && p.category === 'Accessories' && !/pipe|paper|grinder|lighter|tray/i.test(name)) return true;
  return false;
}

(async () => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT data FROM coll_products`);
    const raw = rows.map(r => r.data);
    console.log(`Loaded ${raw.length} products from DB.`);

    // Step 1: normalize every field.
    const cleaned = raw.map(p => {
      const name       = clean(p.name);
      const brand      = clean(p.brand);
      const rawCat     = clean(p.category);
      const category   = normalizeCategory(rawCat, name);
      const strain     = extractStrain(p.strain, name, p.strainType || p.strainTypeRaw);
      const thc        = fixThcCbd(p.thc, 'THC');
      const cbd        = fixThcCbd(p.cbd, 'CBD');
      const weight     = clean(p.weight);
      const description= clean(p.description);
      const image      = clean(p.image);
      const price      = Number(p.price) || 0;
      const quantity   = Math.max(0, parseInt(p.quantity, 10) || 0);
      return {
        ...p,
        name, brand, category, strain, thc, cbd, weight, description, image,
        price, quantity,
        emoji: emojiFor(category),
        available: quantity > 0,
      };
    });

    // Step 2: drop junk BEFORE deduping so we don't dedupe two junk rows together.
    const nonJunk = cleaned.filter(p => !isJunk(p));
    console.log(`Filtered ${cleaned.length - nonJunk.length} junk items (beverages, $0-$1, deprecated).`);

    // Step 3: dedupe by normalized (name + weight). When merging, prefer the row with
    // more complete data (image, description, higher qty, brand set).
    const rank = (p) => {
      let s = 0;
      if (p.image) s += 4;
      if (p.description && p.description.length > 20) s += 3;
      if (p.brand) s += 2;
      if (p.thc) s += 1;
      if (p.quantity > 0) s += 3;
      if (p.price > 0) s += 1;
      return s;
    };
    const byKey = new Map();
    for (const p of nonJunk) {
      const key = (p.name || '').toLowerCase().trim() + '|' + (p.weight || '').toLowerCase().trim();
      if (!key.startsWith('|')) {
        const existing = byKey.get(key);
        if (!existing || rank(p) > rank(existing)) {
          // Also merge fields from the loser into the winner if the winner is missing them.
          if (existing) {
            for (const f of ['image','description','brand','thc','cbd','strain']) {
              if (!p[f] && existing[f]) p[f] = existing[f];
            }
            // Sum quantities (both SKUs = both piles of physical inventory).
            p.quantity = (Number(p.quantity)||0) + (Number(existing.quantity)||0);
            p.available = p.quantity > 0;
          }
          byKey.set(key, p);
        } else {
          // Loser: still merge into winner what winner might be missing.
          const winner = byKey.get(key);
          for (const f of ['image','description','brand','thc','cbd','strain']) {
            if (!winner[f] && p[f]) winner[f] = p[f];
          }
          winner.quantity = (Number(winner.quantity)||0) + (Number(p.quantity)||0);
          winner.available = winner.quantity > 0;
        }
      }
    }
    const finalProducts = [...byKey.values()];
    console.log(`Deduped to ${finalProducts.length} unique products.`);

    // Step 4: re-id everything with clean sequential ids and stamp updatedAt.
    const now = new Date().toISOString();
    finalProducts.forEach((p, i) => {
      p.id = `p-${String(i+1).padStart(4, '0')}`;
      p.updatedAt = now;
    });

    // Step 5: atomic replace.
    await client.query('BEGIN');
    await client.query('DELETE FROM coll_products');
    for (const p of finalProducts) {
      await client.query(`INSERT INTO coll_products (id, data) VALUES ($1, $2)`, [p.id, p]);
    }
    await client.query('COMMIT');

    // Summary.
    const byCategory = {};
    finalProducts.forEach(p => byCategory[p.category] = (byCategory[p.category] || 0) + 1);
    console.log('\n=== FINAL BREAKDOWN ===');
    Object.entries(byCategory).sort((a,b) => b[1] - a[1]).forEach(([c, n]) => console.log('  ' + c.padEnd(14), n));
    const withImage = finalProducts.filter(p => p.image).length;
    const withStrain = finalProducts.filter(p => p.strain).length;
    const inStock = finalProducts.filter(p => p.available).length;
    console.log(`\n  With image URL: ${withImage} / ${finalProducts.length}`);
    console.log(`  With strain:    ${withStrain} / ${finalProducts.length}`);
    console.log(`  In stock:       ${inStock} / ${finalProducts.length}`);
  } catch (e) {
    console.error('CLEANUP FAILED:', e.message);
    await client.query('ROLLBACK').catch(() => {});
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
