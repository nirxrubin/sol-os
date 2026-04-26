/**
 * Fossilize — split into two phases so editability can be layered between.
 *
 *   Phase A (collectFossilizedHtml): walk source build root, copy non-HTML
 *   assets to tenant/public/, return a map of route → rewritten HTML (NOT
 *   yet written as Astro pages).
 *
 *   Phase B (writeAstroPages): take a route → HTML map and emit each as
 *   `src/pages/<route>/index.astro` that injects the HTML verbatim via
 *   `<Fragment set:html>`.
 *
 * In between, callers can run carve (extract edit points) + apply-edits
 * (substitute current values) so the final pages reflect any edits.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { IngestionResult } from "@hostaposta/ingest";

export interface CollectFossilizedHtmlOptions {
  ingestion: IngestionResult;
  sourceBuildRoot: string;
  tenantDir: string;
  log?: (msg: string) => void;
}

export interface FossilizedCollection {
  /** route → rewritten source HTML */
  pagesHtml: Map<string, string>;
  /** Non-HTML files copied to public/. */
  assetsCopied: number;
  /** Source-relative HTML files that had no matching route (copied to public/). */
  orphanedHtml: string[];
  warnings: string[];
}

/**
 * Phase A: walk the source build output. Copy all non-HTML files to
 * tenant/public/. For HTML files matching known routes, rewrite relative
 * references to be rooted and return them in memory (ready for carve +
 * apply-edits).
 */
export async function collectFossilizedHtml(
  opts: CollectFossilizedHtmlOptions,
): Promise<FossilizedCollection> {
  const log = opts.log ?? ((m) => console.log(`[fossilize] ${m}`));
  const warnings: string[] = [];
  const publicDir = path.join(opts.tenantDir, "public");
  const pagesDir = path.join(opts.tenantDir, "src/pages");

  // Reset public/ and src/pages/ to a clean slate
  await fs.rm(publicDir, { recursive: true, force: true });
  await fs.mkdir(publicDir, { recursive: true });
  try {
    const entries = await fs.readdir(pagesDir);
    for (const entry of entries) {
      await fs.rm(path.join(pagesDir, entry), { recursive: true, force: true });
    }
  } catch {
    await fs.mkdir(pagesDir, { recursive: true });
  }

  const knownHtml = new Map<string, string>(); // sourceRelPath → route
  for (const p of opts.ingestion.pages) {
    const candidates = p.route === "/"
      ? ["index.html"]
      : [
          `${p.route.replace(/^\//, "")}.html`,
          `${p.route.replace(/^\//, "")}/index.html`,
        ];
    for (const c of candidates) {
      if (existsSync(path.join(opts.sourceBuildRoot, c))) {
        knownHtml.set(c, p.route);
        break;
      }
    }
  }

  const pagesHtml = new Map<string, string>();
  const orphanedHtml: string[] = [];
  let assetsCopied = 0;

  await walk(opts.sourceBuildRoot, async (absSrc) => {
    const relFromRoot = path.relative(opts.sourceBuildRoot, absSrc);
    if (!relFromRoot || relFromRoot.startsWith("..")) return;
    if (relFromRoot.startsWith("__screenshots") || relFromRoot.startsWith("__rendered")) return;

    const lower = relFromRoot.toLowerCase();

    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      const route = knownHtml.get(relFromRoot);
      if (!route) {
        // Unknown HTML — copy to public/ as-is (may be a template fragment)
        const destAbs = path.join(publicDir, relFromRoot);
        await fs.mkdir(path.dirname(destAbs), { recursive: true });
        await fs.copyFile(absSrc, destAbs);
        orphanedHtml.push(relFromRoot);
        return;
      }

      const html = await fs.readFile(absSrc, "utf-8");
      pagesHtml.set(route, rewriteRelativeRefs(html));
    } else {
      const destAbs = path.join(publicDir, relFromRoot);
      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      await fs.copyFile(absSrc, destAbs);
      assetsCopied += 1;
    }
  });

  log(`collected ${pagesHtml.size} source pages + copied ${assetsCopied} assets to public/${orphanedHtml.length > 0 ? ` (${orphanedHtml.length} orphan HTML)` : ""}`);
  return { pagesHtml, assetsCopied, orphanedHtml, warnings };
}

export interface WriteAstroPagesOptions {
  /** route → final HTML (post-edit-application). */
  pagesHtml: Map<string, string>;
  tenantDir: string;
  /** Tenant slug — injected into each page so the on-canvas editor knows
   *  which tenant to save edits against. Defaults to the tenantDir basename. */
  slug?: string;
  /** API URL the on-canvas editor talks to. Defaults to http://localhost:4000. */
  apiUrl?: string;
  /** Also save the pre-edit source HTML per route under
   *  `.hostaposta/source-html/<route>/index.html`. Enables fast rebuilds
   *  (apply-edits + rewrite pages) without re-running ingest/fossilize. */
  saveSourceHtml?: boolean;
  log?: (msg: string) => void;
}

export interface WriteAstroPagesResult {
  pagesWritten: Array<{ route: string; file: string }>;
}

