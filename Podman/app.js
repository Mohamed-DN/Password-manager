
// =============================================================================
// app.js — NexiVault | Frontend Logic
// Gestisce: navigazione, inventario, form dinamico, modali, audit
// =============================================================================

'use strict';

// ============================================================
// STATO GLOBALE
// ============================================================
const State = {
    lookups: null,
    utenze:  [],
    currentUtenzaId: null,
};

// Mappa tecnologia → classi badge CSS e label db_name
const TECH_META = {
    'Oracle':   { badge: 'badge-oracle',   dbLabel: 'Nome Database Oracle' },
    'MySQL':    { badge: 'badge-mysql',    dbLabel: 'Nome Database MySQL'  },
    'Postgres': { badge: 'badge-postgres', dbLabel: 'Nome Database'        },
    'NoSQL':    { badge: 'badge-nosql',    dbLabel: 'Keyspace / Bucket'    },
    'OCI':      { badge: 'badge-oci',      dbLabel: 'Nome CDB / Risorsa'   },
};

const ENV_BADGE = {
    'PRODUZIONE':    'badge-prod',
    'PREPRODUZIONE': 'badge-preprod',
    'COLLAUDO':      'badge-coll',
    'SVILUPPO':      'badge-svil',
};

const OP_CLASS = {
    'INSERT':          'op-insert',
    'CHANGE_PASSWORD': 'op-change',
    'VIEW_PASSWORD':   'op-view',
    'ACTIVATE':        'op-activate',
    'DEACTIVATE':      'op-deactivate',
    'DELETE':          'op-delete',
    'UPDATE':          'op-change',
};

// ============================================================
// API HELPER
// ============================================================
async function api(action, opts = {}) {
    const { method = 'GET', body = null, params = {} } = opts;
    const url = new URL('api.php', window.location.href);
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const fetchOpts = { method, headers: {} };
    if (body) {
        fetchOpts.headers['Content-Type'] = 'application/json';
        fetchOpts.body = JSON.stringify(body);
    }

    const res  = await fetch(url, fetchOpts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Errore API');
    return data;
}

// ============================================================
// NAVIGAZIONE
// ============================================================
function showSection(name, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    const section = document.getElementById(`section-${name}`);
    if (section) section.classList.add('active');
    if (btn)     btn.classList.add('active');

    // Lazy load sezioni
    if (name === 'dashboard')  loadDashboard();
    if (name === 'inventario') loadInventario();
    if (name === 'audit')      loadAudit();
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        State.lookups = await api('lookups');
        populateFormDropdowns();
    } catch (e) {
        toast('Errore nel caricamento dei dati di base.', 'error');
    }
    loadDashboard();
});

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
    try {
        const stats = await api('stats');
        renderStats(stats);
        renderBarChart('chart-tech', stats.per_tech, 'tecnologia');
        renderBarChart('chart-env',  stats.per_env,  'ambiente');
    } catch (e) {
        document.getElementById('stats-grid').innerHTML =
            '<div class="alert alert-danger" style="grid-column:1/-1">Errore caricamento statistiche.</div>';
    }
}

function renderStats(s) {
    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Totale Utenze</div>
            <div class="stat-value">${s.totale}</div>
            <div class="stat-sub">Censite nel sistema</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Utenze Attive</div>
            <div class="stat-value" style="color:var(--success)">${s.attive}</div>
            <div class="stat-sub">${s.totale - s.attive} disattivate</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Sistemi Censiti</div>
            <div class="stat-value" style="color:var(--accent)">${s.sistemi}</div>
            <div class="stat-sub">DB / risorse attivi</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Azioni Oggi</div>
            <div class="stat-value" style="color:var(--warning)">${s.audit_oggi}</div>
            <div class="stat-sub">Operazioni in audit log</div>
        </div>
    `;
}

function renderBarChart(containerId, data, labelKey) {
    const container = document.getElementById(containerId);
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted text-sm">Nessun dato.</p>'; return; }
    const max = Math.max(...data.map(d => d.totale));
    container.innerHTML = data.map(d => `
        <div class="bar-row">
            <span class="bar-label">${esc(d[labelKey])}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${Math.round((d.totale/max)*100)}%"></div>
            </div>
            <span class="bar-count">${d.totale}</span>
        </div>
    `).join('');
}

// ============================================================
// INVENTARIO
// ============================================================
async function loadInventario() {
    const search  = document.getElementById('filter-search')?.value  || '';
    const tech    = document.getElementById('filter-tech')?.value    || '';
    const env     = document.getElementById('filter-env')?.value     || '';
    const attiva  = document.getElementById('filter-attiva')?.value  || '';

    document.getElementById('tbody-utenze').innerHTML =
        '<tr><td colspan="9" class="table-loading">Caricamento...</td></tr>';

    try {
        State.utenze = await api('utenze', { params: { search, tech, env, attiva } });
        renderInventario(State.utenze);
    } catch (e) {
        document.getElementById('tbody-utenze').innerHTML =
            `<tr><td colspan="9" class="table-loading" style="color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
}

