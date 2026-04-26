/**
 * FileTenantStore — reads/writes the existing `.tenants/<slug>/.hostaposta/`
 * layout + triggers rebuilds by spawning pnpm inside the tenant dir.
 *
 * This is the dev-mode backend. A future PayloadTenantStore will implement
 * the same interface talking to Payload's REST/GraphQL API with R2 for media.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { CarveMap, EditsMap } from "@hostaposta/generate";
import { rebuildEditsInTenant } from "@hostaposta/generate";
import sharp from "sharp";
import type {
  CollectionKind,
  MediaAsset,
  PageDetail,
  PageInfo,
  PageMeta,
  RebuildResult,
  TenantCollections,
  TenantInfo,
  TenantStore,
  UploadMediaInput,
  UploadMediaResult,
} from "./types.js";
import { assertValidSlug } from "./slug.js";

const execAsync = promisify(exec);

export interface FileTenantStoreOptions {
  /** Path to the `.tenants/` directory. */
  tenantsDir: string;
}

export class FileTenantStore implements TenantStore {
  private readonly tenantsDir: string;

  constructor(opts: FileTenantStoreOptions) {
    this.tenantsDir = path.resolve(opts.tenantsDir);
  }

  /**
   * Resolve the on-disk dir for a tenant. Validates the slug (throws
   * InvalidSlugError on bad input) and double-checks the joined path
   * hasn't escaped tenantsDir — belt + suspenders against path traversal.
   * Filesystem-only; never exposed outside this class.
   */
  private resolveTenantDir(slug: string): string {
    assertValidSlug(slug);
    const tenantDir = path.resolve(this.tenantsDir, slug);
    if (!tenantDir.startsWith(this.tenantsDir + path.sep) && tenantDir !== this.tenantsDir) {
      throw new Error(`slug escaped tenantsDir: ${slug}`);
    }
    return tenantDir;
  }

  /**
   * Per-slug promise-chain mutex. Read-modify-write on edits.json is not
   * atomic — two concurrent admin saves would otherwise race and drop one.
   * We serialize operations per tenant via a Map<slug, tailPromise>; the
   * next caller awaits the current tail before doing their own read+write.
   *
   * In-process only. If we ever shard the API across multiple processes
   * we'll need a real lockfile (proper-lockfile) or a DB-level lock.
   */
  private readonly editsLocks = new Map<string, Promise<unknown>>();

