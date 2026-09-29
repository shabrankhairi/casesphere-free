#!/bin/bash
# ============================================================================
#  Case Sphere SOC Platform — Installer
#  Version: 5.0 | Native Linux | No Docker | No Node.js required
#
#  Installs:
#    - PostgreSQL 16 (native via apt)
#    - Nginx (native via apt)
#    - Case Sphere binary (pre-compiled, no Node.js needed)
#    - systemd service (auto-start on boot)
#    - UFW firewall rules
#
#  Usage: sudo ./install.sh
# ============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────
readonly APP_DIR="/opt/casesphere"
readonly APP_USER="casesphere"
readonly APP_PORT=3000
readonly LOG_FILE="/var/log/casesphere-install.log"
readonly BINARY="casesphere-server"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

exec > >(tee -a "$LOG_FILE") 2>&1

log()     { echo -e "${GREEN}[✓]${NC} $1"; }
info()    { echo -e "${BLUE}[→]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }
section() {
  echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
}

# ── Root check ─────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run as root: sudo ./install.sh"

# ── Banner ────────────────────────────────────────────────────────────────
clear
cat << 'BANNER'
   ___                ___       _
  / __|__ _ ___ ___  / __|_ __ | |_  ___ _ _ ___
 | (__/ _` (_-</ -_) \__ \ '_ \| ' \/ -_) '_/ -_)
  \___\__,_/__/\___| |___/ .__/|_||_\___|_| \___|
                          |_|
  SOC Case Management Platform — Installer v5.0
  Native Linux | No Docker | No Node.js required
BANNER
echo ""
info "Log: $LOG_FILE"
echo ""

# ── Verify package contents ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ ! -f "$SCRIPT_DIR/$BINARY" ]]   && error "Binary '$BINARY' not found — extract the full package first"
[[ ! -d "$SCRIPT_DIR/public" ]]    && error "Frontend 'public/' not found — package may be incomplete"
log "Package contents verified"

# ── System check ───────────────────────────────────────────────────────────
section "1/8 System Requirements"

source /etc/os-release 2>/dev/null || true
info "OS: ${PRETTY_NAME:-unknown}"

RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
DISK_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
[[ $RAM_MB -lt 1800 ]] && warn "Low RAM: ${RAM_MB}MB — 4GB recommended for production"
[[ $DISK_GB -lt 10  ]] && error "Only ${DISK_GB}GB free — need at least 10GB"
curl -s --max-time 5 https://apt.postgresql.org > /dev/null 2>&1 || \
  error "No internet access — needed to install PostgreSQL and Nginx"
log "RAM: ${RAM_MB}MB | Disk: ${DISK_GB}GB | Internet: OK"

# ── Configuration ──────────────────────────────────────────────────────────
section "2/8 Configuration"

echo ""
read -r -p "  Domain or IP for this server [localhost]: " SERVER_DOMAIN
SERVER_DOMAIN="${SERVER_DOMAIN:-localhost}"

read -r -p "  Anthropic API key for AI Analysis (leave blank to skip): " ANTHROPIC_KEY
read -r -p "  VirusTotal API key for IOC checks (leave blank to skip): " VIRUSTOTAL_KEY
read -r -p "  Setup HTTPS with Let's Encrypt? (requires valid domain, not IP) [y/N]: " SETUP_HTTPS
SETUP_HTTPS="${SETUP_HTTPS:-n}"

echo ""
echo "  ─────────────────────────────────────"
echo "  Domain     : $SERVER_DOMAIN"
echo "  Anthropic  : ${ANTHROPIC_KEY:+[set]}"
echo "  VirusTotal : ${VIRUSTOTAL_KEY:+[set]}"
echo "  HTTPS      : $SETUP_HTTPS"
echo "  ─────────────────────────────────────"
echo ""
read -r -p "  Proceed with installation? [Y/n]: " CONFIRM
[[ "${CONFIRM:-y}" =~ ^[Nn] ]] && { info "Installation cancelled."; exit 0; }

# Generate all secrets randomly
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)
DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9!@#%^' | head -c 32)
DB_MIGRATE_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
DB_USER="cs_app"
DB_MIGRATE_USER="cs_migrate"
DB_NAME="casesphere"
log "Secrets generated (JWT: 64 chars, DB: 32 chars)"

# ── Install packages ───────────────────────────────────────────────────────
section "3/8 Installing System Packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl openssl ca-certificates gnupg lsb-release ufw

# PostgreSQL 16
if ! command -v psql &>/dev/null || [[ $(psql --version 2>/dev/null | awk '{print $3}' | cut -d. -f1) -lt 16 ]]; then
  info "Installing PostgreSQL 16..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
    gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
    tee /etc/apt/sources.list.d/pgdg.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq postgresql-16
  systemctl enable postgresql --now
  sleep 2
fi
log "PostgreSQL $(psql --version | awk '{print $3}')"

# Nginx
command -v nginx &>/dev/null || apt-get install -y -qq nginx
systemctl enable nginx --now
log "Nginx ready"

# Certbot (optional)
[[ "$SETUP_HTTPS" =~ ^[Yy] ]] && {
  apt-get install -y -qq certbot python3-certbot-nginx
  log "Certbot installed"
}

# ── Database setup ─────────────────────────────────────────────────────────
section "4/8 Setting Up Database"

sudo -u postgres psql -q << SQLEOF
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';
  ELSE ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASSWORD'; END IF;
END \$\$;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DB_MIGRATE_USER') THEN
    CREATE ROLE $DB_MIGRATE_USER LOGIN PASSWORD '$DB_MIGRATE_PASS' CREATEDB;
  ELSE ALTER ROLE $DB_MIGRATE_USER WITH PASSWORD '$DB_MIGRATE_PASS'; END IF;
END \$\$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_MIGRATE_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='$DB_NAME') \gexec
GRANT CONNECT ON DATABASE $DB_NAME TO $DB_USER;
SQLEOF

# pg_hba auth
PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" | tr -d ' ')
grep -q "cs_app" "$PG_HBA" 2>/dev/null || {
  echo "local   $DB_NAME   $DB_USER          md5" >> "$PG_HBA"
  echo "local   $DB_NAME   $DB_MIGRATE_USER  md5" >> "$PG_HBA"
  systemctl reload postgresql
}
log "Database '$DB_NAME' ready | App user: $DB_USER | Migrate user: $DB_MIGRATE_USER"

# ── Deploy application ─────────────────────────────────────────────────────
section "5/8 Deploying Application"

# System user (no login shell — security)
id "$APP_USER" &>/dev/null || \
  useradd -r -s /bin/false -d "$APP_DIR" -M "$APP_USER"
log "System user '$APP_USER' created (shell: /bin/false)"

# Directories
mkdir -p "$APP_DIR"/{uploads,backups,logs,public}

# Deploy binary
cp "$SCRIPT_DIR/$BINARY" "$APP_DIR/$BINARY"
chmod 750 "$APP_DIR/$BINARY"
chown root:"$APP_USER" "$APP_DIR/$BINARY"
log "Binary deployed → $APP_DIR/$BINARY"

# Deploy frontend
cp -r "$SCRIPT_DIR/public/." "$APP_DIR/public/"
chown -R root:"$APP_USER" "$APP_DIR/public"
chmod -R 755 "$APP_DIR/public"
log "Frontend deployed → $APP_DIR/public/"

# Write .env
cat > "$APP_DIR/.env" << ENVEOF
# Case Sphere SOC Platform — Generated $(date '+%Y-%m-%d %H:%M:%S')
# Permissions: 640 (root:casesphere) — keep this file secure

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=$DB_NAME
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASSWORD

POSTGRES_MIGRATE_USER=$DB_MIGRATE_USER
POSTGRES_MIGRATE_PASSWORD=$DB_MIGRATE_PASS

JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=30m

NODE_ENV=production
PORT=$APP_PORT
SERVER_DOMAIN=$SERVER_DOMAIN
STATIC_DIR=$APP_DIR/public
UPLOAD_DIR=$APP_DIR/uploads

ANTHROPIC_API_KEY=$ANTHROPIC_KEY
VIRUSTOTAL_API_KEY=$VIRUSTOTAL_KEY

AUTH_RATE_LIMIT_MAX=20
MFA_RATE_LIMIT_MAX=10
RATE_LIMIT_MAX=500
ENVEOF

chown root:"$APP_USER" "$APP_DIR/.env"
chmod 640 "$APP_DIR/.env"
log ".env secured (chmod 640, owner root:$APP_USER)"

# Permissions
chown -R "$APP_USER:$APP_USER" "$APP_DIR/uploads" "$APP_DIR/backups" "$APP_DIR/logs"
chown root:"$APP_USER" "$APP_DIR"
chmod 750 "$APP_DIR"

# ── Run migrations + seed ──────────────────────────────────────────────────
info "Running migrations and seeding initial data..."
sudo -u "$APP_USER" env \
  POSTGRES_HOST=localhost \
  POSTGRES_PORT=5432 \
  POSTGRES_DB="$DB_NAME" \
  POSTGRES_USER="$DB_MIGRATE_USER" \
  POSTGRES_PASSWORD="$DB_MIGRATE_PASS" \
  POSTGRES_MIGRATE_USER="$DB_MIGRATE_USER" \
  POSTGRES_MIGRATE_PASSWORD="$DB_MIGRATE_PASS" \
  JWT_SECRET="$JWT_SECRET" \
  NODE_ENV=production \
  "$APP_DIR/$BINARY" --migrate-and-seed 2>&1 | \
  grep -E "migrate|seed|skip|done|error|ERROR|complete|already" || true

# Apply least privilege to app user after migrations
sudo -u postgres psql -d "$DB_NAME" -q << SQLEOF2
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
REVOKE CREATE ON SCHEMA public FROM $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_USER;
SQLEOF2
log "Migrations complete — least privilege applied to $DB_USER"

# ── Nginx config ───────────────────────────────────────────────────────────
section "6/8 Configuring Nginx"

rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/casesphere << NGINXEOF
server {
    listen 80;
    server_name $SERVER_DOMAIN;
    server_tokens off;
    client_max_body_size 25M;

    add_header X-Content-Type-Options  "nosniff"       always;
    add_header X-Frame-Options         "DENY"          always;
    add_header Referrer-Policy         "no-referrer"   always;
    add_header Permissions-Policy      "geolocation=(), microphone=(), camera=()" always;

    # API reverse proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Cookie            \$http_cookie;
        proxy_read_timeout 120s;
    }

    # Frontend (obfuscated static files)
    location / {
        root  $APP_DIR/public;
        index index.html;
        try_files \$uri \$uri/ /index.html;

        location ~* \.(js|css|png|jpg|ico|svg|woff2|webp)\$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Block sensitive paths
    location ~ /\.         { deny all; }
    location ~ \.env\$     { deny all; }
    location ~ \.sql\$     { deny all; }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/casesphere /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
log "Nginx configured and reloaded"

# ── Systemd service ────────────────────────────────────────────────────────
section "7/8 Setting Up Systemd Service"

cat > /etc/systemd/system/casesphere.service << SVCEOF
[Unit]
Description=Case Sphere SOC Case Management Platform
Documentation=https://casesphere.io
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/$BINARY

Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=3

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/uploads $APP_DIR/backups $APP_DIR/logs

# Resource limits
LimitNOFILE=65536
MemoryMax=2G

# Logging
StandardOutput=append:$APP_DIR/logs/app.log
StandardError=append:$APP_DIR/logs/error.log
SyslogIdentifier=casesphere

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable casesphere.service
systemctl start casesphere.service

sleep 3
systemctl is-active casesphere.service > /dev/null 2>&1 && \
  log "Service 'casesphere' started and enabled (auto-start on boot)" || \
  warn "Service may not have started — check: journalctl -u casesphere -n 30"

# ── HTTPS (optional) ───────────────────────────────────────────────────────
if [[ "$SETUP_HTTPS" =~ ^[Yy] ]] && \
   [[ "$SERVER_DOMAIN" != "localhost" ]] && \
   ! [[ "$SERVER_DOMAIN" =~ ^[0-9] ]]; then
  section "7.5/8 Setting Up HTTPS"
  certbot --nginx -d "$SERVER_DOMAIN" \
    --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect && {
    (crontab -l 2>/dev/null; echo "0 3 * * 1 certbot renew --quiet --nginx") | crontab -
    log "HTTPS configured with auto-renewal (every Monday 03:00)"
  } || warn "HTTPS setup failed — run: sudo certbot --nginx -d $SERVER_DOMAIN"
fi

# ── Firewall ───────────────────────────────────────────────────────────────
section "8/8 Configuring Firewall"

ufw --force enable > /dev/null 2>&1
ufw allow OpenSSH         > /dev/null 2>&1
ufw allow 'Nginx Full'    > /dev/null 2>&1
ufw deny "$APP_PORT/tcp"  > /dev/null 2>&1
log "Firewall: SSH + HTTP/HTTPS open | Port $APP_PORT blocked externally"

# ── Health check ───────────────────────────────────────────────────────────
sleep 3
HEALTH=$(curl -s --max-time 8 "http://localhost/api/health" 2>/dev/null || echo "")
echo "$HEALTH" | grep -qiE "ok|healthy" && \
  log "Health check: ✓ Application responding" || \
  warn "Health check inconclusive — check: journalctl -u casesphere -n 20"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   Case Sphere SOC Platform — INSTALLED ✓            ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  URL          : http://$SERVER_DOMAIN"
[[ "$SETUP_HTTPS" =~ ^[Yy] ]] && \
  echo -e "  Secure URL   : https://$SERVER_DOMAIN"
echo -e "  Install dir  : $APP_DIR"
echo -e "  Config       : $APP_DIR/.env  (chmod 640)"
echo -e "  Logs         : $APP_DIR/logs/"
echo -e "  Log file     : $LOG_FILE"
echo ""
echo -e "  ${BOLD}Default login (CHANGE IMMEDIATELY):${NC}"
echo -e "  Email    : admin@casesphere.local"
echo -e "  Password : Admin@1234!"
echo ""
echo -e "  ${BOLD}Service management:${NC}"
echo -e "  sudo systemctl status casesphere     — Status"
echo -e "  sudo systemctl restart casesphere    — Restart"
echo -e "  sudo journalctl -u casesphere -f     — Live logs"
echo ""
echo -e "  ${BOLD}Or use Makefile:${NC}"
echo -e "  sudo make -f $APP_DIR/Makefile help"
echo ""
echo -e "  ${BOLD}${RED}⚠ After install:${NC}"
echo -e "  1. Login and CHANGE admin password immediately"
echo -e "  2. Complete MFA setup on first login"
echo -e "  3. Add API keys to: $APP_DIR/.env"
echo ""
