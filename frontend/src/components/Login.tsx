import React, { useState } from 'react';
import { authClient } from '../auth-client';

export default function Login() {
  const [email, setEmail] = useState('admin@m-dnvault.local');
  const [password, setPassword] = useState('Sole_2482002');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        setError(error.message || 'Invalid credentials');
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="full-center" style={{ 
      backgroundImage: 'url("https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop")',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 10, 12, 0.85)' }}></div>
      
      <div className="glass-card" style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 10, borderTop: '2px solid rgba(99, 102, 241, 0.5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div className="logo-glow" style={{ width: '56px', height: '56px', borderRadius: '16px', marginBottom: '20px', fontSize: '32px' }}>
            🔒
          </div>
          <h1 style={{ fontSize: '28px', color: 'white', marginBottom: '8px' }}>M-DN Vault</h1>
          <p style={{ color: 'var(--text-muted)' }}>Secure Enterprise Identity</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
              />
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
          </div>
          
          {error && (
            <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid var(--danger)', borderRadius: '4px', fontSize: '14px', color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          
          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {loading ? <div className="spinner"></div> : (
              <>Sign In ➔</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
