/**
 * Headless render an SPA build. For each discovered route:
 *   1. Serve dist/ via a tiny local HTTP server with SPA fallback (404 → index.html)
 *   2. Navigate Playwright's Chromium to the route
 *   3. Wait for hydration (network-idle + short settle)
 *   4. Capture the rendered HTML
 *   5. Write it to a new output dir structured so parseBuildOutput() treats
 *      each captured route as its own page
 *
 * Output dir layout (mirrors Astro/Next-export, which parseBuildOutput already
 * handles):
 *   renderedDir/
 *     index.html           ← route /
 *     about/index.html     ← route /about
 *     team/index.html      ← route /team
 *     assets/…             ← copied from dist/
 *
 * Returns the path to this dir — caller feeds it into parseBuildOutput().
 */

import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";

export interface RenderOptions {
  /** Path to the built dist/ directory. */
  buildOutputPath: string;
  /** Where to write the rendered output tree. */
  renderedOutputPath: string;
  /** Routes to render (from spa-routes.ts). */
  routes: string[];
  /** Per-route timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** Extra settle time after networkidle, in ms. Default 400. */
  settleMs?: number;
  log?: (msg: string) => void;
}

export interface RenderResult {
  renderedOutputPath: string;
  renderedRoutes: Array<{ route: string; ok: boolean; bytes: number; screenshot?: string; error?: string }>;
}

export async function renderSpa(opts: RenderOptions): Promise<RenderResult> {
  const log = opts.log ?? ((m) => console.log(`[render] ${m}`));
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const settleMs = opts.settleMs ?? 400;

  // Reset + prepare output dir
  await fs.rm(opts.renderedOutputPath, { recursive: true, force: true });
  await fs.mkdir(opts.renderedOutputPath, { recursive: true });

  // Copy all non-html assets from dist/ → renderedOutputPath. We'll overwrite
  // index.html and write additional per-route html files.
  await copyDir(opts.buildOutputPath, opts.renderedOutputPath, (rel) => !rel.endsWith(".html"));

  // Start static server
  const server = createStaticServer(opts.buildOutputPath);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  log(`static server on ${base}`);

  let browser: Browser | null = null;
  const renderedRoutes: RenderResult["renderedRoutes"] = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
    const page = await context.newPage();

    const screenshotsDir = path.join(opts.renderedOutputPath, "__screenshots");
    await fs.mkdir(screenshotsDir, { recursive: true });

    for (const route of opts.routes) {
      const url = base + route;
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
        await page.waitForTimeout(settleMs);
        const html = await page.content();

        // Full-page screenshot so Block Generator can see what each section
        // actually renders as — vision input is what gets us from "content
        // fidelity" to "visual fidelity".
        const screenshotName = route === "/" ? "home.png" : route.replace(/^\//, "").replace(/\//g, "__") + ".png";
        const screenshotPath = path.join(screenshotsDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const outPath = routeToOutputFile(opts.renderedOutputPath, route);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, html);

        renderedRoutes.push({ route, ok: true, bytes: html.length, screenshot: screenshotPath });
        log(`rendered ${route} → ${path.relative(opts.renderedOutputPath, outPath)} (${html.length} bytes, shot saved)`);
      } catch (err) {
        const error = (err as Error).message.slice(0, 200);
        renderedRoutes.push({ route, ok: false, bytes: 0, error });
        log(`FAILED ${route}: ${error}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return { renderedOutputPath: opts.renderedOutputPath, renderedRoutes };
}

// ─── tiny static server with SPA fallback ─────────────────────────────────

function createStaticServer(rootDir: string): Server {
  const resolvedRoot = path.resolve(rootDir);
  const indexPath = path.join(resolvedRoot, "index.html");

  return createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    const candidatePath = path.join(resolvedRoot, urlPath);

    // Prevent path escape
    if (!candidatePath.startsWith(resolvedRoot)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    // Try: exact file → dir/index.html → SPA fallback to root index.html
    const tryPaths: string[] = [];
    if (!urlPath.endsWith("/")) tryPaths.push(candidatePath);
    tryPaths.push(path.join(candidatePath, "index.html"));
    tryPaths.push(indexPath);

    for (const p of tryPaths) {
      if (!existsSync(p)) continue;
      try {
        const stat = await fs.stat(p);
        if (!stat.isFile()) continue;
        res.statusCode = 200;
        res.setHeader("Content-Type", contentType(p));
        res.setHeader("Content-Length", String(stat.size));
        createReadStream(p).pipe(res);
        return;
      } catch {
        // fall through
      }
    }

    res.statusCode = 404;
    res.end("Not found");
  });
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js":
    case ".mjs": return "application/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    case ".ico": return "image/x-icon";
    case ".txt": return "text/plain; charset=utf-8";
    default: return "application/octet-stream";
  }
}

// ─── output path mapping ──────────────────────────────────────────────────

function routeToOutputFile(outRoot: string, route: string): string {
  // / → outRoot/index.html
  // /about → outRoot/about/index.html
  // /blog/my-post → outRoot/blog/my-post/index.html
  if (route === "/") return path.join(outRoot, "index.html");
  const segments = route.split("/").filter(Boolean);
  return path.join(outRoot, ...segments, "index.html");
}

// ─── directory copy with filter ───────────────────────────────────────────

async function copyDir(
  src: string,
  dest: string,
  filter: (relPath: string) => boolean,
): Promise<void> {
  async function walk(currentSrc: string, currentDest: string): Promise<void> {
    await fs.mkdir(currentDest, { recursive: true });
    const entries = await fs.readdir(currentSrc, { withFileTypes: true });
    for (const entry of entries) {
      const sp = path.join(currentSrc, entry.name);
      const dp = path.join(currentDest, entry.name);
      const rel = path.relative(src, sp);
      if (entry.isDirectory()) {
        await walk(sp, dp);
      } else if (filter(rel)) {
        await fs.copyFile(sp, dp);
      }
    }
  }
  await walk(src, dest);
}
