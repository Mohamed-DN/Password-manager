-- init.sql
-- Questo script viene eseguito automaticamente da Postgres al primo avvio del container

-- 1. Ruoli (senza CREATE DATABASE perché POSTGRES_DB nel docker-compose lo crea)
CREATE ROLE inventory_admin WITH LOGIN PASSWORD 'SuperSegretaAdmin123!';
CREATE ROLE inventory_app WITH LOGIN PASSWORD 'PasswordBackend123!';
CREATE ROLE inventory_read WITH LOGIN PASSWORD 'ReadPassword123!';
-- Replication user for streaming standby (created by postgres superuser)
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'ReplicaPassword123!';

-- 2. Schema
CREATE SCHEMA inventory AUTHORIZATION inventory_admin;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO inventory_app;
GRANT USAGE ON SCHEMA inventory TO inventory_app;
GRANT USAGE ON SCHEMA inventory TO inventory_read;

-- Permessi per tabelle future
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory FOR ROLE inventory_admin GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory FOR ROLE inventory_admin GRANT USAGE, SELECT ON SEQUENCES TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory FOR ROLE inventory_admin GRANT SELECT ON TABLES TO inventory_read;

ALTER ROLE inventory_admin SET search_path TO inventory;
ALTER ROLE inventory_app SET search_path TO public, inventory;
ALTER ROLE inventory_read SET search_path TO inventory;

-- Impostiamo il ruolo a inventory_admin per creare gli oggetti
SET ROLE inventory_admin;
SET search_path TO inventory;

