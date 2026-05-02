import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { query } from "./db";
import * as vault from "./vault";
import { Context } from "hono";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({
  origin: "http://localhost:5173",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Better Auth integration
app.on(["POST", "GET"], "/api/auth/*", (c) => {
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
  const ambienti = await query("SELECT * FROM ambienti");
  const tecnologie = await query("SELECT * FROM tecnologie");
  const tipi = await query("SELECT * FROM tipi_utenza");
  const owners = await query("SELECT * FROM bao_owners");
  const tickets = await query("SELECT * FROM ticket");
  
  return c.json({
    ambienti: ambienti.rows,
    tecnologie: tecnologie.rows,
    tipi_utenza: tipi.rows,
    bao_owners: owners.rows,
    ticket: tickets.rows
  });
});

app.get("/api/sistemi", authMiddleware, async (c) => {
  const res = await query("SELECT * FROM sistemi_target");
  return c.json(res.rows);
});

app.post("/api/entry", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  
  // Implemet logic from Python create_unified_entry
  // ... (simplified for now to keep the flow)
  
  return c.json({ message: "Success" });
});

app.get("/api/utenze", authMiddleware, async (c) => {
  const res = await query("SELECT id, username, sistema_target_id, bao_owner_id, ticket_id, vault_path, attiva FROM utenze WHERE deleted_at IS NULL");
  return c.json(res.rows);
});

app.get("/api/utenze/:id/password", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const res = await query("SELECT vault_path FROM utenze WHERE id = $1", [id]);
  if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
  
  const password = await vault.getPassword(res.rows[0].vault_path);
  return c.json({ password });
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const port = 8000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
