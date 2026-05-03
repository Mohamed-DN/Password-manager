#!/bin/bash
set -e

# Script di inizializzazione per PostgreSQL PRIMARY
# Viene eseguito automaticamente all'avvio del container la prima volta

echo "[INIT-PRIMARY] Creazione utente di replica..."

# Crea l'utente di replica se non esiste
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Crea utente per la replica
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$REPLICATION_USER') THEN
            CREATE ROLE $REPLICATION_USER WITH REPLICATION LOGIN PASSWORD '$REPLICATION_PASSWORD';
            RAISE NOTICE 'Utente di replica creato.';
        ELSE
            RAISE NOTICE 'Utente di replica già esistente.';
        END IF;
    END
    \$\$;

    -- Concedi permessi di replica
    GRANT pg_read_all_data TO $REPLICATION_USER;
EOSQL

echo "[INIT-PRIMARY] Configurazione pg_hba.conf per replica..."

# Aggiungi regole a pg_hba.conf per permettere connessioni di replica
if ! grep -q "replication from 0.0.0.0/0" /var/lib/postgresql/data/pg_hba.conf; then
    echo "# Replica connections" >> /var/lib/postgresql/data/pg_hba.conf
    echo "host    replication     $REPLICATION_USER      0.0.0.0/0               md5" >> /var/lib/postgresql/data/pg_hba.conf
    echo "host    replication     $REPLICATION_USER      ::0/0                   md5" >> /var/lib/postgresql/data/pg_hba.conf
fi

echo "[INIT-PRIMARY] Inizializzazione completata!"