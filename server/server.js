/**
 * District Cure Dispensary — Production API Server
 * Express + Socket.io + JSON persistence + password auth + admin CRUD
 */
'use strict';
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compress     = require('compression');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const multer       = require('multer');
const path         = require('path');
const http         = require('http');
const fs           = require('fs');
const { nanoid }   = require('nanoid');
const { Server }   = require('socket.io');

const { collection, singleton, init: initStore, DATA_DIR } = require('./lib/store');
const auth   = require('./lib/auth');
const seed   = require('./lib/seed');
const blogviews = require('./lib/blogviews');

// ─── App + Socket ───────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

// ─── Persistence (one cluster worker writes; all read) ──────────
const PRODUCTS  = collection('products',  seed.PRODUCTS);
const ORDERS    = collection('orders',    []);
const CUSTOMERS = collection('customers', []);
const DRIVERS   = collection('drivers',   seed.DRIVERS_SEED);
const STAFF     = collection('staff',     seed.STAFF_SEED);
const PROMOS    = collection('promos',    seed.PROMOS_SEED);
const SPECIALS  = collection('specials',  seed.SPECIALS_SEED);
const REVIEWS   = collection('reviews',   seed.REVIEWS_SEED);
const POSTS     = collection('posts',     seed.POSTS_SEED);
const SETTINGS  = singleton ('settings',  seed.SETTINGS_DEFAULT);
const USERS     = collection('users',     []);  // { id, username, passwordHash, role }

// ─── Bootstrap default admin user (runs after the store is hydrated) ─────
async function bootstrapAdmin() {
  if (USERS.all().length === 0) {
    const pwd  = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await auth.hash(pwd);
    await USERS.upsert({ id:'u1', username:'admin', passwordHash:hash, role:'owner', name:'Admin User', createdAt:new Date().toISOString() });
    console.log(`\n   🔑  Default admin created — username: admin · password: ${pwd}`);
    console.log(`       (Set ADMIN_PASSWORD in .env before first run to override)\n`);
  }
}

// ─── Middleware ─────────────────────────────────────────────────
// Trust proxy only when actually behind one (nginx forwards X-Forwarded-For).
if (process.env.BEHIND_PROXY === '1') app.set('trust proxy', 1);
app.use(compress());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 600, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 30 }));

// ─── Static ─────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
app.use('/uploads', express.static(path.join(ROOT, 'uploads'), { maxAge:'7d' }));
app.use('/admin/static', express.static(path.join(ROOT, 'admin'), { maxAge:'1h' }));
app.use(express.static(path.join(ROOT, 'storefront'), {
  maxAge: '1h',
  index: false,   // let the '/' route handle the homepage (so we can inject SEO verification meta)
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  },
}));

