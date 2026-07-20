/**
 * Seed catalog — real product list from District Cure's actual menu,
 * enriched with public product imagery, descriptions, THC %, strain notes.
 *
 * Images are hot-linked from Unsplash (license: free commercial use, no attribution required).
 * Replace any image via the admin panel → Inventory → Edit.
 */
'use strict';

const IMG = {
  flowerJar:    'https://images.unsplash.com/photo-1603909223429-69bb7101f420?w=800&q=80&auto=format&fit=crop',
  flowerBuds:   'https://images.unsplash.com/photo-1536593787210-f8f7c5d1c8df?w=800&q=80&auto=format&fit=crop',
  flowerCloseup:'https://images.unsplash.com/photo-1620219365994-f0a47ec0cf76?w=800&q=80&auto=format&fit=crop',
  flowerDark:   'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?w=800&q=80&auto=format&fit=crop',
  flowerNug:    'https://images.unsplash.com/photo-1605196560547-b2f7281b8355?w=800&q=80&auto=format&fit=crop',
  flowerPurple: 'https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?w=800&q=80&auto=format&fit=crop',
  preroll:      'https://images.unsplash.com/photo-1597266815938-08b4c46a4d20?w=800&q=80&auto=format&fit=crop',
  prerollPack:  'https://images.unsplash.com/photo-1599577180589-0a55e6946d6b?w=800&q=80&auto=format&fit=crop',
  vapeCart:     'https://images.unsplash.com/photo-1605118541899-2a1c9d3c0a90?w=800&q=80&auto=format&fit=crop',
  vapePen:      'https://images.unsplash.com/photo-1567593810070-7a3d471af022?w=800&q=80&auto=format&fit=crop',
  battery:      'https://images.unsplash.com/photo-1593376853899-fbb47a057fa0?w=800&q=80&auto=format&fit=crop',
  gummies:      'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=800&q=80&auto=format&fit=crop',
  capsules:     'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80&auto=format&fit=crop',
  concentrate:  'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&q=80&auto=format&fit=crop',
};

