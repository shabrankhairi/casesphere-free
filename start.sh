#!/bin/bash
# Case Sphere FREE — Quick Start
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ ! -f .env ]; then
  echo -e "${YELLOW}[!]${NC} .env not found — creating from template..."
  cp .env.example .env
  JWT=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)
  DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
  sed -i "s/CHANGE_ME_MIN_64_CHARS_RANDOM_STRING/$JWT/" .env
  sed -i "s/CHANGE_ME_MIN_20_CHARS/$DB_PASS/" .env
  echo -e "${GREEN}[✓]${NC} .env generated with random secrets"
  echo ""
  echo "  Edit .env to add your VirusTotal API key (optional)"
  echo ""
fi

echo -e "${GREEN}[→]${NC} Starting Case Sphere FREE..."
docker compose -p casesphere-free up -d --build

echo ""
echo -e "${GREEN}[✓]${NC} Done! Open http://localhost in your browser"
echo "    Default login: admin@casesphere.local / Admin@1234!"
