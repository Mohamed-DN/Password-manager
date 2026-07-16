# Guida alla Produzione con Podman — M-DN Vault Inventory

**Versione:** 1.0  
**Data:** 2026-04-30  
**Classificazione:** Interno — Operazioni  

---

## Indice

1. [Architettura del sistema](#1-architettura-del-sistema)
2. [Componenti e loro ruolo](#2-componenti-e-loro-ruolo)
3. [PostgreSQL — Replica Primary/Standby](#3-postgresql--replica-primarystandby)
4. [OpenBao — Strategia HA su singolo host](#4-openbao--strategia-ha-su-singolo-host)
5. [Backup automatico su oemdb1](#5-backup-automatico-su-oemdb1)
6. [Primo avvio in produzione](#6-primo-avvio-in-produzione)
7. [Operazioni quotidiane](#7-operazioni-quotidiane)
8. [Procedura di Recovery completa](#8-procedura-di-recovery-completa)
9. [RTO / RPO](#9-rto--rpo)
10. [Differenze Podman vs Docker](#10-differenze-podman-vs-docker)

---

## 1. Architettura del sistema

```
╔══════════════════════════════════════════════════════════════════╗
║                        HOST OCI (Podman)                         ║
║                                                                  ║
║  ┌─────────────────────┐   streaming    ┌───────────────────┐   ║
║  │  PostgreSQL PRIMARY  │──replication──▶│  PostgreSQL STBY  │   ║
║  │  (inventory-db)      │  sync / async  │  (inventory-db-   │   ║
║  │  porta 5432          │                │   replica)        │   ║
║  └────────┬─────────────┘                └───────────────────┘   ║
║           │ WAL archive                                           ║
║           ▼                                                       ║
║  [volume: postgres_wal_archive]                                   ║
║                                                                   ║
║  ┌──────────────────┐   Raft/storage    ┌──────────────────┐    ║
║  │  OpenBao          │──────────────────▶│  vault_data vol. │    ║
║  │  (inventory-bao)  │   init.json       │  vault_init vol. │    ║
║  │  porta 8200/8201  │                   └──────────────────┘    ║
║  └──────────────────┘                                            ║
║                                                                   ║
║  ┌──────────────────┐   ┌──────────────────┐                    ║
║  │  Backend FastAPI  │   │  Frontend Vite   │                    ║
║  │  (inventory-api)  │   │  (inventory-ui)  │                    ║
║  │  porta 8000       │   │  porta 5173      │                    ║
║  └──────────────────┘   └──────────────────┘                    ║
║                                                                   ║
║  ┌───────────────────────────────────────────┐                   ║
║  │  BACKUP container (cron orario)            │                   ║
║  │   • pg_dump  ──────────────────────────────┼──▶ /backups/    ║
║  │   • vault raft snapshot ───────────────────┼──▶ /backups/    ║
║  │   • rsync/SSH ogni ora ────────────────────┼──▶ oemdb1       ║
║  └───────────────────────────────────────────┘                   ║
╚══════════════════════════════════════════════════════════════════╝
                          │
                          │  rsync over SSH (ogni ora, +5 min)
                          ▼
╔══════════════════════════════════════════════════════════════════╗
║               GATEWAY oemdb1 — Storage DR                        ║
║                                                                  ║
║  /backup/m-dn-vault-backups/                                     ║
║    ├── postgres/        ← pg_dump files (ritention 7 giorni)     ║
║    ├── vault/           ← Raft snapshots (ritention 7 giorni)    ║
║    └── vault-init/      ← init.json (unseal keys + root token)   ║
║                                                                  ║
║  Spazio disponibile: 40 TB                                       ║
╚══════════════════════════════════════════════════════════════════╝
```

### Flusso dei dati critici

| Dato | Dove risiede live | Backup locale | Backup offsite |
|---|---|---|---|
| Password cifrate | OpenBao `vault_data` | Raft snapshot ogni ora | oemdb1:/backup ogni ora |
| Metadati inventario | PostgreSQL `postgres_data` | pg_dump ogni ora + WAL continuo | oemdb1:/backup ogni ora |
| Unseal keys + root token | `vault_init/init.json` | volume `vault_init` | oemdb1:/backup ogni ora |
| Config applicazione | Repository Git | — | GitHub |

---

## 2. Componenti e loro ruolo

| Container | Immagine | Ruolo | Stateful? |
|---|---|---|---|
| `inventory-db` | `postgres:16-alpine` | Database primario | ✅ Sì |
| `inventory-db-replica` | `postgres:16-alpine` | Hot standby (failover) | ✅ Sì |
| `inventory-bao` | `localhost/inventory-bao` | Secrets store (OpenBao) | ✅ Sì |
| `inventory-api` | `localhost/inventory-api` | API REST FastAPI | ❌ Stateless |
| `inventory-ui` | `node:22-alpine` | Frontend Vite/React | ❌ Stateless |
| `inventory-backup` | `localhost/inventory-backup` | Backup scheduler | ❌ Stateless |

### Volumi Podman (dati persistenti)

| Volume | Montato su | Contenuto |
|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` | Dati PostgreSQL primary |
| `postgres_replica_data` | `/var/lib/postgresql/data` | Dati PostgreSQL standby |
| `postgres_wal_archive` | `/var/lib/postgresql/wal_archive` | WAL archiviati (PITR) |
| `vault_data` | `/vault/data` | Storage Raft OpenBao |
| `vault_init` | `/vault/init` | `init.json` (unseal keys) |
| `backups_data` | `/backups` | pg_dump + raft snapshots locali |

---

## 3. PostgreSQL — Replica Primary/Standby

### Come funziona la replica streaming

PostgreSQL implementa la replica tramite **WAL Streaming Replication**:

1. Il **primary** (`inventory-db`) esegue le transazioni e genera WAL (Write-Ahead Log)
2. Il **processo WAL sender** sul primary invia i WAL al processo WAL receiver sullo standby
3. Lo **standby** (`inventory-db-replica`) applica i WAL in tempo reale e rimane in *hot standby* (disponibile per lettura)
4. La standby NON accetta scritture finché non viene promossa

### Replica asincrona (default)

```
Primary ──▶ commit ──▶ risposta al client
         ──▶ invia WAL allo standby (in background)
```

- **RPO:** Possibile perdita di transazioni dell'ultimo secondo in caso di crash del primary
- **Vantaggio:** Il primary non aspetta la conferma dello standby → latenza minima
- **Configurazione:** impostazione default (`REPLICATION_MODE` non impostato o `async`)

### Replica sincrona

```
Primary ──▶ attende conferma standby ──▶ commit ──▶ risposta al client
```

- **RPO:** Zero perdita di dati (zero data loss)
- **Svantaggio:** La latenza del primary aumenta di quella di rete verso lo standby; se lo standby è irraggiungibile, il primary si **blocca**
- **Configurazione:** impostare `REPLICATION_MODE=sync` nel file `.env`

> ⚠️ **Consiglio:** Su un singolo host OCI con primary e standby sullo stesso hardware, la replica sincrona non aggiunge protezione contro un crash del server fisico. Usare la replica asincrona e affidarsi ai backup su oemdb1 per il DR.

### Monitorare lo stato della replica

```bash
# Stato WAL sender sul primary
podman exec inventory-db \
  psql -U postgres -c \
  "SELECT client_addr, state, sent_lsn, write_lsn, replay_lsn, sync_state
   FROM pg_stat_replication;"

# Lag di replica (in byte) sul primary
podman exec inventory-db \
  psql -U postgres -c \
  "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS lag_bytes
   FROM pg_stat_replication;"

# Stato sul nodo standby
podman exec inventory-db-replica \
  psql -U postgres -c \
  "SELECT pg_is_in_recovery(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();"
```

### Passare da async a sync (o viceversa) senza riavvio

```bash
# Attivare la replica sincrona
podman exec inventory-db \
  psql -U postgres -c \
  "ALTER SYSTEM SET synchronous_standby_names = 'inventory-db-replica';
   SELECT pg_reload_conf();"

# Disattivare la replica sincrona (tornare ad async)
podman exec inventory-db \
  psql -U postgres -c \
  "ALTER SYSTEM SET synchronous_standby_names = '';
   SELECT pg_reload_conf();"
```

---

## 4. OpenBao — Strategia HA su singolo host

### Perché non c'è vera replica di OpenBao

OpenBao utilizza il protocollo **Raft** per la consistenza interna del proprio storage. Un cluster Raft richiede **almeno 3 nodi su 3 host fisici separati** per tollerare il crash di un host.

Su un singolo host OCI:
- Eseguire 3 container OpenBao **non offre** protezione contro un crash del server fisico (tutti e 3 i container muoiono insieme)
- La complessità di un cluster Raft multi-container su singolo host non è giustificata

### Strategia adottata: snapshot + offsite

```
OpenBao (Raft storage)
    │
    ├── Ogni ora: vault operator raft snapshot save → /backups/vault/
    │
    └── Ogni ora (+5 min): rsync → oemdb1:/backup/m-dn-vault-backups/vault/
```

| Metrica | Valore |
|---|---|
| RPO (max dati persi) | ≤ 1 ora |
| RTO (tempo recovery) | ≤ 10 minuti |

### File init.json — il dato più critico

Il file `/vault/init/init.json` contiene:
- Le **5 unseal key** (servono 3 delle 5 per unsealare il vault)
- Il **root token** (accesso completo)

**Senza questo file, le password nel vault sono inaccessibili anche con uno snapshot.**

Il backup container copia `init.json` su oemdb1 ogni ora. Verificarne la presenza:

```bash
ssh backup@oemdb1 ls -lh /backup/m-dn-vault-backups/vault-init/
```

### Monitorare lo stato di OpenBao

```bash
# Stato generale
podman exec inventory-bao vault status -address=http://127.0.0.1:8200

# Elencare snapshot Raft locali
podman exec inventory-backup ls -lht /backups/vault/ | head -10

# Eseguire manualmente uno snapshot
podman exec inventory-backup /usr/local/bin/backup.sh
```

---

## 5. Backup automatico su oemdb1

### Flusso del backup

Ogni ora il container `inventory-backup` esegue `/usr/local/bin/backup.sh`:

1. **pg_dump** del database → `/backups/postgres/pg_backup_YYYYMMDD_HHMMSS.dump`
2. **vault raft snapshot** → `/backups/vault/vault_snapshot_YYYYMMDD_HHMMSS.snap`
3. **Copia di init.json** → `/backups/vault-init/init.json`
4. **rsync via SSH** di tutto `/backups/` → `oemdb1:/backup/m-dn-vault-backups/`
5. **Pulizia** dei file locali più vecchi di 7 giorni

### Struttura su oemdb1

```
oemdb1:/backup/m-dn-vault-backups/
├── postgres/
│   ├── pg_backup_20260430_020000.dump
│   ├── pg_backup_20260430_030000.dump
│   └── ...  (7 giorni di storico)
├── vault/
│   ├── vault_snapshot_20260430_020000.snap
│   ├── vault_snapshot_20260430_030000.snap
│   └── ...  (7 giorni di storico)
└── vault-init/
    └── init.json   (sempre l'ultimo copiato)
```

### Configurazione SSH verso oemdb1

```bash
# Eseguire una volta sola per configurare la chiave SSH passwordless
sudo bash podman/setup-offsite-ssh.sh
```

Questo script:
1. Genera una coppia di chiavi ed25519 in `/opt/m-dn-vault/ssh/`
2. Installa la chiave pubblica su `backup@oemdb1` via SSH interattivo (chiede la password una sola volta)
3. Salva il fingerprint di oemdb1 in `known_hosts` per strict host verification
4. Testa la connessione passwordless

Dopo l'esecuzione, decommentare nel `podman-compose.yml` le due righe dei volume SSH nel servizio `backup`, poi riavviare:

```bash
podman-compose -f podman-compose.yml up -d --no-deps backup
```

### Verificare che il backup funzioni

```bash
# Log dell'ultimo backup
podman exec inventory-backup cat /var/log/backup.log

# Elenco backup su oemdb1
ssh backup@oemdb1 ls -lht /backup/m-dn-vault-backups/postgres/ | head -5
ssh backup@oemdb1 ls -lht /backup/m-dn-vault-backups/vault/ | head -5

# Test manuale (esegue subito un backup completo + rsync)
podman exec inventory-backup /usr/local/bin/backup.sh
```

---

## 6. Primo avvio in produzione

### Prerequisiti

- Oracle Linux 8/9 o RHEL 8/9 (o compatibili)
- Podman ≥ 4.0: `dnf install podman`
- podman-compose: `pip install podman-compose`
- Accesso SSH a oemdb1 con un utente che può creare il `backup` user

### Passi

```bash
# 1. Clonare il repository
git clone https://github.com/Mohamed-DN/Password-manager.git
cd Password-manager

# 2. Creare il file .env dalle variabili di esempio
cp .env.example .env
$EDITOR .env   # personalizzare le password

# 3. Eseguire il deploy completo
sudo bash podman/deploy.sh

# 4. Configurare il backup offsite su oemdb1
sudo bash podman/setup-offsite-ssh.sh

# 5. Decommentare le righe SSH nel podman-compose.yml e riavviare il backup
podman-compose -f podman-compose.yml up -d --no-deps backup

# 6. Verificare che tutto sia up
podman ps --format "table {{.Names}}\t{{.Status}}"
```

### Verifica post-deploy

```bash
# Tutti i container healthy
podman ps --format "table {{.Names}}\t{{.Status}}"

# Backend risponde
curl -f http://localhost:8000/health

# OpenBao status
podman exec inventory-bao vault status -address=http://127.0.0.1:8200

# Replica PostgreSQL attiva
podman exec inventory-db \
  psql -U postgres -c "SELECT client_addr, state FROM pg_stat_replication;"

# Backup manuale di prova
podman exec inventory-backup /usr/local/bin/backup.sh
ssh backup@oemdb1 ls -lht /backup/m-dn-vault-backups/postgres/ | head -3
```

---

## 7. Operazioni quotidiane

### Comandi Podman essenziali

```bash
# Stato di tutti i container
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Log in tempo reale
podman logs -f inventory-api
podman logs -f inventory-bao
podman logs -f inventory-db

# Riavvio singolo servizio
podman-compose -f podman-compose.yml restart openbao

# Aggiornare un'immagine e riavviare il servizio
podman build -t localhost/inventory-api:latest ./backend
podman-compose -f podman-compose.yml up -d --no-deps backend

# Stop completo (mantiene i volumi)
podman-compose -f podman-compose.yml down

# Stop + eliminazione volumi (DISTRUTTIVO — solo per reset completo)
podman-compose -f podman-compose.yml down -v
```

### Aggiornamenti di sistema

```bash
# 1. Fermare i servizi
podman-compose -f podman-compose.yml stop

# 2. Aggiornare il codice
git pull origin main

# 3. Ricostruire le immagini custom
podman build -t localhost/inventory-bao:latest    ./vault
podman build -t localhost/inventory-api:latest    ./backend
podman build -t localhost/inventory-backup:latest ./backup

# 4. Riavviare
podman-compose -f podman-compose.yml up -d
```

---

## 8. Procedura di Recovery completa

Questa sezione copre tutti gli scenari di guasto, dal più semplice (container crashato) al più grave (perdita totale del server con recupero da oemdb1).

---

### Scenario 1 — Container crashato (riavvio automatico)

Il sistema è configurato con `restart: unless-stopped`. Se un container crasha, Podman lo riavvia automaticamente. Nessuna azione richiesta.

Verificare:
```bash
podman ps --format "table {{.Names}}\t{{.Status}}"
podman logs inventory-api --tail=50
```

---

### Scenario 2 — Failover PostgreSQL (primary irraggiungibile)

**Quando usarlo:** Il container `inventory-db` non risponde e non si può riavviare.

```bash
# 1. Fermare i servizi che scrivono sul DB
podman-compose -f podman-compose.yml stop backup backend

# 2. Promuovere la replica a primary
podman exec inventory-db-replica \
  bash -c "pg_ctl promote -D /var/lib/postgresql/data"

# 3. Attendere la promozione (max 30 secondi)
sleep 15
podman exec inventory-db-replica \
  psql -U postgres -c "SELECT pg_is_in_recovery();"
# Deve restituire: f (false) → promozione avvenuta

# 4. Redirigere il backend sulla replica (ora è il nuovo primary)
#    Modificare DB_HOST nel .env oppure direttamente in podman-compose.yml
sed -i 's/DB_HOST=inventory-db/DB_HOST=inventory-db-replica/' podman-compose.yml

# 5. Riavviare il backend
podman-compose -f podman-compose.yml up -d backend backup

# 6. Verificare
curl -f http://localhost:8000/health

# --- Ripristino del primary originale (dopo aver riparato il server) ---
# 7. Eliminare il vecchio volume del primary corrotto e ricreare il container
podman volume rm $(podman volume ls -q | grep postgres_data) 2>/dev/null || true
# Ripristinare DB_HOST al valore originale
sed -i 's/DB_HOST=inventory-db-replica/DB_HOST=inventory-db/' podman-compose.yml
# Riavviare il primary (si inizializzerà vuoto)
podman-compose -f podman-compose.yml up -d postgres
# Avviare la nuova replica (si sincronizza automaticamente dal nuovo primary)
podman-compose -f podman-compose.yml up -d postgres-replica
```

---

### Scenario 3 — Restore OpenBao da snapshot (da backup locale)

**Quando usarlo:** Volume `vault_data` corrotto, OpenBao non si avvia o i segreti sono stati cancellati accidentalmente.

```bash
# 1. Trovare lo snapshot più recente
podman exec inventory-backup ls -lt /backups/vault/ | head -5
SNAP_FILE="vault_snapshot_YYYYMMDD_HHMMSS.snap"   # ← sostituire con il nome reale

# 2. Fermare OpenBao
podman-compose -f podman-compose.yml stop openbao

# 3. Eliminare il volume vault_data corrotto
podman volume rm $(podman volume ls -q | grep vault_data) 2>/dev/null || true

# 4. Riavviare OpenBao (si re-inizializza vuoto)
podman-compose -f podman-compose.yml up -d openbao

# 5. Attendere che sia healthy
until podman inspect inventory-bao \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
  echo "Attendo OpenBao..."; sleep 5
done

# 6. Leggere il root token (dal nuovo init.json generato al riavvio)
ROOT_TOKEN="" exec inventory-bao jq -r '.root_token' /vault/init/init.json)

# 7. Restore dello snapshot
podman exec inventory-backup \
  sh -c "VAULT_TOKEN="" vault operator raft snapshot restore \
    -address=http://inventory-bao:8200 \
    -force \
    /backups/vault/${SNAP_FILE}"

# 8. Riavviare per applicare lo stato ripristinato
podman-compose -f podman-compose.yml restart openbao
sleep 30

# 9. Verifica
podman exec inventory-bao vault status -address=http://127.0.0.1:8200
# Atteso: Initialized: true, Sealed: false
```

---

### Scenario 4 — Restore OpenBao da oemdb1 (backup locale non disponibile)

**Quando usarlo:** Backup locale assente o corrotto — recupero dallo storage DR oemdb1.

```bash
OEMDB1="oemdb1"
OEMDB1_USER="backup"
OEMDB1_PATH="/backup/m-dn-vault-backups"

# 1. Verificare i file disponibili su oemdb1
ssh ${OEMDB1_USER}@${OEMDB1} ls -lht ${OEMDB1_PATH}/vault/ | head -5
ssh ${OEMDB1_USER}@${OEMDB1} ls -lht ${OEMDB1_PATH}/vault-init/ | head -3

# 2. Scaricare lo snapshot più recente e l'init.json
mkdir -p /tmp/vault-restore
SNAP=$(ssh ${OEMDB1_USER}@${OEMDB1} ls -t ${OEMDB1_PATH}/vault/ | head -1)
scp "${OEMDB1_USER}@${OEMDB1}:${OEMDB1_PATH}/vault/${SNAP}" /tmp/vault-restore/restore.snap
scp "${OEMDB1_USER}@${OEMDB1}:${OEMDB1_PATH}/vault-init/init.json" /tmp/vault-restore/init.json

# Verificare l'integrità di init.json
cat /tmp/vault-restore/init.json | jq '{root_token: "" keys_count: (.unseal_keys_b64 | length)}'
# Atteso: keys_count: 5, root_token non vuoto

# 3. Fermare OpenBao e rimuovere il volume corrotto
podman-compose -f podman-compose.yml stop openbao
podman volume rm $(podman volume ls -q | grep vault_data) 2>/dev/null || true

# 4. Riavviare OpenBao (re-inizializzazione)
podman-compose -f podman-compose.yml up -d openbao
until podman inspect inventory-bao \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
  echo "Attendo OpenBao..."; sleep 5
done

# 5. Copiare init.json nel container e leggere il root token
podman cp /tmp/vault-restore/init.json inventory-bao:/vault/init/init.json
ROOT_TOKEN="" /tmp/vault-restore/init.json | jq -r '.root_token')

# 6. Copiare lo snapshot e fare il restore
podman cp /tmp/vault-restore/restore.snap inventory-bao:/tmp/restore.snap
podman exec inventory-bao \
  sh -c "VAULT_TOKEN="" vault operator raft snapshot restore \
    -address=http://127.0.0.1:8200 \
    -force \
    /tmp/restore.snap"

# 7. Riavviare e verificare
podman-compose -f podman-compose.yml restart openbao
sleep 30
podman exec inventory-bao vault status -address=http://127.0.0.1:8200
```

---

### Scenario 5 — Restore PostgreSQL da pg_dump (da backup locale)

**Quando usarlo:** Corruzione logica dei dati (tabelle eliminate per errore, dati modificati erroneamente), senza perdita del server.

```bash
# 1. Identificare il pg_dump da ripristinare
podman exec inventory-backup ls -lht /backups/postgres/ | head -10
DUMP_FILE="pg_backup_YYYYMMDD_HHMMSS.dump"   # ← sostituire con il nome reale

# 2. Fermare servizi che scrivono sul DB
podman-compose -f podman-compose.yml stop backup backend

# 3. Drop e recreate del database
podman exec inventory-db \
  bash -c "PGPASSWORD="" dropdb -U postgres vault_inventory_db --if-exists && \
           PGPASSWORD="" createdb -U postgres vault_inventory_db"

# 4. Restore schema e dati
podman exec inventory-backup \
  bash -c "PGPASSWORD="" pg_restore \
    -h inventory-db -U postgres \
    -d vault_inventory_db \
    --clean --if-exists \
    /backups/postgres/${DUMP_FILE}"

# 5. Re-applicare ruoli e permessi
podman exec inventory-db \
  bash -c "PGPASSWORD="" psql -U postgres vault_inventory_db \
    -f /docker-entrypoint-initdb.d/01-init.sql" 2>&1 | grep -E "ERROR|NOTICE|ROLE" || true

# 6. Verificare i conteggi
podman exec inventory-db \
  bash -c "PGPASSWORD="" psql -U postgres -d vault_inventory_db \
    -c 'SELECT count(*) AS utenze FROM inventory.utenze; SELECT count(*) AS sistemi FROM inventory.sistemi_target;'"

# 7. Riavviare i servizi
podman-compose -f podman-compose.yml up -d backend backup
```

---

### Scenario 6 — Restore PostgreSQL da oemdb1 (PITR o backup locale assente)

**Quando usarlo:** Backup locale assente/corrotto — recupero dalla storage DR oemdb1.

```bash
OEMDB1="oemdb1"
OEMDB1_USER="backup"
OEMDB1_PATH="/backup/m-dn-vault-backups"

# 1. Trovare il pg_dump più recente su oemdb1
ssh ${OEMDB1_USER}@${OEMDB1} ls -lht ${OEMDB1_PATH}/postgres/ | head -5

# 2. Scaricare il dump selezionato
mkdir -p /tmp/pg-restore
DUMP=$(ssh ${OEMDB1_USER}@${OEMDB1} ls -t ${OEMDB1_PATH}/postgres/ | head -1)
scp "${OEMDB1_USER}@${OEMDB1}:${OEMDB1_PATH}/postgres/${DUMP}" /tmp/pg-restore/restore.dump

# 3. Copiare il dump nel container postgres
podman cp /tmp/pg-restore/restore.dump inventory-db:/tmp/restore.dump

# 4. Fermare i servizi che scrivono
podman-compose -f podman-compose.yml stop backup backend

# 5. Drop e recreate
podman exec inventory-db \
  bash -c "PGPASSWORD="" dropdb -U postgres vault_inventory_db --if-exists && \
           PGPASSWORD="" createdb -U postgres vault_inventory_db"

# 6. Restore
podman exec inventory-db \
  bash -c "PGPASSWORD="" pg_restore \
    -U postgres -d vault_inventory_db \
    --clean --if-exists \
    /tmp/restore.dump"

# 7. Re-applicare permessi e riavviare
podman exec inventory-db \
  bash -c "PGPASSWORD="" psql -U postgres vault_inventory_db \
    -f /docker-entrypoint-initdb.d/01-init.sql" 2>&1 | grep -E "ERROR|NOTICE|ROLE" || true

podman-compose -f podman-compose.yml up -d backend backup
```

---

### Scenario 7 — CRASH TOTALE (recovery completa da oemdb1 su nuovo host)

**Quando usarlo:** Perdita completa e irrecuperabile del server OCI. Si esegue su una macchina nuova e pulita.

**Tempo stimato: ≤ 45 minuti**

```bash
# ════════════════════════════════════════════
# STEP 1 — Provisioning del nuovo host
# ════════════════════════════════════════════

# Installare Podman (Oracle Linux / RHEL)
dnf install -y podman
pip install podman-compose

# Verificare le versioni
podman --version     # deve essere >= 4.0
podman-compose --version

# Clonare il repository
git clone https://github.com/Mohamed-DN/Password-manager.git
cd Password-manager

# Creare il file .env (usare le stesse variabili della produzione)
cp .env.example .env
$EDITOR .env

# ════════════════════════════════════════════
# STEP 2 — Recupero backup da oemdb1
# ════════════════════════════════════════════

OEMDB1="oemdb1"
OEMDB1_USER="backup"
OEMDB1_PATH="/backup/m-dn-vault-backups"
RESTORE_DIR="/tmp/dr-restore"

mkdir -p ${RESTORE_DIR}/postgres ${RESTORE_DIR}/vault ${RESTORE_DIR}/vault-init

# Verificare disponibilità dei backup (assicurarsi che non siano più vecchi di 1h)
echo "=== Backup disponibili su oemdb1 ==="
ssh ${OEMDB1_USER}@${OEMDB1} "ls -lht ${OEMDB1_PATH}/postgres/ | head -3"
ssh ${OEMDB1_USER}@${OEMDB1} "ls -lht ${OEMDB1_PATH}/vault/    | head -3"
ssh ${OEMDB1_USER}@${OEMDB1} "ls -lht ${OEMDB1_PATH}/vault-init/ | head -3"

# Scaricare i file più recenti
PG_FILE=$(ssh ${OEMDB1_USER}@${OEMDB1} ls -t ${OEMDB1_PATH}/postgres/ | head -1)
VT_FILE=$(ssh ${OEMDB1_USER}@${OEMDB1} ls -t ${OEMDB1_PATH}/vault/ | head -1)

scp "${OEMDB1_USER}@${OEMDB1}:${OEMDB1_PATH}/postgres/${PG_FILE}" ${RESTORE_DIR}/postgres/restore.dump
scp "${OEMDB1_USER}@${OEMDB1}:${OEMDB1_PATH}/vault/${VT_FILE}"    ${RESTORE_DIR}/vault/restore.snap
scp "${OEMDB1_USER}@${OEMDB1}:${OEMDB1_PATH}/vault-init/init.json" ${RESTORE_DIR}/vault-init/init.json

# Verificare init.json (FONDAMENTALE)
echo "=== Verifica init.json ==="
cat ${RESTORE_DIR}/vault-init/init.json | \
  jq '{root_token: "" keys_count: (.unseal_keys_b64 | length)}'
# DEVE mostrare: keys_count: 5, root_token non vuoto

echo "=== Dimensione dump PostgreSQL ==="
ls -lh ${RESTORE_DIR}/postgres/restore.dump

# ════════════════════════════════════════════
# STEP 3 — Avvio infrastruttura base
# ════════════════════════════════════════════

sudo bash podman/deploy.sh   # crea directory, build immagini, avvia i servizi

# Attendere che PostgreSQL sia healthy
echo "=== Attendo PostgreSQL ==="
until podman inspect inventory-db \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
  echo "Attendo postgres..."; sleep 5
done
echo "PostgreSQL HEALTHY"

# Attendere che OpenBao sia healthy
echo "=== Attendo OpenBao ==="
until podman inspect inventory-bao \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
  echo "Attendo OpenBao..."; sleep 5
done
echo "OpenBao HEALTHY"

# ════════════════════════════════════════════
# STEP 4 — Restore PostgreSQL
# ════════════════════════════════════════════

echo "=== Restore PostgreSQL dal dump ==="

# Fermare i servizi che scrivono sul DB
podman-compose -f podman-compose.yml stop backup backend

# Copiare il dump nel container
podman cp ${RESTORE_DIR}/postgres/restore.dump inventory-db:/tmp/restore.dump

# Drop e recreate database
podman exec inventory-db \
  bash -c "PGPASSWORD="" dropdb -U postgres vault_inventory_db --if-exists && \
           PGPASSWORD="" createdb -U postgres vault_inventory_db"

# Restore schema e dati
podman exec inventory-db \
  bash -c "PGPASSWORD="" pg_restore \
    -U postgres -d vault_inventory_db \
    --clean --if-exists \
    /tmp/restore.dump"

# Re-applicare ruoli e permessi
podman exec inventory-db \
  bash -c "PGPASSWORD="" psql -U postgres vault_inventory_db \
    -f /docker-entrypoint-initdb.d/01-init.sql" 2>&1 | grep -E "ERROR|NOTICE|ROLE" || true

# Verifica conteggi
echo "=== Verifica conteggi PostgreSQL ==="
podman exec inventory-db \
  bash -c "PGPASSWORD="" psql -U postgres -d vault_inventory_db \
    -c 'SELECT count(*) AS utenze FROM inventory.utenze; SELECT count(*) AS sistemi FROM inventory.sistemi_target;'"

echo "✅ PostgreSQL restore completato"

# ════════════════════════════════════════════
# STEP 5 — Restore OpenBao
# ════════════════════════════════════════════

echo "=== Restore OpenBao dal snapshot ==="

# Copiare init.json nel container OpenBao
podman cp ${RESTORE_DIR}/vault-init/init.json inventory-bao:/vault/init/init.json
ROOT_TOKEN="" ${RESTORE_DIR}/vault-init/init.json | jq -r '.root_token')

# Copiare lo snapshot nel container
podman cp ${RESTORE_DIR}/vault/restore.snap inventory-bao:/tmp/restore.snap

# Restore del Raft snapshot (sovrascrive lo stato corrente)
podman exec inventory-bao \
  sh -c "VAULT_TOKEN="" vault operator raft snapshot restore \
    -address=http://127.0.0.1:8200 \
    -force \
    /tmp/restore.snap"

# Riavviare OpenBao per applicare lo stato ripristinato
podman-compose -f podman-compose.yml restart openbao
sleep 30

# Verificare
echo "=== Verifica OpenBao ==="
podman exec inventory-bao vault status -address=http://127.0.0.1:8200
# Atteso: Initialized: true, Sealed: false

echo "✅ OpenBao restore completato"

# ════════════════════════════════════════════
# STEP 6 — Avvio di tutti i servizi
# ════════════════════════════════════════════

echo "=== Avvio servizi rimanenti ==="

# Replica PostgreSQL (si sincronizza automaticamente dal primary)
podman-compose -f podman-compose.yml up -d postgres-replica
until podman inspect inventory-db-replica \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
  echo "Attendo replica..."; sleep 5
done
echo "Replica HEALTHY"

# Backend
podman-compose -f podman-compose.yml up -d backend
sleep 15
curl -f http://localhost:8000/health && echo "Backend OK" || echo "ERRORE: backend non risponde"

# Frontend e backup
podman-compose -f podman-compose.yml up -d frontend backup

# Stato finale
echo "=== Stato finale di tutti i container ==="
podman ps --format "table {{.Names}}\t{{.Status}}"

# ════════════════════════════════════════════
# STEP 7 — Test funzionale end-to-end
# ════════════════════════════════════════════

echo "=== Test funzionali ==="

# API
curl -s http://localhost:8000/api/sistemi-target | jq 'length'

# Frontend
curl -s -o /dev/null -w "Frontend HTTP: %{http_code}\n" http://localhost:5173

# PostgreSQL replica in streaming
podman exec inventory-db \
  psql -U postgres -c \
  "SELECT client_addr, state FROM pg_stat_replication;"

# ════════════════════════════════════════════
# STEP 8 — Riconfigurare backup offsite
# ════════════════════════════════════════════

# Ricreare la chiave SSH per il backup verso oemdb1
sudo bash podman/setup-offsite-ssh.sh

# Decommentare le righe SSH nel podman-compose.yml (volumi backup service)
# Poi riavviare il container backup:
podman-compose -f podman-compose.yml up -d --no-deps backup

echo ""
echo "════════════════════════════════════════════"
echo " RECOVERY COMPLETATA"
echo "════════════════════════════════════════════"
echo " Verificare la checklist di post-recovery"
echo " in docs/backup/DDR_DISASTER_RECOVERY_DRILL.md"
echo "════════════════════════════════════════════"
```

---

## 9. RTO / RPO

| Scenario | RPO (max dati persi) | RTO (tempo al ripristino) |
|---|---|---|
| Container crashato (riavvio automatico) | 0 | < 2 minuti |
| Failover PostgreSQL su replica | 0 (replica real-time) | < 5 minuti |
| Restore OpenBao da snapshot locale | ≤ 1 ora | < 10 minuti |
| Restore OpenBao da oemdb1 | ≤ 1 ora | < 15 minuti |
| Restore PostgreSQL da pg_dump locale | ≤ 1 ora | < 15 minuti |
| Restore PostgreSQL da oemdb1 | ≤ 1 ora | < 20 minuti |
| Crash totale host — recovery da oemdb1 | ≤ 1 ora | ≤ 45 minuti |

---

## 10. Differenze Podman vs Docker

Questa sezione riassume le differenze pratiche rilevanti per questo progetto.

| Aspetto | Docker | Podman |
|---|---|---|
| Daemon | Richiede `dockerd` in background | **Daemonless** — ogni container è un processo figlio |
| Permessi | Il daemon gira come root | Supporta container **rootless** (consigliato in produzione) |
| Registry | `postgres:16-alpine` (hub.docker.com implicito) | Richiede **registry completo**: `docker.io/postgres:16-alpine` |
| SELinux | Relabeling opzionale | Mount con `:z` (shared) o `:Z` (private) **obbligatori** su RHEL/OL |
| Compose | `docker compose` (plugin ufficiale) | `podman-compose` (pip) oppure `podman compose` (v4.7+) |
| IPC_LOCK | Usabile con `cap_add: IPC_LOCK` | Evitare: usare `disable_mlock = true` in vault.hcl |
| Systemd | Gestione manuale | **Quadlets** (`~/.config/containers/systemd/`) per autostart native |
| Rete | Bridge `docker0` automatico | Bridge `podman0` automatico; stessa sintassi nei compose |

### Perché `:z` sui bind mount?

Su sistemi con SELinux in modalità `enforcing` (Oracle Linux, RHEL), un container non può leggere file dell'host senza il corretto contesto SELinux. Il suffisso `:z` istruisce Podman a fare il relabeling dei file con `container_file_t` prima di montarli. Senza `:z` il container riceve `Permission denied` anche se i permessi Unix sono corretti.

### Usare Quadlets per l'autostart (alternativa a podman-compose)

I Quadlet sono unit systemd generate automaticamente da file `.container` in `/etc/containers/systemd/`. Permettono di avviare i container al boot senza nessun daemon aggiuntivo. La configurazione `podman-compose.yml` è equivalente ma richiede `podman-compose` installato. Per ambienti di produzione a lungo termine, considerare la migrazione ai Quadlets.
