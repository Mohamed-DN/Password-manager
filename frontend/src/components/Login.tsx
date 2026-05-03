import React, { useState } from 'react';
import { authClient } from '../utils/auth-client';
import './Login.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState(''); // Better Auth usa email di default
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        setError(error.message || 'Credenziali non valide');
      } else {
        // Il client gestisce sessione e redirect automaticamente se configurato
        window.location.reload();
      }
    } catch (err) {
      setError('Errore di connessione al server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-glass">
        <div className="login-logo">
          <span className="logo-icon"></span>
          <h1>Nexi Vault</h1>
          <p>Inventory & Secret Manager</p>
          <div className="badge-premium">POWERED BY BETTER AUTH</div>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Email / Username</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="admin@nexivault.local"
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Inserisci password"
              required 
            />
          </div>
          
          {error && <div className="login-error">{error}</div>}
          
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>
        
        <div className="login-footer">
          &copy; 2026 Nexi Group | Enterprise Security
        </div>
      </div>
    </div>
  );
};

export default Login;
