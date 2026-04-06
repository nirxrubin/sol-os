# SOL Platform v2 — Analysis Engine, Canvas, CMS & Dashboard

**Date:** 2026-04-03
**Status:** Approved for implementation

---

## What this spec covers

Four interconnected systems that together make SOL a complete import-to-deploy platform:

1. **Analysis Engine** — autonomous AI agent that understands AND transforms the project
2. **Canvas** — live preview with inline editing, clean on deploy
3. **CMS** — reverse-engineered collections, fully populated, bidirectional with canvas
4. **Dashboard** — tighter, slicker UI

---

## Design principle

SOL's analysis is not a read-only scan. It is an **onboarding pipeline** — the imported project goes in, a SOL-ready project comes out. Source files are modified as part of onboarding, with all editing metadata stripped cleanly on deploy.

The architecture is grounded in how the industry actually works:
- `data-sol-field` attributes = SOL's version of TinaCMS's `data-tina-field`
- postMessage canvas bridge = Builder.io's SDK sync model
- Clean deploy = strip plugin removes all `data-sol-*` before production build

SOL's unique contribution: **what TinaCMS and Builder.io require developers to do manually, the AI does automatically during import.**

---

## 1. Analysis Engine

### 1.1 New tool: `write_file`

Added to the autonomous agent alongside `list_files`, `read_file`, `search_in_file`.

```typescript
write_file(path: string, content: string): string
// Writes content to path (relative to project root). Returns "written: path"
```

The agent uses this to inject `data-sol` attributes into source files as it reads and understands them. Understanding and transformation happen in the same session, file by file.

### 1.2 Updated session flow

```
list_files()                          → understand project shape
read_file("package.json")             → framework, dependencies, build config
read_file(router file)                → all routes → source files mapping

For each page component:
  read_file(component)               → understand data flow, sections, bindings
  write_file(component, modified)    → inject data-sol attributes

For each data file:
  read_file(data file)               → extract all items from arrays
  [items included in write_analysis]

search_in_file across all files      → find process.env / import.meta.env refs
write_file(entry point)              → inject <script src="__sol_bridge.js"> in dev only

write_analysis(manifest)             → complete, compact manifest
```

Budget: max 50 tool calls (raised from 40 to accommodate write_file calls). 10-minute hard timeout.

### 1.3 Source injection rules (added to system prompt)

The system prompt gets a new section:

```
═══════════════════════════════════════════════════════════
SOURCE INJECTION — CANVAS BINDING
═══════════════════════════════════════════════════════════

After understanding a page component, rewrite it with data-sol attributes.
Use write_file to save the modified version.

RULES:

For CMS-bound elements (value comes from a data array):
  <h2 data-sol-field={`products.${index}.name`}>{product.name}</h2>
  <img data-sol-image={`products.${index}.image`} src={product.image} />
  <p data-sol-field={`products.${index}.description`}>{product.description}</p>

For static elements (value is hardcoded in JSX/HTML):
  <h1 data-sol-static="src/pages/About.tsx:23">Our Story</h1>

For HTML files (not JSX):
  <h1 data-sol-static="about.html:23">Our Story</h1>

CRITICAL:
- Derive the correct collection path from the actual loop context
  (product.name in products.map((product, index) => ...) → products.${index}.name)
- Only annotate user-visible content: headings, paragraphs, images, buttons, spans
- Do NOT annotate layout wrappers, nav items that link to pages, or UI chrome
- Do NOT add data-sol to every element — only editable content
- data-sol-field uses backtick template literals for dynamic collection paths
- data-sol-static uses a plain string "file:line"
- NEVER include /preview/ in navigateTo (navigateTo is the route path only: "/shop" not "/preview/shop")
```

### 1.4 Updated `write_analysis` schema

New fields added to the existing schema:

