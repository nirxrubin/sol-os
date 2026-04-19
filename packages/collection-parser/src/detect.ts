/**
 * Skill 1 — detect-collection-types.
 *
 * Given an IngestionResult, identify which shared collection types are
 * present. Recognition only, no extraction. Output ranked by confidence.
 */

import { callClaudeJson } from "@hostaposta/agent-runtime";
import { OPTIONAL_COLLECTIONS } from "@hostaposta/collections";
import type { IngestionResult } from "@hostaposta/ingest";

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
- service (service offerings with description/pricing)
- faq (Q&A pairs)

Detection priority:
1. JSON-LD wins if present (BlogPosting, Article, Review, FAQPage, etc.)
2. Open Graph type as secondary signal
3. Route patterns over DOM patterns
4. Repetition (≥3 structurally similar items) suggests a collection
5. Cross-page reuse (e.g., testimonial appears on home + about) confirms it's a collection, not inline content

Known confusions:
- Blog vs News vs Articles → collapse to "blog" unless source clearly separates
- Blog vs CaseStudy → CaseStudy has "client" + results section + lives in /work or /cases
- Testimonial vs inline quote → Testimonial only if ≥3 instances or cross-page reuse
- Team vs Partners vs Advisors → all map to "team" with category, do NOT propose a new collection

Confidence guidance:
- 1.0: JSON-LD or unambiguous pattern (e.g., /blog with paginated index + 5+ detail pages)
- 0.85-0.95: Strong DOM + route signals
- 0.6-0.85: Some signals, some ambiguity
- <0.6: Don't include in candidates — leave for unmappedStructured

Output strict JSON:
{
  "candidates": [
    { "type": "blog", "confidence": 0.95, "evidence": ["JSON-LD BlogPosting on /blog/post-1", "/blog index with 8 detail pages"] },
    ...
  ],
  "indexPages": { "blog": ["/blog"] },
  "detailPatterns": { "blog": ["/blog/:slug"] }
}

Only output collection types from the list above. Never invent new types — those go through unmappedStructured (handled by a different skill).`;

const MAX_PAGE_DIGEST = 800; // chars per page in the prompt

export async function detectCollectionTypes(ingest: IngestionResult): Promise<DetectionResult> {
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
  // Remove scripts/styles, collapse whitespace, truncate
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars) + "…";
}
