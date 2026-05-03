#!/bin/bash

# =============================================================================
# Nexi Vault - Script di Avvio Rapido con Podman
# =============================================================================
# Questo script:
# 1. Verifica che Podman e podman-compose siano installati
# 2. Crea il file .env se non esiste
# 3. Costruisce e avvia tutti i servizi
# 4. Mostra lo stato e i log iniziali
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colori per l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[ATTENZIONE]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERRORE]${NC} $1"
}

# =============================================================================
# 1. Verifica dipendenze
# =============================================================================
log_info "Verifica delle dipendenze..."

if ! command -v podman &> /dev/null; then
    log_error "Podman non e' installato. Installalo prima di continuare."
    echo "Ubuntu/Debian: sudo apt install podman"
    echo "Fedora: sudo dnf install podman"
    echo "RHEL/CentOS: sudo dnf install podman"
    exit 1
fi
log_success "Podman installato: $(podman --version)"

if ! command -v podman-compose &> /dev/null; then
    log_error "podman-compose non e' installato. Installalo prima di continuare."
    echo "Installazione: pip install podman-compose"
    echo "Oppure: sudo dnf install podman-compose (Fedora/RHEL)"
    exit 1
fi
log_success "podman-compose installato: $(podman-compose --version)"

# =============================================================================
# 2. Crea file .env se non esiste
# =============================================================================
if [ ! -f ".env" ]; then
    log_warning "File .env non trovato. Creazione da .env.example..."
    cp .env.example .env
    chmod 600 .env
    
    # Genera un segreto casuale per JWT se non presente
    if ! grep -q "^JWT_SECRET_KEY=" .env || grep -q "^JWT_SECRET_KEY=$" .env; then
        SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
        sed -i "s/^JWT_SECRET_KEY=.*/JWT_SECRET_KEY=${SECRET}/" .env
        log_success "Generato JWT_SECRET_KEY casuale"
    fi
    
    log_success "File .env creato e configurato"
    log_warning "IMPORTANTE: Modifica .env per cambiare le password predefinite in produzione!"
else
    log_success "File .env gia' presente"
fi

# =============================================================================
# 3. Ferma eventuali container in esecuzione
# =============================================================================
log_info "Arresto di eventuali container esistenti..."
podman-compose down --remove-orphans 2>/dev/null || true

# =============================================================================
# 4. Pulizia volumi opzionale (solo se richiesto)
# =============================================================================
if [ "$1" == "--clean" ] || [ "$1" == "-c" ]; then
    log_warning "Rimozione dei volumi esistenti (modalita' clean)..."
    podman-compose down -v --remove-orphans
    log_success "Volumi rimossi"
fi

# =============================================================================
# 5. Build e avvio servizi
# =============================================================================
log_info "Build dei container in corso... (potrebbe richiedere alcuni minuti)"
podman-compose build

log_info "Avvio dei servizi..."
podman-compose up -d

# =============================================================================
# 6. Attendi che i servizi siano ready
# =============================================================================
log_info "Attesa dell'avvio dei servizi..."
sleep 5

# Controlla lo stato dei servizi
log_info "Verifica stato servizi..."
podman-compose ps

# =============================================================================
# 7. Mostra informazioni di accesso
# =============================================================================
echo ""
echo "============================================================================="
echo -e "${GREEN}Nexi Vault avviato con successo!${NC}"
echo "============================================================================="
echo ""
echo -e "${BLUE}Accesso ai servizi:${NC}"
echo "  - Frontend:  http://localhost:5174"
echo "  - API Docs:  http://localhost:8000/docs"
echo "  - OpenBao:   http://localhost:8200"
echo ""
echo -e "${BLUE}Database PostgreSQL:${NC}"
echo "  - Host:      localhost:5432"
echo "  - Database:  vault_inventory_db"
echo "  - Utente:    inventory_app"
echo ""
echo -e "${YELLOW}Comandi utili:${NC}"
echo "  - Visualizza log:     podman-compose logs -f"
echo "  - Ferma servizi:      podman-compose down"
echo "  - Riavvia servizi:    podman-compose restart"
echo "  - Stato servizi:      podman-compose ps"
echo "  - Avvio pulito:       $0 --clean"
echo ""
echo "============================================================================="