# Database Roles & Security

Il sistema implementa il principio del **Least Privilege** per garantire che l'applicazione non possa eseguire operazioni distruttive o non autorizzate a livello di schema.

## Utenti e Permessi

### 1. `inventory_admin`
- **Scopo**: Proprietario dello schema e delle tabelle.
- **Permessi**: `CREATE`, `ALTER`, `DROP`, `GRANT`.
- **Utilizzo**: Viene utilizzato solo durante la fase di migrazione (CI/CD) o setup iniziale (`init.sql`).

### 2. `inventory_app`
- **Scopo**: Utente utilizzato dal Backend FastAPI.
- **Permessi**: `SELECT`, `INSERT`, `UPDATE` sulle tabelle dei dati.
- **Restrizioni**: Non può cancellare record (`DELETE`) in modo globale e non può modificare la struttura delle tabelle.

## Gestione dei Dati Sensibili
Tutte le password vengono salvate **esclusivamente** in OpenBao. Il database PostgreSQL memorizza solo il `vault_path`, eliminando il rischio di furto credenziali in caso di SQL Injection o dump del database.
