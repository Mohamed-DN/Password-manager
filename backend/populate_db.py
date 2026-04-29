import requests

BASE_URL = "http://localhost:8000/api"

# 1. Popoliamo l'anagrafica BAO Owners e Ticket (facendolo direttamente nel DB per velocità)
# Dato che le API per i lookup non le abbiamo esposte, lo facciamo via SQL, 
# ma prima verifichiamo che i lookup base ci siano.

import asyncpg
import asyncio
import json

async def populate():
    conn = await asyncpg.connect(user="inventory_admin", password="SuperSegretaAdmin123!", database="vault_inventory_db", host="inventory-db", port=5432)
    
    # Inseriamo BAO
    bao_mario = await conn.fetchval("INSERT INTO inventory.bao_owners (nome, cognome, email) VALUES ('Mario', 'Rossi', 'mario.rossi@nexi.it') ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome RETURNING id")
    bao_fabio = await conn.fetchval("INSERT INTO inventory.bao_owners (nome, cognome, email) VALUES ('Fabio', 'Olivo', 'fabio.olivo@nexi.it') ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome RETURNING id")
    
    # Inseriamo Ticket
    ticket_ir = await conn.fetchval("INSERT INTO inventory.ticket (codice_ticket) VALUES ('IRxxxxxxxx') ON CONFLICT (codice_ticket) DO UPDATE SET codice_ticket = EXCLUDED.codice_ticket RETURNING id")
    ticket_rs = await conn.fetchval("INSERT INTO inventory.ticket (codice_ticket) VALUES ('RS00388882') ON CONFLICT (codice_ticket) DO UPDATE SET codice_ticket = EXCLUDED.codice_ticket RETURNING id")

    await conn.close()
    
    # 2. Creiamo Sistemi via API
    # Oracle
    res = requests.post(f"{BASE_URL}/sistemi", json={
        "nome_sistema": "P1PDS2CBIP",
        "ambiente_id": 1, # PRODUZIONE
        "tecnologia_id": 1, # Oracle
        "configurazione": {}
    })
    sys_oracle_id = res.json().get('id')

    # MySQL
    res = requests.post(f"{BASE_URL}/sistemi", json={
        "nome_sistema": "otk_db_mysql",
        "ambiente_id": 3, # SVILUPPO
        "tecnologia_id": 2, # MySQL
        "configurazione": {"db_server": "mysqlapicbipe01"}
    })
    sys_mysql_id = res.json().get('id')

    # Postgres
    res = requests.post(f"{BASE_URL}/sistemi", json={
        "nome_sistema": "otk_db_pg",
        "ambiente_id": 2, # COLLAUDO
        "tecnologia_id": 3, # Postgres
        "configurazione": {"db_server": "xxlegdmudhsuifpbsdahi", "service_port": 5432, "hba_conf": "host all all 0.0.0.0/0 md5"}
    })
    sys_pg_id = res.json().get('id')
    
    # OCI
    res = requests.post(f"{BASE_URL}/sistemi", json={
        "nome_sistema": "CDB05S",
        "ambiente_id": 3, # SVILUPPO
        "tecnologia_id": 4, # OCI
        "configurazione": {"Compartment": "cmp-storage", "Bucket": "oci_dev_bckdb_entkpi_bucket01"}
    })
    sys_oci_id = res.json().get('id')

    # 3. Creiamo Utenze via API (questo salva su DB e su OpenBao)
    requests.post(f"{BASE_URL}/utenze", json={
        "username": "PIPPO_SV",
        "sistema_target_id": sys_oracle_id,
        "tipo_utenza_id": 2, # Applicativa
        "bao_owner_id": bao_mario,
        "ticket_id": ticket_ir,
        "password": "dnjsoapfhsa_oracle",
        "attributi_specifici": {}
    })

    requests.post(f"{BASE_URL}/utenze", json={
        "username": "PIPPO_SV",
        "sistema_target_id": sys_mysql_id,
        "tipo_utenza_id": 2, 
        "bao_owner_id": bao_mario,
        "ticket_id": ticket_ir,
        "password": "dnjsoapfhsa_mysql",
        "attributi_specifici": {"host": "% - hostname.domain.com"}
    })

    requests.post(f"{BASE_URL}/utenze", json={
        "username": "PIPPO_SV",
        "sistema_target_id": sys_pg_id,
        "tipo_utenza_id": 2, 
        "bao_owner_id": bao_mario,
        "ticket_id": ticket_ir,
        "password": "dnjsoapfhsa_pg",
        "attributi_specifici": {}
    })

    requests.post(f"{BASE_URL}/utenze", json={
        "username": "oci_dev_bckdb_entkpi",
        "sistema_target_id": sys_oci_id,
        "tipo_utenza_id": 2, 
        "bao_owner_id": bao_fabio,
        "ticket_id": ticket_rs,
        "password": "password_oci_secret",
        "attributi_specifici": {"Group": "oci_dev_bckdb"}
    })

if __name__ == "__main__":
    asyncio.run(populate())
    print("Database e OpenBao popolati con successo!")
