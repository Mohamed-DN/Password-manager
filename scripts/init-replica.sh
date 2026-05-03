#!/bin/bash
set -e

# Script di inizializzazione per PostgreSQL REPLICA (Hot Standby)
# Questo script viene eseguito come entrypoint del container replica

echo "[INIT-REPLICA] Avvio inizializzazione replica..."

# Variabili di ambiente attese:
# PRIMARY_HOST, PRIMARY_PORT, REPLICATION_USER, REPLICATION_PASSWORD
# PGDATA, POSTGRES_PASSWORD, POSTGRES_DB

PRIMARY_CONNINFO="host=${PRIMARY_HOST} port=${PRIMARY_PORT} user=${REPLICATION_USER} password=${REPLICATION_PASSWORD} dbname=${POSTGRES_DB}"

# Controlla se il database è già stato inizializzato
if [ -f "$PGDATA/PG_VERSION" ]; then
    echo "[INIT-REPLICA] Database già inizializzato, avvio in modalità standby..."
    exec postgres -c "hot_standby=on" -c "primary_conninfo=$PRIMARY_CONNINFO"
fi

echo "[INIT-REPLICA] Eliminazione eventuale data directory vuota..."
rm -rf "$PGDATA"/*

echo "[INIT-REPLICA] Attesa che il primary sia pronto..."
until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPLICATION_USER"; do
    echo "[INIT-REPLICA] Primary non ancora pronto, attesa..."
    sleep 2
done

echo "[INIT-REPLICA] Esecuzione pg_basebackup dal primary..."
pg_basebackup \
    -h "$PRIMARY_HOST" \
    -p "$PRIMARY_PORT" \
    -U "$REPLICATION_USER" \
    -D "$PGDATA" \
    -Fp \
    -Xs \
    -P \
    -R

echo "[INIT-REPLICA] Configurazione standby.signal..."
touch "$PGDATA/standby.signal"

echo "[INIT-REPLICA] Configurazione postgresql.conf per standby..."
cat >> "$PGDATA/postgresql.conf" <<EOF

# Replica settings
hot_standby = on
primary_conninfo = '$PRIMARY_CONNINFO'
EOF

echo "[INIT-REPLICA] Inizializzazione completata, avvio PostgreSQL..."
exec postgres -c "hot_standby=on"