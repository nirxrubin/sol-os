# Sol OS — Product Spec
**Date:** 2026-04-03
**Status:** Approved for implementation
**Participants:** Nir Techstura, Asi Fleishhaker (technical advisory), Claude (spec author)

---

## 1. Product Overview & Positioning

### What Sol is
Sol is the deployment and management OS for AI-generated websites and apps. It takes any exported project — from Lovable, Base44, Manus, Cursor, Webflow, or any AI tool — analyzes it, wraps a management dashboard around it, and deploys it to production with minimum friction. The user never touches Vercel, DNS, SSL, or any provider directly.

### What Sol is not
Sol does not generate websites. It does not compete with Lovable or Base44 on creation. It picks up exactly where they drop off — the moment you have a finished project and nowhere to take it.

### Primary positioning
- **Acquisition hook:** *"Generate anywhere. Launch with Sol."*
- **Retention value:** *"Your site, live and managed — forever."*

### The gap Sol fills
The non-technical user who builds with AI tools hits a wall at deployment. The tools that generated their site either have a basic built-in deploy (locked to their ecosystem) or no deploy at all. Sol is tool-agnostic — it reads any project, from any source, and handles everything after the build.

The technical user (Cursor, Claude Code) can already use Vercel + AI instructions. The non-technical user on Lovable/Base44 has improving built-in deploy. Sol's ICP is in the **handoff** — the moment a builder delivers a finished project to a non-technical client who needs to own and manage it ongoing.

### Business model
Two-sided platform. Builders (freelancers, agencies, indie devs) use Sol as their professional delivery tool — they bring client projects in. Clients pay a recurring subscription for their managed site. **Builders are the distribution channel. Clients are the revenue stream.**

---

## 2. ICP & User Journeys

### Primary ICPs

**The Builder**
Freelancers, small agencies, indie developers who use AI tools to build for clients. Technical enough to produce a finished project but don't want to set up and explain Vercel to every client. They want a professional, repeatable delivery workflow. They pay for a Sol workspace.

**The Client**
Small business owners, startups, entrepreneurs who received a built site and need it live and manageable. Zero technical knowledge, don't want any. They pay Sol a monthly subscription for hosting + managed infrastructure. The mental model: *a non-technical CEO who can log into Sol and instantly have a clear view of everything about their business app or website.*

### Builder Journey
1. Builds a project with any AI tool (or locally with Cursor/Claude Code)
2. Exports as a zip — uploads to Sol
3. If analysis takes >30s, Sol prompts for email and notifies when ready
4. Sol analyzes the project: detects pages, content, tech stack, source bindings, and any built-in CMS/admin logic
5. Builder reviews the canvas, makes final edits, configures CMS content types
6. Builder picks a deploy bundle (Starter/Pro/Scale) or builds a custom stack
7. Builder selects or purchases a domain
8. One click — Sol provisions all infrastructure under its master accounts
9. Builder shares live URL + Sol dashboard login with the client
10. Builder moves on to the next project

### Client Journey
1. Receives access link from builder — logs into Sol dashboard
2. Sees their live site (canvas preview), a content editor, domain status, site health
3. Updates blog posts, team members, FAQs, images — no code, no confusion
4. Manages SEO, AEO, GEO settings per page in plain language
5. Sol handles all renewals, SSL, uptime, provider management silently
6. Client never knows what Vercel or Cloudflare is

### The handoff moment
The builder needs to feel professional delivering it. The client needs to feel like they own something real, not like they're logging into someone else's tool. **The handoff UX is the product's most critical moment.**

---

## 3. Core Architecture

### Four layers, cleanly separated

**Layer 1: Analysis Engine** *(AI-powered, runs once on upload)*

Accepts any zip, extracts files, detects framework and structure. Runs sub-agents in parallel:
- **Page agent:** detects routes, page names, SPA vs static
- **Content agent:** finds CMS-worthy data arrays (blog posts, team, FAQs, products), extracts source bindings
- **Tech stack agent:** identifies framework, dependencies, build requirements, env vars
- **In-app CMS agent:** detects built-in admin panels, CMS integrations, auth-gated dashboards

Outputs a structured **project manifest** — pages, content types, source bindings, detected framework, build config, and CMS disposition. This is the only expensive AI operation. Everything downstream uses the manifest.

**In-app CMS detection logic:**
When Sol detects an existing CMS or admin dashboard inside the imported project, it classifies it as one of:
- **Wrap:** Project has a `/admin` route or similar — Sol surfaces a link to it from the dashboard, doesn't replace it
- **Coexist:** Project connects to an external CMS (Contentful, Sanity, Firebase) — Sol shows native CMS alongside the external integration
- **Replace:** Project has hardcoded data arrays that can be extracted — Sol migrates them to its native CMS tables

The Sol dashboard always shows the client what content management options are available and how they work, regardless of which mode applies.

