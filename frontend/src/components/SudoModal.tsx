import React, { useState } from 'react';

interface SudoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { motivo: string; nuova_password?: string }) => Promise<{ password_chiaro?: string } | void>;
  title: string;
  action: 'reveal' | 'rotate' | 'delete' | null;
}

export default function SudoModal({ isOpen, onClose, onSubmit, title, action }: SudoModalProps) {
  const [motivo, setMotivo] = useState('');
  const [nuovaPassword, setNuovaPassword] = useState('');
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await onSubmit({ 
        motivo, 
        nuova_password: action === 'rotate' ? nuovaPassword : undefined 
      });
      
      if (action === 'reveal' && res && res.password_chiaro) {
        setRevealedPassword(res.password_chiaro);
      } else {
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || 'Errore durante l\'operazione');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMotivo('');
    setNuovaPassword('');
    setRevealedPassword(null);
    setCopied(false);
    setError('');
    onClose();
  };

  const handleCopy = () => {
    if (revealedPassword) {
      navigator.clipboard.writeText(revealedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 10, 12, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)', padding: '20px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px', borderTop: `2px solid ${action === 'delete' ? 'var(--danger)' : 'var(--accent)'}`, position: 'relative' }}>
        <button onClick={handleClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}>✖</button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div className="logo-glow" style={{ fontSize: '24px', width: '48px', height: '48px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: action === 'delete' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(20, 184, 166, 0.1)' }}>
            {action === 'reveal' ? '👁️' : action === 'rotate' ? '🔄' : '🗑️'}
          </div>
          <h2 style={{ color: 'white', fontSize: '20px', margin: 0 }}>{title}</h2>
        </div>

        {revealedPassword ? (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' }}>Password recuperata con successo:</p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input 
                type="text" 
                readOnly 
                value={revealedPassword} 
                style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--primary)', color: 'var(--primary)', textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }} 
              />
              <button onClick={handleCopy} style={{ width: 'auto', padding: '0 15px', background: copied ? 'var(--success)' : 'var(--primary)', color: 'white', borderRadius: '8px', fontSize: '14px' }}>
                {copied ? '✅' : '📋'}
              </button>
            </div>
            <button onClick={handleClose} className="btn-primary" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'white' }}>Chiudi</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid var(--danger)', borderRadius: '4px', fontSize: '14px', color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Motivo Richiesta *</label>
              <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} required placeholder="Es. Ticket INC00123" />
            </div>

            {action === 'rotate' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Nuova Password (Manuale) *</label>
                <input type="password" value={nuovaPassword} onChange={e => setNuovaPassword(e.target.value)} required placeholder="Inserisci la nuova password" />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="button" onClick={handleClose} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}>Annulla</button>
              <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 1, background: action === 'delete' ? 'var(--danger)' : 'var(--primary)' }}>
                {loading ? <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div> : 'Conferma'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
