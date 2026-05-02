import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'inventory-db',
  user: process.env.DB_USER || 'inventory_app',
  password: process.env.DB_PASSWORD || 'PasswordBackend123!',
  database: process.env.DB_NAME || 'vault_inventory_db',
  port: parseInt(process.env.DB_PORT || '5432'),
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
