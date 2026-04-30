#!/bin/bash
# backup/offsite-copy.sh
# Copies all backup artefacts to oemdb1 via rsync over SSH and prunes files
# older than OFFSITE_RETENTION_DAYS on the remote (default: 30 days).
# This is the CRITICAL step that makes recovery possible after a total host crash.
#
# Environment variables (all optional — script is a no-op when OFFSITE_HOST is unset):
#
#   OFFSITE_HOST              Remote hostname or IP (e.g. oemdb1)
#   OFFSITE_PORT              SSH port on the remote host (default: 22)
#   OFFSITE_USER              SSH user on the remote host (default: backup)
#   OFFSITE_PATH              Remote destination directory
#                             (default: /backup/nexi-vault-backups)
#   OFFSITE_SSH_KEY           Path to the SSH private key inside this container
#                             (default: /root/.ssh/id_rsa)
#   OFFSITE_RETENTION_DAYS    Days to keep files on the remote host (default: 30)
#   BACKUP_ROOT               Local backup root (default: /backups)
#   VAULT_INIT_FILE           Path to the Vault init file
#
# Usage:
#   Called automatically from crontab after each daily backup run.
#   Can also be run manually:
#       podman exec inventory-backup /usr/local/bin/offsite-copy.sh
set -euo pipefail

LOG_DATE=$(date +%Y%m%d_%H%M%S)
LOG_PREFIX="[offsite-copy][${LOG_DATE}]"
log() { echo "${LOG_PREFIX} $*"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OFFSITE_HOST="${OFFSITE_HOST:-}"
OFFSITE_PORT="${OFFSITE_PORT:-22}"
OFFSITE_USER="${OFFSITE_USER:-backup}"
OFFSITE_PATH="${OFFSITE_PATH:-/backup/nexi-vault-backups}"
OFFSITE_SSH_KEY="${OFFSITE_SSH_KEY:-/root/.ssh/id_rsa}"
# Keep 30 days of backups on oemdb1 (40 TB available — plenty of headroom)
OFFSITE_RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-30}"
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
VAULT_INIT_FILE="${VAULT_INIT_FILE:-/vault/init/init.json}"

# ---------------------------------------------------------------------------
# Guard: do nothing if OFFSITE_HOST is not configured
# ---------------------------------------------------------------------------
if [ -z "${OFFSITE_HOST}" ]; then
    log "OFFSITE_HOST is not set — skipping offsite copy. Configure it to enable DR backups."
    exit 0
fi

log "Starting offsite copy to ${OFFSITE_USER}@${OFFSITE_HOST}:${OFFSITE_PATH} ..."

# ---------------------------------------------------------------------------
# SSH options
# ---------------------------------------------------------------------------
if [ -n "${OFFSITE_SSH_KNOWN_HOSTS:-}" ] && [ -f "${OFFSITE_SSH_KNOWN_HOSTS}" ]; then
    STRICT_CHECK="yes"
    KNOWN_HOSTS_OPT="-o UserKnownHostsFile=${OFFSITE_SSH_KNOWN_HOSTS}"
    log "Using pre-populated known_hosts from ${OFFSITE_SSH_KNOWN_HOSTS}."
else
    STRICT_CHECK="no"
    KNOWN_HOSTS_OPT=""
    log "WARNING: OFFSITE_SSH_KNOWN_HOSTS not set — StrictHostKeyChecking disabled." \
        "Set OFFSITE_SSH_KNOWN_HOSTS to a known_hosts file to harden this connection."
fi

SSH_OPTS="-i ${OFFSITE_SSH_KEY} -p ${OFFSITE_PORT} \
  -o StrictHostKeyChecking=${STRICT_CHECK} \
  ${KNOWN_HOSTS_OPT} \
  -o BatchMode=yes \
  -o ConnectTimeout=30"

RSYNC_CMD="rsync -az --no-perms \
  -e \"ssh ${SSH_OPTS}\" \
  --timeout=120"

# ---------------------------------------------------------------------------
# 1. Copy PostgreSQL dumps
# ---------------------------------------------------------------------------
log "Copying PostgreSQL backups ..."
eval "${RSYNC_CMD}" \
    "${BACKUP_ROOT}/postgres/" \
    "${OFFSITE_USER}@${OFFSITE_HOST}:${OFFSITE_PATH}/postgres/"
log "PostgreSQL backups copied."

# ---------------------------------------------------------------------------
# 2. Copy Vault Raft snapshots
# ---------------------------------------------------------------------------
log "Copying Vault snapshots ..."
eval "${RSYNC_CMD}" \
    "${BACKUP_ROOT}/vault/" \
    "${OFFSITE_USER}@${OFFSITE_HOST}:${OFFSITE_PATH}/vault/"
log "Vault snapshots copied."

# ---------------------------------------------------------------------------
# 3. Copy vault_init/init.json  ← THE MOST CRITICAL FILE
#    Without this file the unseal keys are lost and Vault cannot be unsealed.
# ---------------------------------------------------------------------------
if [ -f "${VAULT_INIT_FILE}" ]; then
    log "Copying Vault init file (unseal keys + root token) ..."
    REMOTE_INIT="${OFFSITE_PATH}/vault-init/init_${LOG_DATE}.json"
    eval "ssh ${SSH_OPTS} ${OFFSITE_USER}@${OFFSITE_HOST} \
        'mkdir -p $(dirname ${REMOTE_INIT})'"
    eval "scp ${SSH_OPTS} ${VAULT_INIT_FILE} \
        ${OFFSITE_USER}@${OFFSITE_HOST}:${REMOTE_INIT}"
    # Keep only the latest init.json as a fixed filename for easy recovery
    eval "ssh ${SSH_OPTS} ${OFFSITE_USER}@${OFFSITE_HOST} \
        'cp ${REMOTE_INIT} ${OFFSITE_PATH}/vault-init/init.json'"
    log "Vault init file copied to ${REMOTE_INIT} (and as init.json)."
else
    log "WARNING: Vault init file not found at ${VAULT_INIT_FILE}. Skipping."
fi

# ---------------------------------------------------------------------------
# 4. Remote retention — remove files older than OFFSITE_RETENTION_DAYS on oemdb1
#    oemdb1 has 40 TB; 30 daily backups of a password manager is well under 1 GB.
# ---------------------------------------------------------------------------
log "Applying ${OFFSITE_RETENTION_DAYS}-day remote retention on ${OFFSITE_HOST}..."

eval "ssh ${SSH_OPTS} ${OFFSITE_USER}@${OFFSITE_HOST}" <<REMOTE
set -e
# PostgreSQL dumps
find ${OFFSITE_PATH}/postgres -name "pg_backup_*.dump"   -mtime +${OFFSITE_RETENTION_DAYS} -delete 2>/dev/null || true
# Vault snapshots
find ${OFFSITE_PATH}/vault    -name "vault_snapshot_*.snap" -mtime +${OFFSITE_RETENTION_DAYS} -delete 2>/dev/null || true
# Dated init.json copies (keep the fixed init.json always)
find ${OFFSITE_PATH}/vault-init -name "init_*.json"      -mtime +${OFFSITE_RETENTION_DAYS} -delete 2>/dev/null || true
echo "Remote retention applied."
REMOTE

log "Remote retention complete."
log "Offsite copy complete."
