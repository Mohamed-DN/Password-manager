<?php
// =============================================================================
// index.php — NexiVault | Login
// =============================================================================
session_name('NEXIVAULT_SESS');
session_start();

// Se già autenticato, vai all'app
if (!empty($_SESSION['user_id'])) {
    header('Location: app.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexiVault — Login</title>
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="login-body">

<div class="login-container">
    <div class="login-card">

        <div class="login-brand">
            <div class="login-logo">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            <h1>NexiVault</h1>
            <p>Credential Census System</p>
        </div>

        <div id="login-error" class="alert alert-danger" style="display:none"></div>

        <form id="login-form" class="login-form" autocomplete="off">
            <div class="field-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required
                       autocomplete="username" placeholder="username.cognome" autofocus>
            </div>
            <div class="field-group">
                <label for="password">Password</label>
                <div class="input-with-icon">
                    <input type="password" id="password" name="password" required
                           autocomplete="current-password" placeholder="••••••••">
                    <button type="button" class="toggle-pwd" onclick="togglePwd(this)" tabindex="-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
            </div>
            <button type="submit" class="btn-primary btn-full" id="login-btn">
                <span class="btn-text">Accedi</span>
                <span class="btn-spinner" style="display:none">
                    <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                </span>
            </button>
        </form>

        <div class="login-footer">
            <span>Nexi Group &nbsp;·&nbsp; <?= date('Y') ?></span>
        </div>
    </div>
</div>

<script>
function togglePwd(btn) {
    const input = btn.previousElementSibling;
    input.type = input.type === 'password' ? 'text' : 'password';
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn     = document.getElementById('login-btn');
    const errDiv  = document.getElementById('login-error');
    const spinner = btn.querySelector('.btn-spinner');
    const text    = btn.querySelector('.btn-text');

    btn.disabled = true;
    spinner.style.display = 'inline-flex';
    text.style.display    = 'none';
    errDiv.style.display  = 'none';

    try {
        const res = await fetch('api.php?action=login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
            }),
        });
        const data = await res.json();
        if (res.ok) {
            window.location.href = 'app.php';
        } else {
            errDiv.textContent   = data.error || 'Errore di autenticazione.';
            errDiv.style.display = 'block';
        }
    } catch {
        errDiv.textContent   = 'Errore di connessione al server.';
        errDiv.style.display = 'block';
    } finally {
        btn.disabled          = false;
        spinner.style.display = 'none';
        text.style.display    = 'inline';
    }
});
</script>

</body>
</html>
[root@xxmgmplcmaidb01 ultimo]#
