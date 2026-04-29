from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, Union
from database import db, get_db_connection
from vault import store_password, get_password
import json

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()

app = FastAPI(
    title="Inventory API",
    description="API per gestione inventario sistemi e segreti OpenBao",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def log_action(azione: str, dettagli: Dict[str, Any], request: Request):
    """Salva un'azione nell'audit log."""
    async with get_db_connection() as conn:
        await conn.execute(
            """
            INSERT INTO audit_log (utente_operatore, azione, dettagli, ip_address)
            VALUES ($1, $2, $3, $4)
            """,
            "SYSTEM_UI", # In futuro qui ci sarà l'utente loggato
            azione,
            json.dumps(dettagli),
            request.client.host
        )

# --- Modelli Pydantic (Validazione Input) ---
class SystemTarget(BaseModel):
    nome_sistema: str
    ambiente_id: int
    tecnologia_id: int
    configurazione: Dict[str, Any] = {}
    descrizione: Optional[str] = None

class Utenza(BaseModel):
    username: str
    sistema_target_id: int
    tipo_utenza_id: int
    bao_owner_id: int
    ticket_id: Optional[int] = None
    attributi_specifici: Dict[str, Any] = {}
    password: str # La password arriva dal Frontend ma NON va su Postgres

class PasswordResponse(BaseModel):
    password: str

# --- Endpoints ---

@app.get("/api/lookups")
async def get_lookups():
    """Recupera tutti i dati per i dropdown (ambienti, tecnologie, tipi, owners)."""
    async with get_db_connection() as conn:
        ambienti = await conn.fetch("SELECT * FROM ambienti")
        tecnologie = await conn.fetch("SELECT * FROM tecnologie")
        tipi = await conn.fetch("SELECT * FROM tipi_utenza")
        owners = await conn.fetch("SELECT * FROM bao_owners")
        tickets = await conn.fetch("SELECT * FROM ticket")
        return {
            "ambienti": [dict(r) for r in ambienti],
            "tecnologie": [dict(r) for r in tecnologie],
            "tipi_utenza": [dict(r) for r in tipi],
            "bao_owners": [dict(r) for r in owners],
            "ticket": [dict(r) for r in tickets]
        }

@app.get("/api/sistemi")
async def get_sistemi():
    """Recupera tutti i sistemi target."""
    async with get_db_connection() as conn:
        rows = await conn.fetch("SELECT * FROM sistemi_target")
        return [dict(r) for r in rows]

@app.post("/api/sistemi")
async def create_sistema(sistema: SystemTarget):
    """Crea un nuovo sistema target."""
    async with get_db_connection() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO sistemi_target (nome_sistema, ambiente_id, tecnologia_id, configurazione, descrizione)
                VALUES ($1, $2, $3, $4, $5) RETURNING id
                """,
                sistema.nome_sistema, sistema.ambiente_id, sistema.tecnologia_id, 
                sistema.configurazione, sistema.descrizione
            )
            return {"message": "Sistema creato", "id": row['id']}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/utenze")
async def get_utenze():
    """Recupera tutte le utenze censite senza le password."""
    async with get_db_connection() as conn:
        rows = await conn.fetch("SELECT id, username, sistema_target_id, bao_owner_id, ticket_id, vault_path, attiva FROM utenze")
        return [dict(r) for r in rows]

@app.post("/api/utenze")
async def create_utenza(utenza: Utenza):
    """
    Crea un'utenza:
    1. Salva la password in OpenBao.
    2. Salva i metadati in PostgreSQL.
    """
    # 1. Costruiamo un vault_path unico
    vault_path = f"inventory/sistemi/{utenza.sistema_target_id}/utenti/{utenza.username}"
    
    # 2. Salviamo la password in OpenBao
    success = store_password(vault_path, utenza.password)
    if not success:
        raise HTTPException(status_code=500, detail="Impossibile salvare la password in OpenBao")

    # 3. Salviamo i dati in Postgres
    async with get_db_connection() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO utenze (username, sistema_target_id, tipo_utenza_id, bao_owner_id, ticket_id, vault_path, attributi_specifici)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
                """,
                utenza.username, utenza.sistema_target_id, utenza.tipo_utenza_id,
                utenza.bao_owner_id, utenza.ticket_id, vault_path, utenza.attributi_specifici
            )
            return {"message": "Utenza censita e password protetta con successo", "id": row['id']}
        except Exception as e:
            # Se Postgres fallisce, ideale sarebbe cancellare il segreto da Vault (Rollback)
            raise HTTPException(status_code=400, detail=f"Errore salvataggio DB: {str(e)}")

