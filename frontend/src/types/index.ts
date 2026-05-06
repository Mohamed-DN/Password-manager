export interface Utenza {
  id: number;
  username: string;
  sistema_target_id: number;
  tipo_utenza_id: number;
  bao_owner_id: number;
  ticket_id?: number;
  vault_path: string;
  attributi_specifici?: Record<string, any>;
  attiva: boolean;
  note?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Sistema {
  id: number;
  nome_sistema: string;
  ambiente_id: number;
  tecnologia_id: number;
  descrizione?: string;
}

export interface Ambiente {
  id: number;
  nome: string;
}

export interface Tecnologia {
  id: number;
  nome: string;
  descrizione?: string;
}

export interface TipoUtenza {
  id: number;
  codice: string;
  descrizione?: string;
}

export interface BaoOwner {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  matricola?: string;
}

export interface Lookups {
  ambienti: Ambiente[];
  tecnologie: Tecnologia[];
  tipi_utenza: TipoUtenza[];
  bao_owners: BaoOwner[];
}
