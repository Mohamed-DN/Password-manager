import hvac
import os
import json

VAULT_ADDR = os.getenv("VAULT_ADDR", "http://inventory-bao:8200")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "")

# When running in production mode (Raft storage) the root token is not known
# at deploy time.  Fall back to reading it from the init file written by the
# vault entrypoint script.
if not VAULT_TOKEN:
    _init_file = os.getenv("VAULT_INIT_FILE", "/vault/init/init.json")
    if os.path.exists(_init_file):
        try:
            with open(_init_file) as _f:
                _raw = _f.read()
        except Exception as _e:
            raise RuntimeError(
                f"Cannot read Vault init file '{_init_file}': {_e}."
            ) from _e

        try:
            _data = json.loads(_raw)
        except json.JSONDecodeError as _e:
            raise RuntimeError(
                f"Vault init file '{_init_file}' contains invalid JSON: {_e}. "
                "Ensure the vault container has finished initialisation before "
                "starting the backend."
            ) from _e

        VAULT_TOKEN = _data.get("root_token", "")
        if not VAULT_TOKEN:
            raise RuntimeError(
                f"root_token field is empty in Vault init file '{_init_file}'. "
                "Ensure the vault_init volume is mounted and the Vault container "
                "has completed initialisation before starting the backend."
            )

# ---------------------------------------------------------------------------
# CONFIGURAZIONE RETENTION E VERSIONI
# ---------------------------------------------------------------------------
# Per 100.000+ password critiche, manteniamo uno storico robusto.
# 10 anni di storico con rotazione mensile = 120 versioni.
# Con rotazione settimanale = 520 versioni.
# Impostiamo 1000 per sicurezza, coprendo anche rotazioni frequenti.
# Il valore può essere sovrascritto via environment variable MAX_VERSIONS.

# ---------------------------------------------------------------------------
# INIZIALIZZAZIONE CLIENT
# ---------------------------------------------------------------------------

# Inizializza il client hvac
client = hvac.Client(url=VAULT_ADDR, token=VAULT_TOKEN)


def configure_kv_max_versions(max_versions: int = 1000) -> None:
    """
    Configure the KV v2 mount to retain max_versions versions per secret.
    Called once at application startup.
    
    Per 100.000+ password critiche con retention di 10 anni:
    - Rotazione mensile: 120 versioni necessarie
    - Rotazione settimanale: 520 versioni necessarie  
    - Rotazione giornaliera: 3650 versioni necessarie
    
    Default: 1000 versioni (copre rotazioni settimanali con margine).
    Aumentare MAX_VERSIONS environment variable se serve retention maggiore.
    
    Nota: OpenBao memorizza le versioni in modo efficiente usando storage
    incrementale. 1000 versioni per 100k password = spazio gestibile.
    """
    try:
        client.secrets.kv.v2.configure(max_versions=max_versions)
        print(f"KV v2 configured with max_versions={max_versions}")
    except Exception as e:
        print(f"Warning: Could not configure KV v2 max_versions: {e}")


def store_password(vault_path: str, password: str) -> bool:
    """
    Salva la password in OpenBao nel percorso specificato.
    Usa il motore KV v2 — ogni chiamata crea automaticamente una nuova versione.
    """
    try:
        client.secrets.kv.v2.create_or_update_secret(
            path=vault_path,
            secret=dict(password=password)
        )
        return True
    except Exception as e:
        print(f"Errore scrittura Vault: {e}")
        return False


def get_password(vault_path: str) -> str | None:
    """
    Recupera la password corrente (ultima versione) da OpenBao.
    """
    try:
        read_response = client.secrets.kv.v2.read_secret_version(path=vault_path)
        return read_response['data']['data']['password']
    except Exception as e:
        print(f"Errore lettura Vault: {e}")
        return None


def get_current_vault_version(vault_path: str) -> int | None:
    """
    Ritorna il numero di versione corrente di un segreto in OpenBao KV v2.
    Viene chiamato PRIMA di aggiornare la password, per salvare la versione
    vecchia nello storico.
    """
    try:
        meta = client.secrets.kv.v2.read_secret_metadata(path=vault_path)
        return meta['data']['current_version']
    except Exception as e:
        print(f"Errore lettura metadati Vault: {e}")
        return None


def get_password_by_version(vault_path: str, version: int) -> str | None:
    """
    Recupera una versione specifica della password da OpenBao KV v2.
    Usato per mostrare la password storica corrispondente a una voce
    dello storico_password.
    """
    try:
        read_response = client.secrets.kv.v2.read_secret_version(
            path=vault_path,
            version=version
        )
        return read_response['data']['data']['password']
    except Exception as e:
        print(f"Errore lettura versione {version} Vault: {e}")
        return None
