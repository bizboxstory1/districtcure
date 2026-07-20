#!/bin/bash
# ================================================================
#  District Cure Dispensary — DigitalOcean Deployment Script
#  Run on a fresh Ubuntu 22.04 LTS Droplet (min. 2GB RAM / 1 vCPU)
#
#  Usage:
#    1. SSH into your Droplet: ssh root@YOUR_DROPLET_IP
#    2. Upload this project: scp -r ./districtcure root@YOUR_IP:/opt/
#    3. Run: bash /opt/districtcure/deploy/setup.sh
#
#  What this does:
#    - Installs Node.js 20, PM2, Nginx
#    - Sets up the app as a systemd service via PM2
#    - Configures Nginx as reverse proxy
#    - Installs SSL via Let's Encrypt (Certbot)
#    - Sets up UFW firewall
#    - Creates deploy user, sets permissions
# ================================================================

set -e  # Exit on any error

# ── CONFIG — Edit these before running ──────
APP_DIR="/opt/districtcure"
DOMAIN="districtcure.com"          # ← your actual domain
EMAIL="admin@districtcure.com"     # ← your email for SSL cert
NODE_VERSION="20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step() { echo -e "\n${BLUE}══${NC} $1 ${BLUE}══${NC}"; }

echo -e "${GREEN}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║  District Cure — DigitalOcean Deployment  ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. System Update ────────────────────────
step "1/8 — System Update"
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl wget git build-essential ufw
log "System updated"

# ── 2. Node.js ──────────────────────────────
step "2/8 — Installing Node.js $NODE_VERSION"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node.js $(node -v) installed"
log "npm $(npm -v) installed"

# ── 3. PM2 ──────────────────────────────────
step "3/8 — Installing PM2"
npm install -g pm2 --silent
log "PM2 $(pm2 -v) installed"

# ── 4. Nginx ────────────────────────────────
step "4/8 — Installing Nginx"
apt-get install -y -qq nginx
log "Nginx installed"

# ── 5. App Setup ────────────────────────────
step "5/8 — Configuring Application"

# Create app directory if needed
mkdir -p $APP_DIR/logs

# Copy PM2 ecosystem config
cp $APP_DIR/deploy/ecosystem.config.js $APP_DIR/

# Install dependencies
cd $APP_DIR
npm install --production --silent
log "Node modules installed"

# Create .env if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
  cp $APP_DIR/.env.example $APP_DIR/.env
  warn ".env created from template — EDIT IT NOW with your real values:"
  warn "  nano $APP_DIR/.env"
  warn "  Required: DUTCHIE_SLUG, DUTCHIE_API_KEY, ADMIN_KEY"
fi

# ── 6. Start App with PM2 ───────────────────
step "6/8 — Starting Application"
cd $APP_DIR
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup | tail -1 | bash  # auto-start on reboot
log "Application started with PM2"
pm2 status

# ── 7. Nginx Config ─────────────────────────
step "7/8 — Configuring Nginx"

# Copy and customize Nginx config
sed "s/districtcure.com/$DOMAIN/g" $APP_DIR/deploy/nginx.conf > /etc/nginx/sites-available/districtcure

# Disable default site
rm -f /etc/nginx/sites-enabled/default

# Enable our site (temporarily HTTP-only until SSL)
cat > /etc/nginx/sites-available/districtcure-temp << NGINX_TEMP
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_TEMP

ln -sf /etc/nginx/sites-available/districtcure-temp /etc/nginx/sites-enabled/districtcure

nginx -t && systemctl reload nginx
log "Nginx configured"

# ── 8. SSL with Certbot ─────────────────────
step "8/8 — SSL Certificate"
apt-get install -y -qq certbot python3-certbot-nginx

if [ "$DOMAIN" != "districtcure.com" ]; then
  warn "Installing SSL for $DOMAIN..."
  certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos --non-interactive
  # Swap to full HTTPS config
  ln -sf /etc/nginx/sites-available/districtcure /etc/nginx/sites-enabled/districtcure
  rm -f /etc/nginx/sites-available/districtcure-temp
  nginx -t && systemctl reload nginx
  log "SSL installed for $DOMAIN"
else
  warn "Using placeholder domain — skip SSL. Update DOMAIN in this script and re-run certbot manually."
fi

# ── 9. Firewall ──────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
log "Firewall configured"

# ── Done ──────────────────────────────────────
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       ✅  District Cure Deployed Successfully!     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Store:${NC}  http://$DOMAIN"
echo -e "  ${BLUE}Admin:${NC}  http://$DOMAIN/admin"
echo -e "  ${BLUE}API:${NC}    http://$DOMAIN/api/health"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Edit your .env file:"
echo "     nano $APP_DIR/.env"
echo "     → Set DUTCHIE_API_KEY to your key from Dutchie dashboard"
echo "     → Set ADMIN_KEY to a strong random string"
echo ""
echo "  2. Restart app after .env changes:"
echo "     pm2 restart district-cure"
echo ""
echo "  3. If you haven't already, point your domain DNS:"
echo "     → A record: $DOMAIN → $(curl -s ifconfig.me)"
echo "     → A record: www.$DOMAIN → $(curl -s ifconfig.me)"
echo ""
echo "  4. Then run SSL (if you updated the DOMAIN variable):"
echo "     certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "  5. Monitor logs:"
echo "     pm2 logs district-cure"
echo "     pm2 monit"
echo ""
