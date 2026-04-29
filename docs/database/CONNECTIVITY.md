# Guida alla Connessione - PostgreSQL

Esistono due modi principali per collegarsi al database del sistema.

## 1. Connessione tramite CLI (Docker)
Se vuoi eseguire comandi SQL direttamente dal terminale senza installare nulla sul tuo PC:

```bash
docker exec -it inventory-db psql -U inventory_admin -d vault_inventory_db
```
*(Usa la password definita nel docker-compose, default: `inventory_master_pass`)*

## 2. Connessione da un Client Esterno (DBeaver, pgAdmin, DataGrip)
Per collegarti dal tuo PC usando un'interfaccia grafica, usa i seguenti parametri:

- **Host**: `localhost`
- **Porta**: `5432`
- **Database**: `vault_inventory_db`
- **Utente Admin (per modifiche schema)**: 
  - User: `inventory_admin`
  - Pass: `inventory_master_pass`
- **Utente App (per sola lettura/scrittura dati)**:
  - User: `inventory_app`
  - Pass: `inventory_app_pass`

## 3. Schema dei Dati
Ricorda che tutte le tabelle del progetto si trovano nello schema **`inventory`**. 
Per vedere le tabelle dal client, assicurati di navigare dentro:
`vault_inventory_db` > `Schemas` > `inventory` > `Tables`.

Oppure via SQL:
```sql
SET search_path TO inventory;
SELECT * FROM utenze;
```
