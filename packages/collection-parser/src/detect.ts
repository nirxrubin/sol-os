/**
 * Skill 1 — detect-collection-types.
 *
 * Given an IngestionResult, identify which shared collection types are
 * present. Recognition only, no extraction. Output ranked by confidence.
 */

import { callClaudeJson } from "@hostaposta/agent-runtime";
import { OPTIONAL_COLLECTIONS } from "@hostaposta/collections";
import type { IngestionResult } from "@hostaposta/ingest";
import * as cheerio from "cheerio";

export interface DetectionCandidate {
  type: string;
  confidence: number;
  evidence: string[];
}

export interface DetectionResult {
  candidates: DetectionCandidate[];
  /** Pages that look like collection index/listing pages, keyed by type. */
  indexPages: Record<string, string[]>;
  /** Detail-page patterns by type. */
  detailPatterns: Record<string, string[]>;
}

const SYSTEM_PROMPT = `You are HostaPosta's collection type detector.

Your job: given a digest of a website's pages, route patterns, and JSON-LD,
identify which shared collection types are present in the source.

The shared collection types are:
- blog (posts, articles, news)
- testimonial (customer quotes with attribution)
- team (people: team, leadership, advisors, partners)
- caseStudy (project/client work writeups with results)
- service (service offerings with description / features / pricing)
- faq (Q&A pairs)

── Signal sources (weighted highest → lowest) ──────────────────────────────

1. **JSON-LD** (strongest). BlogPosting/Article/NewsArticle → blog.
   Review → testimonial. FAQPage/Question → faq. Product → product.
   Person → team. Event → event. Trust these unconditionally.
2. **Open Graph type** (og:type=article → blog).
3. **Dedicated route patterns**. /blog with paginated index + :slug detail
   pages, /team, /case-studies, /services, /faq, /careers.
4. **In-page repetition** (IMPORTANT — do not ignore just because there's
   no dedicated route). A section containing **≥3 structurally parallel
   items** with the same child pattern is collection-shaped. Examples:
     • 3+ \`<h3>\` + \`<p>\` pairs inside a \`<section>\` → service (or faq)
     • 3+ cards with photo + name + role → team
     • 3+ blocks with a quote and attribution → testimonial
     • 3+ Q&A pairs or \`<details>\` blocks → faq
     • 3+ price tiers with feature lists → service (pricing variant)
5. **Semantic anchor labels** (language-agnostic). Headings like:
     "Our services" / "What we do" / "שירותים" / "מה אנחנו עושים" /
     "Our team" / "Leadership" / "צוות" / "מי אנחנו" /
     "FAQ" / "Frequently asked" / "שאלות נפוצות" /
     "Testimonials" / "What clients say" / "ממליצים" /
     "Case studies" / "Our work" / "עבודות" — all strong anchors for
     their matching collection even without a dedicated route.
6. **Cross-page reuse** (e.g., testimonial on home AND about) confirms
   it's a collection, not inline copy.

── Service-specific recall guidance ────────────────────────────────────────

Services are the most commonly missed collection because they often live
on the home or about page rather than on a /services route. Always check
home + about + any landing page for:
  • A "What we do" / "Our services" / equivalent section with
    **independent offerable units** (each has its own title + description)
  • Feature grids where each card is an offering (not a process step)
  • Pricing tables (each tier is a service variant)

Do NOT classify as service:
  • Step-by-step process flows ("Step 1 / Step 2 / Step 3")
  • Hero feature callouts (1-2 items, not a collection)
  • Navigation / footer link lists

── Known confusions ────────────────────────────────────────────────────────

- Blog vs News vs Articles → collapse to "blog" unless source clearly
  separates them (distinct routes, distinct detail layouts).
- Blog vs CaseStudy → CaseStudy has \`client\` + results section + lives
  in /work or /cases. Dated + authored + shorter = Blog.
- Testimonial vs inline quote → Testimonial only if ≥3 instances OR
  cross-page reuse. One-off quotes inside body copy stay as richtext.
- Team vs Partners vs Advisors → all map to "team" with category.
  Do NOT propose a new collection type.

── Confidence guidance ─────────────────────────────────────────────────────

- 1.00: JSON-LD present OR dedicated route + ≥5 detail pages
- 0.85–0.95: Strong DOM + route signals, OR dedicated route + index only
- 0.70–0.85: In-page repetition (≥3 parallel items) + anchor label match,
  no dedicated route
- 0.60–0.70: In-page repetition without an anchor label, OR anchor label
  without clear repetition
- <0.60: Don't include — leave for unmappedStructured

── Output contract ─────────────────────────────────────────────────────────

Output strict JSON, no prose, no code fences:

{
  "candidates": [
    { "type": "blog", "confidence": 0.95, "evidence": ["..."] }
  ],
  "indexPages": { "blog": ["/blog"] },
  "detailPatterns": { "blog": ["/blog/:slug"] }
}

When a collection is anchored to a section inside a page (not a route),
put the containing page's route in \`indexPages\` and leave
\`detailPatterns\` empty for that type.

Only output collection types from the list above. Never invent new types
— those go through a separate \`flag-unmapped\` skill.`;

