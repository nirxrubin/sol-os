/**
 * Pixel-Fidelity Block Generator.
 *
 * For each source page, Claude writes a set of per-tenant Astro component
 * files that match the source's actual layout + visual design. The output
 * is NOT a selection from a catalog — it's fresh .astro source.
 *
 * Input per page:
 *   - Full rendered HTML (chrome-stripped)
 *   - Resolved CSS digest
 *   - Full-page screenshot (vision)
 *   - Foundation token variable names (so generated CSS references them)
 *   - Collection metadata (so blocks can read from the right collections)
 *
 * Output per page:
 *   - Ordered list of block instances: { componentName, props }
 *   - For each distinct componentName, the full Astro source (markup +
 *     scoped <style>) ready to write to .tenants/<slug>/src/components/
 *     blocks/tenant/<componentName>.astro
 *
 * Design constraints enforced in the prompt:
 *   - Reference foundation tokens (`var(--color-primary)`, etc.) for brand-
 *     relevant values. Use inline values only for truly block-specific
 *     structural measurements.
 *   - Use semantic HTML + Astro idioms (interface Props, const blok =
 *     Astro.props, scoped <style>).
 *   - Preserve the source's language + copy exactly (no translation, no
 *     invention, no placeholders).
 *   - Image URLs passed through as-is; asset remap runs afterward.
 *   - NO imports beyond what's available (no external libraries).
 */

import { callClaude, callClaudeJson } from "@hostaposta/agent-runtime";
import type { IngestionResult, ParsedPage } from "@hostaposta/ingest";
import type { CollectionExtractionResult } from "@hostaposta/collection-parser";
import type { TokenSet } from "@hostaposta/tokens";
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

export interface PixelGenerateOptions {
  ingestion: IngestionResult;
  tokens: TokenSet;
  collections: CollectionExtractionResult;
  siteName: string;
  /** Target — where generated .astro files get written. */
  tenantDir: string;
  /** Whether to include screenshot in prompts (vision input). */
  useVision?: boolean;
  log?: (msg: string) => void;
}

export interface GeneratedPage {
  route: string;
  blocks: Array<{ componentName: string; props: Record<string, unknown> }>;
  notes: string[];
}

export interface PixelGenerateResult {
  pages: GeneratedPage[];
  componentsWritten: string[];
  warnings: string[];
}

// ── prompt ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are HostaPosta's pixel-fidelity block generator.

You receive ONE page from a tenant's source site and you produce:
  1. An ordered list of block instances that matches the source layout.
  2. The Astro component SOURCE CODE for each distinct block type used.

Your output renders a page that visually matches the source — same
section order, same layout structure, same typography + spacing + colors.
The tenant's brand foundation tokens are provided; reference them for
brand-relevant values so clients can later edit colors/fonts globally.

── Output contract ───────────────────────────────────────────────────────

Strict JSON, no prose, no code fences. Shape:

{
  "blocks": [
    { "componentName": "HomeHero", "props": { ... } },
    { "componentName": "ServicesGrid", "props": { "items": [...] } }
  ],
  "components": [
    {
      "name": "HomeHero",
      "source": "---\\ninterface Props { headline: string; subtitle?: string; ctaText?: string; ctaHref?: string; heroImage?: string; }\\nconst blok = Astro.props;\\n---\\n<section class=\\"hero\\" data-reveal>\\n  <div class=\\"container\\">\\n    <h1 class=\\"hero__headline\\">{blok.headline}</h1>\\n    {blok.subtitle && <p class=\\"hero__sub\\">{blok.subtitle}</p>}\\n    {blok.ctaText && <a class=\\"hero__cta\\" href={blok.ctaHref ?? '#'}>{blok.ctaText}</a>}\\n  </div>\\n  <style>\\n    .hero { padding-block: var(--space-20); background: var(--color-bg); }\\n    .hero__headline { font-size: var(--text-hero); font-family: var(--font-display); color: var(--color-primary); }\\n    .hero__sub { color: var(--color-text-muted); margin-top: var(--space-4); }\\n    .hero__cta { ... }\\n  </style>"
    },
    {
      "name": "ServicesGrid",
      "source": "..."
    }
  ],
  "notes": []
}

── Naming rules ──────────────────────────────────────────────────────────

- componentName is PascalCase, page-scoped when the block is unique to this
  page ("HomeHero", "AboutMission", "ServicesGrid"). If a section clearly
  recurs across pages with the same structure + visual, use a generic name
  ("Testimonials", "Footer"). Prefer page-scoped when in doubt.
- The "name" in components[] MUST match a componentName used in blocks[].

── Astro source rules (CRITICAL) ─────────────────────────────────────────

- Every component file is a self-contained Astro single-file-component:
  frontmatter + markup + scoped <style>.
