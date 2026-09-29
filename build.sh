#!/bin/bash
ROOT_DIR="$(pwd)"
# ============================================================================
#  Case Sphere FREE — Build Script
#  Jalankan di BUILD/DEV machine (bukan server end-user)
#
#  Output: dist/casesphere-free-v1.0-linux-x64.tar.gz
#  Usage:  bash build.sh
# ============================================================================

set -euo pipefail

VERSION="1.0"
APP_NAME="casesphere-free"
PKG_NAME="${APP_NAME}-v${VERSION}-linux-x64"
DIST_DIR="./dist/${PKG_NAME}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[✓]${NC} $1"; }
info()    { echo -e "${BLUE}[→]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }
section() {
  echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
}

clear
echo -e "${BOLD}${CYAN}"
cat << 'LOGO'
   ___                ___       _
  / __|__ _ ___ ___  / __|_ __ | |_  ___ _ _ ___
 | (__/ _` (_-</ -_) \__ \ '_ \| ' \/ -_) '_/ -_)
  \___\__,_/__/\___| |___/ .__/|_||_\___|_| \___|
                          |_|
  FREE Edition — Build Script v1.0
LOGO
echo -e "${NC}"

# ── 1. Requirements ──────────────────────────────────────────────────────────
section "1/5 Checking Requirements"

command -v node &>/dev/null || error "Node.js not found — install Node.js 18+ first"
command -v npm  &>/dev/null || error "npm not found"
NODE_VER=$(node -v | cut -d. -f1 | tr -d 'v')
[[ $NODE_VER -lt 18 ]] && error "Node.js 18+ required (current: $(node -v))"
log "Node.js $(node -v) | npm $(npm -v)"

command -v pkg &>/dev/null || { info "Installing pkg..."; npm install -g pkg; }
log "pkg ready"

command -v javascript-obfuscator &>/dev/null || {
  info "Installing javascript-obfuscator..."
  npm install -g javascript-obfuscator
}
log "javascript-obfuscator ready"

[[ ! -f "backend/server.js" ]] && \
  error "Run from Case Sphere FREE root directory"
[[ -f "backend/routes/ai.js" ]] && \
  warn "ai.js detected — make sure this is the Free version source"
log "Source structure verified"

# ── 2. Prepare ───────────────────────────────────────────────────────────────
section "2/5 Preparing Build"

rm -rf dist
mkdir -p "$DIST_DIR"/{backups,logs,uploads}
log "Build directory: dist/$PKG_NAME"

# ── 3. Frontend ──────────────────────────────────────────────────────────────
section "3/5 Building Frontend"

info "Installing frontend dependencies..."
cd frontend && npm install --silent && cd ..
info "Building with Vite..."
cd frontend && npm run build && cd ..
log "Frontend built → backend/public/"

info "Obfuscating JavaScript..."
JS_COUNT=0
while IFS= read -r -d '' jsfile; do
  [[ "$jsfile" == *".min.js" ]] && continue
  javascript-obfuscator "$jsfile" \
    --output "$jsfile" \
    --compact true \
    --self-defending true \
    --identifier-names-generator hexadecimal \
    --string-array true \
    --string-array-encoding 'base64' \
    --string-array-threshold 0.75 \
    --rotate-string-array true \
    --shuffle-string-array true \
    --split-strings true \
    --split-strings-chunk-length 8 \
    --dead-code-injection false \
    2>/dev/null || warn "Could not obfuscate: $(basename $jsfile)"
  JS_COUNT=$((JS_COUNT + 1))
done < <(find backend/public/assets -name "*.js" -print0 2>/dev/null)
log "Obfuscated $JS_COUNT JS files"

# ── 4. Compile binary ────────────────────────────────────────────────────────
section "4/5 Compiling Backend to Binary"

info "Installing backend dependencies..."
npm install --omit=dev --silent
log "Backend dependencies installed"

info "Configuring PKG..."
node << 'JSEOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.pkg = {
  scripts: ["backend/**/*.js"],
  assets: [
    "backend/public/**/*",
    "backend/db/migrations/**",
    "node_modules/bcryptjs/**",
    "node_modules/pg/**"
  ],
  targets: ["node18-linux-x64"],
  outputPath: "dist/bin"
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('PKG config added');
JSEOF

mkdir -p dist/bin
info "Compiling to Linux x64 binary (3-10 minutes)..."
cd "$ROOT_DIR" && pkg backend/entrypoint.js \
  --targets node18-linux-x64 \
  --output "dist/bin/casesphere-server" \
  --compress GZip \
  2>&1 | grep -vE "^$|Warning: Cannot|bin not found|Cannot resolve" || true

node << 'JSEOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
delete pkg.pkg;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('package.json restored');
JSEOF

[[ ! -f "dist/bin/casesphere-server" ]] && \
  error "Binary compilation failed — check errors above"
chmod +x dist/bin/casesphere-server
BINARY_SIZE=$(du -sh dist/bin/casesphere-server | cut -f1)
log "Binary compiled: casesphere-server ($BINARY_SIZE)"

# ── 5. Assemble & Package ────────────────────────────────────────────────────
section "5/5 Assembling Package"

cp dist/bin/casesphere-server "$DIST_DIR/casesphere-server"
cp -r backend/public "$DIST_DIR/public"
cp install.sh "$DIST_DIR/install.sh"
cp Makefile   "$DIST_DIR/Makefile"
chmod +x "$DIST_DIR/install.sh"
log "Files assembled"

# .env.example — FREE (no ANTHROPIC, no MFA vars)
cat > "$DIST_DIR/.env.example" << 'ENVEOF'
# Case Sphere FREE — Configuration
# Installer akan generate ini secara otomatis

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=casesphere
POSTGRES_USER=cs_app
POSTGRES_PASSWORD=CHANGE_ME

POSTGRES_MIGRATE_USER=cs_migrate
POSTGRES_MIGRATE_PASSWORD=CHANGE_ME

JWT_SECRET=CHANGE_ME_MIN_64_CHARS_RANDOM_STRING
JWT_EXPIRES_IN=30m

NODE_ENV=production
PORT=3000
SERVER_DOMAIN=localhost

# VirusTotal (optional)
VIRUSTOTAL_API_KEY=

AUTH_RATE_LIMIT_MAX=20
ENVEOF
log ".env.example created"

cat > "$DIST_DIR/MANIFEST.txt" << MANIFESTEOF
Case Sphere FREE Edition v${VERSION}
Built   : $(date '+%Y-%m-%d %H:%M:%S')
Platform: Linux x64 | Node.js $(node -v) embedded

Features:
  + Case management, SIEM feed, VirusTotal, MITRE ATT&CK
  + SLA monitoring, Audit log, Users, API keys, Attachments
  - MFA, Multi-tenancy, AI Analysis, Report export (Pro only)

Install:
  sudo ./install.sh
MANIFESTEOF
log "MANIFEST.txt created"

info "Creating tarball..."
cd dist
tar -czf "${PKG_NAME}.tar.gz" "${PKG_NAME}/"
TARBALL_SIZE=$(du -sh "${PKG_NAME}.tar.gz" | cut -f1)
cd ..
rm -rf dist/bin

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   Case Sphere FREE Build Complete ✓                 ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Package : ${BOLD}dist/${PKG_NAME}.tar.gz${NC} ($TARBALL_SIZE)"
echo ""
echo -e "  ${BOLD}Upload ke GitHub Releases:${NC}"
echo -e "  https://github.com/shabrankhairi/casesphere-free/releases/new"
echo ""
echo -e "  ${BOLD}End-user install:${NC}"
echo -e "  wget https://github.com/shabrankhairi/casesphere-free/releases/download/v${VERSION}/${PKG_NAME}.tar.gz"
echo -e "  tar -xzf ${PKG_NAME}.tar.gz && cd ${PKG_NAME} && sudo ./install.sh"
echo ""
echo -e "  ${BOLD}Proteksi:${NC}"
echo -e "  ✓ Binary PKG — source tidak bisa dibaca"
echo -e "  ✓ Frontend JS — obfuscated"
echo ""
