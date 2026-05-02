# 🔐 NexiVault - Enterprise Password Manager

Sistema enterprise per la gestione sicura di credenziali e password, sviluppato con architettura moderna e best practices di sicurezza.

## 🚀 Quick Start

### Avvio Rapido con Podman (Consigliato)

```bash
# Clona e entra nella directory
git clone <repository-url> nexivault
cd nexivault

# Avvia tutti i servizi
podman-compose up -d --build

# Verifica stato
podman-compose ps

# Accedi al frontend
Apri http://localhost:5173
```

### Avvio con Docker

```bash
docker-compose up -d --build
```

---

## 📋 Indice Documentazione

1. **[Guida Installazione Podman](docs/PODMAN_SETUP_GUIDE.md)** - Setup completo passo-passo
2. **[Schema Database](docs/database/SCHEMA.md)** - Modello dati e relazioni
3. **[Configurazione OpenBao](docs/security/OPENBAO_CONFIG.md)** - Security vault
4. **[Backup & Restore](docs/backup/BACKUP_RESTORE.md)** - Disaster recovery
5. **[Disaster Recovery Drill](docs/backup/DDR_DISASTER_RECOVERY_DRILL.md)** - Test procedure

---

## 🔒 Caratteristiche Principali

### Sicurezza Enterprise-Grade

| Feature | Descrizione | Beneficio |
|---------|-------------|-----------|
| **OpenBao Vault** | Cifratura segreti con KV v2 | Zero-trust architecture |
| **PostgreSQL Replica** | Hot-standby streaming replication | Alta disponibilità |
| **Audit Logging** | Tracciamento completo operazioni | Compliance normativa |
| **Session Management** | Timeout automatico 1h | Protezione da accessi non autorizzati |
| **Password History** | 1000 versioni per segreto | Audit trail 10+ anni |
| **Security Headers** | HTTP headers di protezione | Difesa da attacchi web |

### Funzionalità Business

✅ **Multi-Tecnologia**: Oracle, MySQL, PostgreSQL, NoSQL (Cassandra/Couchbase), OCI  
✅ **Multi-Ambiente**: Produzione, Pre-produzione, Collaudo, Sviluppo  
✅ **Compliance**: Ticket IR obbligatori, BAO Owner tracciati  
✅ **Soft-Delete**: Archiviazione sicura con storico  
✅ **Dashboard**: Statistiche real-time e filtri avanzati  
✅ **Form Dinamico**: Configurazione specifica per tecnologia  

---

## 🏗️ Architettura Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                      NEXIVAULT STACK                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Frontend   │───▶│   Backend    │───▶│  PostgreSQL  │  │
│  │ React + TS   │◀───│   FastAPI    │◀───│  Primary DB  │  │
│  │  Port 5173   │    │  Port 8000   │    │  Port 5432   │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│         │                    │                  │          │
│         │                    ▼                  ▼          │
│         │            ┌──────────────┐   ┌──────────────┐  │
│         │            │   OpenBao    │   │   Replica    │  │
│         │            │   Vault      │   │  Standby     │  │
│         │            │  Port 8200   │   │  Port 5433   │  │
│         │            └──────────────┘   └──────────────┘  │
│         │                                                  │
│         ▼                                                  │
│  ┌──────────────┐                                         │
│  │    Backup    │                                         │
│  │ Hourly Jobs  │                                         │
│  │   + Offsite  │                                         │
│  └──────────────┘                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Componenti Stack Tecnologico

| Layer | Tecnologia | Versione | Scopo |
|-------|-----------|----------|-------|
| **Frontend** | React + TypeScript + Vite | 18.x | UI moderna e reattiva |
| **Backend** | Python + FastAPI | 3.11 / 0.109 | API RESTful async |
| **Database** | PostgreSQL | 16-alpine | Metadati transazionali |
| **Replica** | PostgreSQL Hot Standby | 16-alpine | HA e read scaling |
| **Secrets** | OpenBao (Vault fork) | 2.2 | Cifratura password |
| **Runtime** | Podman / Docker | 4.0+ / 24.x | Containerizzazione |
| **Backup** | pg_dump + Vault snapshot | - | Disaster recovery |

---

## 📁 Struttura Repository

