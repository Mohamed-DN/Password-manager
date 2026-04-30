#!/bin/bash
# backup.sh
# Performs a logical backup of PostgreSQL and a Raft snapshot of Vault.
# Designed to be called from cron inside the backup container (daily at 02:00).
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (all overridable via environment variables)
# ---------------------------------------------------------------------------
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
PG_BACKUP_DIR="${BACKUP_ROOT}/postgres"
VAULT_BACKUP_DIR="${BACKUP_ROOT}/vault"
# Local retention: keep this many daily backups on the container volume.
# Default: 7 (one week).  Offsite (oemdb1) keeps 30 days — see offsite-copy.sh.
RETENTION_DAYS="${RETENTION_DAYS:-7}"

DB_HOST="${DB_HOST:-inventory-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-inventory_app}"
DB_PASSWORD="${DB_PASSWORD:-PasswordBackend123!}"
DB_NAME="${DB_NAME:-vault_inventory_db}"

VAULT_ADDR="${VAULT_ADDR:-http://inventory-bao:8200}"
VAULT_INIT_FILE="${VAULT_INIT_FILE:-/vault/init/init.json}"

LOG_PREFIX="[backup][${DATE}]"

# ---------------------------------------------------------------------------
# Helper: log with timestamp
# ---------------------------------------------------------------------------
log() { echo "${LOG_PREFIX} $*"; }

log "===== Daily backup started ====="

# ---------------------------------------------------------------------------
# 1. PostgreSQL — pg_dump (custom format, max compression)
# ---------------------------------------------------------------------------
log "Starting PostgreSQL backup of '${DB_NAME}' on ${DB_HOST}:${DB_PORT}..."

mkdir -p "${PG_BACKUP_DIR}"
PG_DUMP_FILE="${PG_BACKUP_DIR}/pg_backup_${DATE}.dump"

PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=custom \
    --compress=9 \
    --file="${PG_DUMP_FILE}"

PG_SIZE=$(du -sh "${PG_DUMP_FILE}" | cut -f1)
log "PostgreSQL backup saved: ${PG_DUMP_FILE} (${PG_SIZE})"

# ---------------------------------------------------------------------------
# 2. Vault — Raft snapshot
# ---------------------------------------------------------------------------
log "Starting Vault Raft snapshot from ${VAULT_ADDR}..."

mkdir -p "${VAULT_BACKUP_DIR}"

if [ ! -f "${VAULT_INIT_FILE}" ]; then
    log "WARNING: Vault init file not found at ${VAULT_INIT_FILE}. Skipping Vault snapshot."
else
    VAULT_TOKEN=$(jq -r '.root_token' "${VAULT_INIT_FILE}")

    SNAP_FILE="${VAULT_BACKUP_DIR}/vault_snapshot_${DATE}.snap"

    VAULT_TOKEN="${VAULT_TOKEN}" vault operator raft snapshot save \
        -address="${VAULT_ADDR}" \
        "${SNAP_FILE}"

    SNAP_SIZE=$(du -sh "${SNAP_FILE}" | cut -f1)
    log "Vault snapshot saved: ${SNAP_FILE} (${SNAP_SIZE})"
fi

# ---------------------------------------------------------------------------
# 3. Local retention — delete backups older than RETENTION_DAYS
#    Offsite retention (30 days on oemdb1) is managed by offsite-copy.sh.
# ---------------------------------------------------------------------------
log "Applying ${RETENTION_DAYS}-day local retention policy..."

DELETED_PG=$(find "${PG_BACKUP_DIR}"    -name "pg_backup_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
DELETED_VT=$(find "${VAULT_BACKUP_DIR}" -name "vault_snapshot_*.snap" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)

log "Local retention: removed ${DELETED_PG} PostgreSQL dump(s), ${DELETED_VT} Vault snapshot(s)."

# ---------------------------------------------------------------------------
# 4. Summary
# ---------------------------------------------------------------------------
log "Local backups currently on disk:"
log "  PostgreSQL: $(ls "${PG_BACKUP_DIR}"/pg_backup_*.dump 2>/dev/null | wc -l) file(s)"
log "  Vault:      $(ls "${VAULT_BACKUP_DIR}"/vault_snapshot_*.snap 2>/dev/null | wc -l) file(s)"
log "===== Daily backup complete ====="
