import React, { useState } from 'react';
import { Ambiente, Tecnologia, TipoUtenza, BaoOwner, Sistema } from '../types';

interface AddUtenzaModalProps {
  isOpen: boolean;
  onClose: () => void;
  sistemi: Sistema[];
  ambienti: Ambiente[];
  tecnologie: Tecnologia[];
  tipiUtenza: TipoUtenza[];
  baoOwners: BaoOwner[];
  onSubmit: (data: any) => Promise<void>;
}

export default function AddUtenzaModal({ isOpen, onClose, sistemi, ambienti, tecnologie, tipiUtenza, baoOwners, onSubmit }: AddUtenzaModalProps) {
  const [formData, setFormData] = useState({
    username: '',
    password_chiaro: '',
    tecnologia_id: '',
    ambiente_id: '',
    sistema_target_id: '',
    nome_sistema: '', // Used as dbname
    tipo_utenza_id: '',
    bao_owner_id: '',
    note: ''
  });
  
  const [isNewSistema, setIsNewSistema] = useState(false);
  const [isNewBao, setIsNewBao] = useState(false);
  const [newBao, setNewBao] = useState({ nome: '', cognome: '', email: '', matricola: '' });
  
  // Dynamic fields storage
  const [attributi, setAttributi] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAttributoChange = (key: string, value: string) => {
    setAttributi(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        username: formData.username,
        password_chiaro: formData.password_chiaro,
        tecnologia_id: Number(formData.tecnologia_id),
        ambiente_id: Number(formData.ambiente_id),
        tipo_utenza_id: Number(formData.tipo_utenza_id),
        note: formData.note,
        attributi_specifici: attributi
      };

      if (isNewSistema) {
        payload.nome_sistema = formData.nome_sistema;
      } else {
        payload.sistema_target_id = Number(formData.sistema_target_id);
      }

      if (isNewBao) {
        payload.nuovo_bao_owner = newBao;
      } else {
        payload.bao_owner_id = Number(formData.bao_owner_id);
      }

      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Errore durante il salvataggio');
    } finally {
      setLoading(false);
    }
  };

  // Determine allowed environments based on selected technology
  let allowedAmbienti = ambienti;
  if (formData.tecnologia_id) {
    const techName = tecnologie.find(t => t.id.toString() === formData.tecnologia_id)?.nome;
    if (techName === 'OCI') {
      // OCI only allows Sviluppo according to the user's list
      allowedAmbienti = ambienti.filter(a => a.nome.toUpperCase() === 'SVILUPPO');
    }
  }

  // Filter sistemi based on selected tecnologia and ambiente
  const filteredSistemi = sistemi.filter(s => 
    s.tecnologia_id?.toString() === formData.tecnologia_id && 
    s.ambiente_id?.toString() === formData.ambiente_id
  );

  const renderDynamicFields = () => {
    if (!formData.tecnologia_id) return null;

    const techName = tecnologie.find(t => t.id.toString() === formData.tecnologia_id)?.nome;

    switch (techName) {
      case 'Oracle':
        return (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Ticket *</label>
              <input type="text" value={attributi.ticket || ''} onChange={e => handleAttributoChange('ticket', e.target.value)} required placeholder="es. IR000123" />
            </div>
          </>
        );
      case 'MySQL':
        return (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Ticket *</label>
              <input type="text" value={attributi.ticket || ''} onChange={e => handleAttributoChange('ticket', e.target.value)} required placeholder="es. IR000123" />
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>DB Server *</label>
                <input type="text" value={attributi.db_server || ''} onChange={e => handleAttributoChange('db_server', e.target.value)} required placeholder="es. mysqlapicbipe01" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Host *</label>
                <input type="text" value={attributi.host || ''} onChange={e => handleAttributoChange('host', e.target.value)} required placeholder="es. % - hostname.domain.com" />
              </div>
            </div>
          </>
        );
      case 'Postgres':
        return (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Ticket *</label>
              <input type="text" value={attributi.ticket || ''} onChange={e => handleAttributoChange('ticket', e.target.value)} required placeholder="es. IR000123" />
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>DB Server *</label>
                <input type="text" value={attributi.db_server || ''} onChange={e => handleAttributoChange('db_server', e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Service Port *</label>
                <input type="text" value={attributi.service_port || ''} onChange={e => handleAttributoChange('service_port', e.target.value)} required placeholder="es. 5432" />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>HBA Conf</label>
              <input type="text" value={attributi.hba_conf || ''} onChange={e => handleAttributoChange('hba_conf', e.target.value)} />
            </div>
          </>
        );
      case 'OCI':
        return (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Ticket *</label>
              <input type="text" value={attributi.ticket || ''} onChange={e => handleAttributoChange('ticket', e.target.value)} required placeholder="es. RS00388882" />
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Compartment *</label>
                <input type="text" value={attributi.compartment || ''} onChange={e => handleAttributoChange('compartment', e.target.value)} required placeholder="es. cmp-storage" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Group *</label>
                <input type="text" value={attributi.group || ''} onChange={e => handleAttributoChange('group', e.target.value)} required placeholder="es. oci_dev_bckdb" />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Bucket</label>
              <input type="text" value={attributi.bucket || ''} onChange={e => handleAttributoChange('bucket', e.target.value)} placeholder="es. oci_dev_bckdb_entkpi_bucket01" />
            </div>
          </>
        );
      case 'NoSQL':
        return (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Ticket *</label>
              <input type="text" value={attributi.ticket || ''} onChange={e => handleAttributoChange('ticket', e.target.value)} required placeholder="es. IR000123" />
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Technology *</label>
                <select value={attributi.technology || ''} onChange={e => handleAttributoChange('technology', e.target.value)} required style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}>
                  <option value="" disabled>Seleziona</option>
                  <option value="Cassandra">Cassandra</option>
                  <option value="Couchbase">Couchbase</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Cluster Name *</label>
                <input type="text" value={attributi.cluster_name || ''} onChange={e => handleAttributoChange('cluster_name', e.target.value)} required placeholder="es. Hub Fisico" />
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 10, 12, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)', padding: '20px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', borderTop: '2px solid var(--primary)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}>✖</button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div className="logo-glow" style={{ fontSize: '24px', width: '48px', height: '48px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>➕</div>
          <h2 style={{ color: 'white', fontSize: '24px', margin: 0 }}>Nuova Utenza / Password</h2>
        </div>

        {error && (
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid var(--danger)', borderRadius: '4px', fontSize: '14px', color: 'var(--danger)', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Tecnologia (User Type) *</label>
              <select value={formData.tecnologia_id} onChange={e => { setFormData({...formData, tecnologia_id: e.target.value, ambiente_id: ''}); setAttributi({}); }} required style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}>
                <option value="" disabled>Seleziona tecnologia</option>
                {tecnologie.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Env (Ambiente) *</label>
              <select value={formData.ambiente_id} onChange={e => setFormData({...formData, ambiente_id: e.target.value})} required disabled={!formData.tecnologia_id} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white', opacity: !formData.tecnologia_id ? 0.5 : 1 }}>
                <option value="" disabled>Seleziona env</option>
                {allowedAmbienti.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>DB Name (Sistema) *</label>
                <button type="button" onClick={() => setIsNewSistema(!isNewSistema)} style={{ background: 'transparent', color: 'var(--primary)', border: 'none', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                  {isNewSistema ? 'Seleziona Esistente' : '+ Nuovo DB Name'}
                </button>
              </div>
              
              {isNewSistema ? (
                <input type="text" value={formData.nome_sistema} onChange={e => setFormData({...formData, nome_sistema: e.target.value})} required={isNewSistema} placeholder="es. P1PDS2CBIP" />
              ) : (
                <select value={formData.sistema_target_id} onChange={e => setFormData({...formData, sistema_target_id: e.target.value})} required={!isNewSistema} disabled={!formData.tecnologia_id || !formData.ambiente_id} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white', opacity: (!formData.tecnologia_id || !formData.ambiente_id) ? 0.5 : 1 }}>
                  <option value="" disabled>Seleziona DB Name</option>
                  {filteredSistemi.map(s => <option key={s.id} value={s.id}>{s.nome_sistema}</option>)}
                </select>
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Username *</label>
              <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required placeholder="es. oracle_admin" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Password *</label>
              <input type="password" value={formData.password_chiaro} onChange={e => setFormData({...formData, password_chiaro: e.target.value})} required placeholder="Inserisci la password" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Tipo Utenza *</label>
              <select value={formData.tipo_utenza_id} onChange={e => setFormData({...formData, tipo_utenza_id: e.target.value})} required style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}>
                <option value="" disabled>Seleziona tipo</option>
                {tipiUtenza.map(t => <option key={t.id} value={t.id}>{t.codice} - {t.descrizione}</option>)}
              </select>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <label style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>BAO Owner *</label>
              <button type="button" onClick={() => setIsNewBao(!isNewBao)} style={{ background: 'transparent', color: 'var(--primary)', border: 'none', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                {isNewBao ? 'Seleziona Esistente' : '+ Nuovo BAO'}
              </button>
            </div>

            {isNewBao ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <input style={{ flex: '1 1 45%' }} type="text" placeholder="Nome *" value={newBao.nome} onChange={e => setNewBao({...newBao, nome: e.target.value})} required={isNewBao} />
                <input style={{ flex: '1 1 45%' }} type="text" placeholder="Cognome *" value={newBao.cognome} onChange={e => setNewBao({...newBao, cognome: e.target.value})} required={isNewBao} />
                <input style={{ flex: '1 1 45%' }} type="email" placeholder="Email *" value={newBao.email} onChange={e => setNewBao({...newBao, email: e.target.value})} required={isNewBao} />
                <input style={{ flex: '1 1 45%' }} type="text" placeholder="Matricola" value={newBao.matricola} onChange={e => setNewBao({...newBao, matricola: e.target.value})} />
              </div>
            ) : (
              <select value={formData.bao_owner_id} onChange={e => setFormData({...formData, bao_owner_id: e.target.value})} required={!isNewBao} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}>
                <option value="" disabled>Seleziona owner</option>
                {baoOwners.map(o => <option key={o.id} value={o.id}>{o.nome} {o.cognome} ({o.matricola})</option>)}
              </select>
            )}
          </div>

          {/* Dynamic Technology Fields */}
          {renderDynamicFields()}

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}>Annulla</button>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 2 }}>
              {loading ? <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div> : 'Salva nel Vault 🔒'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
