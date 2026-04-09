/**
 * Merge Layer
 *
 * Combines static Cheerio analysis with Puppeteer-rendered analysis.
 * Static results are highest confidence; rendered fills gaps from SPAs.
 * Deduplicates pages by path and content types by name/id.
 */

interface Page {
  id: string;
  name: string;
  path: string;
  seoStatus: 'complete' | 'partial' | 'missing';
  sections: { id: string; type: string; name: string; bindings: any[] }[];
}

interface ContentItem {
  id: string;
  data: Record<string, unknown>;
  status: 'published' | 'draft';
  createdAt: string;
  updatedAt: string;
}

interface ContentType {
  id: string;
  name: string;
  fields: { id: string; name: string; type: string; required: boolean }[];
  items: ContentItem[];
  linkedPages: string[];
  bindings?: Record<string, any[]>;
}

export function mergeAnalysis(
  staticPages: Page[],
  staticContent: ContentType[],
  renderedPages: Page[],
  renderedContent: ContentType[],
): { pages: Page[]; contentTypes: ContentType[] } {
  return {
    pages: mergePages(staticPages, renderedPages),
    contentTypes: mergeContentTypes(staticContent, renderedContent),
  };
}

// ─── Merge Pages ─────────────────────────────────────────────────
// Static pages take priority. Rendered pages fill in SPA routes.

function mergePages(staticPages: Page[], renderedPages: Page[]): Page[] {
  const merged = new Map<string, Page>();

  // Add static pages first (highest priority)
  for (const page of staticPages) {
    merged.set(page.path, page);
  }

  // Add rendered pages that don't exist in static
  for (const page of renderedPages) {
    if (!merged.has(page.path)) {
      merged.set(page.path, page);
    } else {
      // If static page has fewer sections, use rendered (it has JS content)
      const existing = merged.get(page.path)!;
      if (page.sections.length > existing.sections.length) {
        // Keep static SEO status (from real meta tags), but use rendered sections
        merged.set(page.path, {
          ...page,
          seoStatus: existing.seoStatus,
        });
      }
    }
  }

  // Sort: home first, then alphabetical
  const pages = Array.from(merged.values());
  pages.sort((a, b) => {
    if (a.path === '/') return -1;
    if (b.path === '/') return 1;
    return a.name.localeCompare(b.name);
  });

  return pages;
}

// ─── Merge Content Types ─────────────────────────────────────────
// Static content types with bindings take priority.
// Rendered content types fill gaps (e.g., blog posts in SPAs).

function mergeContentTypes(
  staticTypes: ContentType[],
  renderedTypes: ContentType[],
): ContentType[] {
  const merged = new Map<string, ContentType>();

  // Add static first
  for (const ct of staticTypes) {
    merged.set(ct.id, ct);
  }

  // Add or merge rendered types
  for (const ct of renderedTypes) {
    if (!merged.has(ct.id)) {
      // New content type only found in rendered DOM
      merged.set(ct.id, ct);
    } else {
      // Both exist: merge items (rendered may have found more)
      const existing = merged.get(ct.id)!;
      const mergedItems = mergeItems(existing.items, ct.items, ct.id);
      merged.set(ct.id, {
        ...existing,
        items: mergedItems,
        linkedPages: [...new Set([...existing.linkedPages, ...ct.linkedPages])],
      });
    }
  }

  return Array.from(merged.values());
}

// ─── Merge Items ─────────────────────────────────────────────────
// Deduplicate by key field (title for blogs, name for team, etc.)

function mergeItems(
  existing: ContentItem[],
  rendered: ContentItem[],
  contentTypeId: string,
): ContentItem[] {
  const keyField = getKeyField(contentTypeId);
  const seen = new Set<string>();
  const merged: ContentItem[] = [];

  // Existing items first (have bindings)
  for (const item of existing) {
    const key = normalizeKey(String(item.data[keyField] || ''));
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  // Add rendered items not already present
  for (const item of rendered) {
    const key = normalizeKey(String(item.data[keyField] || ''));
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function getKeyField(contentTypeId: string): string {
  switch (contentTypeId) {
    case 'ct-blog': return 'title';
    case 'ct-team': return 'name';
    case 'ct-testimonials': return 'quote';
    case 'ct-faq': return 'question';
    default: return 'title';
  }
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}
