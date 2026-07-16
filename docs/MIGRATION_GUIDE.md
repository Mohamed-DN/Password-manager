# 📋 Guida alla Migrazione - M-DNVault 2.0

## Panoramica

Questa guida documenta la migrazione del progetto PHP del collega nella tua architettura moderna FastAPI + React.

## Cosa è stato migrato dal progetto PHP

### 1. Schema Database ✅
- Tutte le tabelle: `ambienti`, `tecnologie`, `tipo_utenza`, `bao_owners`, `ticket_ir`, `sistemi_target`, `utenze`, `storico_password`, `audit_log`, `site_users`
- Trigger per `updated_at` automatico
- Funzioni per gestione password history
- Indici ottimizzati per performance
- Vincoli di integrità referenziale

### 2. API Endpoints ✅
| Endpoint PHP | Endpoint FastAPI | Stato |
|-------------|-----------------|-------|
| `?action=login` | `POST /api/auth/login` | ✅ Migrato |
| `?action=logout` | `POST /api/auth/logout` | ✅ Migrato |
| `?action=me` | `GET /api/auth/me` | ✅ Migrato |
| `?action=lookups` | `GET /api/lookups/` | ✅ Migrato |
| `?action=stats` | `GET /api/dashboard/stats` | ✅ Migrato |
| `?action=utenze` | `GET /api/utenze/` | ✅ Migrato |
| `?action=utenza&id=X` | `GET /api/utenze/{id}` | ✅ Migrato |
| `?action=get_password&id=X` | `GET /api/utenze/{id}/password` | ✅ Migrato |
| `?action=update_password` | `PATCH /api/utenze/{id}/password` | ✅ Migrato |
| `?action=toggle_utenza` | `POST /api/utenze/{id}/toggle` | ✅ Migrato |
| `?action=delete_utenza` | `DELETE /api/utenze/{id}` | ✅ Migrato |
| `?action=audit` | `GET /api/audit/` | ✅ Migrato |
| `?action=create_entry` | `POST /api/entries/` | ✅ Migliorato |

### 3. Sicurezza ✅
- Session management con timeout (1 ora)
- Security headers HTTP (XSS, CSRF, clickjacking protection)
- Password hashing con bcrypt
- Audit logging di ogni operazione
- Cookie sicuri (HttpOnly, Secure, SameSite)

### 4. Funzionalità Enterprise ✅
- Multi-tecnologia (Oracle, MySQL, Postgres, NoSQL, OCI)
- Multi-ambiente (Produzione, Pre-produzione, Collaudo, Sviluppo)
- Ticket IR obbligatori
- BAO Owner management
- Tipi utenza specifici
- Soft-delete con archiviazione
- Password history (1000 versioni)

## Differenze Architetturali

### PHP (Vecchio) → FastAPI (Nuovo)

| Aspetto | PHP | FastAPI |
|---------|-----|---------|
| Linguaggio | PHP 8 | Python 3.11 |
| Framework | Nessuno (procedurale) | FastAPI (async) |
| Type safety | Dinamico | Typing statico (Pydantic) |
| Performance | ~100 req/s | ~1000+ req/s |
| Documentazione | Manuale | OpenAPI auto-generata |
| Validation | Manuale | Automatica (Pydantic) |

### Sessioni
- **PHP**: `$_SESSION` nativo con file
- **FastAPI**: Token JWT o session token in-memory (estensibile a Redis)

### Database Access
- **PHP**: PDO con query manuali
- **FastAPI**: asyncpg con connection pooling

## Passi per Completare la Migrazione

### 1. Backup Dati Esistenti
```bash
# Esporta dati dal vecchio sistema
sudo podman exec postgresql pg_dump -U postgres m-dnvaultom > backup_old.sql
```

### 2. Applica Nuovo Schema
```bash
docker-compose down -v  # Rimuovi volumi esistenti
docker-compose up -d postgres  # Avvia solo Postgres
docker exec -i inventory-db psql -U postgres -d vault_inventory_db < docs/init_production.sql
```

### 3. Migra Dati (se necessario)
```sql
-- Script di migrazione personalizzato da adattare
INSERT INTO ambienti (nome) SELECT DISTINCT ambiente FROM old_table;
-- ... continuare con altre tabelle
```

### 4. Configura Vault
```bash
# Inizializza OpenBao
docker exec -it inventory-bao vault operator init
# Salva root token e unseal keys
docker exec -it inventory-bao vault operator unseal
```

### 5. Avvia Tutti i Servizi
```bash
docker-compose up -d
```

### 6. Verifica
```bash
curl http://localhost:8000/health
# Apri browser su http://localhost:5173
```

## File Creati/Nuovi

```
backend/
├── main.py                 # Riscritto con nuova architettura
├── models/schemas.py       # NUOVO - Modelli Pydantic
├── routers/
│   ├── auth.py            # NUOVO - Autenticazione
│   ├── lookups.py         # NUOVO - Dati dropdown
│   ├── dashboard.py       # NUOVO - Statistiche
│   ├── entries.py         # NUOVO - Entry unificate
│   ├── utenze.py          # NUOVO - Gestione utenze
│   └── audit.py           # NUOVO - Audit log
└── middleware/security.py  # NUOVO - Security headers

docs/
├── init_production.sql    # NUOVO - Schema completo
└── MIGRATION_GUIDE.md     # QUESTO FILE
```

## Testing

### Test Backend
```bash
cd backend
pip install -r requirements.txt pytest httpx
pytest
```

### Test Frontend
```bash
cd frontend
npm install
npm test
```

## Rollback

In caso di problemi:
```bash
# Ferma nuovo sistema
docker-compose down

# Ripristina vecchio sistema PHP
cd Podman
# Segui istruzioni originali
```

## Supporto

Per domande o problemi:
1. Controlla i log: `docker-compose logs -f`
2. Verifica health: `curl http://localhost:8000/health`
3. Contatta il team di sviluppo

---

**Versione**: 2.0  
**Data**: Maggio 2025  
**Autori**: Team M-DNVault
