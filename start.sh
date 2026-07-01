#!/bin/bash
set -e

echo "WatchIT Tower — iniciando..."

# Apply pending migrations before starting the server
npx prisma migrate deploy 2>/dev/null || true

npm run start
