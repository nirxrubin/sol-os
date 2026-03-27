import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

interface ReadinessItem {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'in-progress' | 'blocked' | 'not-started';
  sector: string;
  automation: 'automated' | 'guided' | 'manual';
}

interface ReadinessResult {
  items: ReadinessItem[];
  score: number;
}

export async function analyzeReadiness(
  projectRoot: string,
  fileTree: string[],
  pagesCount: number,
  contentTypesCount: number,
  mediaCount: number,
): Promise<ReadinessResult> {
  const items: ReadinessItem[] = [];

  // Read main HTML for checks
  let mainHtml = '';
  const indexPath = path.join(projectRoot, 'index.html');
  try {
    mainHtml = await fs.readFile(indexPath, 'utf-8');
  } catch { /* no index.html */ }
  const $ = mainHtml ? cheerio.load(mainHtml) : null;

  // ─── Content ──────────────────────────────────────────────────
  items.push({
    id: 'r-content-extracted',
    label: 'Content extracted',
    description: `${contentTypesCount} content types identified`,
    status: contentTypesCount > 0 ? 'complete' : 'not-started',
    sector: 'cms',
    automation: 'automated',
  });

  items.push({
    id: 'r-pages-analyzed',
    label: 'Page structure analyzed',
    description: `${pagesCount} pages discovered`,
    status: pagesCount > 0 ? 'complete' : 'not-started',
    sector: 'frontend',
    automation: 'automated',
  });

  items.push({
    id: 'r-media-audited',
    label: 'Media assets audited',
    description: `${mediaCount} assets cataloged`,
    status: mediaCount > 0 ? 'complete' : 'not-started',
    sector: 'assets',
    automation: 'automated',
  });

  // ─── Frontend ─────────────────────────────────────────────────
  const hasPackageJson = fileTree.includes('package.json');
  items.push({
    id: 'r-frontend-detected',
    label: 'Frontend framework detected',
    description: hasPackageJson ? 'Build system found' : 'Static HTML site',
    status: 'complete',
    sector: 'frontend',
    automation: 'automated',
  });

  // ─── SEO ──────────────────────────────────────────────────────
  const hasMeta = $ ? ($('meta[name="description"]').length > 0) : false;
  const hasOG = $ ? ($('meta[property="og:title"]').length > 0) : false;
  const hasSitemap = fileTree.includes('sitemap.xml');
  const hasRobots = fileTree.includes('robots.txt');

  items.push({
    id: 'r-seo-meta',
    label: 'Meta tags configured',
    description: 'Title, description, OG tags',
    status: hasMeta && hasOG ? 'complete' : hasMeta ? 'in-progress' : 'not-started',
    sector: 'seo',
    automation: 'automated',
  });

  items.push({
    id: 'r-seo-sitemap',
    label: 'Sitemap generated',
    description: 'XML sitemap for search engines',
    status: hasSitemap ? 'complete' : 'not-started',
    sector: 'seo',
    automation: 'automated',
  });

  items.push({
    id: 'r-seo-robots',
    label: 'Robots.txt configured',
    description: 'Crawler directives',
    status: hasRobots ? 'complete' : 'not-started',
    sector: 'seo',
    automation: 'automated',
  });

  // ─── Analytics ────────────────────────────────────────────────
  const htmlStr = mainHtml.toLowerCase();
  const hasAnalytics = htmlStr.includes('google-analytics') || htmlStr.includes('gtag') ||
    htmlStr.includes('plausible') || htmlStr.includes('posthog') || htmlStr.includes('segment');

  items.push({
    id: 'r-analytics',
    label: 'Analytics configured',
    description: 'Visitor tracking',
    status: hasAnalytics ? 'complete' : 'not-started',
    sector: 'analytics',
    automation: 'automated',
  });

  // ─── Hosting & Domain ────────────────────────────────────────
  items.push({
    id: 'r-hosting',
    label: 'Hosting selected',
    description: 'Deployment target',
    status: 'not-started',
    sector: 'hosting',
    automation: 'guided',
  });

  items.push({
    id: 'r-domain',
    label: 'Domain configured',
    description: 'Custom domain setup',
    status: 'not-started',
    sector: 'domain',
    automation: 'guided',
  });

  // ─── Security ─────────────────────────────────────────────────
  items.push({
    id: 'r-ssl',
    label: 'SSL certificate',
    description: 'HTTPS encryption',
    status: 'not-started',
    sector: 'security',
    automation: 'automated',
  });

  // ─── Legal ────────────────────────────────────────────────────
  const hasPrivacy = fileTree.some((f) => f.toLowerCase().includes('privacy'));
  const hasTerms = fileTree.some((f) => f.toLowerCase().includes('terms'));

  items.push({
    id: 'r-privacy',
    label: 'Privacy policy',
    description: 'GDPR/CCPA compliance',
    status: hasPrivacy ? 'complete' : 'not-started',
    sector: 'legal',
    automation: 'manual',
  });

  items.push({
    id: 'r-terms',
    label: 'Terms of service',
    description: 'Legal terms page',
    status: hasTerms ? 'complete' : 'not-started',
    sector: 'legal',
    automation: 'manual',
  });

  // ─── Image Optimization ───────────────────────────────────────
  items.push({
    id: 'r-image-opt',
    label: 'Image optimization',
    description: 'Compress and convert to modern formats',
    status: 'not-started',
    sector: 'assets',
    automation: 'automated',
  });

  // Calculate score
  const completed = items.filter((i) => i.status === 'complete').length;
  const score = Math.round((completed / items.length) * 100);

  return { items, score };
}
