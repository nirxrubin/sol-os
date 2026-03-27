import { writeAnalysis } from '../state.js';
import { analyzeTech } from './tech.js';
import { analyzePages } from './pages.js';
import { analyzeContent } from './content.js';
import { analyzeMedia } from './media.js';
import { analyzeReadiness } from './readiness.js';

export async function analyzeProject(projectRoot: string, fileTree: string[]) {
  console.log(`Analyzing project at ${projectRoot} (${fileTree.length} files)...`);

  // Run all analyzers
  const [sectors, pages, contentTypes, media] = await Promise.all([
    analyzeTech(projectRoot, fileTree),
    analyzePages(projectRoot, fileTree),
    analyzeContent(projectRoot, fileTree),
    analyzeMedia(projectRoot, fileTree),
  ]);

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

  // Derive project name from index.html title or directory name
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

  // Fall back to directory name
  const dirName = projectRoot.split('/').filter(Boolean).pop() || 'Imported Project';
  return dirName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