- Frontmatter:
    \`\`\`
    ---
    interface Props { ...typed fields... }
    const blok = Astro.props;
    ---
    \`\`\`
  Do NOT import anything. Do NOT use any framework-specific features beyond
  Astro's core + plain HTML/CSS. No JSX libs, no React, no Vue.
- Markup uses semantic HTML (section, article, h1-h6, p, ul, img, a, etc.).
- Class names are BEM-ish: .block-name, .block-name__element, .block-name--modifier.
- <style> is scoped by default in Astro (no is:global). DO NOT mark it global.

── CSS rules (CRITICAL for edit-ability) ─────────────────────────────────

For BRAND-relevant values, reference foundation tokens from the provided
list. Examples:
  color: var(--color-primary);
  background: var(--color-bg);
  font-family: var(--font-display);
  padding-block: var(--section-padding-y);
  border-radius: var(--radius-lg);

For BLOCK-INTERNAL values (specific grid sizes, unique measurements that
don't belong in the brand system), use hardcoded CSS values.

DO NOT reinvent the wheel: the template provides .container (max-width +
horizontal padding) and .section (vertical padding). Use them when useful.

Media queries: use max-width breakpoints at ~1024px / ~720px / ~480px as
needed. The site should be responsive.

RTL: if direction is RTL, prefer logical properties (padding-inline-start,
margin-inline-end) over left/right. Grids and flex handle RTL natively.

── Content rules ─────────────────────────────────────────────────────────

- PRESERVE SOURCE LANGUAGE. Don't translate. If source is Hebrew, keep Hebrew.
- ONLY use text present in the source. Don't invent placeholder copy.
- For image URLs: use EXACTLY the path as it appears in the source (e.g.,
  "assets/images/X.svg"). A post-processor rewrites these to rooted /assets
  paths.
- For links (ctaHref etc): if source uses "#" or empty, output empty string.

── Collection-backed blocks ──────────────────────────────────────────────

If the source section lists items from a known collection (blog posts,
testimonials, team members), still emit a per-tenant block, but have it
RECEIVE the items as a prop (from the page data). Don't import Payload
or any runtime fetcher. The page data will pass the collection items in.
Example: a testimonials section becomes a \`TestimonialsGrid\` block with
\`props: { items: [ ...testimonial objects... ] }\`.

── What to SKIP ──────────────────────────────────────────────────────────

- Site chrome: <nav> if it's the site nav, site <header>, site <footer>.
  The template renders those from SiteSettings; don't reproduce them.
- Hidden sections (display:none, visibility:hidden) — skip.
- Empty/placeholder sections (text like "lorem ipsum", clearly stubbed out) — skip.
`;

const MAX_HTML_CHARS = 14_000;
const MAX_CSS_CHARS = 6_000;

// ── public entry ──────────────────────────────────────────────────────────

export async function generatePixelBlocks(
  opts: PixelGenerateOptions,
): Promise<PixelGenerateResult> {
  const log = opts.log ?? ((m) => console.log(`[pixel-gen] ${m}`));
  const warnings: string[] = [];
  const tenantBlocksDir = path.join(opts.tenantDir, "src/components/blocks/tenant");

  // Wipe only the generator-produced blocks dir; keep the template's
  // pristine blocks if any remain.
  await fs.mkdir(tenantBlocksDir, { recursive: true });

  const tokenVarList = listTokenVars(opts.tokens);
  const collectionSummary = buildCollectionSummary(opts.collections);

  // Pages run in parallel — each page is an independent Claude call.
  const pageResults = await Promise.all(
    opts.ingestion.pages.map((page) =>
      generateForPage({
        page,
        siteName: opts.siteName,
        tokenVars: tokenVarList,
        collectionSummary,
        useVision: opts.useVision ?? true,
      }).catch((err) => {
        log(`FAILED ${page.route}: ${(err as Error).message}`);
        warnings.push(`${page.route}: ${(err as Error).message}`);
        return {
          route: page.route,
          blocks: [],
          components: [],
          notes: [`failed: ${(err as Error).message}`],
        };
      }),
    ),
  );

  // Write components. Dedupe by name — later generations win if Claude
  // reuses a name with different content (we warn so you can review).
  const written = new Map<string, string>(); // name → sourcecode
  for (const pr of pageResults) {
    for (const comp of pr.components) {
      const existing = written.get(comp.name);
      if (existing && existing !== comp.source) {
        warnings.push(`Component "${comp.name}" generated with conflicting sources across pages — kept the last one.`);
      }
      written.set(comp.name, comp.source);
    }
  }

  for (const [name, source] of written) {
    const filePath = path.join(tenantBlocksDir, `${name}.astro`);
    await fs.writeFile(filePath, source);
  }
  log(`wrote ${written.size} per-tenant Astro components → src/components/blocks/tenant/`);

  const pages: GeneratedPage[] = pageResults.map((pr) => ({
    route: pr.route,
    blocks: pr.blocks,
    notes: pr.notes,
  }));

  return { pages, componentsWritten: Array.from(written.keys()), warnings };
}

