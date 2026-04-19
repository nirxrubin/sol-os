/**
 * Carve — identify editable regions in fossilized source HTML.
 *
 * For each page, Claude walks the source HTML and emits a carve map:
 * every text node, image, and link the client would want to edit gets a
 * stable ID + CSS selector + current value. The apply-edits pass later
 * uses this map to substitute edits into the HTML without touching
 * structure.
 *
 * Design notes:
 *  - Stable IDs matter. Claude is instructed to name edits with
 *    page-scoped semantic IDs ("about_hero_headline", "about_service_0_title")
 *    so they survive re-ingestion of the same site.
 *  - Selectors must uniquely resolve the target node. Claude outputs CSS
 *    selectors; we validate them with cheerio post-hoc.
 *  - Only carve user-facing content. Nav links, footer boilerplate,
 *    decorative SVGs get skipped so the edit surface stays small.
 *  - Claude's job ends at emitting the map. No substitution, no runtime
 *    dependency.
 */

import { callClaudeJson } from "@hostaposta/agent-runtime";
import * as cheerio from "cheerio";

export type EditKind = "text" | "richtext" | "image" | "url" | "background-image";

export interface CarvedEdit {
  /** Page-scoped ID (e.g. "about_hero_headline"). Stable across re-carves. */
  id: string;
  /** What kind of value lives here. */
  kind: EditKind;
  /** CSS selector that uniquely resolves the target node. */
  selector: string;
  /** Attribute to edit when kind is image/url. Omitted for text/richtext. */
  attribute?: "src" | "href" | "srcset" | "alt";
  /** Current value in the source — shown to the client in the admin. */
  current: string;
  /** Optional short label the admin surfaces to the client. */
  label?: string;
}

export interface CarvedPage {
  route: string;
  edits: CarvedEdit[];
  /** Notes from Claude about ambiguous choices. */
  notes: string[];
}

export interface CarveMap {
  pages: CarvedPage[];
  promptVersion: string;
}

export const CARVE_PROMPT_VERSION = "carve-v1";

// ── prompt ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are HostaPosta's content carver.

Given one page of a tenant's fossilized source HTML, you produce a JSON
list of every editable region — the nodes a non-technical client would
want to change in their CMS admin. The fossilized page renders exactly
like the source; your carve map makes it editable without rewriting the
structure.

── What COUNTS as editable ────────────────────────────────────────────────

- Headlines, subheadings, paragraphs, rich body copy
- CTA button text + their href attributes
- Image src attributes (img tags, source tags, CSS background-image urls
  embedded in style attributes)
- Link hrefs on meaningful navigation CTAs (not site-wide nav)
- Alt text on content images (not decorative)

── What to SKIP ───────────────────────────────────────────────────────────

- Site-wide navigation links (the same nav on every page — platform handles it)
- Footer boilerplate (copyright, address, social nav — platform handles it)
- Structural SVGs, icons, decorative backgrounds
- <script>, <style> contents
- Form action URLs and hidden inputs
- ARIA labels and other a11y attributes
- Anything inside <header> or <footer> elements that look like site chrome

── ID naming (IMPORTANT — stable across re-carves) ───────────────────────

Use page-scoped, semantic, snake_case IDs:
  <page_slug>_<section_role>_<element_role>[_<index>]

Examples for /about:
  about_hero_headline
  about_hero_subtitle
  about_mission_body
  about_service_0_title
  about_service_0_description
  about_service_0_icon
  about_cta_button_text
  about_cta_button_link

For collection-shaped items (services, testimonials, team members, blog
posts), index from 0. Keep the same base name across all instances so
apply-edits can group them.

── Selectors ─────────────────────────────────────────────────────────────

Each selector MUST uniquely resolve one node in the page's HTML.
Prefer the shortest specific path:
  "main h1"  if there's only one h1
  "section.hero h1"  if multiple h1s exist
  ".service-grid .item:nth-child(2) h3"  for indexed repeats

Avoid brittle selectors:
  - Don't chain 5+ levels deep unless necessary
  - Don't use tag-only selectors (e.g., just "p") when multiple match
  - Don't invent classes that aren't in the source

