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
                VAULT_TOKEN = json.load(_f).get("root_token", "")
            if not VAULT_TOKEN:
                raise ValueError("root_token field is empty in Vault init file")
        except Exception as _e:
            raise RuntimeError(
                f"Cannot read Vault root token from '{_init_file}': {_e}. "
                "Ensure the vault_init volume is mounted and the Vault container "
                "has completed initialisation before starting the backend."
            ) from _e

# Inizializza il client hvac
client = hvac.Client(url=VAULT_ADDR, token=VAULT_TOKEN)

def store_password(vault_path: str, password: str) -> bool:
    """
    Salva la password in OpenBao nel percorso specificato.
    Usa il motore KV v2.
    """
    try:
        # vault_path tipico: "inventory/oracle/P1PDS2CBIP/PIPPO_SV"
        # Il motore kv-v2 di default è montato su "secret"
        client.secrets.kv.v2.create_or_update_secret(
            path=vault_path,
            secret=dict(password=password)
        )
        return True
    except Exception as e:
        print(f"Errore scrittura Vault: {e}")
        return False

def get_password(vault_path: str) -> str:
    """
    Recupera la password da OpenBao usando il percorso.
    """
    try:
        read_response = client.secrets.kv.v2.read_secret_version(path=vault_path)
        return read_response['data']['data']['password']
    except Exception as e:
        print(f"Errore lettura Vault: {e}")
        return None
