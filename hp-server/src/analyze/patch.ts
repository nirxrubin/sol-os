/**
 * Automatic Patch Set
 *
 * Applied to every project before any build attempt.
 * These are non-destructive, generic fixes — never project-specific hacks.
 *
 * 1. Env var placeholder injection
 *    Scan source files for VITE_* and NEXT_PUBLIC_* references.
 *    For any variable not present in the environment, write an empty-string
 *    placeholder into a .env.local file so the build doesn't crash.
 *
 * 2. Asset path normalization
 *    Scan index.html and entry HTML files.
 *    Rewrite absolute asset references (src="/..." href="/...") to relative paths.
 *    This fixes the most common cause of 404s after deploy.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the full automatic patch set on a project directory.
 * Safe to call multiple times — patches are idempotent.
 */
export async function applyPatches(projectRoot: string): Promise<void> {
  await Promise.all([
    injectEnvPlaceholders(projectRoot),
    normalizeAssetPaths(projectRoot),
  ]);
}

// ─── 1. Env var placeholder injection ───────────────────────────────────────

const ENV_VAR_PATTERNS = [
  /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g,
  /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g,
  /process\.env\.(REACT_APP_[A-Z0-9_]+)/g,
];

/**
 * Scan source files for env var references.
 * Write placeholders for any that aren't already set.
 * Uses .env.local so it doesn't overwrite the user's .env.
 */
export async function injectEnvPlaceholders(projectRoot: string): Promise<void> {
  const required = await extractRequiredEnvVars(projectRoot);
  if (required.length === 0) return;

  const missing = required.filter(v => !process.env[v]);
  if (missing.length === 0) return;

  // Read existing .env.local to avoid duplicates
  const envLocalPath = path.join(projectRoot, '.env.local');
  let existing = '';
  try {
    existing = await fs.readFile(envLocalPath, 'utf-8');
  } catch { /* file may not exist */ }

  const lines = existing.split('\n').filter(Boolean);
  const existingKeys = new Set(
    lines.map(l => l.split('=')[0]?.trim()).filter(Boolean),
  );

  const additions = missing
    .filter(v => !existingKeys.has(v))
    .map(v => `${v}=`);

  if (additions.length === 0) return;

  const content = [...lines, ...additions].join('\n') + '\n';
  await fs.writeFile(envLocalPath, content);
  console.log(`  [patch] Injected ${additions.length} placeholder env vars into .env.local`);
}

/**
 * Extract all env var names referenced in source files.
 * Returns unique, sorted list.
 */
export async function extractRequiredEnvVars(projectRoot: string): Promise<string[]> {
  const vars = new Set<string>();

  // Scan src/ directory for TypeScript/JavaScript/Vue files
  const srcDir = path.join(projectRoot, 'src');
  const appDir = path.join(projectRoot, 'app');

  const dirs = [
    existsSync(srcDir) ? srcDir : null,
    existsSync(appDir) ? appDir : null,
  ].filter((d): d is string => d !== null);

  // Also check root-level files (e.g. next.config.ts)
  const rootFiles = await getRootSourceFiles(projectRoot);

  const allFiles = [
    ...rootFiles,
    ...(await Promise.all(dirs.map(d => findSourceFiles(d)))).flat(),
  ];

  await Promise.all(
    allFiles.map(async (file) => {
      try {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of ENV_VAR_PATTERNS) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(content)) !== null) {
            vars.add(match[1]);
          }
        }
      } catch { /* ignore unreadable files */ }
    }),
  );

  return Array.from(vars).sort();
}

async function getRootSourceFiles(projectRoot: string): Promise<string[]> {
  const candidates = [
    'next.config.ts', 'next.config.js', 'next.config.mjs',
    'vite.config.ts', 'vite.config.js',
    'astro.config.ts', 'astro.config.mjs',
  ];
  return candidates
    .map(f => path.join(projectRoot, f))
    .filter(f => existsSync(f));
}

async function findSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await findSourceFiles(full));
      } else if (/\.(tsx?|jsx?|vue|astro|svelte)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch { /* ignore */ }
  return results;
}

// ─── 2. Asset path normalization ─────────────────────────────────────────────

/**
 * Rewrite absolute src/href paths in HTML files to relative.
 * e.g. src="/images/logo.png" → src="images/logo.png"
 *
 * Only rewrites references to local assets (not http:// or https://).
 * Backs up original files before modifying.
 */
async function normalizeAssetPaths(projectRoot: string): Promise<void> {
  // Find index.html and any HTML files in root
  const htmlFiles = await findHtmlFiles(projectRoot);
  if (htmlFiles.length === 0) return;

  for (const file of htmlFiles) {
    await normalizeHtmlFile(file);
  }
}

async function findHtmlFiles(projectRoot: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      results.push(path.join(projectRoot, entry.name));
    }
  } catch { /* ignore */ }

  // Also check src/public/ directories
  for (const subdir of ['public', 'src']) {
    const subdirPath = path.join(projectRoot, subdir);
    if (!existsSync(subdirPath)) continue;
    try {
      const entries = await fs.readdir(subdirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.html')) {
          results.push(path.join(subdirPath, entry.name));
        }
      }
    } catch { /* ignore */ }
  }

  return results;
}

async function normalizeHtmlFile(filePath: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return;
  }

  // Match src="/..." and href="/..." that don't look like external URLs or anchors
  // Preserve: href="#...", href="https://...", href="//..."
  const rewritten = content.replace(
    /(src|href)="(\/(?!\/)[^"]+)"/g,
    (match, attr, p) => {
      // Skip data URIs, absolute URLs, protocol-relative
      if (p.startsWith('//') || p.startsWith('data:')) return match;
      // Rewrite absolute path to relative
      const relative = p.replace(/^\//, '');
      return `${attr}="${relative}"`;
    },
  );

  if (rewritten === content) return;

  // Backup original
  const backupPath = filePath + '.hp-backup';
  if (!existsSync(backupPath)) {
    await fs.copyFile(filePath, backupPath);
  }

  await fs.writeFile(filePath, rewritten);
  console.log(`  [patch] Normalized asset paths in ${path.basename(filePath)}`);
}
