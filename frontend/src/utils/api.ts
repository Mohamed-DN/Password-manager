import { Utenza, Sistema, Lookups } from '../types';

const API_BASE = '/api';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = 'An error occurred';
    try {
      const data = await response.json();
      message = data.error || data.detail || message;
    } catch (e) {
      // Ignore JSON parse error
    }
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  getLookups: (): Promise<Lookups> => fetchWithAuth('/lookups'),
  getSistemi: (): Promise<Sistema[]> => fetchWithAuth('/lookups/sistemi'),
  getUtenze: (): Promise<Utenza[]> => fetchWithAuth('/utenze'),
  
  createUtenza: (data: Partial<Utenza> & { password_chiaro: string }) => 
    fetchWithAuth('/utenze', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  revealPassword: (id: number, motivo: string): Promise<{ password_chiaro: string }> => 
    fetchWithAuth(`/utenze/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    }),

  rotatePassword: (id: number, nuova_password?: string): Promise<{ message: string }> => 
    fetchWithAuth(`/utenze/${id}/rotate`, {
      method: 'POST',
      body: JSON.stringify({ nuova_password }),
    }),
    
  deleteUtenza: (id: number): Promise<{ message: string }> => 
    fetchWithAuth(`/utenze/${id}`, {
      method: 'DELETE',
    }),
};
