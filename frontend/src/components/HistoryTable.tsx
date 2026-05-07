import React from 'react';

interface HistoryItem {
  id: number;
  utenza_id: number;
  username: string;
  sistema_nome: string;
  vault_path: string;
  azione: string;
  eseguito_da: string;
  created_at: string;
}

interface HistoryTableProps {
  history: HistoryItem[];
}

export default function HistoryTable({ history }: HistoryTableProps) {
  if (history.length === 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏱️</div>
        <h3 style={{ color: 'white', marginBottom: '8px' }}>Storico Vuoto</h3>
        <p>Le variazioni delle password verranno tracciate qui.</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Data</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Utenza</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Sistema</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Azione</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Eseguito Da</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item, i) => (
              <tr key={item.id} style={{ borderBottom: i === history.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <td style={{ padding: '16px 24px', color: 'white', fontSize: '13px' }}>
                  {new Date(item.created_at).toLocaleString('it-IT')}
                </td>
                <td style={{ padding: '16px 24px', color: 'white', fontWeight: 500, fontSize: '13px' }}>
                  {item.username}
                </td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {item.sistema_nome}
                </td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ padding: '4px 8px', background: item.azione === 'CANCELLAZIONE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)', color: item.azione === 'CANCELLAZIONE' ? 'var(--danger)' : 'var(--primary)', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                    {item.azione}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {item.eseguito_da}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
