# Agentic AI Review

**Status:** Analysis / proposal
**Companion to:** `PRD.md`, `agents/collection-parser.md`
**Last updated:** 2026-04-19

---

## Framing

"Agentic" here means **closing loops autonomously** — the agent takes an action, observes the result, and recovers on failure. Not every LLM call needs to be agentic; most don't. The ones that matter are:

1. **Failure-preventing agents** — catch a break before the client sees it. Biggest lift to ingestion-success-rate and fidelity-pass-rate.
2. **Value-creating agents** — do something the client couldn't get from any non-AI CMS. The product's competitive wedge.
3. **Learning agents** — accumulate cross-tenant signal so the platform gets smarter per tenant added. The flywheel.

Where an LLM can do a task one-shot, it's a **skill**, not an agent. Skills are cheap; agents are expensive. Spend agent complexity where loops exist.

---

## What the current plan covers

| Role | Type | Status |
|---|---|---|
| `ingest-normalize` | skill | planned |
| `extract-tokens` | skill | planned |
| `collection-parser` | **agent** | spec'd in `agents/collection-parser.md` |
| `generate-block` | skill | planned |
| `regenerate-block` | skill | planned |
| `add-new-block` | skill | planned |

Good coverage for the "turn input into a site" path. Three structural gaps below.

---

## Gap 1: Failure-preventing agents (load-bearing)

These aren't optional features — they directly determine whether ingestion-success-rate hits the PRD's >80% target.

### 1a. Build Repair agent

**Problem:** `npm run build` on a random Lovable/v0/bolt upload fails ~30–50% of the time on first pass. Reasons: wrong Node version, missing env var, typo in config, stale lockfile, peer dep conflict, unpinned breaking change in a transitive dep. Today's pipeline would just error out to the client.

**Agent loop:**

1. Build fails → capture stderr + package.json + config files + error stack.
2. Claude diagnoses: what failed, what class of error, what's the fix?
3. Agent applies a scoped fix (bump a dep, add an env stub, pin Node, install a missing peer).
4. Retry build. If it succeeds, log the fix + move on. If it fails differently, retry diagnose (up to 3 iterations).
5. If unresolvable, surface a specific ask to the client ("your app needs a `DATABASE_URL` to build — paste one or skip this route").

**Impact:** Ingestion success rate jumps significantly on first attempt. This is probably the single highest-leverage addition in the entire doc.

**Where:** `.agents/skills/build-repair/`, invoked by `packages/ingest/build/` on failure.

### 1b. Visual Verify agent (replaces pixel-diff)

**Problem:** Pixel-diff is blind to meaningful vs meaningless differences. Shifted font rendering between OS versions looks like a fail; a broken CTA that's "close enough in pixels" passes. The fidelity contract can't be measured this way.

**Agent loop:**

1. Render generated block → screenshot.
2. Claude with vision compares to source screenshot. Produces a structured diff: "Hero: headline alignment right vs center; CTA button smaller; secondary color drift 8%; spacing between sections tightened."
3. Each diff element is scored severity (cosmetic / minor / breaking) and category (layout / color / typography / content / interactive).
4. **Failure** if severity "breaking" is present on any element. **Warning** if too many "minor"s accumulate.
5. Output feeds Auto-Fix agent (below).

**Impact:** Fidelity threshold becomes meaningful instead of arbitrary. Also generates actionable feedback the client can see ("we matched your site except the hero alignment — accept or let us regenerate?").

**Where:** `packages/verify/` — Claude-powered visual comparator.

### 1c. Auto-Fix agent

**Problem:** When verify fails, the current plan is "regenerate from scratch." That's expensive and doesn't always converge. A real auto-fix closes the loop without a full regeneration.

**Agent loop:**

1. Visual Verify returns a structured diff for a block.
2. Claude reads the current block source (Astro + styles + schema) + the diff + the source screenshot.
3. Proposes a minimal edit (adjust a CSS value, change a flex alignment, swap a token reference).
4. Apply the edit, re-render, re-verify.
5. Up to N iterations; if not converging, escalate to full regenerate.

**Impact:** Most verify failures are a 1–2 line CSS fix. This agent handles those without burning a full regeneration cycle. Converts "50% of blocks need regenerating" into "50% of blocks need a 2-line tweak."

