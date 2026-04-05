# HostaPosta — Archetype Detection + Dual-Write CMS
**Date:** 2026-04-05
**Status:** Approved
**Scope:** Analysis pipeline refactor + professional CMS write-back

---

## Problem Statement

HostaPosta's analysis pipeline currently asks the AI to discover framework, build config, routing, and output directory — information that is already deterministically available in `package.json` and the file tree. This causes:

- AI tool calls wasted on structural discovery (30–50% of the agent loop)
- Build failures when the AI guesses wrong (wrong output dir, missing `output: 'export'`, wrong base path)
- Blank canvases and broken previews for common project types
- CMS extraction that pattern-matches rendered HTML instead of reading source data files
- CMS edits that only patch built HTML and are lost on rebuild

The fix: detect archetype and generator **before** any AI runs, drive the build deterministically from that detection, and give the AI only the semantic questions it's actually good at.

---

## Goals

1. **Pixel-perfect preview** for the 5 most common AI-generated project archetypes
2. **Reliable canvas editing** with stable element selectors per archetype
3. **Professional dual-write CMS** — edits update both built HTML (instant preview) and source data files (permanent)
4. **Generator badge** on dashboard — show users which AI tool generated their project
5. **Focused AI** — AI only answers: pages, content collections (with source mapping), business summary, readiness score

---

## Target Generators & Archetypes

### Generator Detection

| Generator | Definitive Signal | Confidence |
|-----------|------------------|------------|
| Lovable | `lovable-tagger` in `devDependencies` | certain |
| Base44 | `@base44/sdk` in `dependencies` | certain |
| Claude Code | `.claude/settings.json` OR `CLAUDE.md` in root | likely |
| Cursor | `.cursorrules` OR `.cursor/rules/` directory | likely |
| Manus / Unknown | None of the above | unknown |

### Archetype Detection

| Archetype | Required deps | Excluded deps | Key files | Build cmd | Output dir |
|-----------|--------------|---------------|-----------|-----------|-----------|
| `nextjs-app-router` | `next` | — | `app/` directory | `npm run build` | `out/` |
| `nextjs-pages-router` | `next` | — | `pages/` directory | `npm run build` | `out/` |
| `vite-react` | `vite` + `react` | `next`, `nuxt` | `vite.config.*` | `npm run build` | `dist/` |
| `vite-vue` | `vite` + `vue` | `nuxt` | `vite.config.*` | `npm run build` | `dist/` |
| `astro` | `astro` | — | `astro.config.*` | `npm run build` | `dist/` |
| `cra` | `react-scripts` | — | — | `npm run build` | `build/` |
| `vanilla-html` | — (no build script) | — | `index.html` | none | `.` (root) |

**Archetype priority order** (first match wins): `nextjs-app-router` (has `next` + `app/`) → `nextjs-pages-router` (has `next` + `pages/`) → `astro` → `vite-react` → `vite-vue` → `cra` → `vanilla-html` (final fallback)

### Generator → Archetype mapping (common cases)

| Generator | Most common archetype |
|-----------|----------------------|
| Lovable | `vite-react` |
| Base44 | `vite-react` |
| Claude Code | `nextjs-app-router` or `vite-react` |
| Cursor | `nextjs-app-router` or `vite-react` |
| Manus | `vite-react` or `vanilla-html` |

---

## Architecture

### Detection Phase (new, runs before everything else)

```
Upload ZIP → extract → projectRoot
     ↓
detectGenerator(projectRoot)  →  GeneratorResult { id, confidence }
detectArchetype(projectRoot)  →  ArchetypeResult { id, build, routing, aiHints }
     ↓
stored in .sol-state.json
passed to all downstream phases
```

Detection is pure file-system reads — no network, no AI, completes in <100ms.

### Build Phase (archetype-driven)

`buildProject()` reads `archetype.build` directly instead of guessing:

```
nextjs-*     → npm run build → patch next.config (output:'export') → serve out/
vite-react   → npm run build → flag --base=/preview/ → serve dist/
vite-vue     → npm run build → patch vue-router base('/preview/') → serve dist/
astro        → npm run build → no patch needed → serve dist/
cra          → npm run build → env PUBLIC_URL=/preview/ → serve build/
vanilla-html → skip build → serve projectRoot directly
```

### AI Analysis Phase (focused)

The system prompt is pre-populated with archetype and generator context. Structural discovery steps are removed. The AI receives:

```
Project type: vite-react
Generator: Lovable
Framework: React 18 + Vite + React Router v6 + Tailwind + shadcn/ui
Build: npm run build → dist/
Routing: SPA, history-mode, React Router v6

Your job:
1. Identify all pages (name, path, description)
2. Extract content collections — for each, record: name, items, sourceFile, sourceType, sourcePath
3. Write a 2-sentence business summary
4. Assess launch readiness (SEO, content completeness, media quality)

Do NOT re-examine framework, build config, or routing — these are already resolved.
```

### Content Source Mapping

The AI records, for each content collection, how to find and patch the original source:

