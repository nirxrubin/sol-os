/**
 * @hostaposta/generate — eval case → runnable Astro tenant site.
 *
 * Default path: fossilize. Copies the source's rendered build output
 * verbatim into the tenant's public/. Astro serves it untouched. Pixel-
 * identical to source, zero Claude calls.
 *
 * The pixel-block-generator is retained but not the default — it's
 * accessible via `mode: "pixel-rewrite"` for when we want to re-author as
 * idiomatic Astro components (editability over fidelity).
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { TokenSet } from "@hostaposta/tokens";
import type { CollectionExtractionResult } from "@hostaposta/collection-parser";
import type { IngestionResult } from "@hostaposta/ingest";
import { forkTemplate } from "./fork.js";
import { renderTokensCss } from "./tokens-css.js";
import { collectFossilizedHtml, writeAstroPages } from "./fossilize.js";
import { carveAll, type CarveMap } from "./carve.js";
import { applyEditsAcrossPages, type EditsMap } from "./apply-edits.js";
import { generatePixelBlocks } from "./pixel-block-generator.js";
import { copyAssets, applyAssetRemap } from "./assets.js";
import { emitTenantData } from "./emit-data.js";
import type { PageDef, BlogPost, Testimonial, TeamMember, Service } from "./types.js";

export * from "./types.js";
export { forkTemplate } from "./fork.js";
export { renderTokensCss } from "./tokens-css.js";
export { emitTenantData } from "./emit-data.js";
export { collectFossilizedHtml, writeAstroPages, readSourceHtml } from "./fossilize.js";

/**
 * Fast rebuild — re-apply edits to already-fossilized tenant pages.
 *
 * Reads the source HTML sidecar that `writeAstroPages({ saveSourceHtml: true })`
 * left in `.hostaposta/source-html/`, re-applies edits.json, and rewrites
 * the Astro pages. No Claude, no ingest/fossilize — milliseconds.
 *
 * Use this path when the admin changes an edit and wants the tenant site
 * updated. The caller (tenant-store) typically follows with `astro build`.
 */
export async function rebuildEditsInTenant(opts: {
  tenantDir: string;
  log?: (msg: string) => void;
}): Promise<{ applied: number; skipped: number; warnings: string[] }> {
  const { readSourceHtml: readSrc } = await import("./fossilize.js");
  const { applyEditsAcrossPages: applyAll } = await import("./apply-edits.js");
  const { writeAstroPages: writePages } = await import("./fossilize.js");
  const fsmod = await import("node:fs/promises");
  const pathmod = await import("node:path");
  const log = opts.log ?? (() => {});

  const sourceHtml = await readSrc(opts.tenantDir);
  if (!sourceHtml) {
    throw new Error(
      `No source HTML sidecar at ${opts.tenantDir}/.hostaposta/source-html — run \`pnpm generate <caseId>\` first.`,
    );
  }

  const carveMapPath = pathmod.join(opts.tenantDir, ".hostaposta/carve-map.json");
  const editsPath = pathmod.join(opts.tenantDir, ".hostaposta/edits.json");

  let carveMap;
  try {
    carveMap = JSON.parse(await fsmod.readFile(carveMapPath, "utf-8"));
  } catch {
    throw new Error(`No carve-map.json at ${carveMapPath}`);
  }

  let editValues = {};
  try {
    editValues = JSON.parse(await fsmod.readFile(editsPath, "utf-8"));
  } catch {
    // no edits yet — rewrite pages unchanged to normalize
  }

  const applied = applyAll({
    pagesHtml: sourceHtml,
    carveMap,
    values: editValues,
  });

  await writePages({
    pagesHtml: applied.pages,
    tenantDir: opts.tenantDir,
    saveSourceHtml: false, // don't overwrite the source sidecar
    log,
  });

  return {
    applied: applied.summary.totalApplied,
    skipped: applied.summary.totalSkipped,
    warnings: applied.summary.warnings,
  };
}
export { carveAll, carvePage, type CarveMap, type CarvedEdit, type CarvedPage } from "./carve.js";
export { applyEditsAcrossPages, applyEditsToPage, type EditsMap } from "./apply-edits.js";
export { generatePixelBlocks } from "./pixel-block-generator.js";
export { copyAssets, applyAssetRemap } from "./assets.js";