const PRODUCTS = [
  // ── FLOWER ──────────────────────────────────────────
  { id:'f1', name:'91 Octane', brand:'Coner Store', category:'Flower', strain:'hybrid', emoji:'🌿',
    price:40, compareAt:null, thc:'THC 24.8%', cbd:'CBD <1%', weight:'1/8 oz', badge:'hot', available:true, quantity:12,
    image:IMG.flowerJar,
    description:'A fuel-forward hybrid with dense, frost-coated buds. Diesel, pine, and a hint of citrus on the nose. Balanced body relaxation with a clear-headed lift — great for evening creative work or unwinding without couch-lock.' },
  { id:'f2', name:'Banana Acai Mints', brand:'Coner Store', category:'Flower', strain:'hybrid', emoji:'🌿',
    price:40, compareAt:null, thc:'THC 26.1%', cbd:'CBD <1%', weight:'1/8 oz', badge:'', available:true, quantity:8,
    image:IMG.flowerBuds,
    description:'Sweet tropical banana on the inhale, cool mint and tart acai on the exhale. A modern cross with a smooth euphoric uplift, then a calm-bodied wind-down. Pairs well with sunset porch sessions.' },
  { id:'f3', name:'Black Amber', brand:'District Cannabis', category:'Flower', strain:'hybrid', emoji:'🌿',
    price:40, compareAt:null, thc:'THC 25.4%', cbd:'CBD <1%', weight:'1/8 oz', badge:'', available:true, quantity:6,
    image:IMG.flowerDark,
    description:'Deep amber trichomes blanket near-black calyxes. Earthy, peppery, with a sweet kushy finish. A heavy hybrid that leans indica — couch-friendly, appetite-rousing, sleep-supportive.' },
  { id:'f4', name:'Cheetah Piss', brand:'District Cannabis', category:'Flower', strain:'hybrid', emoji:'🌿',
    price:40, compareAt:null, thc:'THC 27.2%', cbd:'CBD <1%', weight:'1/8 oz', badge:'new', available:true, quantity:10,
    image:IMG.flowerCloseup,
    description:'A Cookies-family heavyweight: sharp citrus and ammonia funk on the nose, gassy sweetness on the exhale. Fast onset, giggly cerebral energy that fades into a soft body buzz.' },
  { id:'f5', name:'Blue Dream', brand:'Coner Store', category:'Flower', strain:'sativa', emoji:'🌿',
    price:32.50, compareAt:40, thc:'THC 22.5%', cbd:'CBD <1%', weight:'1/8 oz', badge:'sale', available:true, quantity:14,
    image:IMG.flowerPurple,
    description:'The classic west-coast sativa-dominant hybrid. Sweet blueberry aroma, gentle full-body relaxation paired with a clear, motivated head-high. Daytime-friendly. Newcomer favorite.' },
  { id:'f6', name:'Gelato Cake', brand:'District Cannabis', category:'Flower', strain:'indica', emoji:'🌿',
    price:40, compareAt:null, thc:'THC 28.7%', cbd:'CBD <1%', weight:'1/8 oz', badge:'hot', available:true, quantity:5,
    image:IMG.flowerNug,
    description:'Dessert-grade indica. Vanilla, cake batter, and a hint of berry. Heavy onset, deep physical calm, and the kind of munchies that send you to the kitchen. Reserved for after-dinner.' },
  { id:'f7', name:'Wedding Crasher', brand:'District Cannabis', category:'Flower', strain:'sativa', emoji:'🌿',
    price:38, compareAt:null, thc:'THC 23.9%', cbd:'CBD <1%', weight:'1/8 oz', badge:'', available:true, quantity:9,
    image:IMG.flowerBuds,
    description:'Wedding Cake × Purple Punch. Grape candy and vanilla on the nose. Uplifting head, soothed body — social, talkative, but never racing.' },
  { id:'f8', name:'Northern Lights', brand:'Coner Store', category:'Flower', strain:'indica', emoji:'🌿',
    price:35, compareAt:null, thc:'THC 21.8%', cbd:'CBD <1%', weight:'1/8 oz', badge:'', available:true, quantity:11,
    image:IMG.flowerDark,
    description:'A landrace legend. Pine, earthy musk, sweet kush finish. Profoundly relaxing — recommended for sleep, pain, or just turning the volume down on the day.' },

  // ── PRE-ROLLS ───────────────────────────────────────
  { id:'p1', name:'Pre-Roll Pride — Gelato Cake', brand:'District Cannabis', category:'Pre-Roll', strain:'indica', emoji:'🚬',
    price:16.95, compareAt:null, thc:'THC 28.7%', cbd:'CBD <1%', weight:'1g', badge:'', available:true, quantity:20,
    image:IMG.preroll,
    description:'Single 1g pre-roll of our top-shelf Gelato Cake flower. Hand-rolled in unbleached hemp paper, glass tip. Smooth burn, full terpene retention.' },
  { id:'p2', name:'Pre-Roll Pride — Pave', brand:'District Cannabis', category:'Pre-Roll', strain:'hybrid', emoji:'🚬',
    price:16.95, compareAt:null, thc:'THC 25.6%', cbd:'CBD <1%', weight:'1g', badge:'', available:true, quantity:18,
    image:IMG.preroll,
    description:'1g hand-rolled hybrid pre-roll. Balanced, social, daytime-friendly. Glass tip, unbleached paper.' },
  { id:'p3', name:'5-Pack Mini Pride', brand:'District Cannabis', category:'Pre-Roll', strain:'hybrid', emoji:'🚬',
    price:55, compareAt:null, thc:'THC 24%', cbd:'CBD <1%', weight:'5 × 0.5g', badge:'new', available:true, quantity:14,
    image:IMG.prerollPack,
    description:'Five 0.5g hybrid pre-rolls in a flip-top tin. Perfect for sharing, social use, or stretching the week. Same top-shelf flower, smaller portion.' },

  // ── VAPORIZERS ──────────────────────────────────────
  { id:'v1', name:'District Flowers Cart — Super Silver Haze', brand:'District Flowers', category:'Vaporizers', strain:'sativa', emoji:'💨',
    price:50, compareAt:null, thc:'THC 88.3%', cbd:'CBD <1%', weight:'1g', badge:'', available:true, quantity:8,
    image:IMG.vapeCart,
    description:'1g distillate cart, strain-specific terpenes. Bright citrus, herbal pine, energizing sativa profile. 510-thread compatible, ceramic core, no cuts.' },
  { id:'v2', name:'District Flowers Cart — Girl Scout Cookies', brand:'District Flowers', category:'Vaporizers', strain:'hybrid', emoji:'💨',
    price:50, compareAt:null, thc:'THC 88.1%', cbd:'CBD <1%', weight:'1g', badge:'', available:true, quantity:7,
    image:IMG.vapeCart,
    description:'1g GSC distillate cart. Sweet, earthy, cookie-dough finish. Balanced hybrid effect — euphoric head, relaxed body. 510-thread.' },
  { id:'v3', name:'District Flowers Cart — Northern Lights', brand:'District Flowers', category:'Vaporizers', strain:'indica', emoji:'💨',
    price:50, compareAt:null, thc:'THC 89.0%', cbd:'CBD <1%', weight:'1g', badge:'hot', available:true, quantity:9,
    image:IMG.vapeCart,
    description:'Top-selling indica cart. Pine, earth, sweet kush. Deep relaxation, sleep-supportive. 510-thread, ceramic core.' },
  { id:'v4', name:'District Flowers Cart — Grand Daddy Purp', brand:'District Flowers', category:'Vaporizers', strain:'indica', emoji:'💨',
    price:50, compareAt:null, thc:'THC 87.5%', cbd:'CBD <1%', weight:'1g', badge:'', available:true, quantity:6,
    image:IMG.vapeCart,
    description:'Grape and berry on the inhale, sweet violet finish. Heavy indica — for evening, pain, or unwind. 510-thread.' },
  { id:'v5', name:'District Flowers Cart — Tropicana Cherry', brand:'District Flowers', category:'Vaporizers', strain:'sativa', emoji:'💨',
    price:50, compareAt:null, thc:'THC 88.7%', cbd:'CBD <1%', weight:'1g', badge:'new', available:true, quantity:11,
    image:IMG.vapeCart,
    description:'Tropical cherry sweetness up front, citrus on the back. Energizing sativa — focus, creativity, daytime. 510-thread.' },
  { id:'v6', name:'District Flowers Cart — Do Si Dos', brand:'District Flowers', category:'Vaporizers', strain:'indica', emoji:'💨',
    price:50, compareAt:null, thc:'THC 87.9%', cbd:'CBD <1%', weight:'1g', badge:'', available:true, quantity:5,
    image:IMG.vapeCart,
    description:'OG Kush × Face Off OG. Sweet, minty, earthy. Profound body relaxation, mental calm. 510-thread.' },
  { id:'v7', name:'510 Variable Voltage Battery', brand:'District Flowers', category:'Vaporizers', strain:'', emoji:'🔋',
    price:15, compareAt:null, thc:'', cbd:'', weight:'350mAh', badge:'', available:true, quantity:30,
    image:IMG.battery,
    description:'Variable-voltage 510 battery. Three heat settings (2.8V / 3.4V / 4.0V). Pre-heat function. USB-C charging. Compatible with all 510-thread carts.' },
  { id:'v8', name:'Yocan Kodo Box Mod', brand:'Yocan', category:'Vaporizers', strain:'', emoji:'🔋',
    price:25, compareAt:null, thc:'', cbd:'', weight:'400mAh', badge:'', available:true, quantity:15,
    image:IMG.vapePen,
    description:'Discreet, palm-sized box mod for 510-thread carts. Magnetic cart adapter, adjustable voltage, USB-C charging. Pocket-friendly.' },

  // ── EDIBLES ─────────────────────────────────────────
  { id:'e1', name:'1:1 CBD:THC Capsules', brand:'District Cure', category:'Edible', strain:'cbd', emoji:'💊',
    price:45.95, compareAt:null, thc:'10mg THC', cbd:'10mg CBD', weight:'20 capsules', badge:'new', available:true, quantity:22,
    image:IMG.capsules,
    description:'Balanced 1:1 CBD:THC capsules. 10mg of each per capsule. Slow-release, ~6-hour duration. Designed for daily wellness, pain management, and sleep support without intense psychoactivity.' },
  { id:'e2', name:'Chewable Trace Gummies', brand:'Trace', category:'Edible', strain:'hybrid', emoji:'🍬',
    price:22.50, compareAt:null, thc:'10mg THC', cbd:'', weight:'10 gummies', badge:'', available:true, quantity:28,
    image:IMG.gummies,
    description:'10mg THC per gummy, 10-count pack. Mixed berry. Onset 45–90 min, duration ~4 hours. Vegan, gluten-free, made in DC.' },
  { id:'e3', name:'Sleep Gummies — Indica Berry', brand:'District Cure', category:'Edible', strain:'indica', emoji:'🍬',
    price:28, compareAt:null, thc:'10mg THC + 3mg CBN', cbd:'', weight:'10 gummies', badge:'hot', available:true, quantity:18,
    image:IMG.gummies,
    description:'Indica-leaning sleep formula: 10mg THC + 3mg CBN per gummy. Designed for sleep onset and full-night rest. Take one 60 min before bed.' },
  { id:'e4', name:'Microdose Mints — 2.5mg', brand:'Trace', category:'Edible', strain:'hybrid', emoji:'🍬',
    price:18, compareAt:null, thc:'2.5mg THC', cbd:'', weight:'20 mints', badge:'new', available:true, quantity:24,
    image:IMG.gummies,
    description:'Sugar-free peppermint microdose mints. 2.5mg per mint, 20-count tin. Fast onset, low-intensity. Great for social use, creative work, or first-time edibles.' },

  // ── CONCENTRATES ────────────────────────────────────
  { id:'c1', name:'Live Resin Badder — Gelato Cake', brand:'District Cannabis', category:'Concentrate', strain:'indica', emoji:'💎',
    price:60, compareAt:null, thc:'THC 78.4%', cbd:'CBD <1%', weight:'1g', badge:'', available:true, quantity:7,
    image:IMG.concentrate,
    description:'Single-source live resin badder. Whipped, terpene-rich, full-spectrum. Vanilla cake aroma with deep indica effect. Best dabbed at low temp (450–550°F).' },
  { id:'c2', name:'Live Resin Sauce — Tropicana Cherry', brand:'District Cannabis', category:'Concentrate', strain:'sativa', emoji:'💎',
    price:60, compareAt:null, thc:'THC 76.1%', cbd:'CBD <1%', weight:'1g', badge:'new', available:true, quantity:5,
    image:IMG.concentrate,
    description:'High-terpene live resin sauce. Crystalline THCa diamonds in a tropical-fruit terp sauce. Energizing sativa, intense flavor. Low-temp dabs only.' },
];

