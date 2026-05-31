#!/bin/bash
set -euo pipefail

# ==============================================================
# Helicon Database Backup Script
# Backs up the PostgreSQL database to Google Drive via rclone.
#
# Usage:
#   helicon_db_backup.sh <dev|prod> [rclone-destination]
#
# Args:
#   $1  Mode: "dev" or "prod" (required)
#   $2  rclone destination path (optional)
#       e.g. gdrive:backups/helicon
#
# Env vars (all optional):
#   HELICON_REPO_DIR          Path to the helicon repo (default: ~/Repos/helicon)
#   HELICON_RCLONE_DEST       rclone destination (default: gdrive:backups/helicon)
#   HELICON_POSTGRES_CONTAINER  Podman container name for prod postgres
#                               (default: auto-detected via podman ps)
#
# First-time setup:
#   1. sudo apt install rclone postgresql-client
#   2. rclone config  (create a remote named "gdrive" for Google Drive)
#   3. Test: bash helicon_db_backup.sh dev
#
# Cron example (weekly, Sundays at 02:00):
#   0 2 * * 0 /home/anarayanan/Repos/helicon/scripts/helicon_db_backup.sh prod
# ==============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- config: no secrets here, all from env vars or args ----
REPO_DIR="${HELICON_REPO_DIR:-$HOME/Repos/helicon}"
RCLONE_DEST="${2:-${HELICON_RCLONE_DEST:-gdrive:backups/helicon}}"
# ------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  error "Usage: $0 <dev|prod> [rclone-destination]"
fi

MODE="$1"
[[ "$MODE" == "dev" || "$MODE" == "prod" ]] || error "Unknown mode '$MODE'. Use 'dev' or 'prod'."

TMP_FILE="/tmp/helicon-${MODE}-latest.dump"
trap 'rm -f "$TMP_FILE"' EXIT

# ============================================================
# Preflight checks
# ============================================================

info "Checking dependencies..."

if ! command -v rclone &>/dev/null; then
  error "rclone is not installed. Run: sudo apt install rclone, then configure a remote with: rclone config"
fi

# ============================================================
# Dump
# ============================================================

case "$MODE" in
  dev)
    if ! command -v pg_dump &>/dev/null; then
      error "pg_dump is not installed. Run: sudo apt install postgresql-client"
    fi

    ENV_FILE="$REPO_DIR/.env"
    [[ -f "$ENV_FILE" ]] || error "No .env file found at: $ENV_FILE"

    DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
    [[ -n "$DB_URL" ]] || error "DATABASE_URL not found in $ENV_FILE"

    info "Backing up dev database..."
    pg_dump "$DB_URL" -Fc -f "$TMP_FILE"
    ;;

  prod)
    CONTAINER="${HELICON_POSTGRES_CONTAINER:-$(podman ps --format '{{.Names}}' | grep postgres | head -1 || true)}"
    [[ -n "$CONTAINER" ]] || error "No postgres container found. Is helicon running? Set HELICON_POSTGRES_CONTAINER to override."

    info "Backing up prod database from container: $CONTAINER"
    podman exec "$CONTAINER" pg_dump -U helicon -d helicon -Fc > "$TMP_FILE"
    ;;
esac

chmod 600 "$TMP_FILE"
info "Backup written to: $TMP_FILE"

# ============================================================
# Sync to Google Drive
# ============================================================

info "Syncing to: $RCLONE_DEST"

if rclone copy "$TMP_FILE" "$RCLONE_DEST"; then
  info "Backup complete."
  info "Remote: ${RCLONE_DEST}/$(basename "$TMP_FILE")"
else
  error "rclone copy failed."
fi
