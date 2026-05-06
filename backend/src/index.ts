import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth.js";
import { query } from "./db.js";
import { Context } from "hono";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({
  origin: ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Better Auth — handle all auth routes
app.all("/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// Middleware to protect routes
const authMiddleware = async (c: Context, next: () => Promise<void>) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user);
  await next();
};

// --- API Endpoints ---

app.get("/api/lookups", authMiddleware, async (c) => {
  try {
    const ambienti = await query("SELECT * FROM inventory.ambienti");
    const tecnologie = await query("SELECT * FROM inventory.tecnologie");
    const tipi = await query("SELECT * FROM inventory.tipi_utenza");
    const baoOwners = await query("SELECT * FROM inventory.bao_owners");
    return c.json({
      ambienti: ambienti.rows,
      tecnologie: tecnologie.rows,
      tipi_utenza: tipi.rows,
      bao_owners: baoOwners.rows,
    });
  } catch (err) {
    console.error("Lookups error:", err);
    return c.json({ error: "Failed to fetch lookups" }, 500);
  }
});

app.get("/api/lookups/sistemi", authMiddleware, async (c) => {
  try {
    const res = await query("SELECT * FROM inventory.sistemi_target");
    return c.json(res.rows);
  } catch (err) {
    console.error("Sistemi error:", err);
    return c.json([], 200);
  }
});

app.get("/api/utenze", authMiddleware, async (c) => {
  try {
    const res = await query("SELECT id, username, sistema_target_id, tipo_utenza_id, bao_owner_id, ticket_id, vault_path, attiva, note, created_by, created_at, updated_at FROM inventory.utenze WHERE deleted_at IS NULL ORDER BY id DESC");
    return c.json(res.rows);
  } catch (err) {
    console.error("Utenze error:", err);
    return c.json([], 200);
  }
});

app.post("/api/utenze", authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const user = c.get("user");
    
    let bao_owner_id = body.bao_owner_id;

    // Handle creation of new BAO Owner on the fly
    if (body.nuovo_bao_owner) {
      const { nome, cognome, email, matricola } = body.nuovo_bao_owner;
      const resBao = await query(
        `INSERT INTO inventory.bao_owners (nome, cognome, email, matricola) VALUES ($1, $2, $3, $4) RETURNING id`,
        [nome, cognome, email, matricola]
      );
      bao_owner_id = resBao.rows[0].id;
    }

    // Resolve or create sistema_target
    let sistema_target_id = body.sistema_target_id;
    if (!sistema_target_id && body.tecnologia_id && body.ambiente_id && body.nome_sistema) {
      const resSys = await query(
        `SELECT id FROM inventory.sistemi_target WHERE tecnologia_id = $1 AND ambiente_id = $2 AND nome_sistema = $3`,
        [body.tecnologia_id, body.ambiente_id, body.nome_sistema]
      );
      if (resSys.rows.length > 0) {
        sistema_target_id = resSys.rows[0].id;
      } else {
        const resNewSys = await query(
          `INSERT INTO inventory.sistemi_target (tecnologia_id, ambiente_id, nome_sistema, descrizione) VALUES ($1, $2, $3, $4) RETURNING id`,
          [body.tecnologia_id, body.ambiente_id, body.nome_sistema, 'Creato automaticamente']
        );
        sistema_target_id = resNewSys.rows[0].id;
      }
    }

    // In un sistema reale, invieremo 'password_chiaro' a OpenBao per salvarla.
    // Qui simuliamo il vault_path generato
    const vaultPath = `secret/data/${sistema_target_id}/${body.username}`;

    const attributi_specifici = body.attributi_specifici ? JSON.stringify(body.attributi_specifici) : '{}';

    const res = await query(
      `INSERT INTO inventory.utenze 
        (username, sistema_target_id, tipo_utenza_id, bao_owner_id, vault_path, note, created_by, attributi_specifici)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
       [body.username, sistema_target_id, body.tipo_utenza_id, bao_owner_id, vaultPath, body.note, user.email, attributi_specifici]
    );

    const newUtenza = res.rows[0];

    // Log the creation in audit_log
    await query(
      `INSERT INTO inventory.audit_log (utente_operatore, azione, dettagli) VALUES ($1, $2, $3)`,
      [user.email, 'CREATE_USER', JSON.stringify({ utenza_id: newUtenza.id, username: newUtenza.username })]
    );

    return c.json(newUtenza, 201);
  } catch (err: any) {
    console.error("Error creating utenza:", err);
    return c.json({ error: err.message || "Failed to create utenza" }, 500);
  }
});

app.post("/api/utenze/:id/password", authMiddleware, async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const motivo = body.motivo || 'Nessun motivo specificato';
    const user = c.get("user");

    const res = await query("SELECT username, vault_path FROM inventory.utenze WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
    
    // Log the action
    await query(
      `INSERT INTO inventory.audit_log (utente_operatore, azione, dettagli) VALUES ($1, $2, $3)`,
      [user.email, 'VIEW_PASSWORD', JSON.stringify({ utenza_id: id, username: res.rows[0].username, motivo })]
    );

    return c.json({ password_chiaro: `SimulatedVaultPassword123!` });
  } catch (err) {
    console.error("Password error:", err);
    return c.json({ error: "Failed" }, 500);
  }
});

app.post("/api/utenze/:id/rotate", authMiddleware, async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const user = c.get("user");
    const nuova_password = body.nuova_password || `SimulatedRotate${Math.random().toString(36).slice(-8)}`;

    const res = await query("SELECT username FROM inventory.utenze WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
    
    // Log the action
    await query(
      `INSERT INTO inventory.audit_log (utente_operatore, azione, dettagli) VALUES ($1, $2, $3)`,
      [user.email, 'ROTATE_PASSWORD', JSON.stringify({ utenza_id: id, username: res.rows[0].username, manual: !!body.nuova_password })]
    );
    
    // Simulate updating storico_password
    await query(
      `INSERT INTO inventory.storico_password (utenza_id, username, sistema_nome, vault_path, azione, eseguito_da)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, res.rows[0].username, "Simulated System", "secret/data/...", "MODIFICA_PASSWORD", user.email]
    );

    return c.json({ message: "Updated successfully", password: nuova_password });
  } catch (err) {
    console.error("Rotate error:", err);
    return c.json({ error: "Failed" }, 500);
  }
});

