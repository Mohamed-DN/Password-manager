import { useState, useEffect } from 'react'
import axios from 'axios'
import { 
  Key, Shield, Database, X, Activity, 
  Plus, Search, Terminal,
  User, FileText,
  Copy,
  HardDrive, Cloud, Layers,
  Database as DbIcon
} from 'lucide-react'

// --- Types ---
interface Utenza {
  id: number
  username: string
  sistema_target_id: number
  vault_path: string
  attiva: boolean
  bao_owner_id: number
  ticket_id: number | null
  attributi_specifici?: Record<string, any>
}

interface Sistema {
  id: number
  nome_sistema: string
  ambiente_id: number
  tecnologia_id: number
  configurazione: Record<string, any>
}

interface Lookups {
  ambienti: {id: number, nome: string}[]
  tecnologie: {id: number, nome: string}[]
  tipi_utenza: {id: number, nome: string}[]
  bao_owners: {id: number, nome: string, cognome: string}[]
  ticket: any[]
}

interface AuditLog {
  id: number
  timestamp: string
  utente_operatore: string
  azione: string
  dettagli: Record<string, any>
  ip_address: string
}

interface PasswordHistoryEntry {
  id: number
  utenza_id: number
  username: string
  sistema_nome: string
  vault_path: string
  vault_version: number | null
  azione: string
  eseguito_da: string
  note: string | null
  created_at: string
  password?: string | null
}

interface DeletedUtenza {
  id: number
  username: string
  sistema_target_id: number
  vault_path: string
  deleted_at: string
}

