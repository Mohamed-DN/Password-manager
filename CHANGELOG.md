# Changelog — Nexi Vault Inventory

Tutte le modifiche rilevanti a questo progetto verranno documentate in questo file.

## [2026-04-30] — Enterprise & UI Hardening

### Added
- **Global Password History**: Una nuova vista dedicata che mostra ogni rotazione di password e cancellazione avvenuta nel sistema.
- **Specific Filter by ID**: Aggiunta la possibilità di filtrare la cronologia per ID univoco dell'utenza, risolvendo il problema delle collisioni tra nomi utenti identici su sistemi diversi (es. Oracle vs MySQL).
- **Soft-Delete Functionality**: Implementata la cancellazione logica delle utenze (`deleted_at`) con archiviazione automatica dello stato finale nello storico.
- **Security Masking**: Tutte le password nella cronologia sono ora mascherate di default (`••••••••`) con opzione "Reveal" individuale.
- **Hot-Reload Backend**: Aggiornato `podman-compose.yml` per montare il volume del backend e abilitare `--reload` di Uvicorn, permettendo modifiche al codice in tempo reale senza riavvii.
- **Global Search**: Implementata la barra di ricerca funzionante su tutte le schede (Inventory, Audit, History).

### Fixed
- **Podman Windows Build**: Risolto errore `Permission denied` in `apk add` nel Dockerfile di Vault forzando l'utente `root` durante il build.
- **Line Endings (CRLF/LF)**: Convertiti tutti gli script shell (`.sh`) in formato LF per compatibilità con i container Linux quando si lavora da Windows.
- **UI Inconsistencies**: Corretti i titoli delle pagine e i caricamenti degli stati durante la navigazione tra i tab.

### Security
- Le password non sono mai salvate in chiaro su PostgreSQL (solo metadati e versioni).
- Ogni visualizzazione di password (Reveal) viene tracciata nell'Audit Log con timestamp e IP dell'operatore.

---

## [2026-04-29] — Disaster Recovery & High Availability

### Added
- **PostgreSQL Streaming Replication**: Configurazione Primary + Standby (Replica) per alta affidabilità.
- **OpenBao Raft Storage**: Transizione dal backend file a Raft per persistenza enterprise-grade.
- **Automated Backup System**: Script per backup orari di PostgreSQL e Snapshot di Vault.
- **Offsite Sync**: Sincronizzazione automatica dei backup sul server gateway `oemdb1`.
- **Podman Production Ready**: Creazione di `podman-compose.yml` ottimizzato per ambienti RHEL/Oracle Linux con label SELinux (`:z`).
