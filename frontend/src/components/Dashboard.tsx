import React, { useState, useEffect } from 'react';
import { authClient } from '../auth-client';
import { api } from '../utils/api';
import { Utenza, Sistema, Lookups } from '../types';
import InventoryTable from './InventoryTable';
import AddUtenzaModal from './AddUtenzaModal';
import SudoModal from './SudoModal';

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const [activeTab, setActiveTab] = useState('inventory');
  
  // Data State
  const [utenze, setUtenze] = useState<Utenza[]>([]);
  const [sistemi, setSistemi] = useState<Sistema[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [sudoModal, setSudoModal] = useState<{ isOpen: boolean; action: 'reveal' | 'rotate' | 'delete' | null; utenzaId: number | null }>({ isOpen: false, action: null, utenzaId: null });
  const [revealedPassword, setRevealedPassword] = useState<{ id: number; password_chiaro: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [l, s, u] = await Promise.all([
        api.getLookups(),
        api.getSistemi(),
        api.getUtenze()
      ]);
      setLookups(l);
      setSistemi(s);
      setUtenze(u);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'inventory') {
      fetchData();
    }
  }, [activeTab]);

  const handleLogout = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  const handleAddSubmit = async (data: any) => {
    await api.createUtenza(data);
    await fetchData();
  };

  const handleSudoSubmit = async (data: { motivo: string; nuova_password?: string }) => {
    if (!sudoModal.utenzaId || !sudoModal.action) return;
    
    if (sudoModal.action === 'reveal') {
      const res = await api.revealPassword(sudoModal.utenzaId, data.motivo);
      return res; // Returns { password_chiaro: '...' } to SudoModal
    } else if (sudoModal.action === 'rotate') {
      await api.rotatePassword(sudoModal.utenzaId, data.nuova_password);
      await fetchData();
    } else if (sudoModal.action === 'delete') {
      await api.deleteUtenza(sudoModal.utenzaId);
      await fetchData();
    }
  };

  const navItems = [
    { id: 'inventory', label: 'Inventario Password', icon: '🔑' },
    { id: 'audit', label: 'Audit Log Sicurezza', icon: '🛡️' },
    { id: 'history', label: 'Storico Globale', icon: '⏱️' },
    { id: 'users', label: 'Gestione Utenti', icon: '👥' },
  ];

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-glow" style={{ fontSize: '20px' }}>📊</div>
          <h2 style={{ color: 'white', fontSize: '20px' }}>Nexi Vault</h2>
        </div>
        
        <nav style={{ padding: '0 12px', marginTop: '20px', flex: 1 }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
              style={{ width: '100%', border: 'none', background: activeTab === item.id ? 'linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, transparent 100%)' : 'transparent', textAlign: 'left', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px', color: activeTab === item.id ? 'var(--primary)' : 'var(--text-muted)' }}
            >
              <span style={{ fontSize: '20px' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '24px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              {session?.user?.name?.charAt(0) || 'A'}
            </div>
            <div>
              <div style={{ fontWeight: 500, color: 'white', fontSize: '14px' }}>{session?.user?.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Amministratore</div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            style={{ width: '100%', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer' }}
          >
            <span style={{ fontSize: '16px' }}>🚪</span> Disconnetti
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-view">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div>
            <h1 style={{ fontSize: '32px', color: 'white', marginBottom: '8px' }}>
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>Gestisci i segreti aziendali in modo sicuro.</p>
          </div>
          {activeTab === 'inventory' && (
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ position: 'relative', width: '300px' }}>
                <input 
                  type="text" 
                  placeholder="Cerca username, sistema o path..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: '40px', background: 'var(--bg-card)' }} 
                />
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
              </div>
              <button onClick={() => setIsAddOpen(true)} className="btn-primary" style={{ width: 'auto', padding: '0 24px' }}>
                <span style={{ marginRight: '8px' }}>➕</span> Aggiungi Utenza
              </button>
            </div>
          )}
        </header>

        {activeTab === 'inventory' ? (
          loading || !lookups ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div className="spinner"></div>
            </div>
          ) : (
            <InventoryTable 
              utenze={utenze}
              sistemi={sistemi}
              lookups={lookups}
              searchTerm={searchTerm}
              onReveal={(id) => setSudoModal({ isOpen: true, action: 'reveal', utenzaId: id })}
              onRotate={(id) => setSudoModal({ isOpen: true, action: 'rotate', utenzaId: id })}
              onDelete={(id) => setSudoModal({ isOpen: true, action: 'delete', utenzaId: id })}
            />
          )
        ) : (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3 style={{ color: 'white', fontSize: '20px', marginBottom: '8px' }}>Sezione in Costruzione</h3>
            <p>Questa funzionalità sarà disponibile nel prossimo aggiornamento.</p>
          </div>
        )}
      </main>

      {/* Modals */}
      {lookups && (
        <AddUtenzaModal 
          isOpen={isAddOpen} 
          onClose={() => setIsAddOpen(false)}
          sistemi={sistemi}
          ambienti={lookups.ambienti}
          tecnologie={lookups.tecnologie}
          tipiUtenza={lookups.tipi_utenza}
          baoOwners={lookups.bao_owners}
          onSubmit={handleAddSubmit}
        />
      )}

      <SudoModal
        isOpen={sudoModal.isOpen}
        onClose={() => setSudoModal({ isOpen: false, action: null, utenzaId: null })}
        onSubmit={handleSudoSubmit}
        action={sudoModal.action}
        title={
          sudoModal.action === 'reveal' ? 'Visualizzazione Sicura' : 
          sudoModal.action === 'rotate' ? 'Modifica Password Vault' : 
          'Eliminazione Permanente'
        }
      />
    </div>
  );
}
