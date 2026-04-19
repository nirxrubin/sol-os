# HostaPosta — Product Requirements Brief

**Status:** Draft — merging HostaPosta + wesbiteMaster into a single product
**Last updated:** 2026-04-19

---

## One-liner

Non-technical clients bring a site they generated in Lovable / v0 / bolt / Figma / a live URL — HostaPosta regenerates it on a managed Astro + Payload + R2 + Vercel stack, hands it off with a CMS, and lets them edit content, add pages, and extend collections without ever touching code.

---

## Problem

Tools like Lovable, v0, and bolt let non-technical people *generate* a website fast. What they don't solve:

- The site is raw React/Next/Vite code. The client can't meaningfully edit it.
- There's no CMS. Every copy change, image swap, or new page is a developer task.
- Hosting, domains, env vars, deploys — all foreign concepts to the client.
- "Add a new page in the same style" is hard without understanding the codebase.
- Agencies/builders get dragged into forever-maintenance tickets instead of shipping new work.

Clients aren't stuck because they lack tools — they're stuck because the tools drop them off at the hardest part (post-generation lifecycle).

---

## Target user

**Primary:** Non-technical business owners and marketers who used Lovable/v0/bolt/Figma to generate a site. They can't and don't want to learn React, deploy configs, or headless CMS concepts. They want to edit copy, swap images, add pages, add content collections.

**Secondary:** The builders/agencies who assembled those generated sites for them. HostaPosta lets those builders hand off cleanly instead of staying on the hook for every edit.

**Not the user:** Developers who want a template to fork. This is not a starter kit.

---

## Product promise

1. **Bring anything** — ZIP, folder, GitHub repo, live URL, Figma file, or description.
2. **Get exactly what you brought** — fidelity to the source is non-negotiable.
3. **Edit everything** — copy, images, brand tokens, all editable in a visual CMS.
4. **Add pages yourself** — compose from your own blocks, no dev required.
5. **Add collections yourself** — blog, products, team, case studies — spin them up in the CMS.
6. **Grow the site** — request new block types via a Claude-powered generator, no dev required.

---

## Core flows

### 1. Ingestion → live site

1. Client uploads a ZIP / connects GitHub / pastes a URL / shares a Figma link / describes what they want.
2. `apps/api` routes to the right ingestion adapter.
3. For code sources: extract → detect archetype → `npm run build` → parse rendered HTML + resolved CSS + assets.
4. For non-code sources (URL, Figma): crawl or MCP-fetch → screenshot + extract.
5. Claude analyzes the normalized `IngestionResult`: brand tokens, section types, routes, and **content types present** (blog? testimonials? team? case studies?).
6. Platform enables the matching **shared collections** for the tenant (Blog, Testimonial, Team, etc.). Claude extracts entries → creates typed records in each collection.
7. Claude generates a **per-tenant block set** — schema + Astro component + scoped styles + preview + editor name — for every distinct section. Blocks that render collection content declare their collection references.
8. Assets uploaded to R2 via Payload's media field.
9. Build runs through `verify` (build + smoke + visual regression vs source).
10. Deploy to Vercel via Vercel API (per-tenant project, env vars, domain).
11. Resend email to client with their site URL + admin invite.

### 2. Ongoing edit

- Client logs into `apps/admin` (the only UI — they never see Payload).
- Edits copy, images, brand tokens via dynamic forms rendered from each block's JSON schema.
- Foundation token edits propagate everywhere via the CSS cascade.
- Rearranges or duplicates blocks within a page via the page composer.
- Creates new pages by composing from their existing ~5–20 blocks.
- Creates new collection entries (blog posts, products, etc.).
- Hits publish → webhook → rebuild + redeploy via Vercel ISR.

### 3. Add a new block type

- Client hits "Add block type" in admin.
- Uploads a reference image, pastes a URL, or describes it.
- Claude generates the block (schema + Astro + styles + preview).
- Preview + accept/regenerate flow.
- Block joins their picker, usable on any page.

### 4. Regenerate a block

- Per-block "regenerate" button in admin for when a block came out wrong or needs tweaking.
- Content in *other* blocks on the page is preserved.
- Only that block is re-run through generation + verify.

---

## Settled product decisions

