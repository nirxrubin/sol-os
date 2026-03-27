/**
 * Source File Mutation Engine
 *
 * The core of Sol OS's deployment-ready editing model.
 * Every edit writes back to actual project source files on disk.
 * The files in .workspace/__extracted/ are ALWAYS deployment-ready.
 *
 * Design principles:
 * - Atomic writes (temp file + rename) to prevent corruption
 * - Per-page write queue to prevent race conditions
 * - Cheerio options tuned to preserve original HTML fidelity
 * - Content sanitization to prevent XSS in deployed sites
 */

import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────

export interface SourceEdit {
  page: string;       // e.g., "/index.html"
  selector: string;   // CSS selector path
  type: 'text' | 'image' | 'attribute';
  content: string;    // innerHTML for text, src for image, value for attribute
  attribute?: string; // attribute name when type === 'attribute'
  alt?: string;       // alt text for images
}

export interface SourceEditResult {
  success: boolean;
  changeId: string;
  page: string;
  selector: string;
  editType: SourceEdit['type'];
  oldValue: string;
  newValue: string;
  error?: string;
}

// ─── Sanitization ─────────────────────────────────────────────────
// Strip dangerous content before writing to source files.

function sanitizeHTML(html: string): string {
  // Remove <script> tags and their content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove on* event handlers
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  return clean;
}

// ─── Per-Page Write Queue ─────────────────────────────────────────
// Ensures sequential writes to the same file — no race conditions.

const pageQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(pagePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = pageQueues.get(pagePath) ?? Promise.resolve();
  const next = prev.then(fn, fn) as Promise<T>;
  pageQueues.set(pagePath, next);
  next.finally(() => {
    if (pageQueues.get(pagePath) === next) {
      pageQueues.delete(pagePath);
    }
  });
  return next;
}

// ─── Atomic File Write ────────────────────────────────────────────

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = filePath + '.tmp.' + randomUUID().slice(0, 8);
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

// ─── Core: Apply edits to a source file ───────────────────────────

export async function applyEdits(
  projectRoot: string,
  page: string,
  edits: SourceEdit[],
): Promise<SourceEditResult[]> {
  // Normalize page path
  const pagePath = page.startsWith('/') ? page : '/' + page;
  const filePath = path.join(projectRoot, pagePath);

  return enqueue(pagePath, async () => {
    // Read the source file
    let html: string;
    try {
      html = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      return edits.map((e) => ({
        success: false,
        changeId: randomUUID(),
        page: pagePath,
        selector: e.selector,
        editType: e.type,
        oldValue: '',
        newValue: e.content,
        error: `File not found: ${pagePath}`,
      }));
    }

    // Parse with cheerio — preserve original formatting as much as possible
    const $ = cheerio.load(html);

    const results: SourceEditResult[] = [];

    for (const edit of edits) {
      const changeId = randomUUID();
      try {
        const $el = $(edit.selector);
        if ($el.length === 0) {
          results.push({
            success: false,
            changeId,
            page: pagePath,
            selector: edit.selector,
            editType: edit.type,
            oldValue: '',
            newValue: edit.content,
            error: `Element not found: ${edit.selector}`,
          });
          continue;
        }

        const $target = $el.first();
        let oldValue = '';

        switch (edit.type) {
          case 'text': {
            oldValue = $target.html() ?? '';
            const sanitized = sanitizeHTML(edit.content);
            $target.html(sanitized);
            break;
          }
          case 'image': {
            oldValue = $target.attr('src') ?? '';
            $target.attr('src', edit.content);
            if (edit.alt !== undefined) {
              $target.attr('alt', edit.alt);
            }
            break;
          }
          case 'attribute': {
            const attr = edit.attribute ?? 'class';
            oldValue = $target.attr(attr) ?? '';
            $target.attr(attr, edit.content);
            break;
          }
        }

        results.push({
          success: true,
          changeId,
          page: pagePath,
          selector: edit.selector,
          editType: edit.type,
          oldValue,
          newValue: edit.content,
        });
      } catch (err) {
        results.push({
          success: false,
          changeId,
          page: pagePath,
          selector: edit.selector,
          editType: edit.type,
          oldValue: '',
          newValue: edit.content,
          error: String(err),
        });
      }
    }

    // Only write if at least one edit succeeded
    if (results.some((r) => r.success)) {
      // Use $.root().html() to avoid cheerio wrapping in <html><body>
      const output = $.root().html() ?? '';
      await atomicWrite(filePath, output);
    }

    return results;
  }) as Promise<SourceEditResult[]>;
}

