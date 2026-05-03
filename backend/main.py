from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional, Dict, Any, Union, List
from contextlib import asynccontextmanager
from database import db, get_db_connection
from vault import store_password, get_password, get_current_vault_version, get_password_by_version
import json
import auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Configure Vault KV max_versions at startup
    from vault import configure_kv_max_versions
    configure_kv_max_versions(200)
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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = auth.decode_access_token(token)
    if payload is None:
        raise credentials_exception
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    return username

async def log_action(azione: str, dettagli: Dict[str, Any], request: Request, operator: str = "SYSTEM"):
    """Salva un'azione nell'audit log."""
    async with get_db_connection() as conn:
        await conn.execute(
            """
            INSERT INTO audit_log (utente_operatore, azione, dettagli, ip_address)
            VALUES ($1, $2, $3, $4)
            """,
            operator,
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

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    username: str
    full_name: str

class SudoVerify(BaseModel):
    password: str

# --- Auth Endpoints ---

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    async with get_db_connection() as conn:
        user = await conn.fetchrow("SELECT * FROM dashboard_users WHERE username = $1", form_data.username)
        if not user or not auth.verify_password(form_data.password, user['hashed_password']):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token = auth.create_access_token(data={"sub": user['username']})
        return {
            "access_token": access_token, 
            "token_type": "bearer", 
            "username": user['username'],
            "full_name": user['full_name'] or user['username']
        }

@app.post("/api/auth/verify-sudo")
async def verify_sudo(data: SudoVerify, current_user: str = Depends(get_current_user)):
    """Verifica la password dell'operatore per azioni sensibili (SUDO)."""
    async with get_db_connection() as conn:
        user = await conn.fetchrow("SELECT hashed_password FROM dashboard_users WHERE username = $1", current_user)
        if not user or not auth.verify_password(data.password, user['hashed_password']):
            raise HTTPException(status_code=403, detail="Sudo verification failed")
        return {"status": "ok"}

# --- Endpoints ---

@app.get("/api/lookups")
async def get_lookups(current_user: str = Depends(get_current_user)):
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
async def get_sistemi(current_user: str = Depends(get_current_user)):
    """Recupera tutti i sistemi target."""
    async with get_db_connection() as conn:
        rows = await conn.fetch("SELECT * FROM sistemi_target")
        return [dict(r) for r in rows]

@app.post("/api/sistemi")
async def create_sistema(sistema: SystemTarget, current_user: str = Depends(get_current_user)):
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
async def get_utenze(current_user: str = Depends(get_current_user)):
    """Recupera tutte le utenze censite senza le password."""
    async with get_db_connection() as conn:
        rows = await conn.fetch("SELECT id, username, sistema_target_id, bao_owner_id, ticket_id, vault_path, attiva FROM utenze")
        return [dict(r) for r in rows]

@app.post("/api/utenze")
async def create_utenza(utenza: Utenza, current_user: str = Depends(get_current_user)):
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
async def create_unified_entry(entry: UnifiedEntry, request: Request, current_user: str = Depends(get_current_user)):
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

            await log_action("CREATE_ENTRY", {"utenza_id": utenza_id, "username": entry.username, "sistema": entry.nome_sistema}, request, operator=current_user)
            return {"message": "Dati salvati correttamente", "id": utenza_id}

class PasswordUpdate(BaseModel):
    new_password: str

@app.patch("/api/utenze/{utenza_id}/password")
async def update_password(utenza_id: int, update: PasswordUpdate, request: Request, current_user: str = Depends(get_current_user)):
    """
    Aggiorna la password in OpenBao per un'utenza esistente.
    Prima di sovrascrivere, salva la versione precedente nello storico_password.
    """
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT id, username, vault_path, sistema_target_id FROM utenze WHERE id = $1", utenza_id)
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata")
        
        vault_path = row['vault_path']
        
        # 1. Recupera la versione corrente PRIMA di aggiornare
        old_version = get_current_vault_version(vault_path)
        
        # 2. Ottieni il nome del sistema per denormalizzare nello storico
        sistema_nome = await conn.fetchval("SELECT nome_sistema FROM sistemi_target WHERE id = $1", row['sistema_target_id'])
        
        # 3. Registra la versione vecchia nello storico (se esiste una versione precedente)
        if old_version is not None:
            await conn.execute(
                """
                INSERT INTO storico_password (utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da)
                VALUES ($1, $2, $3, $4, $5, 'MODIFICA_PASSWORD', $6)
                """,
                utenza_id, row['username'], sistema_nome, vault_path, old_version, current_user
            )
        
        # 4. Aggiorna la password in Vault (crea nuova versione automaticamente)
        success = store_password(vault_path, update.new_password)
        
        if not success:
            raise HTTPException(status_code=500, detail="Errore aggiornamento Vault")
        
        await log_action("CHANGE_PASSWORD", {"utenza_id": utenza_id, "username": row['username']}, request, operator=current_user)
        return {"message": "Password aggiornata con successo"}

@app.get("/api/utenze/{utenza_id}/password", response_model=PasswordResponse)
async def fetch_password(utenza_id: int, request: Request, current_user: str = Depends(get_current_user)):
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
        await log_action("VIEW_PASSWORD", {"utenza_id": utenza_id, "username": row['username']}, request, operator=current_user)
            
        return {"password": password}

@app.get("/api/audit")
async def get_audit_log(current_user: str = Depends(get_current_user)):
    """Recupera le ultime 200 voci dell'audit log in ordine cronologico inverso."""
    async with get_db_connection() as conn:
        rows = await conn.fetch(
            "SELECT id, timestamp, utente_operatore, azione, dettagli, ip_address FROM audit_log ORDER BY timestamp DESC LIMIT 200"
        )
        return [dict(r) for r in rows]

@app.delete("/api/utenze/{utenza_id}")
async def delete_utenza(utenza_id: int, request: Request, current_user: str = Depends(get_current_user)):
    """
    Cancella logicamente un'utenza:
    1. Registra la versione corrente nello storico_password con azione CANCELLAZIONE
    2. Imposta deleted_at su NOW() (soft-delete)
    """
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT id, username, vault_path, sistema_target_id FROM utenze WHERE id = $1 AND deleted_at IS NULL", utenza_id)
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata o già cancellata")
        
        vault_path = row['vault_path']
        sistema_nome = await conn.fetchval("SELECT nome_sistema FROM sistemi_target WHERE id = $1", row['sistema_target_id'])
        
        # 1. Registra la versione corrente prima di cancellare
        current_version = get_current_vault_version(vault_path)
        if current_version is not None:
            await conn.execute(
                """
                INSERT INTO storico_password (utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da)
                VALUES ($1, $2, $3, $4, $5, 'CANCELLAZIONE', $6)
                """,
                utenza_id, row['username'], sistema_nome, vault_path, current_version, current_user
            )
        
        # 2. Soft-delete
        await conn.execute("UPDATE utenze SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", utenza_id)
        
        await log_action("DELETE_USER", {"utenza_id": utenza_id, "username": row['username']}, request, operator=current_user)
        return {"message": "Utenza cancellata con successo"}

class PasswordHistoryEntry(BaseModel):
    id: int
    utenza_id: int
    username: str
    sistema_nome: str
    vault_path: str
    vault_version: Optional[int]
    azione: str
    eseguito_da: str
    note: Optional[str]
    created_at: str

@app.get("/api/utenze/{utenza_id}/history")
async def get_password_history(utenza_id: int, current_user: str = Depends(get_current_user)):
    """
    Recupera lo storico password per un'utenza.
    Per ogni voce, recupera anche la password effettiva da OpenBao usando vault_version.
    """
    async with get_db_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT id, utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da, note, created_at
            FROM storico_password
            WHERE utenza_id = $1
            ORDER BY created_at DESC
            """,
            utenza_id
        )
        
        history = []
        for row in rows:
            entry = dict(row)
            # Recupera la password storica da Vault se c'è una versione
            if entry['vault_version'] is not None:
                entry['password'] = get_password_by_version(entry['vault_path'], entry['vault_version'])
            else:
                entry['password'] = None  # Voce di cancellazione
            history.append(entry)
        
        return history

@app.get("/api/utenze/cancellate")
async def get_deleted_utenze(current_user: str = Depends(get_current_user)):
    """Recupera tutte le utenze cancellate (soft-delete)."""
    async with get_db_connection() as conn:
        rows = await conn.fetch(
            "SELECT id, username, sistema_target_id, vault_path, deleted_at FROM utenze WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
        )
        return [dict(r) for r in rows]

@app.get("/api/history/global")
async def get_global_history(current_user: str = Depends(get_current_user)):
    """Recupera la cronologia globale di tutte le password (rotazioni e cancellazioni)."""
    async with get_db_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT id, utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da, note, created_at
            FROM storico_password
            ORDER BY created_at DESC
            LIMIT 500
            """
        )
        
        history = []
        for row in rows:
            entry = dict(row)
            if entry['vault_version'] is not None:
                entry['password'] = get_password_by_version(entry['vault_path'], entry['vault_version'])
            else:
                entry['password'] = None
            history.append(entry)
        
        return history
