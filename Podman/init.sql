-- =============================================================================
-- init.sql — Censimento Utenze e Password | Nexi Group
-- =============================================================================
-- Server  : xxmgmplcmaidb01 | IP: 10.119.32.84 | OS: RHEL8
-- Database: nexivaultom | Schema: public
-- OpenBao : v2.2.0 su Podman | KV mount: passwords/ | Policy: app-passwords
-- Postgres: 16 su Podman (container: postgresql)
-- =============================================================================
--
-- ROLLBACK (eseguire PRIMA di questo script):
--   sudo podman exec -i postgresql psql -U postgres -d nexivaultom \
--     -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres;"
--   sudo podman exec -i postgresql psql -U postgres nexivaultom < init.sql
--
-- =============================================================================
-- VAULT PATH CONVENTION (campo vault_path in utenze e site_users):
--   Formato : utenti/{tecnologia}/{ambiente}/{db_name}/{username}
--   Oracle  : utenti/oracle/produzione/P1PDS2CBIP/PIPPO_SV
--   MySQL   : utenti/mysql/sviluppo/otk_db/PIPPO_SV
--   Postgres: utenti/postgres/collaudo/otk_db/PIPPO_SV
--   NoSQL   : utenti/nosql/sviluppo/otk_db/PIPPO_SV
--   OCI     : utenti/oci/sviluppo/CDB05S/oci_dev_bckdb_entkpi
--   SiteUser: sito/{username}
--
--   Il PHP costruisce la chiamata REST:
--     WRITE: PUT  http://127.0.0.1:8201/v1/passwords/data/{vault_path}
--     READ : GET  http://127.0.0.1:8201/v1/passwords/data/{vault_path}
--
-- =============================================================================
-- CAMPI JSONB sistemi_target.configurazione (per tecnologia):
--   Oracle   : {}
--   MySQL    : {"db_server": "mysqlapicbipe01", "host": "%"}
--   Postgres : {"db_server": "xxlegdmudhsuifpbsdahi", "service_port": 5432, "hba_conf": "..."}
--   NoSQL    : {"technology": "Cassandra", "cluster_name": "Hub Fisico"}
--              {"technology": "Couchbase", "cluster_name": "FFMCB3_UAT"}
--   OCI      : {"compartment": "cmp-storage", "oci_group": "oci_dev_bckdb",
--               "bucket": "oci_dev_bckdb_entkpi_bucket01"}
--
-- CAMPI JSONB utenze.attributi_specifici (per tecnologia):
--   MySQL    : {"host": "%"} oppure {"host": "hostname.domain.com"}
--   Tutti    : {} (default vuoto)
-- =============================================================================


-- ============================================================
-- 1. RUOLI
-- ============================================================

-- Ruolo per il backend PHP (lettura + scrittura dati applicativi)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexivault_app') THEN
        CREATE ROLE nexivault_app WITH LOGIN PASSWORD 'CAMBIA_PASSWORD_APP';
    END IF;
END
$$;

-- Ruolo sola lettura (audit, reportistica)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexivault_read') THEN
        CREATE ROLE nexivault_read WITH LOGIN PASSWORD 'CAMBIA_PASSWORD_READ';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO nexivault_app, nexivault_read;


-- ============================================================
-- 2. FUNZIONI
-- ============================================================

-- Aggiorna automaticamente il campo updated_at ad ogni UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Garantisce che per ogni utenza ci sia al massimo UN vault_path attivo
-- nella password_history. Quando viene inserito/aggiornato un record
-- con is_active = TRUE, tutti gli altri della stessa utenza vengono
-- automaticamente disattivati.
CREATE OR REPLACE FUNCTION check_active_password()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active THEN
        UPDATE password_history
        SET    is_active = FALSE
        WHERE  utenza_id = NEW.utenza_id
          AND  id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 3. TABELLE DI DOMINIO (lookup)
-- ============================================================

-- Ambienti di deployment
CREATE TABLE ambienti (
    id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome  VARCHAR(50) UNIQUE NOT NULL
    -- Valori: PRODUZIONE, PREPRODUZIONE, COLLAUDO, SVILUPPO
);

-- Tecnologie supportate
-- NoSQL e' un contenitore unico per Cassandra e Couchbase:
-- la sottotecnologia viene specificata in sistemi_target.configurazione->>'technology'
CREATE TABLE tecnologie (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(50)  UNIQUE NOT NULL,
    descrizione VARCHAR(200)
);

