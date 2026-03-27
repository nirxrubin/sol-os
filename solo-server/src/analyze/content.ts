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

interface ContentType {
  id: string;
  name: string;
  fields: ContentField[];
  items: ContentItem[];
  linkedPages: string[];
  bindings?: Record<string, CMSBinding[]>; // [itemId] → bindings for each field
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
