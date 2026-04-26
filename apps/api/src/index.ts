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
import multer from "multer";
import { FileTenantStore, InvalidSlugError, assertValidSlug } from "@hostaposta/tenant-store";

const PORT = Number(process.env.HOSTAPOSTA_API_PORT ?? 4000);
const TENANTS_DIR = path.join(repoRoot, ".tenants");

const store = new FileTenantStore({ tenantsDir: TENANTS_DIR });

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "2mb" }));

// Multer — in-memory for media uploads so TenantStore owns where it lands.
// 25MB cap matches reasonable admin-upload sizes (photos, hero backgrounds).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

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

// ── root (human-readable info page) ──────────────────────────────────────

app.get("/", (_req, res) => {
  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html><head><meta charset="utf-8" /><title>HostaPosta API</title>
<style>
  body { font: 14px/1.6 system-ui, sans-serif; color: #292524; background: #FAFAF8;
         max-width: 640px; margin: 4rem auto; padding: 0 2rem; }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 1rem; }
  code { background: #F5F3F0; padding: 2px 6px; border-radius: 4px;
         font-family: ui-monospace, SF Mono, monospace; font-size: 12px; }
  ul { padding-left: 1.25rem; }
  li { margin: 0.25rem 0; }
  .muted { color: #78716C; }
</style></head>
<body>
  <h1>HostaPosta control-plane API</h1>
  <p class="muted">This is the backend. You probably want the admin UI.</p>
  <ul>
    <li>Admin UI: <a href="http://localhost:5173">http://localhost:5173</a></li>
    <li>Tenant list: <a href="/api/tenants"><code>GET /api/tenants</code></a></li>
  </ul>
  <p class="muted">See <code>apps/api/src/index.ts</code> for all endpoints.</p>
</body></html>`);
});

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

// ── collections ──────────────────────────────────────────────────────────

const COLLECTION_KINDS = new Set(["blog", "testimonial", "team", "service", "product"]);
const ENTRY_SLUG_RE = /^[A-Za-z0-9_-]{1,120}$/;

app.get("/api/tenants/:slug/collections", asyncHandler(async (req, res) => {
  const collections = await store.getCollections(slugOf(req));
  res.json({ collections });
}));

app.put("/api/tenants/:slug/collections/:kind/:entrySlug", asyncHandler(async (req, res) => {
  const kind = typeof req.params.kind === "string" ? req.params.kind : "";
  const entrySlug = typeof req.params.entrySlug === "string" ? req.params.entrySlug : "";
  if (!COLLECTION_KINDS.has(kind)) {
    res.status(400).json({ error: `invalid collection kind: ${kind}` });
    return;
  }
  if (!ENTRY_SLUG_RE.test(entrySlug)) {
    res.status(400).json({ error: `invalid entry slug: ${entrySlug}` });
    return;
  }
  const patch: unknown = req.body;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    res.status(400).json({ error: "body must be a patch object" });
    return;
  }
  const entry = await store.updateCollectionEntry(
    slugOf(req),
    kind as "blog" | "testimonial" | "team" | "service" | "product",
    entrySlug,
    patch as Record<string, unknown>,
  );
  res.json({ entry });
}));

// ── page meta (SEO / head) ───────────────────────────────────────────────

function readRoute(req: Request): string | null {
  const route = typeof req.query.route === "string" ? req.query.route : "";
  if (!route.startsWith("/") || route.length > 200) return null;
  return route;
}

app.get("/api/tenants/:slug/meta", asyncHandler(async (req, res) => {
  const route = readRoute(req);
  if (!route) {
    res.status(400).json({ error: "route must start with / and be ≤200 chars" });
    return;
  }
  const meta = await store.getPageMeta(slugOf(req), route);
  res.json({ meta });
}));

app.put("/api/tenants/:slug/meta", asyncHandler(async (req, res) => {
  const route = readRoute(req);
  if (!route) {
    res.status(400).json({ error: "route must start with / and be ≤200 chars" });
    return;
  }
  const body = req.body as { meta?: unknown };
  if (!body || typeof body.meta !== "object" || body.meta === null || Array.isArray(body.meta)) {
    res.status(400).json({ error: "body.meta must be an object" });
    return;
  }
  await store.setPageMeta(slugOf(req), route, body.meta as Record<string, unknown>);
  res.json({ ok: true });
}));

// ── media ────────────────────────────────────────────────────────────────

app.get("/api/tenants/:slug/media", asyncHandler(async (req, res) => {
  const assets = await store.listMedia(slugOf(req));
  res.json({ assets });
}));

app.post(
  "/api/tenants/:slug/media",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "no file uploaded (expected multipart field 'file')" });
      return;
    }
    if (!file.originalname) {
      res.status(400).json({ error: "file has no name" });
      return;
    }
    const result = await store.uploadMedia(slugOf(req), {
      filename: file.originalname,
      contentType: file.mimetype || "application/octet-stream",
      data: file.buffer,
    });
    res.json(result);
  }),
);

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