**Layer 2: Canvas + CMS Layer** *(script-powered, runs on every edit)*

Serves a live iframe preview of the project. Edits on canvas or in CMS tables write directly to source files via deterministic regex-based mutations — no AI involved. For SPA projects, a 2-second debounced rebuild triggers after edits. The iframe reloads. Source code is always the single source of truth.

**Layer 3: Deploy Orchestrator** *(script-powered, runs on deploy)*

A set of provider-specific scripts — one per service. Each script takes the project manifest + built output and calls the provider's API using Sol's master account credentials. No LLM calls. Runs sequentially:
1. Provision hosting project
2. Upload built files
3. Configure DNS records
4. SSL provisioning (automatic)
5. Inject analytics snippet
6. Configure media CDN
7. Return live URL

Triggered once on initial deploy, re-triggered on content publish if needed.

**Layer 4: State & Persistence** *(always-on)*

Single multi-tenant Supabase instance for all project metadata, CMS content, user accounts, and provider state. Project files (zips, built output, assets) in Cloudflare R2. One database, isolated per workspace via row-level security. No per-client GitHub repos exposed to users — Sol's GitHub org manages source versioning internally.

### Key architectural principle
> **AI decides what things are. Scripts decide what to do with them.**

---

## 4. Data & Multi-tenant Model

### UX North Star: The CEO View
When a non-technical business owner logs into Sol, they instantly understand:
- Is my site live and healthy?
- What does it look like right now?
- What needs my attention?
- How do I change something?

No technical jargon. No "environment variables." No "DNS propagation." Everything surfaced in business language — traffic, content freshness, SEO health, domain status — with clear actions attached to each signal. Infrastructure complexity is invisible unless the user goes looking for it.

### Entities

| Entity | Description |
|---|---|
| **Workspace** | Belongs to a builder. Contains multiple projects. Has billing and Sol master account credentials. |
| **Project** | Has one zip source, manifest, built output, deploy state, CMS content types. |
| **Client** | Invited to access one project. Full ownership UX — canvas, CMS, pages, assets, SEO/AEO/GEO, domain. |
| **Content Type** | Belongs to project. Has items, field definitions, source bindings (file + array + index). |
| **Deploy Record** | Immutable log. Provider, timestamp, bundle, live URL, status. |

### Client ownership scope

| Feature | Builder | Client |
|---|---|---|
| Canvas editor | ✅ | ✅ |
| CMS tables | ✅ | ✅ |
| Pages management | ✅ | ✅ |
| Assets | ✅ | ✅ |
| SEO / AEO / GEO settings | ✅ | ✅ |
| Domain & SSL | ✅ | ✅ |
| Technical setup (simplified) | ✅ | ✅ |
| Technical setup (advanced) | ✅ | Toggle |
| Deploy & bundle selection | ✅ | ✗ |
| Multiple projects / workspace | ✅ | Own project only |
| Billing | ✅ | ✗ |

### Multi-tenancy
One Supabase instance. Every table has `workspace_id`. RLS policies enforce isolation. Service role key server-side only — clients never access the database directly.

Project files in Cloudflare R2: `/{workspace_id}/{project_id}/source/`, `/built/`, `/assets/`. Presigned URLs for access. Nothing publicly readable by default.

### Provider isolation
Sol holds one master account per provider. Resources namespaced as `sol-{workspaceId}-{projectSlug}`. On churn, a cleanup script removes all provider resources. Client never had credentials — nothing to take except their exported zip, which Sol always makes available.

### Portability guarantee
A client can export their project zip and built output at any time. Sol does not hold sites hostage. This is a trust and legal requirement.

---

## 5. AI Cost Strategy

### Rule
> **AI decides what things are. Scripts decide what to do with them.**

### When AI runs
- **Once on upload** — full project analysis (pages, content types, tech stack, source bindings, in-app CMS detection)
- **On-demand for SEO/AEO/GEO suggestions** — user-triggered, never automatic
- **Agent chat** — user-initiated only

### When scripts run
- Every canvas or CMS edit — deterministic source file mutations
- Every deploy — provider API scripts
- Every rebuild — npm build pipeline (2s debounce)
- Every domain/SSL operation — Cloudflare API calls
- Email notifications — Resend API

### Model selection
| Task | Model | Reason |
|---|---|---|
| Project analysis on upload | Sonnet | Balance of quality and cost |
| SEO/AEO/GEO suggestions | Haiku | Fast, cheap, sufficient |
| Agent chat | Sonnet | Default |
| Complex agent tasks | Opus | On-demand only |

### Development vs production
- **Dev:** Mock cached analysis responses for UI work. Haiku for API path testing.
- **Production:** Real Sonnet calls on upload only — everything else is scripts.
- **Cost target:** Under $2 per project analysis at scale.

---

## 6. Phase 1 Scope

