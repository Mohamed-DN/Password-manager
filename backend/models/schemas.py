"""
Modelli Pydantic per la validazione degli input.
Basati sullo schema DB del collega PHP, adattati per FastAPI.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, Union, List
import re


# =============================================================================
# AUTH MODELS
# =============================================================================

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8)


class LoginResponse(BaseModel):
    user_id: int
    username: str
    ruolo: str
    primo_accesso: bool


class MeResponse(BaseModel):
    user_id: int
    username: str
    ruolo: str


# =============================================================================
# LOOKUP MODELS
# =============================================================================

class Ambiente(BaseModel):
    id: int
    nome: str


class Tecnologia(BaseModel):
    id: int
    nome: str
    descrizione: Optional[str] = None


class TipoUtenza(BaseModel):
    id: int
    codice: str
    descrizione: Optional[str] = None
    tecnologia_id: Optional[int] = None


class BaoOwner(BaseModel):
    id: int
    nome: str
    cognome: str
    email: Optional[str] = None
    matricola: Optional[str] = None


class Ticket(BaseModel):
    id: int
    codice_ir: str


class LookupsResponse(BaseModel):
    ambienti: List[Ambiente]
    tecnologie: List[Tecnologia]
    tipi: List[TipoUtenza]
    owners: List[BaoOwner]
    tickets: List[Ticket]


# =============================================================================
# DASHBOARD MODELS
# =============================================================================

class StatPerTech(BaseModel):
    tecnologia: str
    totale: int


class StatPerEnv(BaseModel):
    ambiente: str
    totale: int


class DashboardStats(BaseModel):
    totale: int
    attive: int
    sistemi: int
    audit_oggi: int
    per_tech: List[StatPerTech]
    per_env: List[StatPerEnv]


# =============================================================================
# SISTEMA TARGET MODELS
# =============================================================================

class SistemaTargetCreate(BaseModel):
    db_name: str = Field(..., max_length=150)
    nome_sistema: Optional[str] = Field(None, max_length=150)
    ambiente_id: int
    tecnologia_id: int
    configurazione: Dict[str, Any] = Field(default_factory=dict)
    descrizione: Optional[str] = Field(None, max_length=200)


class SistemaTarget(BaseModel):
    id: int
    db_name: str
    nome_sistema: Optional[str]
    ambiente_id: int
    tecnologia_id: int
    configurazione: Dict[str, Any]
    descrizione: Optional[str]
    attivo: bool
    ambiente: Optional[str] = None
    tecnologia: Optional[str] = None


# =============================================================================
# UTENZA MODELS
# =============================================================================

class UtenzaBase(BaseModel):
    username: str = Field(..., max_length=100)
    sistema_target_id: int
    tipo_utenza_id: Optional[int] = None
    bao_owner_id: int
    ticket_ir_id: Optional[int] = None
    schema_nome: Optional[str] = Field(None, max_length=100)
    attributi_specifici: Dict[str, Any] = Field(default_factory=dict)
    note: Optional[str] = None


class UtenzaCreate(UtenzaBase):
    password: str = Field(..., min_length=8)


class UtenzaUpdate(BaseModel):
    username: Optional[str] = None
    tipo_utenza_id: Optional[int] = None
    bao_owner_id: Optional[int] = None
    ticket_ir_id: Optional[int] = None
    schema_nome: Optional[str] = None
    attributi_specifici: Optional[Dict[str, Any]] = None
    note: Optional[str] = None
    attiva: Optional[bool] = None


class UtenzaDetail(BaseModel):
    id: int
    username: str
    sistema_target_id: int
    tipo_utenza_id: Optional[int]
    bao_owner_id: int
    ticket_ir_id: Optional[int]
    schema_nome: Optional[str]
    vault_path: str
    attributi_specifici: Dict[str, Any]
    attiva: bool
    note: Optional[str]
    created_at: str
    updated_at: str
    # Campi join
    sistema: Optional[SistemaTarget] = None
    tipo_utenza: Optional[str] = None
    ambiente: Optional[str] = None
    tecnologia: Optional[str] = None
    bao_owner: Optional[str] = None
    ticket: Optional[str] = None


class PasswordUpdate(BaseModel):
    new_password: str = Field(..., min_length=8)


class PasswordResponse(BaseModel):
    password: str


# =============================================================================
# UNIFIED ENTRY MODELS (creazione sistema + utenza in un colpo solo)
# =============================================================================

class UnifiedEntryCreate(BaseModel):
    # Dati Sistema
    db_name: str = Field(..., max_length=150)
    nome_sistema: Optional[str] = Field(None, max_length=150)
    ambiente_id: int
    tecnologia_id: int
    configurazione: Dict[str, Any] = Field(default_factory=dict)
    
    # Dati Utenza
    username: str = Field(..., max_length=100)
    password: str = Field(..., min_length=8)
    tipo_utenza_id: Optional[int] = None
    schema_nome: Optional[str] = None
    bao_owner: Union[int, str]  # ID esistente o "Nome Cognome" per crearlo
    ticket_codice: str
    attributi_specifici: Dict[str, Any] = Field(default_factory=dict)
    note: Optional[str] = None
    
    @field_validator('ticket_codice')
    @classmethod
    def validate_ticket(cls, v):
        if not re.match(r'^(IR|RS)\d+', v, re.IGNORECASE):
            raise ValueError('Il ticket deve essere nel formato IRxxxxxxxx o RSxxxxxxxx')
        return v


# =============================================================================
# PASSWORD HISTORY MODELS
# =============================================================================

class PasswordHistoryEntry(BaseModel):
    id: int
    utenza_id: int
    username: str
    sistema_nome: str
    vault_path: str
    vault_version: Optional[int]
    azione: str
    eseguito_da: str
    note: Optional[str]
    created_at: str
    password: Optional[str] = None


# =============================================================================
# AUDIT LOG MODELS
# =============================================================================

class AuditLogEntry(BaseModel):
    id: int
    tabella: Optional[str]
    record_id: Optional[int]
    operazione: str
    valori_vecchi: Optional[Dict[str, Any]]
    valori_nuovi: Optional[Dict[str, Any]]
    eseguito_da: str
    ip_address: Optional[str]
    data_ora: str


class AuditLogCreate(BaseModel):
    tabella: Optional[str] = None
    record_id: Optional[int] = None
    operazione: str
    valori_vecchi: Optional[Dict[str, Any]] = None
    valori_nuovi: Optional[Dict[str, Any]] = None
    eseguito_da: str
    ip_address: Optional[str] = None


# =============================================================================
# ONE-TIME LINK MODELS (futuro sviluppo)
# =============================================================================

class OneTimeLinkCreate(BaseModel):
    utenza_id: int
    scadenza_ore: int = Field(default=24, ge=1, le=168)


class OneTimeLinkResponse(BaseModel):
    token: str
    scadenza: str
    link: str
