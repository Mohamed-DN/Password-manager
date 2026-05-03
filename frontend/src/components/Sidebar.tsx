import React from 'react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { fullName, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '' },
    { id: 'inventory', label: 'Inventario Password', icon: '' },
    { id: 'audit', label: 'Audit Log', icon: '' },
    { id: 'history', label: 'Storico Globale', icon: '' },
    { id: 'deleted', label: 'Utenze Cancellate', icon: '' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="logo-icon"></span>
        <h2>Nexi Vault</h2>
      </div>
      
      <nav className="sidebar-nav">
        {menuItems.map(item => (
          <button 
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">{fullName?.[0] || 'A'}</div>
          <div className="user-info">
            <div className="user-name">{fullName}</div>
            <div className="user-role">Administrator</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>
          <span></span> Esci
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
