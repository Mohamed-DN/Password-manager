"""
Router per la dashboard con statistiche.
Porting diretto dall'API PHP del collega.
"""

from fastapi import APIRouter, Depends
from database import get_db_connection
from auth import get_current_session

router = APIRouter()


@router.get("/stats")
async def get_stats(session: dict = Depends(get_current_session)):
    """
    Recupera statistiche per la dashboard:
    - totale utenze
    - utenze attive
    - sistemi censiti
    - azioni audit oggi
    - distribuzione per tecnologia
    - distribuzione per ambiente
    """
    async with get_db_connection() as conn:
        # Conteggi base
        totale = await conn.fetchval("SELECT COUNT(*) FROM utenze WHERE deleted_at IS NULL")
        attive = await conn.fetchval("SELECT COUNT(*) FROM utenze WHERE attiva = TRUE AND deleted_at IS NULL")
        sistemi = await conn.fetchval("SELECT COUNT(*) FROM sistemi_target WHERE attivo = TRUE")
        audit_oggi = await conn.fetchval(
            "SELECT COUNT(*) FROM audit_log WHERE data_ora >= CURRENT_DATE"
        )
        
        # Distribuzione per tecnologia
        per_tech_raw = await conn.fetch(
            """SELECT t.nome AS tecnologia, COUNT(u.id) AS totale
               FROM utenze u
               JOIN sistemi_target s ON s.id = u.sistema_target_id
               JOIN tecnologie t ON t.id = s.tecnologia_id
               WHERE u.deleted_at IS NULL
               GROUP BY t.nome ORDER BY totale DESC"""
        )
        per_tech = [{"tecnologia": r['tecnologia'], "totale": r['totale']} for r in per_tech_raw]
        
        # Distribuzione per ambiente
        per_env_raw = await conn.fetch(
            """SELECT a.nome AS ambiente, COUNT(u.id) AS totale
               FROM utenze u
               JOIN sistemi_target s ON s.id = u.sistema_target_id
               JOIN ambienti a ON a.id = s.ambiente_id
               WHERE u.deleted_at IS NULL
               GROUP BY a.nome ORDER BY totale DESC"""
        )
        per_env = [{"ambiente": r['ambiente'], "totale": r['totale']} for r in per_env_raw]
        
        return {
            "totale": totale or 0,
            "attive": attive or 0,
            "sistemi": sistemi or 0,
            "audit_oggi": audit_oggi or 0,
            "per_tech": per_tech,
            "per_env": per_env
        }
