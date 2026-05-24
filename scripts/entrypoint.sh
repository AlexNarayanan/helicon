#!/bin/sh
set -e

echo "Running migrations and seed..."
node scripts/seed.mjs

echo "Starting Helicon..."
exec node build/index.js