class UnifiedEntry(BaseModel):
    # Dati Sistema
    nome_sistema: str
    ambiente_id: int
    tecnologia_id: int
    configurazione: Dict[str, Any] = {}
    # Dati Utenza
    username: str
    password: str
    tipo_utenza_id: int
    bao_owner: Union[int, str]  # Può essere un ID (int) o un Nome Completo (str)
    ticket_codice: str
    attributi_specifici: Dict[str, Any] = {}

@app.post("/api/entry")
async def create_unified_entry(entry: UnifiedEntry, request: Request):
    async with get_db_connection() as conn:
        async with conn.transaction():
            # 1. Gestione BAO Owner (Nuovo o Esistente)
            if isinstance(entry.bao_owner, str):
                parti = entry.bao_owner.split(" ", 1)
                nome = parti[0]
                cognome = parti[1] if len(parti) > 1 else ""
                bao_owner_id = await conn.fetchval(
                    "INSERT INTO bao_owners (nome, cognome) VALUES ($1, $2) RETURNING id",
                    nome, cognome
                )
            else:
                bao_owner_id = entry.bao_owner

            # 2. Gestione Ticket
            ticket_id = await conn.fetchval(
                "INSERT INTO ticket (codice_ticket) VALUES ($1) ON CONFLICT (codice_ticket) DO UPDATE SET codice_ticket = EXCLUDED.codice_ticket RETURNING id",
                entry.ticket_codice
            )

            # 3. Creazione Sistema
            sistema_id = await conn.fetchval(
                "INSERT INTO sistemi_target (nome_sistema, ambiente_id, tecnologia_id, configurazione) VALUES ($1, $2, $3, $4) RETURNING id",
                entry.nome_sistema, entry.ambiente_id, entry.tecnologia_id, entry.configurazione
            )

            # 4. Vault
            vault_path = f"inventory/sistemi/{sistema_id}/utenti/{entry.username}"
            success = store_password(vault_path, entry.password)
            if not success:
                raise HTTPException(status_code=500, detail="Vault Error")

            # 5. Utenza
            utenza_id = await conn.fetchval(
                """
                INSERT INTO utenze (username, sistema_target_id, tipo_utenza_id, bao_owner_id, ticket_id, vault_path, attributi_specifici)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
                """,
                entry.username, sistema_id, entry.tipo_utenza_id, bao_owner_id, ticket_id, vault_path, entry.attributi_specifici
            )

            await log_action("CREATE_ENTRY", {"utenza_id": utenza_id, "username": entry.username, "sistema": entry.nome_sistema}, request)
            return {"message": "Dati salvati correttamente", "id": utenza_id}

class PasswordUpdate(BaseModel):
    new_password: str

@app.patch("/api/utenze/{utenza_id}/password")
async def update_password(utenza_id: int, update: PasswordUpdate, request: Request):
    """Aggiorna la password in OpenBao per un'utenza esistente."""
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT username, vault_path FROM utenze WHERE id = $1", utenza_id)
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata")
        
        vault_path = row['vault_path']
        success = store_password(vault_path, update.new_password)
        
        if not success:
            raise HTTPException(status_code=500, detail="Errore aggiornamento Vault")
        
        await log_action("CHANGE_PASSWORD", {"utenza_id": utenza_id, "username": row['username']}, request)
        return {"message": "Password aggiornata con successo"}

@app.get("/api/utenze/{utenza_id}/password", response_model=PasswordResponse)
async def fetch_password(utenza_id: int, request: Request):
    """
    Recupera la password in chiaro interrogando Postgres per il path e Vault per il segreto.
    """
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT username, vault_path FROM utenze WHERE id = $1", utenza_id)
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata")
        
        vault_path = row['vault_path']
        password = get_password(vault_path)
        
        if not password:
            raise HTTPException(status_code=500, detail="Segreto non trovato in OpenBao")
        
        # Logghiamo l'azione critica
        await log_action("VIEW_PASSWORD", {"utenza_id": utenza_id, "username": row['username']}, request)
            
        return {"password": password}

@app.get("/api/audit")
async def get_audit_log():
    """Recupera le ultime 200 voci dell'audit log in ordine cronologico inverso."""
    async with get_db_connection() as conn:
        rows = await conn.fetch(
            "SELECT id, timestamp, utente_operatore, azione, dettagli, ip_address FROM audit_log ORDER BY timestamp DESC LIMIT 200"
        )
        return [dict(r) for r in rows]
