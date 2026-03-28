import fs from 'fs/promises';
import path from 'path';
import { writeAnalysis, getProjectState, setProjectState } from '../state.js';
import { analyzeTech } from './tech.js';
import { analyzePages, analyzePagesFromRendered } from './pages.js';
import { analyzeContent, analyzeRenderedContent } from './content.js';
import { analyzeMedia } from './media.js';
import { analyzeReadiness } from './readiness.js';
import { buildProject } from './build.js';
import { detectSPARoutes } from './routes.js';
import { renderPages } from './renderer.js';
import { mergeAnalysis } from './merge.js';

export async function analyzeProject(projectRoot: string, fileTree: string[]) {
  console.log(`Analyzing project at ${projectRoot} (${fileTree.length} files)...`);

  // ── Step 1: Build if needed (React/Vite/etc.) ──────────────────
  const buildResult = await buildProject(projectRoot);

  if (buildResult.needed) {
    console.log(`  Build needed: ${buildResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (buildResult.buildError) {
      console.log(`  Build error: ${buildResult.buildError.slice(0, 200)}`);
    }

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

  // ── Step 2: Static analysis (parallel) ─────────────────────────
  const [sectors, sourcePages, staticContent, media] = await Promise.all([
    analyzeTech(projectRoot, fileTree),
    analyzePages(projectRoot, fileTree),
    analyzeContent(projectRoot, fileTree),
    analyzeMedia(projectRoot, fileTree),
  ]);

  // ── Step 3: SPA route detection from source ────────────────────
  let staticPages = sourcePages;
  if (buildResult.needed && buildResult.success) {
    const spaRoutes = await detectSPARoutes(projectRoot, fileTree);
    if (spaRoutes.length > 0) {
      staticPages = spaRoutes;
      console.log(`  SPA routes detected: ${spaRoutes.map(r => r.path).join(', ')}`);
    } else if (sourcePages.length === 0) {
      const builtFileTree = await walkDir(buildResult.servePath, buildResult.servePath);
      const builtPages = await analyzePages(buildResult.servePath, builtFileTree);
      if (builtPages.length > 0) {
        staticPages = builtPages;
      }
    }

    if (staticPages.length === 0) {
      staticPages = [{
        id: 'page-home',
        name: await deriveProjectNameFromPkg(projectRoot) || 'Home',
        path: '/',
        seoStatus: 'partial' as const,
        sections: [],
      }];
    }
  }

  console.log(`  Static: ${sectors.length} sectors, ${staticPages.length} pages, ${staticContent.length} content types (${staticContent.reduce((n, ct) => n + ct.items.length, 0)} items), ${media.length} media`);

  // ── Step 4: Puppeteer rendering ────────────────────────────────
  let renderedPageData: Awaited<ReturnType<typeof renderPages>> = [];
  try {
    const state = getProjectState();
    const entryFile = state?.entryFile || 'index.html';
    renderedPageData = await renderPages(entryFile, staticPages.map((p) => p.path));
  } catch (err) {
    console.warn('  Puppeteer rendering skipped:', err instanceof Error ? err.message : err);
  }

  // ── Step 4b: Analyze rendered DOM ──────────────────────────────
  let renderedPages: Awaited<ReturnType<typeof analyzePagesFromRendered>> = [];
  let renderedContent: Awaited<ReturnType<typeof analyzeRenderedContent>> = [];

  if (renderedPageData.length > 0) {
    renderedPages = analyzePagesFromRendered(renderedPageData);
    renderedContent = await analyzeRenderedContent(renderedPageData);
    console.log(`  Rendered: ${renderedPages.length} pages, ${renderedContent.length} content types (${renderedContent.reduce((n, ct) => n + ct.items.length, 0)} items)`);
  }

  // ── Step 5: Merge static + rendered ────────────────────────────
  const { pages, contentTypes } = mergeAnalysis(
    staticPages, staticContent, renderedPages, renderedContent,
  );

  console.log(`  Merged: ${pages.length} pages, ${contentTypes.length} content types (${contentTypes.reduce((n, ct) => n + ct.items.length, 0)} items)`);

  // ── Step 6: Readiness ──────────────────────────────────────────
  const { items: readinessItems, score: readinessScore } = await analyzeReadiness(
    projectRoot,
    fileTree,
    pages.length,
    contentTypes.length,
    media.length,
  );

  console.log(`  Readiness: ${readinessScore}%`);

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
  const homePage = pages.find((p) => p.path === '/');
  if (homePage && homePage.name !== 'Home' && homePage.name.length < 40) {
    return homePage.name;
  }

  try {
    const indexHtml = await fs.readFile(path.join(projectRoot, 'index.html'), 'utf-8');
    const titleMatch = indexHtml.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim().split(/\s*[|–—-]\s*/)[0].trim();
      if (title && title.length > 0 && title.length < 40) return title;
    }
  } catch { /* ignore */ }

  const pkgName = await deriveProjectNameFromPkg(projectRoot);
  if (pkgName) return pkgName;

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
        .replace(/^@[^/]+\//, '')
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
