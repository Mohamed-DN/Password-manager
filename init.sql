-- init.sql
-- Questo script viene eseguito automaticamente da Postgres al primo avvio del container

-- 1. Ruoli (senza CREATE DATABASE perché POSTGRES_DB nel docker-compose lo crea)
CREATE ROLE inventory_admin WITH LOGIN PASSWORD 'SuperSegretaAdmin123!';
CREATE ROLE inventory_app WITH LOGIN PASSWORD 'PasswordBackend123!';
CREATE ROLE inventory_read WITH LOGIN PASSWORD 'ReadPassword123!';

-- 2. Schema
CREATE SCHEMA inventory AUTHORIZATION inventory_admin;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA inventory TO inventory_app;
GRANT USAGE ON SCHEMA inventory TO inventory_read;

-- Permessi per tabelle future
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory FOR ROLE inventory_admin GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory FOR ROLE inventory_admin GRANT USAGE, SELECT ON SEQUENCES TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory FOR ROLE inventory_admin GRANT SELECT ON TABLES TO inventory_read;

ALTER ROLE inventory_admin SET search_path TO inventory;
ALTER ROLE inventory_app SET search_path TO inventory;
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
    email       VARCHAR(200) UNIQUE NOT NULL,
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

    CONSTRAINT fk_utenze_sistema FOREIGN KEY (sistema_target_id) REFERENCES sistemi_target(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenze_tipo FOREIGN KEY (tipo_utenza_id) REFERENCES tipi_utenza(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenze_bao FOREIGN KEY (bao_owner_id) REFERENCES bao_owners(id) ON DELETE RESTRICT,
    CONSTRAINT fk_utenze_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(id) ON DELETE SET NULL,
    UNIQUE (username, sistema_target_id)
);

CREATE TRIGGER set_timestamp_utenze
    BEFORE UPDATE ON utenze
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. AUDIT LOG (Fondamentale per sistemi critici)
CREATE TABLE audit_log (
    id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    utente_operatore VARCHAR(100), -- Chi ha fatto l'azione (es. user loggato)
    azione          VARCHAR(50),  -- Es: CREATE_SYSTEM, VIEW_PASSWORD, DELETE_USER
    dettagli        JSONB,        -- Es: {"utenza_id": 1, "username": "PIPPO_SV"}
    ip_address      VARCHAR(45)
);

-- 8. INDICI E POPOLAMENTO BASE
CREATE INDEX idx_sistemi_configurazione ON sistemi_target USING GIN (configurazione);
CREATE INDEX idx_utenze_attributi ON utenze USING GIN (attributi_specifici);
CREATE INDEX idx_utenze_sistema ON utenze(sistema_target_id);
CREATE INDEX idx_utenze_bao ON utenze(bao_owner_id);
CREATE INDEX idx_sistemi_ambiente ON sistemi_target(ambiente_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

INSERT INTO ambienti (nome) VALUES ('PRODUZIONE'), ('COLLAUDO'), ('SVILUPPO');
INSERT INTO tecnologie (nome, descrizione) VALUES ('Oracle', 'Database Oracle'), ('MySQL', 'Database MySQL'), ('Postgres', 'Database PostgreSQL'), ('OCI', 'Oracle Cloud Infrastructure');
INSERT INTO tipi_utenza (codice, descrizione) VALUES ('OBJ', 'Utenza Owner/Schema'), ('SV', 'Utenza Applicativa'), ('NOMINALE', 'Utenza Nominale Personale');

RESET ROLE;
