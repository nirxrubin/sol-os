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
import type {
  PageDetail,
  PageInfo,
  RebuildResult,
  TenantInfo,
  TenantStore,
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
}
