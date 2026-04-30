#!/bin/sh
# vault/entrypoint.sh
# Starts the Vault server, initialises it on first boot, and automatically
# unseals it on every subsequent start. The generated init data (unseal keys
# and root token) is persisted in /vault/init/init.json (mounted as a volume).
set -e

VAULT_ADDR="http://127.0.0.1:8200"
INIT_FILE="/vault/init/init.json"
CONFIG_FILE="/vault/config/vault.hcl"

# --------------------------------------------------------------------------
# 1. Start vault server in the background
# --------------------------------------------------------------------------
echo "==> [vault-entrypoint] Starting Vault server (Raft storage)..."
vault server -config="$CONFIG_FILE" &
VAULT_PID=$!

# ---------------------------------------------------------------------------
# 2. Wait for the HTTP listener to become available
# ---------------------------------------------------------------------------
echo "==> [vault-entrypoint] Waiting for Vault to accept connections..."
until vault status -address="$VAULT_ADDR" > /dev/null 2>&1 || \
      vault status -address="$VAULT_ADDR" 2>&1 | grep -q "Sealed\|Initialized"; do
    sleep 1
done
echo "==> [vault-entrypoint] Vault listener is up."

# --------------------------------------------------------------------------
# 3. Initialise on first boot (creates unseal keys + root token)
# --------------------------------------------------------------------------
INITIALIZED=$(vault status -address="$VAULT_ADDR" -format=json 2>/dev/null \
              | jq -r '.initialized // "false"')

if [ "$INITIALIZED" = "false" ]; then
    echo "==> [vault-entrypoint] First boot detected — initialising Vault..."
    vault operator init \
        -address="$VAULT_ADDR" \
        -key-shares=5 \
        -key-threshold=3 \
        -format=json > "$INIT_FILE"
    chmod 600 "$INIT_FILE"
    echo "==> [vault-entrypoint] Vault initialised. Keys written to $INIT_FILE"
fi

# --------------------------------------------------------------------------
# 4. Unseal if sealed (every restart seals the vault)
# --------------------------------------------------------------------------
SEALED=$(vault status -address="$VAULT_ADDR" -format=json 2>/dev/null \
         | jq -r '.sealed // "true"')

if [ "$SEALED" = "true" ]; then
    echo "==> [vault-entrypoint] Vault is sealed — unsealing with stored keys..."
    for i in 0 1 2; do
        KEY=$(jq -r ".unseal_keys_b64[$i]" "$INIT_FILE")
        vault operator unseal -address="$VAULT_ADDR" "$KEY"
    done
    echo "==> [vault-entrypoint] Vault unsealed."
fi

# --------------------------------------------------------------------------
# 5. Enable the KV v2 secrets engine at 'secret/' (idempotent)
# --------------------------------------------------------------------------
ROOT_TOKEN=$(jq -r '.root_token' "$INIT_FILE")
export VAULT_TOKEN="$ROOT_TOKEN"

# Check if the KV engine is already mounted; if not, enable it.
if VAULT_TOKEN="$ROOT_TOKEN" vault secrets list -address="$VAULT_ADDR" 2>/dev/null | grep -q "^secret/"; then
    echo "==> [vault-entrypoint] KV-v2 engine already mounted at 'secret/'."
elif VAULT_TOKEN="$ROOT_TOKEN" vault secrets enable \
         -address="$VAULT_ADDR" \
         -version=2 \
         -path=secret kv 2>/dev/null; then
    echo "==> [vault-entrypoint] KV-v2 engine enabled at 'secret/'."
else
    echo "==> [vault-entrypoint] WARNING: could not enable KV-v2 engine (it may already exist or a snapshot was restored). Continuing."
fi

echo "==> [vault-entrypoint] Vault is ready."

# --------------------------------------------------------------------------
# 6. Keep container alive (hand control back to the vault process)
# --------------------------------------------------------------------------
wait $VAULT_PID
