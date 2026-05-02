"""
Router per creazione entry unificata (sistema + utenza).
Porting dall'API PHP del collega.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from database import get_db_connection
from auth import get_current_session
from vault import store_password
from models.schemas import UnifiedEntryCreate

router = APIRouter()


@router.post("/")
async def create_unified_entry(
    entry: UnifiedEntryCreate,
    request: Request,
    session: dict = Depends(get_current_session)
):
    """
    Crea sistema + utenza in un'unica transazione atomica.
    Gestisce BAO Owner (nuovo o esistente) e Ticket IR.
    """
    async with get_db_connection() as conn:
        async with conn.transaction():
            # 1. Gestione BAO Owner (Nuovo o Esistente)
            if isinstance(entry.bao_owner, str):
                # Creazione nuovo owner
                parti = entry.bao_owner.split(" ", 1)
                nome = parti[0]
                cognome = parti[1] if len(parti) > 1 else ""
                
                bao_owner_id = await conn.fetchval(
                    "INSERT INTO bao_owners (nome, cognome) VALUES ($1, $2) RETURNING id",
                    nome, cognome
                )
            else:
                bao_owner_id = entry.bao_owner
            
            # 2. Gestione Ticket IR (crea se non esiste)
            ticket_id = await conn.fetchval(
                """INSERT INTO ticket_ir (codice_ir) 
                   VALUES ($1) ON CONFLICT (codice_ir) DO NOTHING RETURNING id""",
                entry.ticket_codice
            )
            
            if not ticket_id:
                ticket_id = await conn.fetchval(
                    "SELECT id FROM ticket_ir WHERE codice_ir = $1",
                    entry.ticket_codice
                )
            
            # 3. Creazione Sistema
            sistema_id = await conn.fetchval(
                """INSERT INTO sistemi_target (db_name, nome_sistema, ambiente_id, tecnologia_id, configurazione) 
                   VALUES ($1, $2, $3, $4, $5) RETURNING id""",
                entry.db_name,
                entry.nome_sistema or entry.db_name,
                entry.ambiente_id,
                entry.tecnologia_id,
                entry.configurazione
            )
            
            # 4. Vault - Salvataggio password
            vault_path = f"utenti/{entry.username}_{sistema_id}"
            success = store_password(vault_path, entry.password)
            
            if not success:
                raise HTTPException(status_code=500, detail="Errore salvataggio password in Vault")
            
            # 5. Creazione Utenza
            utenza_id = await conn.fetchval(
                """INSERT INTO utenze (username, sistema_target_id, tipo_utenza_id, bao_owner_id, 
                                      ticket_ir_id, vault_path, attributi_specifici, note, schema_nome)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id""",
                entry.username,
                sistema_id,
                entry.tipo_utenza_id,
                bao_owner_id,
                ticket_id,
                vault_path,
                entry.attributi_specifici,
                entry.note,
                entry.schema_nome
            )
            
            # 6. Audit log
            await conn.execute("""
                INSERT INTO audit_log (tabella, record_id, operazione, eseguito_da, ip_address, valori_nuovi)
                VALUES ('utenze', $1, 'INSERT', $2, $3, $4)
            """, utenza_id, session['username'], request.client.host, 
                {"username": entry.username, "sistema": entry.db_name})
            
            return {
                "success": True,
                "message": "Entry creata con successo",
                "utenza_id": utenza_id,
                "sistema_id": sistema_id
            }
