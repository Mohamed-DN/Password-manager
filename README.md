# Secure Vault Inventory (Nexi Edition)

Questa applicazione è progettata per rimpiazzare la gestione degli asset e delle password basate su Excel con una soluzione **Production-Grade**, sicura e centralizzata.

## 🚀 Architettura del Sistema

Il sistema si basa su un'architettura a tre livelli (Frontend, Backend, Security Layer):

1.  **Frontend (React + Vite)**: Un'interfaccia moderna e dinamica che si adatta alla tecnologia selezionata.
2.  **Backend (FastAPI)**: Un ponte asincrono che orchestra i dati tra il database e la cassaforte dei segreti.
3.  **Security Layer (OpenBao/Vault)**: Le password NON sono salvate nel database. Sono criptate e gestite da OpenBao (fork di HashiCorp Vault) con **Raft storage persistente** (nessun rischio di perdita dati al riavvio).
4.  **Database (PostgreSQL)**: Utilizzato per i metadati strutturati e le configurazioni flessibili tramite il tipo di dato `JSONB`.
5.  **Replica PostgreSQL**: Hot-standby in streaming replication per alta disponibilità e failover immediato.
6.  **Backup automatico**: Container dedicato che esegue ogni giorno `pg_dump` + snapshot Raft di Vault, con retention locale 7 giorni e offsite 30 giorni.
7.  **Storico Password**: Tabella `storico_password` con retention 10 anni + versioning OpenBao KV v2 (max 1000 versioni per segreto).

## 📁 Struttura del Repository

```text
.
├── backend/                # Logica API e integrazione Vault
│   ├── main.py             # Endpoint API e orchestrazione Unified Entry
│   ├── database.py         # Configurazione pool di connessione Postgres (asyncpg)
│   ├── vault.py            # Client per interazione con OpenBao
│   └── populate_db.py      # Script per il seeding iniziale dei dati
├── frontend/               # Interfaccia Utente
│   ├── src/
│   │   ├── App.tsx         # Dashboard principale e Form Dinamico Adattivo
│   │   └── index.css       # Design System (Nexi Blue/Premium style)
├── scripts/                # Script di inizializzazione infrastruttura
│   ├── init-primary.sh     # Configura pg_hba.conf del primary per la replica
│   └── init-replica.sh     # Entrypoint del replica: pg_basebackup + avvio standby
├── vault/                  # Configurazione OpenBao in modalità produzione
│   ├── Dockerfile          # Immagine vault con jq
│   ├── entrypoint.sh       # Auto-init, auto-unseal e abilitazione KV v2
│   └── config/vault.hcl    # Raft storage + listener config
├── backup/                 # Container di backup schedulato
│   ├── Dockerfile          # alpine + pg-client + vault-cli + jq + dcron
│   ├── backup.sh           # pg_dump + vault raft snapshot + rotation
│   ├── offsite-copy.sh     # Rsync verso server DR (oemdb1)
│   └── crontab             # Esecuzione giornaliera alle 02:00
├── docs/
│   ├── database/           # Schema DB e sicurezza
│   ├── security/           # Configurazione OpenBao
│   └── backup/
│       └── BACKUP_RESTORE.md  # Procedure di ripristino
├── docker-compose.yml      # Orchestrazione completa (6 servizi) - Docker
├── podman-compose.yml      # Orchestrazione completa (6 servizi) - Podman
├── run-podman.sh           # Script di avvio rapido per Podman
├── init.sql                # Schema del database (Dati strutturati + JSONB + storico_password)
└── README.md               # Questa guida
```

## 🗄 Struttura del Database

La documentazione tecnica dello schema, dei ruoli e della sicurezza del database è stata spostata in una sezione dedicata:

👉 **[Dettagli Database & Sicurezza](./docs/database/SCHEMA.md)**

👉 **[Configurazione OpenBao (Vault)](./docs/security/OPENBAO_CONFIG.md)**

