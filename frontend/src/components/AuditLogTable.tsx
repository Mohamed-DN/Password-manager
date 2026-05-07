import React from 'react';

interface AuditLog {
  id: number;
  timestamp: string;
  utente_operatore: string;
  azione: string;
  dettagli: any;
}

interface AuditLogTableProps {
  logs: AuditLog[];
}

export default function AuditLogTable({ logs }: AuditLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛡️</div>
        <h3 style={{ color: 'white', marginBottom: '8px' }}>Nessun Log Trovato</h3>
        <p>Le attività di sicurezza appariranno qui.</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Data e Ora</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Operatore</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Azione</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '14px' }}>Dettagli</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={log.id} style={{ borderBottom: i === logs.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <td style={{ padding: '16px 24px', color: 'white', fontSize: '13px' }}>
                  {new Date(log.timestamp).toLocaleString('it-IT')}
                </td>
                <td style={{ padding: '16px 24px', color: 'var(--primary)', fontWeight: 500, fontSize: '13px' }}>
                  {log.utente_operatore}
                </td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ padding: '4px 8px', background: log.azione.includes('DELETE') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(20, 184, 166, 0.1)', color: log.azione.includes('DELETE') ? 'var(--danger)' : 'var(--accent)', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                    {log.azione}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'monospace' }}>
                  {JSON.stringify(log.dettagli)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
