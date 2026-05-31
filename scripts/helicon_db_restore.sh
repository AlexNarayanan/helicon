#!/bin/bash
set -euo pipefail

# ==============================================================
# Helicon Database Restore Script
# Restores the PostgreSQL database from a backup file.
#
# Usage:
#   helicon_db_restore.sh <dev|prod> [backup-file]
#
# Args:
#   $1  Mode: "dev" or "prod" (required)
#   $2  Path to local backup file (optional)
#       If omitted, downloads helicon-<mode>-latest.dump from Google Drive.
#
# Env vars (all optional):
#   HELICON_REPO_DIR            Path to the helicon repo (default: ~/Repos/helicon)
#   HELICON_RCLONE_SOURCE       rclone source path (default: gdrive:backups/helicon)
#   HELICON_POSTGRES_CONTAINER  Podman container name for prod postgres
#                               (default: auto-detected via podman ps)
#
# WARNING: Stop the app before restoring to avoid conflicts:
#   podman compose -f compose.prod.yml down  (then up after restore)
# ==============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
confirm() { read -rp "$1 [y/N]: " r; [[ "$r" =~ ^[Yy]$ ]]; }

# ---- config: no secrets here, all from env vars or args ----
REPO_DIR="${HELICON_REPO_DIR:-$HOME/Repos/helicon}"
RCLONE_SOURCE="${HELICON_RCLONE_SOURCE:-gdrive:backups/helicon}"
# ------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  error "Usage: $0 <dev|prod> [backup-file]"
fi

MODE="$1"
[[ "$MODE" == "dev" || "$MODE" == "prod" ]] || error "Unknown mode '$MODE'. Use 'dev' or 'prod'."

if [[ $# -ge 2 ]]; then
  BACKUP_FILE="$2"
  DOWNLOADED=false
else
  BACKUP_FILE="/tmp/helicon-${MODE}-latest.dump"
  DOWNLOADED=true
fi

SAFETY_FILE="/tmp/helicon-${MODE}-pre-restore.dump"

# ============================================================
# Preflight checks
# ============================================================

if [[ "$DOWNLOADED" == true ]] && ! command -v rclone &>/dev/null; then
  error "rclone is not installed. Run: sudo apt install rclone, then configure a remote with: rclone config"
fi

# ============================================================
# Download from Google Drive (if no local file provided)
# ============================================================

if [[ "$DOWNLOADED" == true ]]; then
  REMOTE_FILE="${RCLONE_SOURCE}/$(basename "$BACKUP_FILE")"
  info "Downloading backup from: $REMOTE_FILE"
  rclone copy "$REMOTE_FILE" /tmp/
  chmod 600 "$BACKUP_FILE"
fi

[[ -f "$BACKUP_FILE" ]] || error "Backup file not found: $BACKUP_FILE"

# ============================================================
# Confirm
# ============================================================

echo ""
warn "This will overwrite the $MODE database."
warn "  Source : $BACKUP_FILE"
echo ""
confirm "Proceed?" || {
  info "Aborted."
  [[ "$DOWNLOADED" == true ]] && rm -f "$BACKUP_FILE"
  exit 0
}

# ============================================================
# Safety copy of current DB
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

    info "Saving safety copy to: $SAFETY_FILE"
    pg_dump "$DB_URL" -Fc -f "$SAFETY_FILE"
    chmod 600 "$SAFETY_FILE"

    info "Restoring dev database..."
    pg_restore -d "$DB_URL" --clean --if-exists "$BACKUP_FILE"
    ;;

  prod)
    CONTAINER="${HELICON_POSTGRES_CONTAINER:-$(podman ps --format '{{.Names}}' | grep postgres | head -1 || true)}"
    [[ -n "$CONTAINER" ]] || error "No postgres container found. Is helicon running? Set HELICON_POSTGRES_CONTAINER to override."

    info "Saving safety copy from container $CONTAINER to: $SAFETY_FILE"
    podman exec "$CONTAINER" pg_dump -U helicon -d helicon -Fc > "$SAFETY_FILE"
    chmod 600 "$SAFETY_FILE"

    info "Restoring prod database..."
    podman cp "$BACKUP_FILE" "${CONTAINER}:/tmp/helicon-restore.dump"
    podman exec "$CONTAINER" pg_restore -U helicon -d helicon --clean --if-exists /tmp/helicon-restore.dump
    podman exec "$CONTAINER" rm /tmp/helicon-restore.dump
    ;;
esac

[[ "$DOWNLOADED" == true ]] && rm -f "$BACKUP_FILE"

info "Restore complete."
info "Pre-restore backup retained at: $SAFETY_FILE"
