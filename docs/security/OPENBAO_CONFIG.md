# Configurazione OpenBao (Security Layer)

Il sistema utilizza **OpenBao** (o HashiCorp Vault) per la gestione sicura dei segreti. Nessuna password viene salvata in chiaro o criptata nel database PostgreSQL; tutto risiede in una cassaforte dedicata.

## Configurazione in Ambiente Docker (Dev)

Per permettere l'attivazione immediata, il container `inventory-bao` viene avviato in **modalità sviluppo (`-dev`)**:

- **Address**: `http://localhost:8200`
- **Root Token**: `root` (configurato via `VAULT_TOKEN` nelle API)
- **Motore Segreti**: KV (Key-Value) v2 montato su `/secret`.
- **Persistenza**: In modalità dev, i dati sono in memoria. Per l'uso reale, il comando viene cambiato in `server` con un backend di persistenza (es. Raft o Postgres).

## Integrazione Backend

Il file `backend/vault.py` utilizza la libreria `hvac` per interagire con le API di OpenBao.

### Flusso di Lavoro:
1.  **Percorso (Vault Path)**: Ogni utenza ha un percorso univoco generato automaticamente (es. `inventory/oracle/P1PDS/pippo`).
2.  **Scrittura**: Quando crei un'entry, la password viene inviata a `client.secrets.kv.v2.create_or_update_secret`.
3.  **Lettura**: Quando riveli la password, il backend autentica la richiesta (verifica permessi) e interroga Vault.

## Hardening per la Produzione (Nexi)

Per passare dal setup attuale a un sistema hardened su RedHat 9:

1.  **Unseal**: Vault deve essere inizializzato e "sbloccato" tramite chiavi di unseal (o Auto-Unseal via Cloud HSM).
2.  **Policies**: Creare policy ACL che limitino l'accesso delle API solo ai percorsi `inventory/*`.
3.  **AppRole**: Invece del root token, il backend FastAPI deve autenticarsi usando un `RoleID` e `SecretID` (AppRole) per ottenere token temporanei a vita breve.
4.  **Audit**: Abilitare il dispositivo di audit di Vault (`vault audit enable file path=/var/log/vault/audit.log`) per tracciare ogni singola chiamata API crittografata.
