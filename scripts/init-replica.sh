#!/bin/bash
# init-replica.sh
# Custom entrypoint for the postgres-replica container.
# On first start it runs pg_basebackup to clone the primary.
# On subsequent starts it simply starts postgres in hot-standby mode.
set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PRIMARY_HOST="${PRIMARY_HOST:-inventory-db}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICATION_USER="${REPLICATION_USER:-replicator}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-ReplicaPassword123!}"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "==> [replica] Data directory is empty — initialising from primary ($PRIMARY_HOST:$PRIMARY_PORT)..."

    # Wait until the primary is accepting connections.
    until PGPASSWORD="$REPLICATION_PASSWORD" pg_isready \
            -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPLICATION_USER" 2>/dev/null; do
        echo "    Waiting for primary at ${PRIMARY_HOST}:${PRIMARY_PORT} ..."
        sleep 3
    done

    echo "==> [replica] Primary is ready. Running pg_basebackup..."
    PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
        -h "$PRIMARY_HOST" \
        -p "$PRIMARY_PORT" \
        -U "$REPLICATION_USER" \
        -D "$PGDATA" \
        --wal-method=stream \
        --write-recovery-conf \
        --checkpoint=fast \
        -P

    # pg_basebackup --write-recovery-conf creates standby.signal and writes
    # primary_conninfo into postgresql.auto.conf, but without the password.
    # We inject the password so streaming replication can authenticate.
    # NOTE: This stores the replication password in postgresql.auto.conf
    # (permissions: 0600, readable only by the postgres user).  In production
    # consider using a .pgpass file or SCRAM authentication without a stored
    # password by granting pg_hba trust within the Docker network.
    if [ -f "$PGDATA/postgresql.auto.conf" ]; then
        echo "==> [replica] Injecting replication password into primary_conninfo..."
        sed -i \
          "s|primary_conninfo = '\(.*\)'|primary_conninfo = '\1 password=${REPLICATION_PASSWORD}'|" \
          "$PGDATA/postgresql.auto.conf"
    fi

    # Ensure correct ownership inside the data dir
    chown -R postgres:postgres "$PGDATA"

    echo "==> [replica] Base backup complete."
fi

echo "==> [replica] Starting PostgreSQL in hot-standby mode..."
exec gosu postgres postgres -D "$PGDATA"