let filterTimer;
function filterInventario() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(loadInventario, 300);
}

function renderInventario(rows) {
    const tbody = document.getElementById('tbody-utenze');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-loading">Nessuna utenza trovata.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(u => {
        const techMeta  = TECH_META[u.tecnologia] || { badge: '', dbLabel: '' };
        const envBadge  = ENV_BADGE[u.ambiente]   || '';
        const activeCls = u.attiva ? 'badge-active' : 'badge-inactive';
        const activeTxt = u.attiva ? '● Attiva' : '○ Inattiva';
        const tipo      = u.tipo_codice || '—';
        const ticket    = u.ticket || '—';
        const owner     = u.bao_owner || '—';

        return `
        <tr onclick="openDetail(${u.id})">
            <td>
                <div class="cell-username">${esc(u.username)}</div>
                ${u.schema_nome ? `<div class="cell-db">${esc(u.schema_nome)}</div>` : ''}
            </td>
            <td>
                <div class="cell-username">${esc(u.db_name)}</div>
                ${u.nome_sistema ? `<div class="cell-db">${esc(u.nome_sistema)}</div>` : ''}
            </td>
            <td><span class="badge ${techMeta.badge}">${esc(u.tecnologia)}</span></td>
            <td><span class="badge ${envBadge}">${esc(u.ambiente)}</span></td>
            <td><span class="text-muted text-sm">${esc(tipo)}</span></td>
            <td><span class="text-sm">${esc(owner)}</span></td>
            <td><code>${esc(ticket)}</code></td>
            <td><span class="badge ${activeCls}">${activeTxt}</span></td>
            <td class="col-actions" onclick="event.stopPropagation()">
                <button class="btn-icon" onclick="openDetail(${u.id})" title="Dettaglio">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
            </td>
        </tr>`;
    }).join('');

    // Popola filtri dropdown se vuoti
    if (State.lookups) {
        const techSel = document.getElementById('filter-tech');
        if (techSel && techSel.options.length === 1) {
            State.lookups.tecnologie.forEach(t => {
                techSel.add(new Option(t.nome, t.id));
            });
        }
        const envSel = document.getElementById('filter-env');
        if (envSel && envSel.options.length === 1) {
            State.lookups.ambienti.forEach(a => {
                envSel.add(new Option(a.nome, a.id));
            });
        }
    }
}

// ============================================================
// DETTAGLIO UTENZA (modal)
// ============================================================
async function openDetail(id) {
    State.currentUtenzaId = id;
    openModal('modal-detail');
    document.getElementById('modal-body').innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">Caricamento...</p>';

    try {
        const u = await api('utenza', { params: { id } });
        renderDetailModal(u);
    } catch (e) {
        document.getElementById('modal-body').innerHTML =
            `<div class="alert alert-danger">${esc(e.message)}</div>`;
    }
}

