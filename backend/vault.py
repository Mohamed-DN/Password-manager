import hvac
import os

VAULT_ADDR = os.getenv("VAULT_ADDR", "http://inventory-bao:8200")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "root") # In dev è root, in prod sarà un token AppRole

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
