# 🛡️ M-DN Vault - Patch 2 Guide

Questa guida descrive la nuova architettura di **M-DN Vault Password Manager**, aggiornata per utilizzare le tecnologie più moderne allo stato dell'arte (Full-stack TypeScript) e un sistema di autenticazione enterprise.

## 🏗️ Nuova Architettura
Abbiamo effettuato un refactoring completo passando da un'architettura ibrida a una **Full-stack TypeScript**:

- **Frontend**: React 19 + Vite + Better Auth Client.
- **Backend**: Hono (Node.js) + Better Auth Server + node-vault.
- **Database**: PostgreSQL 16 con schema ottimizzato per Better Auth.
- **Secret Manager**: OpenBao (Vault) integrato tramite SDK Node.js.

---

## 🔐 Autenticazione: Better Auth
Abbiamo implementato **Better Auth**, un sistema di autenticazione solido che gestisce sessioni persistenti e sicurezza avanzata.

### Credenziali di Accesso
- **Email**: `admin@m-dnvault.local`
- **Password**: `Sole_2482002`

### Re-autenticazione (Sudo Flow)
Per massimizzare la sicurezza, le operazioni sensibili richiedono una **ri-autenticazione**:
1. Cliccando su "Rivela Password" o "Ruota Password", apparirà un modal.
2. Dovrai inserire nuovamente la tua password di accesso.
3. Questo garantisce che solo l'operatore legittimo possa visualizzare o modificare i segreti, anche se la sessione principale è attiva.

---

## 🎨 Nuova Interfaccia UI
L'interfaccia è stata completamente riscritta in modo **modulare**:
- **`Sidebar`**: Navigazione laterale con stato dell'utente.
- **`Header`**: Barra di ricerca globale e pulsante per nuovi censimenti.
- **`InventoryTable`**: Tabella moderna con badge colorati per gli ambienti.
- **`Login`**: Design premium con effetto glassmorphism.

---

## 🚀 Come Avviare il Sistema
La configurazione è ora gestita interamente tramite **Podman Compose**:

1. Assicurati che il file `.env` contenga le chiavi di Better Auth:
   ```env
   BETTER_AUTH_SECRET=""
   BETTER_AUTH_URL=http://localhost:8000
   ```
2. Avvia i container:
   ```powershell
   podman compose up -d --build
   ```
3. Se necessario, applica lo schema del database (già incluso in `init.sql` per le nuove installazioni):
   ```powershell
   podman exec -i inventory-db psql -U postgres -d vault_inventory_db -f /tmp/better_auth.sql
   ```

---

## 📂 Struttura del Codice
- `/backend`: Ora basato su Node.js. Il file principale è `src/index.ts`.
- `/frontend`: Contiene i nuovi componenti React in `src/components/`.
- `better_auth.sql`: Script SQL specifico per migrare il sistema di autenticazione.

---

> [!IMPORTANT]
> Tutte le modifiche sono state salvate sul nuovo branch **`Mohamed-DN-patch-2`**.
