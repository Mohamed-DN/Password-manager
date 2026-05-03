import React, { useState } from 'react';
import { authClient } from '../utils/auth-client';
import './SudoModal.css';

interface SudoModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
}

const SudoModal: React.FC<SudoModalProps> = ({ onConfirm, onCancel, title, message }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Per Better Auth, possiamo usare signIn.email per verificare se la sessione  ancora valida
      // oppure usare una funzione custom. In Better Auth, il re-auth si fa solitamente con i plugin.
      // Per ora, simuliamo la verifica ri-autenticando l'utente corrente.
      const session = await authClient.getSession();
      if (!session.data?.user.email) throw new Error("No session");

      const { error } = await authClient.signIn.email({
        email: session.data.user.email,
        password: password,
      });

      if (error) {
        setError('Password non corretta. Verifica identita fallita.');
      } else {
        onConfirm();
      }
    } catch (err) {
      setError('Errore di validazione. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sudo-overlay">
      <div className="sudo-glass">
        <h3>{title || 'Verifica Identita'}</h3>
        <p>{message || 'Per procedere con questa operazione sensibile, inserisci la tua password di accesso.'}</p>
        
        <form onSubmit={handleSubmit}>
          <div className="sudo-field">
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="La tua password di login"
              autoFocus
              required
            />
          </div>
          
          {error && <div className="sudo-error">{error}</div>}
          
          <div className="sudo-actions">
            <button type="button" onClick={onCancel} className="btn-cancel">Annulla</button>
            <button type="submit" className="btn-confirm" disabled={loading}>
              {loading ? 'Verifica...' : 'Conferma'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SudoModal;
