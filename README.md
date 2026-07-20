# District Cure Dispensary Platform

> Production-ready web platform — Customer Store + Admin Panel + Dutchie Integration

## What's included

```
districtcure/
├── storefront/        → Customer-facing store (your public website)
│   └── index.html     → Full store with live Dutchie menu, cart, loyalty, about
│
├── admin/             → Staff management panel (private, /admin)
│   └── index.html     → Orders, inventory, drivers, customers, analytics, loyalty
│
├── server/            → Node.js + Express API server
│   └── server.js      → API, Dutchie integration, Socket.io, static file serving
│
├── deploy/            → DigitalOcean deployment
│   ├── setup.sh       → Full server setup script (run once on fresh Droplet)
│   ├── nginx.conf     → Production Nginx config with SSL, gzip, rate limiting
│   └── ecosystem.config.js  → PM2 cluster config
│
├── package.json       → Node.js dependencies
└── .env.example       → All required environment variables
```

---

## Quick Start — Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your Dutchie API key

# 3. Start development server
npm run dev

# 4. Visit:
#   Store:  http://localhost:3000
#   Admin:  http://localhost:3000/admin
#   API:    http://localhost:3000/api/health
```

---

## Deploy to DigitalOcean

### Step 1 — Create Droplet
- Go to [DigitalOcean](https://cloud.digitalocean.com/droplets/new)
- Choose: **Ubuntu 22.04 LTS**
- Size: **Basic · $12/mo** (2GB RAM, 1 vCPU) minimum — **$18/mo recommended** (2GB RAM, 2 vCPU)
- Region: **New York 1** (closest to DC)
- Authentication: SSH Key (recommended) or Password
- Click **Create Droplet**

### Step 2 — Upload Your Code

```bash
# From your local machine (replace YOUR_IP with your Droplet IP)
scp -r ./districtcure root@YOUR_DROPLET_IP:/opt/
```

### Step 3 — SSH into your Droplet and Run Setup

```bash
ssh root@YOUR_DROPLET_IP
bash /opt/districtcure/deploy/setup.sh
```

This installs: Node.js 20, PM2, Nginx, Certbot (SSL), UFW (firewall), and starts your app.

### Step 4 — Configure Your Environment

```bash
nano /opt/districtcure/.env
```

Set these required values:
```env
# Your Dutchie credentials (get from Dutchie dashboard)
DUTCHIE_SLUG=district-smoke-shop
DUTCHIE_API_KEY=your_actual_dutchie_api_key

# Admin panel security key
ADMIN_KEY=generate_a_long_random_string_here

# Your domain
ALLOWED_ORIGINS=https://districtcure.com,https://www.districtcure.com
```

Then restart: `pm2 restart district-cure`

### Step 5 — Point Your Domain DNS

In your domain registrar (GoDaddy, Namecheap, etc.), set:
- `A` record: `districtcure.com` → `YOUR_DROPLET_IP`
- `A` record: `www.districtcure.com` → `YOUR_DROPLET_IP`

Wait 5–30 minutes for DNS to propagate.

### Step 6 — Install SSL Certificate

```bash
# Edit the setup script with your real domain first:
nano /opt/districtcure/deploy/setup.sh
# Change DOMAIN="districtcure.com" and EMAIL="your@email.com"

# Then run certbot:
certbot --nginx -d districtcure.com -d www.districtcure.com
```

---

## Getting Your Dutchie API Key

1. Log into your [Dutchie dashboard](https://backoffice.dutchie.com)
2. Go to **Settings → Integrations → API**
3. Generate or copy your API key
4. Add it to your `.env` file as `DUTCHIE_API_KEY`
5. Force a sync: `curl -X POST https://districtcure.com/api/menu/sync -H "x-admin-key: YOUR_ADMIN_KEY"`

**Without an API key**, the store still works — it uses your verified menu data as a fallback (the real products we found on your Dutchie/WhereWeed listings).

---

## Admin Panel

Access: `https://districtcure.com/admin`

**Features:**
- **Dashboard** — Live stats, revenue chart, recent orders, low stock alerts
- **Orders** — Full order management with status updates, driver assignment
- **Inventory** — Live sync from Dutchie, add/edit products, stock alerts
- **Drivers** — Driver management, availability tracking, deliveries
- **Customers** — Customer lookup, loyalty points, age verification status
- **Analytics** — Revenue trends, top products, category breakdown
- **Loyalty** — Member tiers, point balances, adjustments
- **Promotions** — Create and manage promo codes
- **Staff** — Add/manage budtenders, managers, drivers
- **Settings** — Dutchie API config, business hours, password

**Security note:** In the current build, `/admin` is protected by obscurity (only you know the URL). For production, add HTTP Basic Auth or JWT login:

```bash
# Quick HTTP Basic Auth via Nginx (add inside the /admin location block):
# auth_basic "District Cure Admin";
# auth_basic_user_file /etc/nginx/.htpasswd;

# Create password file:
# htpasswd -c /etc/nginx/.htpasswd admin
```

---

## Useful Commands

```bash
# App management
pm2 status                    # check app status
pm2 restart district-cure     # restart after .env changes
pm2 logs district-cure        # view live logs
pm2 monit                     # monitor CPU/memory

# Nginx
nginx -t                      # test config
systemctl reload nginx         # apply config changes

# SSL renewal (auto-renews, but manual if needed)
certbot renew

# Force Dutchie sync from terminal
curl -X POST http://localhost:3000/api/menu/sync \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

---

## Dutchie Integration Details

The server calls Dutchie's public consumer GraphQL endpoint:
`https://dutchie.com/graphql`

With your dispensary slug: `district-smoke-shop`

**With API key** → Full product data, real-time inventory, variant prices
**Without API key** → Falls back to your verified product list (18 products)

The menu is cached for 5 minutes in memory to avoid rate limits. Force-refresh anytime via the admin panel's **Sync Dutchie** button or the API endpoint.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (no framework — fast, simple, deployable) |
| Backend | Node.js + Express |
| Real-time | Socket.io (order updates, driver tracking) |
| POS/Menu | Dutchie GraphQL API |
| Process manager | PM2 (cluster mode) |
| Web server | Nginx (reverse proxy, SSL, gzip) |
| SSL | Let's Encrypt / Certbot |
| Hosting | DigitalOcean Droplet |

---

## Support

- **Dutchie API docs**: https://docs.dutchie.com
- **DigitalOcean docs**: https://docs.digitalocean.com
- **PM2 docs**: https://pm2.keymetrics.io