// ─── Image upload (multer) ──────────────────────────────────────
const UPLOAD_DIR = path.join(ROOT, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename:    (_, file, cb) => cb(null, `${Date.now()}-${nanoid(8)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits:    { fileSize: 10 * 1024 * 1024 },
  fileFilter:(_, file, cb) => /^image\/(jpe?g|png|webp|gif|avif)$/.test(file.mimetype) ? cb(null,true) : cb(new Error('Image files only')),
});

// Run multer but translate its errors into JSON (otherwise Express returns an HTML
// error page, which the browser fails to parse → "Unexpected token '<'").
const uploadImage = (req, res, next) => upload.single('image')(req, res, (err) => {
  if (!err) return next();
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image too large — max 10MB' : (err.message || 'Upload failed');
  res.status(400).json({ error: msg });
});

// ─── Auth middleware ────────────────────────────────────────────
const getUser = (id) => USERS.get(id);
const requireAdmin = auth.requireAuth(getUser);
const requireOwner = auth.requireOwner(getUser);

// ═══════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/api/health', (_, res) => res.json({
  ok: true, ts: new Date().toISOString(), env: process.env.NODE_ENV || 'development',
  productCount: PRODUCTS.all().length,
  orderCount:   ORDERS.all().length,
}));

// Public menu (available products only, with all metadata)
app.get('/api/menu', (req, res) => {
  const all = PRODUCTS.all();
  const products = all.filter(p => p.available !== false);
  res.json({
    success: true, source: 'live', count: products.length,
    products, syncedAt: new Date().toISOString(),
  });
});

app.get('/api/dispensary', (_, res) => {
  const s = SETTINGS.get();
  res.json({ success:true, dispensary:{
    name: s.storeName, phone: s.phone, email: s.email,
    brandLogo: s.brandLogo || '',
    address: s.address, hours: s.hours, featureFlags: s.featureFlags,
    dutchieUrl: s.dutchieUrl,
    localMenuEnabled: s.localMenuEnabled === true,
    localCartEnabled: s.localCartEnabled === true,
    loyaltyEnabled: s.loyaltyEnabled === true,
    geo: s.geo || null,
    google: publicGoogle(s.google),
    social: s.social || null,
  }});
});

// Strip server-only secrets (apiKey, placeId) before sending google info to the browser
function publicGoogle(g) {
  if (!g) return null;
  return { rating: g.rating || 0, reviewCount: g.reviewCount || 0, profileUrl: g.profileUrl || '', reviewUrl: g.reviewUrl || '', lastSync: g.lastSync || '' };
}

// Public: published customer reviews (featured first, then newest)
app.get('/api/reviews', (_, res) => {
  const list = REVIEWS.all()
    .filter(r => r.status !== 'hidden')
    .sort((a, b) => (b.featured?1:0) - (a.featured?1:0) || new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt));
  const s = SETTINGS.get();
  res.json({ success:true, reviews: list, google: publicGoogle(s.google) });
});

// ─── Blog (public) ──────────────────────────────────────────────
function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
const publishedPosts = () => POSTS.all()
  .filter(p => p.status === 'published')
  .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));

app.get('/api/blog', (req, res) => {
  let list = publishedPosts();
  if (req.query.category && req.query.category !== 'All') list = list.filter(p => p.category === req.query.category);
  const limit = Math.min(50, Number(req.query.limit) || 50);
  // Trim body from list payloads (keep it light)
  const lite = list.slice(0, limit).map(({ body, ...rest }) => rest);
  res.json({ success: true, posts: lite, total: list.length });
});

app.get('/api/blog/categories', (_, res) => {
  const counts = {};
  for (const p of publishedPosts()) counts[p.category || 'Uncategorized'] = (counts[p.category || 'Uncategorized'] || 0) + 1;
  res.json({ success: true, categories: Object.entries(counts).map(([name, count]) => ({ name, count })) });
});

app.get('/api/blog/:slug', (req, res) => {
  const post = POSTS.all().find(p => p.slug === req.params.slug && p.status === 'published');
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ success: true, post });
});

// Public order creation
app.post('/api/orders', async (req, res) => {
  const { items, customer, fulfillment, address, notes, promoCode, specialId } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error:'No items in order' });

  const s = SETTINGS.get();
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price)||0) * (Number(i.qty)||0), 0);

  let promoDiscount = 0;
  if (promoCode) {
    const promo = PROMOS.all().find(p => p.code === String(promoCode).toUpperCase() && p.status === 'active');
    if (promo) {
      if (promo.type === 'percent') promoDiscount = subtotal * (promo.value/100);
      else if (promo.type === 'fixed') promoDiscount = promo.value;
    }
  }

  const taxableBase = Math.max(0, subtotal - promoDiscount);
  const tax    = +(taxableBase * s.taxRate).toFixed(2);
  const delFee = fulfillment === 'delivery' && subtotal < s.freeDeliveryMin ? s.deliveryFee : 0;
  const total  = +(taxableBase + tax + delFee).toFixed(2);

  const order = {
    id: `DC-${Date.now().toString(36).toUpperCase()}-${nanoid(4)}`,
    items, customer: customer || {}, fulfillment: fulfillment || 'delivery',
    address: address || {}, notes: notes || '',
    promoCode: promoCode || null, promoDiscount,
    specialId: specialId || null,
    status: 'pending',
    subtotal, tax, delFee, total,
    driverId: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await ORDERS.upsert(order);

  // Attribute the order to the special that referred it (used when Dutchie sales sync lands)
  if (specialId) {
    const sp = SPECIALS.get(specialId);
    if (sp) await SPECIALS.upsert({
      ...sp,
      attributedOrders: (sp.attributedOrders || 0) + 1,
      attributedRevenue: +((sp.attributedRevenue || 0) + total).toFixed(2),
    });
  }

  // Track customer + loyalty
  if (customer?.phone) {
    const phone = String(customer.phone).replace(/\D/g, '');
    const existing = CUSTOMERS.all().find(c => c.phone === phone);
    const earnedPoints = Math.floor(total * (s.loyaltyPerDollar || 10));
    if (existing) {
      const orders = (existing.orders || 0) + 1;
      const spent  = +((existing.totalSpent || 0) + total).toFixed(2);
      const points = (existing.points || 0) + earnedPoints;
      const tier   = points >= 5000 ? 'platinum' : points >= 2500 ? 'gold' : points >= 1000 ? 'silver' : 'bronze';
      await CUSTOMERS.upsert({ ...existing, orders, totalSpent:spent, points, lifetimePoints:(existing.lifetimePoints||0)+earnedPoints, tier, lastOrderAt:new Date().toISOString() });
    } else {
      await CUSTOMERS.upsert({
        id: nanoid(10), name: customer.name || 'Guest', phone,
        email: customer.email || '', ageVerified: !!customer.ageVerified,
        orders: 1, totalSpent: total, points: earnedPoints, lifetimePoints: earnedPoints,
        tier: 'bronze', lastOrderAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      });
    }
  }

  // Decrement stock for ordered items
  for (const it of items) {
    const p = PRODUCTS.get(it.id);
    if (p && typeof p.quantity === 'number') {
      const newQty = Math.max(0, p.quantity - (Number(it.qty)||0));
      await PRODUCTS.upsert({ ...p, quantity: newQty, available: newQty > 0 });
    }
  }

  io.to('admin-room').emit('new_order', order);
  res.status(201).json({ success:true, order });
});

// Public: validate promo
app.post('/api/promo/validate', (req, res) => {
  const code = String(req.body?.code || '').toUpperCase();
  const promo = PROMOS.all().find(p => p.code === code && p.status === 'active');
  if (!promo) return res.json({ success:false, error:'Invalid or expired promo code' });
  res.json({ success:true, promo:{ code:promo.code, type:promo.type, value:promo.value, name:promo.name } });
});

// ─── Specials ───────────────────────────────────────────────────
// A special is "live" when status=published AND now is inside any
// startAt/endAt window AND the cadence rule matches today's date.
function isSpecialLive(sp, now = new Date()) {
  if (sp.status !== 'published') return false;
  if (sp.startAt && now < new Date(sp.startAt)) return false;
  if (sp.endAt && now > new Date(sp.endAt)) return false;
  const cadence = sp.cadence || 'one-off';
  if (cadence === 'one-off' || cadence === 'daily') return true;
  if (cadence === 'weekly') {
    const days = Array.isArray(sp.daysOfWeek) ? sp.daysOfWeek : [];
    return days.length === 0 || days.includes(now.getDay());
  }
  if (cadence === 'monthly') {
    const days = Array.isArray(sp.daysOfMonth) ? sp.daysOfMonth : [];
    return days.length === 0 || days.includes(now.getDate());
  }
  return true;
}

// Public: live specials for the homepage
app.get('/api/specials', (_, res) => {
  const now = new Date();
  const live = SPECIALS.all()
    .filter(sp => isSpecialLive(sp, now))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  // bump impressions, fire-and-forget (don't await — keeps response snappy)
  Promise.all(live.map(sp => SPECIALS.upsert({ ...sp, impressions: (sp.impressions || 0) + 1 }))).catch(() => {});
  // Trim internal counters from public response
  const publicView = live.map(({ impressions, clicks, attributedOrders, attributedRevenue, status, ...rest }) => rest);
  res.json({ success: true, specials: publicView });
});

// Public: track special click (used for Dutchie attribution once live)
app.post('/api/specials/:id/click', async (req, res) => {
  const sp = SPECIALS.get(req.params.id);
  if (!sp) return res.status(404).json({ error: 'Special not found' });
  await SPECIALS.upsert({ ...sp, clicks: (sp.clicks || 0) + 1 });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error:'Username and password required' });
  const uname = String(username).trim().toLowerCase();
  const user = USERS.all().find(u => String(u.username).toLowerCase() === uname);
  if (!user || !(await auth.verify(password, user.passwordHash))) return res.status(401).json({ error:'Invalid credentials' });
  const token = auth.createSession(user.id);
  res.cookie('dc_session', token, auth.cookieOpts(req));
  res.json({ success:true, user:{ id:user.id, username:user.username, role:user.role, name:user.name } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.dc_session;
  if (token) auth.destroySession(token);
  res.clearCookie('dc_session');
  res.json({ success:true });
});

app.get('/api/auth/me', (req, res) => {
  const userId = auth.validateSession(req.cookies?.dc_session);
  if (!userId) return res.status(401).json({ error:'Not authenticated' });
  const user = USERS.get(userId);
  if (!user) return res.status(401).json({ error:'Not authenticated' });
  res.json({ success:true, user:{ id:user.id, username:user.username, role:user.role, name:user.name } });
});

app.post('/api/auth/change-password', requireAdmin, async (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next || next.length < 6) return res.status(400).json({ error:'Provide current + new password (min 6 chars)' });
  const user = USERS.get(req.user.id);
  if (!user || !(await auth.verify(current, user.passwordHash))) return res.status(401).json({ error:'Current password incorrect' });
  await USERS.upsert({ ...user, passwordHash: await auth.hash(next) });
  res.json({ success:true });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES (all behind requireAdmin)
// ═══════════════════════════════════════════════════════════════

// ─── Stats ──────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (_, res) => {
  const today = new Date().toDateString();
  const allOrders = ORDERS.all();
  const todayOrders = allOrders.filter(o => new Date(o.createdAt).toDateString() === today);
  const products = PRODUCTS.all();
  const lowStock = products.filter(p => (p.quantity || 0) < 5 && p.available !== false).length;

  // Last 7 days revenue
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayOrders = allOrders.filter(o => { const od = new Date(o.createdAt); return od >= d && od < next; });
    series.push({
      date: d.toISOString().slice(0,10),
      label: d.toLocaleDateString('en-US', { weekday:'short' }),
      orders: dayOrders.length,
      revenue: +dayOrders.reduce((s,o)=>s+o.total,0).toFixed(2),
    });
  }

  // Category breakdown
  const catCounts = {};
  for (const o of allOrders) for (const i of (o.items||[])) {
    const p = products.find(x => x.id === i.id);
    if (p) catCounts[p.category] = (catCounts[p.category] || 0) + (Number(i.qty)||0);
  }

  res.json({ success:true, stats:{
    todayOrders:   todayOrders.length,
    todayRevenue:  +todayOrders.reduce((s,o)=>s+o.total,0).toFixed(2),
    pendingOrders: allOrders.filter(o => o.status === 'pending').length,
    totalOrders:   allOrders.length,
    totalRevenue:  +allOrders.reduce((s,o)=>s+o.total,0).toFixed(2),
    totalProducts: products.length,
    activeProducts:products.filter(p => p.available !== false).length,
    totalCustomers:CUSTOMERS.all().length,
    totalDrivers:  DRIVERS.all().length,
    activeDrivers: DRIVERS.all().filter(d => d.status === 'available' || d.status === 'on_delivery').length,
    lowStock,
    weekly: series,
    categories: catCounts,
  }});
});

// ─── Products / Inventory ───────────────────────────────────────
app.get('/api/admin/products', requireAdmin, (_, res) => res.json({ success:true, products: PRODUCTS.all() }));

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const p = req.body || {};
  if (!p.name) return res.status(400).json({ error:'Name required' });
  const product = {
    id: p.id || `prod_${nanoid(8)}`,
    name: p.name, brand: p.brand || '', category: p.category || 'Flower',
    strain: (p.strain || 'hybrid').toLowerCase(),
    emoji: p.emoji || '🌿',
    price: Number(p.price) || 0, compareAt: p.compareAt ? Number(p.compareAt) : null,
    thc: p.thc || '', cbd: p.cbd || '', weight: p.weight || '',
    badge: p.badge || '', available: p.available !== false,
    quantity: Number(p.quantity) || 0,
    image: p.image || '', description: p.description || '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await PRODUCTS.upsert(product);
  io.emit('product_updated', product);
  res.status(201).json({ success:true, product });
});

app.patch('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const existing = PRODUCTS.get(req.params.id);
  if (!existing) return res.status(404).json({ error:'Product not found' });
  const updated = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() };
  await PRODUCTS.upsert(updated);
  io.emit('product_updated', updated);
  res.json({ success:true, product: updated });
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const n = await PRODUCTS.remove(req.params.id);
  if (!n) return res.status(404).json({ error:'Product not found' });
  io.emit('product_deleted', { id: req.params.id });
  res.json({ success:true });
});

// Image upload
app.post('/api/admin/upload', requireAdmin, uploadImage, (req, res) => {
  if (!req.file) return res.status(400).json({ error:'No file uploaded' });
  res.json({ success:true, url: `/uploads/${req.file.filename}` });
});

// Reset/reseed product catalog
app.post('/api/admin/products/reseed', requireAdmin, async (_, res) => {
  await PRODUCTS.set(seed.PRODUCTS);
  io.emit('products_reseeded');
  res.json({ success:true, count: seed.PRODUCTS.length });
});

// CSV bulk import — designed for the CSV Dutchie exports from their dashboard.
// Auto-detects column names (Product Name / Name / SKU / Category / etc.), upserts by name,
// and preserves existing per-product edits (image, description, badge) when a row has no value.
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => /^(text\/csv|text\/plain|application\/vnd\.ms-excel|application\/csv|application\/octet-stream)$/.test(file.mimetype) || /\.csv$/i.test(file.originalname)
    ? cb(null, true)
    : cb(new Error('CSV files only')),
}).single('csv');

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
  // Strip Excel's ="value" protection prefix that Dutchie and other exports wrap around
  // every field to stop Excel from converting SKUs to numbers. Without this every field
  // arrives with a leading "=" ("=Edibles", "=DISTRICT CANNABIS", "=Banana Acai Mints 3.5g").
  return rows
    .map(r => r.map(cell => cell.replace(/^=(?=$|[^=])/, '')))
    .filter(r => r.some(c => c && c.trim()));
}
function pickField(row, ...candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined && String(row[c]).trim() !== '') return String(row[c]).trim();
  }
  return '';
}
function strainEmoji(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('edible') || c.includes('gummy') || c.includes('chocolate')) return '🍬';
  if (c.includes('concentrate') || c.includes('vape') || c.includes('cart') || c.includes('dab')) return '💨';
  if (c.includes('pre-roll') || c.includes('preroll') || c.includes('joint')) return '🌱';
  if (c.includes('tincture') || c.includes('drop') || c.includes('oil')) return '💧';
  if (c.includes('topical') || c.includes('cream') || c.includes('balm')) return '🧴';
  if (c.includes('accessor') || c.includes('gear')) return '🛠';
  return '🌿';
}
function formatCannabinoid(v, label) {
  if (v === '' || v == null) return '';
  const str = String(v).trim();
  if (!str) return '';
  if (str.toUpperCase().includes(label)) return str;
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return '';
  return `${label} ${n}%`;
}

app.post('/api/admin/products/import-csv', requireAdmin, (req, res) => {
  uploadCsv(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });
    try {
      const rows = parseCsv(req.file.buffer.toString('utf8'));
      if (rows.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });
      const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
      const data = rows.slice(1).map(r => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = (r[i] || '').trim());
        return obj;
      });
      const existing = PRODUCTS.all();
      const byName = new Map(existing.map(p => [String(p.name || '').toLowerCase().trim(), p]));
      let created = 0, updated = 0, skipped = 0;
      const errors = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const name = pickField(row, 'product name', 'name', 'product', 'title', 'item name');
        if (!name) { skipped++; continue; }
        const priceStr = pickField(row, 'price', 'unit price', 'msrp', 'retail price', 'sale price');
        const price = parseFloat(String(priceStr).replace(/[^0-9.]/g, '')) || 0;
        const category  = pickField(row, 'category', 'product category', 'type', 'menu category');
        const brand     = pickField(row, 'brand', 'vendor', 'manufacturer', 'producer');
        const strain    = pickField(row, 'strain', 'strain type', 'classification', 'plant type').toLowerCase();
        const thc       = pickField(row, 'thc', 'thc %', 'thc percentage', 'thc content');
        const cbd       = pickField(row, 'cbd', 'cbd %', 'cbd percentage', 'cbd content');
        const weight    = pickField(row, 'weight', 'size', 'unit size', 'net weight');
        const qtyStr    = pickField(row, 'quantity', 'stock', 'qty', 'inventory', 'stock quantity', 'on hand');
        const quantity  = parseInt(String(qtyStr).replace(/[^0-9]/g, ''), 10) || 0;
        const desc      = pickField(row, 'description', 'desc', 'notes', 'product description', 'details');
        const image     = pickField(row, 'image', 'image url', 'photo', 'photo url', 'image src', 'thumbnail');
        const ex = byName.get(name.toLowerCase());
        const productData = {
          id:         ex?.id || `imp-${Date.now()}-${i}`,
          name,
          brand:      brand      || ex?.brand      || '',
          category:   category   || ex?.category   || 'Flower',
          strain:     ['indica','sativa','hybrid','cbd'].includes(strain) ? strain : (ex?.strain || 'hybrid'),
          emoji:      ex?.emoji  || strainEmoji(category),
          price,
          compareAt:  ex?.compareAt || null,
          thc:        formatCannabinoid(thc, 'THC') || ex?.thc || '',
          cbd:        formatCannabinoid(cbd, 'CBD') || ex?.cbd || '',
          weight:     weight     || ex?.weight     || '',
          badge:      ex?.badge  || '',
          available:  quantity > 0,
          quantity,
          image:      image      || ex?.image      || '',
          description:desc       || ex?.description|| '',
          updatedAt:  new Date().toISOString(),
        };
        try {
          await PRODUCTS.upsert(productData);
          if (ex) updated++; else created++;
        } catch (rowErr) {
          errors.push(`Row ${i + 2} (${name}): ${rowErr.message}`);
          skipped++;
        }
      }
      io.emit('products_imported', { created, updated });
      res.json({ success: true, created, updated, skipped, total: data.length, errors: errors.slice(0, 10) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// ─── Orders ─────────────────────────────────────────────────────
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const { status, limit = 100 } = req.query;
  let list = [...ORDERS.all()].reverse();
  if (status) list = list.filter(o => o.status === status);
  res.json({ success:true, orders: list.slice(0, Number(limit)), total: list.length });
});

app.get('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const order = ORDERS.get(req.params.id);
  if (!order) return res.status(404).json({ error:'Order not found' });
  res.json({ success:true, order });
});

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const existing = ORDERS.get(req.params.id);
  if (!existing) return res.status(404).json({ error:'Order not found' });
  const updated = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() };
  await ORDERS.upsert(updated);
  io.to('admin-room').emit('order_updated', updated);
  res.json({ success:true, order: updated });
});

app.post('/api/admin/orders/:id/assign-driver', requireAdmin, async (req, res) => {
  const order = ORDERS.get(req.params.id);
  if (!order) return res.status(404).json({ error:'Order not found' });
  const driver = DRIVERS.get(req.body.driverId);
  if (!driver) return res.status(404).json({ error:'Driver not found' });
  await ORDERS.upsert({ ...order, driverId: driver.id, status: 'out_for_delivery', updatedAt: new Date().toISOString() });
  await DRIVERS.upsert({ ...driver, status: 'on_delivery', currentOrder: order.id });
  io.to('admin-room').emit('order_updated', ORDERS.get(order.id));
  res.json({ success:true, order: ORDERS.get(order.id) });
});

// ─── Customers ──────────────────────────────────────────────────
app.get('/api/admin/customers', requireAdmin, (_, res) => res.json({ success:true, customers: CUSTOMERS.all() }));

app.patch('/api/admin/customers/:id', requireAdmin, async (req, res) => {
  const c = CUSTOMERS.get(req.params.id);
  if (!c) return res.status(404).json({ error:'Customer not found' });
  await CUSTOMERS.upsert({ ...c, ...req.body, id: c.id });
  res.json({ success:true, customer: CUSTOMERS.get(c.id) });
});

app.post('/api/admin/customers/:id/adjust-points', requireAdmin, async (req, res) => {
  const c = CUSTOMERS.get(req.params.id);
  if (!c) return res.status(404).json({ error:'Customer not found' });
  const delta = Number(req.body.delta) || 0;
  const points = Math.max(0, (c.points || 0) + delta);
  const tier = points >= 5000 ? 'platinum' : points >= 2500 ? 'gold' : points >= 1000 ? 'silver' : 'bronze';
  await CUSTOMERS.upsert({ ...c, points, tier });
  res.json({ success:true, customer: CUSTOMERS.get(c.id) });
});

// ─── Drivers ────────────────────────────────────────────────────
app.get('/api/admin/drivers', requireAdmin, (_, res) => res.json({ success:true, drivers: DRIVERS.all() }));

app.post('/api/admin/drivers', requireAdmin, async (req, res) => {
  const d = req.body || {};
  if (!d.name || !d.phone) return res.status(400).json({ error:'Name and phone required' });
  const driver = {
    id: `drv_${nanoid(8)}`,
    name: d.name, phone: d.phone, vehicle: d.vehicle || '',
    status: 'available', currentOrder: null, todayDeliveries: 0, rating: 5.0,
    createdAt: new Date().toISOString(),
  };
  await DRIVERS.upsert(driver);
  res.status(201).json({ success:true, driver });
});

app.patch('/api/admin/drivers/:id', requireAdmin, async (req, res) => {
  const d = DRIVERS.get(req.params.id);
  if (!d) return res.status(404).json({ error:'Driver not found' });
  await DRIVERS.upsert({ ...d, ...req.body, id: d.id });
  res.json({ success:true, driver: DRIVERS.get(d.id) });
});

app.delete('/api/admin/drivers/:id', requireAdmin, async (req, res) => {
  await DRIVERS.remove(req.params.id);
  res.json({ success:true });
});

// ─── Promos ─────────────────────────────────────────────────────
app.get('/api/admin/promos', requireAdmin, (_, res) => res.json({ success:true, promos: PROMOS.all() }));

app.post('/api/admin/promos', requireAdmin, async (req, res) => {
  const p = req.body || {};
  if (!p.name || !p.code) return res.status(400).json({ error:'Name and code required' });
  const promo = {
    id: `pro_${nanoid(8)}`,
    name: p.name, code: String(p.code).toUpperCase(),
    type: p.type || 'percent', value: Number(p.value) || 0,
    used: 0, expires: p.expires || '', status: p.status || 'active',
    createdAt: new Date().toISOString(),
  };
  await PROMOS.upsert(promo);
  res.status(201).json({ success:true, promo });
});

app.patch('/api/admin/promos/:id', requireAdmin, async (req, res) => {
  const p = PROMOS.get(req.params.id);
  if (!p) return res.status(404).json({ error:'Promo not found' });
  await PROMOS.upsert({ ...p, ...req.body, id: p.id });
  res.json({ success:true, promo: PROMOS.get(p.id) });
});

app.delete('/api/admin/promos/:id', requireAdmin, async (req, res) => {
  await PROMOS.remove(req.params.id);
  res.json({ success:true });
});

// ─── Specials (homepage visual deals) ───────────────────────────
app.get('/api/admin/specials', requireAdmin, (_, res) => {
  const list = SPECIALS.all().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  res.json({ success: true, specials: list });
});

app.post('/api/admin/specials', requireAdmin, async (req, res) => {
  const s = req.body || {};
  if (!s.title) return res.status(400).json({ error: 'Title required' });
  const special = {
    id:           `sp_${nanoid(8)}`,
    title:        s.title,
    subtitle:     s.subtitle || '',
    details:      s.details || '',
    image:        s.image || '',
    ctaLabel:     s.ctaLabel || 'Shop Now',
    ctaUrl:       s.ctaUrl || '/#shop',
    promoCode:    s.promoCode ? String(s.promoCode).toUpperCase() : '',
    cadence:      s.cadence || 'one-off',
    startAt:      s.startAt || '',
    endAt:        s.endAt || '',
    daysOfWeek:   Array.isArray(s.daysOfWeek) ? s.daysOfWeek.map(Number).filter(n => n >= 0 && n <= 6) : [],
    daysOfMonth:  Array.isArray(s.daysOfMonth) ? s.daysOfMonth.map(Number).filter(n => n >= 1 && n <= 31) : [],
    priority:     Number(s.priority) || 100,
    status:       ['draft','published','archived'].includes(s.status) ? s.status : 'draft',
    clicks: 0, impressions: 0, attributedOrders: 0, attributedRevenue: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await SPECIALS.upsert(special);
  io.emit('special_updated', special);
  res.status(201).json({ success: true, special });
});

app.patch('/api/admin/specials/:id', requireAdmin, async (req, res) => {
  const existing = SPECIALS.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Special not found' });
  const body = { ...req.body };
  if (body.promoCode) body.promoCode = String(body.promoCode).toUpperCase();
  if (body.status && !['draft','published','archived'].includes(body.status)) delete body.status;
  if (body.daysOfWeek && Array.isArray(body.daysOfWeek))
    body.daysOfWeek = body.daysOfWeek.map(Number).filter(n => n >= 0 && n <= 6);
  if (body.daysOfMonth && Array.isArray(body.daysOfMonth))
    body.daysOfMonth = body.daysOfMonth.map(Number).filter(n => n >= 1 && n <= 31);
  const updated = { ...existing, ...body, id: existing.id, updatedAt: new Date().toISOString() };
  await SPECIALS.upsert(updated);
  io.emit('special_updated', updated);
  res.json({ success: true, special: updated });
});

app.delete('/api/admin/specials/:id', requireAdmin, async (req, res) => {
  const n = await SPECIALS.remove(req.params.id);
  if (!n) return res.status(404).json({ error: 'Special not found' });
  io.emit('special_deleted', { id: req.params.id });
  res.json({ success: true });
});

// ─── Reviews (customer / Google reviews shown on storefront) ─────
app.get('/api/admin/reviews', requireAdmin, (_, res) => {
  const list = REVIEWS.all().sort((a, b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt));
  res.json({ success: true, reviews: list });
});

app.post('/api/admin/reviews', requireAdmin, async (req, res) => {
  const r = req.body || {};
  if (!r.author || !r.text) return res.status(400).json({ error: 'Author and review text required' });
  const review = {
    id:        `rev_${nanoid(8)}`,
    author:    r.author,
    rating:    Math.min(5, Math.max(1, Number(r.rating) || 5)),
    text:      r.text,
    date:      r.date || new Date().toISOString().slice(0,10),
    source:    r.source || 'google',
    featured:  r.featured === true,
    status:    r.status === 'hidden' ? 'hidden' : 'published',
    createdAt: new Date().toISOString(),
  };
  await REVIEWS.upsert(review);
  res.status(201).json({ success: true, review });
});

app.patch('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  const existing = REVIEWS.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Review not found' });
  const body = { ...req.body };
  if (body.rating != null) body.rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
  const updated = { ...existing, ...body, id: existing.id };
  await REVIEWS.upsert(updated);
  res.json({ success: true, review: updated });
});

app.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  const n = await REVIEWS.remove(req.params.id);
  if (!n) return res.status(404).json({ error: 'Review not found' });
  res.json({ success: true });
});

// ─── Blog (admin) ───────────────────────────────────────────────
function uniqueSlug(base, ignoreId) {
  let slug = slugify(base) || `post-${nanoid(6)}`;
  const taken = new Set(POSTS.all().filter(p => p.id !== ignoreId).map(p => p.slug));
  if (!taken.has(slug)) return slug;
  let i = 2; while (taken.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}
function normalizePost(input, existing) {
  const title = input.title || existing?.title || 'Untitled';
  return {
    id:        existing?.id || `post_${nanoid(10)}`,
    slug:      input.slug ? uniqueSlug(input.slug, existing?.id) : (existing?.slug || uniqueSlug(title, existing?.id)),
    title,
    excerpt:   input.excerpt ?? existing?.excerpt ?? '',
    body:      input.body ?? existing?.body ?? '',
    category:  input.category ?? existing?.category ?? 'Education',
    tags:      Array.isArray(input.tags) ? input.tags : (existing?.tags || []),
    author:    input.author ?? existing?.author ?? 'District Cure',
    coverImage:input.coverImage ?? existing?.coverImage ?? '',
    status:    ['draft','published','archived'].includes(input.status) ? input.status : (existing?.status || 'draft'),
    metaTitle: input.metaTitle ?? existing?.metaTitle ?? '',
    metaDescription: input.metaDescription ?? existing?.metaDescription ?? '',
    keywords:  Array.isArray(input.keywords) ? input.keywords : (existing?.keywords || []),
    publishedAt: input.publishedAt || existing?.publishedAt || (input.status === 'published' ? new Date().toISOString() : ''),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

app.get('/api/admin/posts', requireAdmin, (_, res) => {
  const list = POSTS.all().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  res.json({ success: true, posts: list });
});

app.post('/api/admin/posts', requireAdmin, async (req, res) => {
  if (!req.body || !req.body.title) return res.status(400).json({ error: 'Title required' });
  const post = normalizePost(req.body, null);
  await POSTS.upsert(post);
  res.status(201).json({ success: true, post });
});

app.patch('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  const existing = POSTS.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found' });
  const updated = normalizePost({ ...req.body, slug: req.body.slug || existing.slug }, existing);
  // if it just became published and had no publish date, stamp it
  if (updated.status === 'published' && !updated.publishedAt) updated.publishedAt = new Date().toISOString();
  await POSTS.upsert(updated);
  res.json({ success: true, post: updated });
});

app.delete('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  const n = await POSTS.remove(req.params.id);
  if (!n) return res.status(404).json({ error: 'Post not found' });
  res.json({ success: true });
});

// Bulk import posts from a previous site's JSON (flexible field mapping)
app.post('/api/admin/posts/import', requireAdmin, async (req, res) => {
  let items = req.body;
  if (items && !Array.isArray(items) && Array.isArray(items.posts)) items = items.posts;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected a JSON array of posts (or { "posts": [...] })' });
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return undefined; };
  let imported = 0, skipped = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') { skipped++; continue; }
    const title = pick(raw, ['title','name','heading','post_title']);
    const body  = pick(raw, ['body','content','html','post_content','contentHtml','text']);
    if (!title && !body) { skipped++; continue; }
    let tags = pick(raw, ['tags','keywords','labels']);
    if (typeof tags === 'string') tags = tags.split(',').map(t => t.trim()).filter(Boolean);
    let cat = pick(raw, ['category','categories','type','section']);
    if (Array.isArray(cat)) cat = cat[0];
    const post = normalizePost({
      title: title || 'Imported post',
      slug: pick(raw, ['slug','permalink','url_slug']),
      excerpt: pick(raw, ['excerpt','summary','description','subtitle']),
      body: body || '',
      category: cat || 'Imported',
      tags: tags || [],
      author: pick(raw, ['author','writer','by']),
      coverImage: pick(raw, ['coverImage','image','featuredImage','thumbnail','cover','featured_image']),
      status: pick(raw, ['status']) === 'draft' ? 'draft' : 'published',
      metaTitle: pick(raw, ['metaTitle','seoTitle','meta_title']),
      metaDescription: pick(raw, ['metaDescription','seoDescription','meta_description']),
      keywords: Array.isArray(raw.keywords) ? raw.keywords : (tags || []),
      publishedAt: pick(raw, ['publishedAt','date','published','created','createdAt','pubDate']),
    }, null);
    await POSTS.upsert(post);
    imported++;
  }
  res.json({ success: true, imported, skipped, total: items.length });
});

// ─── AI text providers (free: gemini/groq · paid: anthropic) ────
async function aiGenerateText(prompt) {
  const ai = SETTINGS.get().ai || {};
  const provider = ai.provider || 'pollinations';
  if (provider === 'pollinations') {
    // Free, no API key. Community service — lower quality, rate-limited, occasionally busy.
    // 'openai-fast' returns the answer directly (no reasoning wrapper that eats the token budget).
    // Retry on throttling (403/429/5xx) with backoff; robustly unwrap whatever shape comes back.
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      try {
        const resp = await fetch('https://text.pollinations.ai/', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: ai.model || 'openai-fast', seed: Math.floor(Math.random()*1e6), referrer: 'districtcure', private: true }),
        });
        if (resp.status === 403 || resp.status === 429 || resp.status >= 500) throw new Error(`busy (HTTP ${resp.status})`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = (await resp.text()).trim();
        let out = raw;
        try {
          const o = JSON.parse(raw);
          if (o && typeof o === 'object') {
            if (typeof o.content === 'string' && o.content.trim()) out = o.content;
            else if (o.choices?.[0]?.message?.content) out = o.choices[0].message.content;
            else if (o.title || o.body) out = JSON.stringify(o); // already the blog JSON
          }
        } catch { /* plain text — use as-is */ }
        if (out && out.trim()) return out;
        throw new Error('empty response');
      } catch (e) {
        lastErr = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 4000 * attempt));
      } finally { clearTimeout(timer); }
    }
    throw new Error(`the free AI writer is busy — wait a moment and retry, or add a free Gemini/Groq key for reliable results (${lastErr?.message || ''})`);
  }
  if (provider === 'gemini') {
    if (!ai.geminiKey) throw new Error('Add your free Google Gemini API key in Admin → SEO → AI Writer (aistudio.google.com)');
    const model = ai.model || 'gemini-1.5-flash';
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(ai.geminiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2600, temperature: 0.8 } }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Gemini: ${data.error?.message || resp.status}`);
    return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }
  if (provider === 'groq') {
    if (!ai.groqKey) throw new Error('Add your free Groq API key in Admin → SEO → AI Writer (console.groq.com)');
    const model = ai.model || 'llama-3.3-70b-versatile';
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.groqKey}` },
      body: JSON.stringify({ model, max_tokens: 2600, temperature: 0.8, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Groq: ${data.error?.message || resp.status}`);
    return data.choices?.[0]?.message?.content || '';
  }
  if (provider === 'openai') {
    if (!ai.openaiKey) throw new Error('Add your OpenAI API key in Admin → SEO → AI Writer');
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.openaiKey}` },
      body: JSON.stringify({ model: ai.model || 'gpt-4o-mini', max_tokens: 2600, temperature: 0.8, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`OpenAI: ${data.error?.message || resp.status}`);
    return data.choices?.[0]?.message?.content || '';
  }
  // anthropic
  if (!ai.anthropicKey) throw new Error('Add your Anthropic API key in Admin → SEO → AI Writer');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ai.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ai.model || 'claude-sonnet-4-6', max_tokens: 2600, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Anthropic: ${data.error?.message || resp.status}`);
  return (data.content || []).map(b => b.text || '').join('');
}

