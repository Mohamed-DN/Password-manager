
<?php
// =============================================================================
// api.php — NexiVault | REST API (endpoint unico)
// Risponde sempre in JSON. Usato sia dal frontend PHP/JS che da sistemi esterni.
//
// ENDPOINT:
//   GET  ?action=health          → stato del sistema
//   POST ?action=login           → autenticazione
//   POST ?action=logout          → logout
//   GET  ?action=me              → utente corrente in sessione
//   GET  ?action=lookups         → dati dropdown (ambienti, tecnologie, tipi, owners, tickets)
//   GET  ?action=stats           → statistiche dashboard
//   GET  ?action=utenze          → lista utenze (con filtri: ?tech=&env=&search=&attiva=)
//   GET  ?action=utenza&id=X     → dettaglio singola utenza
//   POST ?action=create_entry    → crea sistema + ticket + utenza (atomico)
//   POST ?action=update_password → aggiorna password in OpenBao
//   GET  ?action=get_password&id=X → rivela password (loggato in audit)
//   POST ?action=toggle_utenza   → attiva/disattiva utenza
//   DELETE ?action=delete_utenza → elimina utenza + segreto vault
//   GET  ?action=audit           → audit log (filtri: ?limit=&operazione=)
//   POST ?action=create_owner    → crea BAO owner al volo
//   GET  ?action=check_sistema   → controlla se sistema esiste già
// =============================================================================

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/vault.php';

// --- Session ---
session_name('NEXIVAULT_SESS');
session_start();

// --- Input ---
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

// Endpoint pubblici (senza sessione)
$public_actions = ['login', 'health'];

// Autenticazione richiesta per tutto il resto
if (!in_array($action, $public_actions, true)) {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Non autenticato. Effettua il login.']);
        exit;
    }
    // Timeout sessione
    if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity']) > SESSION_TIMEOUT) {
        session_destroy();
        http_response_code(401);
        echo json_encode(['error' => 'Sessione scaduta. Effettua di nuovo il login.']);
        exit;
    }
    $_SESSION['last_activity'] = time();
}