```typescript
// Added to AIAnalysisOutput
envVars: string[];          // ["VITE_STRIPE_KEY", "VITE_SUPABASE_URL"]
buildCommand: string;       // "npm run build"
outputDir: string;          // "dist"
devCommand?: string;        // "npm run dev"
nodeVersion?: string;       // "18"
spaFallback: boolean;       // true for React Router / Vue Router history mode

// Updated AIContentCollection — now includes actual items
items: Record<string, unknown>[];  // actual array items extracted from source
```

### 1.5 navigateTo — explicit prohibition added to system prompt

```
NAVIGATETO — HARD RULES (repeated for emphasis):
- navigateTo is the route path only. "/shop", "/about", "/"
- NEVER "/preview/shop" — /preview/ is added by SOL's iframe, never by you
- NEVER a bare word "shop" — always starts with # or /
```

---

## 2. Canvas

### 2.1 Architecture

The canvas is the imported project running live in an iframe. SOL's dashboard communicates with it via `postMessage`. The binding between DOM elements and data lives in `data-sol-*` HTML attributes injected by the AI during analysis.

```
SOL Dashboard (parent window)
  ↕ postMessage
iframe → built project (dist/) + __sol_bridge.js injected
           ↓ reads data-sol-* attributes at runtime
           ↓ sends click events up to parent
           ↓ receives update events from parent → updates DOM
```

### 2.2 `__sol_bridge.js`

A tiny script injected into the **built output** (not source) before serving the preview. Added to `dist/index.html` by the preview server at serve-time, never committed to source.

```javascript
// __sol_bridge.js — injected by SOL preview server, never in source
(function() {
  let editMode = false;
  let hoveredEl = null;

  // Listen for commands from SOL dashboard
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'sol:edit-mode') {
      editMode = e.data.enabled;
      document.body.classList.toggle('sol-edit-mode', editMode);
    }
    if (e.data?.type === 'sol:update') {
      const els = document.querySelectorAll(`[data-sol-field="${e.data.field}"]`);
      els.forEach(el => {
        if (el.tagName === 'IMG') el.src = e.data.value;
        else el.textContent = e.data.value;
      });
    }
  });

  // Send click events to parent
  document.addEventListener('click', (e) => {
    if (!editMode) return;
    e.preventDefault();
    const target = e.target.closest('[data-sol-field],[data-sol-static],[data-sol-image]');
    if (!target) return;
    window.parent.postMessage({
      type: 'sol:element-click',
      field: target.dataset.solField || null,
      static: target.dataset.solStatic || null,
      image: target.dataset.solImage || null,
      value: target.tagName === 'IMG' ? target.src : target.textContent,
      rect: target.getBoundingClientRect().toJSON(),
    }, '*');
  });

  // Hover highlight
  document.addEventListener('mouseover', (e) => {
    if (!editMode) return;
    const target = e.target.closest('[data-sol-field],[data-sol-static],[data-sol-image]');
    if (hoveredEl) hoveredEl.classList.remove('sol-hover');
    if (target) { target.classList.add('sol-hover'); hoveredEl = target; }
  });
})();
```

CSS injected alongside:
```css
.sol-edit-mode [data-sol-field],
.sol-edit-mode [data-sol-static],
.sol-edit-mode [data-sol-image] {
  cursor: text;
  outline: 1px dashed transparent;
  transition: outline 0.1s;
}
.sol-edit-mode [data-sol-field].sol-hover,
.sol-edit-mode [data-sol-static].sol-hover,
.sol-edit-mode [data-sol-image].sol-hover {
  outline: 1px dashed #f59e0b;
  outline-offset: 2px;
}
```

### 2.3 Edit mode in the dashboard

`PageEditor.tsx` receives the `sol:element-click` message and opens an inline edit popover anchored to the element's `rect`. The popover shows:

- For `data-sol-static`: plain text input, saves directly to source file
- For `data-sol-field`: text input with an amber indicator **"Editing [Collection] → [field]"** — saves to the CMS collection item, then sends `sol:update` back to iframe

### 2.4 SPA fallback — preview server fix

When `spaFallback: true` in the manifest, the preview server serves `index.html` for all unknown paths under `/preview/*`. This fixes the 404 for React Router and Vue Router history-mode projects.

### 2.5 Clean deploy — strip plugin

