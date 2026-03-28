import fs from 'fs/promises';
import path from 'path';
import { writeAnalysis, getProjectState, setProjectState } from '../state.js';
import { analyzeTech } from './tech.js';
import { analyzePages } from './pages.js';
import { analyzeContent } from './content.js';
import { analyzeMedia } from './media.js';
import { analyzeReadiness } from './readiness.js';
import { buildProject } from './build.js';
import { detectSPARoutes } from './routes.js';

export async function analyzeProject(projectRoot: string, fileTree: string[]) {
  console.log(`Analyzing project at ${projectRoot} (${fileTree.length} files)...`);

  // ── Step 1: Build if needed (React/Vite/etc.) ──────────────────
  const buildResult = await buildProject(projectRoot);

  if (buildResult.needed) {
    console.log(`  Build needed: ${buildResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (buildResult.buildError) {
      console.log(`  Build error: ${buildResult.buildError.slice(0, 200)}`);
    }

    // Update project state with servePath and build info
    const state = getProjectState();
    if (state) {
      setProjectState({
        ...state,
        servePath: buildResult.servePath,
        buildNeeded: true,
        buildSuccess: buildResult.success,
        buildError: buildResult.buildError,
      });
    }
  }

  // ── Step 2: Run analyzers ──────────────────────────────────────
  // Analyze source for tech/content/media, analyze built output for pages
  const [sectors, sourcePages, contentTypes, media] = await Promise.all([
    analyzeTech(projectRoot, fileTree),
    analyzePages(projectRoot, fileTree),
    analyzeContent(projectRoot, fileTree),
    analyzeMedia(projectRoot, fileTree),
  ]);

  // ── Step 3: For SPA projects, detect routes from source code ───
  let pages = sourcePages;
  if (buildResult.needed && buildResult.success) {
    // SPA projects may only have one index.html — detect routes from source
    const spaRoutes = await detectSPARoutes(projectRoot, fileTree);
    if (spaRoutes.length > 0) {
      pages = spaRoutes;
      console.log(`  SPA routes detected: ${spaRoutes.map(r => r.path).join(', ')}`);
    } else if (sourcePages.length === 0) {
      // Analyze the built output for pages if source had none
      const builtFileTree = await walkDir(buildResult.servePath, buildResult.servePath);
      const builtPages = await analyzePages(buildResult.servePath, builtFileTree);
      if (builtPages.length > 0) {
        pages = builtPages;
      }
    }

    // Ensure at least a home page exists for SPA projects
    if (pages.length === 0) {
      pages = [{
        id: 'page-home',
        name: await deriveProjectNameFromPkg(projectRoot) || 'Home',
        path: '/',
        seoStatus: 'partial' as const,
        sections: [],
      }];
    }
  }

  console.log(`  Tech sectors: ${sectors.length}`);
  console.log(`  Pages: ${pages.length}`);
  console.log(`  Content types: ${contentTypes.length} (${contentTypes.reduce((n, ct) => n + ct.items.length, 0)} items)`);
  console.log(`  Media assets: ${media.length}`);

  // Readiness depends on other results
  const { items: readinessItems, score: readinessScore } = await analyzeReadiness(
    projectRoot,
    fileTree,
    pages.length,
    contentTypes.length,
    media.length,
  );

  console.log(`  Readiness: ${readinessScore}%`);

  // Derive project name
  const name = await deriveProjectName(projectRoot, pages);

  const project = {
    name,
    url: '',
    pages,
    contentTypes,
    media,
    sectors,
    readinessItems,
    readinessScore,
    buildInfo: buildResult.needed ? {
      needed: true,
      success: buildResult.success,
      error: buildResult.buildError,
      duration: buildResult.duration,
    } : undefined,
  };

  await writeAnalysis(project);
  console.log('Analysis written to .sol-analysis.json');
}

async function deriveProjectName(projectRoot: string, pages: { name: string; path: string }[]): Promise<string> {
  // Use home page name if it's not generic
  const homePage = pages.find((p) => p.path === '/');
  if (homePage && homePage.name !== 'Home' && homePage.name.length < 40) {
    return homePage.name;
  }

  // Try index.html <title> tag
  try {
    const indexHtml = await fs.readFile(path.join(projectRoot, 'index.html'), 'utf-8');
    const titleMatch = indexHtml.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim().split(/\s*[|–—-]\s*/)[0].trim();
      if (title && title.length > 0 && title.length < 40) return title;
    }
  } catch { /* ignore */ }

  // Try package.json name
  const pkgName = await deriveProjectNameFromPkg(projectRoot);
  if (pkgName) return pkgName;

  // Fall back to directory name
  const dirName = projectRoot.split('/').filter(Boolean).pop() || 'Imported Project';
  return dirName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function deriveProjectNameFromPkg(projectRoot: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    const genericNames = ['vite-project', 'my-app', 'app', 'vite-react-shadcn-ts', 'react-app', 'my-project', 'frontend', 'client', 'web'];
    if (pkg.name && !genericNames.includes(pkg.name.toLowerCase())) {
      const name = pkg.name
        .replace(/^@[^/]+\//, '') // Remove scope
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      if (name.length > 0 && name.length < 40) return name;
    }
  } catch { /* ignore */ }
  return null;
}

async function walkDir(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await walkDir(fullPath, root));
      } else {
        results.push(path.relative(root, fullPath));
      }
    }
  } catch { /* ignore */ }
  return results;
}
