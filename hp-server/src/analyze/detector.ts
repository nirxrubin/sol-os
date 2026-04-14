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

export type DetectionConfidence = 'high' | 'low';

export interface DetectionResult {
  archetype: ArchetypeDefinition;
  generator: GeneratorDefinition;
  /** HIGH = known framework match. LOW = no recognisable framework — multi-strategy build needed */
  confidence: DetectionConfidence;
  /** True when the project contains backend signals (API routes, server file, server-side deps) */
  needsBackend: boolean;
}

/**
 * Detect both archetype and generator in parallel.
 * This is the main entry point — call this from analyze/index.ts.
 */
export async function detectProject(projectRoot: string): Promise<DetectionResult> {
  const [{ archetype, confidence }, generator, needsBackend] = await Promise.all([
    detectArchetype(projectRoot),
    detectGenerator(projectRoot),
    detectBackend(projectRoot),
  ]);
  return { archetype, generator, confidence, needsBackend };
}

// ─── Archetype Detection ────────────────────────────────────────────────────

async function detectArchetype(
  projectRoot: string,
): Promise<{ archetype: ArchetypeDefinition; confidence: DetectionConfidence }> {
  const pkgPath = path.join(projectRoot, 'package.json');

  // No package.json → static HTML, high confidence
  if (!existsSync(pkgPath)) return { archetype: ARCHETYPES['vanilla-html'], confidence: 'high' };

  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  } catch {
    return { archetype: ARCHETYPES['vanilla-html'], confidence: 'high' };
  }

  // No build script → static HTML, high confidence
  if (!pkg.scripts?.build) return { archetype: ARCHETYPES['vanilla-html'], confidence: 'high' };

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // ── Priority order: nextjs → astro → vite-react → vite-vue → cra → vanilla-html

  if (allDeps['next']) {
    const hasAppDir =
      existsSync(path.join(projectRoot, 'app')) ||
      existsSync(path.join(projectRoot, 'src', 'app'));
    const hasPagesDir =
      existsSync(path.join(projectRoot, 'pages')) ||
      existsSync(path.join(projectRoot, 'src', 'pages'));

    if (hasPagesDir && !hasAppDir) return { archetype: ARCHETYPES['nextjs-pages-router'], confidence: 'high' };
    return { archetype: ARCHETYPES['nextjs-app-router'], confidence: 'high' };
  }

  if (allDeps['astro']) return { archetype: ARCHETYPES['astro'], confidence: 'high' };

  if (allDeps['vite']) {
    if (allDeps['react']) return { archetype: ARCHETYPES['vite-react'], confidence: 'high' };
    if (allDeps['vue'])   return { archetype: ARCHETYPES['vite-vue'], confidence: 'high' };
    // Vite detected but no specific UI framework — still try to build
    return { archetype: ARCHETYPES['vite-react'], confidence: 'low' };
  }

  if (allDeps['react-scripts']) return { archetype: ARCHETYPES['cra'], confidence: 'high' };

  // Has a build script but we don't recognise the framework — low confidence
  return { archetype: ARCHETYPES['vanilla-html'], confidence: 'low' };
}

// ─── Backend Detection ──────────────────────────────────────────────────────

/**
 * Detect backend signals that indicate the project needs a server.
 * Any one signal is enough to flag needs-backend: true.
 */
async function detectBackend(projectRoot: string): Promise<boolean> {
  // Signal 1: app/api/ or pages/api/ directories → Next.js API routes
  const apiDirPaths = [
    path.join(projectRoot, 'app', 'api'),
    path.join(projectRoot, 'src', 'app', 'api'),
    path.join(projectRoot, 'pages', 'api'),
    path.join(projectRoot, 'src', 'pages', 'api'),
  ];
  if (apiDirPaths.some(p => existsSync(p))) return true;

  // Signal 2: server.js or server.ts in project root
  if (
    existsSync(path.join(projectRoot, 'server.js')) ||
    existsSync(path.join(projectRoot, 'server.ts'))
  ) return true;

  // Signal 3: server-side runtime packages in dependencies (not devDeps)
  const pkgPath = path.join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const deps: Record<string, string> = pkg.dependencies ?? {};
      const serverDeps = ['express', 'fastify', 'hono', 'koa', 'nest', '@nestjs/core'];
      if (serverDeps.some(d => d in deps)) return true;
    } catch { /* ignore */ }
  }

  return false;
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
