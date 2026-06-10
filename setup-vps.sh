#!/bin/bash
# =============================================================
# setup-vps.sh — One-time VPS Setup untuk WebWA Gateway
# Jalankan sekali saja sebagai root atau user dengan sudo
# =============================================================
# Cara pakai:
#   chmod +x setup-vps.sh
#   sudo ./setup-vps.sh
# =============================================================

set -e

echo "============================================="
echo "  WebWA Gateway — VPS Setup"
echo "============================================="

# ─── 1. Update system & install dependensi ───────────────────
echo ""
echo "📦 [1/6] Update system & install dependensi..."
apt-get update -y
apt-get install -y \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  ufw

# ─── 2. Install Docker ───────────────────────────────────────
echo ""
echo "🐳 [2/6] Install Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker berhasil diinstall"
else
  echo "✅ Docker sudah terinstall: $(docker --version)"
fi

# ─── 3. Buat folder aplikasi ─────────────────────────────────
echo ""
echo "📁 [3/6] Buat folder aplikasi..."
mkdir -p /opt/apps/webwa
mkdir -p /opt/apps/webwa/nginx-sites
echo "✅ Folder /opt/apps/webwa siap"

# ─── 4. Konfigurasi Firewall (UFW) ───────────────────────────
echo ""
echo "🔥 [4/6] Konfigurasi firewall UFW..."
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "✅ Firewall aktif: SSH, HTTP (80), HTTPS (443)"

# ─── 5. Setup SSL dengan Certbot ─────────────────────────────
echo ""
echo "🔐 [5/6] Setup SSL certificate dengan Let's Encrypt..."
echo ""
echo "  Pastikan DNS kedua domain sudah pointing ke IP VPS ini!"
echo "  Tekan Enter jika sudah siap, atau Ctrl+C untuk skip..."
read -r

# Backend API domain
certbot --nginx \
  -d backend-wa-api.masedo.my.id \
  --non-interactive \
  --agree-tos \
  --email admin@masedo.my.id \
  --redirect

# Frontend domain
certbot --nginx \
  -d wa-gateway.masedo.my.id \
  --non-interactive \
  --agree-tos \
  --email admin@masedo.my.id \
  --redirect

echo "✅ SSL certificate berhasil dibuat"

# ─── 6. Setup Nginx sites ────────────────────────────────────
echo ""
echo "🌐 [6/6] Setup Nginx sites..."

# Hapus default site Nginx
rm -f /etc/nginx/sites-enabled/default

# Copy dan aktifkan nginx configs dari repo (jika sudah ada)
if [ -f /opt/apps/webwa/nginx-sites/backend-wa-api.masedo.my.id.conf ]; then
  cp /opt/apps/webwa/nginx-sites/backend-wa-api.masedo.my.id.conf \
     /etc/nginx/sites-available/backend-wa-api.masedo.my.id.conf
  ln -sf /etc/nginx/sites-available/backend-wa-api.masedo.my.id.conf \
         /etc/nginx/sites-enabled/backend-wa-api.masedo.my.id.conf
fi

if [ -f /opt/apps/webwa/nginx-sites/wa-gateway.masedo.my.id.conf ]; then
  cp /opt/apps/webwa/nginx-sites/wa-gateway.masedo.my.id.conf \
     /etc/nginx/sites-available/wa-gateway.masedo.my.id.conf
  ln -sf /etc/nginx/sites-available/wa-gateway.masedo.my.id.conf \
         /etc/nginx/sites-enabled/wa-gateway.masedo.my.id.conf
fi

nginx -t && nginx -s reload
echo "✅ Nginx dikonfigurasi dan reload"

# ─── Setup GitHub Actions Deploy User (opsional) ─────────────
echo ""
echo "============================================="
echo "  ✅ Setup VPS SELESAI!"
echo "============================================="
echo ""
echo "Langkah selanjutnya:"
echo "  1. Tambahkan secrets di GitHub repo:"
echo "     - VPS_HOST     : IP VPS ini"
echo "     - VPS_USER     : $(whoami)"
echo "     - VPS_SSH_KEY  : konten ~/.ssh/id_rsa (atau generate baru)"
echo "     - VPS_PORT     : 22"
echo "     - GHCR_TOKEN   : GitHub PAT dengan scope read:packages"
echo "     - SUPABASE_URL : URL Supabase project"
echo "     - SUPABASE_SERVICE_ROLE_KEY : Service role key Supabase"
echo "     - VITE_SUPABASE_URL         : URL Supabase project"
echo "     - VITE_SUPABASE_ANON_KEY    : Anon key Supabase"
echo ""
echo "  2. Push ke branch main untuk trigger deploy otomatis"
echo ""