```
nexivault/
├── backend/                    # API FastAPI Python
│   ├── main.py                # Entry point applicazione
│   ├── database.py            # Connessione PostgreSQL async
│   ├── vault.py               # Client OpenBao HVCA
│   ├── requirements.txt       # Dipendenze Python
│   ├── Dockerfile             # Build container
│   ├── models/
│   │   └── schemas.py         # Modelli Pydantic (validazione)
│   ├── routers/
│   │   ├── auth.py            # Autenticazione & sessioni
│   │   ├── lookups.py         # Dati dropdown (ambienti, tech, ...)
│   │   ├── dashboard.py       # Statistiche dashboard
│   │   ├── entries.py         # Creazione unificata entry
│   │   ├── utenze.py          # CRUD utenze
│   │   └── audit.py           # Audit log queries
│   └── middleware/
│       └── security.py        # HTTP security headers
│
├── frontend/                   # UI React TypeScript
│   ├── src/
│   │   ├── App.tsx            # Componente principale
│   │   ├── main.tsx           # Entry point React
│   │   ├── index.css          # Stili globali
│   │   ├── components/        # Componenti riutilizzabili
│   │   ├── hooks/             # Custom React hooks
│   │   └── context/           # Context API (auth, theme)
│   ├── package.json           # Dipendenze Node
│   ├── vite.config.ts         # Config Vite bundler
│   └── Dockerfile             # Build container (opzionale)
│
├── vault/                      # OpenBao configurazione
│   ├── Dockerfile             # Build immagine Vault
│   ├── config/
│   │   └── vault.hcl          # Config Raft storage
│   └── entrypoint.sh          # Init & unseal script
│
├── backup/                     # Servizio backup automatico
│   ├── Dockerfile             # Build container backup
│   ├── backup.sh              # Script pg_dump + vault snapshot
│   ├── offsite-copy.sh        # Rsync su server remoto
│   └── crontab                # Schedule hourly jobs
│
├── scripts/                    # Inizializzazione database
│   ├── init-primary.sh        # Config primary DB + replication
│   └── init-replica.sh        # Setup hot standby replica
│
├── docs/                       # Documentazione completa
│   ├── PODMAN_SETUP_GUIDE.md  # 📖 Guida installazione Podman
│   ├── MIGRATION_GUIDE.md     # Migrazione da PHP
│   ├── init_production.sql    # Schema produzione
│   ├── database/
│   │   ├── SCHEMA.md          # Modello dati dettagliato
│   │   ├── ROLES_AND_SECURITY.md  # Ruoli e permessi DB
│   │   └── CONNECTIVITY.md    # Guide connessione
│   ├── security/
│   │   └── OPENBAO_CONFIG.md  # Configurazione Vault
│   └── backup/
│       ├── BACKUP_RESTORE.md  # Procedure backup/restore
│       └── DDR_DISASTER_RECOVERY_DRILL.md  # Test DR
│
├── archive/                    # Archivio storico
│   └── php-reference/         # Progetto PHP originale (riferimento)
│
├── docker-compose.yml          # Orchestrazione Docker
├── podman-compose.yml          # Orchestrazione Podman (consigliato)
├── init.sql                    # Schema DB + seed data
├── README.md                   # Questo file
└── CHANGELOG.md                # Changelog versioni
```

---

## 🔧 Configurazione Ambiente

### Variabili Ambiente (.env)

Crea un file `.env` nella root del progetto:

```bash
# Replica PostgreSQL: 'async' (default) o 'sync'
REPLICATION_MODE=async

# Offsite backup server configuration
OFFSITE_HOST=oemdb1
OFFSITE_PORT=22
OFFSITE_USER=backup
OFFSITE_PATH=/backup/nexi-vault-backups
OFFSITE_SSH_KEY=/opt/nexivault/.ssh/id_rsa
```

### Credenziali Default (CAMBIARE IN PRODUZIONE!)

| Servizio | Utente | Password | Note |
|----------|--------|----------|------|
| PostgreSQL Admin | `inventory_admin` | `SuperSegretaAdmin123!` | Solo manutenzione DB |
| PostgreSQL App | `inventory_app` | `PasswordBackend123!` | Backend API |
| PostgreSQL Read | `inventory_read` | `ReadPassword123!` | Query in lettura |
| Replication | `replicator` | `ReplicaPassword123!` | Streaming replica |
| Database Name | `vault_inventory_db` | - | Schema: `inventory` |

⚠️ **Importante**: Cambia tutte le password prima del deploy in produzione!

---

## 🚀 Deploy Step-by-Step

### Prerequisiti

- Podman ≥ 4.0 o Docker ≥ 24.x
- podman-compose ≥ 1.0 o docker compose v2
- 8 GB RAM minimi (16 GB consigliati)
- 50 GB storage SSD

### Passo 1: Clona Repository

```bash
cd /opt
git clone <repository-url> nexivault
cd nexivault
```

### Passo 2: Configura SSH per Offsite Backup (Opzionale)