function renderDetailModal(u) {
    const techMeta = TECH_META[u.tecnologia] || {};
    const envBadge = ENV_BADGE[u.ambiente]   || '';
    const config   = u.configurazione || {};
    const attrs    = u.attributi_specifici || {};

    // Raggruppa tutti i metadati extra
    const extraMeta = { ...config, ...attrs };

    // Costruisce le righe extra
    const extraRows = Object.entries(extraMeta)
        .filter(([k, v]) => v !== null && v !== '' && v !== undefined)
        .map(([k, v]) => `
            <div class="meta-tag">
                <span class="mk">${esc(k)}</span>
                <span class="mv">${esc(String(v))}</span>
            </div>`).join('');

    const canAdmin = APP_CONFIG.isAdmin;

    document.getElementById('modal-title').textContent = u.username;
    document.getElementById('modal-body').innerHTML = `
        <div class="detail-section">
            <h4>Identificazione</h4>
            <div class="detail-row"><span class="dl">Username</span><span class="dv fw-mono">${esc(u.username)}</span></div>
            ${u.schema_nome ? `<div class="detail-row"><span class="dl">Schema Owner</span><span class="dv fw-mono">${esc(u.schema_nome)}</span></div>` : ''}
            <div class="detail-row"><span class="dl">Database</span><span class="dv fw-mono">${esc(u.db_name)}</span></div>
            <div class="detail-row"><span class="dl">Tecnologia</span><span class="dv"><span class="badge ${techMeta.badge}">${esc(u.tecnologia)}</span></span></div>
            <div class="detail-row"><span class="dl">Ambiente</span><span class="dv"><span class="badge ${envBadge}">${esc(u.ambiente)}</span></span></div>
            ${u.tipo_codice ? `<div class="detail-row"><span class="dl">Tipo</span><span class="dv">${esc(u.tipo_codice)} — ${esc(u.tipo_desc||'')}</span></div>` : ''}
        </div>

        ${extraRows ? `
        <div class="detail-section">
            <h4>Parametri Sistema</h4>
            <div class="meta-tags">${extraRows}</div>
        </div>` : ''}

        <div class="detail-section">
            <h4>Governance</h4>
            <div class="detail-row"><span class="dl">BAO Owner</span><span class="dv">${esc(u.bao_owner)}</span></div>
            <div class="detail-row"><span class="dl">Email</span><span class="dv">${esc(u.bao_email||'—')}</span></div>
            <div class="detail-row"><span class="dl">Ticket IR</span><span class="dv"><code>${esc(u.ticket||'—')}</code></span></div>
        </div>

        <div class="detail-section">
            <h4>Password (OpenBao)</h4>
            <div class="pwd-area">
                <div class="pwd-hidden" id="pwd-hidden-${u.id}">
                    <button class="btn-primary" onclick="revealPassword(${u.id})" style="width:100%">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        Mostra Password
                    </button>
                </div>
                <div class="pwd-shown" id="pwd-shown-${u.id}" style="display:none">
                    <span class="pwd-value fw-mono" id="pwd-value-${u.id}"></span>
                    <button class="btn-icon" onclick="copyPwd(${u.id})" title="Copia">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>
            </div>
            <p class="text-sm text-muted" style="margin-top:6px">Vault path: <code>${esc(u.vault_path||'—')}</code></p>
        </div>

        ${canAdmin ? `
        <div class="detail-section">
            <h4>Azioni</h4>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                <button class="btn-ghost" onclick="openChangePwd(${u.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    Cambia Password
                </button>
                <button class="btn-ghost" onclick="toggleUtenza(${u.id}, ${u.attiva})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        ${u.attiva ? '<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>' : '<polyline points="9 11 12 14 22 4"/>'}
                    </svg>
                    ${u.attiva ? 'Disattiva' : 'Riattiva'}
                </button>
                <button class="btn-danger" onclick="deleteUtenza(${u.id}, '${esc(u.username)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                    Elimina
                </button>
            </div>
        </div>
        <div id="change-pwd-area-${u.id}" style="display:none">
            <div class="field-group">
                <label>Nuova Password</label>
                <div class="input-with-icon">
                    <input type="password" id="new-pwd-${u.id}" placeholder="Nuova password...">
                    <button type="button" class="toggle-pwd" onclick="togglePwdField(this)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:10px">
                <button class="btn-primary" onclick="saveNewPwd(${u.id})">Salva Nuova Password</button>
                <button class="btn-ghost" onclick="document.getElementById('change-pwd-area-${u.id}').style.display='none'">Annulla</button>
            </div>
        </div>
        ` : ''}
    `;
}

