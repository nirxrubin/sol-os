/**
 * Build Pipeline
 *
 * Detects whether an imported project needs a build step (React, Vue, Svelte, etc.)
 * and runs `npm install && npm run build` to produce deployable static output.
 *
 * Returns the path to serve for preview — either the built output (dist/) or the
 * original project root for static HTML sites.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

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
 */
export async function buildProject(projectRoot: string, options?: { force?: boolean }): Promise<BuildResult> {
  const pkgPath = path.join(projectRoot, 'package.json');
  const force = options?.force ?? false;

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

/**
 * Patch source files for preview compatibility.
 * - Injects basename="/preview" into React Router's BrowserRouter
 * - Handles other framework routers as needed
 *
 * These patches ensure the app works correctly when served from /preview/.
 * Original files are backed up with .sol-backup extension for clean deploy.
 */
async function patchSourceForPreview(projectRoot: string, pkg: PackageJson): Promise<void> {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // React Router: find BrowserRouter usage and inject basename
  if (allDeps['react-router-dom']) {
    await patchReactRouter(projectRoot);
  }
}

async function patchReactRouter(projectRoot: string): Promise<void> {
  const srcDir = path.join(projectRoot, 'src');
  if (!existsSync(srcDir)) return;

  // Find files that use BrowserRouter
  const files = await findFilesRecursive(srcDir, /\.(tsx?|jsx?)$/);

  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch { continue; }

    if (!content.includes('BrowserRouter')) continue;

    // Check if basename is already set
    if (content.includes('basename=')) continue;

    // Backup original
    const backupPath = file + '.sol-backup';
    if (!existsSync(backupPath)) {
      await fs.writeFile(backupPath, content);
    }

    // Inject basename prop into <BrowserRouter> or <BrowserRouter ...>
    const patched = content.replace(
      /<BrowserRouter(\s*>|\s+(?!basename))/g,
      '<BrowserRouter basename="/preview"$1'
    );

    if (patched !== content) {
      await fs.writeFile(file, patched);
      console.log(`  Patched BrowserRouter basename in ${path.relative(projectRoot, file)}`);
    }
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
