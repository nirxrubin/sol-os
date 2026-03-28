import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { getCheerioSelector } from '../engine/source.js';

interface ContentField {
  id: string;
  name: string;
  type: 'text' | 'richtext' | 'image' | 'date' | 'url' | 'number' | 'boolean' | 'select' | 'email';
  required: boolean;
}

interface ContentItem {
  id: string;
  data: Record<string, unknown>;
  status: 'published' | 'draft';
  createdAt: string;
  updatedAt: string;
}

interface CMSBinding {
  itemId: string;
  fieldName: string;
  page: string;
  selector: string;
}

// Source-code array bindings for SPA projects
interface SourceArrayBinding {
  file: string;       // Relative path to source file
  varName: string;    // Variable name (e.g., 'articles')
  itemIndex: number;  // Index in the array
}

interface ContentType {
  id: string;
  name: string;
  fields: ContentField[];
  items: ContentItem[];
  linkedPages: string[];
  bindings?: Record<string, CMSBinding[]>; // [itemId] -> bindings for each field
  sourceBindings?: {
    file: string;
    varName: string;
    items: Record<string, SourceArrayBinding>; // [itemId] -> source location
  };
}

export async function analyzeContent(projectRoot: string, fileTree: string[]): Promise<ContentType[]> {
  const contentTypes: ContentType[] = [];
  const htmlFiles = fileTree.filter((f) => f.endsWith('.html'));
  const now = new Date().toISOString();

  // Collect all HTML content for pattern detection
  const allHtmlData: { file: string; $: cheerio.CheerioAPI }[] = [];
  for (const htmlFile of htmlFiles) {
    try {
      const html = await fs.readFile(path.join(projectRoot, htmlFile), 'utf-8');
      allHtmlData.push({ file: htmlFile, $: cheerio.load(html) });
    } catch { /* skip */ }
  }

  // ─── Detect Team Members ──────────────────────────────────────
  const teamItems: ContentItem[] = [];
  const teamBindings: Record<string, CMSBinding[]> = {};

  for (const { $, file } of allHtmlData) {
    $('[class*="team"], [id*="team"], [class*="member"], [class*="staff"], [class*="people"]').each((_, section) => {
      const $section = $(section);
      const cards = $section.find('[class*="card"], [class*="member"], [class*="person"], [class*="col"], > div > div');
      if (cards.length >= 2) {
        cards.each((i, card) => {
          const $card = $(card);
          const $nameEl = $card.find('h3, h4, [class*="name"]').first();
          const $roleEl = $card.find('[class*="role"], [class*="title"], [class*="position"], p').first();
          const $bioEl = $card.find('[class*="bio"], [class*="desc"]').first();
          const $photoEl = $card.find('img').first();

          const name = $nameEl.text().trim();
          const role = $roleEl.text().trim();
          const bio = $bioEl.text().trim();
          const photo = $photoEl.attr('src') || '';

          if (name && name.length < 60) {
            const itemId = `team-${teamItems.length + 1}`;
            teamItems.push({
              id: itemId,
              data: { name, role: role !== name ? role : '', bio, photo },
              status: 'published',
              createdAt: now,
              updatedAt: now,
            });

            // Generate bindings
            const page = '/' + file;
            const bindings: CMSBinding[] = [];
            if ($nameEl.length) bindings.push({ itemId, fieldName: 'name', page, selector: getCheerioSelector($, $nameEl[0]) });
            if ($roleEl.length && role !== name) bindings.push({ itemId, fieldName: 'role', page, selector: getCheerioSelector($, $roleEl[0]) });
            if ($bioEl.length) bindings.push({ itemId, fieldName: 'bio', page, selector: getCheerioSelector($, $bioEl[0]) });
            if ($photoEl.length) bindings.push({ itemId, fieldName: 'photo', page, selector: getCheerioSelector($, $photoEl[0]) });
            teamBindings[itemId] = bindings;
          }
        });
      }
    });
  }

  if (teamItems.length > 0) {
    contentTypes.push({
      id: 'ct-team',
      name: 'Team Members',
      fields: [
        { id: 'f-name', name: 'name', type: 'text', required: true },
        { id: 'f-role', name: 'role', type: 'text', required: true },
        { id: 'f-bio', name: 'bio', type: 'richtext', required: false },
        { id: 'f-photo', name: 'photo', type: 'image', required: false },
      ],
      items: deduplicateItems(teamItems, 'name'),
      linkedPages: ['team'],
      bindings: teamBindings,
    });
  }

  // ─── Detect Blog Posts ────────────────────────────────────────
  const blogItems: ContentItem[] = [];
  const blogBindings: Record<string, CMSBinding[]> = {};

  for (const { $, file } of allHtmlData) {
    $('[class*="blog"], [class*="post"], [class*="article"], article, [class*="news"]').each((_, section) => {
      const $section = $(section);
      const cards = $section.find('[class*="card"], [class*="post"], article, [class*="item"], > div > div, > a');
      if (cards.length >= 2) {
        cards.each((_, card) => {
          const $card = $(card);
          const $titleEl = $card.find('h2, h3, [class*="title"]').first();
          const $excerptEl = $card.find('p, [class*="excerpt"], [class*="desc"]').first();
          const $dateEl = $card.find('time, [class*="date"]').first();
          const $coverEl = $card.find('img').first();
          const $categoryEl = $card.find('[class*="category"], [class*="tag"]').first();

          const title = $titleEl.text().trim();
          const excerpt = $excerptEl.text().trim();
          const date = $dateEl.text().trim();
          const cover = $coverEl.attr('src') || '';
          const category = $categoryEl.text().trim();

          if (title && title.length > 5 && title.length < 120) {
            const itemId = `blog-${blogItems.length + 1}`;
            blogItems.push({
              id: itemId,
              data: {
                title,
                slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                excerpt: excerpt !== title ? excerpt : '',
                body: '',
                cover,
                author: '',
                date: date || now,
                category: category || 'General',
              },
              status: 'published',
              createdAt: now,
              updatedAt: now,
            });

            // Generate bindings
            const page = '/' + file;
            const bindings: CMSBinding[] = [];
            if ($titleEl.length) bindings.push({ itemId, fieldName: 'title', page, selector: getCheerioSelector($, $titleEl[0]) });
            if ($excerptEl.length && excerpt !== title) bindings.push({ itemId, fieldName: 'excerpt', page, selector: getCheerioSelector($, $excerptEl[0]) });
            if ($coverEl.length) bindings.push({ itemId, fieldName: 'cover', page, selector: getCheerioSelector($, $coverEl[0]) });
            if ($dateEl.length) bindings.push({ itemId, fieldName: 'date', page, selector: getCheerioSelector($, $dateEl[0]) });
            if ($categoryEl.length) bindings.push({ itemId, fieldName: 'category', page, selector: getCheerioSelector($, $categoryEl[0]) });
            blogBindings[itemId] = bindings;
          }
        });
      }
    });
  }

  if (blogItems.length > 0) {
    contentTypes.push({
      id: 'ct-blog',
      name: 'Blog Posts',
      fields: [
        { id: 'f-title', name: 'title', type: 'text', required: true },
        { id: 'f-slug', name: 'slug', type: 'text', required: true },
        { id: 'f-excerpt', name: 'excerpt', type: 'text', required: false },
        { id: 'f-body', name: 'body', type: 'richtext', required: false },
        { id: 'f-cover', name: 'cover', type: 'image', required: false },
        { id: 'f-author', name: 'author', type: 'text', required: false },
        { id: 'f-date', name: 'date', type: 'date', required: false },
        { id: 'f-category', name: 'category', type: 'text', required: false },
      ],
      items: deduplicateItems(blogItems, 'title'),
      linkedPages: ['blog'],
      bindings: blogBindings,
    });
  }

  // ─── Detect Testimonials ──────────────────────────────────────
  const testimonialItems: ContentItem[] = [];
  const testimonialBindings: Record<string, CMSBinding[]> = {};

  for (const { $, file } of allHtmlData) {
    $('[class*="testimonial"], [class*="review"], [class*="quote"], blockquote').each((_, section) => {
      const $section = $(section);

      if (section.tagName === 'blockquote') {
        const quote = $section.text().trim();
        if (quote.length > 20) {
          const sibling = $section.next();
          const $nameEl = sibling.find('[class*="name"], strong, b').first();
          const name = $nameEl.text().trim() || sibling.text().trim();
          const itemId = `testimonial-${testimonialItems.length + 1}`;
          testimonialItems.push({
            id: itemId,
            data: { quote, name: name.substring(0, 60), role: '', company: '' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
          });
          const page = '/' + file;
          const bindings: CMSBinding[] = [
            { itemId, fieldName: 'quote', page, selector: getCheerioSelector($, section) },
          ];
          if ($nameEl.length) bindings.push({ itemId, fieldName: 'name', page, selector: getCheerioSelector($, $nameEl[0]) });
          testimonialBindings[itemId] = bindings;
        }
        return;
      }

      const cards = $section.find('[class*="card"], [class*="item"], [class*="slide"], > div > div, blockquote');
      if (cards.length >= 2) {
        cards.each((_, card) => {
          const $card = $(card);
          const $quoteEl = $card.find('p, blockquote, [class*="quote"], [class*="text"]').first();
          const $nameEl = $card.find('[class*="name"], [class*="author"], strong, h4').first();
          const $roleEl = $card.find('[class*="role"], [class*="title"], [class*="position"]').first();
          const $companyEl = $card.find('[class*="company"], [class*="org"]').first();

          const quote = $quoteEl.text().trim();
          const name = $nameEl.text().trim();
          const role = $roleEl.text().trim();
          const company = $companyEl.text().trim();

          if (quote && quote.length > 15) {
            const itemId = `testimonial-${testimonialItems.length + 1}`;
            testimonialItems.push({
              id: itemId,
              data: { quote: quote.substring(0, 500), name: name.substring(0, 60), role, company },
              status: 'published',
              createdAt: now,
              updatedAt: now,
            });
            const page = '/' + file;
            const bindings: CMSBinding[] = [];
            if ($quoteEl.length) bindings.push({ itemId, fieldName: 'quote', page, selector: getCheerioSelector($, $quoteEl[0]) });
            if ($nameEl.length) bindings.push({ itemId, fieldName: 'name', page, selector: getCheerioSelector($, $nameEl[0]) });
            if ($roleEl.length) bindings.push({ itemId, fieldName: 'role', page, selector: getCheerioSelector($, $roleEl[0]) });
            if ($companyEl.length) bindings.push({ itemId, fieldName: 'company', page, selector: getCheerioSelector($, $companyEl[0]) });
            testimonialBindings[itemId] = bindings;
          }
        });
      }
    });
  }

  if (testimonialItems.length > 0) {
    contentTypes.push({
      id: 'ct-testimonials',
      name: 'Testimonials',
      fields: [
        { id: 'f-name', name: 'name', type: 'text', required: true },
        { id: 'f-role', name: 'role', type: 'text', required: false },
        { id: 'f-company', name: 'company', type: 'text', required: false },
        { id: 'f-quote', name: 'quote', type: 'richtext', required: true },
      ],
      items: deduplicateItems(testimonialItems, 'quote'),
      linkedPages: [],
      bindings: testimonialBindings,
    });
  }

  // ─── Detect FAQs ──────────────────────────────────────────────
  const faqItems: ContentItem[] = [];
  const faqBindings: Record<string, CMSBinding[]> = {};

  for (const { $, file } of allHtmlData) {
    $('[class*="faq"], [class*="accordion"], details, [class*="question"]').each((_, section) => {
      const $section = $(section);

      if (section.tagName === 'details') {
        const $qEl = $section.find('summary');
        const question = $qEl.text().trim();
        const $aEl = $section.find('p, div:not(summary)').first();
        const answer = $aEl.text().trim();
        if (question) {
          const itemId = `faq-${faqItems.length + 1}`;
          faqItems.push({
            id: itemId,
            data: { question, answer, category: 'General', order: faqItems.length },
            status: 'published',
            createdAt: now,
            updatedAt: now,
          });
          const page = '/' + file;
          const bindings: CMSBinding[] = [];
          if ($qEl.length) bindings.push({ itemId, fieldName: 'question', page, selector: getCheerioSelector($, $qEl[0]) });
          if ($aEl.length) bindings.push({ itemId, fieldName: 'answer', page, selector: getCheerioSelector($, $aEl[0]) });
          faqBindings[itemId] = bindings;
        }
        return;
      }

      const items = $section.find('[class*="item"], [class*="question"], dt, > div');
      items.each((_, item) => {
        const $item = $(item);
        const $qEl = $item.find('h3, h4, [class*="question"], dt, button').first();
        const $aEl = $item.find('p, [class*="answer"], dd, [class*="content"]').first();
        const question = $qEl.text().trim();
        const answer = $aEl.text().trim();
        if (question && question.length > 5) {
          const itemId = `faq-${faqItems.length + 1}`;
          faqItems.push({
            id: itemId,
            data: { question, answer, category: 'General', order: faqItems.length },
            status: 'published',
            createdAt: now,
            updatedAt: now,
          });
          const page = '/' + file;
          const bindings: CMSBinding[] = [];
          if ($qEl.length) bindings.push({ itemId, fieldName: 'question', page, selector: getCheerioSelector($, $qEl[0]) });
          if ($aEl.length) bindings.push({ itemId, fieldName: 'answer', page, selector: getCheerioSelector($, $aEl[0]) });
          faqBindings[itemId] = bindings;
        }
      });
    });
  }

  if (faqItems.length > 0) {
    contentTypes.push({
      id: 'ct-faq',
      name: 'FAQs',
      fields: [
        { id: 'f-question', name: 'question', type: 'text', required: true },
        { id: 'f-answer', name: 'answer', type: 'richtext', required: true },
        { id: 'f-category', name: 'category', type: 'text', required: false },
        { id: 'f-order', name: 'order', type: 'number', required: false },
      ],
      items: deduplicateItems(faqItems, 'question'),
      linkedPages: [],
      bindings: faqBindings,
    });
  }

  // ─── Scan for JSON/Markdown content ───────────────────────────
  await scanDataFiles(projectRoot, fileTree, contentTypes, now);

  // ─── Scan source code for hardcoded data arrays (React/Vue/etc.) ─
  await scanSourceDataArrays(projectRoot, fileTree, contentTypes, now);

  return contentTypes;
}

async function scanDataFiles(
  projectRoot: string,
  fileTree: string[],
  contentTypes: ContentType[],
  now: string,
) {
  const dataFiles = fileTree.filter((f) =>
    (f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.mdx')) &&
    !f.includes('package') && !f.includes('tsconfig') && !f.includes('node_modules'),
  );

  const dirGroups = new Map<string, string[]>();
  for (const f of dataFiles) {
    const dir = path.dirname(f);
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir)!.push(f);
  }

  for (const [dir, files] of dirGroups) {
    if (files.length < 3) continue;

    const dirName = path.basename(dir);
    const existingType = contentTypes.find((ct) => ct.name.toLowerCase().includes(dirName.toLowerCase()));
    if (existingType) continue;

    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    if (jsonFiles.length >= 3) {
      const items: ContentItem[] = [];
      const fieldSet = new Set<string>();

      for (const jsonFile of jsonFiles) {
        try {
          const raw = await fs.readFile(path.join(projectRoot, jsonFile), 'utf-8');
          const data = JSON.parse(raw);
          if (typeof data === 'object' && !Array.isArray(data)) {
            Object.keys(data).forEach((k) => fieldSet.add(k));
            items.push({
              id: `${dirName}-${items.length + 1}`,
              data,
              status: 'published',
              createdAt: now,
              updatedAt: now,
            });
          }
        } catch { /* skip */ }
      }

      if (items.length >= 2) {
        const fields: ContentField[] = Array.from(fieldSet).map((name) => ({
          id: `f-${name}`,
          name,
          type: inferFieldType(name, items[0]?.data[name]),
          required: false,
        }));

        contentTypes.push({
          id: `ct-${dirName}`,
          name: capitalize(dirName.replace(/[-_]/g, ' ')),
          fields,
          items,
          linkedPages: [],
          // No bindings for data-file collections (they don't have DOM elements)
        });
      }
    }
  }
}

// ─── Source Code Data Array Detection ─────────────────────────────
// Scans .tsx/.jsx/.ts/.js files for hardcoded data arrays — the kind
// of content that should be CMS-controlled (products, articles, FAQs, etc.)
//
// Detects patterns like:
//   const articles = [ { title: '...', excerpt: '...' }, ... ];
//   const products = [ { name: '...', price: 128 }, ... ];

async function scanSourceDataArrays(
  projectRoot: string,
  fileTree: string[],
  contentTypes: ContentType[],
  now: string,
): Promise<void> {
  const sourceFiles = fileTree.filter(f =>
    /\.(tsx?|jsx?)$/.test(f) &&
    !f.includes('node_modules') &&
    !f.includes('.d.ts') &&
    !f.includes('/ui/') && // Skip UI component library files
    !f.includes('test') &&
    !f.includes('spec')
  );

  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
    } catch { continue; }

    // Find const/let/var declarations of arrays with object literals
    // Pattern: const NAME = [ { key: value, ... }, { key: value, ... } ];
    const arrayPattern = /(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*\[/g;
    let match;

    while ((match = arrayPattern.exec(content)) !== null) {
      const varName = match[1];
      const startIdx = match.index + match[0].length - 1; // Position of [

      // Extract the array content (balanced bracket matching)
      const arrayContent = extractBalancedBrackets(content, startIdx);
      if (!arrayContent || arrayContent.length < 20) continue;

      // Try to parse as JSON (with some cleanup for TS/JS syntax)
      const items = parseJSArrayToItems(arrayContent, varName, now);
      if (items.length < 2) continue; // Need at least 2 items to be a "collection"

      // Skip navigation/config/UI arrays — not CMS content
      const skipPatterns = [
        'nav', 'menu', 'link', 'route', 'tab', 'breadcrumb',
        'category', 'categories', 'filter', 'option', 'config', 'setting',
        'column', 'header', 'sidebar', 'breakpoint',
      ];
      if (skipPatterns.some(p => varName.toLowerCase().includes(p))) continue;

      // Determine content type from variable name
      const typeName = inferContentTypeName(varName);
      const typeId = `ct-${varName.toLowerCase()}`;

      // Skip if we already have a content type with similar name
      const existingType = contentTypes.find(ct =>
        ct.id === typeId ||
        ct.name.toLowerCase() === typeName.toLowerCase() ||
        ct.name.toLowerCase().includes(varName.toLowerCase())
      );
      if (existingType) continue;

      // Build fields from the items
      const fieldSet = new Map<string, unknown>();
      for (const item of items) {
        for (const [key, value] of Object.entries(item.data)) {
          if (!fieldSet.has(key)) fieldSet.set(key, value);
        }
      }

      const fields: ContentField[] = Array.from(fieldSet.entries()).map(([name, sampleValue]) => ({
        id: `f-${name}`,
        name,
        type: inferFieldType(name, sampleValue),
        required: items.every(item => item.data[name] != null && item.data[name] !== ''),
      }));

      if (fields.length < 2) continue; // Too simple to be CMS content

      // Determine linked pages from file location
      const linkedPage = file.replace(/^src\/pages\//, '').replace(/\.(tsx?|jsx?)$/, '').toLowerCase();

      // Build source bindings: map each item to its source location
      const sourceItems: Record<string, SourceArrayBinding> = {};
      items.forEach((item, idx) => {
        sourceItems[item.id] = { file, varName, itemIndex: idx };
      });

      contentTypes.push({
        id: typeId,
        name: typeName,
        fields,
        items,
        linkedPages: [linkedPage],
        sourceBindings: { file, varName, items: sourceItems },
      });

      console.log(`  Found source data array: ${varName} (${items.length} items) in ${file}`);
    }
  }
}

/**
 * Extract balanced brackets content starting from position of opening bracket.
 */
function extractBalancedBrackets(content: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = start; i < content.length && i < start + 10000; i++) {
    const ch = content[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        return content.substring(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Parse a JS/TS array literal into content items.
 * Handles: string values, number values, template literals (simplified).
 */
function parseJSArrayToItems(arrayStr: string, varName: string, now: string): ContentItem[] {
  const items: ContentItem[] = [];

  // Clean up JS/TS syntax to be JSON-parseable
  let cleaned = arrayStr
    // Remove trailing commas before ] or }
    .replace(/,\s*([\]}])/g, '$1')
    // Convert single-quoted strings to double-quoted
    .replace(/'/g, '"')
    // Remove template literals and replace with their content
    .replace(/`([^`]*)`/g, '"$1"')
    // Remove type annotations
    .replace(/as\s+\w+/g, '')
    // Handle unquoted keys
    .replace(/(\{[\s,]*|,\s*)(\w+)\s*:/g, '$1"$2":')
    // Remove JSX/component references as values (e.g., icon: <SomeIcon />)
    .replace(/"?\w+"?\s*:\s*<[^>]+\/>/g, '')
    // Remove function references
    .replace(/"?\w+"?\s*:\s*\([^)]*\)\s*=>\s*[^,}]+/g, '')
    // Remove import references (e.g., image: importedVar)
    .replace(/"?\w+"?\s*:\s*(?!["{\[\dtfn-])\w+\s*([,}])/g, '$1');

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    for (const obj of parsed) {
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) continue;

      // Filter out non-string/number values
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          data[key] = value;
        }
      }

      if (Object.keys(data).length >= 2) {
        items.push({
          id: `${varName}-${items.length + 1}`,
          data,
          status: 'published',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  } catch {
    // JSON parse failed — try a more lenient approach
    // Extract individual object literals
    const objectPattern = /\{([^{}]+)\}/g;
    let objMatch;
    while ((objMatch = objectPattern.exec(arrayStr)) !== null) {
      const data: Record<string, unknown> = {};
      const props = objMatch[1];

      // Extract key: 'value' or key: "value" or key: number
      const propPattern = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(\d+(?:\.\d+)?)|`([^`]*)`)/g;
      let propMatch;
      while ((propMatch = propPattern.exec(props)) !== null) {
        const key = propMatch[1];
        const value = propMatch[2] ?? propMatch[3] ?? propMatch[5] ?? (propMatch[4] ? Number(propMatch[4]) : null);
        if (value !== null) data[key] = value;
      }

      if (Object.keys(data).length >= 2) {
        items.push({
          id: `${varName}-${items.length + 1}`,
          data,
          status: 'published',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  return items;
}

/**
 * Infer a human-readable content type name from a variable name.
 */
function inferContentTypeName(varName: string): string {
  const nameMap: Record<string, string> = {
    articles: 'Articles',
    posts: 'Blog Posts',
    blogPosts: 'Blog Posts',
    products: 'Products',
    items: 'Items',
    team: 'Team Members',
    teamMembers: 'Team Members',
    members: 'Team Members',
    testimonials: 'Testimonials',
    reviews: 'Reviews',
    faqs: 'FAQs',
    questions: 'FAQs',
    services: 'Services',
    features: 'Features',
    projects: 'Projects',
    portfolio: 'Portfolio',
    categories: 'Categories',
    events: 'Events',
    partners: 'Partners',
    clients: 'Clients',
    verses: 'Verses',
    quotes: 'Quotes',
    gallery: 'Gallery',
    pricing: 'Pricing Plans',
    plans: 'Pricing Plans',
  };

  const lower = varName.toLowerCase();
  if (nameMap[lower]) return nameMap[lower];

  // CamelCase → space-separated, capitalize
  return varName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

function inferFieldType(name: string, value: unknown): ContentField['type'] {
  if (name.includes('image') || name.includes('photo') || name.includes('avatar') || name.includes('cover')) return 'image';
  if (name.includes('email')) return 'email';
  if (name.includes('url') || name.includes('link') || name.includes('href')) return 'url';
  if (name.includes('date') || name.includes('created') || name.includes('published')) return 'date';
  if (name.includes('body') || name.includes('content') || name.includes('description') || name.includes('bio')) return 'richtext';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
}

function deduplicateItems(items: ContentItem[], keyField: string): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.data[keyField] || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function capitalize(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
