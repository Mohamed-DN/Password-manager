import asyncpg
import json
import os
from contextlib import asynccontextmanager

DB_USER = os.getenv("DB_USER", "inventory_app")
DB_PASSWORD = os.getenv("DB_PASSWORD", "PasswordBackend123!")
DB_HOST = os.getenv("DB_HOST", "inventory-db")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "vault_inventory_db")
DB_SCHEMA = os.getenv("DB_SCHEMA", "inventory")

class Database:
    def __init__(self):
        self.pool = None

    async def connect(self):
        async def init(conn):
            await conn.set_type_codec(
                'jsonb',
                encoder=json.dumps,
                decoder=json.loads,
                schema='pg_catalog'
            )

        self.pool = await asyncpg.create_pool(
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            server_settings={'search_path': DB_SCHEMA},
            init=init
        )

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

db = Database()

@asynccontextmanager
async def get_db_connection():
    async with db.pool.acquire() as connection:
        yield connection