// ============================================================
// PASSWORD ACTIONS
// ============================================================
async function revealPassword(id) {
    try {
        const data = await api('get_password', { params: { id } });
        document.getElementById(`pwd-hidden-${id}`).style.display = 'none';
        document.getElementById(`pwd-shown-${id}`).style.display  = 'flex';
        document.getElementById(`pwd-value-${id}`).textContent    = data.password;
    } catch (e) {
        toast('Errore nel recupero della password: ' + e.message, 'error');
    }
}

function copyPwd(id) {
    const val = document.getElementById(`pwd-value-${id}`)?.textContent;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => toast('Password copiata negli appunti', 'success'));
}

function openChangePwd(id) {
    document.getElementById(`change-pwd-area-${id}`).style.display = 'block';
}

async function saveNewPwd(id) {
    const pwd = document.getElementById(`new-pwd-${id}`)?.value;
    if (!pwd) { toast('Inserisci la nuova password.', 'error'); return; }
    try {
        await api('update_password', { method: 'POST', body: { id, password: pwd } });
        toast('Password aggiornata con successo.', 'success');
        document.getElementById(`change-pwd-area-${id}`).style.display = 'none';
        document.getElementById(`new-pwd-${id}`).value = '';
    } catch (e) { toast(e.message, 'error'); }
}

async function toggleUtenza(id, attiva) {
    if (!confirm(`${attiva ? 'Disattivare' : 'Riattivare'} questa utenza?`)) return;
    try {
        await api('toggle_utenza', { method: 'POST', body: { id } });
        toast(`Utenza ${attiva ? 'disattivata' : 'riattivata'}.`, 'success');
        closeModal('modal-detail');
        loadInventario();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteUtenza(id, username) {
    if (!confirm(`Eliminare definitivamente l'utenza "${username}"?\nQuesta operazione rimuove anche il segreto da OpenBao.`)) return;
    try {
        await api('delete_utenza', { method: 'DELETE', body: { id } });
        toast('Utenza eliminata.', 'success');
        closeModal('modal-detail');
        loadInventario();
    } catch (e) { toast(e.message, 'error'); }
}

// ============================================================
// FORM NUOVA UTENZA
// ============================================================
function populateFormDropdowns() {
    if (!State.lookups) return;

    // Tecnologie
    const techSel = document.getElementById('f-tecnologia');
    if (techSel) {
        State.lookups.tecnologie.forEach(t => techSel.add(new Option(t.nome, t.id)));
    }

    // Ambienti
    const envSel = document.getElementById('f-ambiente');
    if (envSel) {
        State.lookups.ambienti.forEach(a => envSel.add(new Option(a.nome, a.id)));
    }

    // BAO Owners
    const ownerSel = document.getElementById('f-bao-owner');
    if (ownerSel) {
        State.lookups.owners.forEach(o => {
            ownerSel.add(new Option(`${o.cognome} ${o.nome} — ${o.email}`, o.id));
        });
    }

    // Tutti i tipi inizialmente
    updateTipiDropdown(null);
}

function updateTipiDropdown(techNome) {
    const tipoSel = document.getElementById('f-tipo');
    if (!tipoSel || !State.lookups) return;

    const currentVal = tipoSel.value;
    tipoSel.innerHTML = '<option value="">Seleziona tipo...</option>';

    State.lookups.tipi.forEach(t => {
        // Mostra se generico (tecnologia_id null) o specifico per la tech selezionata
        const isGeneric  = !t.tecnologia_id;
        const isForThisTech = t.tecnologia_nome === techNome;
        if (isGeneric || isForThisTech || !techNome) {
            tipoSel.add(new Option(`${t.codice} — ${t.descrizione}`, t.id));
        }
    });

    // Pre-seleziona il primo disponibile
    if (tipoSel.options.length > 1) tipoSel.selectedIndex = 1;
}

// Cambio tecnologia: mostra/nasconde i campi extra e aggiorna label/tipo
function onTechChange(sel) {
    const techId   = parseInt(sel.value);
    const techNome = State.lookups?.tecnologie.find(t => t.id === techId)?.nome || null;

    // Nasconde tutti i blocchi tech-specific
    document.querySelectorAll('.tech-fields').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('visible');
    });

    // Mostra blocco corretto
    if (techNome) {
        const visible = document.querySelectorAll(`.tech-fields[data-tech="${techNome}"]`);
        visible.forEach(el => { el.style.display = 'block'; el.classList.add('visible'); });

        // Aggiorna label db_name
        const label = document.getElementById('label-db-name');
        if (label) label.textContent = (TECH_META[techNome]?.dbLabel || 'Nome Database');
    }

    // Aggiorna dropdown tipo utenza
    updateTipiDropdown(techNome);

    // Aggiorna vault preview
    updateVaultPreview();
}