| Decision | What we chose | Why |
|---|---|---|
| CMS | Payload | Clients need block composition + new pages + collections without dev |
| Asset storage | Cloudflare R2 | Cheap object storage; Payload media field → R2 |
| Hosting (tenant sites) | **Vercel** | Draft preview, ISR, image optimization — load-bearing for a CMS-backed product |
| Hosting (control plane) | Cloudflare or existing HostaPosta host | Decoupled from tenant hosting; reuse existing infra |
| Framework (tenant sites) | Astro | Islands model fits CMS-backed content sites; clean build output |
| Data model | **Two-layer: shared collections + per-tenant blocks** | Collections carry universal schemas; blocks carry per-tenant visuals |
| Shared collections | Typed Payload collections: Blog, Testimonials, Team, CaseStudy, Service, FAQ, Product, Event, Job, Page, Media | Defined once in code, tenant-scoped by `tenantId`; editing UX built once |
| Block model | Per-tenant, visually baked, reference shared collections | Exact visual fidelity; data shape stays universal |
| Block library | No shared blocks across tenants (rendering is tenant-specific) | Visual isolation; rendering lives per-tenant |
| Payload topology | **Shared Payload, tenant-scoped, block-as-JSON** | Clients never see Payload admin; `apps/admin` is the entire UI — no need for typed block editors |
| Client-facing UI | Everything inside `apps/admin` | Clients never touch Payload admin; HostaPosta is the whole product |
| Ingestion sources | ZIP, GitHub, URL, Figma, description | Covers all realistic client starting points |
| Primary ingestion signal | Parsed build output (HTML + CSS) | More reliable than booting + screenshotting |
| Screenshots | Verify-gate + vision-fallback only | Code is the richer signal when available |
| Design tokens | Mandatory 3-layer (foundation / page / component) | Only lever for global edits when blocks are visually baked — see dedicated section |
| ZIP-deploy (pass-through) | Killed | Doesn't serve the target user; they can't edit raw React |

---

## Open decisions

1. **Payload fleet runtime.** Per-tenant Payload decided. Open: do we run one Payload process per tenant (container-per-tenant, orchestrated by `apps/api`) or one shared Payload runtime that loads per-tenant config on request? Process-per-tenant is cleaner; runtime-multiplex is cheaper. **Phase 0 spike.**
2. **Shared-Payload fallback viability.** If block-as-JSON (one Payload, generic block type, custom admin UI per block) can be made to feel good, shared Payload is cheaper and simpler. Worth a half-day exploration before committing to per-tenant. **Phase 0 spike.**
3. **Block generation: one-shot vs re-runnable.** Settled on re-runnable *per-block*, not full re-ingestion. Still need to design the regenerate-vs-content-preservation merge.
4. **Static-build fallback.** Apps that can't static-build (require live backend to render). Fall back to boot + crawl, or reject upload with guidance? **Decide after Phase 1.**
5. **Pricing / tenancy model.** Not in scope for this brief.

---

## Architecture

### Monorepo layout (pnpm workspaces)

```
hostaposta/
├── .agents/                   # constitution, knowledge, skills (generalized from wesbiteMaster)
│   ├── AGENTS.md
│   ├── knowledge/
│   └── skills/
├── .claude/
├── .mcp.json                  # Payload MCP, Vercel MCP, Cloudflare R2 MCP, Figma MCP
├── apps/
│   ├── admin/                 # ← hp-app. Control plane UI (React + Vite). Thin.
│   └── api/                   # ← hp-server. Control plane API + generation engine. Heavy.
├── packages/
│   ├── ingest/                # all input-source handling
│   │   ├── archetype/
│   │   ├── zip/
│   │   ├── repo/
│   │   ├── build/             # npm install + build orchestration (lifted from hp-server)
│   │   ├── parse/             # HTML/CSS/asset/route extraction from build output
│   │   ├── url/
│   │   ├── figma/
│   │   └── capture/
│   ├── collections/           # shared Payload collection schemas (Blog, Testimonial, Team, …)
│   ├── tokens/                # 3-layer token system, extractor, types
│   ├── admin-fields/          # dynamic field renderers for apps/admin (text, richtext, media, …)
│   ├── ai-ui/                 # admin-side AI primitives (copy-assist triggers, chat surface, proposer cards)
│   ├── verify/                # smoke + Claude-powered visual-verify + schema checks
│   ├── agent-runtime/         # shared agent harness: loop control, iteration caps, retry, tracing
│   └── skills-runtime/        # runtime adapters for .agents/skills
├── templates/
│   └── site-starter/          # the Astro + Payload + R2 skeleton every tenant forks
├── docs/
├── scripts/
└── tests/
```