const MAX_PAGE_DIGEST = 6000; // chars per page after nav/header/footer strip

export interface DetectOptions {
  /** Optional few-shot block from eval — injected into user prompt to give the
   *  detector reference examples from prior successful runs. */
  fewShotBlock?: string;
  /** Called when callClaudeJson had to retry. Used for eval quality scoring. */
  onRetry?: () => void;
}

export async function detectCollectionTypes(
  ingest: IngestionResult,
  opts: DetectOptions = {},
): Promise<DetectionResult> {
  if (ingest.pages.length === 0) {
    return { candidates: [], indexPages: {}, detailPatterns: {} };
  }

  const pageSummaries = ingest.pages.slice(0, 25).map((p) => ({
    route: p.route,
    title: p.meta.title,
    ogType: p.meta.ogType,
    jsonLdTypes: extractJsonLdTypes(p.jsonLd),
    htmlSnippet: stripDigest(p.html, MAX_PAGE_DIGEST),
  }));

  const knownTypes = OPTIONAL_COLLECTIONS.map((c) => `- ${c.slug}: ${c.description}`).join("\n");

  const userPrompt = [
    `Site: ${ingest.source.origin}`,
    `Archetype: ${ingest.archetype}, Generator: ${ingest.generator}`,
    `Total pages: ${ingest.pages.length}`,
    `Detected route patterns: ${ingest.routes.patterns.join(", ") || "(none)"}`,
    "",
    "Known collection types:",
    knownTypes,
    opts.fewShotBlock ?? "",
    "",
    `Page summaries (showing ${pageSummaries.length} of ${ingest.pages.length}):`,
    JSON.stringify(pageSummaries, null, 2),
    "",
    "Output detection result as JSON.",
  ].join("\n");

  return callClaudeJson<DetectionResult>({
    tier: "sonnet",
    system: SYSTEM_PROMPT,
    user: userPrompt,
    trace: "detect-collection-types",
    maxTokens: 2000,
    onJsonRetry: opts.onRetry,
  });
}

function extractJsonLdTypes(jsonLd?: unknown[]): string[] {
  if (!jsonLd) return [];
  const types: string[] = [];
  for (const block of jsonLd) {
    if (block && typeof block === "object" && "@type" in block) {
      const t = (block as Record<string, unknown>)["@type"];
      if (typeof t === "string") types.push(t);
      else if (Array.isArray(t)) types.push(...t.filter((x): x is string => typeof x === "string"));
    }
  }
  return types;
}

function stripDigest(html: string, maxChars: number): string {
  // Parse + strip non-content chrome (nav/header/footer/aside/script/style/noscript)
  // so the digest is dense with the evidence Claude actually needs:
  // headings, paragraphs, repeating card/list structure.
  let content: string;
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, header, footer, aside").remove();
    // Prefer <main> when present; fall back to <body>; fall back to the
    // full (chrome-stripped) HTML.
    const main$ = $("main");
    const body$ = $("body");
    content = main$.length > 0
      ? main$.html() ?? ""
      : body$.length > 0
        ? body$.html() ?? ""
        : $.html();
  } catch {
    // Fall back to regex strip if cheerio fails for any reason
    content = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, "");
  }

  const cleaned = content.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars) + "…";
}
