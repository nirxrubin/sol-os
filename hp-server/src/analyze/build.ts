/**
 * Build Pipeline
 *
 * Detects whether an imported project needs a build step (React, Vue, Svelte, etc.)
 * and runs `npm install && npm run build` to produce deployable static output.
 *
 * When an ArchetypeDefinition is passed, build config is taken directly from it
 * (zero guessing). Without one, falls back to heuristic detection for backward compat.
 *
 * Returns the path to serve for preview — either the built output (dist/) or the
 * original project root for static HTML sites.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ArchetypeDefinition } from './archetypes.js';

/** The URL prefix where previews are served */
const PREVIEW_BASE = '/preview/';

const execAsync = promisify(exec);

export interface BuildResult {
  needed: boolean;
  success: boolean;
  servePath: string;       // Absolute path to serve for preview
  buildOutput?: string;    // stdout from build
  buildError?: string;     // stderr or error message
  duration?: number;       // ms
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Detect if project needs building and, if so, build it.
 * Returns the path that should be served for preview.
 *
 * Pass `archetype` for deterministic config (no guessing).
 * Omit for backward-compat heuristic mode.
 */
export async function buildProject(
  projectRoot: string,
  options?: { force?: boolean; archetype?: ArchetypeDefinition },
): Promise<BuildResult> {
  const pkgPath = path.join(projectRoot, 'package.json');
  const force = options?.force ?? false;
  const archetype = options?.archetype;

  // ── Archetype-driven fast path ──────────────────────────────────────────
  if (archetype) {
    // No build needed (vanilla HTML)
    if (archetype.build.command === 'none') {
      return { needed: false, success: true, servePath: projectRoot };
    }

    const outputDir = archetype.build.outputDir;
    const outputPath = outputDir === '.' ? projectRoot : path.join(projectRoot, outputDir);

    // Already built — skip unless forcing
    if (!force && existsSync(outputPath) && existsSync(path.join(outputPath, 'index.html'))) {
      console.log(`  [archetype: ${archetype.id}] Build output already exists at ${outputDir}/`);
      return { needed: true, success: true, servePath: outputPath };
    }

    console.log(`  [archetype: ${archetype.id}] Building → ${outputDir}/`);
    const startTime = Date.now();

    // Read pkg once for patching (still needed for router patching logic)
    let pkg: PackageJson = {};
    try { pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8')); } catch { /* ignore */ }

    try {
      if (!force) {
        console.log('  Running npm install...');
        const installResult = await execAsync('npm install --legacy-peer-deps', {
          cwd: projectRoot,
          timeout: 120_000,
          env: { ...process.env, NODE_ENV: 'development' },
        });
        if (installResult.stderr && !installResult.stderr.includes('npm warn')) {
          console.log('  npm install stderr:', installResult.stderr.slice(0, 500));
        }
        // Patch source for preview compat (uses archetype.build.basePath)
        await patchSourceForPreviewArchetype(projectRoot, pkg, archetype);
      }

      const buildCommand = getBuildCommandArchetype(archetype);
      console.log(`  Build command: ${buildCommand}`);
      const buildResult = await execAsync(buildCommand, {
        cwd: projectRoot,
        timeout: 180_000,
        env: { ...process.env, NODE_ENV: 'production', CI: 'true' },
      });

      const duration = Date.now() - startTime;
      console.log(`  Build completed in ${(duration / 1000).toFixed(1)}s`);

      if (existsSync(outputPath) && existsSync(path.join(outputPath, 'index.html'))) {
        return { needed: true, success: true, servePath: outputPath, buildOutput: buildResult.stdout.slice(-500), duration };
      }

      // Try common fallbacks in case outputDir was wrong
      for (const alt of ['dist', 'build', 'out', 'public']) {
        const altPath = path.join(projectRoot, alt);
        if (existsSync(altPath) && existsSync(path.join(altPath, 'index.html'))) {
          console.log(`  Found build output at ${alt}/ (expected ${outputDir}/)`);
          return { needed: true, success: true, servePath: altPath, buildOutput: buildResult.stdout.slice(-500), duration };
        }
      }

      return {
        needed: true, success: false, servePath: projectRoot,
        buildError: `Build completed but no output found in ${outputDir}/`,
        buildOutput: buildResult.stdout.slice(-500), duration,
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorMsg = err.stderr || err.message || String(err);
      console.error(`  Build failed after ${(duration / 1000).toFixed(1)}s:`, errorMsg.slice(0, 500));
      return { needed: true, success: false, servePath: projectRoot, buildError: errorMsg.slice(0, 1000), duration };
    }
  }

  // ── Heuristic fallback (no archetype provided) ──────────────────────────
  // No package.json → static site, serve as-is
  if (!existsSync(pkgPath)) {
    return { needed: false, success: true, servePath: projectRoot };
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  } catch {
    return { needed: false, success: true, servePath: projectRoot };
  }

  // Check if there's a build script
  const hasBuildScript = !!pkg.scripts?.build;
  if (!hasBuildScript) {
    return { needed: false, success: true, servePath: projectRoot };
  }

  // Detect the expected output directory
  const outputDir = await detectOutputDir(projectRoot, pkg);
  const outputPath = path.join(projectRoot, outputDir);

  // If build output already exists and not forcing rebuild, use it
  if (!force && existsSync(outputPath) && existsSync(path.join(outputPath, 'index.html'))) {
    console.log(`  Build output already exists at ${outputDir}/`);
    return { needed: true, success: true, servePath: outputPath };
  }

  console.log(`  ${force ? 'Rebuilding' : 'Building'} project (${pkg.scripts?.build})`);
  console.log(`  Expected output: ${outputDir}/`);

  const startTime = Date.now();

  try {
    if (!force) {
      // Step 1: Install dependencies (skip on rebuilds - already installed)
      console.log('  Running npm install...');
      const installResult = await execAsync('npm install --legacy-peer-deps', {
        cwd: projectRoot,
        timeout: 120_000, // 2 min for install
        env: { ...process.env, NODE_ENV: 'development' }, // Ensure devDeps are installed
      });
      if (installResult.stderr && !installResult.stderr.includes('npm warn')) {
        console.log('  npm install stderr:', installResult.stderr.slice(0, 500));
      }

      // Step 1.5: Patch source for preview compatibility
      await patchSourceForPreview(projectRoot, pkg);
    }

    // Step 2: Run build with base path set for preview serving
    console.log('  Running npm run build...');
    const buildCommand = await getBuildCommand(projectRoot, pkg);
    console.log(`  Build command: ${buildCommand}`);
    const buildResult = await execAsync(buildCommand, {
      cwd: projectRoot,
      timeout: 180_000, // 3 min for build
      env: {
        ...process.env,
        NODE_ENV: 'production',
        CI: 'true', // Prevents interactive prompts
      },
    });

    const duration = Date.now() - startTime;
    console.log(`  Build completed in ${(duration / 1000).toFixed(1)}s`);

    // Verify output exists
    if (existsSync(outputPath) && existsSync(path.join(outputPath, 'index.html'))) {
      return {
        needed: true,
        success: true,
        servePath: outputPath,
        buildOutput: buildResult.stdout.slice(-500),
        duration,
      };
    }

    // Try alternative output dirs if expected didn't work
    const altDirs = ['dist', 'build', 'out', '.next/out', 'public'];
    for (const alt of altDirs) {
      const altPath = path.join(projectRoot, alt);
      if (existsSync(altPath) && existsSync(path.join(altPath, 'index.html'))) {
        console.log(`  Found build output at ${alt}/ (instead of expected ${outputDir}/)`);
        return {
          needed: true,
          success: true,
          servePath: altPath,
          buildOutput: buildResult.stdout.slice(-500),
          duration,
        };
      }
    }

    // Build ran but no index.html found — check if any HTML exists in output
    for (const alt of altDirs) {
      const altPath = path.join(projectRoot, alt);
      if (existsSync(altPath)) {
        const files = await fs.readdir(altPath);
        if (files.some(f => f.endsWith('.html'))) {
          console.log(`  Found HTML in ${alt}/ (no index.html, but other HTML files exist)`);
          return {
            needed: true,
            success: true,
            servePath: altPath,
            buildOutput: buildResult.stdout.slice(-500),
            duration,
          };
        }
      }
    }

    // Build succeeded but no recognizable output — serve source as fallback
    console.warn('  Build completed but no output directory found — serving source');
    return {
      needed: true,
      success: false,
      servePath: projectRoot,
      buildError: `Build completed but no output found in ${outputDir}/`,
      buildOutput: buildResult.stdout.slice(-500),
      duration,
    };

  } catch (err: any) {
    const duration = Date.now() - startTime;
    const errorMsg = err.stderr || err.message || String(err);
    console.error(`  Build failed after ${(duration / 1000).toFixed(1)}s:`, errorMsg.slice(0, 500));

    return {
      needed: true,
      success: false,
      servePath: projectRoot, // Fallback to source
      buildError: errorMsg.slice(0, 1000),
      duration,
    };
  }
}

// ─── Archetype-driven helpers ───────────────────────────────────────────────

/**
 * Returns the build command for a known archetype.
 */
function getBuildCommandArchetype(archetype: ArchetypeDefinition): string {
  switch (archetype.build.basePath) {
    case 'vite-flag':
      return `npm run build -- --base=${PREVIEW_BASE}`;
    case 'cra-env':
      return `PUBLIC_URL=${PREVIEW_BASE} npm run build`;
    default:
      // next-static-export, vue-router, none — all use plain npm run build
      // (patching is handled by patchSourceForPreviewArchetype)
      return 'npm run build';
  }
}

/**
 * Archetype-aware source patcher. Uses archetype.build.basePath to decide
 * what to patch instead of re-detecting from deps.
 */
async function patchSourceForPreviewArchetype(
  projectRoot: string,
  pkg: PackageJson,
  archetype: ArchetypeDefinition,
): Promise<void> {
  switch (archetype.build.basePath) {
    case 'next-static-export':
      await patchNextConfigForStaticExport(projectRoot);
      break;
    case 'vue-router': {
      const srcDir = path.join(projectRoot, 'src');
      if (!existsSync(srcDir)) break;
      const tsFiles  = await findFilesRecursive(srcDir, /\.(tsx?|jsx?)$/);
      const vueFiles = await findFilesRecursive(srcDir, /\.vue$/);
      for (const file of [...tsFiles, ...vueFiles]) {
        await patchVueRouterFile(projectRoot, file);
      }
      break;
    }
    case 'vite-flag':
      // base path is passed as CLI flag — no source patching needed
      // but still patch React Router if present
      if (pkg.dependencies?.['react-router-dom'] || pkg.devDependencies?.['react-router-dom']) {
        const srcDir = path.join(projectRoot, 'src');
        if (existsSync(srcDir)) {
          const tsFiles = await findFilesRecursive(srcDir, /\.(tsx?|jsx?)$/);
          for (const file of tsFiles) await patchReactRouterFile(projectRoot, file);
        }
      }
      break;
    default:
      break;
  }
}

/**
 * Patch source files for preview compatibility.
 * Injects basename="/preview" into all known router patterns so sub-routes
 * resolve correctly when the app is served from /preview/.
 *
 * Handles:
 *   - React Router v5/v6 <BrowserRouter>
 *   - React Router v6 createBrowserRouter()
 *   - Vue Router createWebHistory()
 *
 * Original files are backed up with .hp-backup extension for clean deploy.
 */
async function patchSourceForPreview(projectRoot: string, pkg: PackageJson): Promise<void> {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Next.js: force static export so the build produces a serveable out/ directory
  if (allDeps['next']) {
    await patchNextConfigForStaticExport(projectRoot);
    return; // No router patching needed for Next.js — it handles its own routing
  }

  const srcDir = path.join(projectRoot, 'src');
  if (!existsSync(srcDir)) return;

  const tsFiles  = await findFilesRecursive(srcDir, /\.(tsx?|jsx?)$/);
  const vueFiles = await findFilesRecursive(srcDir, /\.vue$/);

  if (allDeps['react-router-dom']) {
    for (const file of tsFiles) {
      await patchReactRouterFile(projectRoot, file);
    }
  }

  if (allDeps['vue-router']) {
    for (const file of [...tsFiles, ...vueFiles]) {
      await patchVueRouterFile(projectRoot, file);
    }
  }
}

/**
 * Patch next.config.ts/js to force static HTML export.
 *
 * Without output: 'export', next build creates .next/ which requires
 * a Node.js server to serve. With it, next build creates out/ — a
 * plain static directory our preview server can serve directly.
 *
 * Also adds images: { unoptimized: true } which is required for
 * static export (Next.js image optimization needs a server component).
 */
async function patchNextConfigForStaticExport(projectRoot: string): Promise<void> {
  const candidates = ['next.config.ts', 'next.config.mts', 'next.config.js', 'next.config.mjs'];

  for (const name of candidates) {
    const configPath = path.join(projectRoot, name);
    if (!existsSync(configPath)) continue;

    let content: string;
    try { content = await fs.readFile(configPath, 'utf-8'); } catch { return; }

    // Already configured for static export
    if (content.includes("output: 'export'") || content.includes('output: "export"')) {
      console.log(`  ${name} already has output: 'export'`);
      return;
    }

    await backupFile(configPath);

    // Strip placeholder comments that cause syntax errors after injection
    // e.g. "/* config options here */" left by create-next-app
    let stripped = content.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '').replace(/,(\s*,)+/g, ',').replace(/\{(\s*,)/g, '{').trim();

    // Inject output + images into the config object literal
    // Handles: const nextConfig: NextConfig = { ... }
    //          const nextConfig = { ... }
    //          export default { ... }
    let patched = stripped.replace(
      /(\bconst\s+\w+\s*(?::\s*\w+\s*)?\=\s*\{|export\s+default\s+\{)([\s\S]*?)(\})\s*;?\s*$/m,
      (_, open, inner, close) => {
        const additions: string[] = [];
        if (!inner.includes('output'))  additions.push("  output: 'export'");
        if (!inner.includes('images'))  additions.push('  images: { unoptimized: true }');
        if (additions.length === 0) return _;
        const cleanInner = inner.replace(/^\s*,/, '').trimEnd(); // strip leading comma
        const sep = cleanInner.endsWith(',') || cleanInner.trim() === '' ? '\n' : ',\n';
        return open + cleanInner + sep + additions.join(',\n') + ',\n' + close + ';';
      }
    );

    if (patched === content) {
      // Fallback: simpler single-pass inject for edge cases
      patched = content.replace(
        /nextConfig\s*=\s*\{/,
        "nextConfig = {\n  output: 'export',\n  images: { unoptimized: true },"
      );
    }

    if (patched !== content) {
      await fs.writeFile(configPath, patched);
      console.log(`  Patched ${name}: added output: 'export' + images.unoptimized`);
    }
    return;
  }
}

async function patchReactRouterFile(projectRoot: string, file: string): Promise<void> {
  let content: string;
  try { content = await fs.readFile(file, 'utf-8'); } catch { return; }

  const hasBrowserRouter    = content.includes('BrowserRouter');
  const hasCreateBrowser    = content.includes('createBrowserRouter');
  if (!hasBrowserRouter && !hasCreateBrowser) return;

  // Already patched
  if (content.includes("basename: '/preview'") || content.includes('basename: "/preview"') ||
      content.includes('basename="/preview"')) return;

  await backupFile(file);
  let patched = content;

  // ── <BrowserRouter> JSX pattern (React Router v5 / v6 legacy) ──────
  if (hasBrowserRouter) {
    patched = patched.replace(
      /<BrowserRouter(\s*>|\s+(?!basename))/g,
      '<BrowserRouter basename="/preview"$1',
    );
  }

  // ── createBrowserRouter(routes, { ...options }) ─────────────────────
  // Inject basename into existing options object
  if (hasCreateBrowser) {
    patched = patched.replace(
      /createBrowserRouter\(([^,)]+),\s*\{/g,
      "createBrowserRouter($1, { basename: '/preview',",
    );

    // ── createBrowserRouter(routes) — no options at all ─────────────
    // Only applies if the previous replace didn't already fire
    patched = patched.replace(
      /createBrowserRouter\((\w+)\)(?!\s*,\s*\{)/g,
      "createBrowserRouter($1, { basename: '/preview' })",
    );
  }

  if (patched !== content) {
    await fs.writeFile(file, patched);
    console.log(`  Patched React Router basename in ${path.relative(projectRoot, file)}`);
  }
}

async function patchVueRouterFile(projectRoot: string, file: string): Promise<void> {
  let content: string;
  try { content = await fs.readFile(file, 'utf-8'); } catch { return; }

  if (!content.includes('createWebHistory')) return;

  // Already set to /preview, or delegated to Vite via BASE_URL
  if (content.includes('/preview') || content.includes('BASE_URL')) return;

  await backupFile(file);

  // createWebHistory() or createWebHistory('/') or createWebHistory('/any')
  const patched = content.replace(
    /createWebHistory\s*\(\s*(?:'[^']*'|"[^"]*")?\s*\)/g,
    "createWebHistory('/preview')",
  );

  if (patched !== content) {
    await fs.writeFile(file, patched);
    console.log(`  Patched Vue Router createWebHistory in ${path.relative(projectRoot, file)}`);
  }
}

async function backupFile(file: string): Promise<void> {
  const backupPath = file + '.hp-backup';
  if (!existsSync(backupPath)) {
    try {
      await fs.copyFile(file, backupPath);
    } catch { /* ignore */ }
  }
}

async function findFilesRecursive(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await findFilesRecursive(full, pattern));
      } else if (pattern.test(entry.name)) {
        results.push(full);
      }
    }
  } catch { /* ignore */ }
  return results;
}

/**
 * Determine the build command, injecting base path for preview serving.
 * For Vite projects, we pass --base=/preview/ so assets resolve correctly
 * when the preview is mounted at /preview/.
 */
async function getBuildCommand(projectRoot: string, pkg: PackageJson): Promise<string> {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const buildScript = pkg.scripts?.build ?? 'npm run build';

  // Vite: pass --base flag
  if (allDeps['vite'] || existsSync(path.join(projectRoot, 'vite.config.ts')) || existsSync(path.join(projectRoot, 'vite.config.js'))) {
    // If build script uses 'vite build' or 'tsc && vite build', append --base
    if (buildScript.includes('vite build')) {
      return `npm run build -- --base=${PREVIEW_BASE}`;
    }
    // Otherwise run vite build directly with base
    return `npx vite build --base=${PREVIEW_BASE}`;
  }

  // Create React App: set PUBLIC_URL
  if (allDeps['react-scripts']) {
    return `PUBLIC_URL=${PREVIEW_BASE} npm run build`;
  }

  // Next.js: set basePath in next.config (can't easily inject, just build normally)
  // Other frameworks: build normally and we'll fix paths post-build
  return 'npm run build';
}

/**
 * Detect the expected build output directory based on framework/config.
 */
async function detectOutputDir(projectRoot: string, pkg: PackageJson): Promise<string> {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Check Vite config for custom outDir
  for (const configName of ['vite.config.ts', 'vite.config.js', 'vite.config.mts']) {
    const configPath = path.join(projectRoot, configName);
    if (existsSync(configPath)) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const match = content.match(/outDir\s*:\s*['"]([^'"]+)['"]/);
        if (match) return match[1];
      } catch { /* ignore */ }
      return 'dist'; // Vite default
    }
  }

  // Framework-specific defaults
  if (allDeps['next']) return 'out'; // next export
  if (allDeps['gatsby']) return 'public';
  if (allDeps['nuxt'] || allDeps['nuxt3']) return '.output/public';
  if (allDeps['@angular/core']) return `dist/${path.basename(projectRoot)}`;

  // Create React App
  if (allDeps['react-scripts']) return 'build';

  // Default for most modern bundlers
  return 'dist';
}