/** Phase B: emit one Astro page per route. */
export async function writeAstroPages(
  opts: WriteAstroPagesOptions,
): Promise<WriteAstroPagesResult> {
  const log = opts.log ?? ((m) => console.log(`[fossilize] ${m}`));
  const pagesDir = path.join(opts.tenantDir, "src/pages");
  await fs.mkdir(pagesDir, { recursive: true });

  const slug = opts.slug ?? path.basename(opts.tenantDir);
  const apiUrl = opts.apiUrl ?? "http://localhost:4000";

  const sourceHtmlDir = path.join(opts.tenantDir, ".hostaposta/source-html");
  if (opts.saveSourceHtml) {
    await fs.mkdir(sourceHtmlDir, { recursive: true });
  }

  const pagesWritten: WriteAstroPagesResult["pagesWritten"] = [];

  for (const [route, html] of opts.pagesHtml) {
    const astroRel = route === "/"
      ? "index.astro"
      : path.posix.join(route.replace(/^\//, ""), "index.astro");
    const astroAbs = path.join(pagesDir, astroRel);
    await fs.mkdir(path.dirname(astroAbs), { recursive: true });
    await fs.writeFile(astroAbs, wrapHtmlAsAstroPage(html, { slug, apiUrl }));

    if (opts.saveSourceHtml) {
      const srcRel = route === "/"
        ? "index.html"
        : path.posix.join(route.replace(/^\//, ""), "index.html");
      const srcAbs = path.join(sourceHtmlDir, srcRel);
      await fs.mkdir(path.dirname(srcAbs), { recursive: true });
      await fs.writeFile(srcAbs, html);
    }

    pagesWritten.push({ route, file: astroRel });
  }

  log(`wrote ${pagesWritten.length} Astro pages${opts.saveSourceHtml ? " + source HTML sidecar" : ""}`);
  return { pagesWritten };
}

/**
 * Read back the source HTML saved by `writeAstroPages({ saveSourceHtml: true })`.
 * Used by the rebuild path in tenant-store when we want to re-apply edits
 * without running the full generate pipeline.
 */
export async function readSourceHtml(tenantDir: string): Promise<Map<string, string> | null> {
  const sourceHtmlDir = path.join(tenantDir, ".hostaposta/source-html");
  if (!existsSync(sourceHtmlDir)) return null;

  const result = new Map<string, string>();
  async function walkHtml(dir: string, routePrefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walkHtml(path.join(dir, entry.name), `${routePrefix}/${entry.name}`);
      } else if (entry.name === "index.html") {
        const html = await fs.readFile(path.join(dir, entry.name), "utf-8");
        const route = routePrefix === "" ? "/" : routePrefix;
        result.set(route, html);
      }
    }
  }
  await walkHtml(sourceHtmlDir, "");
  return result;
}

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * Wrap a full source HTML document into an Astro page file that outputs
 * the HTML verbatim via a `set:html` fragment, and loads the on-canvas
 * editor (zero-cost for visitors; only activates on ?hp-edit=1).
 */
function wrapHtmlAsAstroPage(
  html: string,
  opts: { slug: string; apiUrl: string },
): string {
  const escaped = html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  return `---
// Fossilized page — GENERATED by @hostaposta/generate.
// The source HTML below is served verbatim (with edits applied); Astro is just the host.
import OnCanvasEditor from '~/components/OnCanvasEditor.astro';
const SOURCE_HTML = \`${escaped}\`;
---
<Fragment set:html={SOURCE_HTML} />
<OnCanvasEditor slug=${JSON.stringify(opts.slug)} apiUrl=${JSON.stringify(opts.apiUrl)} />
`;
}

async function walk(dir: string, visit: (abs: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || (entry.name.startsWith(".") && entry.name !== ".well-known")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, visit);
    } else if (entry.isFile()) {
      await visit(abs);
    }
  }
}

/**
 * Rewrite relative href/src attributes in HTML to be absolute (rooted at /).
 */
function rewriteRelativeRefs(html: string): string {
  return html.replace(
    /(<(?:link|script|img|source|video|audio|iframe|a)\b[^>]*?\s(?:href|src|srcset|poster|data-src))=(["'])([^"']+)\2/gi,
    (_full, prefix, quote, value) => {
      if (prefix.toLowerCase().endsWith("srcset")) {
        const rewritten = value
          .split(",")
          .map((part: string) => {
            const [url, ...rest] = part.trim().split(/\s+/);
            return [rewriteOne(url), ...rest].join(" ");
          })
          .join(", ");
        return `${prefix}=${quote}${rewritten}${quote}`;
      }
      return `${prefix}=${quote}${rewriteOne(value)}${quote}`;
    },
  );
}

function rewriteOne(url: string): string {
  if (!url) return url;
  if (
    /^(https?:|\/\/|#|data:|mailto:|tel:|javascript:)/i.test(url) ||
    url.startsWith("/")
  ) {
    return url;
  }
  return "/" + url.replace(/^\.\/+/, "");
}
