# HostaPosta — Compatibility Layer Design

**Date:** 2026-04-14
**Status:** Approved for implementation
**Sub-project:** A (foundation — must ship before CMS and Canvas)

---

## Problem

HostaPosta currently breaks on any project it doesn't fully recognize. If archetype detection fails, the server silently deploys raw source files — TypeScript, JSX, config files — directly to Cloudflare Pages, which returns HTTP 500. There is no user feedback, no recovery path, and no way to know what went wrong.

This is Sub-project A: make any uploaded project either deploy cleanly, or tell the user exactly why not and what to do.

---

## Scope

**In scope:**
- 3-stage detection pipeline (heuristics → multi-strategy build → user confirmation)
- Automatic patch set applied before every build
- Backend detection and full-stack deploy routing
- Env var extraction from uploaded .env + pre-fill on deploy target
- Clear, actionable error states at every failure point
- Domain management as a registered Sub-project D item (out of scope here)

**Out of scope:**
- CMS dual-write (Sub-project B)
- Canvas editor (Sub-project C)
- Domain purchase / custom domain connect (Sub-project D)
- Database provisioning (user responsibility — they provide the connection string)

---

## Design

### 1. Detection Pipeline (3 stages)

The current single-pass detector is replaced with a 3-stage pipeline. Each stage only runs if the previous one didn't produce a confident result.

**Stage 1 — Heuristics (<100ms)**
The existing `detector.ts` logic: read `package.json` dependencies, check folder structure, check config files. If confidence is HIGH (a known archetype matches clearly), proceed directly to build. No changes needed here beyond exposing a confidence score.

**Stage 2 — Multi-Strategy Build (up to 3 attempts)**
If Stage 1 confidence is LOW or archetype is UNKNOWN, attempt builds in sequence:
1. Detected build command from `package.json` scripts (`npm run build`, `npm run export`, etc.)
2. Direct framework CLI: `npx vite build`, `npx next build`, `npx astro build`
3. Generic fallback: check if `dist/`, `build/`, or `out/` already exists — if any contains `index.html`, skip building entirely

Each attempt runs with the full automatic patch set applied (see section 2). First attempt that produces a directory containing `index.html` wins. If all three fail, proceed to Stage 3.

**Stage 3 — User Confirmation**
Show the user a confirmation screen with two options:

- **Correct our guess:** "We think this is [detected archetype]. Is that right?" — editable dropdown (Next.js / Vite+React / Vite+Vue / Astro / plain HTML / other) plus an optional custom build command field. On submit, retry Stage 2 with their input.
- **Upload pre-built instead:** "Skip the build — compress your `dist/` folder as a ZIP and re-upload." This is the escape hatch for projects with complex build setups. Immediately treated as `vanilla-html` archetype, no build attempted.

If the user corrects the framework and Stage 2 still fails, show the Stage 3 error state (see section 4).

---

### 2. Automatic Patch Set

Applied to every project before any build attempt. These are non-destructive, generic fixes — never project-specific hacks.

**Asset path normalization**
Scan `index.html` and all entry HTML files. Rewrite absolute asset references (`src="/images/..."`, `href="/fonts/..."`) to relative paths. This fixes the most common cause of 404s after deploy.

**Env var placeholder injection**
Before build, scan source files for `import.meta.env.VITE_*` and `process.env.NEXT_PUBLIC_*` references. For any variable not present in the environment, inject an empty string placeholder so the build completes without crashing. These placeholders are for build-time only — real values are set on the deploy target separately.

**Dependency installation flags**
Always run `npm install --legacy-peer-deps`. This resolves the majority of peer dependency conflicts without requiring manual intervention.

**Output directory normalization**
After build completes, scan these directories in order: `dist/`, `build/`, `out/`, `.next/out/`, `public/`. Use the first one that contains an `index.html`. If none found, treat as build failure. Never fall back to serving the project root (source files).

---

### 3. Backend Detection + Full-Stack Deploy

