"""
Router per audit log.
Porting dall'API PHP del collega.
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from database import get_db_connection
from auth import get_current_session

router = APIRouter()


@router.get("/")
async def get_audit_log(
    session: dict = Depends(get_current_session),
    limit: int = Query(default=200, ge=1, le=1000),
    operazione: Optional[str] = None
):
    """
    Recupera audit log con filtri.
    """
    async with get_db_connection() as conn:
        where_clauses = ["1=1"]
        params = [limit]
        
        if operazione:
            where_clauses.append("operazione = $2")
            params.append(operazione)
        
        query = f"""
            SELECT id, tabella, record_id, operazione, valori_vecchi, valori_nuovi, 
                   eseguito_da, ip_address, data_ora
            FROM audit_log
            WHERE {" AND ".join(where_clauses)}
            ORDER BY data_ora DESC
            LIMIT $1
        """
        
        rows = await conn.fetch(query, *params)
        
        result = []
        for r in rows:
            row_dict = dict(r)
            # Converti JSONB in dict Python
            if row_dict['valori_vecchi']:
                import json
                row_dict['valori_vecchi'] = json.loads(row_dict['valori_vecchi'])
            if row_dict['valori_nuovi']:
                import json
                row_dict['valori_nuovi'] = json.loads(row_dict['valori_nuovi'])
            result.append(row_dict)
        
        return result
