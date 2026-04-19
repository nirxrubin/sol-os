# Skill: Collection Parser (Agent)

**Type:** Agent (loop with retry/recovery)
**Lives at:** `packages/ingest/` orchestration calls into `.agents/skills/collection-parser/`
**Full spec:** `docs/agents/collection-parser.md`

## When to use

After `packages/ingest/` produces an `IngestionResult` and before block
generation. Runs in parallel with `extract-tokens` and `extract-brand-voice`.

## Prerequisites to read

- `.agents/AGENTS.md` — platform rules (provenance, confidence tiers, no
  per-tenant collections)
- `.agents/knowledge/COLLECTIONS.md` — shared collection set + detection rules
  + known confusions
- `packages/collections/src/` — typed schema definitions (source of truth for
  field shapes)

## Four-skill decomposition

### 1. `detect-collection-types`

Claude with vision. Inputs: route patterns, JSON-LD, og types, sampled page
screenshots. Output: ranked candidate types with evidence + confidence.
Recognition only — no extraction yet.

**Heuristics it's prompted with:** see `.agents/knowledge/COLLECTIONS.md`
"Detection rules" + "Known confusions."

### 2. `extract-entries` (per-collection, parallel)

For each detected type, one Claude call given:
- The pages/sections relevant to this type (filtered from `IngestionResult`)
- The target schema (from `packages/collections/`)
- Field-level guidance (per-collection — lives next to its schema)

Returns typed entries + per-entry provenance + warnings. Vision used only
when DOM extraction is ambiguous.

### 3. `dedupe-and-validate` (deterministic TS, NOT Claude)

- Dedupe by canonical key (slug for Blog/CaseStudy, `quote+author` for
  Testimonial, `name+role` for Team).
- Validate against the Payload schema.
- Apply fallbacks for missing required fields when reasonable; drop otherwise.
- Emit warnings.

### 4. `flag-unmapped`

Given the pages with detected-collection content masked, Claude identifies
remaining repeating patterns. Suggests name + field guess. **Does not** create
new collection types — surfaces signal only.

## Output contract

`CollectionExtractionResult` — see `docs/agents/collection-parser.md` for the
full TypeScript shape. Critical fields:

- `detectedCollections[].entries[].sourceProvenance` — every entry must carry
  this. Entries without provenance are dropped by quality gates.
- `detectedCollections[].entries[].confidence` — drives the
  high/medium/low routing.
- `unmappedStructured` — the platform learning signal.

## Quality gates (enforced in `apps/api`, not the skill)

1. Schema compliance per `packages/collections/`.
2. Required fields present.
3. Provenance present.
4. Asset references resolvable.
5. Per-collection confidence floor.
6. Global confidence floor — if average <0.5, halt the pipeline.

## Confidence routing

| Confidence | Behavior |
|---|---|
| ≥ 0.85 | Auto-accept, write to Payload |
| 0.60–0.85 | Flag in admin "We found N items — review" |
| < 0.60 | Goes to unmapped, never auto-written |

## Failure modes

| Failure | Behavior |
|---|---|
| Incomplete `IngestionResult` (build partial) | Run on what's available, emit warnings |
| No collections detected | Empty output; site is purely static — Block Generator handles without references |
| Claude returns malformed | Retry once; if still bad, skip and warn |
| Over-detection (no provenance) | Quality gates drop the entries |

## Testing

15–25 hand-annotated real sites in eval suite. Phase-2 target: F1 > 0.85 on
top 5 collections (Blog, Testimonial, Team, CaseStudy, Service). CI blocks on
regression > 3pp on any metric.

## Implementation notes

- Stateless. Each invocation: `IngestionResult` in,
  `CollectionExtractionResult` out.
- Per-collection extractions run in parallel after detection.
- Uses `AI_MODEL` env var for tiering (Haiku detection, Sonnet extraction).
- Logs full traces via `packages/agent-runtime` — non-optional for
  debuggability.