### Per-tenant artifacts (provisioned on demand)

- Tenant-scoped records in the shared Payload (block types, block instances, pages, collections, tokens, media).
- R2 bucket (or prefixed path within a shared bucket) for tenant assets.
- A Vercel project for the tenant site.
- A DNS record when the client brings a custom domain.

The **only** tenant-local code is the forked `site-starter/` build artifact, generated on each deploy from Payload data — not a long-lived per-tenant repo.

### Key flows by component

- **`apps/admin`** — the entire client-facing product. Owns:
  - Project dashboard, upload entry points, progress stream viewer
  - **Collection editors** (fixed per collection type — built once: Blog editor, Testimonial editor, Team editor, etc.). Typed, high-polish.
  - **Block editors** (dynamic — rendered from `BlockType` JSON schemas). Per-tenant custom fields.
  - **Page composer** — drag-and-drop blocks, reorder, duplicate, delete. Blocks that reference collections show "pick which entries to display" controls.
  - **Brand panel** — foundation token editing. Highest-leverage edit path.
  - **Media library** — R2-backed, shared by all collections and blocks.
  - Team/settings, publish flow, "Add a blog / testimonials / team / …" one-click collection enablement.
  - Clients never see Payload's admin.
- **`apps/api`** — orchestrator + generation engine. Owns ingestion routing, Claude orchestration, Payload provisioning (tenant scaffold), R2 bucket management, Vercel project provisioning + deploys, Resend emails, per-block regeneration, build triggers on publish.
- **`packages/ingest`** — produces a normalized `IngestionResult` regardless of source.
- **`packages/admin-fields`** — shared field renderer library used by `apps/admin` (text, richtext, media, url, select, repeater, relation, color, number, etc.). Every field type in a block schema maps to one of these renderers.
- **`.agents/skills`** — versioned Claude skills and agents. See `docs/agentic-review.md` for the full agent surface + priority stack.
  - **Ingestion pipeline:**
    - `ingest-normalize` — source-specific parsers producing the unified `IngestionResult`.
    - **`build-repair`** (agent) — diagnoses + fixes common `npm run build` failures; retry loop with iteration cap. Load-bearing for ingestion success rate.
    - `extract-tokens` — foundation design tokens from parsed CSS + images.
    - `extract-brand-voice` — tone, voice markers, avoid-list; multiplier on every downstream text AI.
    - **`collection-parser`** (agent) — detects shared collection types, extracts entries into typed records, flags unmapped content. See `docs/agents/collection-parser.md`.
  - **Generation pipeline:**
    - `generate-block` — per-tenant Astro + JSON-schema block generator; consumes tokens + collection references + brand voice.
    - `analyze-asset` — per-image role detection, focal-point crop, alt-text, responsive variants.
  - **Verify pipeline:**
    - **`visual-verify`** (agent) — replaces pixel-diff with semantic Claude-vision comparison; produces structured diffs with severity.
    - **`auto-fix-block`** (agent) — reads structured diff + block source, proposes minimal edit, re-renders, re-verifies up to N iterations.
  - **Post-launch:**
    - `regenerate-block`, `add-new-block`, `copy-assist`, `admin-navigator`, `propose-content`.
  - **Platform intelligence (Phase 4+):**
    - `propose-collection`, `diff-parser-output`, `mine-block-patterns`.
  - All invoked by `apps/api` via `skills-runtime` + `packages/agent-runtime`.
- **`templates/site-starter`** — the quality ceiling for every tenant site. Ships with layouts, build config, design token infrastructure, verify gates, Payload data adapter, R2 adapter, zero brand content. Consumed at build time, not forked per tenant.

---

## Design token system (load-bearing)

Visually-baked per-tenant blocks mean each block hardcodes its layout and visual structure. Without a token system, "change the brand color" requires editing every block's CSS. The token system is the **only** mechanism that makes the site globally editable. Treated as mandatory infrastructure, not convention.

### Three layers (lifted from wesbiteMaster, generalized)