SOL adds a Vite plugin to the project's `vite.config.ts` during deployment (not during development):

```typescript
// vite-plugin-sol-strip.ts — injected by SOL deploy pipeline
export function solStrip() {
  return {
    name: 'sol-strip',
    transform(code: string, id: string) {
      if (!id.match(/\.(tsx?|jsx?|html|vue|svelte)$/)) return;
      // Remove data-sol-* JSX attributes
      return code
        .replace(/\s+data-sol-field=\{[^}]+\}/g, '')
        .replace(/\s+data-sol-static="[^"]*"/g, '')
        .replace(/\s+data-sol-image=\{[^}]+\}/g, '');
    },
  };
}
```

For plain HTML projects: a deploy-time HTML pass strips `data-sol-*` attributes before upload.

**What ships in production:** original project code + user's content edits applied to data arrays + SOL infrastructure connections (env vars, CDN, analytics if opted in). No `data-sol-*` attributes, no bridge script, no SOL runtime dependency.

---

## 3. CMS

### 3.1 Real items from source

The AI extracts actual array items during analysis and includes them in `write_analysis`. `mapToProject` populates `ContentType.items` from this data instead of returning `[]`.

Each item gets:
```typescript
{
  id: `item-${collectionId}-${index}`,
  data: { ...actualFields },     // the real object from the source array
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
```

### 3.2 Webflow-like CMS editor

`CMSTableView.tsx` becomes a full Webflow-style CMS editor. Reference: Webflow CMS collection editor.

**Table view:**
- Columns auto-derived from fields (first 4-5 visible, rest in item detail)
- Row click opens item detail panel (right slide-in drawer)
- Inline cell editing for simple text fields on double-click
- Search, filter by status (published/draft), sort by any column

**Item detail panel (right drawer):**
- All fields rendered as appropriate input types:
  - `text` → single-line input
  - `longtext` → textarea or rich text editor (TipTap)
  - `image` → image preview + upload/URL input
  - `date` → date picker
  - `url` → URL input with validation
  - `boolean` → toggle switch
  - `number` → number input
  - `slug` → auto-generated from name field, editable
- Save button → writes to source data array + sends `sol:update` to canvas iframe
- Status toggle (published / draft)

**Fields editor (gear icon):**
- Add, remove, reorder fields
- Change field type
- Mark field as required

### 3.3 Bidirectional canvas ↔ CMS sync

Canvas → CMS: When user clicks an element in edit mode with `data-sol-field`, the CMS panel auto-navigates to that collection and highlights the item + field.

CMS → Canvas: When user saves a field edit in the CMS, SOL sends:
```javascript
iframe.contentWindow.postMessage({
  type: 'sol:update',
  field: 'products.2.name',
  value: 'New Product Name',
}, '*');
```
The bridge script updates the DOM immediately. Source file write happens async (debounced 500ms).

---

## 4. Deployment Prep

### 4.1 Env var scanning

AI scans all source files for `process.env.X` and `import.meta.env.X` references. These are included in `write_analysis.envVars`.

SOL's deploy UI shows each env var with:
- Auto-detected service guess (STRIPE → Stripe, SUPABASE → Supabase, etc.)
- Input field for the production value
- Mark as provided / missing

### 4.2 SOL infrastructure wiring

During deployment, SOL injects:
- **Analytics**: one `<script>` tag before `</body>` if user opted in
- **Hosting config**: `_redirects` for Netlify / `vercel.json` for Vercel SPA fallback
- **Strip plugin**: added to vite.config build pipeline

Nothing else. The client's code runs cleanly.

---

## 5. Dashboard UI

### 5.1 Principles

- **Less chrome, more content.** The canvas and CMS table should dominate the screen.
- **Remove what's not needed at a glance.** Details move into drawers/popovers.
- **Sidebar is navigation only.** Not a notification center, not an insight panel.

### 5.2 TopBar changes

**Remove:** the long business description tagline ("Judaica apparel e-commerce brand — modern streetwear..."). This is verbose and wastes prime real estate.

