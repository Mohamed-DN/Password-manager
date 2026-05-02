"""
Router per autenticazione e gestione sessioni.
Ispirato al sistema di login del collega PHP.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.responses import JSONResponse
import secrets
import hashlib
from datetime import datetime, timedelta

from models.schemas import LoginRequest, LoginResponse, MeResponse
from database import get_db_connection
from vault import get_password

router = APIRouter()

# Session store in-memory (in produzione usare Redis)
sessions = {}
SESSION_TIMEOUT = 3600  # 1 ora


def create_session(user_id: int, username: str, ruolo: str, primo_accesso: bool) -> str:
    """Crea una nuova sessione sicura."""
    session_token = secrets.token_urlsafe(32)
    sessions[session_token] = {
        'user_id': user_id,
        'username': username,
        'ruolo': ruolo,
        'primo_accesso': primo_accesso,
        'created_at': datetime.now(),
        'last_activity': datetime.now()
    }
    return session_token


def get_session_from_token(token: str) -> dict | None:
    """Recupera i dati sessione dal token."""
    session = sessions.get(token)
    if not session:
        return None
    
    # Check timeout
    if (datetime.now() - session['last_activity']).total_seconds() > SESSION_TIMEOUT:
        del sessions[token]
        return None
    
    # Update last activity
    session['last_activity'] = datetime.now()
    return session


async def get_current_session(request: Request) -> dict:
    """Dependency per ottenere la sessione corrente."""
    auth_header = request.headers.get('Authorization', '')
    
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
    else:
        token = request.cookies.get('NEXIVAULT_SESS')
    
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    
    session = get_session_from_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Sessione scaduta o non valida")
    
    return session


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, request: Request):
    """
    Autenticazione utente.
    La password è salvata in OpenBao al path: sito/{username}
    """
    async with get_db_connection() as conn:
        # Cerca utente nel DB
        user = await conn.fetchrow(
            "SELECT id, username, ruolo, vault_path, primo_accesso, attivo "
            "FROM site_users WHERE username = $1",
            credentials.username
        )
        
        if not user:
            raise HTTPException(status_code=401, detail="Credenziali non valide")
        
        if not user['attivo']:
            raise HTTPException(status_code=401, detail="Utente disabilitato")
        
        # Recupera password da Vault
        try:
            stored_password = get_password(user['vault_path'])
        except Exception as e:
            raise HTTPException(status_code=503, detail="Errore connessione a OpenBao")
        
        if not stored_password:
            raise HTTPException(status_code=503, detail="Impossibile verificare le credenziali")
        
        # Verifica password
        import bcrypt
        if not bcrypt.checkpw(credentials.password.encode('utf-8'), stored_password.encode('utf-8')):
            raise HTTPException(status_code=401, detail="Credenziali non valide")
        
        # Crea sessione
        session_token = create_session(
            user['id'],
            user['username'],
            user['ruolo'],
            user['primo_accesso']
        )
        
        # Aggiorna primo_accesso se era True
        if user['primo_accesso']:
            await conn.execute(
                "UPDATE site_users SET primo_accesso = FALSE WHERE id = $1",
                user['id']
            )
        
        # Log audit
        await conn.execute(
            """INSERT INTO audit_log (tabella, record_id, operazione, eseguito_da, ip_address)
               VALUES ('site_users', $1, 'LOGIN', $2, $3)""",
            user['id'], user['username'], request.client.host
        )
        
        response = JSONResponse(content={
            "user_id": user['id'],
            "username": user['username'],
            "ruolo": user['ruolo'],
            "primo_accesso": user['primo_accesso']
        })
        
        # Set cookie sicuro
        response.set_cookie(
            key="NEXIVAULT_SESS",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="strict",
            max_age=SESSION_TIMEOUT
        )
        
        return response


@router.post("/logout")
async def logout(session: dict = Depends(get_current_session), request: Request = None):
    """Logout utente e distruzione sessione."""
    # Trova e rimuovi sessione
    for token, data in list(sessions.items()):
        if data['user_id'] == session['user_id']:
            del sessions[token]
            break
    
    # Log audit
    async with get_db_connection() as conn:
        await conn.execute(
            """INSERT INTO audit_log (operazione, eseguito_da, ip_address)
               VALUES ('LOGOUT', $1, $2)""",
            session['username'], request.client.host if request else None
        )
    
    response = JSONResponse(content={"success": True})
    response.delete_cookie("NEXIVAULT_SESS")
    return response


@router.get("/me", response_model=MeResponse)
async def get_me(session: dict = Depends(get_current_session)):
    """Recupera informazioni utente corrente."""
    return {
        "user_id": session['user_id'],
        "username": session['username'],
        "ruolo": session['ruolo']
    }


@router.middleware("http")
async def session_middleware(request, call_next):
    """Middleware per gestire il timeout delle sessioni."""
    response = await call_next(request)
    return response