app.delete("/api/utenze/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  try {
    const user = c.get("user");
    
    const res = await query("UPDATE inventory.utenze SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING username", [id]);
    if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);

    const username = res.rows[0].username;

    // Log the action
    await query(
      `INSERT INTO inventory.audit_log (utente_operatore, azione, dettagli) VALUES ($1, $2, $3)`,
      [user.email, 'DELETE_USER', JSON.stringify({ utenza_id: id, username })]
    );

    // Simulate updating storico_password
    await query(
      `INSERT INTO inventory.storico_password (utenza_id, username, sistema_nome, vault_path, azione, eseguito_da)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, username, "Simulated System", "secret/data/...", "CANCELLAZIONE", user.email]
    );

    return c.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    return c.json({ error: "Failed" }, 500);
  }
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// ─── Bootstrap ──────────────────────────────────────────────────────────
const initAdmin = async () => {
  // Wait a moment for DB to be fully ready
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    const existing = await query('SELECT * FROM public."user" WHERE email = $1', ['admin@nexivault.local']);
    if (existing.rows.length === 0) {
      console.log("Creating admin user via Better Auth API...");
      await auth.api.signUpEmail({
        body: {
          email: "admin@nexivault.local",
          password: "Sole_2482002",
          name: "Administrator"
        }
      });
      console.log("Admin user created successfully.");
    } else {
      console.log("Admin user already exists, skipping creation.");
    }
  } catch (err: any) {
    console.error("Failed to init admin:", err?.message || err);
  }
};

const port = 8000;

initAdmin().then(() => {
  console.log(`Server starting on port ${port}...`);
  serve({ fetch: app.fetch, port });
  console.log(`Server is running on http://0.0.0.0:${port}`);
});