// ─── Apply a single edit (convenience) ────────────────────────────

export async function applyEdit(
  projectRoot: string,
  page: string,
  selector: string,
  type: SourceEdit['type'],
  content: string,
  alt?: string,
): Promise<SourceEditResult> {
  const results = await applyEdits(projectRoot, page, [
    { page, selector, type, content, alt },
  ]);
  return results[0];
}

// ─── Read an element's current content ────────────────────────────

export async function readElement(
  projectRoot: string,
  page: string,
  selector: string,
): Promise<{ found: boolean; tagName?: string; content?: string; attributes?: Record<string, string> }> {
  const pagePath = page.startsWith('/') ? page : '/' + page;
  const filePath = path.join(projectRoot, pagePath);

  try {
    const html = await fs.readFile(filePath, 'utf-8');
    const $ = cheerio.load(html);
    const $el = $(selector).first();

    if ($el.length === 0) {
      return { found: false };
    }

    return {
      found: true,
      tagName: ($el[0] as any)?.tagName,
      content: $el.html() ?? '',
      attributes: ($el[0] as any)?.attribs ?? {},
    };
  } catch {
    return { found: false };
  }
}

// ─── Cheerio CSS Selector Generator ───────────────────────────────
// Produces selectors compatible with the browser's getCSSSelector in
// iframeEditorBridge.ts. Both use: tagName > nth-of-type > id shortcut.

export function getCheerioSelector(
  $: CheerioAPI,
  el: any, // cheerio Element node
): string {
  const parts: string[] = [];
  let current: any = el;

  while (current && current.type === 'tag') {
    let selector = current.tagName?.toLowerCase() ?? current.name?.toLowerCase();
    if (!selector) break;

    // Use id if available
    const id = $(current).attr('id');
    if (id) {
      const escaped = id.replace(/([#.,:;\[\]()>+~"'\\])/g, '\\$1');
      selector += `#${escaped}`;
      parts.unshift(selector);
      break; // ID is unique — stop traversing
    }

    // Add nth-of-type for disambiguation
    const parent = current.parent;
    if (parent && parent.type === 'tag') {
      const tagName = current.tagName ?? current.name;
      const siblings = $(parent).children(tagName).toArray();
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        if (index > 0) {
          selector += `:nth-of-type(${index})`;
        }
      }
    }

    parts.unshift(selector);
    current = current.parent ?? null;
  }

  return parts.join(' > ');
}

// ─── Apply CMS field changes via bindings ─────────────────────────

export interface CMSBinding {
  itemId: string;
  fieldName: string;
  page: string;
  selector: string;
}

export interface CMSFieldChange {
  contentTypeId: string;
  itemId: string;
  fieldName: string;
  newValue: string;
}

export async function applyCMSChanges(
  projectRoot: string,
  bindings: Record<string, Record<string, CMSBinding[]>>, // [ctId][itemId] → bindings[]
  changes: CMSFieldChange[],
): Promise<SourceEditResult[]> {
  // Group changes into source edits by page
  const editsByPage = new Map<string, SourceEdit[]>();

  for (const change of changes) {
    const ctBindings = bindings[change.contentTypeId];
    if (!ctBindings) continue;

    // Find bindings for this item+field
    const itemBindings = ctBindings[change.itemId];
    if (!itemBindings) continue;

    const fieldBindings = itemBindings.filter((b) => b.fieldName === change.fieldName);
    for (const binding of fieldBindings) {
      const page = binding.page;
      if (!editsByPage.has(page)) editsByPage.set(page, []);

      // Determine edit type based on field content
      const isImage = change.fieldName.match(/image|photo|avatar|cover|src/i);
      editsByPage.get(page)!.push({
        page,
        selector: binding.selector,
        type: isImage ? 'image' : 'text',
        content: change.newValue,
      });
    }
  }

  // Apply grouped edits
  const allResults: SourceEditResult[] = [];
  for (const [page, edits] of editsByPage) {
    const results = await applyEdits(projectRoot, page, edits);
    allResults.push(...results);
  }

  return allResults;
}