**Where:** `.agents/skills/auto-fix-block/`, invoked by `apps/api` when verify fails.

---

## Gap 2: Value-creating agents (product differentiation)

These are what makes HostaPosta feel qualitatively different from a CMS-with-AI-features. They're the reason a client chooses it over Webflow.

### 2a. Brand Voice agent

**Problem:** Every downstream AI feature (copy assistant, content proposer, AI-drafted blocks) is only as good as its understanding of the client's brand voice. If it writes in a generic LLM tone, clients reject the output and the AI surface dies.

**Agent loop:**

1. On ingestion, reads all copy across the source (headings, body, CTAs, microcopy).
2. Extracts: tone (formal/casual/playful/technical), voice markers (sentence length, vocabulary, rhetorical patterns), avoid-list (phrases that shouldn't be used), signature words/phrases.
3. Stores as a `BrandVoice` global on the tenant (editable by client).
4. Used as context in every downstream AI text generation — copy assistant, content proposer, new-block placeholder text, alt-text generation.

**Impact:** Multiplier on every other AI feature. Without this, AI-generated text in admin feels off-brand. With it, feels native.

**Where:** `.agents/skills/extract-brand-voice/`, runs in parallel with tokens + collection parser.

### 2b. Copy Assistant (in-admin)

**Problem:** Non-technical clients are bad at writing. They'll spend an hour on a headline and still not love it. This is where AI-native admin beats traditional CMS.

**Agent loop:**

1. Client is editing a field in admin (headline, paragraph, CTA).
2. Inline AI actions: "Improve," "Shorten," "Expand," "Make more [formal/friendly/technical]," "Translate to [lang]."
3. Uses `BrandVoice` + field context (what block, what page, what's around it) as input.
4. Proposes 2–3 variants. Client picks one or edits.

**Impact:** Editing UX leaps past Webflow's text tools. Low effort, high visible value. Makes the product feel magical.

**Where:** `apps/admin` integration, backed by `.agents/skills/copy-assist/`.

### 2c. Asset Intelligence agent

**Problem:** Clients upload massive unoptimized images. Lovable-sourced sites have placeholder alt text. Nobody writes good alt text manually.

**Agent loop:**

1. On media upload (or ingestion asset import):
   - Analyze image: content (for alt text), role (hero/thumbnail/decorative), subject detection, focal point.
   - Generate alt text via vision + brand voice.
   - Crop to named aspect ratios based on detected focal point.
   - Generate responsive srcset variants, store in R2.
   - Auto-tag for the media library.
2. Client sees: their asset uploaded, intelligently cropped, alt-texted, categorized — without doing anything.

**Impact:** Enterprise-CMS-level asset management, free to clients. Also a11y wins. Visible quality signal.

**Where:** `packages/ingest/extract/` + `apps/api` media pipeline, backed by `.agents/skills/analyze-asset/`.

### 2d. Content Proposer (re-engagement)

**Problem:** After handoff, sites go stale. Clients don't edit. They churn.

**Agent loop:**

1. Weekly (or on admin visit): agent reviews the tenant's site — last published date, content gaps, competitor patterns (optional), seasonal relevance.
2. Proposes: "You haven't posted to your blog in 3 weeks. Here are 3 topics in your voice that fit your services. Want me to draft one?"
3. If client accepts, drafts a full post using `BrandVoice` + `Service` / `CaseStudy` collection data as context.
4. Draft lands as an unpublished `Blog` entry for review.

**Impact:** The product doesn't just let you edit a site — it keeps it alive. Retention driver, not a feature.

**Where:** `.agents/skills/propose-content/`, scheduled via cron in `apps/api`.

### 2e. Onboarding agent

**Problem:** First-time non-technical client opens admin, sees 12 nav items, bounces. The admin UX is fine, but there's a cold-start problem.

**Agent loop:**

1. First admin login post-handoff: conversational "what do you want to change?" prompt.
2. Client types "change the headline on my homepage."
3. Agent navigates them: opens homepage → hero block → highlights the headline field. Maybe offers a Copy Assistant starter.
4. Same for "add a blog post," "change brand colors," "add a new page about pricing."

**Impact:** Collapses the onboarding cliff. Makes admin feel like an assistant, not a CMS.

**Where:** `apps/admin` chat surface, backed by `.agents/skills/admin-navigator/`.

---

## Gap 3: Learning agents (platform flywheel)

These make the platform smarter per tenant added. They're low-priority until there are tens of tenants, but architecting for them now means the data they need gets captured from day one.

### 3a. Collection Proposer

**Problem:** Collection Parser flags unmapped structured content per tenant. Individually, these are noise. Aggregated across tenants, they're signal — "many sites have a Partners section" is the case for adding a Partners collection to the platform.

**Agent loop:**

1. Aggregates `unmappedStructured` across all tenant ingestions (anonymized, opt-in).
2. Clusters by suggested shape (similar field sets, similar names).
3. When a cluster crosses a threshold (e.g., 20+ tenants, >5 independent matches), proposes a new platform collection to the team — with a field spec, recognition heuristics, and example sites.
4. Platform team reviews, accepts → new collection ships; all tenants gain ability to enable it.

**Impact:** The platform's collection library grows based on real demand, not guesswork. Week 1: Blog + Testimonial + Team. Month 6: + Partners, Awards, Podcast Episodes, …

**Where:** `apps/api` background job, backed by `.agents/skills/propose-collection/`.

### 3b. Parser Trainer

**Problem:** Collection Parser's eval suite is static. Real client ingestions generate a stream of "agent said X, client corrected to Y" signal that should improve the parser over time — but only if captured.

**Agent loop:**

1. Every ingestion's parser output is logged (raw).
2. Every client edit in admin is logged (raw, opt-in).
3. Batch job: diff parser-output vs current-state-in-admin per collection type.
4. Large diff = parser got it wrong on that tenant. Surface to the platform team as a candidate eval case with hand-labeling prompt.
5. Team labels → eval suite grows → parser prompts/heuristics improve → re-runs eval before each prompt/schema change.

**Impact:** Parser quality compounds with scale. Competitors can't match this without the same data flow.

**Where:** `apps/api` background job + human review tooling, backed by `.agents/skills/diff-parser-output/`.

### 3c. Pattern Miner (block library intelligence)

**Problem:** Per-tenant blocks are fully isolated. Every tenant's "hero" is generated from scratch. There's no learning across tenants even when 80% of clients end up with structurally similar blocks.

**Agent loop (opt-in, anonymized):**

1. Crawls generated block corpus periodically.
2. Clusters blocks by structural similarity (field schema + composition, not visual).
3. When clusters cross a threshold, proposes a **block primitive** — a shared underlying structure that per-tenant blocks can customize visually.
4. Future `generate-block` runs use these primitives as scaffolding, dropping generation time and improving quality.

**Impact:** Generation cost drops over time. Quality improves over time. Per-tenant visual fidelity preserved (primitives are structural, not visual).

**Where:** background job + platform-level approval flow.

---

## What NOT to agent

To stay honest — not every problem deserves an agent. These are bad fits:

- **Archetype detection.** Deterministic file-presence check (`next.config.js` → Next, `astro.config.mjs` → Astro). Rule-based is faster + more reliable than an agent. Use the LLM only for ambiguous mixed setups.
- **Dedupe/validate in Collection Parser.** Already correctly scoped as deterministic TypeScript, not Claude.
- **Deploy orchestration.** Wrangler/Vercel API calls are deterministic. No judgment needed. Don't wrap them.
- **Schema migrations.** If collection schemas change, migration is code + tests, not an agent. Agentic migrations are terrifying and unnecessary.
- **SEO audits.** Specialized SaaS (Ahrefs/Semrush API) does this better. Integrate, don't build.
- **A/B testing orchestration.** Deterministic stats + pre-written variant slots. Let the experiment framework be boring.

---

## Priority stack

### Must-have for Phase 2 (MVP with real clients)

1. **Build Repair agent** (Gap 1a) — ingestion success rate depends on it.
2. **Visual Verify agent** (Gap 1b) — fidelity contract depends on it.
3. **Auto-Fix agent** (Gap 1c) — converts failures into tweaks; keeps cost down.
4. **Brand Voice agent** (Gap 2a) — unlocks every downstream text AI; must exist before Copy Assistant.
5. **Copy Assistant** (Gap 2b) — the most visible "AI-native" differentiator; low cost, high perception.
6. **Asset Intelligence agent** (Gap 2c) — visible quality signal; a11y wins.

### Should-have for Phase 3 (retention)

7. **Content Proposer** (Gap 2d) — retention, re-engagement, stops sites going stale.
8. **Onboarding agent** (Gap 2e) — collapses admin cold-start cliff.

### Platform-scale (Phase 4+)

9. **Collection Proposer** (Gap 3a) — grows the collection library from real demand.
10. **Parser Trainer** (Gap 3b) — compounding parser quality.
11. **Pattern Miner** (Gap 3c) — generation cost + quality improvements.

---

## Architectural implications

### `.agents/` grows

```
.agents/
├── AGENTS.md
├── knowledge/
│   ├── collection-patterns/
│   ├── brand-voice-patterns/
│   ├── build-errors/            # common build failures + fixes
│   └── visual-diff-taxonomy/
└── skills/
    ├── ingest-normalize/
    ├── extract-tokens/
    ├── extract-brand-voice/      ← new
    ├── collection-parser/
    ├── generate-block/
    ├── regenerate-block/
    ├── add-new-block/
    ├── build-repair/             ← new
    ├── visual-verify/            ← new
    ├── auto-fix-block/           ← new
    ├── analyze-asset/            ← new
    ├── copy-assist/              ← new
    ├── propose-content/          ← new
    ├── admin-navigator/          ← new
    ├── propose-collection/       ← new
    ├── diff-parser-output/       ← new
    └── mine-block-patterns/      ← new
```

### New packages

- `packages/agent-runtime/` — shared agent harness (loop control, max iterations, retry policy, tool-use envelopes, observability). Every Gap-1 agent needs this.
- `packages/ai-ui/` — the admin-side primitives for AI interactions (inline copy-assist triggers, chat surface for onboarding agent, proposer cards). Split from `admin-fields` because it's a different primitive class.

### Observability

Every agent run gets logged as a **trace** — inputs, LLM calls, tool calls, outputs, final state. Not optional. Without this, when an agent misbehaves on a tenant site, nothing's debuggable.

---

## Cost awareness

Agentic loops burn tokens. A rough budget-sanity pass per tenant ingestion:

| Agent | Estimated calls per ingestion | Notes |
|---|---|---|
| Collection Parser | 5–15 (detect + per-collection extract) | Vision-heavy |
| Token Extractor | 2–4 | Vision |
| Brand Voice | 1–2 | Text-only, large context |
| Build Repair | 0–3 | Only on failure |
| Block Generator | 5–30 (one per distinct block) | Bulk of cost |
| Visual Verify | 5–30 (one per generated block) | Vision |
| Auto-Fix | 0–60 (only on verify failure, up to 2 per fail) | Most expensive in aggregate |

Cap per-ingestion token spend in `agent-runtime` with a hard ceiling. Exceed → halt, surface to operator. Prevents runaway cost from a single bad upload.

Use `AI_MODEL` tiering (already in HostaPosta): Haiku for cheap detection/validation, Sonnet for generation, Opus for hard recoveries.

---

## Open questions

1. **Agent vs skill threshold.** My cut: if it has a retry/recovery loop, it's an agent. If it's a single call, it's a skill. Worth validating — some "skills" I labeled may benefit from a 1–2 iteration recovery loop too (e.g., `generate-block` that re-runs on malformed output).
2. **Should Auto-Fix be same agent as Visual Verify?** Current spec: separate. Reason: Verify's job is to judge; Auto-Fix's job is to act. Separation of concerns + testability. Could fuse later if prompt discipline allows.
3. **Brand Voice editability.** If client edits their BrandVoice, do we re-run copy-assist variants automatically? Probably not — but we should track voice-version alongside generated copy so stale voice-generated text is flagged.
4. **Proactive vs reactive Content Proposer.** Cron-driven (proactive) vs triggered on admin visit (reactive). Reactive is cheaper and less annoying; proactive has higher engagement. Start reactive.
