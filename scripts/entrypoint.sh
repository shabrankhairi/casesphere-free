#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL..."
until node -e "
  const {Pool}=require('pg');
  const p=new Pool({host:process.env.POSTGRES_HOST,port:process.env.POSTGRES_PORT,database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD});
  p.query('SELECT 1').then(()=>{p.end();process.exit(0)}).catch(()=>{p.end();process.exit(1)})
" 2>/dev/null; do
  echo "    not ready, retrying in 2s..."
  sleep 2
done

echo "==> Running migrations..."
node backend/db/migrate.js

echo "==> Seeding (skips if data exists)..."
node backend/db/seed.js

echo "==> Starting server..."
exec node backend/server.js
