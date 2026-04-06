/**
 * Preview Server
 *
 * Serves the imported project on a DEDICATED PORT (default 3002), mounted at /.
 *
 * Why a dedicated port instead of a /preview/ subpath?
 * ─────────────────────────────────────────────────────
 * Every web project is built assuming it lives at /. Serving at a subpath breaks:
 *   - Root-relative asset paths  (/css/style.css → 404)
 *   - Router basename            (React Router, Vue Router need base: '/')
 *   - CSS url() references       (url('/images/bg.png') → 404)
 *   - fetch() calls to own API   (/api/... resolves against wrong origin)
 *
 * Industry standard for SaaS website builders:
 *   - Vercel/Netlify: deploy-preview-123--site.netlify.app  (subdomain)
 *   - CodeSandbox:    abc123.csb.app                        (subdomain)
 *   - Local dev:      localhost:3002                        (port = isolated origin)
 *
 * This architecture maps cleanly to production: swap localhost:3002 for
 * {project-id}.preview.hostaposta.app when deploying as SaaS.
 *
 * Communication with the parent app (PageEditor) happens via postMessage,
 * which is cross-origin safe. Direct iframe.contentDocument DOM access
 * is intentionally not used for the preview path.
 */

import express from 'express';
import path from 'path';
import fs, { existsSync } from 'fs';
import { getProjectState, getWorkspacePath } from './state.js';

export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 3002);

// ─── CMS data injection ───────────────────────────────────────────────
//
// Reads .sol-cms.json from workspace and injects as window.__HP_DATA.
// The Phase 2 injector (engine/injector.ts) has already transformed source
// arrays to use: const products = (window as any).__HP_DATA?.products ?? [...];
//
// On every preview load:
//   1. Preview server reads the latest .sol-cms.json
//   2. Converts ContentType[] to { varName: item.data[] } flat record
//   3. Injects as <script>window.__HP_DATA = {...};</script> before </head>
//   4. React/Vue reads __HP_DATA on first render — no rebuild needed

interface CMSContentType {
  id: string;
  varName?: string;
  items?: { data: Record<string, unknown> }[];
}

