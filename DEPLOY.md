# District Cure — Deploy Guide
## Local VS Code → DigitalOcean Live Server

---

## PART 1 — Set Up on Your Local Computer

### Step 1 — Install prerequisites (one time only)

You need these on your machine:
- **Node.js 20+** → https://nodejs.org (download the LTS version)
- **VS Code** → https://code.visualstudio.com
- **Git** → https://git-scm.com/downloads

Verify after installing — open Terminal (Mac) or Command Prompt (Windows) and run:
```bash
node -v     # should show v20.x.x
npm -v      # should show 10.x.x
git --version
```

---

### Step 2 — Get the project onto your computer

**Option A — Download the ZIP** (easiest right now)
1. Download `districtcure.zip` from this conversation
2. Unzip it to a folder you'll remember, e.g.:
   - Mac: `/Users/yourname/Projects/districtcure`
   - Windows: `C:\Projects\districtcure`

**Option B — Git (recommended for ongoing work)**
```bash
# On your server later, you'll push code here
git init
git add .
git commit -m "Initial District Cure platform"
```

---

### Step 3 — Open in VS Code

```bash
# In Terminal, navigate to your project folder:
cd /Users/yourname/Projects/districtcure    # Mac
cd C:\Projects\districtcure                 # Windows

# Open VS Code:
code .
```

Or: open VS Code → File → Open Folder → select the `districtcure` folder.

---

### Step 4 — Install dependencies and run locally

In VS Code, open the Terminal (`` Ctrl+` `` or Terminal menu → New Terminal):

```bash
# Install all packages
npm install

# Create your local .env file
cp .env.example .env

# Edit .env — change ADMIN_KEY to something random
# (the DUTCHIE_API_KEY can stay blank for now)

# Start the development server
npm run dev
```

You should see:
```
✅ District Cure server running on port 3000
   Store:  http://localhost:3000
   Admin:  http://localhost:3000/admin
```

Open your browser → `http://localhost:3000` — your store is running locally!

---

## PART 2 — Connect VS Code to Your DigitalOcean Server

This lets you **edit files in VS Code on your laptop** and they sync live to your server.

### Step 1 — Install the Remote SSH extension in VS Code

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions panel)
3. Search: **Remote - SSH**
4. Install it (by Microsoft)

---

### Step 2 — Add your server to SSH config

Press `Ctrl+Shift+P` → type **"Remote-SSH: Open SSH Configuration File"** → select the first option.

Add this block (replace `YOUR_DROPLET_IP`):

```
Host districtcure
    HostName YOUR_DROPLET_IP
    User root
    IdentityFile ~/.ssh/id_rsa
```

Save the file.

---

### Step 3 — Connect to your server from VS Code

1. Press `Ctrl+Shift+P`
2. Type **"Remote-SSH: Connect to Host"**
3. Select **districtcure**
4. VS Code will open a new window connected to your server
5. Open Folder → `/opt/districtcure`

You are now **editing files directly on your live server** inside VS Code. Any save = live on your website.

---

### Step 4 — Set up the server (run once)

Once connected via SSH in VS Code, open the Terminal panel and run:

```bash
# Upload your project to the server first (from your LOCAL terminal):
scp -r /Users/yourname/Projects/districtcure root@YOUR_DROPLET_IP:/opt/

# Then SSH in and run the setup script:
ssh root@YOUR_DROPLET_IP
bash /opt/districtcure/deploy/setup.sh
```

This installs Node.js, PM2, Nginx, and SSL automatically.

---

### Step 5 — Set your environment variables on the server

```bash
# On your server:
nano /opt/districtcure/.env
```

Set these values:
```env
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://districtcure.com,https://www.districtcure.com
DUTCHIE_SLUG=district-smoke-shop
DUTCHIE_API_KEY=          ← leave blank for now, add later
ADMIN_KEY=make_this_a_long_random_string_like_abc123xyz789
```

Save: `Ctrl+X` → `Y` → Enter

Then restart:
```bash
pm2 restart district-cure
```

---

