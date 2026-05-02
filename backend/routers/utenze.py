"""
Router per gestione utenze.
Porting e miglioramento dall'API PHP del collega.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import Optional, List
from database import get_db_connection
from auth import get_current_session
from vault import get_password, store_password, get_current_vault_version
import json

router = APIRouter()


@router.get("/")
async def get_utenze(
    session: dict = Depends(get_current_session),
    search: Optional[str] = None,
    tech: Optional[int] = None,
    env: Optional[int] = None,
    attiva: Optional[str] = None
):
    """Lista utenze con filtri avanzati (come il collega PHP)."""
    async with get_db_connection() as conn:
        where_clauses = ["u.deleted_at IS NULL"]
        params = {}
        
        if search:
            where_clauses.append("(u.username ILIKE $1 OR s.db_name ILIKE $2 OR ti.codice_ir ILIKE $3)")
            search_pattern = f"%{search}%"
            params['p1'] = search_pattern
            params['p2'] = search_pattern
            params['p3'] = search_pattern
        
        if tech:
            where_clauses.append("s.tecnologia_id = $4")
            params['p4'] = tech
        
        if env:
            where_clauses.append("s.ambiente_id = $5")
            params['p5'] = env
        
        if attiva == '1':
            where_clauses.append("u.attiva = TRUE")
        elif attiva == '0':
            where_clauses.append("u.attiva = FALSE")
        
        where_sql = " AND ".join(where_clauses)
        
        query = f"""
            SELECT
                u.id, u.username, u.vault_path, u.attiva,
                u.schema_nome, u.note, u.attributi_specifici,
                u.created_at, u.updated_at,
                s.id AS sistema_id, s.db_name, s.nome_sistema, s.configurazione,
                a.nome AS ambiente,
                t.nome AS tecnologia,
                tu.codice AS tipo_codice, tu.descrizione AS tipo_desc,
                bo.nome || ' ' || bo.cognome AS bao_owner,
                bo.email AS bao_email,
                ti.codice_ir AS ticket
            FROM utenze u
            JOIN sistemi_target s ON s.id = u.sistema_target_id
            JOIN ambienti a ON a.id = s.ambiente_id
            JOIN tecnologie t ON t.id = s.tecnologia_id
            LEFT JOIN tipo_utenza tu ON tu.id = u.tipo_utenza_id
            JOIN bao_owners bo ON bo.id = u.bao_owner_id
            LEFT JOIN ticket_ir ti ON ti.id = u.ticket_ir_id
            WHERE {where_sql}
            ORDER BY t.nome, a.nome, s.db_name, u.username
        """
        
        rows = await conn.fetch(query, *params.values())
        
        result = []
        for r in rows:
            row_dict = dict(r)
            row_dict['configurazione'] = json.loads(row_dict['configurazione'] or '{}')
            row_dict['attributi_specifici'] = json.loads(row_dict['attributi_specifici'] or '{}')
            result.append(row_dict)
        
        return result


@router.get("/{utenza_id}")
async def get_utenza_detail(utenza_id: int, session: dict = Depends(get_current_session)):
    """Dettaglio singola utenza."""
    async with get_db_connection() as conn:
        row = await conn.fetchrow("""
            SELECT u.*, s.db_name, s.nome_sistema, s.configurazione,
                   a.nome AS ambiente, t.nome AS tecnologia,
                   tu.codice AS tipo_utenza, bo.nome || ' ' || bo.cognome AS bao_owner
            FROM utenze u
            JOIN sistemi_target s ON s.id = u.sistema_target_id
            JOIN ambienti a ON a.id = s.ambiente_id
            JOIN tecnologie t ON t.id = s.tecnologia_id
            LEFT JOIN tipo_utenza tu ON tu.id = u.tipo_utenza_id
            JOIN bao_owners bo ON bo.id = u.bao_owner_id
            WHERE u.id = $1 AND u.deleted_at IS NULL
        """, utenza_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata")
        
        return dict(row)


@router.get("/{utenza_id}/password")
async def reveal_password(utenza_id: int, request: Request, session: dict = Depends(get_current_session)):
    """Rivela password da Vault (con audit log)."""
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT username, vault_path FROM utenze WHERE id = $1", utenza_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata")
        
        password = get_password(row['vault_path'])
        
        if not password:
            raise HTTPException(status_code=500, detail="Password non trovata in Vault")
        
        # Audit log
        await conn.execute("""
            INSERT INTO audit_log (tabella, record_id, operazione, eseguito_da, ip_address)
            VALUES ('utenze', $1, 'VIEW_PASSWORD', $2, $3)
        """, utenza_id, session['username'], request.client.host)
        
        return {"password": password}


@router.patch("/{utenza_id}/password")
async def update_password(
    utenza_id: int,
    payload: dict,
    request: Request,
    session: dict = Depends(get_current_session)
):
    """Aggiorna password in Vault e registra storico."""
    new_password = payload.get('new_password')
    if not new_password or len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password troppo corta (minimo 8 caratteri)")
    
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT username, vault_path, sistema_target_id FROM utenze WHERE id = $1", utenza_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata")
        
        # Recupera versione corrente prima di aggiornare
        old_version = get_current_vault_version(row['vault_path'])
        
        # Ottieni nome sistema
        sistema_nome = await conn.fetchval("SELECT nome_sistema FROM sistemi_target WHERE id = $1", row['sistema_target_id'])
        
        # Registra nello storico
        if old_version is not None:
            await conn.execute("""
                INSERT INTO storico_password (utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da)
                VALUES ($1, $2, $3, $4, $5, 'MODIFICA_PASSWORD', $6)
            """, utenza_id, row['username'], sistema_nome, row['vault_path'], old_version, session['username'])
        
        # Aggiorna in Vault
        success = store_password(row['vault_path'], new_password)
        
        if not success:
            raise HTTPException(status_code=500, detail="Errore aggiornamento Vault")
        
        # Audit log
        await conn.execute("""
            INSERT INTO audit_log (tabella, record_id, operazione, eseguito_da, ip_address)
            VALUES ('utenze', $1, 'CHANGE_PASSWORD', $2, $3)
        """, utenza_id, session['username'], request.client.host)
        
        return {"success": True, "message": "Password aggiornata"}


@router.post("/{utenza_id}/toggle")
async def toggle_utenza(utenza_id: int, request: Request, session: dict = Depends(get_current_session)):
    """Attiva/disattiva utenza."""
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT attiva FROM utenze WHERE id = $1", utenza_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata")
        
        nuova_stato = not row['attiva']
        await conn.execute("UPDATE utenze SET attiva = $1 WHERE id = $2", nuova_stato, utenza_id)
        
        # Audit log
        operazione = 'ACTIVATE' if nuova_stato else 'DEACTIVATE'
        await conn.execute("""
            INSERT INTO audit_log (tabella, record_id, operazione, eseguito_da, ip_address)
            VALUES ('utenze', $1, $2, $3, $4)
        """, utenza_id, operazione, session['username'], request.client.host)
        
        return {"success": True, "attiva": nuova_stato}


@router.delete("/{utenza_id}")
async def delete_utenza(utenza_id: int, request: Request, session: dict = Depends(get_current_session)):
    """Soft-delete utenza con archiviazione storico."""
    async with get_db_connection() as conn:
        row = await conn.fetchrow("SELECT username, vault_path, sistema_target_id FROM utenze WHERE id = $1 AND deleted_at IS NULL", utenza_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Utenza non trovata o già cancellata")
        
        sistema_nome = await conn.fetchval("SELECT nome_sistema FROM sistemi_target WHERE id = $1", row['sistema_target_id'])
        
        # Registra versione corrente nello storico
        current_version = get_current_vault_version(row['vault_path'])
        if current_version is not None:
            await conn.execute("""
                INSERT INTO storico_password (utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da)
                VALUES ($1, $2, $3, $4, $5, 'CANCELLAZIONE', $6)
            """, utenza_id, row['username'], sistema_nome, row['vault_path'], current_version, session['username'])
        
        # Soft delete
        await conn.execute("UPDATE utenze SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", utenza_id)
        
        # Audit log
        await conn.execute("""
            INSERT INTO audit_log (tabella, record_id, operazione, eseguito_da, ip_address)
            VALUES ('utenze', $1, 'DELETE', $2, $3)
        """, utenza_id, session['username'], request.client.host)
        
        return {"success": True, "message": "Utenza cancellata"}


@router.get("/{utenza_id}/history")
async def get_password_history(utenza_id: int, session: dict = Depends(get_current_session)):
    """Recupera storico password per un'utenza."""
    async with get_db_connection() as conn:
        rows = await conn.fetch("""
            SELECT id, utenza_id, username, sistema_nome, vault_path, vault_version, azione, eseguito_da, note, created_at
            FROM storico_password
            WHERE utenza_id = $1
            ORDER BY created_at DESC
        """, utenza_id)
        
        history = []
        for row in rows:
            entry = dict(row)
            if entry['vault_version'] is not None:
                from vault import get_password_by_version
                entry['password'] = get_password_by_version(entry['vault_path'], entry['vault_version'])
            else:
                entry['password'] = None
            history.append(entry)
        
        return history
