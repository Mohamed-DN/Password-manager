export interface Utenza {
  id: number
  username: string
  sistema_target_id: number
  vault_path: string
  attiva: boolean
  bao_owner_id: number
  ticket_id: number | null
  attributi_specifici?: Record<string, any>
}

export interface Sistema {
  id: number
  nome_sistema: string
  ambiente_id: number
  tecnologia_id: number
  configurazione: Record<string, any>
}

export interface Lookups {
  ambienti: {id: number, nome: string}[]
  tecnologie: {id: number, nome: string}[]
  tipi_utenza: {id: number, nome: string}[]
  bao_owners: {id: number, nome: string, cognome: string}[]
  ticket: any[]
}

export interface AuditLog {
  id: number
  timestamp: string
  utente_operatore: string
  azione: string
  dettagli: Record<string, any>
  ip_address: string
}

export interface PasswordHistoryEntry {
  id: number
  utenza_id: number
  username: string
  sistema_nome: string
  vault_path: string
  vault_version: number | null
  azione: string
  eseguito_da: string
  note: string | null
  created_at: string
  password?: string | null
}

export interface DeletedUtenza {
  id: number
  username: string
  sistema_target_id: number
  vault_path: string
  deleted_at: string
}

export interface AuthState {
  user: string | null
  token: string | null
  fullName: string | null
}