-- 3. FUNZIONI
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. TABELLE DI DOMINIO
CREATE TABLE ambienti (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE tecnologie (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(50) UNIQUE NOT NULL,
    descrizione VARCHAR(200)
);

CREATE TABLE tipi_utenza (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codice      VARCHAR(20) UNIQUE NOT NULL,
    descrizione VARCHAR(100)
);

-- 5. ANAGRAFICHE
CREATE TABLE bao_owners (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    cognome     VARCHAR(100) NOT NULL,
    email       VARCHAR(200) UNIQUE,
    matricola   VARCHAR(20)
);

CREATE TABLE ticket (
    id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codice_ticket   VARCHAR(50) UNIQUE NOT NULL,
    data_apertura   DATE,
    data_chiusura   DATE,
    note            TEXT
);

-- 6. CORE TABLES
CREATE TABLE sistemi_target (
    id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome_sistema    VARCHAR(150) NOT NULL,
    ambiente_id     INTEGER NOT NULL,
    tecnologia_id   INTEGER NOT NULL,
    configurazione  JSONB DEFAULT '{}'::jsonb, 
    descrizione     TEXT,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sistema_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambienti(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sistema_tecnologia FOREIGN KEY (tecnologia_id) REFERENCES tecnologie(id) ON DELETE RESTRICT,
    UNIQUE (nome_sistema, ambiente_id, tecnologia_id)
);

CREATE TRIGGER set_timestamp_sistemi
    BEFORE UPDATE ON sistemi_target
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE utenze (
    id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username            VARCHAR(150) NOT NULL,
    sistema_target_id   INTEGER NOT NULL,
    tipo_utenza_id      INTEGER NOT NULL,
    bao_owner_id        INTEGER NOT NULL,
    ticket_id           INTEGER,
    vault_path          VARCHAR(500) NOT NULL,
    attributi_specifici JSONB DEFAULT '{}'::jsonb,
    attiva              BOOLEAN DEFAULT TRUE,
    note                TEXT,
    created_by          VARCHAR(100),
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Soft-delete: NULL = utenza attiva, non-NULL = cancellata logicamente
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT fk_utenze_sistema FOREIGN KEY (sistema_target_id) REFERENCES sistemi_target(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenze_tipo FOREIGN KEY (tipo_utenza_id) REFERENCES tipi_utenza(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenze_bao FOREIGN KEY (bao_owner_id) REFERENCES bao_owners(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenze_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(id) ON DELETE SET NULL,
    UNIQUE (username, sistema_target_id)
);

CREATE TRIGGER set_timestamp_utenze
    BEFORE UPDATE ON utenze
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. STORICO PASSWORD
-- Registra ogni modifica di password e ogni cancellazione di utenza.
-- Retensione: 10 anni (nessuna cancellazione automatica; gestire con un job periodico
-- che esegue DELETE FROM storico_password WHERE created_at < NOW() - INTERVAL '10 years').
-- La password NON è salvata qui: è recuperabile da OpenBao usando vault_path + vault_version.
-- OpenBao KV v2 tiene più versioni per segreto (configurato a 200 versioni al startup).
CREATE TABLE storico_password (
    id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    utenza_id       INTEGER NOT NULL,
    -- Denormalizzati per permettere la consultazione anche dopo cancellazione
    username        VARCHAR(150) NOT NULL,
    sistema_nome    VARCHAR(150) NOT NULL,
    vault_path      VARCHAR(500) NOT NULL,
    -- Numero di versione in OpenBao KV v2; NULL per la voce di cancellazione finale
    vault_version   INTEGER,
    -- 'MODIFICA_PASSWORD' | 'CANCELLAZIONE'
    azione          VARCHAR(30) NOT NULL,
    eseguito_da     VARCHAR(100),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_storico_utenza FOREIGN KEY (utenza_id) REFERENCES utenze(id) ON DELETE RESTRICT,
    CONSTRAINT chk_storico_azione CHECK (azione IN ('MODIFICA_PASSWORD', 'CANCELLAZIONE'))
);

CREATE INDEX idx_storico_utenza   ON storico_password(utenza_id);
CREATE INDEX idx_storico_created  ON storico_password(created_at);
CREATE INDEX idx_storico_azione   ON storico_password(azione);

-- 8. AUDIT LOG (Fondamentale per sistemi critici)
CREATE TABLE audit_log (
    id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    utente_operatore VARCHAR(100), -- Chi ha fatto l'azione (es. user loggato)
    azione          VARCHAR(50),  -- Es: CREATE_SYSTEM, VIEW_PASSWORD, DELETE_USER
    dettagli        JSONB,        -- Es: {"utenza_id": 1, "username": "PIPPO_SV"}
    ip_address      VARCHAR(45)
);

-- 9. BETTER AUTH TABLES
-- NOTE: These are created AFTER RESET ROLE so they go into public schema.
-- Better Auth requires these in the public/default schema.

-- 10. INDICI E POPOLAMENTO BASE (inventory schema)
CREATE INDEX idx_sistemi_configurazione ON sistemi_target USING GIN (configurazione);
CREATE INDEX idx_utenze_attributi ON utenze USING GIN (attributi_specifici);
CREATE INDEX idx_utenze_sistema ON utenze(sistema_target_id);
CREATE INDEX idx_utenze_bao ON utenze(bao_owner_id);
CREATE INDEX idx_sistemi_ambiente ON sistemi_target(ambiente_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

INSERT INTO ambienti (nome) VALUES ('PRODUZIONE'), ('PREPRODUZIONE'), ('COLLAUDO'), ('SVILUPPO');
INSERT INTO tecnologie (nome, descrizione) VALUES ('Oracle', 'Database Oracle'), ('MySQL', 'Database MySQL'), ('Postgres', 'Database PostgreSQL'), ('OCI', 'Oracle Cloud Infrastructure'), ('NoSQL', 'Database NoSQL (Cassandra/Couchbase)');
INSERT INTO tipi_utenza (codice, descrizione) VALUES ('OBJ', 'Utenza Owner/Schema'), ('SV', 'Utenza Applicativa'), ('NOMINALE', 'Utenza Nominale Personale');

-- Inserimento Dati Fittizi per Test
INSERT INTO bao_owners (nome, cognome, email, matricola) VALUES 
('Mario', 'Rossi', 'mario.rossi@m-dnvault.local', 'NX001'),
('Luigi', 'Bianchi', 'luigi.bianchi@m-dnvault.local', 'NX002');

INSERT INTO sistemi_target (nome_sistema, ambiente_id, tecnologia_id, descrizione) VALUES
('CRM_DB_CORE', 1, 1, 'Database Centrale CRM in Produzione'),
('PORTALE_WEB_DB', 4, 3, 'Database Portale Web in Sviluppo');

RESET ROLE;

-- =========================================================================
-- Better Auth tables — MUST be in public schema
-- The admin user is created by the backend on first startup via
-- auth.api.signUpEmail() with the correct scrypt password hash.
-- =========================================================================
SET search_path TO public;

CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMP NOT NULL,
    token TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user"(id)
);

CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id),
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP,
    "refreshTokenExpiresAt" TIMESTAMP,
    scope TEXT,
    password TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jwks (
    id TEXT PRIMARY KEY,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Grant inventory_app full access to Better Auth tables
GRANT ALL PRIVILEGES ON TABLE "user", session, account, verification, jwks TO inventory_app;
