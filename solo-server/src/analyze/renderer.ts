/**
 * Puppeteer Renderer
 *
 * Renders pages in headless Chrome to capture JS-generated content.
 * Discovers SPA routes and navigates to each one.
 * Returns rendered HTML for each page/route for downstream analysis.
 */

import puppeteer, { type Page as PuppeteerPage } from 'puppeteer';

// ─── Types ────────────────────────────────────────────────────────

export interface RenderedPage {
  path: string;            // route path, e.g., "/blog"
  url: string;             // full URL visited
  renderedHTML: string;     // document.documentElement.outerHTML after JS
  innerText: string;        // document.body.innerText (plain text)
  title: string;           // document.title after render
  isVirtualRoute: boolean; // true if SPA route (not a real .html file)
}

// ─── Constants ────────────────────────────────────────────────────

const PREVIEW_BASE = 'http://localhost:3001/preview';
const PAGE_TIMEOUT = 8000;
const TOTAL_TIMEOUT = 60000;
const RENDER_SETTLE_MS = 500; // wait for JS to settle after navigation

// ─── Main Entry ───────────────────────────────────────────────────

export async function renderPages(
  entryFile: string,
  staticPagePaths: string[],
): Promise<RenderedPage[]> {
  const startTime = Date.now();
  const results: RenderedPage[] = [];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT);

    // Suppress console noise from the rendered page
    page.on('console', () => {});
    page.on('pageerror', () => {});

    // ─── Step 1: Load entry page ────────────────────────────────
    const entryUrl = `${PREVIEW_BASE}/${entryFile}`;
    await page.goto(entryUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 3000 }).catch(() => {});
    await sleep(RENDER_SETTLE_MS);

    // Capture entry page
    const entryRendered = await capturePage(page, '/', entryUrl, false);
    results.push(entryRendered);

    // ─── Step 2: Discover SPA routes ────────────────────────────
    const spaRoutes = await discoverSPARoutes(page);
    console.log(`  Puppeteer: discovered ${spaRoutes.length} SPA routes: ${spaRoutes.join(', ')}`);

    // ─── Step 3: Visit each SPA route ───────────────────────────
    for (const route of spaRoutes) {
      if (Date.now() - startTime > TOTAL_TIMEOUT) {
        console.warn('  Puppeteer: total timeout reached, stopping');
        break;
      }

      try {
        const navigated = await navigateToSPARoute(page, route);
        if (navigated) {
          await sleep(RENDER_SETTLE_MS);
          const rendered = await capturePage(page, `/${route}`, `${entryUrl}#${route}`, true);
          // Only add if there's meaningful content (not empty sections)
          if (rendered.innerText.trim().length > 50) {
            results.push(rendered);
          }
        }
      } catch {
        // Skip routes that fail to render
      }
    }

    // ─── Step 4: Visit static HTML pages not already covered ────
    for (const pagePath of staticPagePaths) {
      if (pagePath === '/') continue; // Already captured as entry
      if (results.some((r) => r.path === pagePath)) continue;

      if (Date.now() - startTime > TOTAL_TIMEOUT) break;

      try {
        const htmlPath = pagePath.endsWith('.html') ? pagePath : pagePath + '.html';
        const url = `${PREVIEW_BASE}${htmlPath}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });
        await sleep(RENDER_SETTLE_MS);
        const rendered = await capturePage(page, pagePath, url, false);
        results.push(rendered);
      } catch {
        // Skip pages that fail to load
      }
    }

    await page.close();
  } catch (err) {
    console.warn('  Puppeteer rendering error:', err);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  console.log(`  Puppeteer: captured ${results.length} pages in ${Date.now() - startTime}ms`);
  return results;
}

// ─── Capture current page state ──────────────────────────────────

async function capturePage(
  page: PuppeteerPage,
  path: string,
  url: string,
  isVirtualRoute: boolean,
): Promise<RenderedPage> {
  const [renderedHTML, innerText, title] = await Promise.all([
    page.evaluate(() => document.documentElement.outerHTML),
    page.evaluate(() => document.body.innerText),
    page.evaluate(() => document.title),
  ]);

  return { path, url, renderedHTML, innerText, title, isVirtualRoute };
}

// ─── Discover SPA routes from DOM ────────────────────────────────

async function discoverSPARoutes(page: PuppeteerPage): Promise<string[]> {
  return page.evaluate(() => {
    const routes = new Set<string>();

    // Pattern 1: <a data-page="blog"> or <a href="#blog">
    document.querySelectorAll('a[data-page], a[href^="#"]').forEach((a) => {
      const dataPage = a.getAttribute('data-page');
      if (dataPage) routes.add(dataPage);

      const href = a.getAttribute('href');
      if (href && href.startsWith('#') && href.length > 1) {
        routes.add(href.slice(1));
      }
    });

    // Pattern 2: onclick="navigate('blog')" or onclick="navigate('blog',event)"
    document.querySelectorAll('[onclick]').forEach((el) => {
      const onclick = el.getAttribute('onclick') || '';
      const match = onclick.match(/navigate\s*\(\s*['"]([^'"]+)['"]/);
      if (match) routes.add(match[1]);
    });

    // Pattern 3: <section id="page-blog"> — SPA page containers
    document.querySelectorAll('section[id^="page-"]').forEach((section) => {
      const id = section.getAttribute('id')!;
      const route = id.replace(/^page-/, '');
      if (route && route !== 'home') {
        routes.add(route);
      }
    });

    // Pattern 4: nav links with specific patterns
    document.querySelectorAll('nav a, .nav-links a').forEach((a) => {
      const href = a.getAttribute('href');
      const onclick = a.getAttribute('onclick') || '';
      const dataPage = a.getAttribute('data-page');

      if (dataPage) routes.add(dataPage);
      else if (href && href.startsWith('#') && href.length > 1) {
        routes.add(href.slice(1));
      }
      else {
        const navMatch = onclick.match(/navigate\s*\(\s*['"]([^'"]+)['"]/);
        if (navMatch) routes.add(navMatch[1]);
      }
    });

    // Remove 'home' — it's the entry page already captured
    routes.delete('home');

    return Array.from(routes);
  });
}

// ─── Navigate to a SPA route ─────────────────────────────────────

async function navigateToSPARoute(page: PuppeteerPage, route: string): Promise<boolean> {
  return page.evaluate(async (r: string) => {
    // Try calling navigate() if it exists (common SPA pattern)
    if (typeof (window as any).navigate === 'function') {
      (window as any).navigate(r);
      return true;
    }

    // Try clicking a nav link with data-page or matching onclick
    const navLink = document.querySelector(`[data-page="${r}"]`) as HTMLElement
      || document.querySelector(`a[onclick*="navigate('${r}'"]`) as HTMLElement;
    if (navLink) {
      navLink.click();
      return true;
    }

    // Try hash navigation
    window.location.hash = r;
    return true;
  }, route);
}

// ─── Helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