In sintesi:
- **Flessibilità**: Utilizzo di PostgreSQL con campi **JSONB** per adattarsi a qualsiasi tecnologia (Oracle, OCI, NoSQL).
- **Integrità**: Tracciamento di ogni operazione tramite **Audit Log**.
- **Setup**: Configurazione automatica tramite `init.sql` e gestione ruoli granulari.
- **Storico**: Tabella `storico_password` per tracciare modifiche e cancellazioni (10 anni retention).

## 🔐 Gestione 100k+ Password Critiche

Per ambienti enterprise con oltre 100.000 password critiche:

### Architettura Ibrida Consigliata

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENBAO KV v2                            │
│  - Versioning: max 1000 versioni per segreto               │
│  - Encryption: envelope encryption nativa                  │
│  - Storage: incrementale, efficiente                       │
│  - Recovery: chiavi di unseal separate dal DB              │
└─────────────────────────────────────────────────────────────┘
                          ↕ (vault_path + version)
┌─────────────────────────────────────────────────────────────┐
│                   POSTGRESQL                                │
│  - Metadati: utenze, sistemi, configurazioni               │
│  - Storico: tabella storico_password (metadati versioni)   │
│  - Audit: log completo di tutte le operazioni              │
│  - Backup: pg_dump giornaliero + WAL archive               │
└─────────────────────────────────────────────────────────────┘
```

### Perché NON salvare tutto in PostgreSQL?

1.  **Separazione dei compiti**: Il DBA può gestire il database ma non leggere le password
2.  **Envelope Encryption**: OpenBao usa chiavi di cifratura separate e ruotabili
3.  **Audit indipendente**: Gli accessi ai segreti sono tracciati separatamente
4.  **Recovery granulare**: Puoi recuperare password anche se il DB è compromesso
5.  **Compliance**: Standard enterprise richiedono HSM o secret manager dedicati

### Strategia di Retention

| Componente | Retention | Capacità | Note |
|------------|-----------|----------|------|
| OpenBao KV v2 | 1000 versioni/segreto | ~500MB per 100k password | Storage incrementale |
| PostgreSQL storico | 10 anni | ~2GB per 100k password | Solo metadati |
| Backup locale | 7 giorni | ~1GB/compresso | pg_dump + snapshot |
| Backup offsite | 30 giorni | ~4GB/compresso | Su oemdb1 (40TB disponibili) |

## 🛠 Come sono collegati i componenti?

### 1. Il Flusso di Inserimento (Unified Entry)
Quando l'utente inserisce un nuovo asset dal frontend:
1.  Il **Frontend** invia un JSON al backend (`/api/entry`).
2.  Il **Backend** divide i dati:
    - Invia la **Password** a OpenBao e riceve un `vault_path`.
    - Salva i **Metadati** (Tecnologia, Ambiente, Ticket, BAO) in PostgreSQL insieme al `vault_path`.
3.  In questo modo, se il database viene compromesso, le password rimangono al sicuro nel Vault.

### 2. Il Form Dinamico
In `App.tsx`, il form cambia i campi visualizzati in base alla `tecnologia_id` scelta. I dati "extra" (come `hba_conf` o `Cluster_name`) vengono pacchettizzati in un oggetto JSON e salvati nella colonna `configurazione` (JSONB) di Postgres. Questo permette di aggiungere nuove tecnologie senza dover cambiare lo schema del database.

### 3. Recupero Password e Audit
Quando un utente clicca su "Reveal Password":
1.  Il backend recupera il `vault_path` dal DB.
2.  Interroga OpenBao per ottenere il segreto in chiaro.
3.  **Importante**: Ogni accesso viene registrato nella tabella `audit_log`, garantendo la tracciabilità (chi ha visto cosa e quando).

### 4. Storico Password
Ogni modifica o cancellazione crea una voce in `storico_password`:
- **MODIFICA_PASSWORD**: salva `utenza_id`, `vault_path`, `vault_version` (versione precedente)
- **CANCELLAZIONE**: salva `utenza_id`, `username`, `sistema_nome`, note "cancellata"
- Il frontend mostra lo storico completo con possibilità di recuperare password storiche da OpenBao

## ⚡ Avvio Rapido

### Opzione 1: Podman (Consigliato per Oracle Linux / RHEL)

```bash
# Clone del repository
git clone <repository-url>
cd Password-manager

