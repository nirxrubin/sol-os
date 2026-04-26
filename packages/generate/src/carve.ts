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

Given one page of a tenant's fossilized source HTML, produce a JSON list of
EVERY editable region — the nodes a non-technical client would want to
change in their CMS admin. The fossilized page renders exactly like the
source; your carve map makes it editable without rewriting structure.

Your #1 priority is COVERAGE. Under-carving (missing an editable item) is a
bug. A typical content-rich page has 15–60 edit points. If you return only
a handful of edits on a visibly content-rich page, you're missing things.

── MUST CARVE (every instance on the page) ───────────────────────────────

TEXT
  • Every heading (h1, h2, h3, h4, h5, h6) visible in <main>.
  • Every paragraph <p> and rich text block that has ≥2 words of content.
  • Every button label and link CTA with visible text (kind: "text" for the
    label, separate "url" edit for the href if it's a meaningful CTA).
  • Every <blockquote>, <li> with real content, stat numbers, badge labels.
  • Every list/grid item's individual fields: each card's title, subtitle,
    price, description, excerpt, date, category, author — separate IDs per
    field per item.

IMAGES
  • Every <img src> in main content (one edit per image, kind: "image",
    attribute: "src").
  • Every content <img alt> when the alt text is non-empty and descriptive
    (kind: "text", attribute: "alt") — skip empty/decorative alts.
  • CSS background-image URLs inside style="…" on content sections (kind:
    "background-image").

LINKS
  • href on buttons/CTAs/cards that link out ("Read more", "Shop now",
    article card → /journal/:slug, product card → /shop/:slug). Use
    kind: "url", attribute: "href".

── SKIP (chrome, not content) ───────────────────────────────────────────

  • Anything inside <header> or <nav> at the top of the page
    (site-wide logo, primary nav — the platform owns these).
  • Anything inside <footer> (copyright, social, address, secondary nav).
  • Purely decorative SVGs (icon fragments, dividers, abstract shapes).
  • <script>, <style>, <noscript>, inline JSON-LD contents.
  • Form action URLs, hidden inputs, CSRF tokens.
  • ARIA labels, data-* attributes, role attributes.
  • Repeated framework wrappers (class-only markers with no user text).

If you're unsure whether something is chrome vs content: treat it as
content (carve it). Better to over-carve than under-carve.

── LIST / REPEAT ITEMS ───────────────────────────────────────────────────

For any collection-shaped list on the page (products, journal cards,
services, testimonials, team members, verses), carve every visible field
of every visible item. Index from 0. Use a consistent base name:

  shop_product_0_name
  shop_product_0_price
  shop_product_0_image
  shop_product_0_category
  shop_product_1_name
  ... and so on for every item rendered on the page.

If the page renders 6 product cards, we expect ~6 × (fields-per-card)
edits from that section alone.

── ID naming (stable across re-carves) ───────────────────────────────────

Page-scoped, semantic, snake_case:
  <page_slug>_<section_role>_<element_role>[_<index>]

Examples:
  home_hero_headline
  home_hero_subtitle
  home_hero_cta_text
  home_hero_cta_link
  home_hero_image
  shop_product_0_name
  shop_product_0_price
  shop_product_0_image
  journal_article_2_title
  journal_article_2_excerpt
  journal_article_2_date

── Selectors ─────────────────────────────────────────────────────────────

Each selector MUST uniquely resolve exactly one node in the provided HTML.
Prefer the shortest specific path that's still unique:

  "main h1"                       if only one h1
  "section.hero h1"               if multiple h1s
  "main .grid > :nth-child(2) h3" for indexed repeats
  "main img:nth-of-type(3)"       for indexed images

Avoid:
  • Tag-only selectors when multiple match (bare "p")
  • Invented classes that aren't in the source
  • 6+-level deep chains

Use :nth-child / :nth-of-type for list repeats — the fossilized HTML is
stable so these hold up.

── Output (strict JSON, no prose, no code fences) ────────────────────────

{
  "edits": [
    { "id": "home_hero_headline", "kind": "text", "selector": "main h1",
      "current": "…", "label": "Home hero headline" },
    { "id": "home_hero_cta_text", "kind": "text",
      "selector": "main section:first-of-type a.btn-primary",
      "current": "…", "label": "Home hero CTA text" },
    { "id": "home_hero_cta_link", "kind": "url",
      "selector": "main section:first-of-type a.btn-primary",
      "attribute": "href", "current": "/shop", "label": "Home hero CTA link" },
    { "id": "shop_product_0_image", "kind": "image",
      "selector": "main .grid > :nth-child(1) img",
      "attribute": "src", "current": "/assets/…jpg", "label": "Product 1 image" }
  ],
  "notes": ["Any ambiguities or deliberate skips"]
}

PRESERVE LANGUAGE. Don't translate current values. Don't invent IDs for
text that isn't actually in the source. If a value is very long, truncate
the "current" field to 200 chars — the full value is re-read at apply time.`;

const MAX_HTML_CHARS = 60_000; // per page — most real pages fit under this

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
