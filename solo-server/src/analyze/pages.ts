import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

interface Section {
  id: string;
  type: 'hero' | 'header' | 'features' | 'testimonials' | 'cta' | 'footer' | 'stats' | 'logos' | 'generic';
  name: string;
  bindings: { fieldId: string; contentTypeId: string; fieldName: string }[];
}

interface Page {
  id: string;
  name: string;
  path: string;
  seoStatus: 'complete' | 'partial' | 'missing';
  sections: Section[];
}

export async function analyzePages(projectRoot: string, fileTree: string[]): Promise<Page[]> {
  const htmlFiles = fileTree.filter((f) => f.endsWith('.html'));
  if (htmlFiles.length === 0) return [];

  const pages: Page[] = [];

  for (const htmlFile of htmlFiles) {
    const fullPath = path.join(projectRoot, htmlFile);
    let html: string;
    try {
      html = await fs.readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const $ = cheerio.load(html);
    const title = $('title').text().trim();
    const metaDesc = $('meta[name="description"]').attr('content');
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');

    // SEO status
    let seoStatus: Page['seoStatus'] = 'missing';
    if (title && metaDesc && ogTitle && ogDesc) {
      seoStatus = 'complete';
    } else if (title || metaDesc) {
      seoStatus = 'partial';
    }

    // Derive page name from file path
    const pageName = derivePageName(htmlFile, title);
    const pagePath = htmlFile === 'index.html' ? '/' : '/' + htmlFile.replace(/\.html$/, '').replace(/\/index$/, '');
    const pageId = 'page-' + pagePath.replace(/[^a-z0-9]/gi, '-').replace(/^-|-$/g, '') || 'page-home';

    // Detect sections
    const sections = detectSections($, pageId);

    pages.push({ id: pageId, name: pageName, path: pagePath, seoStatus, sections });
  }

  // Sort: index.html first, then alphabetical
  pages.sort((a, b) => {
    if (a.path === '/') return -1;
    if (b.path === '/') return 1;
    return a.name.localeCompare(b.name);
  });

  return pages;
}

function derivePageName(filePath: string, title: string): string {
  if (title) {
    // Use first part of title (before " | " or " - ")
    const clean = title.split(/\s*[|–—-]\s*/)[0].trim();
    if (clean.length > 0 && clean.length < 40) return clean;
  }

  // Derive from file path
  const base = path.basename(filePath, '.html');
  if (base === 'index') {
    const dir = path.dirname(filePath);
    if (dir === '.') return 'Home';
    return capitalize(path.basename(dir));
  }
  return capitalize(base.replace(/[-_]/g, ' '));
}

function capitalize(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectSections($: cheerio.CheerioAPI, pageId: string): Section[] {
  const sections: Section[] = [];
  let sectionIndex = 0;

  // Check for nav/header
  const nav = $('nav, header, [role="navigation"]').first();
  if (nav.length) {
    sections.push({
      id: `${pageId}-nav`,
      type: 'header',
      name: 'Navigation',
      bindings: [],
    });
  }

  // Scan all section-like elements
  $('section, [class*="section"], main > div, article').each((_, el) => {
    const $el = $(el);
    const text = $el.text().toLowerCase();
    const classes = ($el.attr('class') || '').toLowerCase();
    const id = ($el.attr('id') || '').toLowerCase();
    sectionIndex++;

    const sectionType = inferSectionType($, $el, text, classes, id);
    const sectionName = inferSectionName(sectionType, classes, id, sectionIndex);

    sections.push({
      id: `${pageId}-section-${sectionIndex}`,
      type: sectionType,
      name: sectionName,
      bindings: [],
    });
  });

  // Check for footer
  const footer = $('footer, [role="contentinfo"]').first();
  if (footer.length) {
    sections.push({
      id: `${pageId}-footer`,
      type: 'footer',
      name: 'Footer',
      bindings: [],
    });
  }

  // Deduplicate: if we already added nav/footer from section scan, remove duplicates
  return deduplicateSections(sections);
}

function inferSectionType(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<cheerio.Element>,
  text: string,
  classes: string,
  id: string,
): Section['type'] {
  // Hero: first section with h1 or hero-related class
  if (classes.includes('hero') || id.includes('hero') || $el.find('h1').length > 0) return 'hero';

  // Testimonials: repeated quote patterns
  if (classes.includes('testimonial') || id.includes('testimonial') || text.includes('testimonial')) return 'testimonials';
  if ($el.find('blockquote').length >= 2) return 'testimonials';

  // Features/services
  if (classes.includes('feature') || id.includes('feature') || classes.includes('service')) return 'features';

  // Stats
  if (classes.includes('stat') || id.includes('stat')) return 'stats';
  if (classes.includes('counter') || id.includes('counter')) return 'stats';

  // CTA
  if (classes.includes('cta') || id.includes('cta') || classes.includes('call-to-action')) return 'cta';

  // Logos
  if (classes.includes('logo') || id.includes('logo') || classes.includes('partner') || classes.includes('client')) return 'logos';

  return 'generic';
}

function inferSectionName(type: Section['type'], classes: string, id: string, index: number): string {
  const nameMap: Record<string, string> = {
    hero: 'Hero',
    header: 'Navigation',
    features: 'Features',
    testimonials: 'Testimonials',
    cta: 'Call to Action',
    footer: 'Footer',
    stats: 'Statistics',
    logos: 'Client Logos',
  };
  if (type !== 'generic') return nameMap[type] || capitalize(type);

  // Try to derive from class/id
  const meaningful = (id || classes).split(/[\s-_]+/).find((w) =>
    !['section', 'container', 'wrapper', 'inner', 'outer', 'row', 'col'].includes(w) && w.length > 2,
  );
  if (meaningful) return capitalize(meaningful);

  return `Section ${index}`;
}

function deduplicateSections(sections: Section[]): Section[] {
  const seen = new Set<string>();
  return sections.filter((s) => {
    const key = s.type + '-' + s.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
