-- =============================================================================
-- init.sql — M-DNVault | Database Schema Production-Ready
-- Basato sullo schema del collega PHP, adattato per FastAPI + React
-- =============================================================================

-- 1. RUOLI
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory_app') THEN
        CREATE ROLE inventory_app WITH LOGIN PASSWORD 'PasswordBackend123!';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory_read') THEN
        CREATE ROLE inventory_read WITH LOGIN PASSWORD 'ReadPassword123!';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
        CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'ReplicaPassword123!';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO inventory_app, inventory_read;
GRANT USAGE ON SCHEMA inventory TO inventory_app, inventory_read;

-- 2. FUNZIONI
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_active_password()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active THEN
        UPDATE password_history
        SET is_active = FALSE
        WHERE utenza_id = NEW.utenza_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. TABELLE DI DOMINIO
CREATE TABLE IF NOT EXISTS ambienti (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tecnologie (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(50) UNIQUE NOT NULL,
    descrizione VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS tipo_utenza (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codice VARCHAR(20) UNIQUE NOT NULL,
    descrizione VARCHAR(150),
    tecnologia_id INTEGER NULL,
    CONSTRAINT fk_tipo_tecnologia FOREIGN KEY (tecnologia_id) REFERENCES tecnologie(id) ON DELETE SET NULL
);

-- 4. ANAGRAFICHE
CREATE TABLE IF NOT EXISTS bao_owners (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    email VARCHAR(200) UNIQUE,
    matricola VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS ticket_ir (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codice_ir VARCHAR(50) UNIQUE NOT NULL,
    data_apertura DATE,
    data_chiusura DATE,
    note TEXT
);

-- 5. SISTEMI TARGET
CREATE TABLE IF NOT EXISTS sistemi_target (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    db_name VARCHAR(150) NOT NULL,
    nome_sistema VARCHAR(150),
    ambiente_id INTEGER NOT NULL,
    tecnologia_id INTEGER NOT NULL,
    configurazione JSONB NOT NULL DEFAULT '{}'::jsonb,
    descrizione VARCHAR(200),
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_sistema_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambienti(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sistema_tecnologia FOREIGN KEY (tecnologia_id) REFERENCES tecnologie(id) ON DELETE RESTRICT,
    CONSTRAINT uq_sistema UNIQUE (db_name, ambiente_id, tecnologia_id)
);

CREATE TRIGGER trg_sistemi_updated_at BEFORE UPDATE ON sistemi_target
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. UTENZE
CREATE TABLE IF NOT EXISTS utenze (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    sistema_target_id INTEGER NOT NULL,
    tipo_utenza_id INTEGER,
    schema_nome VARCHAR(100),
    bao_owner_id INTEGER NOT NULL,
    ticket_ir_id INTEGER,
    vault_path VARCHAR(300),
    attributi_specifici JSONB NOT NULL DEFAULT '{}'::jsonb,
    attiva BOOLEAN NOT NULL DEFAULT TRUE,
    note TEXT,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT fk_utenza_sistema FOREIGN KEY (sistema_target_id) REFERENCES sistemi_target(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenza_tipo FOREIGN KEY (tipo_utenza_id) REFERENCES tipo_utenza(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenza_bao FOREIGN KEY (bao_owner_id) REFERENCES bao_owners(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenza_ticket FOREIGN KEY (ticket_ir_id) REFERENCES ticket_ir(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_utenze_updated_at BEFORE UPDATE ON utenze
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. STORICO PASSWORD
CREATE TABLE IF NOT EXISTS storico_password (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    utenza_id INTEGER NOT NULL,
    username VARCHAR(150) NOT NULL,
    sistema_nome VARCHAR(150) NOT NULL,
    vault_path VARCHAR(500) NOT NULL,
    vault_version INTEGER,
    azione VARCHAR(30) NOT NULL CHECK (azione IN ('MODIFICA_PASSWORD', 'CANCELLAZIONE')),
    eseguito_da VARCHAR(100),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_storico_utenza FOREIGN KEY (utenza_id) REFERENCES utenze(id) ON DELETE RESTRICT
);

CREATE INDEX idx_storico_utenza ON storico_password(utenza_id);
CREATE INDEX idx_storico_created ON storico_password(created_at);

-- 8. AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabella VARCHAR(50),
    record_id INTEGER,
    operazione VARCHAR(50) NOT NULL,
    valori_vecchi JSONB,
    valori_nuovi JSONB,
    eseguito_da VARCHAR(100),
    ip_address VARCHAR(45),
    data_ora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_data ON audit_log(data_ora DESC);
CREATE INDEX idx_audit_operazione ON audit_log(operazione);

-- 9. SITE USERS (utenti applicazione)
CREATE TABLE IF NOT EXISTS site_users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(200),
    ruolo VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (ruolo IN ('admin', 'viewer')),
    vault_path VARCHAR(300) NOT NULL,
    primo_accesso BOOLEAN NOT NULL DEFAULT TRUE,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. DATI BASE
INSERT INTO ambienti (nome) VALUES 
    ('PRODUZIONE'), ('PREPRODUZIONE'), ('COLLAUDO'), ('SVILUPPO')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO tecnologie (nome, descrizione) VALUES 
    ('Oracle', 'Database Oracle RDBMS'),
    ('MySQL', 'Database MySQL'),
    ('Postgres', 'Database PostgreSQL'),
    ('NoSQL', 'Database NoSQL - Cassandra o Couchbase'),
    ('OCI', 'Oracle Cloud Infrastructure')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO tipo_utenza (codice, descrizione, tecnologia_id) VALUES
    ('OBJ', 'Oracle - Utenza Owner/Schema', (SELECT id FROM tecnologie WHERE nome = 'Oracle')),
    ('SV', 'Oracle - Utenza Applicativa', (SELECT id FROM tecnologie WHERE nome = 'Oracle')),
    ('NOMINALE', 'Oracle - Utenza Nominale', (SELECT id FROM tecnologie WHERE nome = 'Oracle')),
    ('APP', 'Utenza Applicativa Generica', NULL),
    ('ADMIN', 'Utenza Amministrativa', NULL),
    ('SVC', 'Service Account', NULL)
ON CONFLICT (codice) DO NOTHING;

-- GRANT finali
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory TO inventory_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO inventory_app;
GRANT SELECT ON ALL TABLES IN SCHEMA inventory TO inventory_read;
