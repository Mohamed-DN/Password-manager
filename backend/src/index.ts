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
    return c.json({
      ambienti: ambienti.rows,
      tecnologie: tecnologie.rows,
      tipi_utenza: tipi.rows,
      bao_owners: [],
      ticket: []
    });
  } catch (err) {
    console.error("Lookups error:", err);
    return c.json({ error: "Failed to fetch lookups" }, 500);
  }
});

app.get("/api/sistemi", authMiddleware, async (c) => {
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
    const res = await query("SELECT id, username, sistema_target_id, bao_owner_id, ticket_id, vault_path, attiva FROM inventory.utenze WHERE deleted_at IS NULL");
    return c.json(res.rows);
  } catch (err) {
    console.error("Utenze error:", err);
    return c.json([], 200);
  }
});

app.get("/api/utenze/:id/password", authMiddleware, async (c) => {
  const id = c.req.param("id");
  try {
    const res = await query("SELECT vault_path FROM inventory.utenze WHERE id = $1", [id]);
    if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
    // For now return placeholder — vault integration can be added later
    return c.json({ password: "***vault-integration-pending***" });
  } catch (err) {
    console.error("Password error:", err);
    return c.json({ error: "Failed" }, 500);
  }
});

app.post("/api/entry", authMiddleware, async (c) => {
  return c.json({ message: "Success" });
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
