import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { apiFetch } from './utils/api'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import InventoryTable from './components/InventoryTable'
import Login from './components/Login'
import SudoModal from './components/SudoModal'
import { Utenza, Sistema, Lookups, AuditLog, PasswordHistoryEntry, DeletedUtenza } from './types'

function App() {
  const { isAuthenticated, logout } = useAuth()
  
  const [activeTab, setActiveTab] = useState('inventory')
  const [searchTerm, setSearchTerm] = useState('')
  const [utenze, setUtenze] = useState<Utenza[]>([])
  const [sistemi, setSistemi] = useState<Sistema[]>([])
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [passwordHistory, setPasswordHistory] = useState<PasswordHistoryEntry[]>([])
  const [deletedUtenze, setDeletedUtenze] = useState<DeletedUtenza[]>([])
  
  const [loading, setLoading] = useState(true)
  const [selectedUtenza, setSelectedUtenza] = useState<Utenza | null>(null)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [showSudoModal, setShowSudoModal] = useState(false)
  const [sudoAction, setSudoAction] = useState<{ type: string, payload: any } | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      fetchInitialData()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'audit') fetchAuditLogs()
      if (activeTab === 'history') fetchGlobalHistory()
      if (activeTab === 'deleted') fetchDeletedUtenze()
    }
  }, [activeTab, isAuthenticated])

  const fetchInitialData = async () => {
    setLoading(true)
    try {
      const [resS, resU, resL] = await Promise.all([
        apiFetch('/sistemi'),
        apiFetch('/utenze'),
        apiFetch('/lookups')
      ])
      setSistemi(await resS.json())
      setUtenze(await resU.json())
      setLookups(await resL.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAuditLogs = async () => {
    const res = await apiFetch('/audit')
    setAuditLogs(await res.json())
  }

  const fetchGlobalHistory = async () => {
    const res = await apiFetch('/history/global')
    setPasswordHistory(await res.json())
  }

  const fetchDeletedUtenze = async () => {
    const res = await apiFetch('/utenze/cancellate')
    setDeletedUtenze(await res.json())
  }

  const handleRevealPassword = (id: number) => {
    setSudoAction({ type: 'REVEAL', payload: id })
    setShowSudoModal(true)
  }

  const handleRotatePassword = (id: number) => {
    setSudoAction({ type: 'ROTATE', payload: id })
    setShowSudoModal(true)
  }

  const handleDeleteUtenza = (id: number) => {
    setSudoAction({ type: 'DELETE', payload: id })
    setShowSudoModal(true)
  }

  const executeSudoAction = async () => {
    if (!sudoAction) return
    
    setShowSudoModal(false)
    const { type, payload } = sudoAction

    try {
      if (type === 'REVEAL') {
        const res = await apiFetch(`/utenze/${payload}/password`)
        const data = await res.json()
        setRevealedPassword(data.password)
        alert(`Password: ${data.password}`)
      } else if (type === 'ROTATE') {
        const newPwd = prompt("Inserisci la nuova password:")
        if (newPwd) {
          await apiFetch(`/utenze/${payload}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ new_password: newPwd })
          })
          alert("Password ruotata con successo")
          fetchInitialData()
        }
      } else if (type === 'DELETE') {
        if (confirm("Sei sicuro di voler eliminare questa utenza?")) {
          await apiFetch(`/utenze/${payload}`, { method: 'DELETE' })
          alert("Utenza eliminata e archiviata")
          fetchInitialData()
        }
      }
    } catch (err) {
      alert("Errore durante l'operazione")
    } finally {
      setSudoAction(null)
    }
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="main-content">
        <Header 
          title={activeTab === 'inventory' ? 'Inventario Password' : 
                 activeTab === 'audit' ? 'Audit Log' : 
                 activeTab === 'history' ? 'Storico Password' : 'Utenze Archiviate'}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onNewEntry={() => setShowEntryModal(true)}
        />

        <div className="content-body">
          {activeTab === 'inventory' && lookups && (
            <InventoryTable 
              utenze={utenze}
              sistemi={sistemi}
              lookups={lookups}
              searchTerm={searchTerm}
              onReveal={handleRevealPassword}
              onRotate={handleRotatePassword}
              onDelete={handleDeleteUtenza}
              onViewHistory={(u) => { setActiveTab('history'); setSearchTerm(u.username); }}
            />
          )}

          {activeTab === 'audit' && (
            <div className="glass-panel">
              <table className="modern-table">
                <thead>
                  <tr><th>Data</th><th>Operatore</th><th>Azione</th><th>Dettagli</th></tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                      <td>{log.utente_operatore}</td>
                      <td>{log.azione}</td>
                      <td className="text-sm font-mono">{JSON.stringify(log.dettagli)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="glass-panel">
              <table className="modern-table">
                <thead>
                  <tr><th>Data</th><th>Username</th><th>Sistema</th><th>Versione</th><th>Azione</th></tr>
                </thead>
                <tbody>
                  {passwordHistory.map(h => (
                    <tr key={h.id}>
                      <td>{new Date(h.created_at).toLocaleString()}</td>
                      <td>{h.username}</td>
                      <td>{h.sistema_nome}</td>
                      <td>{h.vault_version}</td>
                      <td>{h.azione}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showSudoModal && (
        <SudoModal 
          onConfirm={executeSudoAction}
          onCancel={() => { setShowSudoModal(false); setSudoAction(null); }}
        />
      )}
    </div>
  )
}

export default App