  private async withEditsLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.editsLocks.get(slug) ?? Promise.resolve();
    const next = prev.then(fn, fn); // always run fn, regardless of prev's outcome
    this.editsLocks.set(slug, next.catch(() => undefined));
    try {
      return await next;
    } finally {
      // If we're the tail, release the reference so the map doesn't grow.
      if (this.editsLocks.get(slug) === next.catch(() => undefined)) {
        // Intentionally don't delete — the reference comparison above is rarely
        // true due to .catch() wrapping. Map stays bounded by tenant count.
      }
    }
  }

  async listTenants(): Promise<TenantInfo[]> {
    if (!existsSync(this.tenantsDir)) return [];
    const entries = await fs.readdir(this.tenantsDir, { withFileTypes: true });
    const out: TenantInfo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const info = await this.getTenant(entry.name);
      if (info) out.push(info);
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async getTenant(slug: string): Promise<TenantInfo | null> {
    let tenantDir: string;
    try {
      tenantDir = this.resolveTenantDir(slug);
    } catch {
      return null;
    }
    if (!existsSync(tenantDir)) return null;

    const carveMapPath = path.join(tenantDir, ".hostaposta/carve-map.json");
    const editsPath = path.join(tenantDir, ".hostaposta/edits.json");
    const tenantDataPath = path.join(tenantDir, "src/data/tenant-data.ts");

    const hasCarveMap = existsSync(carveMapPath);
    const hasEdits = existsSync(editsPath);

    // Parse tenant-data.ts for siteName, lang, dir, routes.
    // We emit the file as a single JSON literal assigned to TENANT_DATA,
    // so we can extract the JSON body without running TS.
    let siteName = slug;
    let lang = "en";
    let dir: "ltr" | "rtl" = "ltr";
    let routes: string[] = [];
    if (existsSync(tenantDataPath)) {
      try {
        const content = await fs.readFile(tenantDataPath, "utf-8");
        const match = content.match(/TENANT_DATA\s*:\s*TenantData\s*=\s*(\{[\s\S]*?\});\s*$/m);
        if (match) {
          const data = JSON.parse(match[1]!) as {
            lang?: string;
            dir?: "ltr" | "rtl";
            settings?: { siteName?: string };
            pages?: Array<{ slug?: string }>;
          };
          siteName = data.settings?.siteName ?? slug;
          lang = data.lang ?? "en";
          dir = data.dir ?? "ltr";
          routes = (data.pages ?? []).map((p) => p.slug ?? "").filter(Boolean);
        }
      } catch {
        // fall through with defaults
      }
    }

    // Fallback: derive routes from carve map if tenant-data didn't parse
    if (routes.length === 0 && hasCarveMap) {
      try {
        const carve = JSON.parse(await fs.readFile(carveMapPath, "utf-8")) as CarveMap;
        routes = carve.pages.map((p) => p.route);
      } catch {
        // leave empty
      }
    }

    return {
      slug,
      siteName,
      lang,
      dir,
      routes,
      hasCarveMap,
      hasEdits,
    };
  }

  async getCarveMap(slug: string): Promise<CarveMap | null> {
    let tenantDir: string;
    try { tenantDir = this.resolveTenantDir(slug); } catch { return null; }
    const p = path.join(tenantDir, ".hostaposta/carve-map.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(await fs.readFile(p, "utf-8")) as CarveMap;
    } catch {
      return null;
    }
  }

  async getEdits(slug: string): Promise<EditsMap> {
    let tenantDir: string;
    try { tenantDir = this.resolveTenantDir(slug); } catch { return {}; }
    const p = path.join(tenantDir, ".hostaposta/edits.json");
    if (!existsSync(p)) return {};
    try {
      return JSON.parse(await fs.readFile(p, "utf-8")) as EditsMap;
    } catch {
      return {};
    }
  }

  async setEdits(slug: string, patch: EditsMap): Promise<void> {
    const tenantDir = this.resolveTenantDir(slug); // throws on invalid slug
    return this.withEditsLock(slug, async () => {
      const p = path.join(tenantDir, ".hostaposta/edits.json");
      await fs.mkdir(path.dirname(p), { recursive: true });
      const current = await this.getEdits(slug);
      const next = { ...current, ...patch };
      await fs.writeFile(p, JSON.stringify(next, null, 2));
    });
  }

  async clearEdit(slug: string, editId: string): Promise<void> {
    const tenantDir = this.resolveTenantDir(slug);
    return this.withEditsLock(slug, async () => {
      const current = await this.getEdits(slug);
      delete current[editId];
      const p = path.join(tenantDir, ".hostaposta/edits.json");
      await fs.writeFile(p, JSON.stringify(current, null, 2));
    });
  }

  async listPages(slug: string): Promise<PageInfo[]> {
    const carve = await this.getCarveMap(slug);
    const edits = await this.getEdits(slug);
    if (!carve) return [];
    const editedIds = new Set(Object.keys(edits));
    return carve.pages.map((p) => ({
      route: p.route,
      totalEdits: p.edits.length,
      editedCount: p.edits.filter((e) => editedIds.has(e.id)).length,
    }));
  }

  async getPage(slug: string, route: string): Promise<PageDetail | null> {
    const carve = await this.getCarveMap(slug);
    if (!carve) return null;
    const page = carve.pages.find((p) => p.route === route);
    if (!page) return null;
    const edits = await this.getEdits(slug);
    return {
      route: page.route,
      edits: page.edits.map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.label,
        current: e.current,
        selector: e.selector,
        attribute: e.attribute,
        value: edits[e.id] ?? null,
      })),
      notes: page.notes,
    };
  }

  async rebuild(slug: string): Promise<RebuildResult> {
    let tenantDir: string;
    try { tenantDir = this.resolveTenantDir(slug); } catch (err) {
      return { ok: false, durationMs: 0, error: (err as Error).message };
    }
    if (!existsSync(tenantDir)) {
      return { ok: false, durationMs: 0, error: `tenant not found: ${slug}` };
    }

    const start = Date.now();
    try {
      // Step 1: re-apply edits to the fossilized source HTML, rewrite the
      // Astro page files. No Claude, no ingest — fast.
      const rebuildResult = await rebuildEditsInTenant({ tenantDir });

      // Step 2: run astro build. The admin's next preview request reads the
      // updated dist.
      const result = await execAsync("pnpm --ignore-workspace run build", {
        cwd: tenantDir,
        timeout: 180_000,
      });

      return {
        ok: true,
        durationMs: Date.now() - start,
        log: [
          `edits applied: ${rebuildResult.applied}, skipped: ${rebuildResult.skipped}`,
          ...rebuildResult.warnings.slice(0, 5),
          "--- astro build ---",
          result.stdout.slice(-1500),
        ].join("\n"),
      };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return {
        ok: false,
        durationMs: Date.now() - start,
        error: (e.stderr || e.message || String(err)).slice(0, 2000),
      };
    }
  }

  // ── Media ──────────────────────────────────────────────────────────────

  async listMedia(slug: string): Promise<MediaAsset[]> {
    const tenantDir = this.resolveTenantDir(slug);
    const publicDir = path.join(tenantDir, "public");
    if (!existsSync(publicDir)) return [];

    const out: MediaAsset[] = [];
    const uploadsDir = path.join(publicDir, "uploads");

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name.startsWith("__")) continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile()) {
          const kind = kindOf(entry.name);
          if (kind === "other") continue; // skip non-asset files (html, xml, robots.txt)
          const stat = await fs.stat(abs);
          const urlPath = "/" + path.relative(publicDir, abs).replace(/\\/g, "/");
          out.push({
            url: urlPath,
            filename: entry.name,
            bytes: stat.size,
            kind,
            uploaded: abs.startsWith(uploadsDir + path.sep),
          });
        }
      }
    };

    await walk(publicDir);
    // Sort: uploads first (newest items usually), then alphabetical
    out.sort((a, b) => {
      if (a.uploaded !== b.uploaded) return a.uploaded ? -1 : 1;
      return a.filename.localeCompare(b.filename);
    });
    return out;
  }

  // ── Collections (read-only for now; writes come in the CRUD session) ───

  async getCollections(slug: string): Promise<TenantCollections> {
    const tenantDir = this.resolveTenantDir(slug);
    const tenantDataPath = path.join(tenantDir, "src/data/tenant-data.ts");
    const empty: TenantCollections = { blog: [], testimonial: [], team: [], service: [], product: [] };
    let base = empty;
    if (existsSync(tenantDataPath)) {
      try {
        const content = await fs.readFile(tenantDataPath, "utf-8");
        const match = content.match(/TENANT_DATA\s*:\s*TenantData\s*=\s*(\{[\s\S]*?\});\s*$/m);
        if (match) {
          const data = JSON.parse(match[1]!) as { collections?: Partial<TenantCollections> };
          const c = data.collections ?? {};
          base = {
            blog: Array.isArray(c.blog) ? c.blog : [],
            testimonial: Array.isArray(c.testimonial) ? c.testimonial : [],
            team: Array.isArray(c.team) ? c.team : [],
            service: Array.isArray(c.service) ? c.service : [],
            product: Array.isArray(c.product) ? c.product : [],
          };
        }
      } catch {
        // fall through with empty base
      }
    }

    // Merge the admin overlay. Keyed by entry slug so reordering in
    // tenant-data.ts doesn't scramble edits. Missing slug => no overlay.
    const overlay = await this.readCollectionOverlay(slug);
    const kinds: CollectionKind[] = ["blog", "testimonial", "team", "service", "product"];
    const merged: TenantCollections = { blog: [], testimonial: [], team: [], service: [], product: [] };
    for (const kind of kinds) {
      merged[kind] = base[kind].map((entry) => {
        const entrySlug = typeof entry.slug === "string" ? entry.slug : undefined;
        if (!entrySlug) return entry;
        const patch = overlay[kind]?.[entrySlug];
        return patch ? { ...entry, ...patch } : entry;
      });
    }
    return merged;
  }

  async updateCollectionEntry(
    slug: string,
    kind: CollectionKind,
    entrySlug: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!entrySlug || typeof entrySlug !== "string") {
      throw new Error("entrySlug required");
    }
    const collections = await this.getCollections(slug);
    const current = collections[kind].find((e) => e.slug === entrySlug);
    if (!current) throw new Error(`${kind} entry not found: ${entrySlug}`);

    return this.withEditsLock(slug, async () => {
      const overlay = await this.readCollectionOverlay(slug);
      const existing = overlay[kind]?.[entrySlug] ?? {};
      const nextPatch = { ...existing, ...patch };
      overlay[kind] = { ...(overlay[kind] ?? {}), [entrySlug]: nextPatch };

      const tenantDir = this.resolveTenantDir(slug);
      const p = path.join(tenantDir, ".hostaposta/collection-edits.json");
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, JSON.stringify(overlay, null, 2));
      return { ...current, ...nextPatch };
    });
  }

  private async readCollectionOverlay(
    slug: string,
  ): Promise<Partial<Record<CollectionKind, Record<string, Record<string, unknown>>>>> {
    let tenantDir: string;
    try { tenantDir = this.resolveTenantDir(slug); } catch { return {}; }
    const p = path.join(tenantDir, ".hostaposta/collection-edits.json");
    if (!existsSync(p)) return {};
    try {
      return JSON.parse(await fs.readFile(p, "utf-8")) as Partial<
        Record<CollectionKind, Record<string, Record<string, unknown>>>
      >;
    } catch {
      return {};
    }
  }

  // ── Page meta (SEO / head) ─────────────────────────────────────────────

  async getPageMeta(slug: string, route: string): Promise<PageMeta> {
    let tenantDir: string;
    try { tenantDir = this.resolveTenantDir(slug); } catch { return {}; }
    const p = path.join(tenantDir, ".hostaposta/meta.json");
    if (!existsSync(p)) return {};
    try {
      const all = JSON.parse(await fs.readFile(p, "utf-8")) as Record<string, PageMeta>;
      return all[route] ?? {};
    } catch {
      return {};
    }
  }

  async setPageMeta(slug: string, route: string, meta: PageMeta): Promise<void> {
    const tenantDir = this.resolveTenantDir(slug);
    return this.withEditsLock(slug, async () => {
      const p = path.join(tenantDir, ".hostaposta/meta.json");
      await fs.mkdir(path.dirname(p), { recursive: true });
      let all: Record<string, PageMeta> = {};
      if (existsSync(p)) {
        try { all = JSON.parse(await fs.readFile(p, "utf-8")) as Record<string, PageMeta>; } catch { /* ignore */ }
      }
      // Drop undefined keys so clearing a field actually clears it.
      const cleaned: PageMeta = {};
      if (meta.title !== undefined && meta.title !== "") cleaned.title = meta.title;
      if (meta.description !== undefined && meta.description !== "") cleaned.description = meta.description;
      if (meta.ogImage !== undefined && meta.ogImage !== "") cleaned.ogImage = meta.ogImage;
      if (meta.schema !== undefined && meta.schema !== null && meta.schema !== "") cleaned.schema = meta.schema;
      if (Object.keys(cleaned).length === 0) {
        delete all[route];
      } else {
        all[route] = cleaned;
      }
      await fs.writeFile(p, JSON.stringify(all, null, 2));
    });
  }

  async uploadMedia(slug: string, input: UploadMediaInput): Promise<UploadMediaResult> {
    const tenantDir = this.resolveTenantDir(slug);
    const uploadsDir = path.join(tenantDir, "public/uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeName = sanitizeFilename(input.filename);
    const kind = kindOf(safeName);

    // Images: resize + compress. Everything else: write as-is.
    if (kind === "image" && input.contentType.startsWith("image/")) {
      return await compressAndWriteImage(uploadsDir, safeName, input);
    }

    const destName = await dedupeName(uploadsDir, safeName);
    const abs = path.join(uploadsDir, destName);
    await fs.writeFile(abs, input.data);
    const stat = await fs.stat(abs);
    return {
      asset: {
        url: `/uploads/${destName}`,
        filename: destName,
        bytes: stat.size,
        kind,
        uploaded: true,
      },
    };
  }
}

