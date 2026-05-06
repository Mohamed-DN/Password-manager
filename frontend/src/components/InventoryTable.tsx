import React from 'react';
import { Utenza, Sistema, Lookups } from '../types';

interface InventoryTableProps {
  utenze: Utenza[];
  sistemi: Sistema[];
  lookups: Lookups;
  onReveal: (id: number) => void;
  onRotate: (id: number) => void;
  onDelete: (id: number) => void;
  searchTerm: string;
}

export default function InventoryTable({ 
  utenze, sistemi, lookups, onReveal, onRotate, onDelete, searchTerm 
}: InventoryTableProps) {

  const filtered = utenze.filter(u => {
    const s = sistemi.find(sys => sys.id === u.sistema_target_id);
    const searchStr = `${u.username} ${s?.nome_sistema || ''} ${u.vault_path}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  const getAmbiente = (sid: number) => {
    const s = sistemi.find(sys => sys.id === sid);
    return lookups.ambienti.find(a => a.id === s?.ambiente_id)?.nome || 'Sconosciuto';
  };

  const getSistemaNome = (sid: number) => {
    return sistemi.find(s => s.id === sid)?.nome_sistema || 'Sconosciuto';
  };

  if (filtered.length === 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
        <h3 style={{ color: 'white', marginBottom: '8px' }}>Nessuna Utenza Trovata</h3>
        <p>Non ci sono password che corrispondono ai criteri di ricerca.</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Username</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Sistema Target</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Ambiente</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Vault Path</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px', textAlign: 'right' }}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i === filtered.length - 1 ? 'none' : '1px solid var(--border)', transition: 'background 0.2s', cursor: 'default' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '16px 24px', color: 'white', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>👤</span>
                    {u.username}
                  </div>
                </td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>{getSistemaNome(u.sistema_target_id)}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ padding: '4px 8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', borderRadius: '4px', fontSize: '12px', fontWeight: 500 }}>
                    {getAmbiente(u.sistema_target_id)}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '13px' }}>{u.vault_path}</td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => onReveal(u.id)} title="Mostra Password" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                      👁️
                    </button>
                    <button onClick={() => onRotate(u.id)} title="Ruota Password" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                      🔄
                    </button>
                    <button onClick={() => onDelete(u.id)} title="Elimina Utenza" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'; }}>
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