// --- Connessione DB ---
try {
    $pdo = new PDO(DB_DSN, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    http_response_code(503);
    echo json_encode(['error' => 'Database non disponibile.']);
    exit;
}

// --- Router ---
try {
    match($action) {
        'health'          => handle_health(),
        'login'           => handle_login($pdo, $body),
        'logout'          => handle_logout(),
        'me'              => handle_me(),
        'lookups'         => handle_lookups($pdo),
        'stats'           => handle_stats($pdo),
        'utenze'          => handle_utenze($pdo),
        'utenza'          => handle_utenza_detail($pdo),
        'create_entry'    => handle_create_entry($pdo, $body),
        'update_password' => handle_update_password($pdo, $body),
        'get_password'    => handle_get_password($pdo),
        'toggle_utenza'   => handle_toggle_utenza($pdo, $body),
        'delete_utenza'   => handle_delete_utenza($pdo, $body),
        'audit'           => handle_audit($pdo),
        'create_owner'    => handle_create_owner($pdo, $body),
        'check_sistema'   => handle_check_sistema($pdo),
        default           => not_found(),
    };
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore interno: ' . $e->getMessage()]);
}

// =============================================================================
// HELPERS
// =============================================================================

function ok(array|bool $data = [], int $code = 200): void {
    http_response_code($code);
    echo json_encode($data === true ? ['success' => true] : $data);
    exit;
}

function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

function not_found(): void {
    fail('Endpoint non trovato.', 404);
}

function audit_log(PDO $pdo, string $op, ?string $tab, ?int $rid, ?array $old, ?array $new_): void {
    $pdo->prepare("
        INSERT INTO audit_log (tabella, record_id, operazione, valori_vecchi, valori_nuovi, eseguito_da, ip_address)
        VALUES (:tab, :rid, :op, :old, :new, :who, :ip)
    ")->execute([
        ':tab'  => $tab,
        ':rid'  => $rid,
        ':op'   => $op,
        ':old'  => $old  ? json_encode($old)  : null,
        ':new'  => $new_ ? json_encode($new_) : null,
        ':who'  => $_SESSION['username'] ?? 'SYSTEM',
        ':ip'   => $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
}

// =============================================================================
// HANDLERS
// =============================================================================

function handle_health(): void {
    ok(['status' => 'ok', 'app' => APP_NAME, 'version' => APP_VERSION]);
}

// --- LOGIN ---
function handle_login(PDO $pdo, array $body): void {
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$password) fail('Username e password obbligatori.');

    $user = $pdo->prepare("SELECT * FROM site_users WHERE username = :u AND attivo = TRUE");
    $user->execute([':u' => $username]);
    $user = $user->fetch();

    if (!$user) fail('Credenziali non valide.', 401);

    // Legge la password da OpenBao
    try {
        $stored = vault_read($user['vault_path']);
    } catch (Throwable) {
        fail('Errore di connessione a OpenBao.', 503);
    }

    if (!$stored || !password_verify($password, $stored)) {
        fail('Credenziali non valide.', 401);
    }

    // Se è il primo accesso la sessione lo segnala (per forzare cambio password)
    session_regenerate_id(true);
    $_SESSION['user_id']       = $user['id'];
    $_SESSION['username']      = $user['username'];
    $_SESSION['ruolo']         = $user['ruolo'];
    $_SESSION['primo_accesso'] = $user['primo_accesso'];
    $_SESSION['last_activity'] = time();

    // Aggiorna primo_accesso
    if ($user['primo_accesso']) {
        $pdo->prepare("UPDATE site_users SET primo_accesso = FALSE WHERE id = :id")
            ->execute([':id' => $user['id']]);
    }

    ok([
        'username'      => $user['username'],
        'ruolo'         => $user['ruolo'],
        'primo_accesso' => $user['primo_accesso'],
    ]);
}

// --- LOGOUT ---
function handle_logout(): void {
    session_destroy();
    ok(['success' => true]);
}

// --- ME ---
function handle_me(): void {
    ok([
        'user_id'  => $_SESSION['user_id'],
        'username' => $_SESSION['username'],
        'ruolo'    => $_SESSION['ruolo'],
    ]);
}

// --- LOOKUPS ---
function handle_lookups(PDO $pdo): void {
    ok([
        'ambienti'   => $pdo->query("SELECT id, nome FROM ambienti ORDER BY CASE nome WHEN 'PRODUZIONE' THEN 1 WHEN 'PREPRODUZIONE' THEN 2 WHEN 'COLLAUDO' THEN 3 ELSE 4 END")->fetchAll(),
        'tecnologie' => $pdo->query("SELECT id, nome, descrizione FROM tecnologie ORDER BY nome")->fetchAll(),
        'tipi'       => $pdo->query("
            SELECT tu.id, tu.codice, tu.descrizione, tu.tecnologia_id, t.nome AS tecnologia_nome
            FROM tipo_utenza tu
            LEFT JOIN tecnologie t ON t.id = tu.tecnologia_id
            ORDER BY tu.codice
        ")->fetchAll(),
        'owners'     => $pdo->query("SELECT id, nome, cognome, email, matricola FROM bao_owners ORDER BY cognome, nome")->fetchAll(),
        'tickets'    => $pdo->query("SELECT id, codice_ir FROM ticket_ir ORDER BY id DESC LIMIT 100")->fetchAll(),
    ]);
}

// --- STATS ---
function handle_stats(PDO $pdo): void {
    $totale     = $pdo->query("SELECT COUNT(*) FROM utenze")->fetchColumn();
    $attive     = $pdo->query("SELECT COUNT(*) FROM utenze WHERE attiva = TRUE")->fetchColumn();
    $sistemi    = $pdo->query("SELECT COUNT(*) FROM sistemi_target WHERE attivo = TRUE")->fetchColumn();
    $audit_oggi = $pdo->query("SELECT COUNT(*) FROM audit_log WHERE data_ora >= CURRENT_DATE")->fetchColumn();

    $per_tech = $pdo->query("
        SELECT t.nome AS tecnologia, COUNT(u.id) AS totale
        FROM utenze u
        JOIN sistemi_target s ON s.id = u.sistema_target_id
        JOIN tecnologie t ON t.id = s.tecnologia_id
        GROUP BY t.nome ORDER BY totale DESC
    ")->fetchAll();

    $per_env = $pdo->query("
        SELECT a.nome AS ambiente, COUNT(u.id) AS totale
        FROM utenze u
        JOIN sistemi_target s ON s.id = u.sistema_target_id
        JOIN ambienti a ON a.id = s.ambiente_id
        GROUP BY a.nome ORDER BY totale DESC
    ")->fetchAll();

    ok(compact('totale', 'attive', 'sistemi', 'audit_oggi', 'per_tech', 'per_env'));
}

// --- LISTA UTENZE ---
function handle_utenze(PDO $pdo): void {
    $search  = '%' . trim($_GET['search'] ?? '') . '%';
    $tech_id = (int)($_GET['tech'] ?? 0);
    $env_id  = (int)($_GET['env']  ?? 0);
    $attiva  = $_GET['attiva'] ?? '';

    $where  = ['1=1'];
    $params = [];

    if (trim($_GET['search'] ?? '') !== '') {
        $where[]           = "(u.username ILIKE :search OR s.db_name ILIKE :search2 OR ti.codice_ir ILIKE :search3)";
        $params[':search']  = $search;
        $params[':search2'] = $search;
        $params[':search3'] = $search;
    }
    if ($tech_id > 0)  { $where[] = 's.tecnologia_id = :tech'; $params[':tech'] = $tech_id; }
    if ($env_id  > 0)  { $where[] = 's.ambiente_id = :env';    $params[':env']  = $env_id;  }
    if ($attiva === '1') { $where[] = 'u.attiva = TRUE';  }
    if ($attiva === '0') { $where[] = 'u.attiva = FALSE'; }

    $sql = "
        SELECT
            u.id, u.username, u.vault_path, u.attiva,
            u.schema_nome, u.note, u.attributi_specifici,
            u.created_at, u.updated_at,
            s.id AS sistema_id, s.db_name, s.nome_sistema, s.configurazione,
            a.nome AS ambiente,
            t.nome AS tecnologia,
            tu.codice AS tipo_codice, tu.descrizione AS tipo_desc,
            bo.nome || ' ' || bo.cognome AS bao_owner,
            bo.email AS bao_email,
            ti.codice_ir AS ticket
        FROM utenze u
        JOIN sistemi_target s    ON s.id  = u.sistema_target_id
        JOIN ambienti a          ON a.id  = s.ambiente_id
        JOIN tecnologie t        ON t.id  = s.tecnologia_id
        LEFT JOIN tipo_utenza tu ON tu.id = u.tipo_utenza_id
        JOIN bao_owners bo       ON bo.id = u.bao_owner_id
        LEFT JOIN ticket_ir ti   ON ti.id = u.ticket_ir_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY t.nome, a.nome, s.db_name, u.username
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Decode JSON columns
    foreach ($rows as &$r) {
        $r['configurazione']      = json_decode($r['configurazione'] ?? '{}', true);
        $r['attributi_specifici'] = json_decode($r['attributi_specifici'] ?? '{}', true);
    }

    ok($rows);
}

// --- DETTAGLIO UTENZA ---
function handle_utenza_detail(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('ID mancante.');

    $stmt = $pdo->prepare("
        SELECT u.*, s.db_name, s.configurazione, a.nome AS ambiente,
               t.nome AS tecnologia, tu.codice AS tipo_codice,
               bo.nome || ' ' || bo.cognome AS bao_owner, bo.email AS bao_email,
               ti.codice_ir AS ticket
        FROM utenze u
        JOIN sistemi_target s    ON s.id  = u.sistema_target_id
        JOIN ambienti a          ON a.id  = s.ambiente_id
        JOIN tecnologie t        ON t.id  = s.tecnologia_id
        LEFT JOIN tipo_utenza tu ON tu.id = u.tipo_utenza_id
        JOIN bao_owners bo       ON bo.id = u.bao_owner_id
        LEFT JOIN ticket_ir ti   ON ti.id = u.ticket_ir_id
        WHERE u.id = :id
    ");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) fail('Utenza non trovata.', 404);

    $row['configurazione']      = json_decode($row['configurazione'] ?? '{}', true);
    $row['attributi_specifici'] = json_decode($row['attributi_specifici'] ?? '{}', true);

    ok($row);
}

// --- CREA ENTRY (sistema + ticket + utenza) ---
function handle_create_entry(PDO $pdo, array $body): void {
    // Valida campi obbligatori
    $required = ['tecnologia_id', 'ambiente_id', 'db_name', 'username', 'password', 'bao_owner_id', 'ticket_ir'];
    foreach ($required as $f) {
        if (empty($body[$f]) && $body[$f] !== '0') fail("Campo obbligatorio mancante: $f");
    }

    $pdo->beginTransaction();
    try {
        // 1. Recupera nomi per vault_path
        $tech_nome = $pdo->prepare("SELECT nome FROM tecnologie WHERE id = :id");
        $tech_nome->execute([':id' => $body['tecnologia_id']]);
        $tech = $tech_nome->fetchColumn();

        $env_nome = $pdo->prepare("SELECT nome FROM ambienti WHERE id = :id");
        $env_nome->execute([':id' => $body['ambiente_id']]);
        $env = $env_nome->fetchColumn();

        if (!$tech || !$env) fail('Tecnologia o ambiente non validi.');

        // 2. Crea o aggiorna sistema_target (UPSERT)
        $config = [];
        switch ($tech) {
            case 'MySQL':
                if (!empty($body['db_server']))   $config['db_server']   = $body['db_server'];
                if (!empty($body['mysql_host']))   $config['host']        = $body['mysql_host'];
                break;
            case 'Postgres':
                if (!empty($body['db_server']))   $config['db_server']   = $body['db_server'];
                if (!empty($body['service_port'])) $config['service_port'] = (int)$body['service_port'];
                if (!empty($body['hba_conf']))    $config['hba_conf']    = $body['hba_conf'];
                break;
            case 'NoSQL':
                if (!empty($body['nosql_technology'])) $config['technology']  = $body['nosql_technology'];
                if (!empty($body['cluster_name']))     $config['cluster_name'] = $body['cluster_name'];
                break;
            case 'OCI':
                if (!empty($body['compartment'])) $config['compartment'] = $body['compartment'];
                if (!empty($body['oci_group']))   $config['oci_group']   = $body['oci_group'];
                if (!empty($body['bucket']))      $config['bucket']      = $body['bucket'];
                break;
        }

        $pdo->prepare("
            INSERT INTO sistemi_target (db_name, nome_sistema, ambiente_id, tecnologia_id, configurazione, descrizione)
            VALUES (:db, :ns, :amb, :tech, :conf, :desc)
            ON CONFLICT (db_name, ambiente_id, tecnologia_id) DO UPDATE
                SET configurazione = EXCLUDED.configurazione,
                    updated_at     = CURRENT_TIMESTAMP
        ")->execute([
            ':db'   => trim($body['db_name']),
            ':ns'   => trim($body['nome_sistema'] ?? $body['db_name']),
            ':amb'  => $body['ambiente_id'],
            ':tech' => $body['tecnologia_id'],
            ':conf' => json_encode($config),
            ':desc' => trim($body['descrizione'] ?? '') ?: null,
        ]);

        $sistema_id = $pdo->prepare("SELECT id FROM sistemi_target WHERE db_name = :db AND ambiente_id = :amb AND tecnologia_id = :tech");
        $sistema_id->execute([':db' => trim($body['db_name']), ':amb' => $body['ambiente_id'], ':tech' => $body['tecnologia_id']]);
        $sistema_id = (int)$sistema_id->fetchColumn();

        // 3. Crea o ottieni ticket IR
        $codice_ir = strtoupper(trim($body['ticket_ir']));
        $pdo->prepare("
            INSERT INTO ticket_ir (codice_ir) VALUES (:c)
            ON CONFLICT (codice_ir) DO NOTHING
        ")->execute([':c' => $codice_ir]);

        $ticket_id = $pdo->prepare("SELECT id FROM ticket_ir WHERE codice_ir = :c");
        $ticket_id->execute([':c' => $codice_ir]);
        $ticket_id = (int)$ticket_id->fetchColumn();

        // 4. Campi attributi_specifici utenza
        $attrs = [];
        if ($tech === 'MySQL' && !empty($body['mysql_client_host'])) {
            $attrs['host'] = $body['mysql_client_host'];
        }

        // 5. Genera vault_path
        $vpath = vault_path_for($tech, $env, trim($body['db_name']), trim($body['username']));

        // 6. Salva password in OpenBao (con hash per sicurezza)
        $hash = password_hash($body['password'], PASSWORD_BCRYPT);
        if (!vault_write($vpath, $body['password'])) {
            throw new RuntimeException('Impossibile salvare la password in OpenBao.');
        }

        // 7. Crea utenza in DB
        $tipo_id = !empty($body['tipo_utenza_id']) ? (int)$body['tipo_utenza_id'] : null;

        $stmt = $pdo->prepare("
            INSERT INTO utenze
                (username, sistema_target_id, tipo_utenza_id, schema_nome,
                 bao_owner_id, ticket_ir_id, vault_path, attributi_specifici,
                 note, created_by)
            VALUES
                (:usr, :sis, :tipo, :schema,
                 :bao, :tick, :vpath, :attrs,
                 :note, :by)
            RETURNING id
        ");
        $stmt->execute([
            ':usr'    => trim($body['username']),
            ':sis'    => $sistema_id,
            ':tipo'   => $tipo_id,
            ':schema' => trim($body['schema_nome'] ?? '') ?: null,
            ':bao'    => (int)$body['bao_owner_id'],
            ':tick'   => $ticket_id,
            ':vpath'  => $vpath,
            ':attrs'  => json_encode($attrs),
            ':note'   => trim($body['note'] ?? '') ?: null,
            ':by'     => $_SESSION['username'],
        ]);
        $utenza_id = (int)$stmt->fetchColumn();

        // 8. Registra in password_history
        $pdo->prepare("
            INSERT INTO password_history (utenza_id, vault_path, creato_da, is_active)
            VALUES (:uid, :vpath, :by, TRUE)
        ")->execute([':uid' => $utenza_id, ':vpath' => $vpath, ':by' => $_SESSION['username']]);

        // 9. Audit log
        audit_log($pdo, 'INSERT', 'utenze', $utenza_id, null, [
            'username'   => trim($body['username']),
            'tecnologia' => $tech,
            'ambiente'   => $env,
            'db_name'    => trim($body['db_name']),
            'ticket_ir'  => $codice_ir,
        ]);

        $pdo->commit();
        ok(['success' => true, 'utenza_id' => $utenza_id, 'vault_path' => $vpath], 201);

    } catch (Throwable $e) {
        $pdo->rollBack();
        // Se l'utenza era già stata scritta in vault, rimuoviamo
        if (isset($vpath)) { try { vault_delete($vpath); } catch(Throwable) {} }
        throw $e;
    }
}

// --- AGGIORNA PASSWORD ---
function handle_update_password(PDO $pdo, array $body): void {
    $id  = (int)($body['id'] ?? 0);
    $pwd = $body['password'] ?? '';
    if (!$id || !$pwd) fail('ID e password obbligatori.');

    $row = $pdo->prepare("SELECT username, vault_path FROM utenze WHERE id = :id");
    $row->execute([':id' => $id]);
    $row = $row->fetch();
    if (!$row) fail('Utenza non trovata.', 404);

    if (!vault_write($row['vault_path'], $pwd)) fail('Errore OpenBao durante la scrittura.', 503);

    // Aggiorna password_history
    $pdo->prepare("
        UPDATE password_history SET is_active = FALSE WHERE utenza_id = :uid
    ")->execute([':uid' => $id]);

    $pdo->prepare("
        INSERT INTO password_history (utenza_id, vault_path, creato_da, is_active)
        VALUES (:uid, :vpath, :by, TRUE)
    ")->execute([':uid' => $id, ':vpath' => $row['vault_path'], ':by' => $_SESSION['username']]);

    audit_log($pdo, 'CHANGE_PASSWORD', 'utenze', $id, null, ['username' => $row['username']]);
    ok(['success' => true]);
}

// --- RIVELA PASSWORD ---
function handle_get_password(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('ID mancante.');

    $row = $pdo->prepare("SELECT username, vault_path FROM utenze WHERE id = :id AND attiva = TRUE");
    $row->execute([':id' => $id]);
    $row = $row->fetch();
    if (!$row) fail('Utenza non trovata o non attiva.', 404);

    $pwd = vault_read($row['vault_path']);
    if ($pwd === null) fail('Segreto non trovato in OpenBao.', 404);

    audit_log($pdo, 'VIEW_PASSWORD', 'utenze', $id, null, ['username' => $row['username']]);
    ok(['password' => $pwd]);
}

// --- TOGGLE ATTIVA/DISATTIVA ---
function handle_toggle_utenza(PDO $pdo, array $body): void {
    $id = (int)($body['id'] ?? 0);
    if (!$id) fail('ID mancante.');

    $row = $pdo->prepare("SELECT username, attiva FROM utenze WHERE id = :id");
    $row->execute([':id' => $id]);
    $row = $row->fetch();
    if (!$row) fail('Utenza non trovata.', 404);

    $new_state = !$row['attiva'];
    $pdo->prepare("UPDATE utenze SET attiva = :s, updated_by = :by WHERE id = :id")
        ->execute([':s' => $new_state ? 'TRUE' : 'FALSE', ':by' => $_SESSION['username'], ':id' => $id]);

    audit_log($pdo, $new_state ? 'ACTIVATE' : 'DEACTIVATE', 'utenze', $id,
        ['attiva' => $row['attiva']], ['attiva' => $new_state]);

    ok(['success' => true, 'attiva' => $new_state]);
}

// --- ELIMINA UTENZA ---
function handle_delete_utenza(PDO $pdo, array $body): void {
    if (($_SESSION['ruolo'] ?? '') !== 'admin') fail('Permesso negato.', 403);

    $id = (int)($body['id'] ?? 0);
    if (!$id) fail('ID mancante.');

    $row = $pdo->prepare("SELECT username, vault_path FROM utenze WHERE id = :id");
    $row->execute([':id' => $id]);
    $row = $row->fetch();
    if (!$row) fail('Utenza non trovata.', 404);

    // Elimina da vault (non blocca se fallisce)
    try { vault_delete($row['vault_path']); } catch (Throwable) {}

    audit_log($pdo, 'DELETE', 'utenze', $id, ['username' => $row['username'], 'vault_path' => $row['vault_path']], null);

    $pdo->prepare("DELETE FROM utenze WHERE id = :id")->execute([':id' => $id]);
    ok(['success' => true]);
}

// --- AUDIT LOG ---
function handle_audit(PDO $pdo): void {
    $limit = min((int)($_GET['limit'] ?? 200), 500);
    $op    = trim($_GET['operazione'] ?? '');
    $user  = trim($_GET['utente'] ?? '');

    $where  = ['1=1'];
    $params = [];
    if ($op)   { $where[] = 'operazione = :op';        $params[':op']   = $op;   }
    if ($user) { $where[] = 'eseguito_da ILIKE :user'; $params[':user'] = "%$user%"; }

    $stmt = $pdo->prepare("
        SELECT id, tabella, record_id, operazione, valori_vecchi, valori_nuovi,
               eseguito_da, ip_address, data_ora
        FROM audit_log
        WHERE " . implode(' AND ', $where) . "
        ORDER BY data_ora DESC
        LIMIT $limit
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['valori_vecchi'] = $r['valori_vecchi'] ? json_decode($r['valori_vecchi'], true) : null;
        $r['valori_nuovi']  = $r['valori_nuovi']  ? json_decode($r['valori_nuovi'],  true) : null;
    }
    ok($rows);
}

// --- CREA BAO OWNER AL VOLO ---
function handle_create_owner(PDO $pdo, array $body): void {
    $nome    = trim($body['nome']    ?? '');
    $cognome = trim($body['cognome'] ?? '');
    $email   = trim($body['email']   ?? '');

    if (!$nome || !$cognome || !$email) fail('Nome, cognome ed email obbligatori.');

    $stmt = $pdo->prepare("
        INSERT INTO bao_owners (nome, cognome, email, matricola)
        VALUES (:n, :c, :e, :m)
        ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, cognome = EXCLUDED.cognome
        RETURNING id, nome, cognome, email
    ");
    $stmt->execute([':n' => $nome, ':c' => $cognome, ':e' => $email, ':m' => trim($body['matricola'] ?? '') ?: null]);
    ok($stmt->fetch());
}

// --- CHECK SISTEMA ESISTENTE ---
function handle_check_sistema(PDO $pdo): void {
    $db   = trim($_GET['db_name']       ?? '');
    $amb  = (int)($_GET['ambiente_id']  ?? 0);
    $tech = (int)($_GET['tecnologia_id'] ?? 0);

    if (!$db || !$amb || !$tech) ok(['exists' => false]);

    $stmt = $pdo->prepare("
        SELECT id, db_name, configurazione FROM sistemi_target
        WHERE db_name = :db AND ambiente_id = :amb AND tecnologia_id = :tech
    ");
    $stmt->execute([':db' => $db, ':amb' => $amb, ':tech' => $tech]);
    $row = $stmt->fetch();

    if ($row) {
        $row['configurazione'] = json_decode($row['configurazione'], true);
        ok(['exists' => true, 'sistema' => $row]);
    } else {
        ok(['exists' => false]);
    }
}