### Step 6 — Point your domain

In your domain registrar (GoDaddy, Namecheap, etc.):

| Type | Name | Value |
|------|------|-------|
| A    | @    | YOUR_DROPLET_IP |
| A    | www  | YOUR_DROPLET_IP |

Wait 5–30 minutes for DNS to spread. Then visit `http://yourdomain.com` — your store is live.

---

### Step 7 — Install SSL (free HTTPS)

```bash
# On your server:
certbot --nginx -d districtcure.com -d www.districtcure.com
```

Follow the prompts — takes 2 minutes. Your store will now be at `https://districtcure.com`.

---

## PART 3 — Daily Workflow

### Making changes locally and pushing to server

```bash
# Option A — Direct edit via Remote SSH (simplest)
# Connect VS Code to server → edit files → they're live instantly
# Then restart if you changed server.js:
pm2 restart district-cure

# Option B — Edit locally, upload changes
scp storefront/index.html root@YOUR_IP:/opt/districtcure/storefront/
scp admin/index.html root@YOUR_IP:/opt/districtcure/admin/
# (no restart needed for HTML/CSS/JS changes — server serves them statically)

# Option C — Git workflow (recommended long-term)
git add .
git commit -m "Update storefront design"
git push
# Then on server: git pull && pm2 restart district-cure
```

### Useful server commands

```bash
pm2 status                    # is the app running?
pm2 restart district-cure     # restart after .env or server.js changes
pm2 logs district-cure        # watch live logs
pm2 monit                     # CPU/memory monitor

nginx -t                      # test nginx config
systemctl reload nginx         # apply nginx changes

# Force Dutchie menu sync:
curl -X POST http://localhost:3000/api/menu/sync \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

---

## PART 4 — Adding Your Dutchie API Key Later

When you get your Dutchie API key:

**Option A — Admin Panel (easiest)**
1. Go to `https://districtcure.com/admin`
2. Click **Settings** in the left sidebar
3. Paste your key into the **Dutchie API Key** field
4. Click **Save & Sync**

**Option B — Server .env file**
```bash
# SSH into server:
nano /opt/districtcure/.env
# Add: DUTCHIE_API_KEY=your_actual_key_here
# Save, then:
pm2 restart district-cure
```

---

## Project Structure (VS Code file tree)

```
districtcure/
│
├── storefront/
│   └── index.html          ← Your public website (edit this for design changes)
│
├── admin/
│   └── index.html          ← Staff admin panel at /admin
│
├── server/
│   └── server.js           ← Node.js API + Dutchie proxy + Socket.io
│
├── deploy/
│   ├── setup.sh            ← Run once on fresh DigitalOcean server
│   ├── nginx.conf          ← Web server config (SSL, rate limiting, gzip)
│   └── ecosystem.config.js ← PM2 process manager config
│
├── .env.example            ← Template — copy to .env and fill in
├── .env                    ← Your secrets (NEVER commit this to git)
├── .gitignore              ← Files git ignores
├── package.json            ← Node dependencies
├── README.md               ← Full project docs
└── DEPLOY.md               ← This file
```

---

## Troubleshooting

**Store not loading after deploy**
```bash
pm2 logs district-cure    # check for errors
pm2 restart district-cure
```

**Nginx 502 Bad Gateway**
```bash
pm2 status               # make sure app is running
pm2 start ecosystem.config.js --env production
```

**Can't connect via Remote SSH**
- Make sure your SSH key is added: `ssh-keygen -t rsa` then add public key to DigitalOcean
- Or use password auth: `ssh root@YOUR_IP` and enter your Droplet password

**Menu showing fallback products instead of live Dutchie**
- Your DUTCHIE_API_KEY in .env is empty or wrong — that's fine for now
- Store still works with the 18 real products we've loaded

---

## Your DigitalOcean Info (fill in after setup)

```
Droplet IP:    ___________________
Domain:        districtcure.com
Store URL:     https://districtcure.com
Admin URL:     https://districtcure.com/admin
Admin key:     (keep this secret — stored in .env)
```