1. **Foundation tokens** — `:root` scope. The tenant's brand system: primary/secondary/neutral palettes, type scale, spacing scale, radii, shadow set, motion defaults. One source of truth. Edited by the client in a "Brand" section of the Payload admin. Propagates everywhere.
2. **Page-level overrides** — `[data-page="slug"]` scope. Per-page variants (e.g., a dark landing page overriding the default light palette). Optional.
3. **Component-scoped** — inside each block's `<style>` block. Only for truly block-specific values that shouldn't leak (e.g., a unique internal grid measurement). Blocks **must** reference foundation tokens for all brand-relevant values (colors, type, spacing, radii) — this is enforced in the `verify` gate.

### Extraction during ingestion

A dedicated Claude skill, `extract-tokens`, runs as an early step on any ingestion source. Inputs: parsed CSS, computed styles, image palette analysis, font detection. Output: a foundation-token set that best captures the source's brand system. Quality here determines how well global edits will work later — worth investing in.

### Enforcement

- `verify` fails if a block contains hardcoded hex values, raw px type sizes, or non-token spacing values (with a narrow allowlist for component-internal measurements).
- The `generate-block` skill is prompted to always reference foundation tokens; verify catches regressions.
- Migrations: when a foundation token changes, no block needs editing — the CSS cascade does the work.

### Client-facing surface

In the admin, a "Brand" panel exposes foundation tokens as editable controls (color pickers, type scale sliders, spacing controls). Clients edit these; changes trigger a rebuild + redeploy. Token edits are the cheapest, safest, highest-leverage edits a client can make — optimize for this path.

---

## CMS model: shared collections + per-tenant blocks

Following wesbiteMaster's pattern. **Data schemas are universal; visual rendering is per-tenant.**

### Shared collections (typed Payload)

Defined once in code, used by every tenant, tenant-scoped via `tenantId`. Editing UX for these is built **once** in `apps/admin` — fixed typed editors, not dynamic.

| Collection | Purpose | Enabled by default? |
|---|---|---|
| `Page` | Every site's pages with composed blocks | Always |
| `Media` | Assets → R2 | Always |
| `Navigation` (global) | Header/footer nav structure | Always |
| `SiteSettings` (global) | SEO defaults, analytics, integrations, social | Always |
| `Brand` (global) | Foundation design tokens | Always |
| `Blog` | Blog posts / articles | Optional — enabled if ingestion detects one, or via "Add blog" in admin |
| `Testimonial` | Quote, author, role, company, avatar, featured | Optional |
| `Team` | Name, role, bio, photo, social | Optional |
| `CaseStudy` | Title, client, summary, body, results, gallery | Optional |
| `Service` | Name, description, icon, features, pricing | Optional |
| `FAQ` | Question, answer, category | Optional |
| `Product` | Name, price, description, images, sku, variants | Optional (e-commerce) |
| `Event` | Title, datetime, location, description | Optional |
| `Job` | Title, department, location, description, applyUrl | Optional |

New collections are added by the platform team (code change), not per tenant. This is the right shape — tenants shouldn't be inventing "blog" or "testimonial" themselves.

### Per-tenant blocks (JSON-schema'd)

Page section components — hero, feature grid, testimonials carousel, blog index, CTA banner, etc. Each block carries:

- JSON field schema (the block's own fields — e.g., a CTA's headline + button text)
- Astro component source (how it renders)
- Scoped CSS (how it looks)
- Collection references (e.g., "Testimonials Carousel" declares it reads from `Testimonial`)
- Preview image + editor-facing name/description

Blocks **reference** shared collections for content lists (a "Blog Index" block reads `Blog` entries; a "Team Grid" reads `Team` entries). Blocks **don't re-invent** the data — they render it.

### Ingestion maps content types → collections

When parsing an uploaded site:

1. Detect content types — "this site has a blog, testimonials, and a team page."
2. Enable the matching shared collections on the tenant.
3. Extract entries into those collections (each blog post → a `Blog` record, each testimonial → a `Testimonial` record).
4. Generate per-tenant blocks that render each detected section (a "Testimonials Carousel" block styled to match the upload; a "Blog Index" block for the blog listing; a "Team Grid" for the team page).

### "Add a blog to your site" as a product feature

