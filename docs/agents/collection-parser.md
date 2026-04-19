# Agent: Collection Parser

**Status:** Spec (pre-implementation)
**Owner:** `apps/api` + `.agents/skills/collection-parser/`
**Last updated:** 2026-04-19

---

## Purpose

Given an `IngestionResult` from any source (Lovable ZIP, GitHub repo, live URL, Figma), identify all instances of HostaPosta's **shared collection types** in the source, extract each instance into a typed record that matches the collection's schema, and flag structured content that doesn't fit any known collection.

This agent is the difference between a client's blog posts landing as **editable `Blog` records in their CMS** vs being frozen as HTML inside a single per-tenant block. Its output quality determines whether clients can actually manage their content after handoff.

---

## Scope

### In scope

- Detect which shared collection types are present in the source (Blog, Testimonial, Team, CaseStudy, Service, FAQ, Product, Event, Job).
- For each detected type, extract every instance as a typed record.
- Pair each extracted record with source provenance (URL, DOM path, page context) so downstream block generation knows what's being rendered where.
- Assign confidence scores and surface ambiguous cases for review.
- Flag structured-but-unmapped content for either human review or the "propose a new collection type" escalation.
- Deduplicate (same blog post linked from multiple pages = one record).

### Out of scope

- Extracting page layout or block composition (that's the Block Generator agent's job).
- Extracting brand/design tokens (Token Extractor agent).
- Generating Astro components or Payload block schemas (Block Generator agent).
- Proposing new collection types to add to the platform (surfaces the signal, doesn't decide).
- Writing to Payload directly (returns a structured result; `apps/api` handles persistence).

---

## Pipeline position

```
┌────────────────────────┐
│ packages/ingest        │  produces IngestionResult
└──────────┬─────────────┘
           ↓
    ┌──────┴──────┐
    ↓             ↓
┌────────┐  ┌───────────────────┐
│ Token  │  │ Collection Parser │  ← this agent
│ Agent  │  │    (this agent)   │
└────┬───┘  └─────────┬─────────┘
     │                │
     └────────┬───────┘
              ↓
    ┌─────────────────────┐
    │ Block Generator     │  generates per-tenant blocks
    │  — consumes tokens  │    (blocks that render collection
    │  — consumes         │     content declare references
    │    collections      │     to the extracted collections)
    └─────────┬───────────┘
              ↓
    ┌─────────────────────┐
    │  apps/api           │  persists to Payload,
    │  (orchestrator)     │  runs verify, deploys
    └─────────────────────┘
```

Runs **in parallel with the Token Extractor**; **before** the Block Generator, because block generation needs to know which collections exist and what entries they contain to declare correct references.

---

## Input contract

Consumes a normalized `IngestionResult`:

```ts
type IngestionResult = {
  source: {
    kind: "zip" | "github" | "url" | "figma" | "description";
    origin: string; // filename, repo url, live url, figma node id
  };
  archetype?: "next" | "vite" | "cra" | "astro" | "static" | "unknown";

  // For code-bearing sources (zip/github): rendered output of `npm run build`
  // For url: fetched HTML per crawled page
  // For figma: design-context export
  pages: Array<{
    route: string;         // "/", "/blog", "/blog/my-post", "/team"
    html: string;          // rendered HTML
    css: string;           // resolved, deduped CSS
    screenshot?: string;   // path to PNG, when available
    jsonLd?: object[];     // parsed JSON-LD blocks if present
    meta: {
      title?: string;
      description?: string;
      ogType?: string;
    };
  }>;

  assets: Array<{
    url: string;
    type: "image" | "video" | "font" | "other";
    context?: string; // "hero bg", "blog featured image on /blog/my-post"
  }>;

  routes: {
    tree: RouteNode;       // hierarchical route map
    patterns: string[];    // detected patterns like "/blog/:slug", "/team/:id"
  };
};
```

Key signals this agent keys on: `routes.patterns`, `pages[].jsonLd`, `pages[].meta.ogType`, DOM structure, and visual patterns from screenshots.

---

## Output contract

```ts
type CollectionExtractionResult = {
  detectedCollections: Array<{
    type: CollectionType; // "Blog" | "Testimonial" | "Team" | ...
    confidence: number;   // 0..1
    evidence: string[];   // human-readable reasons this was detected
    entries: Array<{
      data: Record<string, unknown>;  // matches the collection's Payload schema
      sourceProvenance: {
        sourceUrl?: string;           // where this entry was found
        domPath?: string;             // section/selector
        screenshotRegion?: BBox;      // crop of original screenshot showing this entry
      };
      confidence: number;             // per-entry confidence (entries can be less certain than the type detection)
      warnings?: string[];            // missing fields, inferred values, etc.
    }>;
    // Index pages / listing layouts associated with this collection (used by Block Generator
    // to know this tenant needs a "Blog Index"-style block, a "Team Grid"-style block, etc.)
    indexPages?: Array<{
      route: string;
      screenshotRegion?: BBox;
    }>;
    // Detail page patterns associated with this collection (e.g., /blog/:slug's layout
    // gives Block Generator the "blog post layout" reference)
    detailPages?: Array<{
      pattern: string;
      exampleRoute: string;
      screenshotRegion?: BBox;
    }>;
  }>;

  unmappedStructured: Array<{
    description: string;           // "6-item grid on /partners with logo + name + URL per item"
    sourceProvenance: { ... };
    suggestedNewCollection?: {
      nameGuess: string;           // "Partners"
      fieldGuess: Array<{ name: string; type: string }>;
    };
    confidence: number;
  }>;

  warnings: string[];
  metrics: {
    pagesAnalyzed: number;
    totalEntriesExtracted: number;
    averageConfidence: number;
    highConfidenceCount: number;
    lowConfidenceCount: number;
  };
};
```

---

## Skills (decomposition)

The agent orchestrates four skills, each a focused Claude call with its own system prompt. Skills live under `.agents/skills/collection-parser/`:

### 1. `detect-collection-types`

**Input:** full `IngestionResult` (or a distilled summary if too large).
**Output:** a ranked list of candidate collection types with evidence + confidence.
**Prompt strategy:** Claude with vision. Given route patterns, JSON-LD, og:type, and a sampling of page screenshots, identify which of the known collection types appear. No extraction yet — this is pure recognition.
**Key heuristics it's prompted with:**

- `/blog`, `/posts`, `/news`, `/articles` + paginated index + `/blog/:slug` details → Blog
- Repeating quote + attribution pattern (often with avatar, role, company) → Testimonial
- Grid of people with name + role + photo → Team
- `/work`, `/case-studies`, `/projects` + detail pages with client + results → CaseStudy
- Numbered or bulleted services with pricing or features → Service
- Q&A repeating pattern, accordions labeled "FAQ" / "Questions" → FAQ
- Shopify/Stripe/ecommerce-looking product listings with price → Product
- Date + location + description pattern → Event
- `/careers`, `/jobs` + department + apply-url → Job
- JSON-LD `@type` is a strong signal — if present, trust it first.

### 2. `extract-entries`

**Input:** `IngestionResult` + one detected collection type + the collection's schema (from `packages/collections/`).
**Output:** array of typed entries matching that schema + per-entry provenance + warnings.
**Prompt strategy:** Per collection, one Claude call that's given only the relevant pages/sections for that type (filtered from `IngestionResult`) plus the target schema. Claude returns structured entries. Vision used when DOM extraction is ambiguous (e.g., quote text inside a styled image).
**Field-level guidance per collection** (lives in each collection's schema definition, not hardcoded in the prompt). Examples:

- Blog.body: preserve semantic HTML (h2, h3, ul, blockquote), strip classes, convert to richtext model.
- Testimonial.avatar: pull the nearest image associated with the quote; resolve to absolute asset URL.
- Team.social: parse social icons with href links.
- CaseStudy.results: often a "stats row" near the end of detail pages — extract as key-value pairs.
- Event.datetime: try microdata first, fall back to text parsing with timezone guard.

### 3. `dedupe-and-validate`

**Input:** extracted entries per type.
**Output:** deduplicated, validated entries + dropped-duplicate log.
**Deterministic, not Claude-powered.** Runs as TypeScript:

- Dedupe by canonical key: slug for Blog/CaseStudy, `quote + author` for Testimonial, `name + role` for Team, etc.
- Validate against the Payload schema (required fields present, types correct, enum values valid).
- When a required field is missing, try fallbacks (e.g., Blog without publishDate → infer from URL or set to null + warning).
- Emit warnings for entries with >N low-confidence fields.

### 4. `flag-unmapped`

**Input:** `IngestionResult` + the set of types + entries already claimed by detected collections.
**Output:** `unmappedStructured` — content that's clearly structured but didn't match a known collection type.
**Prompt strategy:** Given the pages with detected-collection content "masked out," identify any remaining repeating patterns that look like a collection (N similar cards, N similar rows). Suggest a name + field guess. **Does not** decide to add a new collection type — that's a platform-level decision surfaced through this output.

---

## Knowledge the agent needs

Lives under `.agents/knowledge/collection-patterns/`. Per collection type:

- **Recognition fingerprints** — common DOM patterns, URL patterns, JSON-LD types, visual signatures.
- **Field-extraction rules** — how to map source DOM to each field.
- **Known-confusions** — e.g., "Blog vs News vs Articles: collapse all to Blog unless the source explicitly separates them." "Case Study vs Blog Post: case study = has `client` + dedicated page with longer form + often stats; blog post = dated, authored, shorter form."
- **Edge cases** — handled explicitly: a site with both blog and news sections, a team page with multiple categories, testimonials embedded inside case studies, etc.

This knowledge is versioned with the collection schemas themselves — if `packages/collections/Blog` changes, the parser knowledge for Blog updates in the same change.

---

## Ambiguity resolution

### Confidence tiers

| Tier | Range | Behavior |
|---|---|---|
| **High** | ≥ 0.85 | Auto-accepted, flows into Payload + block generation without gating. |
| **Medium** | 0.60–0.85 | Accepted but flagged in the admin ("We found 6 items that look like case studies — review these"). Client can accept all / reject all / edit individually. |
| **Low** | < 0.60 | Surfaced in the unmapped bucket or flagged for review; **not** auto-written. Client confirms in admin before they land as records. |

### Common ambiguous cases

- **Blog vs News.** Default: collapse to Blog unless clear separation. Emit a warning.
- **Blog vs Case Study.** Heuristic: presence of `client` field + results section + in `/work` or `/cases` route → Case Study. Otherwise Blog.
- **Testimonial vs Quote-in-Blog.** Testimonials are standalone records re-used across pages; quotes-in-blog are inline. If it appears on multiple pages or a dedicated `/testimonials` listing exists → Testimonial. If it's one-off inside a body → leave as inline richtext.
- **Team vs Partners vs Advisors.** All look structurally similar (photo + name + role). Heuristic: label text nearby ("Our team" vs "Partners"). If the site has all three, extract each to the `Team` collection with a `category` field (already in schema) — don't create new collections unless distinct enough.

---

## Quality gates

Enforced by `apps/api` after the agent returns, before anything is written to Payload:

1. **Schema compliance.** Every entry validates against its collection's Payload schema. Invalid entries are dropped, warnings logged.
2. **Required fields present.** No entry written with missing required fields — either fallback populates or the entry is dropped.
3. **Provenance present.** Every entry has a `sourceProvenance` pointing to where it was found. Entries without provenance are suspect (likely hallucinated) and dropped.
4. **Asset references resolvable.** Any `media` field must reference an asset from the `IngestionResult.assets` list. If not, the entry is accepted but the asset field is nulled + flagged.
5. **Confidence threshold.** Global average confidence below 0.5 triggers a pipeline halt — probably means ingestion was garbage; ask for better input rather than generate mess.

---

## Failure modes

| Failure | What happens | Recovery |
|---|---|---|
| IngestionResult is incomplete (build failed, only partial pages parsed) | Agent runs on what's available; emits lots of warnings | Block Generator works with reduced set; client sees flagged areas in admin |
| No collections detected | Output is empty; `unmappedStructured` may have hits | Site is likely purely static / marketing — Block Generator handles it without collection references |
| Claude returns malformed output | Retry once; if still malformed, skip that skill invocation and emit warning | Downstream can proceed without that collection type |
| Over-detection (agent invents collections that aren't really there) | Quality gates drop entries with no provenance; low-confidence detections are surfaced, not auto-written | Fidelity is preserved — client sees what they uploaded, not hallucinated content |

---

## Testing

### Evaluation suite

A set of 15–25 labeled real-world sites (mix of Lovable/v0/bolt outputs, GitHub templates, live URLs) with **hand-annotated ground truth**:

- Which collections are present
- How many entries per collection
- A subset of exact field values for key entries

Metrics tracked per collection type:

- **Precision** — of claimed entries, how many are real
- **Recall** — of real entries, how many were claimed
- **Field accuracy** — for claimed real entries, how many fields match
- **F1** — combined

Target for Phase 2 launch: per-collection F1 > 0.85 on the top 5 collections (Blog, Testimonial, Team, CaseStudy, Service).

### Regression guard

Every change to a collection schema or parser prompt re-runs the full eval suite. CI blocks merge on regression > 3 percentage points on any metric.

### Real-input guard

Once live, every client ingestion logs the agent's output + the client's subsequent edits in admin. A client that has to correct many auto-detected entries is a signal the parser got it wrong — feeds back into eval dataset over time (opt-in).

---

## Implementation notes

- Lives primarily as a skill set under `.agents/skills/collection-parser/`, invoked by `apps/api` via `packages/skills-runtime`.
- Stateless: each invocation takes an `IngestionResult`, returns a `CollectionExtractionResult`. No persistence between calls.
- Uses Claude with vision throughout. Detection benefits most from vision; extraction is mostly DOM+CSS, vision as fallback.
- Per-collection extraction skills can run in **parallel** after detection completes — collections are independent.
- Runs behind `AI_MODEL` env var (already in HostaPosta) so model can be tuned per stage — detection can use a stronger model, extraction a faster one, if cost-driven.
- Deterministic post-processing (dedupe, validate) isolated from Claude steps for testability.

---

## Example walk-through

**Input:** Lovable ZIP for a consulting firm site. After build + parse:

- Pages: `/`, `/about`, `/team`, `/case-studies`, `/case-studies/acme`, `/case-studies/globex`, `/case-studies/initech`, `/contact`
- Homepage has a testimonials section (3 quotes)
- `/team` has 8 people in a grid
- `/case-studies` is an index; 3 detail pages

**Agent run:**

1. **`detect-collection-types`** → `[{ type: "Testimonial", confidence: 0.9 }, { type: "Team", confidence: 0.95 }, { type: "CaseStudy", confidence: 0.92 }]`
2. **`extract-entries`** (×3, parallel) →
   - 3 `Testimonial` entries (quote + author + role + company extracted)
   - 8 `Team` entries (name + role + photo + social)
   - 3 `CaseStudy` entries (title + client + summary + body + results + gallery)
3. **`dedupe-and-validate`** → no duplicates, all entries pass schema validation, 1 warning (team member missing social links).
4. **`flag-unmapped`** → empty.

**Output:** 14 typed records ready for Payload; Block Generator knows to create per-tenant blocks for a testimonials section, team grid, case-studies index, and case-study detail layout, each declaring correct collection references.

**Client post-handoff experience:** They open HostaPosta admin, see their 3 testimonials as editable Testimonial records (not HTML), add a 4th in 30 seconds, and it appears on the homepage without touching a block.