export type GenerateMode = "fossilize" | "pixel-rewrite";

export interface GenerateOptions {
  templateDir: string;
  tenantDir: string;
  ingestion: IngestionResult;
  tokens: TokenSet;
  collections: CollectionExtractionResult;
  sourceBuildRoot?: string;
  siteName?: string;
  /** Default "fossilize" — literal copy of source. "pixel-rewrite" runs
   *  Claude to re-author components (slower, less visually faithful,
   *  better for editability). */
  mode?: GenerateMode;
  /** For pixel-rewrite mode only: enable vision input when wired. */
  useVision?: boolean;
  /** Fossilize: run Claude-powered carve to identify editable nodes.
   *  Default true. First generation always carves; subsequent generations
   *  reuse the existing carve-map.json if present and only re-apply edits. */
  runCarve?: boolean;
  /** Force a fresh carve even if .hostaposta/carve-map.json already exists. */
  forceRecarve?: boolean;
  log?: (msg: string) => void;
}

export interface GenerateResult {
  tenantDir: string;
  mode: GenerateMode;
  /** Fossilize: static pages copied. Pixel-rewrite: pages composed. */
  pagesCount: number;
  /** Fossilize: files copied to public/. */
  filesWritten?: number;
  /** Pixel-rewrite: components written by Claude. */
  componentsWritten?: string[];
  /** Pixel-rewrite: block instances. */
  blockInstancesCount?: number;
  /** Fossilize: total carved edit points across all pages. */
  editsCarved?: number;
  /** Fossilize: edits applied from edits.json this run. */
  editsApplied?: number;
  collectionsCount: Record<"blog" | "testimonial" | "team" | "service", number>;
  assetsCopied: number;
  warnings: string[];
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const log = opts.log ?? ((m) => console.log(`[generate] ${m}`));
  const mode: GenerateMode = opts.mode ?? "fossilize";
  const siteName = opts.siteName ?? inferSiteName(opts.ingestion.source.origin);

  // 1. Fork template
  await forkTemplate(opts.templateDir, opts.tenantDir, log);

  // 2. Tokens (useful even in fossilize — future brand-override layer reads them)
  await fs.writeFile(
    path.join(opts.tenantDir, "src/styles/tokens.css"),
    renderTokensCss(opts.tokens),
  );
  log(`wrote tokens.css (overall token confidence ${(opts.tokens.confidence.overall * 100).toFixed(0)}%)`);

  // 3. Language + direction (for template meta / future overlays)
  const { lang, dir } = inferLangDir(opts.collections);
  log(`lang=${lang} dir=${dir}`);

  // For SPA ingestions we get a `renderedOutputPath` with one HTML per route.
  // Non-SPA (static HTML, Astro, Next static export) fall back to build.outputPath.
  const sourceBuildRoot =
    opts.sourceBuildRoot ??
    opts.ingestion.renderedOutputPath ??
    opts.ingestion.build.outputPath ??
    opts.ingestion.buildPath;

  if (mode === "fossilize") {
    return await runFossilize({ ...opts, sourceBuildRoot, siteName, lang, dir, log });
  }
  return await runPixelRewrite({ ...opts, sourceBuildRoot, siteName, lang, dir, log });
}

// ── fossilize path ────────────────────────────────────────────────────────

interface RunInternal extends Omit<GenerateOptions, "log"> {
  sourceBuildRoot: string | undefined;
  siteName: string;
  lang: string;
  dir: "ltr" | "rtl";
  log: (msg: string) => void;
}