```typescript
interface AIContentCollection {
  name: string;
  items: ContentItem[];
  // NEW fields:
  sourceFile?: string;      // 'src/lib/data/team.ts'
  sourceType?: 'ts-array' | 'json' | 'mdx' | 'html';
  sourcePath?: string;      // 'teamMembers[{i}].{field}'
}
```

This mapping is stored in `.sol-analysis.json` and used by the CMS writer.

### Dual-Write CMS

When a user edits a field in the CMS panel, two writes happen in parallel:

**Write A — Built HTML (immediate)**
- `applyEdits(servePath, page, edits)` — existing system, unchanged
- Canvas iframe refreshes within ~200ms via postMessage

**Write B — Source file (new)**
- `applySourceEdits(projectRoot, collection, itemIndex, field, newValue)`
- Looks up `sourceFile` and `sourcePath` from the stored content mapping
- Patches the source file using type-appropriate strategy:

| Source type | Patch strategy |
|-------------|---------------|
| `ts-array` | Line-targeted string replacement — find line containing old value in array context, replace |
| `json` | `JSON.parse` → update field → `JSON.stringify` with 2-space indent |
| `mdx` | `gray-matter` frontmatter parse → update field → serialize back |
| `html` | cheerio (existing behaviour) |

Write B is fire-and-forget from the client's perspective — it does not block the canvas update. If it fails (e.g. source file not found), it logs silently; Write A always succeeds.

### Canvas Bridge Enhancement (Lovable)

For Lovable projects, `lovable-tagger` instruments the DOM with `data-component-id="ComponentName"` on every element. The HP bridge script detects this attribute and uses it as the primary CSS selector:

```js
// In HP_BRIDGE_SCRIPT (preview.ts)
var componentId = el.getAttribute('data-component-id');
if (componentId) {
  return '[data-component-id="' + componentId + '"]';
}
// Fall through to existing CSS selector generation
```

This gives Lovable projects stable, human-readable selectors that survive rebuilds.

---

## File Changes

| File | Type | Change |
|------|------|--------|
| `src/analyze/archetypes.ts` | **New** | Registry of all archetype + generator definitions |
| `src/analyze/detector.ts` | **New** | `detectArchetype()` + `detectGenerator()` functions |
| `src/analyze/index.ts` | Edit | Run detection first; pass archetype to build + AI |
| `src/analyze/build.ts` | Edit | Read `archetype.build` instead of guessing; remove heuristic output dir detection |
| `src/analyze/systemPrompt.ts` | Edit | Accept archetype + generator context; remove structural discovery steps |
| `src/analyze/outputSchema.ts` | Edit | Add `sourceFile`, `sourceType`, `sourcePath` to `AIContentCollection` |
| `src/analyze/autonomousAgent.ts` | Edit | Pass archetype context into system prompt builder |
| `src/edits.ts` | Edit | Add `applySourceEdits()` alongside existing `applyEdits()` |
| `src/preview.ts` | Edit | Check `data-component-id` before CSS selector generation in bridge script |
| `src/state.ts` | Edit | Add `archetypeId`, `generatorId`, `generatorConfidence` to `ProjectState` |

**New dependency:** `gray-matter` (MDX/YAML frontmatter parsing). No other new dependencies.

---

## API Changes

### `POST /api/edits`

Request body gains two optional fields:

```typescript
{
  page: string;
  edits: Edit[];
  // NEW:
  cmsSourceWrite?: {
    collectionName: string;
    itemIndex: number;
    field: string;
    value: string;
  }
}
```

When `cmsSourceWrite` is present, server performs both writes.

---

## State Schema Addition

```typescript
interface ProjectState {
  // ... existing fields ...
  archetypeId?: string;           // 'vite-react', 'nextjs-app-router', etc.
  generatorId?: string;           // 'LOVABLE', 'BASE44', 'CLAUDE_CODE', etc.
  generatorConfidence?: string;   // 'certain' | 'likely' | 'unknown'
}
```

---

## Dashboard UI Changes

- **Generator badge** on project card and project header: "Built with Lovable", "Built with Base44", etc. Shown only when confidence is `certain` or `likely`.
- **CMS panel** field edits now call `/api/edits` with `cmsSourceWrite` payload. No visible change to the user — edits feel the same, they just persist permanently now.

---

## Success Criteria

1. Lovable project (vite-react): uploads, builds, previews pixel-perfect, canvas editing works with stable selectors, CMS fields editable and persisted to source
2. Next.js project (nextjs-app-router): uploads, static export patch applied automatically, every page previews correctly, CMS fields editable
3. Base44 project: detected, builds correctly, CMS extracts from rendered HTML (Base44 backend not available locally, so source write targets rendered HTML only)
4. Vanilla HTML: no build step, serves immediately, canvas editing works
5. Unknown project: falls through to heuristic with graceful degradation — no crash, preview attempted

---

## Out of Scope (this spec)

- Deployment pipeline (Cloudflare Pages integration) — separate spec
- SvelteKit, Nuxt, Gatsby archetypes — can be added later with same pattern
- Rebuild-on-source-change (auto rebuild after source write) — future enhancement
- Base44 SDK content sync (requires Base44 API access) — future enhancement
