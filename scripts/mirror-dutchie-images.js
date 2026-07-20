/**
 * Downloads every product image whose URL points at Dutchie's LeafLogix CDN
 * (leaflogixmedia.blob.core.windows.net) into /opt/districtcure/uploads/dutchie/
 * and rewrites product.image to the local path.
 *
 * - Idempotent: skips products whose image is already a local /uploads path.
 * - Detects real image format from magic bytes (Dutchie serves PNGs with
 *   application/octet-stream Content-Type, so we can't trust the header).
 * - Sequential + polite: 250ms gap between downloads so we don't spike the CDN.
 * - Safe: on any per-image failure the product keeps its original URL so the
 *   card still renders (via the browser).
 *
 * Usage:  node /opt/districtcure/scripts/mirror-dutchie-images.js
 */
'use strict';
require('dotenv').config({ path: '/opt/districtcure/.env' });
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Pool } = require('pg');

const OUT_DIR = '/opt/districtcure/uploads/dutchie';
const CDN_HOST = 'leaflogixmedia.blob.core.windows.net';
const UA = 'Mozilla/5.0 (District Cure image mirror; +https://districtcuredispensary.com)';
const TIMEOUT_MS = 15000;

fs.mkdirSync(OUT_DIR, { recursive: true });

// Detect real image format from magic bytes.
function extFor(buf) {
  if (buf.length < 8) return null;
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
  return null;
}

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirects (rare for Azure blob, but be safe).
        res.resume();
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const pool = new Pool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT id, data FROM coll_products`);
    const products = rows.map(r => ({ id: r.id, data: r.data }));

    const candidates = products.filter(p => {
      const img = String(p.data.image || '');
      if (!img) return false;
      if (img.startsWith('/uploads/')) return false;  // already mirrored
      return img.includes(CDN_HOST);
    });

    console.log(`${products.length} products total; ${candidates.length} to mirror; ${products.length - candidates.length} unchanged.`);

    let ok = 0, fail = 0;
    for (const p of candidates) {
      const url = p.data.image;
      try {
        const buf = await download(url);
        const ext = extFor(buf) || 'jpg';
        const filename = `${p.id}.${ext}`;
        const abs = path.join(OUT_DIR, filename);
        fs.writeFileSync(abs, buf);
        const localPath = `/uploads/dutchie/${filename}`;
        const newData = { ...p.data, image: localPath, imageOrigin: url };
        await client.query(`UPDATE coll_products SET data = $1 WHERE id = $2`, [newData, p.id]);
        ok++;
        process.stdout.write(`\r  mirrored ${ok}/${candidates.length}...`);
      } catch (e) {
        fail++;
        console.error(`\n  FAIL ${p.id} (${p.data.name}): ${e.message}`);
      }
      await sleep(250); // polite pause
    }
    console.log(`\n\nDONE. Success: ${ok}. Failed: ${fail}.`);

    // Summary of local disk usage.
    const files = fs.readdirSync(OUT_DIR);
    const totalBytes = files.reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0);
    console.log(`Mirror dir: ${OUT_DIR}`);
    console.log(`Files: ${files.length}, total ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('MIRROR FAILED:', e.message); process.exit(1); });