async function runFossilize(opts: RunInternal): Promise<GenerateResult> {
  if (!opts.sourceBuildRoot) {
    throw new Error("fossilize mode requires sourceBuildRoot (ingestion.build.outputPath)");
  }

  // Clean up template cruft that fossilize doesn't use.
  await fs.rm(path.join(opts.tenantDir, "src/components/blocks/tenant"), {
    recursive: true,
    force: true,
  });
  await fs.mkdir(path.join(opts.tenantDir, "src/components/blocks/tenant"), { recursive: true });
  await fs.writeFile(
    path.join(opts.tenantDir, "src/components/blocks/tenant/__Placeholder.astro"),
    "---\n// placeholder — fossilize mode does not use dynamic blocks\n---\n",
  );

  // Phase A: collect source HTML + copy assets
  const collection = await collectFossilizedHtml({
    ingestion: opts.ingestion,
    sourceBuildRoot: opts.sourceBuildRoot,
    tenantDir: opts.tenantDir,
    log: opts.log,
  });

  // Carve: identify editable nodes (cached in .hostaposta/)
  const hostapostaDir = path.join(opts.tenantDir, ".hostaposta");
  await fs.mkdir(hostapostaDir, { recursive: true });
  const carveMapPath = path.join(hostapostaDir, "carve-map.json");
  const editsPath = path.join(hostapostaDir, "edits.json");

  let carveMap: CarveMap | null = null;
  const runCarve = opts.runCarve !== false;
  const carveExists = await fileExists(carveMapPath);
  const shouldRunCarve = runCarve && (!carveExists || opts.forceRecarve === true);

  if (shouldRunCarve) {
    opts.log(`carving ${collection.pagesHtml.size} pages (Claude, parallel)`);
    const pages = Array.from(collection.pagesHtml.entries()).map(([route, html]) => ({ route, html }));
    const carveResult = await carveAll(pages, { log: opts.log });
    carveMap = carveResult.map;
    await fs.writeFile(carveMapPath, JSON.stringify(carveMap, null, 2));
    const totalEdits = carveMap.pages.reduce((n, p) => n + p.edits.length, 0);
    opts.log(`carve complete: ${totalEdits} edit points (${carveResult.warnings.length} warnings)`);
  } else if (carveExists) {
    try {
      carveMap = JSON.parse(await fs.readFile(carveMapPath, "utf-8")) as CarveMap;
      const totalEdits = carveMap.pages.reduce((n, p) => n + p.edits.length, 0);
      opts.log(`reusing cached carve map: ${totalEdits} edit points (use --force-recarve to refresh)`);
    } catch {
      opts.log(`carve map at ${carveMapPath} is unreadable — regenerating`);
      carveMap = null;
    }
  }

  // Load edits (empty if first run)
  let editValues: EditsMap = {};
  if (await fileExists(editsPath)) {
    try {
      editValues = JSON.parse(await fs.readFile(editsPath, "utf-8"));
    } catch {
      opts.log(`edits.json unreadable, treating as empty`);
    }
  } else {
    await fs.writeFile(editsPath, JSON.stringify({}, null, 2));
  }

  // Apply edits
  let editsApplied = 0;
  let finalPagesHtml = collection.pagesHtml;
  if (carveMap && Object.keys(editValues).length > 0) {
    const applied = applyEditsAcrossPages({
      pagesHtml: collection.pagesHtml,
      carveMap,
      values: editValues,
    });
    finalPagesHtml = applied.pages;
    editsApplied = applied.summary.totalApplied;
    opts.log(`applied ${editsApplied} edits (${applied.summary.totalSkipped} skipped)`);
    for (const w of applied.summary.warnings) opts.log(`edit warn: ${w}`);
  } else if (Object.keys(editValues).length === 0) {
    opts.log(`no edits to apply (edit via \`pnpm edit <caseId> <editId> <value>\`)`);
  }

  // Phase B: write Astro pages with final HTML + save source HTML sidecar
  // so rebuilds after admin edits can re-apply without re-running the full
  // ingest/fossilize pipeline.
  const writeResult = await writeAstroPages({
    pagesHtml: finalPagesHtml,
    tenantDir: opts.tenantDir,
    saveSourceHtml: true,
    log: opts.log,
  });

  const editsCarved = carveMap?.pages.reduce((n, p) => n + p.edits.length, 0) ?? 0;

  // Build a lightweight "fossilResult"-shaped summary for back-compat in
  // the return value (filesWritten/htmlPages semantics preserved).
  const fossilResult = {
    filesWritten: collection.assetsCopied + writeResult.pagesWritten.length,
    htmlPages: writeResult.pagesWritten,
    assetsCopied: collection.assetsCopied,
    warnings: collection.warnings,
  };

  // Collection data still lives in tenant-data.ts for later use (admin edit
  // surface, block-generator v2). Assets there get normalized to rooted paths
  // via a light remap (paths already absolute after fossilize's rewrite).
  const extract = <T,>(slug: string): T[] => {
    const col = opts.collections.detectedCollections.find((c) => c.type === slug);
    if (!col) return [];
    return col.entries.map((e) => normalizeEntryPaths(e.data) as T);
  };

  const blog = extract<BlogPost>("blog");
  const testimonial = extract<Testimonial>("testimonial");
  const team = extract<TeamMember>("team");
  const service = extract<Service>("service");

  // Emit tenant-data.ts so future editability layers have a starting point.
  // In fossilize mode, pages[] carries the source HTML filenames; blocks is empty.
  const pages: PageDef[] = fossilResult.htmlPages.map((h) => {
    const src = opts.ingestion.pages.find((p) => p.route === h.route);
    return {
      slug: h.route,
      title: src?.meta.title ?? h.route,
      description: src?.meta.description,
      dataPage: slugify(h.route),
      blocks: [],
    };
  });

  await fs.writeFile(
    path.join(opts.tenantDir, "src/data/tenant-data.ts"),
    emitTenantData({
      pages,
      blog,
      testimonial,
      team,
      service,
      siteName: opts.siteName,
      lang: opts.lang,
      dir: opts.dir,
      navigation: pages.map((p) => ({ label: p.title, href: p.slug })),
    }),
  );
  opts.log(`wrote tenant-data.ts (fossilize mode — blocks empty, pages reference public/ HTML)`);

  // Rename package so workspace installs stay isolated.
  const pkgPath = path.join(opts.tenantDir, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
  pkg.name = `@hostaposta/tenant-${path.basename(opts.tenantDir)}`;
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  return {
    tenantDir: opts.tenantDir,
    mode: "fossilize",
    pagesCount: fossilResult.htmlPages.length,
    filesWritten: fossilResult.filesWritten,
    editsCarved,
    editsApplied,
    collectionsCount: {
      blog: blog.length,
      testimonial: testimonial.length,
      team: team.length,
      service: service.length,
    },
    assetsCopied: fossilResult.assetsCopied,
    warnings: fossilResult.warnings,
  };
}

// ── pixel-rewrite path (retained; not the default) ────────────────────────

async function runPixelRewrite(opts: RunInternal): Promise<GenerateResult> {
  let assetsCopiedCount = 0;
  let assetRemap = new Map<string, string>();
  if (opts.sourceBuildRoot) {
    const copyResult = await copyAssets({
      ingestion: opts.ingestion,
      sourceBuildRoot: opts.sourceBuildRoot,
      tenantDir: opts.tenantDir,
      log: opts.log,
    });
    assetsCopiedCount = copyResult.copied.length;
    assetRemap = copyResult.remap;
  }

  // Clear pristine template blocks — generator writes tenant-specific ones.
  await fs.rm(path.join(opts.tenantDir, "src/components/blocks/tenant"), {
    recursive: true,
    force: true,
  });

  opts.log(`pixel-rewrite: generating per-tenant blocks for ${opts.ingestion.pages.length} pages`);
  const pixelResult = await generatePixelBlocks({
    ingestion: opts.ingestion,
    tokens: opts.tokens,
    collections: opts.collections,
    siteName: opts.siteName,
    tenantDir: opts.tenantDir,
    useVision: opts.useVision ?? true,
    log: opts.log,
  });
  for (const w of pixelResult.warnings) opts.log(`warn: ${w}`);

  const pages: PageDef[] = pixelResult.pages.map((pr) => {
    const src = opts.ingestion.pages.find((p) => p.route === pr.route);
    return {
      slug: pr.route,
      title: cleanTitle(src?.meta.title ?? pr.route, opts.siteName),
      description: src?.meta.description,
      dataPage: slugify(pr.route),
      blocks: pr.blocks.length > 0
        ? applyAssetRemap(pr.blocks, assetRemap)
        : [{ componentName: "__MissingContent", props: { message: `No content for ${pr.route}` } }],
    };
  });

  const extract = <T,>(slug: string): T[] => {
    const col = opts.collections.detectedCollections.find((c) => c.type === slug);
    if (!col) return [];
    return col.entries.map((e) => applyAssetRemap(e.data as T, assetRemap));
  };

  const blog = extract<BlogPost>("blog");
  const testimonial = extract<Testimonial>("testimonial");
  const team = extract<TeamMember>("team");
  const service = extract<Service>("service");

  await fs.writeFile(
    path.join(opts.tenantDir, "src/data/tenant-data.ts"),
    emitTenantData({
      pages,
      blog,
      testimonial,
      team,
      service,
      siteName: opts.siteName,
      lang: opts.lang,
      dir: opts.dir,
      navigation: pages.map((p) => ({ label: p.title, href: p.slug })),
    }),
  );
  await ensureFallbackComponent(opts.tenantDir);

  const pkgPath = path.join(opts.tenantDir, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
  pkg.name = `@hostaposta/tenant-${path.basename(opts.tenantDir)}`;
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  return {
    tenantDir: opts.tenantDir,
    mode: "pixel-rewrite",
    pagesCount: pages.length,
    blockInstancesCount: pages.reduce((n, p) => n + p.blocks.length, 0),
    componentsWritten: pixelResult.componentsWritten,
    collectionsCount: {
      blog: blog.length,
      testimonial: testimonial.length,
      team: team.length,
      service: service.length,
    },
    assetsCopied: assetsCopiedCount,
    warnings: pixelResult.warnings,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureFallbackComponent(tenantDir: string): Promise<void> {
  const p = path.join(tenantDir, "src/components/blocks/tenant/__MissingContent.astro");
  const content = `---
interface Props { message?: string }
const { message = 'No content' } = Astro.props;
---
<section style="padding:4rem 2rem; text-align:center; color:#999; font-family:monospace; font-size:0.875rem;">
  {message}
</section>
`;
  try {
    await fs.access(p);
  } catch {
    await fs.writeFile(p, content);
  }
}

/** Normalize asset-looking strings in a collection entry (e.g. service.icon)
 *  to absolute /-rooted paths so the fossilized site's source HTML and
 *  tenant-data.ts both resolve the same files. */
function normalizeEntryPaths(data: Record<string, unknown>): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (/^(https?:|\/\/|#|data:|mailto:|tel:)/i.test(v) || v.startsWith("/")) return v;
      // Heuristic: looks like a file path (has an extension, no spaces)
      if (/^[\w./-]+\.[a-z0-9]{2,5}$/i.test(v)) return "/" + v.replace(/^\.\/+/, "");
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries(v)) out[k] = walk(vv);
      return out;
    }
    return v;
  };
  return walk(data) as Record<string, unknown>;
}

function inferSiteName(origin: string): string {
  return origin
    .replace(/\.zip$/i, "")
    .replace(/-main$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(route: string): string {
  if (route === "/" || route === "") return "home";
  return route.replace(/^\/+|\/+$/g, "").replace(/\//g, "-") || "home";
}

function cleanTitle(raw: string, siteName: string): string {
  const cleaned = raw
    .replace(new RegExp(`\\s*[\\|\\—\\-]\\s*${escapeRegExp(siteName)}$`, "i"), "")
    .replace(new RegExp(`^${escapeRegExp(siteName)}\\s*[\\|\\—\\-]\\s*`, "i"), "")
    .trim();
  return cleaned || raw;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferLangDir(collections: CollectionExtractionResult): { lang: string; dir: "ltr" | "rtl" } {
  const sample: string[] = [];
  for (const col of collections.detectedCollections) {
    for (const e of col.entries.slice(0, 3)) {
      for (const k of ["title", "quote", "name", "description", "question"]) {
        const v = (e.data as Record<string, unknown>)[k];
        if (typeof v === "string") sample.push(v);
      }
    }
  }
  const text = sample.join(" ").slice(0, 2000);
  if (!text) return { lang: "en", dir: "ltr" };
  const hebrew = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const total = text.length;
  if (hebrew / total > 0.2) return { lang: "he", dir: "rtl" };
  if (arabic / total > 0.2) return { lang: "ar", dir: "rtl" };
  return { lang: "en", dir: "ltr" };
}
