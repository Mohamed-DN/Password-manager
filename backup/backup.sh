#!/bin/bash
# backup.sh
# Performs a logical backup of PostgreSQL and a Raft snapshot of Vault.
# Designed to be called from cron inside the backup container.
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (all overridable via environment variables)
# ---------------------------------------------------------------------------
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
PG_BACKUP_DIR="${BACKUP_ROOT}/postgres"
VAULT_BACKUP_DIR="${BACKUP_ROOT}/vault"
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

# ---------------------------------------------------------------------------
# 1. PostgreSQL — pg_dump (custom format, compressed)
# ---------------------------------------------------------------------------
log "Starting PostgreSQL backup of '${DB_NAME}' on ${DB_HOST}:${DB_PORT}..."

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
# 3. Retention — delete backups older than RETENTION_DAYS
# ---------------------------------------------------------------------------
log "Applying ${RETENTION_DAYS}-day retention policy..."

DELETED_PG=$(find "${PG_BACKUP_DIR}"    -name "pg_backup_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
DELETED_VT=$(find "${VAULT_BACKUP_DIR}" -name "vault_snapshot_*.snap" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)

log "Retention: removed ${DELETED_PG} PostgreSQL dump(s), ${DELETED_VT} Vault snapshot(s)."
log "Backup run complete."
