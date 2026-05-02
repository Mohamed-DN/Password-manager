# Changelog NexiVault

Tutte le modifiche significative a questo progetto saranno documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.0.0/)
e il progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

---

## [2.0.0] - 2025-05-02

### ✨ Nuove Funzionalità

#### Backend
- **API FastAPI completa** con architettura modulare a router
- **6 router specializzati**: auth, lookups, dashboard, entries, utenze, audit
- **Session management** con timeout automatico 1h e cookie sicuri
- **Audit logging** di ogni operazione (CREATE, UPDATE, DELETE, VIEW_PASSWORD)
- **Password history** con versioning fino a 1000 versioni per segreto
- **Soft-delete** utenze con archiviazione storico
- **Creazione unificata** sistema + utenza in singola chiamata API
- **BAO Owner creation on-the-fly** durante inserimento entry

#### Database
- **Schema completo** migrato dal progetto PHP
- **10 tabelle** con relazioni e vincoli
- **Trigger automatici** per updated_at timestamps
- **Indici GIN** per query JSONB performanti
- **Funzioni PL/pgSQL** per manutenzione automatica
- **Replica hot-standby** con streaming replication

#### Frontend
- **React 18 + TypeScript** per type safety
- **Sidebar navigation** con 3 tab (Inventory, Audit, Old/Storico)
- **Form dinamico multi-tecnologia** (Oracle, MySQL, Postgres, OCI, NoSQL)
- **Dashboard statistics** con metriche real-time
- **Filtri avanzati** ricerca full-text
- **Password reveal** con copy-to-clipboard
- **Password change** inline senza ricaricare pagina
- **History viewer** per versioni precedenti password

#### Sicurezza
- **OpenBao KV v2** con versioning automatico
- **Security headers HTTP** completi (HSTS, CSP, X-Frame-Options, ecc.)
- **Search_path limitato** per prevenzione SQL injection
- **Ruoli DB separati** (admin, app, read, replicator)
- **Cookie flags** sicuri (HttpOnly, Secure, SameSite=strict)

#### Infrastructure
- **Podman-native** con supporto SELinux (:z flag)
- **Docker-compose** compatibile drop-in
- **Backup automatico hourly** (pg_dump + vault snapshot)
- **Offsite sync** via rsync/SSH su server remoto
- **Health check** per tutti i servizi
- **Volume persistence** per dati critici

### 🔧 Miglioramenti

- **Performance**: Query ottimizzate con indici appropriati
- **Manutenibilità**: Codice modulare e ben documentato
- **Scalabilità**: Architettura async ready per alto carico
- **Monitoring**: Log strutturati e metriche esposte
- **Documentation**: Guide complete step-by-step

### 📚 Documentazione

- **PODMAN_SETUP_GUIDE.md**: Guida installazione completa
- **SCHEMA.md**: Modello dati dettagliato
- **BACKUP_RESTORE.md**: Procedure disaster recovery
- **DDR_DISASTER_RECOVERY_DRILL.md**: Test procedure
- **OPENBAO_CONFIG.md**: Configurazione Vault
- **ROLES_AND_SECURITY.md**: Ruoli e permessi database

### 🗑️ Rimozioni

- **Progetto PHP originale**: Spostato in `archive/php-reference/`
- **Codice ridondante**: Pulizia e refactoring generale

### 🐛 Bug Fixes

- Corretto problema di connessione Vault in produzione
- Fix race condition init replica PostgreSQL
- Risolto problema permessi volumi SELinux

---

## [1.0.0] - 2024-XX-XX

### ✨ Funzionalità Originali (Progetto PHP)

- Sistema base gestione password
- Integrazione HashiCorp Vault
- Database PostgreSQL
- UI PHP templating
- Login/logout utenti
- Audit logging base
- Ticket IR tracking
- BAO Owner management

---

## Note Versioni

### Versione 2.x (Current)
- **Stack**: Python FastAPI + React TypeScript
- **Container**: Podman/Docker
- **Database**: PostgreSQL 16 con replica HA
- **Secrets**: OpenBao v2.2 KV v2
- **Stato**: ✅ Production Ready

### Versione 1.x (Legacy)
- **Stack**: PHP monolitico
- **Container**: Docker base
- **Database**: PostgreSQL singolo
- **Secrets**: Vault base
- **Stato**: ⚠️ Deprecated (archiviato)

---

## Migration Path da 1.x a 2.x

Per utenti del progetto PHP originale:

1. **Backup dati esistenti**
   ```bash
   pg_dump -U postgres vault_inventory_db > backup_v1.sql
   ```

2. **Deploy nuova versione**
   ```bash
   git checkout v2.0.0
   podman-compose up -d --build
   ```

3. **Restore dati**
   ```bash
   psql -U postgres -d vault_inventory_db < backup_v1.sql
   ```

4. **Verifica funzionalità**
   - Test login
   - Verifica inventario
   - Controllo audit log

Vedi `docs/MIGRATION_GUIDE.md` per dettagli completi.

---

## Roadmap Futura

### v2.1.0 (Q3 2025)
- [ ] Multi-factor authentication (TOTP)
- [ ] Password rotation automatica
- [ ] Notifiche email per scadenze
- [ ] Reportistica PDF periodica

### v2.2.0 (Q4 2025)
- [ ] OpenBao HA cluster (3 nodi Raft)
- [ ] Metrics export Prometheus
- [ ] Dashboard Grafana preconfigurata
- [ ] API rate limiting

### v3.0.0 (Q1 2026)
- [ ] Supporto multi-tenant
- [ ] RBAC avanzato (ruoli custom)
- [ ] Audit log immutabile (blockchain-like)
- [ ] Mobile app React Native

---

## Autori Release

- **v2.0.0**: Team Platform Security - Nexi Group
- **v1.0.0**: Progetto PHP originale (vedi `archive/php-reference/`)

---

[2.0.0]: https://github.com/nexi-group/nexivault/releases/tag/v2.0.0
[1.0.0]: https://github.com/nexi-group/nexivault/releases/tag/v1.0.0
