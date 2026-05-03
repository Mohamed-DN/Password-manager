import React from 'react';
import { Utenza, Sistema, Lookups } from '../types';

interface InventoryTableProps {
  utenze: Utenza[];
  sistemi: Sistema[];
  lookups: Lookups;
  onReveal: (id: number) => void;
  onRotate: (id: number) => void;
  onDelete: (id: number) => void;
  onViewHistory: (utenza: Utenza) => void;
  searchTerm: string;
}

const InventoryTable: React.FC<InventoryTableProps> = ({ 
  utenze, sistemi, lookups, onReveal, onRotate, onDelete, onViewHistory, searchTerm 
}) => {
  const filtered = utenze.filter(u => {
    const s = sistemi.find(sys => sys.id === u.sistema_target_id);
    const searchStr = `${u.username} ${s?.nome_sistema || ''} ${u.vault_path}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  const getAmbiente = (sid: number) => {
    const s = sistemi.find(sys => sys.id === sid);
    return lookups.ambienti.find(a => a.id === s?.ambiente_id)?.nome || 'Unknown';
  };

  const getSistemaNome = (sid: number) => {
    return sistemi.find(s => s.id === sid)?.nome_sistema || 'Unknown';
  };

  return (
    <div className="table-wrapper glass-panel">
      <table className="modern-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Sistema</th>
            <th>Ambiente</th>
            <th>Vault Path</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id}>
              <td className="font-bold">{u.username}</td>
              <td>{getSistemaNome(u.sistema_target_id)}</td>
              <td>
                <span className={`badge badge-${getAmbiente(u.id).toLowerCase()}`}>
                  {getAmbiente(u.id)}
                </span>
              </td>
              <td className="font-mono text-sm">{u.vault_path}</td>
              <td className="actions-cell">
                <button className="icon-btn" onClick={() => onReveal(u.id)} title="Rivela Password"> </button>
                <button className="icon-btn" onClick={() => onRotate(u.id)} title="Ruota Password"></button>
                <button className="icon-btn" onClick={() => onViewHistory(u)} title="Cronologia"></button>
                <button className="icon-btn btn-danger" onClick={() => onDelete(u.id)} title="Elimina"> </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InventoryTable;
