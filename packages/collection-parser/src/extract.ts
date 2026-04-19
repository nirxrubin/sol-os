/**
 * Skill 2 — extract-entries (per-collection, parallel).
 *
 * For each detected collection type, one Claude call with the relevant
 * pages and the target schema. Returns typed entries + provenance + warnings.
 */

import { callClaudeJson } from "@hostaposta/agent-runtime";
import { getCollectionBySlug, type CollectionSchema, type FieldDef } from "@hostaposta/collections";
import type { IngestionResult, ParsedPage } from "@hostaposta/ingest";
import type { ExtractedEntry } from "./types.js";
import type { DetectionCandidate, DetectionResult } from "./detect.js";

const SYSTEM_PROMPT = `You are HostaPosta's collection entry extractor.

You will be given:
- A collection schema (the typed shape entries must conform to)
- The pages relevant to this collection from the source site
- Field-level extraction guidance

Your job: extract each instance of this collection from the source as a
typed record matching the schema.

Rules:
- Output strict JSON. No prose, no code fences.
- Every entry MUST include sourceProvenance with at least sourceUrl and a domPath hint.
- Every entry MUST include a confidence score 0..1.
- For required fields without a confident value: try a fallback (e.g., infer slug from URL); if no fallback, omit the entry and add a warning.
- Preserve semantic HTML in richtext fields (h2, h3, ul, blockquote, strong, em, a). Strip presentational classes.
- For media fields: emit the source URL as a string (not a Payload media object — that's persisted later).
- For datetime fields: prefer microdata / parseable strings; emit ISO 8601 when extractable.

Output JSON shape:
{
  "entries": [
    {
      "data": { "title": "...", "slug": "...", ... },
      "sourceProvenance": { "sourceUrl": "/blog/post-1", "domPath": "article.post" },
      "confidence": 0.9,
      "warnings": ["publishDate inferred from URL"]
    }
  ]
}`;

const MAX_PAGE_HTML = 6000; // chars per page in the prompt for extraction

export async function extractEntriesForType(
  ingest: IngestionResult,
  candidate: DetectionCandidate,
  detection: DetectionResult,
): Promise<{ entries: ExtractedEntry[]; warnings: string[] }> {
  const schema = getCollectionBySlug(candidate.type);
  if (!schema) {
    return { entries: [], warnings: [`Unknown collection type "${candidate.type}" from detector`] };
  }

  const relevantPages = filterRelevantPages(ingest.pages, candidate.type, detection);
  if (relevantPages.length === 0) {
    return { entries: [], warnings: [`No pages found relevant to ${candidate.type}`] };
  }

  const userPrompt = buildExtractPrompt(schema, relevantPages, ingest);

  const result = await callClaudeJson<{ entries: ExtractedEntry[] }>({
    tier: "sonnet",
    system: SYSTEM_PROMPT,
    user: userPrompt,
    trace: `extract-entries:${candidate.type}`,
    maxTokens: 6000,
  });

  return { entries: result.entries ?? [], warnings: [] };
}

function filterRelevantPages(
  pages: ParsedPage[],
  type: string,
  detection: DetectionResult,
): ParsedPage[] {
  const indexRoutes = new Set(detection.indexPages[type] ?? []);
  const detailPatterns = detection.detailPatterns[type] ?? [];

  return pages.filter((p) => {
    if (indexRoutes.has(p.route)) return true;
    for (const pattern of detailPatterns) {
      if (matchesPattern(p.route, pattern)) return true;
    }
    // Fall through: also include pages whose JSON-LD signals this type
    if (p.jsonLd) {
      for (const block of p.jsonLd) {
        if (block && typeof block === "object" && "@type" in block) {
          const t = (block as Record<string, unknown>)["@type"];
          const typeName = mapTypeToCollection(typeof t === "string" ? t : "");
          if (typeName === type) return true;
        }
      }
    }
    return false;
  });
}

function matchesPattern(route: string, pattern: string): boolean {
  // pattern like /blog/:slug → /blog/.+
  const re = new RegExp("^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$");
  return re.test(route);
}

function mapTypeToCollection(jsonLdType: string): string | null {
  switch (jsonLdType) {
    case "BlogPosting":
    case "Article":
    case "NewsArticle":
      return "blog";
    case "Review":
      return "testimonial";
    case "FAQPage":
    case "Question":
      return "faq";
    case "Person":
      return "team";
    case "Product":
      return "product";
    case "Event":
      return "event";
    default:
      return null;
  }
}

function buildExtractPrompt(
  schema: CollectionSchema,
  pages: ParsedPage[],
  ingest: IngestionResult,
): string {
  const fieldsDoc = schema.fields.map(formatFieldDoc).join("\n");

  const pagesPayload = pages.slice(0, 30).map((p) => ({
    route: p.route,
    title: p.meta.title,
    jsonLd: p.jsonLd,
    html: p.html.slice(0, MAX_PAGE_HTML),
  }));

  return [
    `Extract entries for the **${schema.label}** collection.`,
    `Slug: ${schema.slug}`,
    `Description: ${schema.description}`,
    "",
    `Schema fields (* = required):`,
    fieldsDoc,
    "",
    `Source site origin: ${ingest.source.origin}`,
    `Archetype: ${ingest.archetype}`,
    `Generator: ${ingest.generator}`,
    "",
    `Relevant pages (${pagesPayload.length}):`,
    JSON.stringify(pagesPayload, null, 2),
    "",
    "Output entries as JSON.",
  ].join("\n");
}

function formatFieldDoc(field: FieldDef): string {
  const req = field.required ? "*" : "";
  const opts = field.options ? ` (one of: ${field.options.map((o) => o.value).join(", ")})` : "";
  return `  - ${field.name}${req}: ${field.type}${opts} — ${field.label}`;
}
