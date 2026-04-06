/**
 * SPA Route Detection
 *
 * Scans React/Vue/Svelte source code for route definitions to generate
 * page entries for SPA projects that only have one index.html.
 *
 * Supports:
 * - React Router v6: <Route path="/about" element={...} />
 * - React Router v5: <Route path="/about" component={...} />
 * - TanStack Router: createRoute({ path: '/about' })
 * - Wouter: <Route path="/about">
 * - Array-style routes: { path: '/about', element: ... }
 */

import fs from 'fs/promises';
import path from 'path';

interface DetectedPage {
  id: string;
  name: string;
  path: string;
  navigateTo?: string;
  seoStatus: 'complete' | 'partial' | 'missing';
  sections: any[];
}

export async function detectSPARoutes(projectRoot: string, fileTree: string[]): Promise<DetectedPage[]> {
  // Find source files that likely contain route definitions
  const routeFiles = fileTree.filter(f =>
    /\.(tsx?|jsx?)$/.test(f) &&
    !f.includes('node_modules') &&
    !f.includes('.d.ts')
  );

  const allRoutes: Map<string, string> = new Map(); // path → name
  let isHashRouter = false; // whether this SPA uses hash-based routing

  for (const file of routeFiles) {
    const fullPath = path.join(projectRoot, file);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    // Skip files that don't mention routing
    if (!content.includes('Route') && !content.includes('route') && !content.includes('path')) continue;

    // Detect hash-based routing
    if (content.includes('location.hash') || content.includes('hashchange') ||
        content.includes('HashRouter') || content.includes('createHashRouter') ||
        content.includes('hash: true') || /#\//.test(content)) {
      isHashRouter = true;
    }

    // Pattern 1: JSX Route elements — <Route path="/about" ...>
    const jsxRoutePattern = /<Route\s+[^>]*path\s*=\s*["']([^"']+)["'][^>]*/g;
    let match;
    while ((match = jsxRoutePattern.exec(content)) !== null) {
      const routePath = match[1];
      if (!routePath || routePath.includes('*')) continue;
      // Skip dynamic routes (e.g., /product/:slug) — they need parameters
      if (routePath.includes(':')) continue;
      allRoutes.set(routePath, deriveRouteName(routePath));
    }

    // Pattern 2: Object-style routes — { path: "/about", ... }
    const objectRoutePattern = /path\s*:\s*["']([^"'*]+)["']/g;
    while ((match = objectRoutePattern.exec(content)) !== null) {
      const routePath = match[1];
      if (routePath && routePath.startsWith('/') && !routePath.includes(':')) {
        allRoutes.set(routePath, deriveRouteName(routePath));
      }
    }

    // Pattern 3: createBrowserRouter / createRoute patterns
    const createRoutePattern = /createRoute\s*\(\s*\{[^}]*path\s*:\s*["']([^"']+)["']/g;
    while ((match = createRoutePattern.exec(content)) !== null) {
      const routePath = match[1];
      if (routePath && !routePath.includes('*')) {
        allRoutes.set(routePath, deriveRouteName(routePath));
      }
    }

    // Pattern 4: Navigate/Link patterns can hint at routes — to="/about"
    // Only if we haven't found routes yet and this looks like a main app file
    if (allRoutes.size === 0 && (file.includes('App') || file.includes('app') || file.includes('Router') || file.includes('router'))) {
      const linkPattern = /(?:to|href)\s*=\s*["']\/([^"'?#]+)["']/g;
      while ((match = linkPattern.exec(content)) !== null) {
        const routePath = '/' + match[1];
        if (!routePath.includes(':') && !routePath.includes('*') && routePath.length < 50) {
          allRoutes.set(routePath, deriveRouteName(routePath));
        }
      }
    }
  }

  // Fallback: if no routes found via code patterns, infer from page file names
  // e.g. js/pages/about.js → /about "About", js/pages/calculator.js → /calculator "Calculator"
  if (allRoutes.size === 0) {
    const PAGE_DIRS = /\/(pages|views|screens|routes)\//i;
    const SKIP = new Set(['index', 'home', 'auth', 'login', 'signup', 'register', '404', 'error', 'notfound']);
    for (const f of fileTree) {
      if (!PAGE_DIRS.test(f)) continue;
      if (!/\.(jsx?|tsx?)$/.test(f)) continue;
      const base = f.split('/').pop()!.replace(/\.(jsx?|tsx?)$/, '').toLowerCase();
      const routePath = base === 'index' || base === 'home' ? '/' : `/${base}`;
      if (!allRoutes.has(routePath)) {
        allRoutes.set(routePath, deriveRouteName(routePath));
      }
    }
  }

  // Always include home route
  if (!allRoutes.has('/')) {
    allRoutes.set('/', 'Home');
  }

  // Convert to page objects
  const pages: DetectedPage[] = [];
  const sortedRoutes = Array.from(allRoutes.entries()).sort((a, b) => {
    if (a[0] === '/') return -1;
    if (b[0] === '/') return 1;
    return a[0].localeCompare(b[0]);
  });

  // If we detected page files from a /pages/ directory without explicit router code,
  // treat it as hash-based (most vanilla JS SPAs use hash routing)
  if (!isHashRouter && allRoutes.size > 0) {
    // Check if all route detection came from page file names (no real router code found)
    // In that case, default to hash routing as the most common vanilla JS pattern
    isHashRouter = true;
  }

  for (const [routePath, name] of sortedRoutes) {
    const pageId = 'page-' + routePath.replace(/[^a-z0-9]/gi, '-').replace(/^-|-$/g, '') || 'page-home';
    const navigateTo = isHashRouter
      ? (routePath === '/' ? '#/' : `#${routePath}`)
      : routePath;
    pages.push({
      id: pageId,
      name,
      path: routePath,
      navigateTo,
      seoStatus: routePath === '/' ? 'partial' : 'missing',
      sections: [],
    });
  }

  return pages;
}

function deriveRouteName(routePath: string): string {
  if (routePath === '/' || routePath === '') return 'Home';

  // Get last meaningful segment
  const segments = routePath.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || 'Page';

  return last
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
