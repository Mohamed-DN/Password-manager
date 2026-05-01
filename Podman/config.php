
<?php
// =============================================================================
// config.php — NexiVault | Configurazione centrale
// Le credenziali sensibili vengono lette dalle variabili d'ambiente di Apache
// definite in /etc/httpd/conf.d/nexivaultom.conf (mai hardcoded qui)
// =============================================================================

// --- Database PostgreSQL (container: postgresql) ---
define('DB_DSN',  'pgsql:host=127.0.0.1;port=5432;dbname=nexivaultom');
define('DB_USER', 'nexivault_app');
define('DB_PASS', getenv('DB_PASSWORD') ?: '');

// --- OpenBao (container: openbao, listener HTTP locale 8201) ---
define('VAULT_ADDR',  'http://127.0.0.1:8201');
define('VAULT_TOKEN', getenv('VAULT_TOKEN') ?: '');
define('VAULT_MOUNT', 'passwords');  // KV v2 mount

// --- Applicazione ---
define('APP_NAME',        'NexiVault');
define('APP_VERSION',     '2.0');
define('SESSION_TIMEOUT', 3600);   // secondi (1 ora)

// --- Campi extra per tecnologia ---
// Definisce quali campi JSONB in sistemi_target.configurazione
// e utenze.attributi_specifici ogni tecnologia usa.
// Usato sia da PHP (validazione) che da JavaScript (form dinamico).
define('TECH_CONFIG', [
    'Oracle'   => [
        'sistema'     => [],
        'utenza'      => ['schema_nome'],
        'tipi_codici' => ['OBJ', 'SV', 'NOMINALE'],
    ],
    'MySQL'    => [
        'sistema'     => ['db_server', 'mysql_host'],
        'utenza'      => ['mysql_client_host'],
        'tipi_codici' => ['APP', 'ADMIN', 'SVC'],
    ],
    'Postgres' => [
        'sistema'     => ['db_server', 'service_port', 'hba_conf'],
        'utenza'      => [],
        'tipi_codici' => ['APP', 'ADMIN', 'SVC'],
    ],
    'NoSQL'    => [
        'sistema'     => ['nosql_technology', 'cluster_name'],
        'utenza'      => [],
        'tipi_codici' => ['APP', 'SVC'],
    ],
    'OCI'      => [
        'sistema'     => ['compartment', 'oci_group', 'bucket'],
        'utenza'      => [],
        'tipi_codici' => ['IAM', 'APP'],
    ],
]);
