# Secure Vault Inventory (Nexi Edition)

Questa applicazione è progettata per rimpiazzare la gestione degli asset e delle password basata su Excel con una soluzione **Production-Grade**, sicura e centralizzata.

## 🚀 Architettura del Sistema

Il sistema si basa su un'architettura a tre livelli (Frontend, Backend, Security Layer):

1.  **Frontend (React + Vite)**: Un'interfaccia moderna e dinamica che si adatta alla tecnologia selezionata.
2.  **Backend (FastAPI)**: Un ponte asincrono che orchestra i dati tra il database e la cassaforte dei segreti.
3.  **Security Layer (OpenBao/Vault)**: Le password NON sono salvate nel database. Sono criptate e gestite da OpenBao (fork di HashiCorp Vault) con **Raft storage persistente** (nessun rischio di perdita dati al riavvio).
4.  **Database (PostgreSQL)**: Utilizzato per i metadati strutturati e le configurazioni flessibili tramite il tipo di dato `JSONB`.
5.  **Replica PostgreSQL**: Hot-standby in streaming replication per alta disponibilità e failover immediato.
6.  **Backup automatico**: Container dedicato che esegue ogni ora `pg_dump` + snapshot Raft di Vault, con retention a 7 giorni.

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
│   └── crontab             # Esecuzione oraria
├── docs/
│   ├── database/           # Schema DB e sicurezza
│   ├── security/           # Configurazione OpenBao
│   └── backup/
│       └── BACKUP_RESTORE.md  # Procedure di ripristino
├── docker-compose.yml      # Orchestrazione completa (6 servizi)
├── init.sql                # Schema del database (Dati strutturati + JSONB)
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

## ⚡ Come avviarlo in locale

1.  Assicurati di avere Docker e Docker Compose installati.
2.  Esegui il comando:
    ```bash
    docker-compose up -d --build
    ```
3.  Accedi al frontend: `http://localhost:5173`
4.  Accedi alle API (Swagger): `http://localhost:8000/docs`

## 🔒 Sicurezza
- **Vault Token**: In modalità produzione (Raft storage) il root token viene generato al primo avvio e salvato in `/vault/init/init.json` (volume Docker `vault_init`). Proteggere questo file con storage cifrato.
- **Postgres**: Utilizza schemi separati (`inventory`) e permessi granulari per l'utente applicativo.
- **Backup**: I backup vengono salvati nel volume `backups_data`. In produzione, copiare i backup anche su object storage off-site (es. OCI Object Storage, S3).
- **Unseal Keys**: In produzione, distribuire le 5 unseal key tra 5 custodi diversi e non tenerne più di 3 (soglia) in un unico luogo.

---
*Progettato per Nexi - Password Management Modernization*