# Avvio automatico con script intelligente
chmod +x run-podman.sh
./run-podman.sh
```

Lo script `run-podman.sh`:
- ✅ Verifica prerequisiti (podman, podman-compose)
- ✅ Genera password sicure se non presenti
- ✅ Previene duplicazioni (container/volumi esistenti)
- ✅ Chiede se mantenere dati esistenti
- ✅ Esegue migrazioni database solo se necessario
- ✅ Attende readiness di tutti i servizi
- ✅ Mostra summary finale con comandi utili

### Opzione 2: Docker

```bash
docker-compose up -d --build
```

### Opzione 3: Podman Compose (comando diretto)

```bash
podman-compose up -d --build
```

## 🌐 Accesso ai Servizi

Dopo l'avvio:

| Servizio | URL | Note |
|----------|-----|------|
| Frontend | http://localhost:5173 | Interfaccia utente |
| Backend API | http://localhost:8000/api | Swagger: /docs |
| OpenBao UI | http://localhost:8200 | Token: vedi init.json |
| PostgreSQL | localhost:5432 | DB: vault_inventory_db |

## 📊 Comandi Utili

### Podman

```bash
# Log in tempo reale
podman-compose logs -f

# Stop servizi
podman-compose down

# Restart
podman-compose restart

# Stato container
podman ps

# Backup manuale
podman exec inventory-backup /usr/local/bin/backup.sh

# Restore da backup
# Vedi docs/backup/BACKUP_RESTORE.md
```

### Docker

```bash
# Log in tempo reale
docker-compose logs -f

# Stop servizi
docker-compose down

# Restart
docker-compose restart

# Stato container
docker ps

# Backup manuale
docker exec inventory-backup /usr/local/bin/backup.sh
```

## 🔒 Sicurezza

### Vault Token e Unseal Keys

- In modalità produzione (Raft storage) il root token viene generato al primo avvio e salvato in `/vault/init/init.json` (volume Docker/Podman `vault_init`).
- **Proteggere questo file** con storage cifrato o secret manager.
- Le 5 unseal key vanno distribuite tra 5 custodi diversi.
- Non tenere più di 3 unseal key (soglia necessaria) in un unico luogo.

### Postgres

- Utilizza schemi separati (`inventory`) e permessi granulari per l'utente applicativo.
- L'utente `inventory_app` ha permessi limitati allo schema `inventory`.
- Audit log traccia tutte le operazioni sensibili.

### Backup

- I backup locali vengono salvati nel volume `backups_data` (retention: 7 giorni).
- Il backup offsite viene copiato su `oemdb1:/backup/nexi-vault-backups` (retention: 30 giorni).
- In produzione, considerare anche object storage off-site (es. OCI Object Storage, S3).
- Le chiavi SSH per l'offsite vanno generate con `podman/setup-offsite-ssh.sh`.

### Rete

- Tutti i servizi comunicano via rete interna containerizzata.
- Solo Frontend, Backend e OpenBao sono esposti sull'host.
- PostgreSQL e Replica non sono esposti esternamente di default.

## 🎯 Produzione

Per deployment in produzione:

1.  **Quadlet systemd**: Usa i file `.container` e `.volume` in `podman/quadlets/`
2.  **SELinux**: I volumi hanno già l'etichetta `:z` per SELinux enforcing
3.  **Firewall**: Configura regole per esporre solo le porte necessarie
4.  **Monitoraggio**: Integra con Prometheus/Grafana per alerting
5.  **DR Test**: Esegui test di restore trimestrali seguendo `docs/backup/BACKUP_RESTORE.md`

Vedi **[Guida Produzione Podman](./docs/PODMAN_PRODUCTION_GUIDE.md)** per dettagli completi.

---

*Progettato per Nexi - Password Management Modernization*
*Versione Enterprise: supporto 100k+ password, retention 10 anni, DR offsite*
