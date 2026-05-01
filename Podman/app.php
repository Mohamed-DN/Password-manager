<?php
// =============================================================================
// app.php — NexiVault | Applicazione principale
// =============================================================================
require_once __DIR__ . '/config.php';
session_name('NEXIVAULT_SESS');
session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: index.php');
    exit;
}
if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity']) > SESSION_TIMEOUT) {
    session_destroy();
    header('Location: index.php?expired=1');
    exit;
}
$_SESSION['last_activity'] = time();

$current_user = $_SESSION['username'] ?? '';
$current_role = $_SESSION['ruolo']    ?? 'viewer';
$is_admin     = $current_role === 'admin';
$initials     = strtoupper(substr($current_user, 0, 2));
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexiVault</title>
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="app-body">

<!-- ======================================================== -->
<!-- SIDEBAR                                                   -->
<!-- ======================================================== -->
<aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
        <div class="brand">
            <div class="brand-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            <span class="brand-name">NexiVault</span>
        </div>
    </div>

    <nav class="sidebar-nav">
        <button class="nav-item active" data-section="dashboard" onclick="showSection('dashboard', this)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            <span>Dashboard</span>
        </button>

        <button class="nav-item" data-section="inventario" onclick="showSection('inventario', this)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            <span>Inventario</span>
        </button>

        <?php if ($is_admin): ?>
        <button class="nav-item" data-section="nuova" onclick="showSection('nuova', this)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <span>Nuova Utenza</span>
        </button>
        <?php endif; ?>

        <button class="nav-item" data-section="audit" onclick="showSection('audit', this)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <span>Audit Log</span>
        </button>
    </nav>

    <div class="sidebar-footer">
        <div class="user-card">
            <div class="user-avatar"><?= htmlspecialchars($initials) ?></div>
            <div class="user-info">
                <span class="user-name"><?= htmlspecialchars($current_user) ?></span>
                <span class="user-role"><?= htmlspecialchars($current_role) ?></span>
            </div>
        </div>
        <button class="btn-logout" onclick="logout()" title="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
        </button>
    </div>
</aside>

