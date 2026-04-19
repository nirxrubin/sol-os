/**
 * HostaPosta control-plane API.
 *
 * Minimal Express server exposing TenantStore over HTTP. Consumed by
 * apps/admin. Swap the FileTenantStore for a PayloadTenantStore later and
 * every endpoint keeps working.
 *
 * Endpoints:
 *   GET    /api/tenants                        list
 *   GET    /api/tenants/:slug                  tenant info
 *   GET    /api/tenants/:slug/pages            page list with edit counts
 *   GET    /api/tenants/:slug/page?route=/...  page detail (edits + values)
 *   GET    /api/tenants/:slug/edits            raw edits.json
 *   PUT    /api/tenants/:slug/edits            merge edits (body: { editId: value, ... })
 *   DELETE /api/tenants/:slug/edits/:editId    revert one edit
 *   POST   /api/tenants/:slug/rebuild          regenerate + build
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { FileTenantStore, InvalidSlugError, assertValidSlug } from "@hostaposta/tenant-store";

const PORT = Number(process.env.HOSTAPOSTA_API_PORT ?? 4000);
const TENANTS_DIR = path.join(repoRoot, ".tenants");

const store = new FileTenantStore({ tenantsDir: TENANTS_DIR });

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "2mb" }));

// ── helpers ──────────────────────────────────────────────────────────────

/** Wrap an async route handler so thrown errors become structured responses
 *  instead of crashing the process (Express 4/5 behaviour without this). */
function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Pull `:slug` from params, validate it. Throws InvalidSlugError if the
 *  incoming value isn't a clean [A-Za-z0-9_-]{1,100}. */
function slugOf(req: Request): string {
  const raw = req.params.slug;
  assertValidSlug(raw, "tenant slug");
  return raw;
}

// ── tenants ──────────────────────────────────────────────────────────────

app.get("/api/tenants", asyncHandler(async (_req, res) => {
  const list = await store.listTenants();
  res.json({ tenants: list });
}));

app.get("/api/tenants/:slug", asyncHandler(async (req, res) => {
  const info = await store.getTenant(slugOf(req));
  if (!info) {
    res.status(404).json({ error: "tenant not found" });
    return;
  }
  res.json({ tenant: info });
}));

// ── pages ────────────────────────────────────────────────────────────────

app.get("/api/tenants/:slug/pages", asyncHandler(async (req, res) => {
  const pages = await store.listPages(slugOf(req));
  res.json({ pages });
}));

app.get("/api/tenants/:slug/page", asyncHandler(async (req, res) => {
  const route = typeof req.query.route === "string" ? req.query.route : "/";
  if (route.length > 200 || !route.startsWith("/")) {
    res.status(400).json({ error: "route must start with / and be ≤200 chars" });
    return;
  }
  const page = await store.getPage(slugOf(req), route);
  if (!page) {
    res.status(404).json({ error: "page not found" });
    return;
  }
  res.json({ page });
}));

// ── edits ────────────────────────────────────────────────────────────────

app.get("/api/tenants/:slug/edits", asyncHandler(async (req, res) => {
  const edits = await store.getEdits(slugOf(req));
  res.json({ edits });
}));

app.put("/api/tenants/:slug/edits", asyncHandler(async (req, res) => {
  const patch: unknown = req.body;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    res.status(400).json({ error: "body must be an object of { editId: value }" });
    return;
  }
  // Reject obvious garbage keys + coerce values to strings.
  const coerced: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(k)) {
      res.status(400).json({ error: `invalid editId: ${k}` });
      return;
    }
    if (v == null) {
      res.status(400).json({ error: `editId ${k} has null/undefined value (use DELETE to revert)` });
      return;
    }
    coerced[k] = typeof v === "string" ? v : String(v);
  }
  await store.setEdits(slugOf(req), coerced);
  res.json({ ok: true, count: Object.keys(coerced).length });
}));

app.delete("/api/tenants/:slug/edits/:editId", asyncHandler(async (req, res) => {
  const raw = req.params.editId;
  const editId = typeof raw === "string" ? raw : "";
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(editId)) {
    res.status(400).json({ error: `invalid editId: ${editId}` });
    return;
  }
  await store.clearEdit(slugOf(req), editId);
  res.json({ ok: true });
}));

// ── rebuild ──────────────────────────────────────────────────────────────

app.post("/api/tenants/:slug/rebuild", asyncHandler(async (req, res) => {
  const result = await store.rebuild(slugOf(req));
  res.status(result.ok ? 200 : 500).json({ result });
}));

// ── error handler (must be last) ─────────────────────────────────────────

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof InvalidSlugError) {
    res.status(400).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "internal error";
  console.error(`[hostaposta-api] ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: message.slice(0, 500) });
});

// ── boot ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[hostaposta-api] listening on http://localhost:${PORT}`);
  console.log(`[hostaposta-api] tenants dir: ${TENANTS_DIR}`);
});
