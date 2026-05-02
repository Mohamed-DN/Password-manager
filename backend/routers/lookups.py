"""
Router per i dati di lookup (dropdown).
Porting diretto dall'API PHP del collega.
"""

from fastapi import APIRouter, Depends
from database import get_db_connection
from auth import get_current_session

router = APIRouter()


@router.get("/")
async def get_lookups(session: dict = Depends(get_current_session)):
    """
    Recupera tutti i dati per i dropdown:
    - ambienti
    - tecnologie  
    - tipi utenza
    - bao owners
    - ticket IR
    """
    async with get_db_connection() as conn:
        ambienti = await conn.fetch(
            "SELECT id, nome FROM ambienti ORDER BY "
            "CASE nome WHEN 'PRODUZIONE' THEN 1 WHEN 'PREPRODUZIONE' THEN 2 "
            "WHEN 'COLLAUDO' THEN 3 ELSE 4 END"
        )
        
        tecnologie = await conn.fetch(
            "SELECT id, nome, descrizione FROM tecnologie ORDER BY nome"
        )
        
        tipi = await conn.fetch(
            """SELECT tu.id, tu.codice, tu.descrizione, tu.tecnologia_id, t.nome AS tecnologia_nome
               FROM tipo_utenza tu
               LEFT JOIN tecnologie t ON t.id = tu.tecnologia_id
               ORDER BY tu.codice"""
        )
        
        owners = await conn.fetch(
            "SELECT id, nome, cognome, email, matricola FROM bao_owners ORDER BY cognome, nome"
        )
        
        tickets = await conn.fetch(
            "SELECT id, codice_ir FROM ticket_ir ORDER BY id DESC LIMIT 100"
        )
        
        return {
            "ambienti": [dict(r) for r in ambienti],
            "tecnologie": [dict(r) for r in tecnologie],
            "tipi": [dict(r) for r in tipi],
            "owners": [dict(r) for r in owners],
            "tickets": [dict(r) for r in tickets]
        }