<!-- ======================================================== -->
<!-- MAIN CONTENT                                             -->
<!-- ======================================================== -->
<main class="main-content">

    <!-- ===== DASHBOARD ===== -->
    <section class="section active" id="section-dashboard">
        <div class="section-header">
            <div>
                <h2>Dashboard</h2>
                <p class="section-sub">Panoramica del censimento utenze</p>
            </div>
        </div>

        <div class="stats-grid" id="stats-grid">
            <div class="stat-card skeleton"></div>
            <div class="stat-card skeleton"></div>
            <div class="stat-card skeleton"></div>
            <div class="stat-card skeleton"></div>
        </div>

        <div class="charts-grid">
            <div class="chart-card">
                <h3>Utenze per Tecnologia</h3>
                <div id="chart-tech" class="bar-chart"></div>
            </div>
            <div class="chart-card">
                <h3>Utenze per Ambiente</h3>
                <div id="chart-env" class="bar-chart"></div>
            </div>
        </div>
    </section>

    <!-- ===== INVENTARIO ===== -->
    <section class="section" id="section-inventario">
        <div class="section-header">
            <div>
                <h2>Inventario Utenze</h2>
                <p class="section-sub">Tutte le credenziali censite</p>
            </div>
            <?php if ($is_admin): ?>
            <button class="btn-primary" onclick="showSection('nuova', document.querySelector('[data-section=nuova]'))">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nuova Utenza
            </button>
            <?php endif; ?>
        </div>

        <!-- Filtri -->
        <div class="filter-bar">
            <div class="search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="filter-search" placeholder="Cerca username, DB, ticket..." oninput="filterInventario()">
            </div>
            <select id="filter-tech" onchange="filterInventario()">
                <option value="">Tutte le tecnologie</option>
            </select>
            <select id="filter-env" onchange="filterInventario()">
                <option value="">Tutti gli ambienti</option>
            </select>
            <select id="filter-attiva" onchange="filterInventario()">
                <option value="">Tutti gli stati</option>
                <option value="1">Attive</option>
                <option value="0">Disattivate</option>
            </select>
            <button class="btn-ghost" onclick="loadInventario()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Aggiorna
            </button>
        </div>

        <div class="table-wrapper">
            <table class="data-table" id="table-utenze">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Database / Sistema</th>
                        <th>Tecnologia</th>
                        <th>Ambiente</th>
                        <th>Tipo</th>
                        <th>BAO Owner</th>
                        <th>Ticket</th>
                        <th>Stato</th>
                        <th class="col-actions">Azioni</th>
                    </tr>
                </thead>
                <tbody id="tbody-utenze">
                    <tr><td colspan="9" class="table-loading">Caricamento...</td></tr>
                </tbody>
            </table>
        </div>
    </section>

    <!-- ===== NUOVA UTENZA ===== -->
    <?php if ($is_admin): ?>
    <section class="section" id="section-nuova">
        <div class="section-header">
            <div>
                <h2>Nuova Utenza</h2>
                <p class="section-sub">Censisci un nuovo accesso nel sistema</p>
            </div>
        </div>

        <div class="form-card">
            <form id="form-nuova" onsubmit="submitNuovaUtenza(event)" autocomplete="off" novalidate>

                <!-- Step 1: Tecnologia (determina il resto del form) -->
                <div class="form-section">
                    <h3 class="form-section-title">
                        <span class="step-num">1</span> Tecnologia e Ambiente
                    </h3>
                    <div class="form-grid col2">
                        <div class="field-group required">
                            <label>Tecnologia</label>
                            <select name="tecnologia_id" id="f-tecnologia" required onchange="onTechChange(this)">
                                <option value="">Seleziona tecnologia...</option>
                            </select>
                        </div>
                        <div class="field-group required">
                            <label>Ambiente</label>
                            <select name="ambiente_id" id="f-ambiente" required>
                                <option value="">Seleziona ambiente...</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Step 2: Sistema (db_name + campi specifici per tecnologia) -->
                <div class="form-section">
                    <h3 class="form-section-title">
                        <span class="step-num">2</span> Sistema / Database
                        <span id="sistema-exists-badge" class="badge badge-info" style="display:none">Sistema già esistente</span>
                    </h3>
                    <div class="form-grid col2">
                        <div class="field-group required">
                            <label id="label-db-name">Nome Database</label>
                            <input type="text" name="db_name" id="f-db-name" required
                                   placeholder="es: P1PDS2CBIP" oninput="debouncedCheckSistema()">
                        </div>
                        <div class="field-group">
                            <label>Etichetta descrittiva (opzionale)</label>
                            <input type="text" name="nome_sistema" id="f-nome-sistema" placeholder="es: DB Pagamenti Prod">
                        </div>
                    </div>

                    <!-- Oracle: nessun campo extra -->

                    <!-- MySQL extra -->
                    <div class="tech-fields" data-tech="MySQL" style="display:none">
                        <div class="form-grid col2">
                            <div class="field-group">
                                <label>DB Server</label>
                                <input type="text" name="db_server" id="f-db-server" placeholder="mysqlapicbipe01">
                            </div>
                            <div class="field-group">
                                <label>Host MySQL (accesso server)</label>
                                <input type="text" name="mysql_host" id="f-mysql-host" placeholder="% oppure hostname.domain.com">
                                <span class="field-hint">% = qualsiasi host</span>
                            </div>
                        </div>
                    </div>

                    <!-- Postgres extra -->
                    <div class="tech-fields" data-tech="Postgres" style="display:none">
                        <div class="form-grid col3">
                            <div class="field-group">
                                <label>DB Server</label>
                                <input type="text" name="db_server" id="f-pg-server" placeholder="xxlegdmudhsuifpbsdahi">
                            </div>
                            <div class="field-group">
                                <label>Porta</label>
                                <input type="number" name="service_port" id="f-service-port" placeholder="5432" value="5432" min="1" max="65535">
                            </div>
                            <div class="field-group">
                                <label>HBA Config</label>
                                <input type="text" name="hba_conf" id="f-hba-conf" placeholder="opzionale">
                            </div>
                        </div>
                    </div>

                    <!-- NoSQL extra -->
                    <div class="tech-fields" data-tech="NoSQL" style="display:none">
                        <div class="form-grid col2">
                            <div class="field-group">
                                <label>Sottotecnologia</label>
                                <select name="nosql_technology" id="f-nosql-tech">
                                    <option value="">Seleziona...</option>
                                    <option value="Cassandra">Cassandra</option>
                                    <option value="Couchbase">Couchbase</option>
                                </select>
                            </div>
                            <div class="field-group">
                                <label>Cluster Name</label>
                                <input type="text" name="cluster_name" id="f-cluster-name" placeholder="es: Hub Fisico">
                            </div>
                        </div>
                    </div>

                    <!-- OCI extra -->
                    <div class="tech-fields" data-tech="OCI" style="display:none">
                        <div class="form-grid col3">
                            <div class="field-group">
                                <label>Compartment</label>
                                <input type="text" name="compartment" id="f-compartment" placeholder="cmp-storage">
                            </div>
                            <div class="field-group">
                                <label>Group</label>
                                <input type="text" name="oci_group" id="f-oci-group" placeholder="oci_dev_bckdb">
                            </div>
                            <div class="field-group">
                                <label>Bucket</label>
                                <input type="text" name="bucket" id="f-bucket" placeholder="oci_dev_bckdb_entkpi_bucket01">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Step 3: Utenza -->
                <div class="form-section">
                    <h3 class="form-section-title">
                        <span class="step-num">3</span> Credenziali Utenza
                    </h3>
                    <div class="form-grid col2">
                        <div class="field-group required">
                            <label>Username</label>
                            <input type="text" name="username" id="f-username" required placeholder="es: PIPPO_SV">
                        </div>
                        <div class="field-group required" id="fg-tipo">
                            <label>Tipo Utenza</label>
                            <select name="tipo_utenza_id" id="f-tipo">
                                <option value="">Seleziona tipo...</option>
                            </select>
                        </div>
                    </div>

                    <!-- Schema nome: solo Oracle -->
                    <div class="tech-fields" data-tech="Oracle" style="display:none">
                        <div class="form-grid col2">
                            <div class="field-group">
                                <label>Schema Owner (opzionale)</label>
                                <input type="text" name="schema_nome" id="f-schema-nome" placeholder="es: PIPPO_OBJ">
                                <span class="field-hint">Lo schema Oracle a cui questa utenza si riferisce</span>
                            </div>
                        </div>
                    </div>

                    <!-- MySQL: host client -->
                    <div class="tech-fields" data-tech="MySQL" style="display:none">
                        <div class="form-grid col2">
                            <div class="field-group">
                                <label>Host Client MySQL</label>
                                <input type="text" name="mysql_client_host" id="f-mysql-client-host" placeholder="% oppure hostname.domain.com">
                                <span class="field-hint">Host da cui il client si connette al DB</span>
                            </div>
                        </div>
                    </div>

                    <div class="form-grid col2">
                        <div class="field-group required">
                            <label>Password</label>
                            <div class="input-with-icon">
                                <input type="password" name="password" id="f-password" required placeholder="••••••••">
                                <button type="button" class="toggle-pwd" onclick="togglePwdField(this)" tabindex="-1">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="field-group required">
                            <label>Conferma Password</label>
                            <div class="input-with-icon">
                                <input type="password" name="password_confirm" id="f-password-confirm" required placeholder="••••••••">
                                <button type="button" class="toggle-pwd" onclick="togglePwdField(this)" tabindex="-1">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Vault path preview -->
                    <div class="vault-preview" id="vault-preview" style="display:none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span>Vault path: <code id="vault-preview-path">—</code></span>
                    </div>
                </div>

                <!-- Step 4: Governance -->
                <div class="form-section">
                    <h3 class="form-section-title">
                        <span class="step-num">4</span> Governance
                    </h3>
                    <div class="form-grid col2">
                        <div class="field-group required">
                            <label>Ticket IR (HPSM)</label>
                            <input type="text" name="ticket_ir" id="f-ticket-ir" required
                                   placeholder="IRxxxxxxxx" style="text-transform:uppercase">
                        </div>
                        <div class="field-group required">
                            <label>BAO Owner</label>
                            <div class="owner-selector">
                                <select name="bao_owner_id" id="f-bao-owner" required>
                                    <option value="">Seleziona BAO Owner...</option>
                                </select>
                                <button type="button" class="btn-ghost-sm" onclick="openOwnerModal()" title="Aggiungi nuovo owner">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="form-grid col1">
                        <div class="field-group">
                            <label>Note</label>
                            <textarea name="note" id="f-note" rows="2" placeholder="Note aggiuntive opzionali..."></textarea>
                        </div>
                    </div>
                </div>

                <div id="form-error" class="alert alert-danger" style="display:none"></div>
                <div id="form-success" class="alert alert-success" style="display:none"></div>

                <div class="form-actions">
                    <button type="button" class="btn-ghost" onclick="resetNuovaForm()">Annulla</button>
                    <button type="submit" class="btn-primary" id="btn-submit-nuova">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        Salva in NexiVault
                    </button>
                </div>
            </form>
        </div>
    </section>
    <?php endif; ?>

    <!-- ===== AUDIT LOG ===== -->
    <section class="section" id="section-audit">
        <div class="section-header">
            <div>
                <h2>Audit Log</h2>
                <p class="section-sub">Traccia completa di tutte le operazioni</p>
            </div>
            <button class="btn-ghost" onclick="loadAudit()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Aggiorna
            </button>
        </div>

        <div class="filter-bar">
            <select id="audit-filter-op" onchange="loadAudit()">
                <option value="">Tutte le operazioni</option>
                <option value="INSERT">INSERT</option>
                <option value="CHANGE_PASSWORD">CHANGE_PASSWORD</option>
                <option value="VIEW_PASSWORD">VIEW_PASSWORD</option>
                <option value="ACTIVATE">ACTIVATE</option>
                <option value="DEACTIVATE">DEACTIVATE</option>
                <option value="DELETE">DELETE</option>
            </select>
        </div>

        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Data / Ora</th>
                        <th>Operazione</th>
                        <th>Operatore</th>
                        <th>Tabella</th>
                        <th>Dettagli</th>
                        <th>IP</th>
                    </tr>
                </thead>
                <tbody id="tbody-audit">
                    <tr><td colspan="6" class="table-loading">Caricamento...</td></tr>
                </tbody>
            </table>
        </div>
    </section>

