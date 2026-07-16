#!/bin/bash
# podman/setup-offsite-ssh.sh
# ---------------------------------------------------------------------------
# Generates an SSH key pair for the backup container and installs the public
# key on the oemdb1 gateway server so that rsync can run without a password.
#
# Run once on the OCI host:
#   sudo bash podman/setup-offsite-ssh.sh
#
# Prerequisites:
#   - You must be able to SSH to oemdb1 as a user with sudo rights
#     (to create the 'backup' account and authorise the key)
#   - The 'backup' user must exist (or this script will create it) on oemdb1
# ---------------------------------------------------------------------------
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override with environment variables if needed
# ---------------------------------------------------------------------------
OFFSITE_HOST="${OFFSITE_HOST:-oemdb1}"
OFFSITE_PORT="${OFFSITE_PORT:-22}"
OFFSITE_USER="${OFFSITE_USER:-backup}"
OFFSITE_PATH="${OFFSITE_PATH:-/backup/m-dn-vault-backups}"
SSH_KEY_DIR="/opt/m-dn-vault/ssh"
SSH_KEY_FILE="${SSH_KEY_DIR}/id_rsa"
KNOWN_HOSTS_FILE="${SSH_KEY_DIR}/known_hosts"

log() { echo "[setup-offsite-ssh] $*"; }

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Run as root (sudo bash podman/setup-offsite-ssh.sh)." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 1. Create the SSH key directory on the OCI host
# ---------------------------------------------------------------------------
mkdir -p "$SSH_KEY_DIR"
chmod 700 "$SSH_KEY_DIR"

# ---------------------------------------------------------------------------
# 2. Generate an ed25519 key pair (no passphrase — used by the cron job)
# ---------------------------------------------------------------------------
if [ -f "$SSH_KEY_FILE" ]; then
    log "SSH key already exists at $SSH_KEY_FILE — skipping generation."
else
    log "Generating SSH key at $SSH_KEY_FILE ..."
    ssh-keygen -t ed25519 \
        -f "$SSH_KEY_FILE" \
        -N "" \
        -C "m-dn-vault-backup@$(hostname -s)"
    chmod 600 "$SSH_KEY_FILE"
    log "SSH key generated."
fi

PUB_KEY=$(cat "${SSH_KEY_FILE}.pub")
log "Public key: $PUB_KEY"

# ---------------------------------------------------------------------------
# 3. Capture the host fingerprint for known_hosts (strict host verification)
# ---------------------------------------------------------------------------
log "Capturing host fingerprint of ${OFFSITE_HOST}:${OFFSITE_PORT} ..."
ssh-keyscan -p "$OFFSITE_PORT" "$OFFSITE_HOST" > "$KNOWN_HOSTS_FILE" 2>/dev/null
chmod 644 "$KNOWN_HOSTS_FILE"
log "known_hosts written to $KNOWN_HOSTS_FILE"

# ---------------------------------------------------------------------------
# 4. Install the public key on oemdb1
#    This step requires interactive SSH access — you will be prompted for
#    your password once.
# ---------------------------------------------------------------------------
log "Installing public key on ${OFFSITE_USER}@${OFFSITE_HOST}:${OFFSITE_PORT} ..."
log "(You may be asked for the 'backup' user password, or your own if using sudo)"

# Create the backup user and directory on the remote host, then authorise key
ssh -p "$OFFSITE_PORT" "${OFFSITE_USER}@${OFFSITE_HOST}" bash -s <<REMOTE_EOF
set -e
mkdir -p ${OFFSITE_PATH}/postgres ${OFFSITE_PATH}/vault ${OFFSITE_PATH}/vault-init
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "${PUB_KEY}" >> ~/.ssh/authorized_keys
sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "Key installed successfully."
REMOTE_EOF

# ---------------------------------------------------------------------------
# 5. Test the connection
# ---------------------------------------------------------------------------
log "Testing passwordless SSH connection..."
if ssh -p "$OFFSITE_PORT" \
       -i "$SSH_KEY_FILE" \
       -o BatchMode=yes \
       -o StrictHostKeyChecking=yes \
       -o UserKnownHostsFile="$KNOWN_HOSTS_FILE" \
       -o ConnectTimeout=10 \
       "${OFFSITE_USER}@${OFFSITE_HOST}" "echo OK"; then
    log "SSH connection test PASSED."
else
    log "SSH connection test FAILED. Check the key installation on oemdb1." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 6. Print the volume mounts to add to podman-compose.yml / quadlet
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo " SSH SETUP COMPLETE"
echo "============================================================"
echo ""
echo " Add these volume mounts to the 'backup' service in"
echo " podman-compose.yml (uncomment the two commented lines):"
echo ""
echo "   - ${SSH_KEY_FILE}:/root/.ssh/id_rsa:z,ro"
echo "   - ${KNOWN_HOSTS_FILE}:/root/.ssh/known_hosts:z,ro"
echo ""
echo " Then set OFFSITE_SSH_KNOWN_HOSTS=/root/.ssh/known_hosts in .env"
echo " and restart the backup container:"
echo ""
echo "   podman-compose -f podman-compose.yml up -d --no-deps backup"
echo "============================================================"