const SETTINGS_DEFAULT = {
  storeName: 'District Cure Dispensary',
  phone:     '(202) 481-0732',
  email:     'districtcuredc@gmail.com',
  brandLogo: '',   // uploaded company logo (set in Admin → Settings); powers nav, app icon, favicon, share image
  address: { street1: '2626 Georgia Ave NW', city: 'Washington', state: 'DC', zip: '20001' },
  hours: [
    { day:'Monday',    openTime:'09:00', closeTime:'23:00', active:true },
    { day:'Tuesday',   openTime:'09:00', closeTime:'23:00', active:true },
    { day:'Wednesday', openTime:'09:00', closeTime:'23:00', active:true },
    { day:'Thursday',  openTime:'09:00', closeTime:'23:00', active:true },
    { day:'Friday',    openTime:'09:00', closeTime:'23:00', active:true },
    { day:'Saturday',  openTime:'09:00', closeTime:'23:00', active:true },
    { day:'Sunday',    openTime:'09:00', closeTime:'23:00', active:true },
  ],
  featureFlags:    { delivery: true, pickup: true },
  localMenuEnabled: false,  // false = storefront shows ONLY the embedded Dutchie menu. Flip on once the in-house catalog matches Dutchie.
  taxRate:         0.18,
  deliveryFee:     5,
  freeDeliveryMin: 75,
  loyaltyPerDollar: 10,
  dutchieSlug:     'district-smoke-shop',
  dutchieUrl:      'https://dutchie.com/dispensary/district-smoke-shop',
  geo:             { lat: 38.9243, lng: -77.0220 },  // approx 2626 Georgia Ave NW — verify in Settings
  google: {
    rating:      0,    // overall star rating shown on site (e.g. 4.8) — set in admin or synced
    reviewCount: 0,    // total number of Google reviews
    profileUrl:  '',   // link to your Google Business / Maps listing
    reviewUrl:   '',   // "write a review" link
    apiKey:      '',   // Google Places API key (server-side only — never sent to browser)
    placeId:     '',   // Google Place ID for District Cure
    lastSync:    '',   // ISO timestamp of last successful Google sync
  },
  social: {
    instagram: 'https://www.instagram.com/districtcure',
    facebook:  '',
    yelp:      '',
    google:    '',
  },
  // SEO control panel (editable by the marketing/SEO team in Admin → SEO)
  seo: {
    titleTemplate:      '%s · District Cure Dispensary',
    defaultTitle:       'District Cure — Premium Cannabis Dispensary in Washington DC',
    defaultDescription: 'District Cure Dispensary — 2626 Georgia Ave NW, Washington DC. Premium cannabis with same-day delivery & in-store pickup. Open every day 9am–11pm. ABCA licensed. Adults 21+.',
    keywords: ['dispensary washington dc','cannabis delivery dc','weed delivery washington dc','georgia ave dispensary','marijuana dispensary near me','recreational cannabis dc'],
    serviceAreas: ['Washington, DC','Columbia Heights','Petworth','Pleasant Plains','Shaw','Howard University','U Street','Adams Morgan','Park View'],
    businessType: 'Store',   // schema.org type
    ogImage: '',             // absolute URL to a 1200x630 share image (once provided)
    gscVerification: '',     // Google Search Console <meta> verification token
    bingVerification: '',    // Bing Webmaster verification token
  },
  // AI assistant for blog drafting (server-side only — keys never sent to browser)
  ai: {
    provider:      'pollinations', // TEXT: pollinations (free) | gemini | groq (free tier) | openai | anthropic (paid)
    geminiKey:     '',       // free key from aistudio.google.com (no credit card)
    groqKey:       '',       // free key from console.groq.com
    openaiKey:     '',       // paid key from platform.openai.com (also used for DALL·E images)
    anthropicKey:  '',       // paid key from console.anthropic.com
    model:         '',       // optional TEXT model override; blank = provider default
    autoImage:     true,     // auto-create an AI cover image on AI draft
    imageProvider: 'pollinations', // IMAGES: pollinations (free, no key) | openai (DALL·E, paid)
    imageModel:    'gpt-image-1',  // OpenAI image model (only used when imageProvider=openai)
  },
};