### Goal
Get one complete end-to-end flow working — upload to live URL — with a real project from a real AI tool. Everything else is secondary until this loop closes cleanly.

### In scope
- ZIP upload + extraction (static HTML, React/Vite SPA, Lovable/Base44/Manus exports)
- Analysis pipeline: pages, content types, source bindings, tech stack, in-app CMS detection
- SPA build pipeline: npm install, BrowserRouter patching, base path injection
- Email notification on long analysis (>30s prompt for email, Resend on complete)
- Canvas iframe editor with live source mutations
- CMS tables synced to source code and preview
- Deploy bundle selection UI (Starter/Pro/Scale) + custom stack builder
- Domain connection flow (new purchase + connect existing)
- **One real deploy path wired end-to-end: Vercel + Cloudflare**
- Basic client invite — builder shares link, client accesses project dashboard
- Client ownership UX: canvas, CMS, simplified tech view

### Out of scope for Phase 1
- Full provider script suite (all 9 sectors) — Vercel + Cloudflare first
- SEO/AEO/GEO settings UI — data model now, UI in Phase 2
- Multi-workspace billing — single workspace until user system proven
- White-label builder branding
- Bi-directional git sync (V2)
- Agent chat as a working feature (placeholder only)

### Phase 1 success criteria
A builder uploads a Lovable export, edits content on canvas, connects a domain, clicks deploy, and sends a client a working URL with a login. The client edits a blog post and sees it live. No provider accounts were created by anyone except Sol.

---

## 7. Vendor Accounts & Required Credentials

### Accounts to open (one-time, Sol master accounts)

**Immediate (Phase 1):**

| Vendor | Purpose | Required credentials |
|---|---|---|
| **Vercel** | Hosting for Pro/Scale deploys | `VERCEL_TOKEN` (API token), `VERCEL_TEAM_ID` (team slug) |
| **Cloudflare** | DNS, SSL, CDN, R2 storage, domain purchase, email routing | `CF_API_TOKEN`, `CF_ACCOUNT_ID` |
| **Supabase** | Sol's own database (multi-tenant) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| **Resend** | Email notifications (analysis complete, client invites) | `RESEND_API_KEY`, verified sender domain (e.g. `noreply@sol.app`) |

**Phase 2:**

| Vendor | Purpose | Required credentials |
|---|---|---|
| **Netlify** | Hosting for Starter tier | `NETLIFY_TOKEN` |
| **Cloudinary** | Media optimization and CDN | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| **PostHog** | Analytics injection into client sites | `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID` |
| **AWS** | Amplify hosting + Route53 DNS for Scale tier | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |
| **iubenda** | Auto-generated legal pages (GDPR/CCPA) for Scale tier | `IUBENDA_API_KEY` |

### How to set up Cloudflare (most important vendor)
1. Create a Cloudflare account at cloudflare.com
2. Go to **My Profile → API Tokens → Create Token**
3. Use "Edit zone DNS" + "Cloudflare R2" + "Workers" permissions
4. Note your **Account ID** from the dashboard right sidebar
5. Create an R2 bucket named `sol-projects` for file storage
6. For email routing: add a domain, go to **Email → Email Routing**, enable and set forwarding

### How to set up Vercel
1. Create a Vercel account, create a **Team** (required for API project management)
2. Go to **Settings → Tokens → Create Token** with full scope
3. Note the **Team ID** from the team settings URL or API

### How to set up Supabase
1. Create a Supabase project (this is Sol's own database, not per-client)
2. Go to **Settings → API** — copy Project URL, anon key, service role key
3. Enable Row Level Security on all tables before inserting any data

### How to set up Resend
1. Create account at resend.com
2. Add and verify your sending domain (e.g. `sol.app`)
3. Create an API key with full send permissions
4. Default from address: `noreply@sol.app` or `hello@sol.app`

### Environment variables summary
```
# Core
ANTHROPIC_API_KEY=

# Database
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# File Storage
CF_API_TOKEN=
CF_ACCOUNT_ID=
CF_R2_BUCKET=sol-projects

# Hosting (Phase 1)
VERCEL_TOKEN=
VERCEL_TEAM_ID=

# Email
RESEND_API_KEY=
RESEND_FROM=noreply@sol.app

# Phase 2
NETLIFY_TOKEN=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
POSTHOG_API_KEY=
POSTHOG_PROJECT_ID=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
```

---

## 8. Open Questions (to resolve in Phase 2)

- Billing infrastructure: Stripe for subscription management?
- Multi-workspace: when does a builder get multiple workspaces vs multiple projects?
- Client auth: magic link (Resend) or password-based (Supabase Auth)?
- In-app CMS "coexist" mode: how does Sol surface external CMS data (Contentful, Sanity) in its own tables?
- GEO/AEO: what specific signals does Sol write and where?
- V2 bi-directional git: Sol GitHub org structure for internal versioning?