// ── per-page generation ───────────────────────────────────────────────────

interface GenerateForPageInput {
  page: ParsedPage;
  siteName: string;
  tokenVars: string[];
  collectionSummary: string;
  useVision: boolean;
}

interface PageGenerateOutput {
  route: string;
  blocks: Array<{ componentName: string; props: Record<string, unknown> }>;
  components: Array<{ name: string; source: string }>;
  notes: string[];
}

async function generateForPage(input: GenerateForPageInput): Promise<PageGenerateOutput> {
  const { page } = input;
  const bodyHtml = stripChromeAndTrim(page.html, MAX_HTML_CHARS);
  const cssDigest = page.css.slice(0, MAX_CSS_CHARS);

  const userText = [
    `Site: ${input.siteName}`,
    `Page route: ${page.route}`,
    `Page title: ${page.meta.title ?? "(untitled)"}`,
    "",
    `Available foundation tokens (use these in generated CSS for brand-relevant values):`,
    input.tokenVars.map((v) => `  ${v}`).join("\n"),
    "",
    `Collections available on this tenant:`,
    input.collectionSummary,
    "",
    `Source page HTML (chrome stripped, ${bodyHtml.length} chars):`,
    "```html",
    bodyHtml,
    "```",
    "",
    `Resolved CSS digest (first ${cssDigest.length} chars — use as visual reference, not to copy verbatim):`,
    "```css",
    cssDigest,
    "```",
    "",
    "Output the JSON as specified.",
  ].join("\n");

  // NOTE: vision input (screenshots) not yet plumbed through the Agent SDK.
  // When vision is wired it'll pass `page.screenshot` to Claude here. For
  // now the generator works from HTML + CSS text alone.
  void input.useVision;

  const result = await callClaudeJson<PageGenerateRaw>({
    tier: "sonnet",
    system: SYSTEM_PROMPT,
    user: userText,
    trace: `pixel-gen:${page.route}`,
    maxTokens: 12000,
  });

  return {
    route: page.route,
    blocks: (result.blocks ?? []).map((b) => ({
      componentName: b.componentName,
      props: b.props ?? {},
    })),
    components: (result.components ?? []).map((c) => ({
      name: c.name,
      source: c.source,
    })),
    notes: result.notes ?? [],
  };
}

interface PageGenerateRaw {
  blocks?: Array<{ componentName: string; props?: Record<string, unknown> }>;
  components?: Array<{ name: string; source: string }>;
  notes?: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────

function listTokenVars(_tokens: TokenSet): string[] {
  // Keep this list aligned with tokens-css.ts.
  return [
    "--color-bg", "--color-bg-alt", "--color-bg-card", "--color-bg-dark",
    "--color-primary", "--color-secondary", "--color-accent",
    "--color-text", "--color-text-muted", "--color-text-inverse", "--color-border",
    "--font-display", "--font-body", "--font-mono",
    "--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl",
    "--text-2xl", "--text-3xl", "--text-4xl", "--text-5xl", "--text-hero",
    "--font-weight-regular", "--font-weight-medium", "--font-weight-bold",
    "--tracking-tight", "--tracking-normal", "--tracking-wide",
    "--leading-tight", "--leading-normal", "--leading-loose",
    "--space-1", "--space-2", "--space-3", "--space-4", "--space-5",
    "--space-6", "--space-8", "--space-10", "--space-12", "--space-16", "--space-20",
    "--section-padding-y", "--container-max-w", "--container-px",
    "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-full",
    "--duration-fast", "--duration-base", "--duration-slow", "--easing-out",
    "--shadow-sm", "--shadow-md", "--shadow-lg",
  ];
}

function buildCollectionSummary(collections: CollectionExtractionResult): string {
  if (collections.detectedCollections.length === 0) return "  (none)";
  return collections.detectedCollections
    .map((c) => `  ${c.type}: ${c.entries.length} entries`)
    .join("\n");
}

function stripChromeAndTrim(html: string, maxChars: number): string {
  let content: string;
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, header, footer, aside").remove();
    const main$ = $("main");
    const body$ = $("body");
    content = main$.length > 0 ? main$.html() ?? "" : body$.length > 0 ? body$.html() ?? "" : $.html();
  } catch {
    content = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, "");
  }
  content = content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return content.length > maxChars ? content.slice(0, maxChars) + "…" : content;
}

// Suppress unused-import warning for callClaude — reserved for streaming variants.
void callClaude;
