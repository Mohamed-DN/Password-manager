# 🚀 Guida Completa all'Installazione con Podman

Questa guida spiega passo-passo come部署are NexiVault utilizzando Podman, il runtime container OCI-compatibile.

## 📋 Indice

1. [Prerequisiti](#prerequisiti)
2. [Installazione Podman](#installazione-podman)
3. [Configurazione Ambiente](#configurazione-ambiente)
4. [Avvio Servizi](#avvio-servizi)
5. [Verifica Operativa](#verifica-operativa)
6. [Manutenzione](#manutenzione)
7. [Backup & Restore](#backup--restore)
8. [Risoluzione Problemi](#risoluzione-problemi)

---

## Prerequisiti

### Hardware Minimale
- **CPU**: 4 core (8 consigliati)
- **RAM**: 8 GB (16 GB consigliati)
- **Storage**: 50 GB SSD (più spazio per backup)
- **OS**: Oracle Linux 8/9, RHEL 8/9, Fedora, Ubuntu 22.04+

### Software Richiesto
- Podman ≥ 4.0
- podman-compose ≥ 1.0
- Git (per clonare il repository)

---

## Installazione Podman

### Oracle Linux / RHEL

```bash
# Abilita repository EPEL
sudo dnf install -y epel-release

# Installa Podman e plugin
sudo dnf install -y podman podman-docker podman-compose

# Verifica installazione
podman --version
podman-compose --version
```

### Ubuntu / Debian

```bash
# Aggiorna pacchetti
sudo apt update

# Installa Podman
sudo apt install -y podman podman-docker

# Installa podman-compose via pip
pip3 install podman-compose

# Verifica
podman --version
podman-compose --version
```

### Configurazione Rootless (Consigliata)

Podman è progettato per operare in modalità rootless (senza privilegi di root):

```bash
# Aumenta limiti user namespace per rootless
echo "user.max_user_namespaces=28618" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Verifica configurazione
podman info | grep -i rootless
```

---

## Configurazione Ambiente

### 1. Clona il Repository

```bash
cd /opt
git clone <repository-url> nexivault
cd nexivault
```

### 2. Struttura Directory

```
/opt/nexivault/
├── backend/              # API FastAPI
├── frontend/             # UI React
├── vault/                # OpenBao configuration
├── backup/               # Script backup
├── scripts/              # DB initialization
├── docs/                 # Documentazione
├── podman-compose.yml    # Compose file per Podman
└── .env                  # Variabili ambiente (opzionale)
```

### 3. Configura Variabili Ambiente (Opzionale)

Crea un file `.env` nella root:

```bash
# Replica PostgreSQL: 'async' (default) o 'sync'
REPLICATION_MODE=async

# Offsite backup server
OFFSITE_HOST=oemdb1
OFFSITE_PORT=22
OFFSITE_USER=backup
OFFSITE_PATH=/backup/nexi-vault-backups

# SSH key per offsite backup (generata con setup-offsite-ssh.sh)
OFFSITE_SSH_KEY=/opt/nexivault/.ssh/id_rsa
```

---

## Avvio Servizi

### 1. Build e Start

```bash
cd /opt/nexivault

# Build e avvio di tutti i servizi
podman-compose up -d --build
```

### 2. Verifica Container Attivi

```bash
podman-compose ps
```

Output atteso:
```
NAME                    IMAGE                        STATUS
inventory-db            postgres:16-alpine           Up (healthy)
inventory-db-replica    postgres:16-alpine           Up (healthy)
inventory-bao           nexivault-vault              Up (healthy)
inventory-api           nexivault-backend            Up
inventory-ui            node:22-alpine               Up
inventory-backup        nexivault-backup             Up
```

### 3. Log dei Servizi

```bash
# Tutti i log
podman-compose logs -f

# Log specifico servizio
podman-compose logs -f backend
podman-compose logs -f openbao
```

---

## Verifica Operativa

### 1. Controlla Health Check

```bash
# PostgreSQL primary
podman exec inventory-db pg_isready -U postgres -d vault_inventory_db

# PostgreSQL replica
podman exec inventory-db-replica pg_isready -U postgres -d vault_inventory_db

# OpenBao status
podman exec inventory-bao vault status -address=http://127.0.0.1:8200
```

### 2. Test API Backend

```bash
# Health check API
curl http://localhost:8000/health

# Test lookups endpoint
curl http://localhost:8000/api/lookups
```

### 3. Accesso Frontend

Apri browser su: **http://localhost:5173**

Dovresti vedere la dashboard di NexiVault.

---

## Manutenzione

### Stop Servizi

```bash
# Stop temporaneo
podman-compose stop

# Stop e rimozione container
podman-compose down
```

### Riavvio Servizi

```bash
podman-compose restart
```

### Update Immagini

```bash
# Pull nuove versioni
podman-compose pull

# Ricrea container
podman-compose up -d --force-recreate
```

### Pulizia Spazio

```bash
# Rimuovi container fermi
podman container prune

# Rimuovi immagini non utilizzate
podman image prune

# Rimuovi volumi orfani (ATTENZIONE: perdi dati!)
podman volume prune
```

---

## Backup & Restore

### Backup Automatico

Il servizio `inventory-backup` esegue automaticamente:
- **Ogni ora**: pg_dump del database + snapshot Vault Raft
- **Ogni ora**: Sync offsite su server remoto (se configurato)
- **Retention**: 7 giorni locali

### Backup Manuale

```bash
# Esegui backup immediato
podman exec inventory-backup /backup/backup.sh

# Verifica backup creati
podman unshare ls -lh /var/lib/containers/storage/volumes/backups_data/_data/
```

### Restore Database

```bash
# Ferma applicazioni
podman-compose stop backend frontend

# Restore da backup
podman exec -i inventory-db psql -U postgres -d vault_inventory_db < /path/to/backup.sql

# Riavvia servizi
podman-compose up -d
```

### Restore Vault

Vedi documentazione completa in `docs/backup/BACKUP_RESTORE.md`

---

## Risoluzione Problemi

### Container Non Parte

```bash
# Verifica log
podman-compose logs <servizio>

# Controlla risorse
podman stats

# Verifica porte in uso
ss -tlnp | grep -E '5432|8200|8000|5173'
```

### Problemi SELinux

Se SELinux è in enforcing mode, assicurati che i volumi abbiano il flag `:z`:

```yaml
volumes:
  - ./init.sql:/docker-entrypoint-initdb.d/01-init.sql:z,ro
```

Il file `podman-compose.yml` include già i flag corretti.

### Replica PostgreSQL Non Si Connette

```bash
# Verifica connettività primaria
podman exec inventory-db-replica ping -c 3 inventory-db

# Controlla log replica
podman-compose logs postgres-replica

# Verifica utente replication
podman exec inventory-db psql -U postgres -c "SELECT * FROM pg_stat_replication;"
```

### OpenBao Non Inizializzato

Al primo avvio, Vault deve essere inizializzato:

```bash
# Accedi al container
podman exec -it inventory-bao /bin/sh

# Verifica status
vault status

# Se non inizializzato, esegui:
vault operator init -key-shares=5 -key-threshold=3

# Salva chiavi e token in un luogo sicuro!
```

### Performance Lente

```bash
# Monitora risorse container
podman stats

# Verifica I/O disco
iostat -x 2

# Controlla log errori
journalctl -u podman -f
```

---

## Security Best Practices

### 1. Firewall Configuration

```bash
# Abilita solo porte necessarie
sudo firewall-cmd --permanent --add-port=5432/tcp    # DB (interno)
sudo firewall-cmd --permanent --add-port=8200/tcp    # Vault
sudo firewall-cmd --permanent --add-port=8000/tcp    # API
sudo firewall-cmd --permanent --add-port=5173/tcp    # Frontend
sudo firewall-cmd --reload
```

### 2. Secure SSH per Offsite Backup

```bash
# Genera chiave dedicata
ssh-keygen -t ed25519 -f /opt/nexivault/.ssh/id_rsa -N "" -C "nexivault-backup"

# Copia public key sul server offsite
ssh-copy-id -i /opt/nexivault/.ssh/id_rsa.pub backup@oemdb1

# Imposta permessi corretti
chmod 600 /opt/nexivault/.ssh/id_rsa
chmod 644 /opt/nexivault/.ssh/id_rsa.pub
```

### 3. Audit Logging

Tutte le operazioni sono registrate nella tabella `audit_log`. Query utili:

```sql
-- Ultime 100 operazioni
SELECT timestamp, azione, dettagli 
FROM inventory.audit_log 
ORDER BY timestamp DESC 
LIMIT 100;

-- Accessi password oggi
SELECT COUNT(*) 
FROM inventory.audit_log 
WHERE azione = 'VIEW_PASSWORD' 
  AND timestamp >= CURRENT_DATE;
```

---

## Supporto

Per problemi o domande:
- Consulta la documentazione in `docs/`
- Controlla i log con `podman-compose logs`
- Apri un ticket sul repository GitHub

---

**Ultimo aggiornamento**: Maggio 2025  
**Versione**: NexiVault 2.0