── Output shape (strict JSON, no prose, no code fences) ──────────────────

{
  "edits": [
    {
      "id": "about_hero_headline",
      "kind": "text",
      "selector": "main h1",
      "current": "About Guilda",
      "label": "About page headline"
    },
    {
      "id": "about_service_0_icon",
      "kind": "image",
      "selector": ".about-services-grid .item:nth-child(1) img",
      "attribute": "src",
      "current": "/assets/images/SVG/Information.svg",
      "label": "Service 1 — icon"
    }
  ],
  "notes": ["Any ambiguities — e.g., 'Two h1s detected, picked the first as hero.'"]
}

PRESERVE LANGUAGE. Don't translate current values. Don't invent IDs for
text that isn't actually in the source.`;

const MAX_HTML_CHARS = 20_000; // per page

// ── public ────────────────────────────────────────────────────────────────

export interface CarveInput {
  route: string;
  html: string;
}

/** Carve a single page. Returns { edits, notes } plus any validation issues. */
export async function carvePage(input: CarveInput): Promise<{
  page: CarvedPage;
  invalidSelectors: string[];
}> {
  const trimmedHtml = input.html.length > MAX_HTML_CHARS
    ? input.html.slice(0, MAX_HTML_CHARS) + "<!-- …truncated… -->"
    : input.html;

  const user = [
    `Route: ${input.route}`,
    "",
    `Source HTML (${trimmedHtml.length} chars):`,
    "```html",
    trimmedHtml,
    "```",
    "",
    "Output the carve map as JSON.",
  ].join("\n");

  const raw = await callClaudeJson<{ edits?: CarvedEdit[]; notes?: string[] }>({
    tier: "sonnet",
    system: SYSTEM_PROMPT,
    user,
    trace: `carve:${input.route}`,
    maxTokens: 6000,
  });

  const edits = Array.isArray(raw.edits) ? raw.edits : [];
  const notes = Array.isArray(raw.notes) ? raw.notes : [];

  // Post-hoc validation: verify each selector actually resolves in the source HTML.
  const invalidSelectors: string[] = [];
  const $ = cheerio.load(input.html);
  const validEdits: CarvedEdit[] = [];
  const seenIds = new Set<string>();

  for (const e of edits) {
    if (!e || !e.id || !e.selector) continue;
    if (seenIds.has(e.id)) {
      invalidSelectors.push(`duplicate id: ${e.id}`);
      continue;
    }
    try {
      const matched = $(e.selector);
      if (matched.length !== 1) {
        invalidSelectors.push(`${e.id}: "${e.selector}" matched ${matched.length} nodes`);
        continue;
      }
    } catch {
      invalidSelectors.push(`${e.id}: invalid selector "${e.selector}"`);
      continue;
    }
    seenIds.add(e.id);
    validEdits.push(e);
  }

  return {
    page: { route: input.route, edits: validEdits, notes },
    invalidSelectors,
  };
}

/** Convenience: carve a set of pages, drop into a single CarveMap. */
export async function carveAll(
  pages: CarveInput[],
  opts?: { log?: (msg: string) => void },
): Promise<{ map: CarveMap; warnings: string[] }> {
  const log = opts?.log ?? (() => {});
  const warnings: string[] = [];

  const results = await Promise.all(
    pages.map(async (p) => {
      try {
        const out = await carvePage(p);
        log(`carved ${p.route}: ${out.page.edits.length} edits` + (out.invalidSelectors.length > 0 ? ` (${out.invalidSelectors.length} invalid)` : ""));
        for (const iv of out.invalidSelectors) warnings.push(`${p.route}: ${iv}`);
        return out.page;
      } catch (err) {
        const msg = (err as Error).message;
        log(`FAILED ${p.route}: ${msg}`);
        warnings.push(`${p.route}: carve failed — ${msg}`);
        return { route: p.route, edits: [], notes: [`carve failed: ${msg}`] };
      }
    }),
  );

  return {
    map: { pages: results, promptVersion: CARVE_PROMPT_VERSION },
    warnings,
  };
}
