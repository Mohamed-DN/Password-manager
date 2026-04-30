#!/bin/bash
# run-podman.sh
# Script di avvio rapido per Password Manager con Podman
# Gestisce inizializzazione, migrazione e avvio senza duplicazioni
set -euo pipefail

COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_BLUE='\033[0;34m'
COLOR_RESET='\033[0m'

log_info()    { echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET} $*"; }
log_success() { echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} $*"; }
log_warn()    { echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $*"; }
log_error()   { echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# 1. Verifica prerequisiti
# ---------------------------------------------------------------------------
log_info "Verifica prerequisiti..."

if ! command -v podman &> /dev/null; then
    log_error "Podman non trovato. Installalo prima di continuare."
    exit 1
fi

if ! command -v podman-compose &> /dev/null; then
    log_warn "podman-compose non trovato. Provo con 'podman compose' (plugin nativo)..."
    PODMAN_COMPOSE_CMD="podman compose"
    if ! $PODMAN_COMPOSE_CMD version &> /dev/null; then
        log_error "Né podman-compose né podman compose plugin trovati."
        log_info "Installa podman-compose: pip install podman-compose"
        exit 1
    fi
else
    PODMAN_COMPOSE_CMD="podman-compose"
fi

log_success "Podman pronto: $(podman --version)"

# ---------------------------------------------------------------------------
# 2. Carica variabili d'ambiente
# ---------------------------------------------------------------------------
if [ -f ".env" ]; then
    log_info "Caricamento variabili da .env..."
    export $(grep -v '^#' .env | xargs -r)
elif [ -f ".env.example" ]; then
    log_warn ".env non trovato. Copio .env.example a .env..."
    cp .env.example .env
    export $(grep -v '^#' .env | xargs -r)
    log_info "Modifica .env con le tue configurazioni sicure!"
fi

# Genera password sicure se non presenti
if [ -z "${DB_PASSWORD:-}" ]; then
    DB_PASSWORD=$(openssl rand -base64 32)
    export DB_PASSWORD
    log_info "Generata DB_PASSWORD sicura"
fi

if [ -z "${VAULT_ROOT_TOKEN:-}" ]; then
    VAULT_ROOT_TOKEN=$(openssl rand -hex 16)
    export VAULT_ROOT_TOKEN
    log_info "Generato VAULT_ROOT_TOKEN sicuro"
fi

# ---------------------------------------------------------------------------
# 3. Cleanup eventuale (previene duplicazioni)
# ---------------------------------------------------------------------------
log_info "Verifica container esistenti..."

EXISTING_CONTAINERS=$(podman ps -a --format "{{.Names}}" 2>/dev/null | grep -E "^(inventory-|password-manager)" || true)

if [ -n "$EXISTING_CONTAINERS" ]; then
    log_warn "Trovati container esistenti: $EXISTING_CONTAINERS"
    read -p "Vuoi rimuoverli prima di iniziare? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stop e rimozione container esistenti..."
        $PODMAN_COMPOSE_CMD down --remove-orphans 2>/dev/null || true
        podman rm -f $EXISTING_CONTAINERS 2>/dev/null || true
        log_success "Container rimossi"
    else
        log_info "Continuo senza rimuovere i container esistenti..."
    fi
fi

# ---------------------------------------------------------------------------
# 4. Pulizia volumi orfani (opzionale)
# ---------------------------------------------------------------------------
log_info "Verifica volumi esistenti..."

EXISTING_VOLUMES=$(podman volume list --format "{{.Name}}" 2>/dev/null | grep -E "(inventory-|password-manager)" || true)

if [ -n "$EXISTING_VOLUMES" ]; then
    log_warn "Trovati volumi esistenti: $EXISTING_VOLUMES"
    log_info "I volumi contengono dati persistenti (DB, Vault, backups)."
    read -p "Vuoi mantenere i dati esistenti? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        log_success "Mantenimento dati esistenti - nessun volume rimosso"
    else
        log_warn "Rimozione volumi esistenti... ATTENZIONE: dati persi!"
        $PODMAN_COMPOSE_CMD down -v 2>/dev/null || true
        podman volume rm $EXISTING_VOLUMES 2>/dev/null || true
        log_success "Volumi rimossi"
    fi
fi

# ---------------------------------------------------------------------------
# 5. Avvio servizi
# ---------------------------------------------------------------------------
log_info "Avvio servizi con Podman..."

# Costruisci immagini se necessario
if [ ! -f "backend/__pycache__/.built" ] || [ ! -d "frontend/node_modules" ]; then
    log_info "Build delle immagini in corso (prima volta può richiedere tempo)..."
fi

$PODMAN_COMPOSE_CMD up -d --build --remove-orphans

log_success "Servizi avviati!"

# ---------------------------------------------------------------------------
# 6. Attendi readiness
# ---------------------------------------------------------------------------
log_info "Attesa readiness dei servizi..."

wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s --fail "$url" &> /dev/null; then
            log_success "$name pronto"
            return 0
        fi
        echo -ne "\rAttesa $name... tentativo $attempt/$max_attempts"
        sleep 2
        ((attempt++))
    done
    
    log_error "$name non risponde dopo $max_attempts tentativi"
    return 1
}

# Attendi PostgreSQL
wait_for_service "PostgreSQL" "http://localhost:5432" 1 || true  # pg_isready sarebbe meglio

# Attendi OpenBao/Vault
wait_for_service "OpenBao" "${VAULT_ADDR:-http://localhost:8200}/v1/sys/health" 30 || true

# Attendi Backend
wait_for_service "Backend API" "http://localhost:8000/api/health" 30 || true

# ---------------------------------------------------------------------------
# 7. Inizializzazione Database
# ---------------------------------------------------------------------------
log_info "Verifica inizializzazione database..."

# Esegui migrazioni solo se necessario
INIT_MARKER="/tmp/password-manager-initialized"

if [ ! -f "$INIT_MARKER" ]; then
    log_info "Esecuzione migrazioni iniziali..."
    
    # Attendi che PostgreSQL sia pronto
    sleep 5
    
    # Esegui init.sql se presente
    if [ -f "init.sql" ]; then
        log_info "Applicazione schema iniziale..."
        podman exec -i inventory-db psql -U "${DB_USER:-postgres}" -d "${DB_NAME:-password_manager}" -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || \
        cat init.sql | podman exec -i inventory-db psql -U "${DB_USER:-postgres}" -d "${DB_NAME:-password_manager}" || true
    fi
    
    touch "$INIT_MARKER"
    log_success "Database inizializzato"
else
    log_success "Database già inizializzato"
fi

# ---------------------------------------------------------------------------
# 8. Summary finale
# ---------------------------------------------------------------------------
echo
echo -e "${COLOR_GREEN}============================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}Password Manager avviato con successo!${COLOR_RESET}"
echo -e "${COLOR_GREEN}============================================${COLOR_RESET}"
echo
echo -e "${COLOR_BLUE}Frontend:${COLOR_RESET}  http://localhost:5173"
echo -e "${COLOR_BLUE}Backend API:${COLOR_RESET} http://localhost:8000/api"
echo -e "${COLOR_BLUE}OpenBao UI:${COLOR_RESET} ${VAULT_ADDR:-http://localhost:8200}"
echo
echo -e "${COLOR_YELLOW}Comandi utili:${COLOR_RESET}"
echo "  Log in tempo reale:     $PODMAN_COMPOSE_CMD logs -f"
echo "  Stop servizi:           $PODMAN_COMPOSE_CMD down"
echo "  Restart:                $PODMAN_COMPOSE_CMD restart"
echo "  Stato container:        podman ps"
echo "  Backup manuale:         podman exec inventory-backup /usr/local/bin/backup.sh"
echo
echo -e "${COLOR_YELLOW}Note importanti:${COLOR_RESET}"
echo "- I dati sono persistenti nei volumi Podman"
echo "- Backup automatico giornaliero alle 02:00"
echo "- Storico password: 10 anni di retention"
echo "- Per 100k+ password: configurato max_versions=1000 in OpenBao"
echo
echo -e "${COLOR_GREEN}Pronto all'uso!${COLOR_RESET}"