const DRIVERS_SEED = [
  { id:'d1', name:'Marcus Johnson',  phone:'(202) 555-0101', vehicle:'Toyota Prius · DC-1A2B3',  status:'available', currentOrder:null, todayDeliveries:7,  rating:4.9, createdAt:new Date().toISOString() },
  { id:'d2', name:'Aisha Williams',  phone:'(202) 555-0102', vehicle:'Honda Civic · DC-4C5D6',  status:'on_delivery',currentOrder:null,todayDeliveries:4,  rating:4.8, createdAt:new Date().toISOString() },
  { id:'d3', name:'David Chen',      phone:'(202) 555-0103', vehicle:'Ford Escape · DC-7E8F9',  status:'available', currentOrder:null, todayDeliveries:9,  rating:5.0, createdAt:new Date().toISOString() },
];

const STAFF_SEED = [
  { id:'s1', name:'Admin User', role:'owner',    email:'admin@districtcure.com', phone:'(202) 481-0732', status:'active', lastLogin:null, createdAt:new Date().toISOString() },
];

const PROMOS_SEED = [
  { id:'pr1', name:'New Customer 15% Off', code:'WELCOME15', type:'percent', value:15, used:14, expires:'2026-12-31', status:'active', createdAt:new Date().toISOString() },
  { id:'pr2', name:'Free Delivery $50+',   code:'FREESHIP',  type:'shipping',value:0,  used:42, expires:'2026-12-31', status:'active', createdAt:new Date().toISOString() },
];

