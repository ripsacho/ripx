#!/usr/bin/env bash
# Run this on the server from the project root after git pull.
# Usage: ./scripts/deploy-production.sh
# Ensure .env exists and is configured before running.

set -e
cd "$(dirname "$0")/.."

echo "=== RipX production deploy ==="

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and set variables."
  exit 1
fi

echo "[1/4] Installing dependencies..."
npm ci
(cd frontend && npm ci)

echo "[2/4] Building frontend..."
export NODE_ENV=production
npm run build

echo "[3/4] Running database migrations..."
npm run migrate

echo "[4/4] Super admin"
if [ -t 0 ] && [ -t 1 ]; then
  echo "  If first deploy, run: npm run ensure-superadmin"
  echo "  (Set RIPX_SUPERADMIN_EMAIL or RIPX_ADMIN_EMAIL in .env first.)"
  read -p "Run ensure-superadmin now? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run ensure-superadmin
  fi
else
  echo "  Skipping interactive ensure-superadmin. Run manually: npm run ensure-superadmin"
fi

echo "=== Deploy complete ==="
echo "Start app with: NODE_ENV=production npm start"
echo "Or with PM2: NODE_ENV=production pm2 start backend/src/app.js --name ripx && pm2 save"
echo "Health check: curl -s http://localhost:${PORT:-3000}/api/health"
echo ""
echo "Shopify (separate from this script): after .env changes for checkout price, run from repo root:"
echo "  npm run shopify:checkout-discount:sync-config && npm run shopify:checkout-discount:build"
echo "  shopify app deploy   # publishes theme + checkout discount extensions with the linked app"
