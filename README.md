# Secure Vault Inventory (Nexi Edition)

Questa applicazione è progettata per rimpiazzare la gestione degli asset e delle password basata su Excel con una soluzione **Production-Grade**, sicura e centralizzata.

## 🚀 Architettura del Sistema

Il sistema si basa su un'architettura a tre livelli (Frontend, Backend, Security Layer):

1.  **Frontend (React + Vite)**: Un'interfaccia moderna e dinamica che si adatta alla tecnologia selezionata.
2.  **Backend (FastAPI)**: Un ponte asincrono che orchestra i dati tra il database e la cassaforte dei segreti.
3.  **Security Layer (OpenBao/Vault)**: Le password NON sono salvate nel database. Sono criptate e gestite da OpenBao (fork di HashiCorp Vault).
4.  **Database (PostgreSQL)**: Utilizzato per i metadati strutturati e le configurazioni flessibili tramite il tipo di dato `JSONB`.

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
├── docker-compose.yml      # Orchestrazione dei container (API, DB, Vault)
├── init.sql                # Schema del database (Dati strutturati + JSONB)
└── README.md               # Questa guida
```

## 🗄 Struttura del Database (PostgreSQL)

Il database utilizza uno schema dedicato chiamato `inventory` per separare i dati di sistema da quelli di gestione.

### Tabelle Principali:
- **`sistemi_target`**: Rappresenta l'asset fisico/logico (es. un'istanza Oracle o un server MySQL).
  - `configurazione (JSONB)`: Contiene i parametri tecnici variabili (porta, server, hba_conf).
- **`utenze`**: Contiene le credenziali di accesso.
  - `vault_path`: Il link univoco al segreto salvato in OpenBao.
  - `attributi_specifici (JSONB)`: Metadati specifici dell'utente (es. host autorizzati).
- **`ambienti`**: Lookup table per gli ambienti (SVILUPPO, COLLAUDO, PRODUZIONE).
- **`tecnologie`**: Lookup table per le tecnologie (Oracle, MySQL, Postgres, OCI, NoSQL).
- **`bao_owners`**: Responsabili dell'asset (Business Application Owners).
- **`ticket`**: Tracciamento delle richieste tramite ID Ticket (es. IRxxxx).
- **`audit_log`**: Registro immutabile di tutte le azioni critiche (visualizzazione e cambio password).

### Relazioni:
- Ogni **Utenza** è collegata a un **Sistema Target**, a un **Owner**, a un **Ticket** e a un **Ambiente**.
- Questo modello permette di fare query complesse (es. "mostrami tutte le utenze Oracle in Produzione gestite da Fabio").

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
- **Vault Token**: Attualmente in modalità dev (`root`). In produzione va sostituito con AppRole o token limitati.
- **Postgres**: Utilizza schemi separati (`inventory`) e permessi granulari per l'utente applicativo.

---
*Progettato per Nexi - Password Management Modernization*