**Detection signals (checked in order):**
1. `app/api/` or `pages/api/` directories exist → Next.js with API routes
2. `server.js` or `server.ts` in project root
3. `express`, `fastify`, or `hono` in `dependencies` (not devDependencies)
4. Next.js `next.config.*` exists without `output: 'export'`

If any signal is found, the project is flagged as `needs-backend: true`.

**Deploy routing by archetype:**
| Archetype | Backend needed | Deploy target |
|-----------|---------------|---------------|
| `nextjs-app-router` | Yes | Vercel (zero-config) |
| `nextjs-pages-router` | Yes | Vercel (zero-config) |
| `vite-react`, `vite-vue`, `astro`, `cra`, `vanilla-html` | No | Cloudflare Pages |
| Any with Express/server file | Yes | Railway |
| Astro with SSR adapter | Yes | Cloudflare Workers |

**Env var gate before deploy:**
The AI analysis already extracts all `VITE_*`, `NEXT_PUBLIC_*`, and `process.env.*` references from source. Before any deploy:
1. Parse the uploaded `.env` file (if present) to extract already-provided values
2. Cross-reference with AI-extracted required vars
3. Show the user a pre-filled form: "These env vars are required. We found values for X of Y."
4. User fills in missing values
5. Deploy sets these vars on the target (CF Pages env vars, Railway variables, or Vercel env)
6. Block deploy until all required vars are filled — no deploying with missing secrets

**Database provisioning:** Explicitly out of scope. If the app needs Postgres, Supabase, or MongoDB, the user is responsible for setting it up and providing the connection string as an env var.

---

### 4. Error States

Every failure produces an actionable UI state. Silent failures are never acceptable.

**Build failed:**
Show the framework we detected, the command we ran, and the last 20 lines of build output. Offer two actions: "Correct the framework" (triggers Stage 3) and "Upload pre-built output instead."

**No index.html found after build:**
"Build completed but we couldn't find the output." Show the directories found. Let the user specify which directory contains the built site. Or offer the pre-built upload escape hatch.

**Missing env vars at deploy time:**
List all required vars. Pre-fill any found in the uploaded `.env`. Highlight missing ones in red. Block the Deploy button with "Fill in all required env vars to deploy." Never inject fake values into a production deploy.

**Unknown framework, user confirmed, still failing:**
"We weren't able to build this project automatically." Show full error. Offer: try pre-built upload, or contact support. Do not loop the user through the same failed detection again.

---

## Key Invariants

1. **Source files are never deployed.** If there is no confirmed `index.html` in a build output directory, deployment is blocked.
2. **Env vars are never guessed.** Placeholders are for build-time compilation only. Production deploys require real values or an explicit user decision to leave a var empty.
3. **Every failure is actionable.** Every error state has at least one clear next step for the user.
4. **Patches are generic.** The patch set never contains project-specific logic. If a fix only applies to one project, it doesn't belong here.

---

## What This Unlocks

Once this layer is in place:
- Any Vite, Next.js, Astro, or plain HTML project should build and deploy on first try
- Projects with static blogs (Sub-project B) have a reliable foundation to run CMS extraction on
- Full-stack projects (Next.js with API routes, Express apps) have a clear deploy path
- The CalcHub / unknown archetype failure we saw in production is eliminated

Sub-projects B (CMS), C (Canvas), and D (Deploy Engine / domain management) all assume this layer is working.

---

## Sub-project D: Domain Management (registered, out of scope here)

To complete the use case of "purchase + connect a custom domain through HostaPosta":
- **Purchase:** Cloudflare Registrar API — search domain availability, initiate purchase. Requires `Registrar: Domains: Edit` permission on the API token (currently `Read` only).
- **Connect:** CNAME wizard — user points their existing domain's DNS to HostaPosta's Cloudflare zone. UI walks them through the steps for their registrar.
- **Auto DNS:** The existing CNAME automation in `cloudflarePages.ts` needs the DNS failure bug fixed (silent failure on deploy — root cause to be diagnosed).

This will be specced as a standalone Sub-project D.