// Debounce per check sistema esistente
let checkSistemaTimer;
function debouncedCheckSistema() {
    clearTimeout(checkSistemaTimer);
    checkSistemaTimer = setTimeout(checkSistema, 600);
    updateVaultPreview();
}

async function checkSistema() {
    const db   = document.getElementById('f-db-name')?.value;
    const amb  = document.getElementById('f-ambiente')?.value;
    const tech = document.getElementById('f-tecnologia')?.value;
    const badge= document.getElementById('sistema-exists-badge');

    if (!db || !amb || !tech || !badge) return;

    try {
        const res = await api('check_sistema', { params: { db_name: db, ambiente_id: amb, tecnologia_id: tech } });
        badge.style.display = res.exists ? 'inline-flex' : 'none';
    } catch { badge.style.display = 'none'; }
}

// Aggiorna la preview del vault_path in tempo reale
function updateVaultPreview() {
    const tech    = document.getElementById('f-tecnologia');
    const env     = document.getElementById('f-ambiente');
    const db      = document.getElementById('f-db-name');
    const user    = document.getElementById('f-username');
    const preview = document.getElementById('vault-preview');
    const pathEl  = document.getElementById('vault-preview-path');

    if (!tech || !env || !db || !user || !preview || !pathEl || !State.lookups) return;

    const techNome = State.lookups.tecnologie.find(t => t.id == tech.value)?.nome || '';
    const envNome  = State.lookups.ambienti.find(a => a.id == env.value)?.nome    || '';
    const dbVal    = db.value.trim();
    const userVal  = user.value.trim();

    if (techNome && envNome && dbVal && userVal) {
        const slug = s => s.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        pathEl.textContent = `utenti/${slug(techNome)}/${slug(envNome)}/${slug(dbVal)}/${slug(userVal)}`;
        preview.style.display = 'flex';
    } else {
        preview.style.display = 'none';
    }
}

// Listeners per vault preview in tempo reale
document.addEventListener('DOMContentLoaded', () => {
    ['f-ambiente', 'f-db-name', 'f-username'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateVaultPreview);
    });
    const ambSel = document.getElementById('f-ambiente');
    if (ambSel) ambSel.addEventListener('change', updateVaultPreview);
});