function readCMSData(): Record<string, unknown[]> | null {
  try {
    const cmsPath = path.join(getWorkspacePath(), '.sol-cms.json');
    if (!fs.existsSync(cmsPath)) return null;
    const raw = fs.readFileSync(cmsPath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return null;
    const result: Record<string, unknown[]> = {};
    for (const ct of parsed as CMSContentType[]) {
      if (ct.varName && Array.isArray(ct.items)) {
        result[ct.varName] = ct.items.map(item => item.data ?? item);
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function buildHPDataScript(cmsData: Record<string, unknown[]>): string {
  return `<script>window.__HP_DATA=${JSON.stringify(cmsData)};</script>`;
}

// ─── HP bridge script ─────────────────────────────────────────────────
// Injected into every HTML response at serve-time (never written to source).
// Communicates with the parent PageEditor via postMessage (cross-origin safe).

const HP_BRIDGE_SCRIPT = `
<script id="__hp_bridge">
(function() {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  var editMode = false;
  var hoveredEl = null;
  var selectedEl = null;

  // ── CSS Selector (mirrors parent iframeEditorBridge.ts) ──────────
  function getCSSSelector(el) {
    // Lovable projects: lovable-tagger instruments every element with
    // data-component-id="ComponentName" — use it as a stable selector
    // that survives rebuilds and doesn't rely on DOM structure.
    var componentId = el.getAttribute && el.getAttribute('data-component-id');
    if (componentId) {
      return '[data-component-id="' + componentId.replace(/"/g, '\\"') + '"]';
    }

    var parts = [];
    var current = el;
    while (current && current.tagName && current !== document.documentElement) {
      var sel = current.tagName.toLowerCase();
      if (current.id && !/^[0-9]/.test(current.id) && !current.id.startsWith('solo-') && !current.id.startsWith('__')) {
        sel += '#' + current.id;
        parts.unshift(sel);
        break;
      }
      var parent = current.parentElement;
      if (parent) {
        var sameTag = Array.from(parent.children).filter(function(s) { return s.tagName === current.tagName; });
        if (sameTag.length > 1) sel += ':nth-of-type(' + (sameTag.indexOf(current) + 1) + ')';
      }
      parts.unshift(sel);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // ── Inject styles ─────────────────────────────────────────────────
  var style = document.createElement('style');
  style.id = '__sol_bridge_styles';
  style.textContent = [
    '.sol-editable-hover { outline: 1.5px dashed rgba(99,102,241,0.6) !important; outline-offset: 2px !important; cursor: pointer !important; transition: outline 0.1s; }',
    '.sol-editable-selected { outline: 2px solid rgb(99,102,241) !important; outline-offset: 2px !important; }',
    '[contenteditable="true"] { outline: 2px solid rgb(99,102,241) !important; outline-offset: 2px !important; caret-color: rgb(99,102,241); }',
    '#sol-tag-label { position: absolute; z-index: 99999; pointer-events: none; padding: 1px 6px; font: 700 10px/1.4 -apple-system,BlinkMacSystemFont,sans-serif; letter-spacing: .05em; color: #fff; background: rgb(99,102,241); border-radius: 2px 2px 0 0; white-space: nowrap; display: none; }',
    '.sol-edit-mode a { cursor: default !important; }',
    '.hp-cms-zone { position: relative; }',
    '.hp-edit-mode .hp-cms-zone { outline: 1.5px solid rgba(99,102,241,0.4) !important; outline-offset: 2px; border-radius: 3px; }',
    '.hp-edit-mode .hp-cms-badge { display: flex !important; }',
    '.hp-cms-badge { display: none; position: absolute; top: -10px; left: 0; z-index: 9000; align-items: center; gap: 3px; background: #6366f1; color: white; font-size: 9px; font-weight: 700; letter-spacing: .05em; padding: 1px 5px; border-radius: 3px 3px 3px 0; pointer-events: none; line-height: 14px; }',
  ].join('\\n');
  document.head.appendChild(style);

  // ── Tag label element ─────────────────────────────────────────────
  var tagLabel = document.createElement('div');
  tagLabel.id = 'sol-tag-label';
  document.body.appendChild(tagLabel);

  var TAG_NAMES = { H1:'H1', H2:'H2', H3:'H3', H4:'H4', H5:'H5', H6:'H6', P:'P', SPAN:'SPAN', A:'A', BUTTON:'BTN', LI:'LI', BLOCKQUOTE:'QUOTE', FIGCAPTION:'CAPTION', TD:'TD', TH:'TH', LABEL:'LABEL', IMG:'IMG' };
  var EDITABLE_SEL = 'h1,h2,h3,h4,h5,h6,p,span,a,button,li,blockquote,figcaption,label,img';

  function getTagName(el) { return TAG_NAMES[el.tagName] || el.tagName; }

  function positionTagLabel(el) {
    var rect = el.getBoundingClientRect();
    var scrollX = window.scrollX || 0;
    var scrollY = window.scrollY || 0;
    tagLabel.style.display = 'block';
    tagLabel.style.left = Math.max(0, rect.left + scrollX) + 'px';
    tagLabel.style.top = Math.max(0, rect.top + scrollY - 18) + 'px';
    tagLabel.textContent = getTagName(el);
  }

  function deselectEl() {
    if (!selectedEl) return;
    selectedEl.classList.remove('sol-editable-selected');
    if (selectedEl.tagName !== 'IMG') selectedEl.removeAttribute('contenteditable');
    selectedEl = null;
    tagLabel.style.display = 'none';
    window.parent.postMessage({ type: 'sol:element-deselected' }, '*');
  }

  // ── Navigation lock ───────────────────────────────────────────────
  // Override History API so client-side routers (Next.js, React Router, Vue Router)
  // cannot navigate away while in design mode.
  var origPushState = window.history.pushState.bind(window.history);
  var origReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function(state, title, url) {
    if (editMode) { window.parent.postMessage({ type: 'sol:navigate-requested', href: String(url || '') }, '*'); return; }
    return origPushState.call(window.history, state, title, url);
  };
  window.history.replaceState = function(state, title, url) {
    if (editMode) return;
    return origReplaceState.call(window.history, state, title, url);
  };

  // ── Click: navigation lock + element selection ─────────────────────
  document.addEventListener('click', function(e) {
    if (!editMode) return;

    // Block ALL outbound link navigation in design mode
    var anchor = e.target.closest('a');
    if (anchor) {
      var href = anchor.getAttribute('href') || '';
      if (href && href !== '#' && !href.startsWith('javascript')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (!href.startsWith('#')) {
          window.parent.postMessage({ type: 'sol:navigate-requested', href: href }, '*');
          return; // Don't continue to element select for nav links
        }
      }
    }

    // Element selection
    var target = e.target.closest(EDITABLE_SEL);
    if (!target) { if (selectedEl) deselectEl(); return; }

    e.preventDefault();
    e.stopPropagation();

    if (selectedEl && selectedEl !== target) deselectEl();

    selectedEl = target;
    target.classList.remove('sol-editable-hover');
    target.classList.add('sol-editable-selected');
    hoveredEl = null;
    positionTagLabel(target);

    if (target.tagName !== 'IMG') {
      target.setAttribute('contenteditable', 'true');
      target.focus();
    }

    var rect = target.getBoundingClientRect();
    window.parent.postMessage({
      type: 'sol:element-selected',
      selector: getCSSSelector(target),
      tagName: getTagName(target),
      isImage: target.tagName === 'IMG',
      isText: target.tagName !== 'IMG',
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    }, '*');
  }, true);

  // ── Hover ──────────────────────────────────────────────────────────
  document.addEventListener('mouseover', function(e) {
    if (!editMode) return;
    var target = e.target.closest(EDITABLE_SEL);
    if (hoveredEl && hoveredEl !== target) { hoveredEl.classList.remove('sol-editable-hover'); hoveredEl = null; }
    if (target && target !== selectedEl) { target.classList.add('sol-editable-hover'); hoveredEl = target; if (!selectedEl) positionTagLabel(target); }
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (!editMode) return;
    var target = e.target.closest(EDITABLE_SEL);
    if (target && target === hoveredEl) { target.classList.remove('sol-editable-hover'); hoveredEl = null; if (!selectedEl) tagLabel.style.display = 'none'; }
  }, true);

  // ── Input → report content change ─────────────────────────────────
  document.addEventListener('input', function(e) {
    if (!editMode || !selectedEl || e.target !== selectedEl) return;
    var rect = selectedEl.getBoundingClientRect();
    window.parent.postMessage({
      type: 'sol:content-change',
      selector: getCSSSelector(selectedEl),
      html: selectedEl.innerHTML,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    }, '*');
  }, true);

  // ── Block form submits in design mode ──────────────────────────────
  document.addEventListener('submit', function(e) {
    if (editMode) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ── ESC to deselect ────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && editMode && selectedEl) deselectEl();
  });

  // ── Scroll → update toolbar position ──────────────────────────────
  window.addEventListener('scroll', function() {
    if (!selectedEl) return;
    var rect = selectedEl.getBoundingClientRect();
    positionTagLabel(selectedEl);
    window.parent.postMessage({ type: 'sol:rect-update', rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } }, '*');
  }, { passive: true });

  // ── CMS zone annotation ────────────────────────────────────────────
  function annotateCMSZones() {
    var hpData = window.__HP_DATA;
    if (!hpData || typeof hpData !== 'object') return;
    Object.keys(hpData).forEach(function(varName) {
      var arr = hpData[varName];
      if (!Array.isArray(arr) || arr.length < 2) return;
      document.querySelectorAll('*').forEach(function(el) {
        if (el.hasAttribute('data-hp-cms')) return;
        var children = Array.from(el.children).filter(function(c) { return !c.classList.contains('hp-cms-badge'); });
        if (children.length === arr.length) {
          var tags = children.map(function(c) { return c.tagName; });
          if (tags.every(function(t) { return t === tags[0]; })) {
            el.setAttribute('data-hp-cms', varName);
            el.classList.add('hp-cms-zone');
            var badge = document.createElement('span');
            badge.className = 'hp-cms-badge';
            badge.textContent = 'CMS \\u00b7 ' + varName;
            el.style.position = el.style.position || 'relative';
            el.insertBefore(badge, el.firstChild);
          }
        }
      });
    });
  }

  // ── Messages from parent (PageEditor) ─────────────────────────────
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    switch (e.data.type) {

      case 'sol:edit-mode':
      case 'hp:edit-mode':
        editMode = !!e.data.enabled;
        document.body.classList.toggle('hp-edit-mode', editMode);
        document.body.classList.toggle('sol-edit-mode', editMode);
        if (!editMode) {
          deselectEl();
          if (hoveredEl) { hoveredEl.classList.remove('sol-editable-hover'); hoveredEl = null; }
          tagLabel.style.display = 'none';
        } else {
          setTimeout(annotateCMSZones, 200);
        }
        break;

      case 'sol:exec-format':
        // Parent sends formatting commands (bold, italic, etc.) to apply in iframe context
        if (selectedEl && selectedEl.tagName !== 'IMG' && e.data.command) {
          document.execCommand(e.data.command, false, e.data.value || null);
          var fRect = selectedEl.getBoundingClientRect();
          window.parent.postMessage({ type: 'sol:content-change', selector: getCSSSelector(selectedEl), html: selectedEl.innerHTML, rect: { top: fRect.top, left: fRect.left, width: fRect.width, height: fRect.height } }, '*');
        }
        break;

      case 'sol:navigate':
        // Sidebar-initiated navigation in preview mode
        if (e.data.href) window.location.href = e.data.href;
        break;

      case 'sol:update':
        // Live CMS field update
        var field = e.data.field, value = e.data.value;
        ['[data-sol-field="' + field + '"]', '[data-sol-image="' + field + '"]', '[data-hp-field="' + field + '"]'].forEach(function(sel) {
          try { document.querySelectorAll(sel).forEach(function(el) { if (el.tagName === 'IMG') el.setAttribute('src', value); else el.textContent = value; }); } catch(ex) {}
        });
        break;
    }
  });

  // Signal ready
  window.parent.postMessage({ type: 'sol:bridge-ready', hpDataAvailable: !!(window.__HP_DATA) }, '*');
})();
</script>`;

// ─── Bridge injection ─────────────────────────────────────────────────

function injectBridge(html: string, cmsData: Record<string, unknown[]> | null): string {
  if (html.includes('__hp_bridge') || html.includes('__sol_bridge')) {
    // Already injected — only refresh CMS data if it changed
    if (cmsData) {
      if (html.includes('window.__HP_DATA=')) {
        html = html.replace(/window\.__HP_DATA=\{[^<]*\};/, `window.__HP_DATA=${JSON.stringify(cmsData)};`);
      } else {
        html = html.replace('</head>', buildHPDataScript(cmsData) + '\n</head>');
      }
    }
    return html;
  }

  let injected = html;

  // CMS data injected first — must be available before any app JS executes
  if (cmsData) {
    const dataScript = buildHPDataScript(cmsData);
    injected = injected.includes('<head>')
      ? injected.replace('<head>', '<head>\n' + dataScript)
      : dataScript + '\n' + injected;
  }

  // Bridge injected before </body>
  injected = injected.includes('</body>')
    ? injected.replace('</body>', HP_BRIDGE_SCRIPT + '\n</body>')
    : injected + HP_BRIDGE_SCRIPT;

  return injected;
}

// ─── HTML resolver ────────────────────────────────────────────────────
//
// Maps a request path to the physical HTML file in the project.
//   /            → index.html
//   /about       → about.html  OR  about/index.html
//   /about.html  → about.html

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

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// ─── Preview app factory ──────────────────────────────────────────────
//
// Returns a standalone Express app that serves the imported project from /.
// Mounted on a dedicated port (PREVIEW_PORT) — not as a subpath of the API server.
//
// In production SaaS this maps to:  {project-id}.preview.hostaposta.app
// In local development this maps to: http://localhost:3002

export function createPreviewApp(): express.Application {
  const app = express();

  // Allow cross-origin iframe embedding (parent app is on a different port/domain)
  app.use((_req, res, next) => {
    // Permit embedding from any origin (locked down per-project in production)
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

    // Defensive: fall back to projectRoot if built output was deleted
    const rawServeRoot = state.servePath || state.projectRoot;
    const serveRoot = existsSync(rawServeRoot) ? rawServeRoot : state.projectRoot;

    if (serveRoot !== cachedRoot) {
      cachedRoot = serveRoot;
      staticHandler = express.static(serveRoot, {
        setHeaders: (_res, filePath) => {
          if (filePath.endsWith('.html')) _res.setHeader('Cache-Control', 'no-store');
        },
      });
    }

    const cmsData = readCMSData();

    // ── HTML: intercept before express.static can stream it ──────────
    // express.static uses res.write/res.end internally and bypasses any
    // res.send override, so we must intercept HTML before it gets there.
    const htmlFile = resolveHtmlFile(serveRoot, req.path);
    if (htmlFile) {
      try {
        const html = fs.readFileSync(htmlFile, 'utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').end(injectBridge(html, cmsData));
      } catch (err) {
        next(err);
      }
      return;
    }

    // ── Non-HTML assets: CSS, JS, images, fonts ──────────────────────
    staticHandler!(req, res, () => {
      // SPA fallback — any unmatched route gets index.html (hash / pushState SPAs)
      const indexPath = path.join(serveRoot, 'index.html');
      if (existsSync(indexPath)) {
        try {
          const html = fs.readFileSync(indexPath, 'utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.type('html').end(injectBridge(html, cmsData));
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
