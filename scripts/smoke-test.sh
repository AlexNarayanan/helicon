#!/usr/bin/env bash
# Builds the production image and verifies that /api/health returns 200.
# Starts only 'app' and 'postgres' (no Caddy) so no domain is needed.
# Uses a distinct project name to avoid volume collisions with the dev stack.
set -euo pipefail

COMPOSE_FILE="compose.prod.yml"
PROJECT="helicon-smoke"
APP_URL="http://localhost:3000/helicon/api/health"
MAX_TRIES=30

if command -v docker > /dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v podman > /dev/null 2>&1; then
  COMPOSE_CMD="podman compose"
else
  echo "Neither docker nor podman found."
  exit 1
fi

COMPOSE="$COMPOSE_CMD -p $PROJECT -f $COMPOSE_FILE"

cleanup() {
  $COMPOSE down -v 2>/dev/null || true
}
trap cleanup EXIT

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-smoke_pass}"
export SETLISTFM_API_KEY="${SETLISTFM_API_KEY:-smoke_key}"

echo "Building production image..."
$COMPOSE build

echo "Starting app and postgres..."
$COMPOSE up -d app postgres

echo "Waiting for app to be ready..."
for i in $(seq 1 $MAX_TRIES); do
  if curl -sf "$APP_URL" > /dev/null 2>&1; then
    echo "App is up (attempt $i)"
    break
  fi
  if [ "$i" -eq "$MAX_TRIES" ]; then
    echo "App did not start in time."
    $COMPOSE logs app
    exit 1
  fi
  sleep 2
done

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL")
if [ "$HTTP_CODE" != "200" ]; then
  echo "Health check failed: HTTP $HTTP_CODE"
  exit 1
fi

echo "Smoke test passed: /api/health returned 200."