function saveImageBuffer(buf) {
  const filename = `blog-ai-${Date.now()}-${nanoid(6)}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  return `/uploads/${filename}`;
}

// Free, keyless (Pollinations). Retries with backoff — the free service rate-limits
// back-to-back requests, so the 2nd image often needs a short wait + retry.
async function generateImagePollinations(promptText, opts = {}) {
  // opts.aspect: 'square' (product cards) | 'wide' (blog covers). Default 'wide' for back-compat.
  // opts.styleSuffix: appended after the prompt (photography style hints).
  const isSquare = opts.aspect === 'square';
  const width  = isSquare ? 1024 : 1200;
  const height = isSquare ? 1024 : 675;
  const suffix = opts.styleSuffix || 'editorial photograph, premium cannabis lifestyle, warm cinematic lighting, minimal, high detail, no text, no watermark';
  const styled = `${promptText}, ${suffix}`;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    // model=flux is the newer, more photorealistic Pollinations model (better than the default).
    // enhance=true lets Pollinations rewrite the prompt for better output. seed randomizes retries.
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(styled)}?width=${width}&height=${height}&nologo=true&model=flux&enhance=true&referrer=districtcure&seed=${Math.floor(Math.random()*1e6)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (resp.status === 429 || resp.status >= 500) throw new Error(`busy (HTTP ${resp.status})`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const ct = resp.headers.get('content-type') || '';
      const buf = Buffer.from(await resp.arrayBuffer());
      if (!ct.startsWith('image/') || buf.length < 1000) throw new Error('no image returned');
      return saveImageBuffer(buf);
    } catch (e) {
      lastErr = e;
      if (attempt < 4) await new Promise(r => setTimeout(r, 4000 * attempt));  // 4s, 8s, 12s
    } finally { clearTimeout(timer); }
  }
  throw new Error(`the free image service is busy — wait a few seconds and try again (${lastErr?.message || 'failed'})`);
}

// Paid (OpenAI DALL·E). Higher quality but ~$0.04–0.08 per image.
// Note: don't send response_format (some models reject it); handle both b64 + url responses.
async function generateImageOpenAI(promptText, key, model) {
  const m = model || 'gpt-image-1';
  const isDalle = /^dall-e-3$/.test(m);
  // gpt-image-* / chatgpt-image use 1536x1024 landscape; legacy dall-e-3 uses 1792x1024
  const size = isDalle ? '1792x1024' : '1536x1024';
  // 'medium' keeps gpt-image cost down (~$0.04/img vs ~3x for high); dall-e-3 uses 'standard'
  const quality = isDalle ? 'standard' : 'medium';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, signal: ctrl.signal,
      body: JSON.stringify({ model: m, prompt: `${promptText}. Editorial, premium, warm cinematic lighting, no text, no watermark.`, n: 1, size, quality }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`OpenAI image: ${data.error?.message || resp.status}`);
    const item = (data.data && data.data[0]) || {};
    if (item.b64_json) return saveImageBuffer(Buffer.from(item.b64_json, 'base64'));
    if (item.url) {
      const img = await fetch(item.url);
      if (!img.ok) throw new Error('could not download the generated image');
      return saveImageBuffer(Buffer.from(await img.arrayBuffer()));
    }
    throw new Error('no image returned');
  } finally { clearTimeout(timer); }
}

// Dispatch by the admin-selected image source (free Pollinations by default).
// opts: { aspect: 'square'|'wide', styleSuffix: string } — flows into Pollinations only;
// OpenAI keeps its own landscape sizing for now (product-square is a future upgrade).
async function generateAiImage(promptText, opts = {}) {
  const ai = SETTINGS.get().ai || {};
  if (ai.imageProvider === 'openai') {
    if (!ai.openaiKey) throw new Error('Add your OpenAI API key in Admin → SEO → AI Writer to use DALL·E images (or switch image source to Free)');
    return generateImageOpenAI(promptText, ai.openaiKey, ai.imageModel);
  }
  return generateImagePollinations(promptText, opts);
}

function buildBlogPrompt({ topic, keywords, tone, category }) {
  const kw = Array.isArray(keywords) ? keywords.join(', ') : (keywords || '');
  return `You are the content writer for District Cure, an ABCA-licensed cannabis dispensary at 2626 Georgia Ave NW, Washington DC (open daily 9am-11pm, same-day delivery & pickup, adults 21+).
Write an original, accurate, SEO-friendly blog post.
Topic: ${topic}
${kw ? `Target keywords to work in naturally: ${kw}` : ''}
${tone ? `Tone: ${tone}` : 'Tone: warm, knowledgeable, welcoming to beginners.'}
${category ? `Category: ${category}` : ''}
Rules: be factual and compliant; do not make medical claims; about 400-600 words; use <h2>/<p>/<ul> HTML for the body (no <h1>, no markdown, no code fences, no script/style). Encourage shopping the menu or visiting where natural.
Respond with ONLY valid minified JSON on a single line, no code fences, no commentary, in this exact shape:
{"title":"...","excerpt":"one-sentence summary","body":"<p>...</p>","metaTitle":"under 60 chars","metaDescription":"under 155 chars","keywords":["..."],"tags":["..."],"imagePrompt":"a short vivid visual description for a cover image"}`;
}

// AI-assisted draft (free providers) + optional free AI cover image
app.post('/api/admin/posts/ai-draft', requireAdmin, async (req, res) => {
  const { topic, keywords, tone, category } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'Provide a topic' });
  const prompt = buildBlogPrompt({ topic, keywords, tone, category });
  let draft = null, genErr;
  // Up to 2 generation attempts — free models sometimes return malformed/truncated JSON
  for (let attempt = 1; attempt <= 2 && !draft; attempt++) {
    try {
      let text = (await aiGenerateText(prompt)).trim();
      text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const a = text.indexOf('{'), b = text.lastIndexOf('}');
      if (a >= 0 && b > a) text = text.slice(a, b + 1);
      const parsed = JSON.parse(text);
      if (parsed && (parsed.title || parsed.body)) draft = parsed;
    } catch (e) { genErr = e; }
  }
  if (!draft) return res.status(502).json({ error: genErr?.message || 'The AI returned an unexpected format — please try again.' });
  // Optional free AI cover image
  if ((SETTINGS.get().ai || {}).autoImage !== false) {
    try { draft.coverImage = await generateAiImage(draft.imagePrompt || draft.title || topic); }
    catch (e) { draft.imageError = e.message; }
  }
  res.json({ success: true, draft });
});

// Generate just a free AI cover image (from a prompt or a post's title)
app.post('/api/admin/posts/ai-image', requireAdmin, async (req, res) => {
  const prompt = (req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Provide a prompt (or a post title)' });
  try { res.json({ success: true, url: await generateAiImage(prompt) }); }
  catch (e) { res.status(502).json({ error: 'Image generation failed: ' + e.message }); }
});

// Build a rich, subject-first product photography prompt from name/category/description.
// Key insight: the model needs the SUBJECT first (what to draw) with strong keywords,
// then STYLE last (how to draw it). Category chooses the subject template + hero prop.
// Weight/strain hints get pulled from the name if present ("3.5g", "1g Cart", "Sativa").
function buildProductPrompt({ name = '', category = '', description = '', strain = '', weight = '', brand = '' }) {
  const n = String(name || '').trim();
  const cat = String(category || '').toLowerCase();
  const w = String(weight || '').trim() || (n.match(/\b(\d+(?:\.\d+)?\s*(?:g|oz|mg|ml|pk|pack))\b/i) || [])[1] || '';
  const st = String(strain || '').toLowerCase();

  // SUBJECT — what's actually in the shot. Very specific per category.
  let subject;
  if (cat.includes('pre-roll') || /prl|pre[- ]?roll/i.test(n)) {
    const pk = /2\s*pk|2pk/i.test(n) ? 'two hand-rolled cannabis pre-rolls' : /5\s*pk|6\s*pk|multi.?pack/i.test(n) ? 'a small bundle of hand-rolled cannabis pre-rolls' : 'a single hand-rolled cannabis pre-roll';
    subject = `${pk}, tightly rolled in clean white paper, tapered tip, arranged on a matte dark surface`;
  } else if (cat.includes('vape') || /cartridge|\bcart\b|disposable|\bdisp\b|dompen/i.test(n)) {
    subject = /disposable|\bdisp\b/i.test(n)
      ? 'a sleek matte-black cannabis disposable vape pen, cylindrical, mouthpiece at top, glossy amber oil visible through a small window'
      : 'a premium cannabis vape cartridge, glass reservoir filled with clear amber oil, ceramic mouthpiece, sitting upright on a dark surface';
  } else if (cat.includes('concentrate') || /shatter|crumble|badder|sugar|rosin|sauce|liquid diamond/i.test(n)) {
    subject = /shatter/i.test(n)  ? 'a thin translucent slab of golden cannabis shatter on parchment, glossy and glass-like'
            : /crumble/i.test(n)  ? 'crumbly golden cannabis wax in a small round glass jar with lid off, chunky texture'
            : /badder|sugar/i.test(n) ? 'creamy amber cannabis budder in a small glass jar with lid off, silky texture, tool nearby'
            : /rosin|liquid diamond|sauce/i.test(n) ? 'glossy amber cannabis rosin in a small glass jar, viscous, honey-like, tool nearby'
            :                       'golden cannabis concentrate in a small glass jar, tool nearby, macro shot';
  } else if (cat.includes('edible') || /gummy|gummies|lozenge|troche|chocolate|capsule|mint/i.test(n)) {
    subject = /chocolate/i.test(n)      ? 'artisan dark chocolate cannabis bar broken into squares on a dark ceramic plate, glossy sheen'
            : /gummy|gummies|mint/i.test(n) ? 'a small pile of translucent cannabis gummies with a light dusting of sugar on a dark ceramic plate'
            : /lozenge|troche/i.test(n) ? 'a small pile of round cannabis lozenges on a dark ceramic plate, glossy candy finish'
            : /capsule|pill/i.test(n)   ? 'a small pile of clear cannabis softgel capsules next to a small amber glass bottle on a dark linen surface'
            : /bath salt/i.test(n)      ? 'a small open glass jar of fragrant bath salt crystals on a dark stone surface, botanicals nearby'
            :                             'an artisan cannabis edible on a dark ceramic plate, styled food photograph';
  } else if (cat.includes('tincture') || /tincture/i.test(n)) {
    subject = 'a small amber glass tincture bottle with a black dropper on a dark linen surface, apothecary aesthetic, botanicals nearby';
  } else if (cat.includes('topical') || /salve|balm|lotion|\bgel\b/i.test(n)) {
    subject = 'a small round glass jar of cannabis salve with lid off, natural balm visible, on a dark stone surface, spa aesthetic, botanicals nearby';
  } else if (cat.includes('accessor')) {
    subject = /grinder/i.test(n) ? 'a premium metal cannabis grinder on a dark surface, angled view, subtle rim lighting'
            : /paper/i.test(n)   ? 'a stack of cannabis rolling papers on a dark surface, product photograph'
            : /battery|pen/i.test(n) ? 'a sleek matte-black vape battery pen on a dark surface, product photograph, subtle rim lighting'
            :                       'a premium cannabis accessory on a dark surface, product photograph';
  } else {
    // Default: assume flower — largest category.
    subject = w
      ? `a ${w} jar of dense frosty cannabis buds with a scattering of ground bud on a dark slate surface, macro shot, trichomes visible, sticky-looking resin`
      : 'a cluster of dense frosty cannabis buds covered in visible trichomes on a dark slate surface, macro shot, sticky-looking resin';
  }

  // Strain color hint (indica = purple/dark, sativa = green/light, hybrid = balanced).
  let colorHint = '';
  if (st === 'indica' || /indica|kush|og|purple|grape|berry|cake/i.test(n))       colorHint = 'deep purple and dark green tones, warm shadows';
  else if (st === 'sativa' || /sativa|haze|lemon|lime|orange|citrus|diesel|jack/i.test(n)) colorHint = 'bright green and citrus-orange tones, crisp light';
  else                                                                                     colorHint = 'balanced green tones';

  // Description snippet (first 140 chars, dropped if template) helps the model pick up flavors/aromas.
  const desc = String(description || '').trim().replace(/\s+/g, ' ').slice(0, 140);
  const descPart = desc && desc.length > 20 && !/lorem|placeholder|tbd/i.test(desc) ? ` ${desc}.` : '';

  const brandPart = brand ? ` (${brand} brand quality).` : '';

  // Full prompt: SUBJECT + color + description + brand + PHOTOGRAPHY STYLE last.
  return `${subject}, ${colorHint}.${descPart}${brandPart} Product photography, natural volumetric lighting, shallow depth of field, ultra sharp focus on subject, 8k, professional dispensary catalog shot, clean composition, no text, no watermark, no logos, no people.`;
}

// Prompt preview — returns the prompt that WOULD be sent, without actually generating.
// Lets the admin see + tweak the prompt in the modal before spending a generation call.
app.post('/api/admin/products/build-prompt', requireAdmin, (req, res) => {
  const p = req.body || {};
  if (!p.name && !p.prompt) return res.status(400).json({ error: 'Provide at least a product name' });
  res.json({ success: true, prompt: buildProductPrompt(p) });
});

// Generate an AI product image. If `prompt` is provided use it verbatim; otherwise
// build one from name/category/description/strain/weight/brand via buildProductPrompt().
app.post('/api/admin/products/ai-image', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const finalPrompt = String(body.prompt || '').trim() || buildProductPrompt(body);
  if (!finalPrompt) return res.status(400).json({ error: 'Provide a product name (or explicit prompt)' });
  const styleSuffix = 'commercial cannabis product photography, dark moody background, catalog quality, high resolution, sharp focus, natural lighting, no text, no watermark';
  try {
    const url = await generateAiImage(finalPrompt, { aspect: 'square', styleSuffix });
    res.json({ success: true, url, prompt: finalPrompt });
  } catch (e) { res.status(502).json({ error: 'Image generation failed: ' + e.message }); }
});

// ─── Staff ──────────────────────────────────────────────────────
app.get('/api/admin/staff', requireAdmin, (_, res) => res.json({ success:true, staff: STAFF.all() }));

app.post('/api/admin/staff', requireAdmin, async (req, res) => {
  const s = req.body || {};
  if (!s.name) return res.status(400).json({ error:'Name required' });
  const member = {
    id: `stf_${nanoid(8)}`,
    name: s.name, role: s.role || 'budtender', email: s.email || '',
    phone: s.phone || '', status: 'active', lastLogin: null,
    createdAt: new Date().toISOString(),
  };
  await STAFF.upsert(member);
  res.status(201).json({ success:true, staff: member });
});

app.patch('/api/admin/staff/:id', requireAdmin, async (req, res) => {
  const m = STAFF.get(req.params.id);
  if (!m) return res.status(404).json({ error:'Staff not found' });
  await STAFF.upsert({ ...m, ...req.body, id: m.id });
  res.json({ success:true, staff: STAFF.get(m.id) });
});

app.delete('/api/admin/staff/:id', requireAdmin, async (req, res) => {
  await STAFF.remove(req.params.id);
  res.json({ success:true });
});

// ─── Login accounts / Users (owner-only) ────────────────────────
const pubUser = (u) => ({ id:u.id, name:u.name, username:u.username, role:u.role, createdAt:u.createdAt });

app.get('/api/admin/users', requireOwner, (_, res) => {
  res.json({ success:true, users: USERS.all().map(pubUser) });
});

app.post('/api/admin/users', requireOwner, async (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error:'Username and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error:'Password must be at least 6 characters' });
  const uname = String(username).trim().toLowerCase();
  if (USERS.all().some(u => u.username.toLowerCase() === uname)) return res.status(400).json({ error:'That username is already taken' });
  const user = {
    id: `usr_${nanoid(8)}`,
    name: name || username,
    username: uname,
    passwordHash: await auth.hash(String(password)),
    role: role === 'owner' ? 'owner' : 'editor',
    createdAt: new Date().toISOString(),
  };
  await USERS.upsert(user);
  res.status(201).json({ success:true, user: pubUser(user) });
});

app.patch('/api/admin/users/:id', requireOwner, async (req, res) => {
  const u = USERS.get(req.params.id);
  if (!u) return res.status(404).json({ error:'User not found' });
  const { name, role, password } = req.body || {};
  const patch = { ...u };
  if (name) patch.name = name;
  if (role) {
    // Don't allow removing the last owner
    if (u.role === 'owner' && role !== 'owner' && USERS.all().filter(x => x.role === 'owner').length <= 1)
      return res.status(400).json({ error:'You can’t change the role of the only owner' });
    patch.role = role === 'owner' ? 'owner' : 'editor';
  }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error:'Password must be at least 6 characters' });
    patch.passwordHash = await auth.hash(String(password));
  }
  await USERS.upsert(patch);
  res.json({ success:true, user: pubUser(patch) });
});

app.delete('/api/admin/users/:id', requireOwner, async (req, res) => {
  const u = USERS.get(req.params.id);
  if (!u) return res.status(404).json({ error:'User not found' });
  if (req.user && req.user.id === u.id) return res.status(400).json({ error:'You can’t delete your own account while logged in' });
  if (u.role === 'owner' && USERS.all().filter(x => x.role === 'owner').length <= 1)
    return res.status(400).json({ error:'Can’t delete the only owner account' });
  await USERS.remove(u.id);
  res.json({ success:true });
});

// ─── Settings ───────────────────────────────────────────────────
app.get('/api/admin/settings', requireAdmin, (_, res) => res.json({ success:true, settings: SETTINGS.get() }));

app.patch('/api/admin/settings', requireAdmin, async (req, res) => {
  const body = { ...(req.body || {}) };
  const cur = SETTINGS.get();
  // Deep-merge nested objects so saving one form doesn't wipe fields set by another
  for (const key of ['google', 'geo', 'social', 'featureFlags', 'seo', 'ai']) {
    if (body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) {
      body[key] = { ...(cur[key] || {}), ...body[key] };
    }
  }
  const updated = await SETTINGS.patch(body);
  res.json({ success:true, settings: updated });
});

// ─── Google Places sync (pull live rating + reviews) ────────────
async function syncGoogleReviews() {
  const s = SETTINGS.get();
  const g = s.google || {};
  if (!g.apiKey || !g.placeId) throw new Error('Add your Google API key and Place ID first');
  const fields = 'rating,user_ratings_total,reviews,url,name';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(g.placeId)}&fields=${fields}&reviews_sort=newest&key=${encodeURIComponent(g.apiKey)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.status !== 'OK') throw new Error(`Google API: ${data.status}${data.error_message ? ' — ' + data.error_message : ''}`);
  const r = data.result || {};

  // Update aggregate rating + count (+ profile URL if we don't have one yet)
  await SETTINGS.patch({ google: { ...g,
    rating: r.rating || g.rating || 0,
    reviewCount: r.user_ratings_total || g.reviewCount || 0,
    profileUrl: g.profileUrl || r.url || '',
    lastSync: new Date().toISOString(),
  }});

  // Replace previously-synced Google reviews with the fresh batch (leave manual ones alone)
  for (const old of REVIEWS.all().filter(x => x.source === 'google-api')) await REVIEWS.remove(old.id);
  const fetched = Array.isArray(r.reviews) ? r.reviews : [];
  for (const rv of fetched) {
    await REVIEWS.upsert({
      id: `grev_${nanoid(8)}`,
      author: rv.author_name || 'Google user',
      rating: Math.min(5, Math.max(1, Number(rv.rating) || 5)),
      text: rv.text || '',
      date: rv.time ? new Date(rv.time * 1000).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
      source: 'google-api',
      featured: false,
      status: rv.text ? 'published' : 'hidden',
      createdAt: new Date().toISOString(),
    });
  }
  return { rating: r.rating || 0, reviewCount: r.user_ratings_total || 0, imported: fetched.length };
}

app.post('/api/admin/google/sync', requireAdmin, async (_, res) => {
  try {
    const result = await syncGoogleReviews();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Auto-refresh Google reviews every 6 hours if credentials are configured
setInterval(() => { syncGoogleReviews().catch(() => {}); }, 6 * 60 * 60 * 1000);

// ─── Socket.io (admin live updates) ─────────────────────────────
io.on('connection', socket => {
  socket.on('join_admin', () => socket.join('admin-room'));
  socket.on('driver_location', data => io.to('admin-room').emit('driver_location', data));
});

// ─── Brand logo (stable URL) + dynamic web manifest ─────────────
// /brand-logo redirects to the canonical 512px PWA icon so social scrapers and OS icon pickers
// always get a square PNG (not the historic 1408x768 rectangle, which iOS/Android stretched).
app.get('/brand-logo', (_, res) => res.redirect(302, '/icons/icon-512.png'));
app.get('/manifest.webmanifest', (_, res) => {
  res.type('application/manifest+json').send(JSON.stringify({
    name: 'District Cure Dispensary',
    short_name: 'District Cure',
    description: 'Premium cannabis dispensary in Washington DC — order delivery & pickup, daily specials, and rewards.',
    start_url: '/?pwa=1', scope: '/', display: 'standalone', orientation: 'portrait-primary',
    background_color: '#07090F', theme_color: '#080C07',
    categories: ['shopping', 'health', 'lifestyle'], lang: 'en-US',
    icons: [
      { src: '/icons/icon-192.png',          type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/icons/icon-512.png',          type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  }, null, 2));
});

// ─── SEO: robots.txt + sitemap.xml ──────────────────────────────
const SITE_URL = process.env.SITE_URL || 'https://districtcuredispensary.com';
app.get('/robots.txt', (_, res) => {
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${SITE_URL}/sitemap.xml
`);
});
app.get('/sitemap.xml', (_, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const staticUrls = [
    ['/', '1.0', 'daily'], ['/blog', '0.9', 'daily'], ['/patient-resources', '0.8', 'weekly'],
    ['/about', '0.6', 'monthly'], ['/contact', '0.6', 'monthly'], ['/faq', '0.7', 'monthly'],
  ].map(([u, p, f]) => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`);
  const postUrls = POSTS.all().filter(p => p.status === 'published').map(p =>
    `  <url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${(p.updatedAt || p.publishedAt || today).slice(0,10)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
  res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...postUrls].join('\n')}
</urlset>
`);
});

// ─── Content pages (clean URLs) ─────────────────────────────────
const PAGES = ['patient-resources', 'about', 'contact', 'privacy', 'terms', 'faq'];
for (const page of PAGES) {
  app.get(`/${page}`, (_, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(ROOT, 'storefront', 'pages', `${page}.html`));
  });
}

// ─── Blog (server-rendered for SEO) ─────────────────────────────
app.get('/blog', (req, res) => {
  const all = POSTS.all().filter(p => p.status === 'published')
    .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
  const cats = [...new Set(all.map(p => p.category).filter(Boolean))];
  const active = req.query.category;
  const list = active && active !== 'All' ? all.filter(p => p.category === active) : all;
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.send(blogviews.renderBlogList(list, cats, SETTINGS.get(), active));
});
app.get('/blog/:slug', (req, res) => {
  const post = POSTS.all().find(p => p.slug === req.params.slug && p.status === 'published');
  if (!post) { res.status(404); return res.redirect('/blog'); }
  const related = POSTS.all()
    .filter(p => p.status === 'published' && p.id !== post.id && p.category === post.category)
    .slice(0, 3);
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.send(blogviews.renderBlogPost(post, SETTINGS.get(), related));
});

// ─── SPA fallbacks ──────────────────────────────────────────────
app.get('/admin', (_, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));
app.get('/admin/*', (_, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));

// Homepage with runtime SEO injection (search-console verification meta from Admin → SEO)
let _homeCache = { mtime: 0, html: '' };
function homeBaseHtml() {
  const f = path.join(ROOT, 'storefront', 'index.html');
  const m = fs.statSync(f).mtimeMs;
  if (m !== _homeCache.mtime) _homeCache = { mtime: m, html: fs.readFileSync(f, 'utf8') };
  return _homeCache.html;
}
const sanitizeToken = (t) => String(t || '').replace(/[^A-Za-z0-9._\-]/g, '').slice(0, 200);
app.get('*', (_, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  let html = homeBaseHtml();
  const s = SETTINGS.get();
  const seo = s.seo || {};
  // Point share-image + apple icon at the DIRECT logo file (social scrapers don't follow the /brand-logo redirect)
  const logo = (s.brandLogo || '').trim();
  if (logo) html = html.split('/brand-logo').join(logo);
  const metas = [];
  if (seo.gscVerification)  metas.push(`<meta name="google-site-verification" content="${sanitizeToken(seo.gscVerification)}">`);
  if (seo.bingVerification) metas.push(`<meta name="msvalidate.01" content="${sanitizeToken(seo.bingVerification)}">`);
  if (metas.length) html = html.replace('</head>', metas.join('\n') + '\n</head>');
  res.type('html').send(html);
});

// ─── Global error handler ───────────────────────────────────────
// Bots probe for /etc/passwd, .env, etc. using malformed encoded paths (%c0%af etc.),
// which throw URIError from express's route matcher. Without this handler the error
// propagates and PM2 restarts the process — 39 restarts in one attack window before we
// added this. Now we return 400 quietly and stay running. Any other unexpected error
// still logs and returns 500 so real bugs surface.
app.use((err, req, res, next) => {
  if (err instanceof URIError) return res.status(400).type('text/plain').send('Bad Request');
  console.error('[unhandled]', req.method, req.url, '-', err.message);
  res.status(500).type('text/plain').send('Internal Server Error');
});

// ─── Start (connect to PostgreSQL first, then serve) ────────────
const PORT = parseInt(process.env.PORT || '3000');
(async () => {
  try {
    await initStore();        // connect, ensure schema, hydrate cache, migrate JSON on first boot
    await bootstrapAdmin();
  } catch (e) {
    console.error('\n❌  FATAL: could not initialize PostgreSQL store —', e.message);
    console.error('    The app will not start until the database is reachable.\n');
    process.exit(1);          // PM2 will restart and retry
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅  District Cure Platform (PostgreSQL)`);
    console.log(`   Store  → http://localhost:${PORT}`);
    console.log(`   Admin  → http://localhost:${PORT}/admin`);
    console.log(`   API    → http://localhost:${PORT}/api/health`);
    console.log(`   DB     → ${process.env.PGDATABASE || 'districtcure'} @ ${process.env.PGHOST || '127.0.0.1'}`);
  });
})();

module.exports = { app, server, io };