```bash
# Genera chiave SSH dedicata
mkdir -p .ssh
ssh-keygen -t ed25519 -f .ssh/id_rsa -N "" -C "nexivault-backup"

# Copia public key sul server offsite
ssh-copy-id -i .ssh/id_rsa.pub backup@oemdb1

# Imposta permessi corretti
chmod 600 .ssh/id_rsa
chmod 644 .ssh/id_rsa.pub
```

### Passo 3: Avvia Servizi

```bash
# Con Podman (consigliato)
podman-compose up -d --build

# Con Docker
docker-compose up -d --build
```

### Passo 4: Verifica Health Check

```bash
# Stato container
podman-compose ps

# Log servizi
podman-compose logs -f

# Test API
curl http://localhost:8000/api/lookups

# Test frontend
Apri http://localhost:5173
```

### Passo 5: Inizializza OpenBao (Primo Avvio)

Al primo avvio, Vault potrebbe richiedere inizializzazione:

```bash
# Accedi al container Vault
podman exec -it inventory-bao /bin/sh

# Verifica status
vault status

# Se non inizializzato, esegui:
vault operator init -key-shares=5 -key-threshold=3

# ⚠️ SALVA CHIAVI E TOKEN IN UN LUOGO SICURO!
```

---

## 📊 API Endpoints

### Autenticazione

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Login utente | ❌ |
| POST | `/api/auth/logout` | Logout | ✅ |
| GET | `/api/auth/me` | Info utente corrente | ✅ |

### Lookups (Dati Dropdown)

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| GET | `/api/lookups` | Ambienti, tecnologie, tipi, owners, ticket | ✅ |

### Dashboard

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| GET | `/api/dashboard/stats` | Statistiche generali | ✅ |

### Gestione Utenze

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| GET | `/api/utenze` | Lista utenze (con filtri) | ✅ |
| GET | `/api/utenze/{id}` | Dettaglio utenza | ✅ |
| GET | `/api/utenze/{id}/password` | Rivela password | ✅ |
| PATCH | `/api/utenze/{id}/password` | Cambia password | ✅ |
| DELETE | `/api/utenze/{id}` | Soft-delete utenza | ✅ |
| GET | `/api/utenze/{id}/history` | Storico password | ✅ |
| GET | `/api/utenze/cancellate` | Lista utenze cancellate | ✅ |

### Entry Unificate

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/api/entry` | Crea sistema + utenza in una chiamata | ✅ |

### Audit Log

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| GET | `/api/audit` | Log operazioni | ✅ |
| GET | `/api/history/global` | Storico globale password | ✅ |

---

## 🔐 Modello di Sicurezza

### Vault Path Convention

I segreti sono organizzati in OpenBao con questo schema:

```
inventory/
└── sistemi/
    └── {sistema_id}/
        └── utenti/
            └── {username}
```

Esempio: `inventory/sistemi/42/utenti/PPIPPO_SV`

### Password Retention Policy

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Versioni mantenute** | 1000 per segreto | Audit trail 10+ anni |
| **Retention temporale** | ~10 anni | Compliance normativa |
| **Storage efficiente** | Incrementale (delta) | Ottimizzazione spazio |
| **Rotazione tipica** | Mensile/Settimanale | Best practice security |

### Audit Logging

Ogni operazione viene tracciata con:

- ✅ Timestamp preciso (timezone aware)
- ✅ Utente operatore (chi ha fatto l'azione)
- ✅ Tipo operazione (CREATE, UPDATE, DELETE, VIEW_PASSWORD, ecc.)
- ✅ Dettagli operativi (snapshot JSON vecchi/nuovi valori)
- ✅ Indirizzo IP client
- ✅ User agent (se disponibile)

Query esempio:

```sql
-- Ultime 50 operazioni
SELECT timestamp, utente_operatore, azione, dettagli
FROM inventory.audit_log
ORDER BY timestamp DESC
LIMIT 50;

-- Accessi password oggi
SELECT COUNT(*), azione
FROM inventory.audit_log
WHERE timestamp >= CURRENT_DATE
GROUP BY azione;