// Visual homepage "specials" — pictures/banners with optional promo-code or link.
// Distinct from PROMOS_SEED (discount codes). Each has a publishing window + cadence.
const SPECIALS_SEED = [
  {
    id: 'sp1',
    title: 'Daily Deal — 20% Off Flower',
    subtitle: 'Today only. All 1/8 oz flower. Use code DAILY20 at checkout.',
    details: '',             // longer write-up shown in the storefront pop-up
    image: '',
    ctaLabel: 'Shop Flower',
    ctaUrl: '/#shop',
    promoCode: 'DAILY20',
    cadence: 'daily',        // daily | weekly | monthly | one-off
    startAt: '',             // ISO date — empty = active now
    endAt: '',               // ISO date — empty = no end
    daysOfWeek: [],          // [0..6] for weekly (Sun=0). Empty = every day.
    daysOfMonth: [],         // [1..31] for monthly. Empty = every day.
    priority: 100,           // higher = shown first
    status: 'draft',         // draft | published | archived
    clicks: 0,
    impressions: 0,
    attributedOrders: 0,
    attributedRevenue: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Customer reviews shown on the storefront. Seeded empty — add real Google reviews
// via Admin → Reviews (so nothing fabricated is ever shown).
const REVIEWS_SEED = [];

// Starter blog posts (original, on-brand educational content). Editable/removable in Admin → Blog.
const now = new Date().toISOString();
const POSTS_SEED = [
  {
    id: 'post_welcome',
    slug: 'how-to-get-your-dc-medical-cannabis-card',
    title: 'How to Get Your DC Medical Cannabis Card (2026 Guide)',
    excerpt: 'Becoming a cannabis patient in Washington DC is easier than most people think. Here’s the simple, up-to-date process for residents and visitors.',
    body: `<p>Washington DC has one of the most accessible cannabis programs in the country. Whether you live here or you’re just visiting, getting set up to shop legally takes minutes. Here’s how it works in 2026.</p>
<h2>DC residents: self-certify in minutes</h2>
<p>If you’re a DC resident aged 21 or older, you can <strong>self-certify</strong> online — no doctor’s visit and no fee. You’ll receive a temporary digital registration valid for 30 days while your application is reviewed, and your full registration lasts up to two years.</p>
<h2>Visiting with a medical card</h2>
<p>DC recognizes valid medical cannabis cards from other US states and territories. Bring your valid card and a government-issued photo ID, and you can shop right away.</p>
<h2>Visiting without a card</h2>
<p>No card and not a DC resident? You can apply online for a short-term visitor registration starting at just $10 for three days — and shop the same day.</p>
<p>For the full step-by-step process, official links, and what to bring, see our <a href="/patient-resources">Patient Resources</a> page. Questions? Call us at (202) 481-0732 — our team is happy to help.</p>`,
    category: 'Guides',
    tags: ['medical card','dc cannabis','how to'],
    author: 'District Cure',
    coverImage: '',
    status: 'published',
    metaTitle: 'How to Get Your DC Medical Cannabis Card (2026 Guide) | District Cure',
    metaDescription: 'Step-by-step guide to becoming a cannabis patient in Washington DC — self-certify as a resident, use reciprocity, or register as a visitor. From District Cure Dispensary.',
    keywords: ['dc medical cannabis card','how to get weed card dc','self certify dc','cannabis patient washington dc'],
    publishedAt: now, createdAt: now, updatedAt: now,
  },
  {
    id: 'post_strains101',
    slug: 'indica-vs-sativa-vs-hybrid-beginners-guide',
    title: 'Indica vs Sativa vs Hybrid: A Beginner’s Guide',
    excerpt: 'New to cannabis? Here’s a plain-English breakdown of the three main categories and how to choose what’s right for you.',
    body: `<p>If you’re new to cannabis, the menu can feel overwhelming. Most flower is grouped into three broad categories — indica, sativa, and hybrid. Here’s what they generally mean and how to pick.</p>
<h2>Indica</h2>
<p>Indica strains are often associated with relaxing, full-body effects. Many people reach for indica in the evening, to unwind, or for help settling down before sleep.</p>
<h2>Sativa</h2>
<p>Sativa strains tend to be more uplifting and energizing, and are popular for daytime use, creativity, and social settings.</p>
<h2>Hybrid</h2>
<p>Hybrids blend characteristics of both, and are bred to land anywhere on the spectrum — from balanced to indica- or sativa-leaning.</p>
<h2>The bigger picture</h2>
<p>These categories are a helpful starting point, but effects also depend on cannabinoids (like THC and CBD), terpenes, dose, and your own body. The best approach? Tell our budtenders how you want to feel, and we’ll guide you. Browse the <a href="/#shop">live menu</a> to get started.</p>`,
    category: 'Education',
    tags: ['strains','beginners','indica','sativa','hybrid'],
    author: 'District Cure',
    coverImage: '',
    status: 'published',
    metaTitle: 'Indica vs Sativa vs Hybrid: A Beginner’s Guide | District Cure',
    metaDescription: 'A simple beginner’s guide to indica, sativa, and hybrid cannabis — what each category means and how to choose. From District Cure Dispensary in Washington DC.',
    keywords: ['indica vs sativa','cannabis for beginners','hybrid strains','types of weed'],
    publishedAt: now, createdAt: now, updatedAt: now,
  },
];

module.exports = { PRODUCTS, SETTINGS_DEFAULT, DRIVERS_SEED, STAFF_SEED, PROMOS_SEED, SPECIALS_SEED, REVIEWS_SEED, POSTS_SEED };
