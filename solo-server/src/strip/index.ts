/**
 * SOL Strip — removes all data-sol-* attributes from source files before production build.
 *
 * Operates on:
 *  - .jsx / .tsx files: strips data-sol-field, data-sol-static, data-sol-image JSX props
 *  - .vue files: strips :data-sol-field, data-sol-field, etc. from templates
 *  - .html files: strips data-sol-* HTML attributes from element strings
 *  - .js / .ts files: strips data-sol-* attribute assignments (template literals, object spreads)
 *
 * This is the Vite plugin version — zero runtime overhead, runs only during `vite build`.
 * Keeps the output "clean like Webflow, not dirty like Elementor".
 */

import fs from 'fs/promises';
import path from 'path';

// Minimal Vite plugin interface (no vite dep needed on server)
interface VitePlugin {
  name: string;
  enforce?: 'pre' | 'post';
  transform?: (code: string, id: string) => string | null | undefined;
  transformIndexHtml?: (html: string) => string;
}

// ─── Regex patterns ───────────────────────────────────────────────

/** JSX / TSX: data-sol-field={...}  data-sol-static="..."  data-sol-image={...} */
const JSX_ATTR_RE = /\s+data-sol-(?:field|static|image)=(?:\{[^}]*\}|"[^"]*"|'[^']*')/g;

/** Vue template: :data-sol-field="..."  data-sol-field="..."  etc. */
const VUE_ATTR_RE = /\s+:?data-sol-(?:field|static|image)=(?:`[^`]*`|"[^"]*"|'[^']*')/g;

/** HTML: data-sol-field="..."  (any attribute value format) */
const HTML_ATTR_RE = /\s+data-sol-(?:field|static|image)="[^"]*"/g;

/** Any context — also catches leftover template literals like `${...}` in strings */
const ANY_SOL_RE = /\s+data-sol-(?:field|static|image)=\{?`[^`]*`\}?/g;

// ─── Strip functions ───────────────────────────────────────────────

export function stripJSX(code: string): string {
  return code.replace(JSX_ATTR_RE, '').replace(ANY_SOL_RE, '');
}

export function stripVue(code: string): string {
  return code.replace(VUE_ATTR_RE, '').replace(ANY_SOL_RE, '');
}

export function stripHTML(code: string): string {
  return code.replace(HTML_ATTR_RE, '');
}

/** Auto-detect file type and strip appropriately */
export function stripFile(code: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.vue') return stripVue(code);
  if (ext === '.html') return stripHTML(code);
  if (['.jsx', '.tsx', '.js', '.ts', '.astro', '.svelte'].includes(ext)) return stripJSX(code);
  return code;
}

// ─── Vite plugin ──────────────────────────────────────────────────

/**
 * Vite plugin that strips all data-sol-* attributes from the compiled bundle.
 * Add to vite.config.ts: `plugins: [solStrip()]`
 * Only active when mode === 'production' (safe to always include).
 */
export function solStrip(): VitePlugin {
  return {
    name: 'vite-plugin-sol-strip',
    enforce: 'pre',
    transform(code: string, id: string): string | null {
      // Only strip in production — never in dev
      if (process.env.NODE_ENV !== 'production') return null;
      return stripFile(code, id);
    },
    transformIndexHtml(html: string): string {
      if (process.env.NODE_ENV !== 'production') return html;
      return stripHTML(html);
    },
  };
}

// ─── Filesystem strip (for non-Vite projects) ─────────────────────

const STRIP_EXTENSIONS = ['.html', '.htm', '.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte', '.astro'];
const SKIP_DIRS = new Set(['node_modules', '.git', '__MACOSX', '.next', 'dist', 'out', 'build']);

/**
 * Recursively strip data-sol-* attributes from all source files in a directory.
 * Used for non-Vite projects or as a pre-deploy pass.
 * Returns the count of files modified.
 */
export async function stripDirectory(dir: string): Promise<number> {
  let count = 0;

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(path.join(current, entry.name));
        }
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!STRIP_EXTENSIONS.includes(ext)) continue;

      const filePath = path.join(current, entry.name);
      const original = await fs.readFile(filePath, 'utf-8');
      const stripped = stripFile(original, filePath);

      if (stripped !== original) {
        await fs.writeFile(filePath, stripped, 'utf-8');
        count++;
      }
    }
  }

  await walk(dir);
  return count;
}