-- Operazioni per utente
SELECT utente_operatore, COUNT(*) AS operazioni
FROM inventory.audit_log
WHERE timestamp >= CURRENT_DATE
GROUP BY utente_operatore
ORDER BY operazioni DESC;
```

---

## 📈 Miglioramenti vs Progetto Originale PHP

Dal progetto PHP del collega sono stati migrati e migliorati:

### Backend

1. ✅ **Schema database completo** - Tutte le tabelle e relazioni preservate
2. ✅ **Session management** - Timeout 1h, cookie sicuri, CSRF protection
3. ✅ **Audit logging** - Tracciamento granulare di ogni operazione
4. ✅ **Dashboard statistics** - Query ottimizzate con indici
5. ✅ **Filtri avanzati** - Ricerca full-text e filtri multipli
6. ✅ **Form dinamico** - Campi specifici per tecnologia (MySQL, Postgres, OCI, NoSQL)
7. ✅ **Gestione BAO Owner** - Creazione al volo con validazione
8. ✅ **Ticket IR obbligatori** - Compliance garantita
9. ✅ **Password history** - Versioning 1000 versioni per segreto
10. ✅ **Security headers** - HSTS, CSP, X-Frame-Options, ecc.

### Architettura

| Aspetto | Progetto PHP | NexiVault Moderno | Beneficio |
|---------|--------------|-------------------|-----------|
| **Linguaggio** | PHP monolitico | Python FastAPI async | Performance + manutenibilità |
| **Frontend** | PHP templating | React + TypeScript | UX moderna, type safety |
| **Database** | PostgreSQL | PostgreSQL + replica HA | Disponibilità 99.9% |
| **Secrets** | Vault base | OpenBao KV v2 versionato | Audit trail completo |
| **Container** | Docker base | Podman-ready, SELinux aware | Security enterprise |
| **Backup** | Manuale | Automatico hourly + offsite | Disaster recovery |
| **Documentation** | Limitata | Completa step-by-step | Onboarding rapido |

---

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Installa dipendenze test
pip install pytest pytest-asyncio httpx

# Esegui tests
pytest -v
```

### Frontend Tests

```bash
cd frontend

# Installa dipendenze
npm install

# Esegui tests
npm test

# Linting
npm run lint
```

### API Manual Testing

```bash
# Test health endpoint
curl http://localhost:8000/health

# Test lookups (richiede auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8000/api/lookups

# Crea entry unificata
curl -X POST http://localhost:8000/api/entry \
  -H "Content-Type: application/json" \
  -d '{
    "nome_sistema": "P1PDS2CBIP",
    "ambiente_id": 1,
    "tecnologia_id": 3,
    "username": "TEST_SV",
    "password": "SecurePass123!",
    "tipo_utenza_id": 2,
    "bao_owner": "Mario Rossi",
    "ticket_codice": "IR12345678",
    "configurazione": {"db_server": "server01"},
    "attributi_specifici": {}
  }'
```

---

## 🔧 Troubleshooting

### Problemi Comuni

#### Container Non Parte

```bash
# Verifica log
podman-compose logs <servizio>

# Controlla risorse
podman stats

# Porte in uso
ss -tlnp | grep -E '5432|8200|8000|5173'
```

#### Replica PostgreSQL Non Si Connette

```bash
# Test connettività
podman exec inventory-db-replica ping -c 3 inventory-db

# Verifica replication
podman exec inventory-db psql -U postgres -c \
  "SELECT * FROM pg_stat_replication;"
```

#### OpenBao Non Risponde

```bash
# Status Vault
podman exec inventory-bao vault status

# Se sealed, unseal con le chiavi
podman exec -it inventory-bao vault operator unseal

# Log dettagliati
podman-compose logs openbao
```

#### Performance Lente

```bash
# Monitora risorse
podman stats

# I/O disco
iostat -x 2

# Query lente DB
podman exec inventory-db psql -U postgres -d vault_inventory_db -c \
  "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

Vedi [PODMAN_SETUP_GUIDE.md](docs/PODMAN_SETUP_GUIDE.md) per troubleshooting dettagliato.

---

## 📝 License

**Proprietario** - Nexi Group S.p.A.

Tutti i diritti riservati. Il codice è confidenziale e destinato esclusivamente all'uso interno di Nexi.

---

## 👥 Team di Sviluppo

- **Architettura**: Team Platform Security
- **Backend**: Python/FastAPI development team
- **Frontend**: React/TypeScript UX team
- **DevOps**: Infrastructure & Automation team
- **Contributi originali**: Progetto PHP reference (archiviato in `archive/php-reference/`)

---

## 📞 Supporto

Per assistenza:

1. 📖 Consulta la documentazione in `docs/`
2. 🔍 Cerca nei log con `podman-compose logs`
3. 🐛 Apri un issue sul repository GitLab/GitHub
4. 📧 Contatta il team Platform Security

---

**Ultimo aggiornamento**: Maggio 2025  
**Versione**: NexiVault 2.0.0  
**Stato**: ✅ Production Ready
