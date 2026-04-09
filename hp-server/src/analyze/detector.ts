/**
 * Project Detector
 *
 * Reads the filesystem to identify:
 *   1. Archetype — what type of project (Next.js, Vite+React, vanilla HTML, etc.)
 *   2. Generator — which AI tool built it (Lovable, Base44, Claude Code, Cursor)
 *
 * Pure filesystem reads — no network, no AI, completes in <100ms.
 * Returns deterministic results used by build.ts, index.ts, and systemPrompt.ts.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
  ARCHETYPES,
  GENERATORS,
  type ArchetypeDefinition,
  type GeneratorDefinition,
} from './archetypes.js';

export interface DetectionResult {
  archetype: ArchetypeDefinition;
  generator: GeneratorDefinition;
}

/**
 * Detect both archetype and generator in parallel.
 * This is the main entry point — call this from analyze/index.ts.
 */
export async function detectProject(projectRoot: string): Promise<DetectionResult> {
  const [archetype, generator] = await Promise.all([
    detectArchetype(projectRoot),
    detectGenerator(projectRoot),
  ]);
  return { archetype, generator };
}

// ─── Archetype Detection ────────────────────────────────────────────────────

async function detectArchetype(projectRoot: string): Promise<ArchetypeDefinition> {
  const pkgPath = path.join(projectRoot, 'package.json');

  // No package.json → serve as static HTML
  if (!existsSync(pkgPath)) return ARCHETYPES['vanilla-html'];

  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  } catch {
    return ARCHETYPES['vanilla-html'];
  }

  // No build script → no build needed, serve as static HTML
  if (!pkg.scripts?.build) return ARCHETYPES['vanilla-html'];

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // ── Priority order: nextjs → astro → vite-react → vite-vue → cra → vanilla-html

  if (allDeps['next']) {
    // Distinguish App Router (app/ dir) from Pages Router (pages/ dir)
    const hasAppDir =
      existsSync(path.join(projectRoot, 'app')) ||
      existsSync(path.join(projectRoot, 'src', 'app'));
    const hasPagesDir =
      existsSync(path.join(projectRoot, 'pages')) ||
      existsSync(path.join(projectRoot, 'src', 'pages'));

    // Pages Router only when pages/ exists and app/ doesn't
    if (hasPagesDir && !hasAppDir) return ARCHETYPES['nextjs-pages-router'];
    // Default: App Router (covers both app/ and ambiguous cases)
    return ARCHETYPES['nextjs-app-router'];
  }

  if (allDeps['astro']) return ARCHETYPES['astro'];

  if (allDeps['vite']) {
    if (allDeps['react']) return ARCHETYPES['vite-react'];
    if (allDeps['vue'])   return ARCHETYPES['vite-vue'];
  }

  if (allDeps['react-scripts']) return ARCHETYPES['cra'];

  // Has a build script but we don't recognise the framework
  // → still try to build, serve from dist/ as best effort
  return ARCHETYPES['vanilla-html'];
}

// ─── Generator Detection ────────────────────────────────────────────────────

async function detectGenerator(projectRoot: string): Promise<GeneratorDefinition> {
  // Read package.json deps once (best-effort — failures fall through to UNKNOWN)
  let allDeps: Record<string, string> = {};
  const pkgPath = path.join(projectRoot, 'package.json');

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch { /* ignore — allDeps stays empty */ }
  }

  // Check generators in confidence order (certain before likely)
  const ordered: Array<keyof typeof GENERATORS> = [
    'LOVABLE', 'BASE44',        // certain — binary package signals
    'CLAUDE_CODE', 'CURSOR',    // likely — filesystem artifacts
  ];

  for (const genId of ordered) {
    const gen = GENERATORS[genId];
    const { signals } = gen;

    if (signals.packageDeps?.some(dep => dep in allDeps)) return gen;
    if (signals.packageDevDeps?.some(dep => dep in allDeps)) return gen;
    if (signals.files?.some(f => existsSync(path.join(projectRoot, f)))) return gen;
    if (signals.directories?.some(d => existsSync(path.join(projectRoot, d)))) return gen;
  }

  return GENERATORS['UNKNOWN'];
}