Because collections are shared and code-defined, a client can later turn on a collection they didn't originally have:

- Admin: "Add a blog."
- Platform enables the `Blog` collection on their tenant.
- Claude generates matching per-tenant blocks (blog index, blog post layout) in their visual style, using existing foundation tokens.
- Client gets a working blog, on-brand, in minutes.

This is one of the strongest product moments; it's only possible because collections are universal.

---

## Payload topology

### Principle

Clients never see Payload's admin. `apps/admin` is the entire HostaPosta UI. Payload is a **headless data layer**: auth, access control, media→R2, draft/publish, versioning, webhooks, API.

### Shape

**One shared Payload, tenant-scoped.** Hybrid typed/JSON model:

- One Payload process, one Postgres.
- Multi-tenancy via explicit `tenantId` on every collection (or Payload's multi-tenant plugin).
- **Shared collections** (Blog, Testimonial, Team, etc.) defined in Payload config — typed, versioned, migratable. Same schema for all tenants.
- **`BlockType` collection** — tenant-scoped. Holds each block's JSON field schema, Astro component source, scoped CSS, preview, collection-reference declarations.
- **`BlockInstance` collection** — tenant-scoped. Keyed to a `BlockType`, holds `data` matching that type's JSON schema, plus page + order.
- **`Page` collection** — shared schema, tenant-scoped. Slug, title, SEO, list of block instances.
- **`Media` collection** — shared schema, tenant-scoped. R2-backed.
- **Globals** (Navigation, SiteSettings, Brand) — shared schemas, tenant-scoped.

### How editing works in `apps/admin`

1. Client opens a page.
2. `apps/admin` fetches the page's block instances + their block types.
3. For each instance, renders a dynamic form using field renderers keyed to the block type's schema (text → input, media → R2 picker, richtext → tiptap, repeater → nested list, relation → collection picker).
4. On save, POST to Payload's API — no typed Payload field definitions required; data conforms to the schema in `BlockType`.
5. Publish → webhook → rebuild + redeploy affected pages via Vercel ISR.

### Build time

Astro build reads `BlockType` records for the tenant, writes `.astro` components from `componentSource`, composes pages from `BlockInstance` records, applies `TokenSet` as CSS custom properties. `site-starter` contains the build machinery; per-tenant content is pulled from the shared Payload at build time.

### Why this is platform-like

One Payload, one Postgres, one deploy pipeline, one admin UI. Clients see HostaPosta. Operationally this is indistinguishable from any modern SaaS.

### Escape hatch: per-tenant Payload

If, during Phase 0 spike, tenant-scoping on a shared Payload proves fragile at meaningful scale (row-level security complexity, query perf, blast radius of a bad deploy across all tenants), per-tenant Payload remains available as a pivot — at the cost of fleet ops. Not the default; a fallback.

---

## What survives from HostaPosta

| Asset | Destination | Purpose shifted? |
|---|---|---|
| Archetype detector | `packages/ingest/archetype/` | Still detects Next/Vite/CRA/static; add Astro |
| Build orchestration | `packages/ingest/build/` | From "build to deploy" to "build to parse" |
| Env var inference | `packages/ingest/build/` | From "build-time secrets" to "boot-time minimums" |
| Progress streaming | `apps/api/` | More stages now; UX matters more |
| Resend handoff | `apps/api/` | Unchanged |
| Dashboard UI patterns | `apps/admin/` | Unchanged |
| Claude SDK usage | `apps/api/` + `skills-runtime/` | Externalized into skills instead of embedded in code |

## What survives from wesbiteMaster

| Asset | Destination | Purpose shifted? |
|---|---|---|
| `.agents/` (constitution + knowledge + skills) | root `.agents/` | Generalized, de-reindeered |
| Design token 3-layer system | `packages/tokens/` + `templates/site-starter/` | Now mandatory infrastructure, not convention |
| Mock-data parity pattern | `templates/site-starter/` | Site renders without Payload token for dev/CI |
| `verify` gate | `packages/verify/` | Runs per-tenant; includes visual regression vs source |
| Git pre-push hook enforcing verify | `.githooks/` | Unchanged |
| Figma-to-component skill | `.agents/skills/` | Generalized as "reference-to-block" (any input source) |
| `.mcp.json` pattern | root | Updated to Payload + Vercel + R2 + Figma |

## What dies

- `hp-app/` and `hp-server/` as separate top-level dirs (become `apps/admin` and `apps/api`).
- ZIP-deploy pass-through flow.
- Storyblok and all its wiring.
- Vercel-specific config.
- `.superpowers/brainstorm/` (superseded by `.agents/`).
- Reindeer site content in wesbiteMaster `src/`.
- The `hp-` prefix.

---

## Non-goals

- **Not a template marketplace.** Clients don't browse blocks or templates.
- **Not a developer tool.** No API for devs to plug into the stack. Not a fork-and-reskin starter.
- **Not a page builder from scratch.** Every site must start from an ingested source. (Description-only generation is a weak input, not the headline flow.)
- **Not multi-framework.** Tenant sites are Astro + Payload. Period.
- **Not keeping client React code alive.** Ingestion reads code; it does not preserve it.

---

## Main risks

### 1. `apps/admin` editing UX is the product (product ceiling)

Clients never touch Payload's admin, so the entire editing surface is ours. The shared-collections model cuts a big chunk of this — collection editors are fixed per type and built once (Blog, Testimonial, Team, etc.) — but the block editors (dynamic, per-tenant), page composer, media library, Brand panel, and publish flow all still need to feel as good as Squarespace / Webflow / Framer. Mitigations:

- **Collection editors are built once per collection type.** Design and engineer them like any polished SaaS admin; they'll be used by every tenant.
- **`packages/admin-fields`** is a first-class product surface — every field type tested, versioned, designed.
- **Dynamic block editors** reuse those same field renderers driven by the block's JSON schema — the dynamic surface is narrower than it first looks.
- **Page composer** is the hardest piece — reference-play Webflow's designer and Framer's canvas early.
- Phase 1 success metric: a non-technical pilot client can edit a page, add a blog post, publish, and add a new page using only `apps/admin`, without support intervention.

### 2. Block generation quality (product ceiling)

Per-tenant blocks = no shared quality floor. Every tenant's site is at the mercy of whatever Claude generates that run. Mitigations:

- `verify` gate blocks deploy until screenshot diff vs source is within threshold.
- Auto-retry on verify failure before client sees anything.
- Per-block regenerate button once the site is live.
- Skills tightly constrained (strict schema, mock-data required, named fields, preview thumbnail mandatory).

### 3. Static-build reliability (ingestion ceiling)

Some client uploads won't static-build cleanly (missing env vars, dynamic backends, broken deps). Without a successful build there's no rendered HTML to parse. Mitigations:

- **Build Repair agent** (see `docs/agentic-review.md`) — diagnoses common failures, applies scoped fixes, retries with iteration cap. Highest-leverage addition for ingestion success rate.
- Claude infers minimum-viable env vars from code + prompts client for the rest.
- Fallback to headless boot + route crawl when build fails.
- Clear error UX: "we couldn't build your site, here's what we need" with a specific ask, not a generic failure.

### 4. `.agents/` generalization (knowledge transfer)

wesbiteMaster's constitution is valuable because it's concrete. Stripping reindeer-specific examples risks leaving it abstract and useless. Budget real time to *replace* examples with platform-relevant ones — don't just delete.

### 5. Visual-regression threshold (fidelity contract)

The fidelity promise lives or dies on the verify gate's judgment. Pixel-diff alone is blind (font rendering = "fail"; broken CTA = "pass"). Mitigation: **Visual Verify agent** replaces pixel-diff with Claude-vision structured diffs (severity-scored per element) and feeds the **Auto-Fix agent**, which proposes minimal edits for breakable failures before falling back to full regeneration. See `docs/agentic-review.md`.

---

## Phased rollout

### Phase 0 — Spikes (same day)

- **Shared Payload, tenant-scoped, hybrid typed/JSON**: prove the data model (shared collections + BlockType/BlockInstance + Page + Media + TokenSet) end-to-end on one fake tenant.
- **Dynamic field renderer**: prototype `packages/admin-fields` with 4–5 field types (text, richtext, media, url, repeater) — validate the editor UX feel.
- **Astro + Payload + R2 + Vercel end-to-end** on one tenant (draft preview, ISR on publish, media from R2).
- **ZIP → build → parse** pipeline on 3–5 real Lovable/v0/bolt outputs — measure baseline build-failure rate to scope Build Repair agent.
- **Token extraction accuracy** on same sample set.
- **`packages/agent-runtime` skeleton** — loop control, iteration caps, retry, tracing — needed before any recovery-loop agent is buildable.

### Phase 1 — Single-tenant manual flow (same day, back-to-back with Phase 0)

- Strip wesbiteMaster → `templates/site-starter/` (no reindeer, Payload instead of Storyblok, Vercel adapter).
- `packages/collections/` with the core set: Page, Media, Brand, SiteSettings, Navigation, Blog, Testimonial, Team.
- `packages/ingest/` with ZIP + build + parse path + content-type detection.
- `packages/tokens/` with extractor + 3-layer enforcement in `verify`.
- Skills: `ingest-normalize` → [`extract-tokens` ∥ `collection-parser`] → `generate-block` → emit an Astro+Payload site. The **Collection Parser agent** is a dedicated pipeline — see `docs/agents/collection-parser.md` for the full spec.
- Manual deploy to Vercel. No `apps/admin` yet; trigger via CLI.
- Success metric: take a real Lovable ZIP with a blog and testimonials, run the pipeline, get a working site where those collections are populated and their rendering blocks are per-tenant.

### Phase 2 — Control plane + admin UX + must-have agents (~1–2 weeks)

This phase is bigger than I initially scoped — `apps/admin` is now the product, and the failure-preventing agents are load-bearing for real-client viability.

- `apps/api` orchestration: auto-provision tenant scaffold in shared Payload, R2 bucket/prefix, Vercel project.
- `apps/admin` full editing surface: dynamic block editor, page composer, media library (R2-backed), collection manager, Brand panel, publish flow, team/settings.
- `packages/admin-fields` with the full field-type set (text, richtext, media, url, select, repeater, relation, color, number, boolean).
- **Must-have agents** (see `docs/agentic-review.md` for priority stack):
  - Build Repair, Visual Verify, Auto-Fix (failure-preventing)
  - Brand Voice extractor + Copy Assistant in admin (AI-native differentiation)
  - Asset Intelligence (alt text, responsive variants, focal-point crops)
- Resend handoff emails.
- First real client onboarded — editing and publishing without support intervention is the pass condition.

### Phase 3 — In-product extensibility + retention agents (~few days)

- "Add a new block type" flow in admin.
- Per-block regenerate button.
- Additional ingestion sources: GitHub, URL, Figma.
- Custom domains.
- **Retention agents:**
  - Content Proposer (reactive first, cron later) — stops sites going stale post-handoff.
  - Onboarding agent — chat-driven admin navigator for first-time clients.

### Phase 4 — Platform intelligence

- Pricing / billing.
- Multi-user per tenant (client + their marketer, etc.).
- Post-launch analytics for clients.
- **Learning agents** (see `docs/agentic-review.md` Gap 3):
  - Collection Proposer — aggregates unmapped patterns across tenants, grows the shared collection library from real demand.
  - Parser Trainer — feedback loop from client edits improves Collection Parser quality.
  - Pattern Miner — structural block primitives lifted from tenant corpus, reducing generation cost + improving quality.

---

## Success metrics

- **Ingestion success rate** — % of uploads that produce a deployed site without manual intervention. Target: >80% by end of Phase 2.
- **Visual fidelity** — verify-gate pass rate on first generation. Target: >70% on first pass, >95% after one auto-retry.
- **Time to live site** — upload → deployed URL. Target: <10 minutes for typical Lovable output.
- **Client self-service rate** — % of content edits made by client vs escalated to builder/support. Target: >95%.
- **Block-addition success** — % of "add new block" requests that produce an accepted block in ≤2 regenerations. Target: >70%.

---

## Glossary

- **Tenant** — one HostaPosta client with one deployed site.
- **Template** — `templates/site-starter/`; the scaffolding every tenant forks.
- **Block** — a Payload-backed composable page section. Per-tenant, visually baked, content-editable.
- **Collection** — a Payload content type (blog, product, team member). Tenant-specific.
- **IngestionResult** — normalized output of any ingestion source, consumed by the generator.
- **Verify gate** — build + smoke + visual-regression check that must pass before a deploy reaches a client.
- **Skill** — a versioned Claude task under `.agents/skills/`, invoked by `apps/api`.