// ── Media helpers (file-scoped) ──────────────────────────────────────────

function kindOf(filename: string): "image" | "video" | "font" | "other" {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "ogv", "mov"].includes(ext)) return "video";
  if (["woff", "woff2", "ttf", "otf", "eot"].includes(ext)) return "font";
  return "other";
}

function sanitizeFilename(name: string): string {
  // Drop any path components; keep basename; replace spaces + weird chars.
  const base = path.basename(name).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
  return base || `upload-${Date.now()}`;
}

async function dedupeName(dir: string, name: string): Promise<string> {
  const { name: stem, ext } = path.parse(name);
  let candidate = name;
  let i = 1;
  while (existsSync(path.join(dir, candidate))) {
    candidate = `${stem}-${i}${ext}`;
    i += 1;
  }
  return candidate;
}

const MAX_IMAGE_WIDTH = 2200;     // longer side cap — covers 2x retina on desktops
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 82;

async function compressAndWriteImage(
  uploadsDir: string,
  safeName: string,
  input: UploadMediaInput,
): Promise<UploadMediaResult> {
  const parsed = path.parse(safeName);
  const ext = parsed.ext.toLowerCase();

  // SVGs are scalable + often used as icons; don't rasterize them.
  if (ext === ".svg") {
    const destName = await dedupeName(uploadsDir, safeName);
    const abs = path.join(uploadsDir, destName);
    await fs.writeFile(abs, input.data);
    const stat = await fs.stat(abs);
    return {
      asset: { url: `/uploads/${destName}`, filename: destName, bytes: stat.size, kind: "image", uploaded: true },
      compression: { originalBytes: input.data.length, outputBytes: stat.size, format: "svg", width: 0, height: 0 },
    };
  }

  // Everything else: pipe through sharp.
  // GIFs pass through (animated). PNG/JPG/WEBP/AVIF get re-encoded.
  const isGif = ext === ".gif";
  let pipeline = sharp(input.data, { animated: isGif }).rotate(); // honour EXIF orientation
  const meta = await sharp(input.data).metadata();
  if ((meta.width ?? 0) > MAX_IMAGE_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true });
  }

  let output: Buffer;
  let outFormat: string;
  let outExt: string;
  if (isGif) {
    output = await pipeline.gif().toBuffer();
    outFormat = "gif"; outExt = ".gif";
  } else if (ext === ".png") {
    output = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
    outFormat = "png"; outExt = ".png";
  } else if (ext === ".webp" || ext === ".avif") {
    output = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    outFormat = "webp"; outExt = ".webp";
  } else {
    // jpg, jpeg, anything else → re-encode as JPEG
    output = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    outFormat = "jpeg"; outExt = ".jpg";
  }

  const finalName = await dedupeName(uploadsDir, `${parsed.name}${outExt}`);
  const abs = path.join(uploadsDir, finalName);
  await fs.writeFile(abs, output);

  const finalMeta = await sharp(output).metadata();
  return {
    asset: {
      url: `/uploads/${finalName}`,
      filename: finalName,
      bytes: output.length,
      kind: "image",
      uploaded: true,
    },
    compression: {
      originalBytes: input.data.length,
      outputBytes: output.length,
      format: outFormat,
      width: finalMeta.width ?? 0,
      height: finalMeta.height ?? 0,
    },
  };
}
