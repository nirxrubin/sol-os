/**
 * Parse a built static output into a normalized set of pages, assets, and
 * routes. Framework-agnostic — operates on the rendered HTML, not source.
 *
 * Produces the bulk of `IngestionResult`. Token extraction + collection
 * parsing happen downstream from this output.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { ParsedAsset, ParsedPage, RouteNode } from "./types.js";

export interface ParseResult {
  pages: ParsedPage[];
  assets: ParsedAsset[];
  routes: { tree: RouteNode | null; patterns: string[] };
  warnings: string[];
}

/**
 * Walk the built output directory; for every .html file, extract the page
 * info; aggregate referenced assets; build the route tree.
 */
export async function parseBuildOutput(buildOutputPath: string): Promise<ParseResult> {
  const warnings: string[] = [];

  if (!existsSync(buildOutputPath)) {
    return {
      pages: [],
      assets: [],
      routes: { tree: null, patterns: [] },
      warnings: [`Build output path does not exist: ${buildOutputPath}`],
    };
  }

  const htmlFiles = await findFiles(buildOutputPath, /\.html?$/i);
  const cssFiles = await findFiles(buildOutputPath, /\.css$/i);

  // Pre-load CSS — most static builds inline a small set of stylesheets we
  // can attach to all pages. Concatenate them for the per-page CSS field.
  const aggregatedCss = await loadAndConcat(cssFiles);

  const pages: ParsedPage[] = [];
  const assetsMap = new Map<string, ParsedAsset>();

  for (const htmlFile of htmlFiles) {
    const route = htmlFileToRoute(htmlFile, buildOutputPath);
    let html: string;
    try {
      html = await fs.readFile(htmlFile, "utf-8");
    } catch {
      warnings.push(`Failed to read ${htmlFile}`);
      continue;
    }

    const $ = cheerio.load(html);

    // Inline + linked CSS specific to this page
    const pageCss: string[] = [];
    $("style").each((_i, el) => {
      pageCss.push($(el).html() ?? "");
    });

    // Meta
    const meta: ParsedPage["meta"] = {
      title: $("title").first().text().trim() || undefined,
      description: $('meta[name="description"]').attr("content") || undefined,
      ogType: $('meta[property="og:type"]').attr("content") || undefined,
      ogImage: $('meta[property="og:image"]').attr("content") || undefined,
      canonical: $('link[rel="canonical"]').attr("href") || undefined,
    };

    // JSON-LD
    const jsonLd: unknown[] = [];
    $('script[type="application/ld+json"]').each((_i, el) => {
      const text = $(el).html();
      if (!text) return;
      try {
        jsonLd.push(JSON.parse(text));
      } catch {
        // ignore malformed
      }
    });

    // Asset discovery (images, videos)
    $("img").each((_i, el) => {
      const src = $(el).attr("src");
      if (!src) return;
      registerAsset(assetsMap, src, "image", `<img> on ${route}`, buildOutputPath);
    });
    $("source").each((_i, el) => {
      const src = $(el).attr("src");
      if (!src) return;
      const parent = $(el).parent().get(0)?.tagName?.toLowerCase();
      const type = parent === "video" ? "video" : "image";
      registerAsset(assetsMap, src, type, `<source> on ${route}`, buildOutputPath);
    });
    $("video").each((_i, el) => {
      const src = $(el).attr("src");
      if (!src) return;
      registerAsset(assetsMap, src, "video", `<video> on ${route}`, buildOutputPath);
    });
    $('link[rel="icon"], link[rel="apple-touch-icon"]').each((_i, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      registerAsset(assetsMap, href, "image", `favicon on ${route}`, buildOutputPath);
    });

    pages.push({
      route,
      html: $("body").html() ?? "",
      css: [aggregatedCss, ...pageCss].filter(Boolean).join("\n\n"),
      jsonLd: jsonLd.length ? jsonLd : undefined,
      meta,
    });
  }

  // Extract any background-image URLs from the aggregated CSS as additional
  // asset references — common pattern for hero/decoration imagery.
  const bgImageRegex = /url\(["']?([^)"']+)["']?\)/g;
  let m: RegExpExecArray | null;
  while ((m = bgImageRegex.exec(aggregatedCss)) !== null) {
    const u = m[1];
    if (!u || u.startsWith("data:")) continue;
    registerAsset(assetsMap, u, "image", "CSS background-image", buildOutputPath);
  }

  const assets = Array.from(assetsMap.values());
  const routes = buildRouteTree(pages.map((p) => p.route));

  if (pages.length === 0) {
    warnings.push("No HTML pages found in build output");
  }

  return { pages, assets, routes, warnings };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function htmlFileToRoute(filePath: string, buildRoot: string): string {
  const rel = path.relative(buildRoot, filePath).replace(/\\/g, "/");
  // index.html → /
  // about/index.html → /about
  // blog/post.html → /blog/post
  // 404.html → /404
  let route = "/" + rel.replace(/\.html?$/i, "");
  route = route.replace(/\/index$/, "");
  if (route === "") route = "/";
  return route;
}

function registerAsset(
  map: Map<string, ParsedAsset>,
  url: string,
  type: ParsedAsset["type"],
  context: string,
  buildRoot: string,
): void {
  if (map.has(url)) return;
  const localPath =
    url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")
      ? undefined
      : path.join(buildRoot, url.replace(/^\//, ""));
  map.set(url, { url, localPath, type, context });
}

async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (pattern.test(entry.name)) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

async function loadAndConcat(files: string[]): Promise<string> {
  const parts: string[] = [];
  for (const f of files) {
    try {
      parts.push(await fs.readFile(f, "utf-8"));
    } catch {
      // ignore
    }
  }
  return parts.join("\n\n");
}

function buildRouteTree(routes: string[]): { tree: RouteNode | null; patterns: string[] } {
  if (routes.length === 0) return { tree: null, patterns: [] };

  const root: RouteNode = { segment: "", route: "/", isIndex: true, isDynamic: false, children: [] };

  for (const route of routes.sort()) {
    if (route === "/") continue;
    const segments = route.split("/").filter(Boolean);
    let cursor = root;
    let acc = "";
    for (const seg of segments) {
      acc += "/" + seg;
      let child = cursor.children.find((c) => c.segment === seg);
      if (!child) {
        child = {
          segment: seg,
          route: acc,
          isIndex: false,
          isDynamic: /^\[.+\]$|^:.+$/.test(seg),
          children: [],
        };
        cursor.children.push(child);
      }
      cursor = child;
    }
  }

  // Pattern detection — naive: any folder with siblings that look like leaves
  // is a candidate dynamic route (e.g. /blog has /blog/post-a, /blog/post-b → /blog/:slug).
  const patterns = detectPatterns(root);

  return { tree: root, patterns };
}

function detectPatterns(node: RouteNode, acc: string[] = []): string[] {
  const leafChildren = node.children.filter((c) => c.children.length === 0);
  if (leafChildren.length >= 3 && node.route !== "/") {
    acc.push(`${node.route}/:slug`);
  }
  for (const child of node.children) {
    detectPatterns(child, acc);
  }
  return acc;
}
