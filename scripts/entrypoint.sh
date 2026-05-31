#!/bin/sh
set -e

echo "Waiting for postgres..."
until nc -z postgres 5432; do
  sleep 1
done

echo "Running migrations and seed..."
node scripts/seed.mjs

echo "Starting Helicon..."
exec node build/index.js
