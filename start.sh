#!/bin/bash
set -e

echo "IT Dashboard — iniciando..."

# Run migrations on startup
npx prisma migrate deploy 2>/dev/null || true

npm run dev:all
