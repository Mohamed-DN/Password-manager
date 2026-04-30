# DDR — Disaster Recovery Drill
## Nexi Vault Inventory — Password Manager

**Versione documento:** 1.0  
**Data revisione:** 2026-04-29  
**Classificazione:** RISERVATO — uso interno  
**Responsabile DR:** *(inserire nome)*  
**Team di riferimento:** *(inserire nome team)*

---

## Indice

1. [Obiettivi e Scope](#1-obiettivi-e-scope)
2. [Architettura e componenti critici](#2-architettura-e-componenti-critici)
3. [RTO / RPO](#3-rto--rpo)
4. [Prerequisiti prima di ogni drill](#4-prerequisiti-prima-di-ogni-drill)
5. [Scenario A — Riavvio singolo container](#scenario-a--riavvio-singolo-container)
6. [Scenario B — Crash del Primary PostgreSQL (failover su replica)](#scenario-b--crash-del-primary-postgresql-failover-su-replica)
7. [Scenario C — Crash di OpenBao (restore snapshot Raft)](#scenario-c--crash-di-openbao-restore-snapshot-raft)
8. [Scenario D — CRASH TOTALE DELL'HOST (full DR su nuovo server)](#scenario-d--crash-totale-dellhost-full-dr-su-nuovo-server)
9. [Checklist di verifica post-recovery](#9-checklist-di-verifica-post-recovery)
10. [Firma e approvazione](#10-firma-e-approvazione)

---

## 1. Obiettivi e Scope

### Scopo del drill
Verificare che il team sia in grado di ripristinare il servizio **Nexi Vault Inventory** entro i tempi RTO/RPO definiti a partire da qualsiasi scenario di guasto, incluso il crash totale dell'host che ospita tutti i container.

### Componenti in scope
| Componente | Container | Dati critici |
|---|---|---|
| PostgreSQL Primary | `inventory-db` | Volume `postgres_data` + WAL archive |
| PostgreSQL Replica | `inventory-db-replica` | Volume `postgres_replica_data` |
| OpenBao (Vault) | `inventory-bao` | Volume `vault_data` + `vault_init/init.json` |
| Backend API | `inventory-api` | Stateless (ricostruibile) |
| Frontend | `inventory-ui` | Stateless (ricostruibile) |
| Backup | `inventory-backup` | Volume `backups_data` |

### Fuori scope
- Failover della rete / load balancer
- Recovery del sistema operativo host
- Gestione delle credenziali SSH degli utenti finali

---

## 2. Architettura e componenti critici

```
┌─────────────────────────────────────────────────────┐
│                    HOST PRINCIPALE                    │
│                                                       │
│  ┌──────────┐   streaming   ┌──────────────────┐    │
│  │ PG       │──replication─▶│ PG REPLICA       │    │
│  │ Primary  │               │ (hot standby)    │    │
│  └────┬─────┘               └──────────────────┘    │
│       │ WAL archive                                   │
│       ▼                                               │
│  [postgres_wal_archive volume]                        │
│                                                       │
│  ┌──────────┐  Raft storage  ┌──────────────────┐   │
│  │ OpenBao  │───────────────▶│ vault_data vol.  │   │
│  │          │  init.json     │ vault_init vol.  │   │
│  └──────────┘                └──────────────────┘   │
│                                                       │
│  ┌──────────────────────────────────┐                │
│  │ BACKUP CONTAINER (cron orario)   │                │
│  │  • pg_dump ──────────────────────┼──▶ /backups/  │
│  │  • vault raft snapshot ──────────┼──▶ /backups/  │
│  │  • offsite-copy.sh ──────────────┼──▶ HOST DR    │
│  └──────────────────────────────────┘                │
└─────────────────────────────────────────────────────┘
                        │
                        │ rsync/SSH (ogni ora +5min)
                        ▼
┌─────────────────────────────────────────────────────┐
│              HOST BACKUP REMOTO (DR)                  │
│  /opt/nexi-vault-backups/                            │
│    ├── postgres/    ← pg_dump files                   │
│    ├── vault/       ← raft snapshots                  │
│    └── vault-init/  ← init.json con unseal keys       │
└─────────────────────────────────────────────────────┘
```

> **ATTENZIONE:** Senza il file `init.json` (unseal keys + root token), **OpenBao non può essere unsealed** e tutte le password sono inaccessibili. Questo file DEVE essere presente sul server DR.

---

## 3. RTO / RPO

| Scenario | RPO (dati persi) | RTO (tempo al ripristino) |
|---|---|---|
| A — Riavvio singolo container | 0 | < 2 minuti |
| B — Crash Primary DB | 0 (replica è real-time) | < 5 minuti |
| C — Crash OpenBao | Max 1 ora (ultimo snapshot) | < 10 minuti |
| D — Crash totale host | Max 1 ora (ultimo backup offsite) | < 45 minuti |

---

## 4. Prerequisiti prima di ogni drill

Prima di eseguire qualsiasi scenario di test, verificare:

- [ ] L'operatore ha accesso `sudo` / `podman` sul server host (Podman ≥ 4.0 installato)
- [ ] Il server DR (oemdb1) è raggiungibile via SSH (backup@oemdb1)
- [ ] Esiste almeno un pg_dump valido in `/backup/nexi-vault-backups/postgres/` su oemdb1
- [ ] Esiste almeno uno snapshot Vault valido in `/backup/nexi-vault-backups/vault/` su oemdb1
- [ ] Esiste una copia di `init.json` in `/backup/nexi-vault-backups/vault-init/` su oemdb1
- [ ] Il drill viene eseguito su un ambiente di test, **MAI direttamente in produzione**
- [ ] Tutti i membri del team coinvolti sono disponibili per tutta la durata del test
- [ ] Viene mantenuto un log scritto di ogni azione con orario (usare la tabella Log in fondo)

---

## Scenario A — Riavvio singolo container

**Simula:** Container crashato / riavviato da Docker (OOM kill, aggiornamento immagine, ecc.)  
**Componente testato:** Meccanismo `restart: unless-stopped` di Docker  
**Impatto atteso:** Nessuna perdita di dati, breve interruzione del servizio

### Procedura

```bash
# 1. Scegliere il container da testare (es. backend)
CONTAINER=inventory-api

# 2. Registrare lo stato corrente
podman ps | grep $CONTAINER

# 3. Simulare il crash
podman kill $CONTAINER

# 4. Attendere il riavvio automatico
sleep 15
podman ps | grep $CONTAINER   # deve mostrare "Up X seconds"

# 5. Verificare che il servizio risponda
curl -f http://localhost:8000/health || echo "ATTENZIONE: backend non risponde"
```

### Risultato atteso
- Il container si riavvia entro 30 secondi
- L'API risponde a `GET /health` con HTTP 200
- Nessun dato perso nel database

### ✅ / ❌ Esito: ___________  Ora: ___________ Operatore: ___________

---

## Scenario B — Crash del Primary PostgreSQL (failover su replica)

**Simula:** Il server del database primario è irraggiungibile (host down, volume corrotto)  
**Componente testato:** Hot standby replica + promozione manuale  
**Impatto atteso:** Breve interruzione in scrittura durante la promozione

### Fase B.1 — Verifica replica in sync prima del test

```bash
# Sul container primary: verificare stato replication
podman exec inventory-db \
  psql -U postgres -c "SELECT client_addr, state, sent_lsn, write_lsn, replay_lsn, sync_state FROM pg_stat_replication;"
```

**Risultato atteso:** almeno una riga con `state = streaming`

Esito verifica: ___________  Ora: ___________

### Fase B.2 — Simulare il crash del primary

```bash
# Fermare il primary in modo brutale (simula host down)
podman kill inventory-db
podman rm inventory-db

# Verificare che il backend si accorga del guasto
podman logs inventory-api --tail=20
```

### Fase B.3 — Promozione della replica

```bash
# 1. Fermare i servizi che scrivono sul DB
podman-compose -f podman-compose.yml stop backup backend

# 2. Promuovere la replica a primary
podman exec inventory-db-replica \
  bash -c "pg_ctl promote -D /var/lib/postgresql/data"

# 3. Attendere la promozione (al massimo 30 secondi)
sleep 10
podman exec inventory-db-replica \
  psql -U postgres -c "SELECT pg_is_in_recovery();"
# Deve restituire: f (false) → il nodo è diventato primary
```

**Risultato atteso:** `pg_is_in_recovery()` restituisce `f`

### Fase B.4 — Redirigere il backend sulla replica

```bash
# Modificare podman-compose.yml: cambiare DB_HOST da inventory-db a inventory-db-replica
sed -i 's/DB_HOST=inventory-db/DB_HOST=inventory-db-replica/' podman-compose.yml

# Riavviare il backend
podman-compose -f podman-compose.yml up -d backend

# Verificare
curl -f http://localhost:8000/health
```

### Fase B.5 — Verifica integrità dati

```bash
podman exec inventory-db-replica \
  psql -U postgres -d vault_inventory_db \
  -c "SELECT count(*) FROM inventory.utenze;"

podman exec inventory-db-replica \
  psql -U postgres -d vault_inventory_db \
  -c "SELECT count(*) FROM inventory.sistemi_target;"
```

**Risultato atteso:** I conteggi coincidono con quelli registrati prima del drill.

Conteggi pre-drill:
- `inventory.utenze`: ___________
- `inventory.sistemi_target`: ___________

Conteggi post-recovery:
- `inventory.utenze`: ___________
- `inventory.sistemi_target`: ___________

### Fase B.6 — Ripristino della situazione normale (rollback del test)

```bash
# Ricreare il primary dal nuovo primary (ex-replica)
# 1. Ripristinare DB_HOST nel podman-compose.yml
sed -i 's/DB_HOST=inventory-db-replica/DB_HOST=inventory-db/' podman-compose.yml

# 2. Eliminare il volume del vecchio primary e ricreare il container
podman volume rm password-manager_postgres_data || true
podman-compose -f podman-compose.yml up -d postgres

# Il primary nuovo riprende i dati dalla replica (pg_basebackup nella init-replica.sh)
podman-compose -f podman-compose.yml up -d postgres-replica
podman-compose -f podman-compose.yml up -d backup backend
```

### ✅ / ❌ Esito: ___________  Ora completamento: ___________ Operatore: ___________

---

## Scenario C — Crash di OpenBao (restore snapshot Raft)

**Simula:** Volume `vault_data` corrotto o OpenBao non si avvia dopo un crash  
**Componente testato:** Vault Raft snapshot restore  
**Impatto atteso:** Le password non sono accessibili durante il restore (~5 minuti)

### Fase C.1 — Registrare lo stato prima del crash

```bash
# Elencare i path segreti esistenti (li useremo per la verifica post-restore)
ROOT_TOKEN=$(podman exec inventory-bao jq -r '.root_token' /vault/init/init.json)

podman exec inventory-bao \
  vault kv list -address=http://127.0.0.1:8200 secret/ \
  || echo "Nessun segreto ancora listato"
```

Path segreti registrati prima del crash:
```
(compilare manualmente)
```

### Fase C.2 — Simulare il crash / corruzione del vault

```bash
# Opzione 1: Semplice riavvio (testa auto-unseal)
podman-compose -f podman-compose.yml restart openbao

# Opzione 2: Corruzione del volume (testa restore da snapshot) — DISTRUTTIVO
podman-compose -f podman-compose.yml stop openbao
podman volume rm password-manager_vault_data
podman-compose -f podman-compose.yml up -d openbao
sleep 20
# A questo punto vault è up ma VUOTO (nessun segreto)
```

### Fase C.3 — Restore dallo snapshot più recente

```bash
# 1. Trovare lo snapshot più recente nel container backup
podman exec inventory-backup ls -lt /backups/vault/ | head -5

# 2. Identificare il nome del file da ripristinare
SNAP_FILE="vault_snapshot_YYYYMMDD_HHMMSS.snap"   # ← sostituire con il nome reale

# 3. Leggere il root token dal vault_init (il container ha già rilevato il nuovo init)
ROOT_TOKEN=$(podman exec inventory-bao jq -r '.root_token' /vault/init/init.json)

# 4. Restore dello snapshot
podman exec inventory-backup \
  sh -c "VAULT_TOKEN=${ROOT_TOKEN} vault operator raft snapshot restore \
    -address=http://inventory-bao:8200 \
    -force \
    /backups/vault/${SNAP_FILE}"

# 5. Riavviare vault per applicare lo stato ripristinato
podman-compose -f podman-compose.yml restart openbao

# 6. Attendere che vault sia unsealed e healthy
sleep 30
podman exec inventory-bao vault status -address=http://127.0.0.1:8200
```

**Risultato atteso:** `Sealed: false`

### Fase C.4 — Verifica integrità segreti

```bash
ROOT_TOKEN=$(podman exec inventory-bao jq -r '.root_token' /vault/init/init.json)

# Verificare che i path registrati in C.1 siano presenti
podman exec inventory-bao \
  env VAULT_TOKEN=${ROOT_TOKEN} \
  vault kv list -address=http://127.0.0.1:8200 secret/
```

**Risultato atteso:** I path corrispondono a quelli registrati in C.1

### ✅ / ❌ Esito: ___________  Ora completamento: ___________ Operatore: ___________

---

## Scenario D — CRASH TOTALE DELL'HOST (full DR su nuovo server)

> **⚠️ SCENARIO PRINCIPALE — Il più critico.**  
> Simula la perdita **completa e irrecuperabile** del server che ospita tutti i container, tutti i volumi Docker e tutte le configurazioni locali.  
> Viene eseguito su una **macchina nuova e pulita**.

**Prerequisito FONDAMENTALE:** I file offsite (pg_dump, vault snapshot, init.json) DEVONO essere presenti sul server DR prima del crash. Verificarli in [Fase D.0] prima di procedere.

**Tempo atteso totale:** ≤ 45 minuti

---

### Fase D.0 — Verifica pre-crash: disponibilità dei backup offsite

Eseguire questa verifica **prima** di simulare il crash (o all'inizio del drill sul nuovo host).

```bash
# Su oemdb1, verificare la presenza dei file
ssh backup@oemdb1 ls -lht /backup/nexi-vault-backups/postgres/ | head -5
ssh backup@oemdb1 ls -lht /backup/nexi-vault-backups/vault/ | head -5
ssh backup@oemdb1 ls -lht /backup/nexi-vault-backups/vault-init/ | head -5

# Verificare che l'ultimo backup non sia troppo vecchio (max 1 ora)
LAST_PG=$(ssh backup@oemdb1 ls -t /backup/nexi-vault-backups/postgres/ | head -1)
echo "Ultimo pg_dump: $LAST_PG"
```

**Risultato atteso:** File presenti, datati meno di 1 ora fa.

- pg_dump più recente: ___________
- Vault snapshot più recente: ___________
- init.json più recente: ___________

Ora verifica: ___________ Operatore: ___________

---

### Fase D.1 — Simulare il crash (sul server originale)

```bash
# ATTENZIONE: questo elimina TUTTO. Eseguire solo su ambiente di test!
podman-compose -f podman-compose.yml down -v          # ferma container e CANCELLA tutti i volumi
sudo rm -rf /var/lib/containers/storage/volumes/password-manager_*  # rimozione forzata se necessario
```

Ora crash simulato: ___________ Operatore: ___________

---

### Fase D.2 — Provisioning del nuovo host

Sul **nuovo server** (macchina DR vuota), eseguire:

```bash
# 2a. Installare Podman e podman-compose (Oracle Linux / RHEL)
dnf install -y podman
pip install podman-compose
podman --version          # deve essere >= 4.0
podman-compose --version

# 2b. Clonare il repository del progetto
git clone https://github.com/Mohamed-DN/Password-manager.git
cd Password-manager

# 2c. Creare il file .env dalle variabili di esempio
cp .env.example .env
$EDITOR .env   # inserire le stesse variabili dell'ambiente di produzione

# 2d. Creare le directory di staging per i backup
mkdir -p /tmp/dr-restore/postgres
mkdir -p /tmp/dr-restore/vault
mkdir -p /tmp/dr-restore/vault-init
```

Ora completamento provisioning: ___________ Operatore: ___________

---

### Fase D.3 — Copia dei backup dal server DR al nuovo host

```bash
OFFSITE_HOST="oemdb1"
OFFSITE_USER="backup"
OFFSITE_PATH="/backup/nexi-vault-backups"

# Copiare i file più recenti
scp "${OFFSITE_USER}@${OFFSITE_HOST}:${OFFSITE_PATH}/postgres/$(ssh ${OFFSITE_USER}@${OFFSITE_HOST} ls -t ${OFFSITE_PATH}/postgres/ | head -1)" \
    /tmp/dr-restore/postgres/

scp "${OFFSITE_USER}@${OFFSITE_HOST}:${OFFSITE_PATH}/vault/$(ssh ${OFFSITE_USER}@${OFFSITE_HOST} ls -t ${OFFSITE_PATH}/vault/ | head -1)" \
    /tmp/dr-restore/vault/

scp "${OFFSITE_USER}@${OFFSITE_HOST}:${OFFSITE_PATH}/vault-init/init.json" \
    /tmp/dr-restore/vault-init/init.json

# Verificare integrità
ls -lh /tmp/dr-restore/postgres/
ls -lh /tmp/dr-restore/vault/
ls -lh /tmp/dr-restore/vault-init/init.json
cat /tmp/dr-restore/vault-init/init.json | jq '{root_token: .root_token, keys_count: (.unseal_keys_b64 | length)}'
```

**Risultato atteso:** `keys_count: 5` e `root_token` non vuoto.

Ora completamento copia: ___________ Operatore: ___________

---

### Fase D.4 — Avvio dell'infrastruttura base (solo vault e postgres vuoti)

```bash
# Eseguire lo script di deploy completo (crea directory, build immagini, avvia i servizi)
sudo bash podman/deploy.sh

# Attendere che PostgreSQL sia healthy
until podman inspect inventory-db \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
    echo "Attendo postgres..."; sleep 5
done
echo "PostgreSQL healthy."

# Attendere che OpenBao sia healthy
until podman inspect inventory-bao \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
    echo "Attendo openbao..."; sleep 5
done
echo "OpenBao healthy."
```

Ora completamento: ___________ Operatore: ___________

---

### Fase D.5 — Ripristino PostgreSQL dal pg_dump

```bash
PG_DUMP_FILE=$(ls /tmp/dr-restore/postgres/*.dump | head -1)
echo "Ripristino da: $PG_DUMP_FILE"

# 5a. Copiare il dump nel container postgres
podman cp "${PG_DUMP_FILE}" inventory-db:/tmp/restore.dump

# 5b. Drop e recreate del database (init.sql lo crea, qui lo resettiamo)
podman exec inventory-db \
  bash -c "PGPASSWORD=rootpassword123 dropdb -U postgres vault_inventory_db --if-exists && \
           PGPASSWORD=rootpassword123 createdb -U postgres vault_inventory_db"

# 5c. Restore schema e dati
podman exec inventory-db \
  bash -c "PGPASSWORD=rootpassword123 pg_restore \
    -U postgres \
    -d vault_inventory_db \
    --clean --if-exists \
    /tmp/restore.dump"

# 5d. Re-applicare ruoli e permessi (non inclusi nel dump custom)
podman exec inventory-db \
  bash -c "PGPASSWORD=rootpassword123 psql -U postgres vault_inventory_db \
    -f /docker-entrypoint-initdb.d/01-init.sql" 2>&1 | grep -E "ERROR|NOTICE|ROLE" || true

# 5e. Verifica conteggi
podman exec inventory-db \
  bash -c "PGPASSWORD=rootpassword123 psql -U postgres -d vault_inventory_db \
    -c 'SELECT count(*) AS utenze FROM inventory.utenze; SELECT count(*) AS sistemi FROM inventory.sistemi_target;'"
```

**Risultato atteso:** I conteggi corrispondono ai valori registrati pre-crash.

Valori pre-crash (da documentazione):
- `inventory.utenze`: ___________
- `inventory.sistemi_target`: ___________

Valori post-restore:
- `inventory.utenze`: ___________
- `inventory.sistemi_target`: ___________

Corrispondono? ___________  Ora completamento: ___________ Operatore: ___________

---

### Fase D.6 — Ripristino OpenBao dal Raft snapshot

```bash
SNAP_FILE=$(ls /tmp/dr-restore/vault/*.snap | head -1)
echo "Ripristino snapshot: $SNAP_FILE"

# 6a. Copiare lo snapshot nel container backup (o nel vault direttamente)
podman cp "${SNAP_FILE}" inventory-bao:/tmp/restore.snap

# 6b. Leggere il root token dal init.json locale
ROOT_TOKEN=$(cat /tmp/dr-restore/vault-init/init.json | jq -r '.root_token')

# 6c. Copiare init.json nel volume vault_init del container
podman cp /tmp/dr-restore/vault-init/init.json inventory-bao:/vault/init/init.json

# 6d. Restore dello snapshot Raft
podman exec inventory-bao \
  sh -c "VAULT_TOKEN=${ROOT_TOKEN} vault operator raft snapshot restore \
    -address=http://127.0.0.1:8200 \
    -force \
    /tmp/restore.snap"

# 6e. Riavviare OpenBao per applicare lo stato ripristinato
podman-compose -f podman-compose.yml restart openbao
sleep 30

# 6f. Verifica
podman exec inventory-bao vault status -address=http://127.0.0.1:8200
```

**Risultato atteso:**
```
Initialized: true
Sealed:      false
```

Ora completamento: ___________ Operatore: ___________

---

### Fase D.7 — Avvio di tutti i servizi rimanenti

```bash
# 7a. Avviare replica postgres
podman-compose -f podman-compose.yml up -d postgres-replica
until podman inspect inventory-db-replica \
      --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do
    echo "Attendo replica..."; sleep 5
done
echo "Replica healthy."

# 7b. Avviare backend e verificare
podman-compose -f podman-compose.yml up -d backend
sleep 15
curl -f http://localhost:8000/health && echo "Backend OK" || echo "ERRORE: backend non risponde"

# 7c. Avviare frontend
podman-compose -f podman-compose.yml up -d frontend

# 7d. Avviare backup
podman-compose -f podman-compose.yml up -d backup

# 7e. Stato finale
podman ps --format "table {{.Names}}\t{{.Status}}"
```

**Risultato atteso:** Tutti i servizi in stato `Up (healthy)`

Ora completamento: ___________ Operatore: ___________

---

### Fase D.8 — Test funzionale end-to-end

```bash
# Test 1: API restituisce risposta valida
curl -s http://localhost:8000/api/sistemi-target | jq 'length'
# Deve essere > 0

# Test 2: Frontend carica
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# Deve restituire 200

# Test 3: Recupero di una password da OpenBao tramite API
# (sostituire i parametri con valori reali del vostro ambiente)
curl -s http://localhost:8000/api/utenze | jq '.[0]'
```

Test 1 — Sistemi target count: ___________  
Test 2 — HTTP status frontend: ___________  
Test 3 — Utenza record: ___________  

Ora completamento: ___________ Operatore: ___________

---

### Fase D.9 — Calcolo RTO effettivo

| Fase | Ora inizio | Ora fine | Durata |
|---|---|---|---|
| D.0 Verifica prerequisiti | | | |
| D.1 Simulazione crash | | | |
| D.2 Provisioning nuovo host | | | |
| D.3 Copia backup offsite | | | |
| D.4 Avvio infrastruttura | | | |
| D.5 Restore PostgreSQL | | | |
| D.6 Restore OpenBao | | | |
| D.7 Avvio servizi | | | |
| D.8 Test funzionale | | | |
| **TOTALE** | | | **_____ min** |

**RTO target: ≤ 45 minuti**  
**RTO misurato: _____ minuti**  
**Obiettivo raggiunto: ✅ / ❌**

### ✅ / ❌ Esito Scenario D: ___________  Ora completamento totale: ___________ Operatore: ___________

---

## 9. Checklist di verifica post-recovery

Dopo ogni drill, verificare:

- [ ] `podman ps --format "table {{.Names}}\t{{.Status}}"` mostra tutti i servizi `Up (healthy)`
- [ ] `GET http://localhost:8000/health` restituisce HTTP 200
- [ ] `GET http://localhost:5173` restituisce HTTP 200
- [ ] `SELECT count(*) FROM inventory.utenze` corrisponde al valore pre-crash
- [ ] `SELECT count(*) FROM inventory.sistemi_target` corrisponde al valore pre-crash
- [ ] `vault kv list secret/` lista i percorsi presenti prima del crash
- [ ] Il container backup scrive correttamente in `/backups/` (controllare `/var/log/backup.log`)
- [ ] La replica PostgreSQL è in streaming replication (`pg_stat_replication` ha almeno 1 riga)
- [ ] Il cron dell'offsite-copy è attivo e configurato con `OFFSITE_HOST`

---

## 10. Firma e approvazione

| Ruolo | Nome | Firma | Data |
|---|---|---|---|
| Responsabile DR | | | |
| Esecutore Drill | | | |
| Osservatore / Revisore | | | |

---

## Appendice — Log delle azioni durante il drill

| Ora | Azione | Operatore | Esito | Note |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

---

## Appendice — Contatti di emergenza

| Ruolo | Nome | Telefono | Email |
|---|---|---|---|
| Responsabile Infrastruttura | | | |
| DBA PostgreSQL | | | |
| Security (OpenBao) | | | |
| On-call di turno | | | |