**Shorten:** the business type badge from a full pill to nothing — the project name itself is enough in the header. Business type lives in a project details panel.

**Result:** `Sol · Pasook ▾   [+ New]   [search]   ● 42%   [☀]   [🚀 Deploy]`

Clean, breathable, functional.

### 5.3 Sidebar changes

**Remove:** AI Insights section from sidebar entirely.

**Add:** AI Insights as a dedicated view accessible from the sidebar (same level as Pages, Content, Technical Setup). When selected, it opens a full main-area panel showing recommendations, SEO insights, page gaps, content gaps — with enough space to be useful.

**Technical Setup:** collapsed by default. Most users don't need it immediately.

**Pages:** the SEO status indicator shortens from `SEO: complete` badge to a single colored dot (green/orange/red) on the page row. Tooltip on hover shows the full status. This removes the badge clutter entirely.

**Sidebar structure:**
```
PAGES
  ● Home
  ● Shop
  ○ About          ← orange dot = partial SEO
  ● Craft

CONTENT
  ⊞ Shop Products
  ⊞ Verses Collection
  ⊞ Journal Articles

DEPLOY                ← replaces "Technical Setup"
  › Hosting
  › Analytics
  › Env Vars

AI INSIGHTS           ← nav item, not an expandable section
  ✦                   ← sparkle icon only when there are new insights
```

### 5.4 PageEditor changes

**Remove:** the `SEO: complete` badge from the page header. Replace with a small colored dot next to the page name (already in sidebar — no need to repeat in the main header).

**Edit mode toggle:** add a pencil icon button in the page editor toolbar (top right, alongside device viewport toggles). Toggle activates edit mode → sends `sol:edit-mode: true` to iframe → bridge script enables hover highlight + click editing.

**Canvas area:** full height, no padding. The iframe fills the content area completely.

### 5.5 CMS changes

**Remove:** the collection type icon map (guessing icon from name). Replace with a neutral `⊞` grid icon for all collections — consistent, clean.

**Add:** item count badge on each collection row in the sidebar (e.g. `Shop Products  6`).

**Add:** "Last edited" column in table view.

**Improve:** the item detail drawer slides in from the right over the table (not a modal) — Webflow-style.

---

## Files changed

### Analysis engine
```
solo-server/src/analyze/tools.ts          — add write_file tool + implementation
solo-server/src/analyze/systemPrompt.ts   — add injection rules, navigateTo prohibition
solo-server/src/analyze/outputSchema.ts   — add envVars, buildCommand, outputDir, spaFallback, items[]
solo-server/src/analyze/autonomousAgent.ts — raise MAX_TOOL_CALLS to 50
```

### Preview server
```
solo-server/src/preview.ts                — SPA fallback, bridge script injection
```

### Dashboard
```
solo-app/src/components/TopBar.tsx        — remove tagline, shorten badge
solo-app/src/components/Sidebar.tsx       — remove AI Insights section, add Deploy nav, dot indicators
solo-app/src/components/PageEditor.tsx    — remove SEO badge, add edit mode toggle, canvas fill
solo-app/src/components/CMSTableView.tsx  — item detail drawer, all field types, Webflow-like UI
solo-app/src/components/AIInsightsView.tsx — new: dedicated full-panel AI insights view
solo-app/src/data/types.ts               — add envVars, buildCommand, spaFallback to Project
```

---

## What "perfect output" means

After a successful analysis and import:

1. **Every page loads** in the canvas iframe — no 404s, SPA routing handled
2. **Every editable element** on every page has a `data-sol-field` or `data-sol-static` attribute
3. **Every CMS collection** is fully populated with real items from the source code
4. **Edit mode** works: click any text → edit inline → changes persist to source or CMS
5. **CMS ↔ Canvas** are bidirectional and live
6. **Deploy output is clean** — no `data-sol-*` attributes, no bridge script
7. **Env vars** are listed and ready to fill

This is the bar. Every project type — React, Vue, vanilla JS, HTML — reaches this bar through the AI's autonomous analysis.
