#!/bin/bash
# podman/deploy.sh
# ---------------------------------------------------------------------------
# Full first-deploy script for Nexi Vault on an OCI host using Podman.
#
# Run as root (or with sudo) on the OCI host:
#   sudo bash podman/deploy.sh
#
# What this script does:
#   1. Creates the persistent data directories under /opt/nexi-vault/
#   2. Copies config files to the expected host paths
#   3. Builds the three custom container images (openbao, backend, backup)
#   4. Starts all services via podman-compose (or systemd Quadlets if chosen)
#
# Prerequisites:
#   - Podman >= 4.0 installed
#   - podman-compose installed  (pip install podman-compose  OR  dnf install podman-compose)
#   - The repository cloned at the path referenced by REPO_DIR below
#   - .env file created from .env.example and edited with your values
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="/opt/nexi-vault"
LOG_PREFIX="[deploy]"
log() { echo "${LOG_PREFIX} $*"; }

# ---------------------------------------------------------------------------
# 0. Sanity checks
# ---------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (sudo bash podman/deploy.sh)." >&2
    exit 1
fi

for cmd in podman podman-compose; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: '$cmd' not found. Install it first:" >&2
        echo "  dnf install podman   (for Podman)" >&2
        echo "  pip install podman-compose   (for podman-compose)" >&2
        exit 1
    fi
done

if [ ! -f "$REPO_DIR/.env" ]; then
    echo "ERROR: .env file not found. Create it from .env.example:" >&2
    echo "  cp $REPO_DIR/.env.example $REPO_DIR/.env && \$EDITOR $REPO_DIR/.env" >&2
    exit 1
fi

log "Repository: $REPO_DIR"
log "Data root:  $BASE_DIR"

# ---------------------------------------------------------------------------
# 1. Create persistent data directories
# ---------------------------------------------------------------------------
log "Creating data directories..."
mkdir -p \
    "${BASE_DIR}/data/postgres" \
    "${BASE_DIR}/data/postgres-replica" \
    "${BASE_DIR}/data/postgres-wal" \
    "${BASE_DIR}/data/vault" \
    "${BASE_DIR}/data/vault-init" \
    "${BASE_DIR}/backups/postgres" \
    "${BASE_DIR}/backups/vault" \
    "${BASE_DIR}/ssh"

# Postgres data dirs must be owned by UID 999 (postgres user inside the container)
chown -R 999:999 \
    "${BASE_DIR}/data/postgres" \
    "${BASE_DIR}/data/postgres-replica" \
    "${BASE_DIR}/data/postgres-wal"

# Vault data dir must be owned by UID 100 (vault user inside openbao image)
chown -R 100:100 \
    "${BASE_DIR}/data/vault" \
    "${BASE_DIR}/data/vault-init"

chmod 700 "${BASE_DIR}/data/vault-init"
log "Data directories created."

# ---------------------------------------------------------------------------
# 2. Restore SELinux file contexts (only on SELinux-enabled systems)
# ---------------------------------------------------------------------------
if command -v restorecon &>/dev/null && sestatus 2>/dev/null | grep -q "enabled"; then
    log "Restoring SELinux contexts on ${BASE_DIR}..."
    restorecon -R "${BASE_DIR}" 2>/dev/null || true
    # Allow containers to read/write the data directories
    chcon -Rt container_file_t "${BASE_DIR}" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 3. Build custom container images
# ---------------------------------------------------------------------------
log "Building custom images..."
cd "$REPO_DIR"

podman build -t localhost/inventory-bao:latest    ./vault
podman build -t localhost/inventory-api:latest    ./backend
podman build -t localhost/inventory-backup:latest ./backup

log "Images built:"
podman images | grep -E "inventory-(bao|api|backup)" || true

# ---------------------------------------------------------------------------
# 4. Pull standard images to avoid pulling during startup
# ---------------------------------------------------------------------------
log "Pulling base images..."
podman pull docker.io/postgres:16-alpine
podman pull docker.io/node:22-alpine

# ---------------------------------------------------------------------------
# 5. Start all services via podman-compose
# ---------------------------------------------------------------------------
log "Starting services..."
cd "$REPO_DIR"
podman-compose -f podman-compose.yml up -d

# ---------------------------------------------------------------------------
# 6. Wait for OpenBao to become healthy and show the init file location
# ---------------------------------------------------------------------------
log "Waiting for OpenBao to initialise (this can take up to 60 seconds)..."
for i in $(seq 1 30); do
    STATUS=$(podman inspect inventory-bao \
        --format '{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
    if [ "$STATUS" = "healthy" ]; then
        log "OpenBao is healthy."
        break
    fi
    sleep 3
done

# ---------------------------------------------------------------------------
# 7. Show critical post-deploy information
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo " DEPLOY COMPLETE — IMPORTANT INFORMATION"
echo "============================================================"
echo ""
echo " Vault init file (UNSEAL KEYS + ROOT TOKEN):"
echo "   podman exec inventory-bao cat /vault/init/init.json"
echo ""
echo " BACK THIS FILE UP IMMEDIATELY:"
echo "   podman exec inventory-bao cat /vault/init/init.json > \\"
echo "     /opt/nexi-vault/data/vault-init/init.json"
echo "   chmod 600 /opt/nexi-vault/data/vault-init/init.json"
echo ""
echo " Service status:"
podman ps --format "table {{.Names}}\t{{.Status}}"
echo ""
echo " Frontend:  http://$(hostname -I | awk '{print $1}'):5173"
echo " Backend:   http://$(hostname -I | awk '{print $1}'):8000/docs"
echo " OpenBao:   http://$(hostname -I | awk '{print $1}'):8200"
echo ""
echo " Next steps:"
echo "   1. Run:  sudo bash podman/setup-offsite-ssh.sh"
echo "      to configure automated backups to oemdb1."
echo "   2. Read: docs/PODMAN_PRODUCTION_GUIDE.md"
echo "============================================================"
