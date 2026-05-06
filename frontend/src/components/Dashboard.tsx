import React, { useState } from 'react';
import { authClient } from '../auth-client';

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const [activeTab, setActiveTab] = useState('inventory');

  const handleLogout = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  const navItems = [
    { id: 'inventory', label: 'Password Inventory', icon: '🔑' },
    { id: 'audit', label: 'Security Audit', icon: '🛡️' },
    { id: 'history', label: 'Global History', icon: '⏱️' },
    { id: 'users', label: 'Manage Users', icon: '👥' },
  ];

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-glow" style={{ fontSize: '20px' }}>
            📊
          </div>
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
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Administrator</div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            style={{ width: '100%', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer' }}
          >
            <span style={{ fontSize: '16px' }}>🚪</span> Sign Out
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
            <p style={{ color: 'var(--text-muted)' }}>Manage your enterprise secrets securely.</p>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ position: 'relative', width: '300px' }}>
              <input type="text" placeholder="Search secrets..." style={{ paddingLeft: '40px', background: 'var(--bg-card)' }} />
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
            </div>
            <button className="btn-primary" style={{ width: 'auto', padding: '0 24px' }}>
              <span style={{ marginRight: '8px' }}>➕</span> New Entry
            </button>
          </div>
        </header>

        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', fontSize: '48px' }}>
                🔑
              </div>
            </div>
            <h3 style={{ color: 'white', fontSize: '20px', marginBottom: '8px' }}>Welcome to the New Nexi Vault</h3>
            <p style={{ maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
              The frontend has been completely rebuilt from scratch with a premium aesthetic. Data tables will be integrated shortly.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
