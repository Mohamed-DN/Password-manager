# 📘 Guida Completa: Costruire un Password Manager Enterprise da Zero

> **Livello**: Intermedio-Avanzato  
> **Tempo stimato**: 4-6 ore  
> **Prerequisiti**: Conoscenza base di Linux, Docker/Podman, SQL, Python

---

## 🎯 Obiettivo del Progetto

Costruire un **sistema di gestione password enterprise** per aziende critiche con:
- ✅ Supporto per **100.000+ password**
- ✅ **Retention illimitata** delle password storiche (mai perdere nulla)
- ✅ **OpenBao** (ex HashiCorp Vault) per cifratura enterprise-grade
- ✅ **PostgreSQL** per metadati e storico
- ✅ Backup giornalieri con retention 7 giorni locale + 30 giorni offsite
- ✅ Frontend React moderno
- ✅ Deploy con Podman (Docker-compatible)

---

## 📚 Indice

1. [Architettura del Sistema](#1-architettura-del-sistema)
2. [Prerequisiti e Installazione](#2-prerequisiti-e-installazione)
3. [Step 1: Struttura del Progetto](#3-step-1-struttura-del-progetto)
4. [Step 2: Database Schema](#4-step-2-database-schema)
5. [Step 3: OpenBao Configuration](#5-step-3-openbao-configuration)
6. [Step 4: Backend API (Python)](#6-step-4-backend-api-python)
7. [Step 5: Frontend React](#7-step-5-frontend-react)
8. [Step 6: Sistema di Backup](#8-step-6-sistema-di-backup)
9. [Step 7: Containerizzazione](#9-step-7-containerizzazione)
10. [Step 8: Avvio e Testing](#10-step-8-avvio-e-testing)
11. [Step 9: Produzione e Sicurezza](#11-step-9-produzione-e-sicurezza)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architettura del Sistema

### Diagramma Architetturale

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                    React + TypeScript                            │
│                  http://localhost:5173                           │
└──────────────┬──────────────────────────────────────────────────┘
               │ REST API
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND                                   │
│                   FastAPI (Python)                               │
│                  http://localhost:8000                           │
│  ┌─────────────────────────────┐  ┌──────────────────────────┐  │
│  │   PostgreSQL                │  │   OpenBao                │  │
│  │   - utenze                  │  │   - password cifrate     │  │
│  │   - sistemi_target          │  │   - envelope encryption  │  │
│  │   - storico_password        │  │   - versioning (1000+)   │  │
│  │   - audit_log               │  │   - key rotation         │  │
│  └─────────────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKUP SYSTEM                               │
│   Daily pg_dump + Vault snapshot → 7 giorni locale              │
│   Rsync offsite → 30 giorni su server DR                        │
└─────────────────────────────────────────────────────────────────┘
```

### Perché OpenBao + PostgreSQL?

| Componente | Cosa Contiene | Perché Separato |
|------------|---------------|-----------------|
| **OpenBao** | Password cifrate (segreti veri) | Envelope encryption, audit indipendente, HSM-ready |
| **PostgreSQL** | Metadati, utenti, storico (riferimenti) | Query veloci, relazioni, backup tradizionali |

**Vantaggi chiave:**
- 🔐 **Separazione dei compiti**: Il DBA non può leggere le password senza token Vault
- 🛡️ **Envelope Encryption**: Le password sono cifrate con chiavi gestite da OpenBao
- 📊 **Audit indipendente**: OpenBao logga ogni accesso ai segreti
- ♾️ **Versioning illimitato**: Configura `max_versions` alto (1000+) per retention storica
- 🚀 **Recovery granulare**: Puoi recuperare solo password o solo metadati

---

## 2. Prerequisiti e Installazione

### Software Richiesto

```bash
# Verifica versioni minime
podman --version          # >= 4.0
podman-compose --version  # >= 2.0
python3 --version         # >= 3.9
node --version            # >= 18.0
psql --version            # >= 13.0
```

### Installazione su Linux (Fedora/RHEL/CentOS)

```bash
# Installa Podman
sudo dnf install -y podman podman-compose

# Installa Python e dipendenze
sudo dnf install -y python3 python3-pip python3-devel

# Installa Node.js (da NodeSource)
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Installa PostgreSQL client
sudo dnf install -y postgresql
```

### Installazione su macOS

```bash
# Con Homebrew
brew install podman podman-compose python node postgresql

# Inizializza macchina virtuale Podman
podman machine init
podman machine start
```

---

## 3. Step 1: Struttura del Progetto

Crea la struttura directory:

```bash
mkdir -p password-manager/{backend,frontend,backup,database,docs}
cd password-manager

# Struttura finale
tree -L 2
```

```
password-manager/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── vault.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── backup/
│   ├── backup.sh
│   ├── offsite-copy.sh
│   └── crontab
├── database/
│   └── init.sql
├── .env.example
├── podman-compose.yml
└── README.md
```

---

## 4. Step 2: Database Schema

Crea `database/init.sql`:

```sql
-- ============================================
-- SCHEMA DATABASE PASSWORD MANAGER ENTERPRISE
-- ============================================

-- Estensioni utili
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TIPI DI UTENZA (es. ADMIN, USER, SERVICE_ACCOUNT)
CREATE TABLE tipi_utenza (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(50) UNIQUE NOT NULL,
    descrizione TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. SISTEMI TARGET (dove risiedono le credenziali)
CREATE TABLE sistemi_target (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- ORACLE, MYSQL, POSTGRES, SAP, etc.
    host VARCHAR(255),
    porta INTEGER,
    configurazione JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. UTENZE (le credenziali vere e proprie)
CREATE TABLE utenze (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sistema_target_id INTEGER NOT NULL,
    tipo_utenza_id INTEGER NOT NULL,
    username VARCHAR(150) NOT NULL,
    vault_path VARCHAR(500) NOT NULL UNIQUE, -- Percorso in OpenBao
    attributi_specifici JSONB,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ, -- Soft-delete
    CONSTRAINT fk_utenze_sistema FOREIGN KEY (sistema_target_id) REFERENCES sistemi_target(id),
    CONSTRAINT fk_utenze_tipo FOREIGN KEY (tipo_utenza_id) REFERENCES tipi_utenza(id)
);

-- 4. STORICO PASSWORD (METADATI - 10 ANNI DI RETENTION)
-- IMPORTANTE: Non contiene password! Solo riferimenti a OpenBao
CREATE TABLE storico_password (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    utenza_id INTEGER NOT NULL,
    username VARCHAR(150) NOT NULL, -- Denormalizzato per query post-cancellazione
    sistema_nome VARCHAR(150) NOT NULL,
    vault_path VARCHAR(500) NOT NULL,
    vault_version INTEGER NOT NULL, -- Versione specifica in OpenBao
    azione VARCHAR(30) NOT NULL CHECK (azione IN ('MODIFICA_PASSWORD', 'CANCELLAZIONE')),
    eseguito_da VARCHAR(100),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_storico_utenza FOREIGN KEY (utenza_id) REFERENCES utenze(id)
);

-- Indici per performance su grandi volumi
CREATE INDEX idx_storico_utenza ON storico_password(utenza_id);
CREATE INDEX idx_storico_created ON storico_password(created_at);
CREATE INDEX idx_storico_azione ON storico_password(azione);

-- 5. AUDIT LOG (traccia tutti gli accessi)
CREATE TABLE audit_log (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    endpoint VARCHAR(255),
    metodo VARCHAR(10),
    status_code INTEGER,
    details JSONB
);

-- Popolazione iniziale
INSERT INTO tipi_utenza (nome, descrizione) VALUES
('ADMIN', 'Amministratore di sistema'),
('USER', 'Utente standard'),
('SERVICE', 'Account di servizio'),
('READONLY', 'Solo lettura');
```

---

## 5. Step 3: OpenBao Configuration

### Configurazione Base

OpenBao deve essere configurato con:
- **KV v2 engine** montato su `secret/`
- **max_versions = 1000** (per retention illimitata)
- **Raft storage** per alta disponibilità

```hcl
# config.hcl
storage "raft" {
  path    = "/vault/data"
  node_id = "node1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true # Usa TLS in produzione!
}

api_addr = "http://localhost:8200"
ui = true
```

### Init e Unseal

```bash
# Inizializza Vault (salva output in luogo sicuro!)
export VAULT_ADDR='http://localhost:8200'
vault operator init > init-keys.txt

# Estrai chiavi e token root
UNSEAL_KEYS=$(grep 'Unseal Key' init-keys.txt | cut -d':' -f2 | tr -d ' ')
ROOT_TOKEN="" 'Initial Root Token' init-keys.txt | cut -d':' -f2 | tr -d ' ')

# Unseal (ripeti per 3 chiavi diverse)
vault operator unseal $UNSEAL_KEY_1
vault operator unseal $UNSEAL_KEY_2
vault operator unseal $UNSEAL_KEY_3

# Abilita KV v2
vault secrets enable -path=secret kv-v2

# Configura max_versions
vault secrets tune -max-versions=1000 secret
```

---

## 6. Step 4: Backend API (Python)

### 6.1 Installa Dipendenze

```bash
cd backend
pip install fastapi uvicorn psycopg2-binary hvac python-dotenv pydantic
```

### 6.2 File `requirements.txt`

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
psycopg2-binary==2.9.9
hvac==2.0.0
python-dotenv==1.0.0
pydantic==2.5.0
```

### 6.3 File `vault.py`

```python
import os
import hvac
from dotenv import load_dotenv

load_dotenv()

VAULT_ADDR = os.getenv("VAULT_ADDR", "http://openbao:8200")
VAULT_TOKEN="""VAULT_TOKEN")

client = hvac.Client(url=VAULT_ADDR, token=""

def configure_kv_max_versions(max_versions: int = 1000) -> None:
    """Configura KV v2 per retention illimitata"""
    try:
        client.secrets.kv.v2.configure(max_versions=max_versions)
        print(f"✓ OpenBao configurato: max_versions={max_versions}")
    except Exception as e:
        print(f"⚠ Warning: {e}")

def store_password(vault_path: str, password: "" -> bool:
    """Salva password in OpenBao (crea nuova versione automaticamente)"""
    try:
        client.secrets.kv.v2.create_or_update_secret(
            path=vault_path,
            secret="""password": password}
        )
        return True
    except Exception as e:
        print(f"Errore: {e}")
        return False

def get_current_vault_version(vault_path: str) -> int | None:
    """Ottieni versione corrente prima di modificare"""
    try:
        meta = client.secrets.kv.v2.read_secret_metadata(path=vault_path)
        return meta['data']['current_version']
    except:
        return None

def get_password_by_version(vault_path: str, version: int) -> str | None:
    """Recupera password storica per versione specifica"""
    try:
        response = client.secrets.kv.v2.read_secret_version(
            path=vault_path,
            version=version
        )
        return response['data']['data']['password']
    except:
        return None
```

### 6.4 File `database.py`

```python
import os
import psycopg2
from psycopg2.extras import RealDictCursor

DB_HOST = os.getenv("DB_HOST", "inventory-db")
DB_NAME = os.getenv("DB_NAME", "password_manager")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD="""DB_PASSWORD")

def get_connection():
    return psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=""
    )

def execute_query(query, params=None, fetch=False):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(query, params)
    if fetch:
        result = cur.fetchall()
    else:
        result = None
    conn.commit()
    cur.close()
    conn.close()
    return result
```

### 6.5 File `main.py` (API Principali)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import vault, database
from datetime import datetime

app = FastAPI(title="Password Manager Enterprise")

class PasswordUpdate(BaseModel):
    nuova_password: ""
    eseguito_da: str

@app.on_event("startup")
async def startup():
    vault.configure_kv_max_versions(1000)

@app.patch("/api/utenze/{id}/password")
async def update_password(id: int, data: PasswordUpdate):
    # 1. Ottieni utenza corrente
    utenza = database.execute_query(
        "SELECT * FROM utenze WHERE id = %s", (id,), fetch=True
    )
    if not utenza:
        raise HTTPException(404, "Utenza non trovata")
    
    # 2. Salva versione vecchia nello storico PRIMA di modificare
    old_version = vault.get_current_vault_version(utenza[0]['vault_path'])
    if old_version:
        database.execute_query("""
            INSERT INTO storico_password 
            (utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da)
            VALUES (%s, %s, %s, %s, %s, 'MODIFICA_PASSWORD', %s)
        """, (id, utenza[0]['username'], 'Sistema', utenza[0]['vault_path'], old_version, data.eseguito_da))
    
    # 3. Aggiorna password in OpenBao (crea nuova versione)
    vault.store_password(utenza[0]['vault_path'], data.nuova_password)
    
    return {"status": "ok", "message": "Password aggiornata"}

@app.delete("/api/utenze/{id}")
async def delete_utenza(id: int, eseguito_da: str):
    # 1. Registra cancellazione nello storico
    utenza = database.execute_query(
        "SELECT * FROM utenze WHERE id = %s AND deleted_at IS NULL", (id,), fetch=True
    )
    if utenza:
        database.execute_query("""
            INSERT INTO storico_password 
            (utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da, note)
            VALUES (%s, %s, %s, %s, %s, 'CANCELLAZIONE', %s, 'Utenza cancellata logicamente')
        """, (id, utenza[0]['username'], 'Sistema', utenza[0]['vault_path'], None, eseguito_da))
        
        # 2. Soft-delete
        database.execute_query(
            "UPDATE utenze SET deleted_at = %s WHERE id = %s",
            (datetime.now(), id)
        )
    
    return {"status": "ok"}

@app.get("/api/utenze/{id}/history")
async def get_password_history(id: int):
    """Recupera storico password con password effettive da OpenBao"""
    history = database.execute_query("""
        SELECT * FROM storico_password 
        WHERE utenza_id = %s 
        ORDER BY created_at DESC
    """, (id,), fetch=True)
    
    result = []
    for record in history:
        entry = dict(record)
        if record['vault_version']:
            # Recupera password effettiva da OpenBao
            entry['password'] = vault.get_password_by_version(
                record['vault_path'], 
                record['vault_version']
            )
        else:
            entry['password'] = None
            entry['note'] = "Utenza cancellata"
        result.append(entry)
    
    return result

@app.get("/api/utenze/cancellate")
async def get_deleted_users():
    """Lista tutte le utenze cancellate"""
    return database.execute_query(
        "SELECT * FROM utenze WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
        fetch=True
    )
```

---

## 7. Step 5: Frontend React

### 7.1 Crea Progetto

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install axios
```

### 7.2 Componente Principale (`App.tsx`)

Struttura base con:
- Lista utenze (attive e cancellate)
- Tab "Old/Storico" per consultare password storiche
- Pannello dettagli con storico completo

*(Vedi file completo nel repository)*

---

## 8. Step 6: Sistema di Backup

### 8.1 Script `backup/backup.sh`

```bash
#!/bin/bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# PostgreSQL dump
PGPASSWORD="" pg_dump \
  -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" \
  -F c -Z 9 -f "${BACKUP_ROOT}/postgres/pg_backup_${DATE}.dump"

# Vault snapshot
vault raft snapshot save "${BACKUP_ROOT}/vault/vault_snapshot_${DATE}.snap"

# Retention locale
find "${BACKUP_ROOT}/postgres" -name "*.dump" -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_ROOT}/vault" -name "*.snap" -mtime +${RETENTION_DAYS} -delete
```

### 8.2 Crontab (`backup/crontab`)

```cron
# Backup giornaliero alle 02:00
0 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1

# Offsite copy alle 02:30
30 2 * * * /usr/local/bin/offsite-copy.sh >> /var/log/backup.log 2>&1
```

---

## 9. Step 7: Containerizzazione

### 9.1 File `podman-compose.yml`

```yaml
version: '3.8'

services:
  inventory-db:
    image: docker.io/library/postgres:15
    environment:
      POSTGRES_DB: password_manager
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ""
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

  openbao:
    image: docker.io/openbao/openbao:latest
    cap_add:
      - IPC_LOCK
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_TOKEN}
      VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
    ports:
      - "8200:8200"
    volumes:
      - vault_data:/vault/data

  backend:
    build: ./backend
    environment:
      DB_HOST: inventory-db
      VAULT_ADDR: http://openbao:8200
      VAULT_TOKEN: ""
    depends_on:
      inventory-db:
        condition: service_healthy
      openbao:
        condition: service_started
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    depends_on:
      - backend

  backup:
    build: ./backup
    environment:
      DB_HOST: inventory-db
      VAULT_ADDR: http://openbao:8200
    volumes:
      - backups_data:/backups
      - ./backup/crontab:/etc/cron.d/backup:ro
    depends_on:
      - inventory-db
      - openbao

volumes:
  db_data:
  vault_data:
  backups_data:
```

---

## 10. Step 8: Avvio e Testing

### 10.1 Script `run-podman.sh`

```bash
#!/bin/bash
# Script intelligente di avvio rapido

echo "🔍 Verifica prerequisiti..."
command -v podman >/dev/null || { echo "❌ Podman richiesto"; exit 1; }

echo "📝 Genera .env se non esiste..."
[ ! -f .env ] && cp .env.example .env

echo "🚀 Avvia servizi..."
podman-compose up -d

echo "⏳ Attendi readiness..."
sleep 30

echo "✅ Sistema pronto!"
echo "Frontend: http://localhost:5173"
echo "Backend API: http://localhost:8000/docs"
echo "OpenBao UI: http://localhost:8200"
```

### 10.2 Comandi Utili

```bash
# Avvia tutto
./run-podman.sh

# Vedi log
podman-compose logs -f backend

# Accedi al DB
podman exec -it password-manager-inventory-db-1 psql -U postgres

# Backup manuale
podman exec password-manager-backup-1 /usr/local/bin/backup.sh
```

---

## 11. Step 9: Produzione e Sicurezza

### 11.1 Checklist Produzione

- [ ] **TLS/HTTPS** su tutti i servizi
- [ ] **Secret management** per token OpenBao (non hardcoded)
- [ ] **Backup offsite** configurato (rsync su server DR)
- [ ] **Monitoring** (Prometheus + Grafana)
- [ ] **Alerting** su fallimenti backup
- [ ] **Hardening** SELinux/AppArmor
- [ ] **Network policies** (isolamento container)
- [ ] **Audit log** centralizzato

### 11.2 Quadlet per Systemd (Fedora/RHEL)

Crea `/etc/containers/systemd/password-manager.container`:

```ini
[Unit]
Description=Password Manager Enterprise
After=network-online.target

[Container]
Image=docker.io/library/postgres:15
ContainerName=password-manager-db
PublishPort=5432:5432
Environment=DB_PASSWORD=""

[Service]
Restart=always

[X-Install]
WantedBy=multi-user.target
```

Poi:
```bash
systemctl daemon-reload
systemctl enable --now password-manager
```

---

## 12. Troubleshooting

### Problema: OpenBao non si unseal

```bash
# Verifica stato
vault status

# Se sealed, usa chiavi salvate in init-keys.txt
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

### Problema: Backup fallisce

```bash
# Controlla log
podman logs password-manager-backup-1

# Verifica spazio disco
podman exec password-manager-backup-1 df -h

# Testa connessione DB
podman exec password-manager-backup-1 \
  PGPASSWORD="" psql -h inventory-db -U postgres -c "SELECT 1"
```

### Problema: Password storiche non visibili

```sql
-- Verifica record nello storico
SELECT * FROM storico_password WHERE utenza_id = X;

-- Verifica versioni in OpenBao
vault kv metadata get secret/inventory/oracle/P1PDS2CBIP/PIPPO_SV
```

---

## 🎓 Risorse per Approfondire

- [Documentazione OpenBao](https://openbao.org/docs/)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Podman Production Guide](https://docs.podman.io/en/latest/markdown/podman-run.1.html)

---

## 📞 Supporto

Per domande o problemi, apri una issue sul repository GitHub.

**Buon apprendimento! 🚀**
