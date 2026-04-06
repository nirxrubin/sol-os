/**
 * Phase 2: Deterministic window.__HP_DATA Injector
 *
 * The compiler + adapter pattern:
 *   Phase 1 (AI): discovery only — reads, classifies, produces AIAnalysisOutput
 *   Phase 2 (this): deterministic — injects window.__HP_DATA bridge into source arrays
 *   Phase 3 (preview.ts): runtime — injects live CMS data from .sol-cms.json at serve-time
 *
 * What this does:
 *   Finds each content collection's array declaration in the source file and transforms:
 *
 *   BEFORE:  const products = [...original data...];
 *   AFTER:   const products = (window as any).__HP_DATA?.products ?? [...original data...];
 *
 *   BEFORE:  const posts: BlogPost[] = [...];
 *   AFTER:   const posts: BlogPost[] = (window as any).__HP_DATA?.posts ?? [...];
 *
 * Why this works:
 *   - The source file is modified once during import, not on every CMS edit
 *   - On every preview load, the preview server injects window.__HP_DATA from .sol-cms.json
 *   - React/Vue/vanilla JS reads window.__HP_DATA on first render — no DOM fighting
 *   - Fallback to original data if no CMS override exists
 *   - Reversible: just remove the (window as any).__HP_DATA?. prefix to restore original
 *
 * Safety rules:
 *   - Never modifies node_modules/, dist/, .next/, build/, out/
 *   - Only modifies files specified in AIAnalysisOutput.contentCollections
 *   - Only modifies the exact array declaration line(s)
 *   - If the pattern is ambiguous (multiple matches), skips to avoid corruption
 *   - Atomic write: reads → transforms → writes only if changed
 */

import fs from 'fs/promises';
import path from 'path';
import type { AIAnalysisOutput } from '../analyze/outputSchema.js';

export interface InjectionResult {
  file: string;
  varName: string;
  injected: boolean;
  reason?: string;
}

// Directories that must never be modified
const FORBIDDEN_DIRS = ['node_modules', 'dist', '.next', '.nuxt', 'build', 'out', '.cache', '__pycache__'];

export async function injectHPDataBridge(
  projectRoot: string,
  collections: AIAnalysisOutput['contentCollections'],
): Promise<InjectionResult[]> {
  const results: InjectionResult[] = [];

  if (!collections || collections.length === 0) {
    return results;
  }

  // Group collections by file to avoid reading the same file multiple times
  const byFile = new Map<string, AIAnalysisOutput['contentCollections']>();
  for (const col of collections) {
    if (!col.file || !col.varName) continue;
    const existing = byFile.get(col.file) ?? [];
    existing.push(col);
    byFile.set(col.file, existing);
  }

  for (const [relFile, cols] of byFile.entries()) {
    // Safety: never touch forbidden directories
    const normalizedPath = relFile.replace(/\\/g, '/');
    if (FORBIDDEN_DIRS.some(d => normalizedPath.includes(`/${d}/`) || normalizedPath.startsWith(`${d}/`))) {
      for (const col of cols) {
        results.push({ file: relFile, varName: col.varName, injected: false, reason: `Forbidden directory` });
      }
      continue;
    }

    const fullPath = path.resolve(projectRoot, normalizedPath);

    // Path traversal guard
    if (!fullPath.startsWith(path.resolve(projectRoot))) {
      for (const col of cols) {
        results.push({ file: relFile, varName: col.varName, injected: false, reason: 'Path outside project root' });
      }
      continue;
    }

    let source: string;
    try {
      source = await fs.readFile(fullPath, 'utf-8');
    } catch {
      for (const col of cols) {
        results.push({ file: relFile, varName: col.varName, injected: false, reason: 'File not found' });
      }
      continue;
    }

    let modified = source;

    for (const col of cols) {
      const varName = col.varName;

      // Already injected — idempotent
      if (modified.includes(`__HP_DATA?.${varName}`) || modified.includes(`__HP_DATA?.["${varName}"]`)) {
        results.push({ file: relFile, varName, injected: false, reason: 'Already injected' });
        continue;
      }

      // Pattern: (export )?(const|let|var) varName(: SomeType)? = [
      // Handles:
      //   const products = [
      //   export const products = [
      //   const products: Product[] = [
      //   export const blogPosts: BlogPost[] = [
      //   let items = [
      const pattern = new RegExp(
        `((?:export\\s+default\\s+|export\\s+)?(?:const|let|var)\\s+${escapeRegex(varName)}(?:\\s*:[^=]+)?\\s*=\\s*)(\\[)`,
        'g',
      );

      const matches = [...modified.matchAll(pattern)];

      if (matches.length === 0) {
        // Try to find it as a module.exports or exports.varName assignment
        const cjsPattern = new RegExp(
          `((?:module\\.exports\\s*\\.\\s*${escapeRegex(varName)}|exports\\.${escapeRegex(varName)})\\s*=\\s*)(\\[)`,
          'g',
        );
        const cjsMatches = [...modified.matchAll(cjsPattern)];

        if (cjsMatches.length === 1) {
          modified = applyInjection(modified, cjsMatches[0], varName);
          results.push({ file: relFile, varName, injected: true });
        } else {
          results.push({
            file: relFile,
            varName,
            injected: false,
            reason: matches.length === 0
              ? 'Array declaration not found — may be dynamic or imported'
              : `Ambiguous: ${matches.length} matching declarations found`,
          });
        }
        continue;
      }

      if (matches.length > 1) {
        // Multiple declarations — too risky to patch
        results.push({
          file: relFile,
          varName,
          injected: false,
          reason: `Ambiguous: ${matches.length} declarations of '${varName}' found — skipped to avoid corruption`,
        });
        continue;
      }

      // Exactly one match — safe to patch
      modified = applyInjection(modified, matches[0], varName);
      results.push({ file: relFile, varName, injected: true });
    }

    // Write only if something changed
    if (modified !== source) {
      await fs.writeFile(fullPath, modified, 'utf-8');
    }
  }

  return results;
}

/**
 * Apply the __HP_DATA bridge injection at the matched array declaration.
 *
 * Transforms:
 *   const products = [      →  const products = (window as any).__HP_DATA?.products ?? [
 *   export const posts: T[] = [  →  export const posts: T[] = (window as any).__HP_DATA?.posts ?? [
 */
function applyInjection(
  source: string,
  match: RegExpMatchArray,
  varName: string,
): string {
  const prefix = match[1]; // Everything up to and including " = "
  const matchStart = match.index!;
  const prefixEnd = matchStart + prefix.length;
  // The "[" is at prefixEnd — replace it with the bridge expression + "["
  // Use typeof window guard so SSR/SSG builds (Next.js, Nuxt, etc.) don't
  // throw "window is not defined" when they import this module server-side.
  const bridge = `(typeof window !== 'undefined' ? (window as any).__HP_DATA?.${varName} : null) ?? [`;
  return source.slice(0, prefixEnd) + bridge + source.slice(prefixEnd + 1);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Verify injections are present without re-injecting.
 * Returns which varNames have been injected in the given file.
 */
export async function checkInjectionStatus(
  projectRoot: string,
  file: string,
  varNames: string[],
): Promise<Record<string, boolean>> {
  const fullPath = path.resolve(projectRoot, file.replace(/\\/g, '/'));
  let source: string;
  try {
    source = await fs.readFile(fullPath, 'utf-8');
  } catch {
    return Object.fromEntries(varNames.map(v => [v, false]));
  }
  return Object.fromEntries(varNames.map(v => [v, source.includes(`__HP_DATA?.${v}`)]));
}