</main>

<!-- ================================================================ -->
<!-- MODAL: Dettaglio Utenza + Gestione Password                      -->
<!-- ================================================================ -->
<div class="modal-overlay" id="modal-detail" onclick="closeModal('modal-detail')">
    <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
            <h3 id="modal-title">Dettaglio Utenza</h3>
            <button class="modal-close" onclick="closeModal('modal-detail')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="modal-body" id="modal-body"><!-- filled by JS --></div>
    </div>
</div>

<!-- ================================================================ -->
<!-- MODAL: Nuovo BAO Owner                                            -->
<!-- ================================================================ -->
<div class="modal-overlay" id="modal-owner" onclick="closeModal('modal-owner')">
    <div class="modal modal-sm" onclick="event.stopPropagation()">
        <div class="modal-header">
            <h3>Nuovo BAO Owner</h3>
            <button class="modal-close" onclick="closeModal('modal-owner')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="modal-body">
            <div class="form-grid col2">
                <div class="field-group required"><label>Nome</label><input type="text" id="owner-nome"></div>
                <div class="field-group required"><label>Cognome</label><input type="text" id="owner-cognome"></div>
            </div>
            <div class="form-grid col2">
                <div class="field-group required"><label>Email Nexi</label><input type="email" id="owner-email" placeholder="nome.cognome@nexigroup.com"></div>
                <div class="field-group"><label>Matricola</label><input type="text" id="owner-matricola"></div>
            </div>
            <div id="owner-error" class="alert alert-danger" style="display:none"></div>
        </div>
        <div class="modal-footer">
            <button class="btn-ghost" onclick="closeModal('modal-owner')">Annulla</button>
            <button class="btn-primary" onclick="saveOwner()">Salva Owner</button>
        </div>
    </div>
</div>

<!-- ================================================================ -->
<!-- TOAST NOTIFICATIONS                                              -->
<!-- ================================================================ -->
<div id="toast-container"></div>

<script>
    // Dati sessione per il JS
    const APP_CONFIG = {
        isAdmin: <?= $is_admin ? 'true' : 'false' ?>,
        username: <?= json_encode($current_user) ?>
    };
</script>
<script src="assets/js/app.js"></script>
</body>
</html>
