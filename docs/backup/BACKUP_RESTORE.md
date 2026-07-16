# Backup & Restore Guide

This document explains the backup strategy implemented for M-DN Vault and provides step-by-step restore procedures.

---

## Architecture Overview

| Component | Strategy | Frequency | Retention |
|---|---|---|---|
| PostgreSQL | Logical dump (`pg_dump`) + WAL archive | Every hour | 7 days |
| PostgreSQL | Streaming hot-standby replica | Continuous | Real-time |
| OpenBao (Vault) | Raft snapshot (`vault operator raft snapshot`) | Every hour | 7 days |

---

## Storage Layout

Backups are written to the Podman volume `backups_data`, mounted at `/backups` inside the `backup` container:

```
/backups/
├── postgres/
│   └── pg_backup_YYYYMMDD_HHMMSS.dump   (pg_dump custom-format)
└── vault/
    └── vault_snapshot_YYYYMMDD_HHMMSS.snap  (Raft binary snapshot)
```

Vault unseal keys and root token are stored in the `vault_init` Podman volume, mounted at `/vault/init/init.json`. **Back up this file separately and keep it in a secure location (e.g. an encrypted offline vault).**

---

## PostgreSQL Restore

### Option A — Restore from pg_dump (point-in-time logical restore)

Use this when you need to roll back to a specific backup file.

```bash
# 1. Identify the backup file you want to restore
podman exec inventory-backup ls /backups/postgres/

# 2. Drop and recreate the database (run from the postgres primary container)
podman exec -it inventory-db bash -c \
  "PGPASSWORD="" dropdb -U postgres vault_inventory_db && \
   PGPASSWORD="" createdb -U postgres vault_inventory_db"

# 3. Restore the schema and data
podman exec -it inventory-backup bash -c \
  "PGPASSWORD="" pg_restore \
     -h inventory-db \
     -U postgres \
     -d vault_inventory_db \
     --clean --if-exists \
     /backups/postgres/pg_backup_YYYYMMDD_HHMMSS.dump"

# 4. Re-apply roles and permissions (they are not included in pg_dump by default)
podman exec -it inventory-db bash -c \
  "PGPASSWORD="" psql -U postgres vault_inventory_db \
   -f /docker-entrypoint-initdb.d/init.sql"
```

### Option B — Promote the hot-standby replica (zero-data-loss failover)

Use this when the primary is down and you need the replica to take over immediately.

```bash
# 1. Stop the backup and backend services to prevent writes
podman-compose -f podman-compose.yml stop backup backend

# 2. Promote the replica to a primary
podman exec inventory-db-replica bash -c \
  "PGDATA=/var/lib/postgresql/data pg_ctl promote -D /var/lib/postgresql/data"

# 3. Update the backend to point to the replica
#    Edit podman-compose.yml: change DB_HOST to inventory-db-replica
#    Then restart the backend:
podman-compose -f podman-compose.yml up -d backend

# 4. Rebuild a new replica from the promoted primary once the old primary is repaired
```

### Option C — PITR with WAL archive

Use this to recover to a specific point in time using the archived WAL files.

```bash
# 1. Stop the primary postgres container
podman-compose -f podman-compose.yml stop postgres

# 2. Get a shell on the postgres container and prepare a recovery target
podman run --rm \
  -v postgres_data:/var/lib/postgresql/data \
  -v postgres_wal_archive:/var/lib/postgresql/wal_archive \
  docker.io/postgres:16-alpine bash -c "
    # Add recovery target time to postgresql.conf
    echo \"recovery_target_time = '2024-01-15 14:30:00'\" >> /var/lib/postgresql/data/postgresql.conf
    echo \"restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'\" >> /var/lib/postgresql/data/postgresql.conf
    # Create recovery signal
    touch /var/lib/postgresql/data/recovery.signal
  "

# 3. Start postgres — it will replay WAL up to the target time
podman-compose -f podman-compose.yml up -d postgres
```

---

## OpenBao (Vault) Restore

### From a Raft snapshot

```bash
# 1. Identify the snapshot to restore
podman exec inventory-backup ls /backups/vault/

# 2. Read the root token from the init file
ROOT_TOKEN="" exec inventory-bao \
  sh -c "jq -r '.root_token' /vault/init/init.json")

# 3. Restore the snapshot (Vault must be running and unsealed)
podman exec inventory-backup sh -c \
  "VAULT_TOKEN="" vault operator raft snapshot restore \
     -address=http://inventory-bao:8200 \
     -force \
     /backups/vault/vault_snapshot_YYYYMMDD_HHMMSS.snap"

# 4. Restart the vault container to pick up the restored state
podman-compose -f podman-compose.yml restart openbao
```

### Full recovery from scratch (disaster scenario)

```bash
# 1. Delete vault data and init volumes
podman volume rm password-manager_vault_data password-manager_vault_init

# 2. Restart vault — it will re-initialise and write a new init.json
podman-compose -f podman-compose.yml up -d openbao

# 3. Wait for vault to be healthy, then restore the snapshot
#    (get new root token from the freshly written init.json)
ROOT_TOKEN="" exec inventory-bao sh -c "jq -r '.root_token' /vault/init/init.json")

podman exec inventory-backup sh -c \
  "VAULT_TOKEN="" vault operator raft snapshot restore \
     -address=http://inventory-bao:8200 \
     -force \
     /backups/vault/vault_snapshot_YYYYMMDD_HHMMSS.snap"

# 4. Restart everything
podman-compose -f podman-compose.yml restart
```

---

## Backup Verification

Run a manual backup at any time:
```bash
podman exec inventory-backup /usr/local/bin/backup.sh
```

Check backup logs:
```bash
podman exec inventory-backup cat /var/log/backup.log
```

List current backups:
```bash
podman exec inventory-backup ls -lh /backups/postgres/ /backups/vault/
```

---

## Important Security Notes

1. **Vault init.json** contains the unseal keys and root token in plain text. Mount the `vault_init` volume on encrypted storage in production and never commit it to version control.
2. In production, replace the root token with a short-lived AppRole token and rotate the root token.
3. Enable TLS (`tls_disable = 0`) in `vault/config/vault.hcl` and provide a certificate.
4. Copy backups to off-site storage (oemdb1:/backup, OCI Object Storage) for true disaster recovery. See `docs/PODMAN_PRODUCTION_GUIDE.md` for the full recovery procedure.