async function submitNuovaUtenza(event) {
    event.preventDefault();
    const form    = document.getElementById('form-nuova');
    const errDiv  = document.getElementById('form-error');
    const okDiv   = document.getElementById('form-success');
    const btn     = document.getElementById('btn-submit-nuova');

    errDiv.style.display = 'none';
    okDiv.style.display  = 'none';

    // Validazione password match
    const pwd1 = document.getElementById('f-password').value;
    const pwd2 = document.getElementById('f-password-confirm').value;
    if (pwd1 !== pwd2) {
        errDiv.textContent   = 'Le password non coincidono.';
        errDiv.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Salvataggio in corso...';

    // Raccoglie dati form
    const fd = new FormData(form);
    const body = {};
    fd.forEach((v, k) => { if (v !== '') body[k] = v; });

    // ticket_ir uppercase
    if (body.ticket_ir) body.ticket_ir = body.ticket_ir.toUpperCase();

    try {
        const res = await api('create_entry', { method: 'POST', body });
        okDiv.innerHTML      = `✓ Utenza <strong>${esc(body.username)}</strong> censita con successo. Vault path: <code>${res.vault_path}</code>`;
        okDiv.style.display  = 'block';
        form.reset();
        document.querySelectorAll('.tech-fields').forEach(el => { el.style.display = 'none'; el.classList.remove('visible'); });
        document.getElementById('vault-preview').style.display = 'none';
        document.getElementById('sistema-exists-badge').style.display = 'none';
        toast('Utenza censita con successo!', 'success');
    } catch (e) {
        errDiv.textContent   = e.message;
        errDiv.style.display = 'block';
    } finally {
        btn.disabled     = false;
        btn.innerHTML    = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Salva in NexiVault`;
    }
}

function resetNuovaForm() {
    document.getElementById('form-nuova')?.reset();
    document.querySelectorAll('.tech-fields').forEach(el => { el.style.display = 'none'; el.classList.remove('visible'); });
    document.getElementById('vault-preview').style.display = 'none';
    document.getElementById('form-error').style.display   = 'none';
    document.getElementById('form-success').style.display = 'none';
    showSection('inventario', document.querySelector('[data-section="inventario"]'));
}

// ============================================================
// MODAL BAO OWNER
// ============================================================
function openOwnerModal() { openModal('modal-owner'); }

async function saveOwner() {
    const nome      = document.getElementById('owner-nome')?.value.trim()    || '';
    const cognome   = document.getElementById('owner-cognome')?.value.trim() || '';
    const email     = document.getElementById('owner-email')?.value.trim()   || '';
    const matricola = document.getElementById('owner-matricola')?.value.trim() || '';
    const errDiv    = document.getElementById('owner-error');

    errDiv.style.display = 'none';

    if (!nome || !cognome || !email) {
        errDiv.textContent   = 'Nome, cognome ed email sono obbligatori.';
        errDiv.style.display = 'block';
        return;
    }

    try {
        const newOwner = await api('create_owner', { method: 'POST', body: { nome, cognome, email, matricola } });
        // Aggiorna dropdown nel form
        const sel = document.getElementById('f-bao-owner');
        if (sel) sel.add(new Option(`${newOwner.cognome} ${newOwner.nome} — ${newOwner.email}`, newOwner.id));
        // Seleziona il nuovo
        document.getElementById('f-bao-owner').value = newOwner.id;
        // Aggiorna State
        State.lookups.owners.push(newOwner);
        // Reset e chiudi
        ['owner-nome','owner-cognome','owner-email','owner-matricola'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        closeModal('modal-owner');
        toast('BAO Owner aggiunto.', 'success');
    } catch (e) {
        errDiv.textContent   = e.message;
        errDiv.style.display = 'block';
    }
}

// ============================================================
// AUDIT LOG
// ============================================================
async function loadAudit() {
    const op = document.getElementById('audit-filter-op')?.value || '';
    document.getElementById('tbody-audit').innerHTML =
        '<tr><td colspan="6" class="table-loading">Caricamento...</td></tr>';

    try {
        const rows = await api('audit', { params: { operazione: op, limit: 200 } });
        renderAudit(rows);
    } catch (e) {
        document.getElementById('tbody-audit').innerHTML =
            `<tr><td colspan="6" class="table-loading" style="color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
}

function renderAudit(rows) {
    const tbody = document.getElementById('tbody-audit');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Nessuna voce nel log.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const opClass = OP_CLASS[r.operazione] || '';
        const dt      = new Date(r.data_ora);
        const dts     = dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const details = r.valori_nuovi
            ? Object.entries(r.valori_nuovi).filter(([,v]) => v).map(([k,v]) => `<span class="text-sm text-muted">${esc(k)}:</span> <code>${esc(String(v))}</code>`).join(' · ')
            : (r.valori_vecchi ? '<span class="text-muted text-sm">eliminato</span>' : '—');

        return `
        <tr>
            <td><code class="text-sm">${esc(dts)}</code></td>
            <td><span class="badge ${opClass}">${esc(r.operazione)}</span></td>
            <td><span class="text-sm">${esc(r.eseguito_da||'—')}</span></td>
            <td><span class="text-muted text-sm">${esc(r.tabella||'—')}</span></td>
            <td><span class="text-sm">${details}</span></td>
            <td><code class="text-sm">${esc(r.ip_address||'—')}</code></td>
        </tr>`;
    }).join('');
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

// ============================================================
// LOGOUT
// ============================================================
async function logout() {
    try { await api('logout', { method: 'POST' }); } catch {}
    window.location.href = 'index.php';
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${type === 'success'
                ? '<polyline points="20 6 9 17 4 12"/>'
                : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
        </svg>
        <span>${esc(msg)}</span>`;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// ============================================================
// UTILS
// ============================================================
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function togglePwdField(btn) {
    const input = btn.previousElementSibling;
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}
