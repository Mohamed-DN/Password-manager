# Database Schema Details

Il database PostgreSQL `vault_inventory_db` è organizzato nello schema logico `inventory`.

## Tabelle

### 1. `inventory.tecnologie`
Memorizza le tipologie di database supportate.
- `id`: PK
- `nome`: Oracle, MySQL, Postgres, OCI, NoSQL
- `descrizione`: Testo descrittivo

### 2. `inventory.ambienti`
Lookup per gli ambienti di deployment.
- `id`: PK
- `nome`: PRODUZIONE, COLLAUDO, SVILUPPO

### 3. `inventory.bao_owners`
Responsabili applicativi.
- `id`: PK
- `nome`, `cognome`: Identificativi
- `email`: Contatto (opzionale)

### 4. `inventory.ticket`
Tracciabilità richieste.
- `id`: PK
- `codice_ticket`: Indice univoco (es. IR12345)

### 5. `inventory.sistemi_target`
Il cuore della configurazione tecnica.
- `id`: PK
- `nome_sistema`: Nome identificativo (DB Name)
- `configurazione`: Campo **JSONB** che contiene i parametri variabili per tecnologia.

### 6. `inventory.utenze`
Dati delle credenziali.
- `id`: PK
- `username`: Nome utente sul sistema target
- `vault_path`: Percorso del segreto in OpenBao (KV Engine)
- `attributi_specifici`: Campo **JSONB** per metadati utente.

### 7. `inventory.audit_log`
Registro di sicurezza.
- `id`: PK
- `azione`: Tipo operazione (READ_PASSWORD, CHANGE_PASSWORD, etc.)
- `dettagli`: JSONB con info sull'utente e l'asset coinvolto.