function App() {
  const [utenze, setUtenze] = useState<Utenza[]>([])
  const [sistemi, setSistemi] = useState<Sistema[]>([])
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [selectedUtenza, setSelectedUtenza] = useState<Utenza | null>(null)
  const [password, setPassword] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'inventory' | 'audit' | 'old'>('inventory')
  const [searchTerm, setSearchTerm] = useState('')
  
  // Password history state
  const [passwordHistory, setPasswordHistory] = useState<PasswordHistoryEntry[]>([])
  const [deletedUtenze, setDeletedUtenze] = useState<DeletedUtenza[]>([])
  const [selectedDeletedUtenza, setSelectedDeletedUtenza] = useState<DeletedUtenza | null>(null)

  // Unified Form State
  const [formData, setFormData] = useState({
    tecnologia_id: 0,
    ambiente_id: 0,
    nome_sistema: '', // dbname
    username: '',
    password: '',
    ticket_codice: '',
    bao_owner_id: 0,
    tipo_utenza_id: 2, // Applicativa
    // Dynamic Fields
    db_server: '',
    host: '',
    service_port: '5432',
    hba_conf: '',
    technology: '', // Cassandra/Couchbase
    cluster_name: '',
    compartment: '',
    group: '',
    bucket: ''
  })

  const [isChangingPwd, setIsChangingPwd] = useState(false)
  const [newPasswordVal, setNewPasswordVal] = useState('')

  const handleUpdatePassword = async () => {
    if (!selectedUtenza || !newPasswordVal) return
    try {
      await axios.patch(`/api/utenze/${selectedUtenza.id}/password`, {
        new_password: newPasswordVal
      })
      alert("Password updated successfully!")
      setIsChangingPwd(false)
      setNewPasswordVal('')
    } catch (err) {
      alert("Error: " + (err as any).message)
    }
  }

  const fetchData = async () => {
    try {
      const [resS, resU, resL] = await Promise.all([
        axios.get('/api/sistemi'),
        axios.get('/api/utenze'),
        axios.get('/api/lookups')
      ])
      setSistemi(resS.data)
      setUtenze(resU.data)
      setLookups(resL.data)
    } catch (err) {
      console.error("API Error:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAuditLogs = async () => {
    try {
      const res = await axios.get('/api/audit')
      setAuditLogs(res.data)
    } catch (err) {
      console.error("Audit API Error:", err)
    }
  }

  const fetchDeletedUtenze = async () => {
    try {
      const res = await axios.get('/api/utenze/cancellate')
      setDeletedUtenze(res.data)
    } catch (err) {
      console.error("Deleted Utenze API Error:", err)
    }
  }

  const fetchPasswordHistory = async (utenza_id: number) => {
    try {
      const res = await axios.get(`/api/utenze/${utenza_id}/history`)
      setPasswordHistory(res.data)
    } catch (err) {
      console.error("Password History API Error:", err)
      setPasswordHistory([])
    }
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { 
    if (activeTab === 'audit') fetchAuditLogs()
    if (activeTab === 'old') fetchDeletedUtenze()
  }, [activeTab])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prepare JSONB payloads
    const configurazione: Record<string, any> = {}
    const attributi_specifici: Record<string, any> = {}

    const techName = lookups?.tecnologie.find(t => t.id === formData.tecnologia_id)?.nome

    if (techName === 'MySQL') {
      configurazione.db_server = formData.db_server
      attributi_specifici.host = formData.host
    } else if (techName === 'Postgres') {
      configurazione.db_server = formData.db_server
      configurazione.service_port = formData.service_port
      configurazione.hba_conf = formData.hba_conf
    } else if (techName === 'OCI') {
      configurazione.Compartment = formData.compartment
      configurazione.Bucket = formData.bucket
      attributi_specifici.Group = formData.group
    } else if (techName === 'NoSQL') {
      configurazione.technology = formData.technology
      configurazione.Cluster_name = formData.cluster_name
    }

    try {
      await axios.post('/api/entry', {
        nome_sistema: formData.nome_sistema,
        ambiente_id: formData.ambiente_id,
        tecnologia_id: formData.tecnologia_id,
        configurazione,
        username: formData.username,
        password: formData.password,
        tipo_utenza_id: formData.tipo_utenza_id,
        bao_owner: formData.bao_owner_id,
        ticket_codice: formData.ticket_codice,
        attributi_specifici
      })
      setShowModal(false)
      fetchData()
      alert("Success: Asset stored securely!")
    } catch (err) {
      const msg = (err as any).response?.data?.detail || (err as any).message || "Unknown error"
      alert("Error: " + msg)
    }
  }

  const fetchPassword = async (id: number) => {
    try {
      const res = await axios.get(`/api/utenze/${id}/password`)
      setPassword(res.data.password)
    } catch (err) {
      alert("Vault error")
    }
  }

  const getSys = (id: number) => sistemi.find(s => s.id === id)
  const getTechName = (id: number) => lookups?.tecnologie.find(t => t.id === id)?.nome || 'Unknown'
  const getEnvName = (id: number) => lookups?.ambienti.find(a => a.id === id)?.nome || 'Unknown'

  if (loading) {
    return (
      <div className="loader-overlay">
        <Activity className="spinner" size={48} />
        <p>Initializing Secure Vault...</p>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="icon-glow">
            <Shield size={24} fill="#60a5fa33" color="#60a5fa" />
          </div>
          <span>Nexi Vault</span>
        </div>

        <nav className="sidebar-nav">
          <button className={activeTab === 'inventory' ? 'active' : ''} onClick={() => setActiveTab('inventory')}>
            <DbIcon size={18} /> Inventory
          </button>
          <button className={activeTab === 'audit' ? 'active' : ''} onClick={() => setActiveTab('audit')}>
            <Terminal size={18} /> Audit Logs
          </button>
          <button className={activeTab === 'old' ? 'active' : ''} onClick={() => setActiveTab('old')}>
            <FileText size={18} /> Old / Storico
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-card">
            <div className="avatar">AD</div>
            <div className="details">
              <span className="user-name">Admin</span>
              <span className="user-role">Superuser</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="app-main">
        <header className="main-header">
          <div className="header-search">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search systems, tickets, users..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> New Entry
          </button>
        </header>

        <div className="content-scroll">
          <div className="page-intro">
            <h1>
              {activeTab === 'inventory' ? 'Asset Inventory' : 
               activeTab === 'audit' ? 'Audit Logs' : 'Old / Password History'}
            </h1>
            <p>
              {activeTab === 'inventory' ? 'Enterprise database credentials management with HashiCorp Vault encryption.' : 
               activeTab === 'audit' ? 'Track every access and operation on sensitive credentials.' : 
               'Review history of rotated or deleted passwords.'}
            </p>
          </div>

          {activeTab === 'inventory' && (
          <div className="inventory-card">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Username & System</th>
                  <th>Environment</th>
                  <th>Technology</th>
                  <th>Vault Path</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {utenze
                  .filter(u => {
                    const s = getSys(u.sistema_target_id);
                    const match = u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                s?.nome_sistema.toLowerCase().includes(searchTerm.toLowerCase());
                    return match;
                  })
                  .map(u => {
                  const s = getSys(u.sistema_target_id)
                  const tName = getTechName(s?.tecnologia_id || 0)
                  const eName = getEnvName(s?.ambiente_id || 0)
                  return (
                    <tr key={u.id} onClick={() => { setSelectedUtenza(u); setPassword(null); }} className={selectedUtenza?.id === u.id ? 'selected' : ''}>
                      <td>
                        <div className="main-info">
                          <span className="username">{u.username}</span>
                          <span className="sysname">{s?.nome_sistema}</span>
                        </div>
                      </td>
                      <td><span className={`tag env-${eName.toLowerCase()}`}>{eName}</span></td>
                      <td>
                        <div className="tech-info">
                          {tName === 'Oracle' && <HardDrive size={14} color="#f97316" />}
                          {tName === 'MySQL' && <Database size={14} color="#0ea5e9" />}
                          {tName === 'Postgres' && <Database size={14} color="#334155" />}
                          {tName === 'OCI' && <Cloud size={14} color="#ef4444" />}
                          {tName === 'NoSQL' && <Layers size={14} color="#8b5cf6" />}
                          <span>{tName}</span>
                        </div>
                      </td>
                      <td><code className="code-path">{u.vault_path}</code></td>
                      <td><div className="status-badge"><div className="dot active"></div> Active</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}

          {activeTab === 'audit' && (
          <div className="inventory-card">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Operator</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 && (
                  <tr><td colSpan={5} style={{textAlign:'center', padding:'2rem', color:'var(--text-muted)'}}>No audit log entries yet.</td></tr>
                )}
                {auditLogs
                  .filter(log => JSON.stringify(log).toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(log => (
                  <tr key={log.id}>
                    <td><code className="code-path">{new Date(log.timestamp).toLocaleString()}</code></td>
                    <td>{log.utente_operatore}</td>
                    <td><span className="tag" style={{background:'#eff6ff', color:'var(--accent)'}}>{log.azione}</span></td>
                    <td><code className="code-path">{JSON.stringify(log.dettagli)}</code></td>
                    <td>{log.ip_address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {activeTab === 'old' && (
          <div className="inventory-card">
            <h3 style={{marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem'}}>Deleted Users - Click to view password history</h3>
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>System</th>
                  <th>Vault Path</th>
                  <th>Deleted At</th>
                </tr>
              </thead>
              <tbody>
                {deletedUtenze
                  .filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(u => {
                  const s = getSys(u.sistema_target_id)
                  return (
                    <tr 
                      key={u.id} 
                      onClick={() => {
                        setSelectedDeletedUtenza(u)
                        fetchPasswordHistory(u.id)
                      }} 
                      className={selectedDeletedUtenza?.id === u.id ? 'selected' : ''}
                    >
                      <td><span className="username">{u.username}</span></td>
                      <td>{s?.nome_sistema || 'Unknown'}</td>
                      <td><code className="code-path">{u.vault_path}</code></td>
                      <td><code className="code-path">{new Date(u.deleted_at).toLocaleString()}</code></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Password History Section */}
            {selectedDeletedUtenza && (
              <div className="history-details animate-in" style={{marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem'}}>
                  <h3 style={{color: 'var(--text-main)', display:'flex', alignItems:'center', gap:'8px'}}>
                    <Activity size={18} color="var(--accent)"/> 
                    Password History for {selectedDeletedUtenza.username}
                  </h3>
                  <button className="close-btn" onClick={() => setSelectedDeletedUtenza(null)}><X size={16}/></button>
                </div>

                {passwordHistory.length === 0 ? (
                  <p style={{color: 'var(--text-muted)'}}>Loading history...</p>
                ) : (
                  <div className="history-list">
                    {passwordHistory.map((h, idx) => (
                      <div key={h.id} className="history-item" style={{
                        padding: '1rem', 
                        background: 'white', 
                        borderRadius: '8px', 
                        marginBottom: '0.75rem', 
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom: '0.5rem'}}>
                          <span className={`tag ${h.azione === 'CANCELLAZIONE' ? 'env-produzione' : 'env-sviluppo'}`} style={{fontSize:'0.7rem'}}>
                            {h.azione}
                          </span>
                          <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                          <div>
                            <div style={{fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)'}}>
                              {h.azione === 'CANCELLAZIONE' ? 'Final State at Deletion' : `Version #${h.vault_version}`}
                            </div>
                            {h.password && (
                              <div className="secret-card" style={{marginTop:'0.5rem', padding:'4px 8px', background:'#f1f5f9'}}>
                                <code style={{fontSize:'0.9rem', color:'var(--accent)', fontWeight:600}}>{h.password}</code>
                                <button onClick={() => navigator.clipboard.writeText(h.password || '')} style={{padding:'2px', marginLeft:'8px'}}><Copy size={12}/></button>
                              </div>
                            )}
                          </div>
                          <div style={{textAlign:'right', fontSize: '0.75rem', color: 'var(--text-muted)'}}>
                            By {h.eseguito_da}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      </main>

      {/* Details Panel */}
      {selectedUtenza && (
        <aside className="details-panel">
          <div className="panel-header">
            <h3>Asset Insight</h3>
            <button className="close-btn" onClick={() => setSelectedUtenza(null)}><X size={20}/></button>
          </div>
          <div className="panel-body">
             <div className="detail-box">
                <label>Accountability</label>
                <div className="row"><User size={16}/> {lookups?.bao_owners.find(o => o.id === selectedUtenza.bao_owner_id)?.nome} {lookups?.bao_owners.find(o => o.id === selectedUtenza.bao_owner_id)?.cognome}</div>
                <div className="row"><FileText size={16}/> Ticket: {lookups?.ticket?.find(t => t.id === selectedUtenza.ticket_id)?.codice_ticket || 'N/A'}</div>
             </div>

             <div className="detail-box">
                <label>JSONB Metadata</label>
                <div className="json-list">
                  {Object.entries({...(getSys(selectedUtenza.sistema_target_id)?.configurazione || {}), ...(selectedUtenza.attributi_specifici || {})}).map(([k, v]) => (
                    <div key={k} className="json-row">
                       <span className="k">{k}</span>
                       <span className="v">{String(v)}</span>
                    </div>
                  ))}
                </div>
             </div>

             <div className="detail-box credentials">
                <label>Vault Secrets</label>
                {!password ? (
                  <button className="btn-reveal" onClick={() => fetchPassword(selectedUtenza.id)}>
                    <Key size={16}/> Reveal Password
                  </button>
                ) : (
                  <div className="secret-card">
                    <span className="pwd">{password}</span>
                    <button onClick={() => navigator.clipboard.writeText(password)}><Copy size={14}/></button>
                  </div>
                )}
                
                <div className="change-pwd-area">
                  {!isChangingPwd ? (
                    <div style={{display:'flex', gap:'1rem', marginTop:'0.5rem'}}>
                      <button className="btn-text-small" onClick={() => setIsChangingPwd(true)}>Change Password?</button>
                      <button 
                        className="btn-text-small" 
                        style={{color: '#ef4444'}} 
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to delete user ${selectedUtenza.username}? This will soft-delete the record and archive the password history.`)) {
                            try {
                              await axios.delete(`/api/utenze/${selectedUtenza.id}`)
                              setSelectedUtenza(null)
                              fetchData()
                              alert("User deleted and archived.")
                            } catch (err) {
                              alert("Error: " + (err as any).message)
                            }
                          }
                        }}
                      >
                        Delete User
                      </button>
                    </div>
                  ) : (
                    <div className="pwd-input-group">
                      <input type="password" placeholder="New password..." value={newPasswordVal} onChange={e => setNewPasswordVal(e.target.value)} />
                      <div className="btns">
                        <button className="btn-primary-mini" onClick={handleUpdatePassword}>Save</button>
                        <button className="btn-text-mini" onClick={() => setIsChangingPwd(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
             </div>
          </div>
        </aside>
      )}

      {/* Unified Entry Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-in">
            <header className="modal-header">
              <div>
                <h2>Create Unified Entry</h2>
                <p>Add a new system and credential in one step.</p>
              </div>
              <button className="close-btn" onClick={() => setShowModal(false)}><X /></button>
            </header>

            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                {/* Stage 1: Core System Info */}
                <div className="form-group">
                  <label>Technology</label>
                  <select required value={formData.tecnologia_id} onChange={e => setFormData({...formData, tecnologia_id: parseInt(e.target.value)})}>
                    <option value="0">Select Tech...</option>
                    {lookups?.tecnologie.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Environment</label>
                  <select required value={formData.ambiente_id} onChange={e => setFormData({...formData, ambiente_id: parseInt(e.target.value)})}>
                    <option value="0">Select Env...</option>
                    {lookups?.ambienti.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>DB Name / System Name</label>
                  <input required list="existing-systems" placeholder="P1PDS2CBIP" value={formData.nome_sistema} onChange={e => setFormData({...formData, nome_sistema: e.target.value})} />
                  <datalist id="existing-systems">
                    {[...new Set(sistemi.map(s => s.nome_sistema))].map(name => <option key={name} value={name} />)}
                  </datalist>
                </div>

                <div className="form-group">
                   <label>Ticket ID</label>
                   <input required placeholder="IRxxxxxxxx" value={formData.ticket_codice} onChange={e => setFormData({...formData, ticket_codice: e.target.value})} />
                </div>

                {/* Stage 2: User Info */}
                <div className="form-group">
                  <label>Username</label>
                  <input required placeholder="PIPPO_SV" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                </div>

                <div className="form-group">
                  <label>Password (to Vault)</label>
                  <input required type="password" placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>

                <div className="form-group">
                  <label>BAO Owner</label>
                  <input required list="existing-owners" placeholder="Mario Rossi" 
                    onChange={e => {
                      const val = e.target.value;
                      const owner = lookups?.bao_owners.find(o => `${o.nome} ${o.cognome}` === val);
                      setFormData({...formData, bao_owner_id: owner ? owner.id : val as any});
                    }} 
                  />
                  <datalist id="existing-owners">
                    {lookups?.bao_owners.map(o => <option key={o.id} value={`${o.nome} ${o.cognome}`} />)}
                  </datalist>
                </div>
                
                <div className="form-group">
                  <label>User Type</label>
                  <select value={formData.tipo_utenza_id} onChange={e => setFormData({...formData, tipo_utenza_id: parseInt(e.target.value)})}>
                     <option value="0">Select Type...</option>
                     {lookups?.tipi_utenza.map(t => <option key={t.id} value={t.id}>{t.codice} - {t.descrizione}</option>)}
                  </select>
                </div>
              </div>

              {/* Dynamic Technology Fields */}
              <div className="dynamic-fields">
                <h3>Technology Specific Parameters</h3>
                <div className="form-grid">
                  {getTechName(formData.tecnologia_id) === 'MySQL' && (
                    <>
                      <div className="form-group"><label>DB Server</label><input value={formData.db_server} onChange={e => setFormData({...formData, db_server: e.target.value})} placeholder="mysqlapicbipe01" /></div>
                      <div className="form-group"><label>Host Pattern</label><input value={formData.host} onChange={e => setFormData({...formData, host: e.target.value})} placeholder="% - hostname.domain.com" /></div>
                    </>
                  )}
                  {getTechName(formData.tecnologia_id) === 'Postgres' && (
                    <>
                      <div className="form-group"><label>DB Server</label><input value={formData.db_server} onChange={e => setFormData({...formData, db_server: e.target.value})} /></div>
                      <div className="form-group"><label>Service Port</label><input value={formData.service_port} onChange={e => setFormData({...formData, service_port: e.target.value})} /></div>
                      <div className="form-group"><label>HBA Config</label><input value={formData.hba_conf} onChange={e => setFormData({...formData, hba_conf: e.target.value})} /></div>
                    </>
                  )}
                  {getTechName(formData.tecnologia_id) === 'OCI' && (
                    <>
                      <div className="form-group"><label>Compartment</label><input value={formData.compartment} onChange={e => setFormData({...formData, compartment: e.target.value})} /></div>
                      <div className="form-group"><label>Group</label><input value={formData.group} onChange={e => setFormData({...formData, group: e.target.value})} /></div>
                      <div className="form-group"><label>Bucket</label><input value={formData.bucket} onChange={e => setFormData({...formData, bucket: e.target.value})} /></div>
                    </>
                  )}
                  {getTechName(formData.tecnologia_id) === 'NoSQL' && (
                    <>
                      <div className="form-group"><label>Technology Type</label><select value={formData.technology} onChange={e => setFormData({...formData, technology: e.target.value})}><option value="">Select...</option><option value="Cassandra">Cassandra</option><option value="Couchbase">Couchbase</option></select></div>
                      <div className="form-group"><label>Cluster Name</label><input value={formData.cluster_name} onChange={e => setFormData({...formData, cluster_name: e.target.value})} placeholder="Es: Hub Fisico" /></div>
                    </>
                  )}
                  {!formData.tecnologia_id && <div className="hint-text">Select a technology to see specific options.</div>}
                </div>
              </div>

              <footer className="modal-footer">
                 <button type="button" className="btn-text" onClick={() => setShowModal(false)}>Cancel</button>
                 <button type="submit" className="btn-primary" disabled={!formData.tecnologia_id}>Securely Store Entry</button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
