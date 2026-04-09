/**
 * Preview Server
 *
 * Serves the imported project on a dedicated port (default 3002), mounted at /.
 * Isolated origin so root-relative asset paths, router basenames, and fetch()
 * calls all resolve correctly — same as production deployment.
 *
 * Maps to {project-id}.preview.hostaposta.app in production SaaS.
 */

import express from 'express';
import path from 'path';
import fs, { existsSync } from 'fs';
import { getProjectState } from './state.js';

export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 3002);

// ─── ES module script fixer ───────────────────────────────────────────────────
//
// Vanilla-HTML projects often load ES module files as classic scripts (no
// type="module"), which causes SyntaxError in the browser. At serve-time
// we peek at each external script file — if it contains import/export syntax
// we inject type="module". Source files are never touched.

function fixModuleScripts(html: string, serveRoot: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (match, attrs: string) => {
    if (/\btype\s*=/i.test(attrs)) return match;

    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!srcMatch) return match;
    const src = srcMatch[1];

    if (src.startsWith('http') || src.startsWith('//')) return match;
    if (!src.endsWith('.js') && !src.endsWith('.mjs')) return match;

    const filePath = path.join(serveRoot, src.startsWith('/') ? src.slice(1) : src);
    if (!existsSync(filePath)) return match;

    try {
      const fd  = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(4096);
      const n   = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      const head     = buf.slice(0, n).toString('utf-8');
      const isModule = /(?:^|\n)\s*(?:export\s|import\s)/m.test(head);
      if (isModule) return `<script${attrs} type="module">`;
    } catch { /* ignore */ }

    return match;
  });
}

// ─── HTML file resolver ───────────────────────────────────────────────────────

function resolveHtmlFile(serveRoot: string, reqPath: string): string | null {
  const p = reqPath === '' ? '/' : reqPath;
  const candidates: string[] = [];

  if (p === '/') {
    candidates.push(path.join(serveRoot, 'index.html'));
  } else if (p.endsWith('.html')) {
    candidates.push(path.join(serveRoot, p));
  } else {
    candidates.push(path.join(serveRoot, p + '.html'));
    candidates.push(path.join(serveRoot, p, 'index.html'));
  }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// ─── Preview app factory ──────────────────────────────────────────────────────

export function createPreviewApp(): express.Application {
  const app = express();

  // Allow cross-origin iframe embedding
  app.use((_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  let cachedRoot: string | null = null;
  let staticHandler: express.RequestHandler | null = null;

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const state = getProjectState();
    if (!state) {
      res.status(503).send('No project loaded. Upload a project first.');
      return;
    }

    const rawRoot  = state.servePath || state.projectRoot;
    const serveRoot = existsSync(rawRoot) ? rawRoot : state.projectRoot;

    if (serveRoot !== cachedRoot) {
      cachedRoot = serveRoot;
      staticHandler = express.static(serveRoot, {
        setHeaders: (_res, filePath) => {
          if (filePath.endsWith('.html')) _res.setHeader('Cache-Control', 'no-store');
        },
      });
    }

    const archetypeId  = state.archetypeId;
    const isVanillaHtml = !archetypeId || archetypeId === 'vanilla-html';

    // ── HTML: intercept before express.static to apply fixes ─────────
    const htmlFile = resolveHtmlFile(serveRoot, req.path);
    if (htmlFile) {
      try {
        let html = fs.readFileSync(htmlFile, 'utf-8');
        if (isVanillaHtml) html = fixModuleScripts(html, serveRoot);
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').end(html);
      } catch (err) {
        next(err);
      }
      return;
    }

    // ── Non-HTML assets ───────────────────────────────────────────────
    staticHandler!(req, res, () => {
      // SPA fallback: serve index.html for unmatched routes
      const indexPath = path.join(serveRoot, 'index.html');
      if (existsSync(indexPath)) {
        try {
          let html = fs.readFileSync(indexPath, 'utf-8');
          if (isVanillaHtml) html = fixModuleScripts(html, serveRoot);
          res.setHeader('Cache-Control', 'no-store');
          res.type('html').end(html);
        } catch (err) {
          next(err);
        }
        return;
      }
      next();
    });
  });

  return app;
}