-- Tipi di utenza
-- tecnologia_id NULL  = tipo generico valido per qualsiasi tecnologia
-- tecnologia_id SET   = tipo specifico per quella tecnologia
--                       (es. OBJ/SV/NOMINALE sono esclusivi Oracle)
CREATE TABLE tipo_utenza (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codice          VARCHAR(20)  UNIQUE NOT NULL,
    descrizione     VARCHAR(150),
    tecnologia_id   INTEGER NULL,

    CONSTRAINT fk_tipo_tecnologia
        FOREIGN KEY (tecnologia_id)
        REFERENCES tecnologie(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);


-- ============================================================
-- 4. ANAGRAFICHE
-- ============================================================

-- Responsabili BAO (sempre personale Nexi interno)
CREATE TABLE bao_owners (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    cognome     VARCHAR(100) NOT NULL,
    email       VARCHAR(200) NOT NULL UNIQUE,  -- obbligatoria: personale Nexi ha sempre email aziendale
    matricola   VARCHAR(20)
);

-- Ticket IR (HPSM) di autorizzazione formale alla creazione utenza
-- Le date sono opzionali: possono essere aggiunte successivamente
CREATE TABLE ticket_ir (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codice_ir       VARCHAR(50) UNIQUE NOT NULL,  -- es: IRxxxxxxxx, RS00388882
    data_apertura   DATE,
    data_chiusura   DATE,
    note            TEXT
);


-- ============================================================
-- 5. SISTEMI TARGET (ex database_istanze, ora multi-tecnologia)
-- ============================================================

CREATE TABLE sistemi_target (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- db_name: identificativo tecnico della risorsa/database
    --   Oracle  : nome del DB (P1PDS2CBIP)
    --   MySQL   : nome del database (otk_db)
    --   Postgres: nome del database (otk_db)
    --   NoSQL   : nome del keyspace/bucket (otk_db)
    --   OCI     : nome del CDB (CDB05S)
    db_name         VARCHAR(150) NOT NULL,

    -- nome_sistema: etichetta descrittiva opzionale per la UI
    nome_sistema    VARCHAR(150),

    ambiente_id     INTEGER      NOT NULL,
    tecnologia_id   INTEGER      NOT NULL,

    -- Parametri extra specifici per tecnologia (vedere commento in testa al file)
    configurazione  JSONB        NOT NULL DEFAULT '{}'::jsonb,

    descrizione     VARCHAR(200),
    attivo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sistema_ambiente
        FOREIGN KEY (ambiente_id)
        REFERENCES ambienti(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_sistema_tecnologia
        FOREIGN KEY (tecnologia_id)
        REFERENCES tecnologie(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Stessa combinazione db_name + ambiente + tecnologia non puo' esistere due volte
    CONSTRAINT uq_sistema
        UNIQUE (db_name, ambiente_id, tecnologia_id)
);

CREATE TRIGGER trg_sistemi_updated_at
    BEFORE UPDATE ON sistemi_target
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 6. UTENZE (tabella principale del censimento)
-- ============================================================

CREATE TABLE utenze (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    username            VARCHAR(100) NOT NULL,
    sistema_target_id   INTEGER      NOT NULL,

    -- tipo_utenza_id: NULL consentito per tecnologie non Oracle
    -- dove il concetto di tipo (OBJ/SV/NOMINALE) non si applica
    tipo_utenza_id      INTEGER,

    -- schema_nome: solo per Oracle (es. PIPPO_OBJ owner delle tabelle)
    -- NULL per tutte le altre tecnologie
    schema_nome         VARCHAR(100),

    bao_owner_id        INTEGER      NOT NULL,

    -- ticket_ir_id: FK formale al ticket HPSM di autorizzazione
    -- NULL consentito per utenze legacy censite senza ticket pregresso
    ticket_ir_id        INTEGER,

    -- vault_path: path relativo al mount "passwords/" in OpenBao
    -- Convenzione: utenti/{tecnologia}/{ambiente}/{db_name}/{username}
    -- Il PHP costruisce: http://127.0.0.1:8201/v1/passwords/data/{vault_path}
    vault_path          VARCHAR(300),

    -- Campi extra specifici per utenza (MySQL: host di connessione del client)
    -- Vedere commento in testa al file per il dettaglio per tecnologia
    attributi_specifici JSONB        NOT NULL DEFAULT '{}'::jsonb,

    attiva              BOOLEAN      NOT NULL DEFAULT TRUE,
    note                TEXT,
    created_by          VARCHAR(100),
    updated_by          VARCHAR(100),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_utenza_sistema
        FOREIGN KEY (sistema_target_id)
        REFERENCES sistemi_target(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_utenza_tipo
        FOREIGN KEY (tipo_utenza_id)
        REFERENCES tipo_utenza(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_utenza_bao
        FOREIGN KEY (bao_owner_id)
        REFERENCES bao_owners(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_utenza_ticket
        FOREIGN KEY (ticket_ir_id)
        REFERENCES ticket_ir(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

CREATE TRIGGER trg_utenze_updated_at
    BEFORE UPDATE ON utenze
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 7. PASSWORD HISTORY
-- ============================================================
-- Storico dei vault_path usati per ogni utenza nel tempo.
-- is_active = TRUE  -> vault_path correntemente attivo in OpenBao
-- is_active = FALSE -> versione precedente (storico)
-- Il trigger garantisce un solo is_active = TRUE per utenza.
-- Ogni cambio password inserisce una nuova riga e disattiva la precedente.

CREATE TABLE password_history (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    utenza_id       INTEGER      NOT NULL,
    vault_path      VARCHAR(300) NOT NULL,
    creato_da       VARCHAR(100),
    data_creazione  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active       BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_history_utenza
        FOREIGN KEY (utenza_id)
        REFERENCES utenze(id)
        ON DELETE CASCADE
);

CREATE TRIGGER trigger_single_active_password
    BEFORE INSERT OR UPDATE OF is_active ON password_history
    FOR EACH ROW EXECUTE FUNCTION check_active_password();


-- ============================================================
-- 8. ONE TIME LINKS
-- ============================================================
-- Link monouso per la condivisione sicura di una password.
-- Token casuale unico; dopo il primo accesso usato viene impostato a TRUE.
-- scadenza: TTL del link (es. 24h dalla creazione).
-- Dopo scadenza o utilizzo il link non e' piu' valido.

CREATE TABLE one_time_links (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token           VARCHAR(64)  NOT NULL UNIQUE,
    utenza_id       INTEGER      NOT NULL,
    usato           BOOLEAN      NOT NULL DEFAULT FALSE,
    usato_at        TIMESTAMPTZ,
    scadenza        TIMESTAMPTZ,
    creato_da       VARCHAR(100),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_otl_utenza
        FOREIGN KEY (utenza_id)
        REFERENCES utenze(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 9. SITE USERS (utenti dell'applicazione web PHP)
-- ============================================================
-- Utenti che accedono al sito di censimento.
-- La loro password di login e' salvata in OpenBao al path: sito/{username}
-- separato dalle password delle utenze censite.
-- ruolo 'admin'  -> accesso completo (crea/modifica/elimina)
-- ruolo 'viewer' -> sola lettura (no reveal password di default)

CREATE TABLE site_users (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    email           VARCHAR(200),
    ruolo           VARCHAR(20)  NOT NULL DEFAULT 'viewer'
                        CHECK (ruolo IN ('admin', 'viewer')),
    vault_path      VARCHAR(300) NOT NULL,
    primo_accesso   BOOLEAN      NOT NULL DEFAULT TRUE,
    attivo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_site_users_updated_at
    BEFORE UPDATE ON site_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 10. AUDIT LOG
-- ============================================================
-- Traccia ogni operazione sul DB e sull'applicazione.
-- valori_vecchi / valori_nuovi: snapshot JSONB della riga prima e dopo la modifica.
-- operazione: INSERT | UPDATE | DELETE | VIEW_PASSWORD | LOGIN | LOGOUT | LINK_CREATED

CREATE TABLE audit_log (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabella         VARCHAR(50),
    record_id       INTEGER,
    operazione      VARCHAR(50)  NOT NULL,
    valori_vecchi   JSONB,
    valori_nuovi    JSONB,
    eseguito_da     VARCHAR(100),
    ip_address      VARCHAR(45),
    data_ora        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 11. INDICI
-- ============================================================

-- ambienti
CREATE INDEX idx_ambienti_nome             ON ambienti(nome);

-- tecnologie
CREATE INDEX idx_tecnologie_nome           ON tecnologie(nome);

-- tipo_utenza
CREATE INDEX idx_tipo_utenza_codice        ON tipo_utenza(codice);
CREATE INDEX idx_tipo_utenza_tecnologia    ON tipo_utenza(tecnologia_id);

-- bao_owners
CREATE INDEX idx_bao_owners_email          ON bao_owners(email);
CREATE INDEX idx_bao_owners_cognome        ON bao_owners(cognome);

-- ticket_ir
CREATE INDEX idx_ticket_ir_codice          ON ticket_ir(codice_ir);
CREATE INDEX idx_ticket_ir_data_apertura   ON ticket_ir(data_apertura);

-- sistemi_target
CREATE INDEX idx_sistemi_ambiente          ON sistemi_target(ambiente_id);
CREATE INDEX idx_sistemi_tecnologia        ON sistemi_target(tecnologia_id);
CREATE INDEX idx_sistemi_attivo            ON sistemi_target(attivo);
CREATE INDEX idx_sistemi_configurazione    ON sistemi_target USING GIN (configurazione);

-- utenze
CREATE INDEX idx_utenze_username           ON utenze(username);
CREATE INDEX idx_utenze_sistema            ON utenze(sistema_target_id);
CREATE INDEX idx_utenze_tipo               ON utenze(tipo_utenza_id);
CREATE INDEX idx_utenze_bao_owner          ON utenze(bao_owner_id);
CREATE INDEX idx_utenze_ticket             ON utenze(ticket_ir_id);
CREATE INDEX idx_utenze_attiva             ON utenze(attiva);
CREATE INDEX idx_utenze_attiva_sistema     ON utenze(attiva, sistema_target_id);
CREATE INDEX idx_utenze_tipo_sistema       ON utenze(tipo_utenza_id, sistema_target_id);
CREATE INDEX idx_utenze_vault_path         ON utenze(vault_path);
CREATE INDEX idx_utenze_attributi          ON utenze USING GIN (attributi_specifici);

-- password_history
CREATE INDEX idx_pwd_history_utenza        ON password_history(utenza_id, is_active);

-- one_time_links
CREATE INDEX idx_otl_token                 ON one_time_links(token);
CREATE INDEX idx_otl_usato                 ON one_time_links(usato);
CREATE INDEX idx_otl_utenza                ON one_time_links(utenza_id);

-- site_users
CREATE INDEX idx_site_users_username       ON site_users(username);
CREATE INDEX idx_site_users_ruolo          ON site_users(ruolo);

-- audit_log
CREATE INDEX idx_audit_data_ora            ON audit_log(data_ora DESC);
CREATE INDEX idx_audit_operazione          ON audit_log(operazione);
CREATE INDEX idx_audit_eseguito_da         ON audit_log(eseguito_da);
CREATE INDEX idx_audit_tabella_record      ON audit_log(tabella, record_id);


-- ============================================================
-- 12. DATI BASE
-- ============================================================

INSERT INTO ambienti (nome) VALUES
    ('PRODUZIONE'),
    ('PREPRODUZIONE'),
    ('COLLAUDO'),
    ('SVILUPPO');

INSERT INTO tecnologie (nome, descrizione) VALUES
    ('Oracle',   'Database Oracle RDBMS'),
    ('MySQL',    'Database MySQL'),
    ('Postgres', 'Database PostgreSQL'),
    ('NoSQL',    'Database NoSQL — Cassandra o Couchbase (sottotipo in configurazione->>''technology'')'),
    ('OCI',      'Oracle Cloud Infrastructure');

-- Tipi utenza Oracle (specifici, non applicabili ad altre tecnologie)
INSERT INTO tipo_utenza (codice, descrizione, tecnologia_id) VALUES
    ('OBJ',      'Oracle - Utenza Owner/Schema (suffisso _OBJ)',       (SELECT id FROM tecnologie WHERE nome = 'Oracle')),
    ('SV',       'Oracle - Utenza Applicativa/Service (suffisso _SV)', (SELECT id FROM tecnologie WHERE nome = 'Oracle')),
    ('NOMINALE', 'Oracle - Utenza Nominale (C00/D00 + matricola)',     (SELECT id FROM tecnologie WHERE nome = 'Oracle'));

-- Tipi utenza generici (tecnologia_id NULL = validi per tutte le tecnologie)
INSERT INTO tipo_utenza (codice, descrizione, tecnologia_id) VALUES
    ('APP',   'Utenza Applicativa Generica',                NULL),
    ('ADMIN', 'Utenza Amministrativa',                      NULL),
    ('SVC',   'Service Account',                            NULL),
    ('IAM',   'OCI - Identity and Access Management',       (SELECT id FROM tecnologie WHERE nome = 'OCI'));


-- ============================================================
-- 13. GRANT ESPLICITI (safety net su tutti gli oggetti gia' creati)
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO nexivault_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO nexivault_app;
GRANT SELECT                         ON ALL TABLES    IN SCHEMA public TO nexivault_read;


-- ============================================================
-- QUERY JOIN PRINCIPALE (riferimento per il backend PHP)
-- ============================================================
-- SELECT
--     u.id,
--     u.username,
--     u.vault_path,
--     u.schema_nome,
--     u.attiva,
--     u.note,
--     u.attributi_specifici,
--     s.db_name,
--     s.nome_sistema,
--     s.configurazione            AS sistema_conf,
--     a.nome                      AS ambiente,
--     t.nome                      AS tecnologia,
--     tu.codice                   AS tipo_utenza,
--     bo.nome || ' ' || bo.cognome AS bao_owner,
--     bo.email                    AS bao_email,
--     ti.codice_ir                AS ticket
-- FROM utenze u
-- JOIN sistemi_target s           ON s.id  = u.sistema_target_id
-- JOIN ambienti a                 ON a.id  = s.ambiente_id
-- JOIN tecnologie t               ON t.id  = s.tecnologia_id
-- LEFT JOIN tipo_utenza tu        ON tu.id = u.tipo_utenza_id
-- JOIN bao_owners bo              ON bo.id = u.bao_owner_id
-- LEFT JOIN ticket_ir ti          ON ti.id = u.ticket_ir_id
-- ORDER BY t.nome, a.nome, s.db_name, u.username;
