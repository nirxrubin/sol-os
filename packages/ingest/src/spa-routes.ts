/**
 * Route discovery for SPA archetypes (vite-react, vite-vue, cra).
 *
 * The built output of a React/Vue SPA is a single `dist/index.html` shell —
 * the actual routes exist only at runtime. To render them for parsing we
 * first need the route list. Two strategies:
 *
 *  1. Regex-scan the router config (App.tsx / main.tsx / pages/_app.tsx /
 *     router/index.ts) for `path="..."` and `path: "..."` patterns.
 *  2. Filename-convention fallback: enumerate `src/pages/*.{tsx,jsx,vue}`
 *     and map filenames to routes (Home.tsx → /, About.tsx → /about, etc).
 *
 * Always includes `/` as a route.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ArchetypeId } from "./types.js";

// Covers both single-package layouts (src/*) and fullstack monorepo layouts
// that nest the frontend under client/ or web/ (vite + express pattern).
const ROUTER_FILE_STEMS = [
  "App.tsx",
  "App.jsx",
  "App.vue",
  "main.tsx",
  "main.jsx",
  "main.ts",
  "main.js",
  "router.tsx",
  "router.ts",
  "router/index.ts",
  "router/index.tsx",
  "routes.tsx",
  "routes.ts",
];
const APP_ROOTS = ["", "client/", "web/", "frontend/", "apps/web/"];
const ROUTER_FILE_CANDIDATES = [
  ...APP_ROOTS.flatMap((r) => ROUTER_FILE_STEMS.map((s) => `${r}src/${s}`)),
  "App.tsx",
  "App.jsx",
];

const PAGES_DIR_CANDIDATES = [
  ...APP_ROOTS.flatMap((r) => [`${r}src/pages`, `${r}src/routes`]),
  "pages",
];

export function isSpaArchetype(archetype: ArchetypeId): boolean {
  return archetype === "vite-react" || archetype === "vite-vue" || archetype === "cra";
}

export interface DiscoveredRoutes {
  routes: string[];
  source: "router-config" | "pages-filename" | "default";
  scannedFiles: string[];
}

export async function discoverSpaRoutes(projectRoot: string): Promise<DiscoveredRoutes> {
  const scannedFiles: string[] = [];

  // Strategy 1: router config scan
  const configRoutes = await scanRouterConfig(projectRoot, scannedFiles);
  if (configRoutes.length > 0) {
    return {
      routes: normalize(configRoutes),
      source: "router-config",
      scannedFiles,
    };
  }

  // Strategy 2: pages filename enumeration
  const pageRoutes = await scanPagesDir(projectRoot, scannedFiles);
  if (pageRoutes.length > 0) {
    return {
      routes: normalize(pageRoutes),
      source: "pages-filename",
      scannedFiles,
    };
  }

  // Default: just the homepage
  return { routes: ["/"], source: "default", scannedFiles };
}

async function scanRouterConfig(projectRoot: string, scannedFiles: string[]): Promise<string[]> {
  const routes = new Set<string>();

  for (const candidate of ROUTER_FILE_CANDIDATES) {
    const full = path.join(projectRoot, candidate);
    if (!existsSync(full)) continue;
    scannedFiles.push(candidate);
    let content: string;
    try {
      content = await fs.readFile(full, "utf-8");
    } catch {
      continue;
    }

    // React Router v6 / wouter: <Route path="/..." /> or <Route path={"/..."} />
    // wouter idiomatically wraps the path literal in a JSX expression container.
    const reactRouteRe = /<Route[^>]*\bpath\s*=\s*\{?\s*["'`]([^"'`]+)["'`]\s*\}?/g;
    let m: RegExpExecArray | null;
    while ((m = reactRouteRe.exec(content)) !== null) {
      routes.add(m[1]!);
    }

    // createBrowserRouter / createRouter: { path: "/...", ... }
    const objectRouteRe = /\bpath\s*:\s*["'`]([^"'`]+)["'`]/g;
    while ((m = objectRouteRe.exec(content)) !== null) {
      routes.add(m[1]!);
    }

    // Vue Router: path: '/...'
    // (same regex catches it)
  }

  return Array.from(routes);
}

async function scanPagesDir(projectRoot: string, scannedFiles: string[]): Promise<string[]> {
  const routes = new Set<string>();

  for (const dir of PAGES_DIR_CANDIDATES) {
    const full = path.join(projectRoot, dir);
    if (!existsSync(full)) continue;

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(full, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      if (!/\.(tsx?|jsx?|vue)$/.test(entry.name)) continue;
      scannedFiles.push(path.join(dir, entry.name));

      const base = entry.name.replace(/\.(tsx?|jsx?|vue)$/, "");
      // Home/Index → /
      if (/^(Home|Index|Landing|index)$/i.test(base)) {
        routes.add("/");
        continue;
      }
      // NotFound/404 → skip, static servers 404 naturally
      if (/^(404|NotFound)$/i.test(base)) continue;

      // Filename → kebab-case route: AboutUs.tsx → /about-us
      const route = "/" + base
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[_\s]+/g, "-")
        .toLowerCase();
      routes.add(route);
    }
  }

  return Array.from(routes);
}

function normalize(routes: string[]): string[] {
  const set = new Set<string>();
  for (const r of routes) {
    // skip dynamic / wildcard for now
    if (/[:*]/.test(r)) continue;
    // skip trailing wildcards like /*
    if (r === "*") continue;
    // strip trailing slash except root
    const trimmed = r.length > 1 && r.endsWith("/") ? r.slice(0, -1) : r;
    set.add(trimmed);
  }
  if (!set.has("/")) set.add("/");
  // Stable sort: / first, then alphabetical
  return Array.from(set).sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
}
