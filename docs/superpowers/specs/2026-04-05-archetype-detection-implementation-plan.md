# Implementation Plan: Archetype Detection + Dual-Write CMS

**Spec:** `2026-04-05-archetype-detection-cms-design.md`
**Estimated steps:** 8 tasks, ~3–4 days

---

## Overview

Work proceeds in strict order — each step depends on the previous.

```
Step 1: archetypes.ts     — registry definitions (pure data, no logic)
Step 2: detector.ts       — detection functions (reads FS, returns results)
Step 3: state.ts          — extend ProjectState with archetype/generator fields
Step 4: build.ts          — use archetype instead of guessing
Step 5: analyze/index.ts  — run detection first, pass archetype downstream
Step 6: systemPrompt.ts   — inject archetype context, remove structural steps
Step 7: outputSchema.ts   — add sourceFile/sourceType/sourcePath to collections
Step 8: edits.ts          — add applySourceEdits() dual-write
Step 9: preview.ts        — prefer data-component-id in bridge selector
Step 10: App.tsx / UI     — generator badge on dashboard
```

---

## Step 1 — `src/analyze/archetypes.ts` (NEW FILE)

Create the archetype + generator registry. Pure data — no filesystem access.

```typescript
export type ArchetypeId =
  | 'nextjs-app-router'
  | 'nextjs-pages-router'
  | 'vite-react'
  | 'vite-vue'
  | 'astro'
  | 'cra'
  | 'vanilla-html';

export type GeneratorId =
  | 'LOVABLE'
  | 'BASE44'
  | 'CLAUDE_CODE'
  | 'CURSOR'
  | 'UNKNOWN';

export interface ArchetypeDefinition {
  id: ArchetypeId;
  displayName: string;
  build: {
    command: 'npm run build' | 'none';
    outputDir: string;           // 'dist', 'out', 'build', '.'
    basePath: 'vite-flag' | 'next-static-export' | 'cra-env' | 'vue-router' | 'none';
  };
  routing: {
    type: 'react-router' | 'vue-router' | 'file-based' | 'hash' | 'none';
    spaFallback: boolean;
  };
  // Hint string injected into AI system prompt
  aiContextHint: string;
}

export interface GeneratorDefinition {
  id: GeneratorId;
  displayName: string;
  confidence: 'certain' | 'likely' | 'unknown';
  // Detection signals (checked by detector.ts)
  signals: {
    packageDeps?: string[];     // any of these in dependencies
    packageDevDeps?: string[];  // any of these in devDependencies
    files?: string[];           // any of these paths exist
    directories?: string[];     // any of these dirs exist
  };
  // Dashboard notice (shown when generator is detected)
  notice?: string;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDefinition> = {
  'nextjs-app-router': {
    id: 'nextjs-app-router',
    displayName: 'Next.js (App Router)',
    build: { command: 'npm run build', outputDir: 'out', basePath: 'next-static-export' },
    routing: { type: 'file-based', spaFallback: false },
    aiContextHint: 'Next.js 13+ App Router. Pages live in app/ directory as page.tsx files. Routing is file-based — each folder = a route. No React Router.',
  },
  'nextjs-pages-router': {
    id: 'nextjs-pages-router',
    displayName: 'Next.js (Pages Router)',
    build: { command: 'npm run build', outputDir: 'out', basePath: 'next-static-export' },
    routing: { type: 'file-based', spaFallback: false },
    aiContextHint: 'Next.js Pages Router. Pages live in pages/ directory. Each .tsx file = a route. No React Router.',
  },
  'vite-react': {
    id: 'vite-react',
    displayName: 'Vite + React',
    build: { command: 'npm run build', outputDir: 'dist', basePath: 'vite-flag' },
    routing: { type: 'react-router', spaFallback: true },
    aiContextHint: 'Vite + React SPA. Single index.html entry point. Routes defined in src/ via React Router v6 — look for createBrowserRouter() or <Routes> in App.tsx or router.tsx.',
  },
  'vite-vue': {
    id: 'vite-vue',
    displayName: 'Vite + Vue',
    build: { command: 'npm run build', outputDir: 'dist', basePath: 'vue-router' },
    routing: { type: 'vue-router', spaFallback: true },
    aiContextHint: 'Vite + Vue SPA. Single index.html entry point. Routes defined via Vue Router — look for createRouter() in src/router/index.ts.',
  },
  'astro': {
    id: 'astro',
    displayName: 'Astro',
    build: { command: 'npm run build', outputDir: 'dist', basePath: 'none' },
    routing: { type: 'file-based', spaFallback: false },
    aiContextHint: 'Astro static site. Pages live in src/pages/ as .astro files. File-based routing, static by default. Content collections may be in src/content/.',
  },
  'cra': {
    id: 'cra',
    displayName: 'Create React App',
    build: { command: 'npm run build', outputDir: 'build', basePath: 'cra-env' },
    routing: { type: 'react-router', spaFallback: true },
    aiContextHint: 'Create React App (react-scripts). Single index.html. Routes via React Router — look for <BrowserRouter> in index.tsx or App.tsx.',
  },
  'vanilla-html': {
    id: 'vanilla-html',
    displayName: 'Static HTML',
    build: { command: 'none', outputDir: '.', basePath: 'none' },
    routing: { type: 'none', spaFallback: false },
    aiContextHint: 'Plain HTML/CSS/JS — no build step. Each .html file is a separate page. Navigation via anchor links.',
  },
};

export const GENERATORS: Record<GeneratorId, GeneratorDefinition> = {
  LOVABLE: {
    id: 'LOVABLE',
    displayName: 'Lovable',
    confidence: 'certain',
    signals: {
      packageDevDeps: ['lovable-tagger'],
    },
  },
  BASE44: {
    id: 'BASE44',
    displayName: 'Base44',
    confidence: 'certain',
    signals: {
      packageDeps: ['@base44/sdk'],
    },
    notice: 'This app uses Base44\'s managed backend. Live data (database records, auth) requires a Base44 account — the preview shows the UI shell only.',
  },
  CLAUDE_CODE: {
    id: 'CLAUDE_CODE',
    displayName: 'Claude Code',
    confidence: 'likely',
    signals: {
      files: ['CLAUDE.md'],
      directories: ['.claude'],
    },
  },
  CURSOR: {
    id: 'CURSOR',
    displayName: 'Cursor',
    confidence: 'likely',
    signals: {
      files: ['.cursorrules'],
      directories: ['.cursor'],
    },
  },
  UNKNOWN: {
    id: 'UNKNOWN',
    displayName: 'Unknown',
    confidence: 'unknown',
    signals: {},
  },
};
```

---

## Step 2 — `src/analyze/detector.ts` (NEW FILE)

Pure detection logic. Reads filesystem, returns results. No side effects.

```typescript
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
  ARCHETYPES, GENERATORS,
  type ArchetypeId, type ArchetypeDefinition,
  type GeneratorId, type GeneratorDefinition,
} from './archetypes.js';

export interface DetectionResult {
  archetype: ArchetypeDefinition;
  generator: GeneratorDefinition;
  generatorConfidence: 'certain' | 'likely' | 'unknown';
}

export async function detectProject(projectRoot: string): Promise<DetectionResult> {
  const [archetype, generator] = await Promise.all([
    detectArchetype(projectRoot),
    detectGenerator(projectRoot),
  ]);
  return { archetype, generator, generatorConfidence: generator.confidence };
}

async function detectArchetype(projectRoot: string): Promise<ArchetypeDefinition> {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return ARCHETYPES['vanilla-html'];

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  } catch {
    return ARCHETYPES['vanilla-html'];
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // No build script → serve as-is
  if (!pkg.scripts?.build) return ARCHETYPES['vanilla-html'];

  // Priority order: nextjs → astro → vite-react → vite-vue → cra → vanilla-html

  if (allDeps['next']) {
    // Distinguish App Router vs Pages Router by directory presence
    const hasAppDir = existsSync(path.join(projectRoot, 'app')) ||
                      existsSync(path.join(projectRoot, 'src', 'app'));
    const hasPagesDir = existsSync(path.join(projectRoot, 'pages')) ||
                        existsSync(path.join(projectRoot, 'src', 'pages'));
    if (hasPagesDir && !hasAppDir) return ARCHETYPES['nextjs-pages-router'];
    return ARCHETYPES['nextjs-app-router']; // default for Next.js
  }

  if (allDeps['astro']) return ARCHETYPES['astro'];

  if (allDeps['vite'] && allDeps['react']) return ARCHETYPES['vite-react'];
  if (allDeps['vite'] && allDeps['vue'])   return ARCHETYPES['vite-vue'];

  if (allDeps['react-scripts']) return ARCHETYPES['cra'];

  return ARCHETYPES['vanilla-html'];
}

async function detectGenerator(projectRoot: string): Promise<GeneratorDefinition> {
  const pkgPath = path.join(projectRoot, 'package.json');
  let allDeps: Record<string, string> = {};

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch { /* ignore */ }
  }

  for (const gen of Object.values(GENERATORS)) {
    if (gen.id === 'UNKNOWN') continue;
    const { signals } = gen;

    if (signals.packageDeps?.some(d => d in allDeps)) return gen;
    if (signals.packageDevDeps?.some(d => d in allDeps)) return gen;
    if (signals.files?.some(f => existsSync(path.join(projectRoot, f)))) return gen;
    if (signals.directories?.some(d => existsSync(path.join(projectRoot, d)))) return gen;
  }

  return GENERATORS['UNKNOWN'];
}
```

---

## Step 3 — `src/state.ts` (EDIT)

Add `archetypeId`, `generatorId`, `generatorConfidence` to `ProjectState` interface.

```typescript
// In the ProjectState interface, add after outputDir:
archetypeId?: string;           // 'vite-react', 'nextjs-app-router', etc.
generatorId?: string;           // 'LOVABLE', 'BASE44', 'CLAUDE_CODE', etc.
generatorConfidence?: string;   // 'certain' | 'likely' | 'unknown'
generatorNotice?: string;       // Optional dashboard notice (e.g. Base44 backend warning)
```

---

## Step 4 — `src/analyze/build.ts` (EDIT)

Replace all heuristic detection with archetype-driven config. The key change:
`buildProject()` gains an optional `archetype` parameter. When provided, it skips `detectOutputDir()` and `getBuildCommand()` heuristics entirely.

Key changes:
1. Add `archetype?: ArchetypeDefinition` to `buildProject()` signature
2. When `archetype` provided: skip `detectOutputDir()`, use `archetype.build.outputDir`
3. When `archetype` provided: skip `getBuildCommand()` heuristics, use archetype's `basePath` to determine build command:
   - `'vite-flag'` → `npm run build -- --base=/preview/`
   - `'next-static-export'` → `npm run build` (patch handled by `patchSourceForPreview`)
   - `'cra-env'` → `PUBLIC_URL=/preview/ npm run build`
   - `'vue-router'` → `npm run build` (patch handled by `patchSourceForPreview`)
   - `'none'` → `npm run build`
4. When `archetype` provided and `archetype.build.command === 'none'`: return immediately with `servePath: projectRoot`
5. Keep existing heuristic path as fallback when no archetype passed (backward compat)

---

## Step 5 — `src/analyze/index.ts` (EDIT)

Add detection as first step before `buildProject()`.

```typescript
import { detectProject } from './detector.js';
// ...

export async function analyzeProject(projectRoot: string, fileTree: string[]) {
  // ── Step 0: Detect archetype + generator (NEW) ────────────────────
  const detection = await detectProject(projectRoot);
  console.log(`  Detected: ${detection.archetype.id} / generator: ${detection.generator.id} (${detection.generatorConfidence})`);

  // Persist detection to state immediately
  const initialState = getProjectState();
  if (initialState) {
    setProjectState({
      ...initialState,
      archetypeId: detection.archetype.id,
      generatorId: detection.generator.id,
      generatorConfidence: detection.generatorConfidence,
      generatorNotice: detection.generator.notice,
    });
  }

  // ── Step 1: Build (now archetype-driven) ──────────────────────────
  const buildResult = await buildProject(projectRoot, { archetype: detection.archetype });
  // ... rest unchanged
```

Pass `detection.archetype` and `detection.generator` into `runAutonomousAgent()` as new parameters.

---

## Step 6 — `src/analyze/systemPrompt.ts` (EDIT)

Add a function `buildArchetypeContext(archetype, generator)` that generates a preamble injected at the top of the system prompt.

```typescript
export function buildArchetypeContext(
  archetype: ArchetypeDefinition,
  generator: GeneratorDefinition,
): string {
  const generatorLine = generator.id !== 'UNKNOWN'
    ? `Generator: ${generator.displayName} (${generator.confidence} detection)`
    : 'Generator: Unknown';

  return `
## PROJECT CONTEXT (pre-detected — do NOT re-examine)

${generatorLine}
Project type: ${archetype.displayName}
Build: ${archetype.build.command === 'none' ? 'No build needed' : `${archetype.build.command} → ${archetype.build.outputDir}/`}
Routing: ${archetype.routing.type}, SPA fallback: ${archetype.routing.spaFallback}

${archetype.aiContextHint}

## YOUR JOB

Do NOT re-examine framework, build configuration, routing type, or output directory.
These are already resolved. Focus exclusively on:
1. Identifying all pages (name, navigateTo path, description)
2. Extracting content collections — for each, record sourceFile, sourceType, sourcePath
3. Writing a 2-sentence business summary
4. Assessing launch readiness (SEO, content, media)
`.trim();
}
```

Remove Steps 1–5 from the existing system prompt (framework/build/routing discovery). Keep Steps 6–8 (page reading, content extraction, readiness).

Update `runAutonomousAgent()` to accept `archetype` and `generator` parameters and call `buildArchetypeContext()` before the existing prompt.

---

## Step 7 — `src/analyze/outputSchema.ts` (EDIT)

Add source mapping fields to `AIContentCollection`:

```typescript
export interface AIContentCollection {
  name: string;
  varName: string;
  confidence: 'certain' | 'likely' | 'inferred';
  sourceFile: string;   // file path containing the data, e.g. 'src/lib/data/team.ts'
  items: ContentItem[];
  // NEW:
  sourceType?: 'ts-array' | 'json' | 'mdx' | 'html';
  sourcePath?: string;  // e.g. 'teamMembers[{i}].{field}' — template for patching
}
```

Update the JSON schema and the `mapToProject()` function to pass these fields through to the stored analysis.

---

## Step 8 — `src/edits.ts` (EDIT)

Add `applySourceEdits()` function below the existing `applyEdits()`.

```typescript
import fs from 'fs/promises';
import path from 'path';
import type { AIContentCollection } from './analyze/outputSchema.js';

/**
 * Write a CMS field change back to the source data file.
 * Called in parallel with applyEdits() (which patches built HTML).
 * Fire-and-forget — failures are logged but never thrown.
 */
export async function applySourceEdits(
  projectRoot: string,
  collection: AIContentCollection,
  itemIndex: number,
  field: string,
  newValue: string,
): Promise<void> {
  if (!collection.sourceFile || !collection.sourceType) return;

  const absPath = path.join(projectRoot, collection.sourceFile);

  try {
    switch (collection.sourceType) {
      case 'json':
        await patchJsonFile(absPath, itemIndex, field, newValue);
        break;
      case 'ts-array':
        await patchTsArrayFile(absPath, collection.items[itemIndex]?.[field], newValue);
        break;
      case 'mdx':
        await patchMdxFile(absPath, field, newValue);
        break;
      case 'html':
        // HTML already handled by applyEdits() — no-op here
        break;
    }
  } catch (err) {
    console.warn(`[source-edit] Failed to patch ${collection.sourceFile}:`, err instanceof Error ? err.message : err);
  }
}

async function patchJsonFile(filePath: string, index: number, field: string, value: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const arr = Array.isArray(data) ? data : Object.values(data).find(Array.isArray);
  if (arr && arr[index] && field in arr[index]) {
    arr[index][field] = value;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }
}

async function patchTsArrayFile(filePath: string, oldValue: string, newValue: string): Promise<void> {
  if (!oldValue) return;
  const raw = await fs.readFile(filePath, 'utf-8');
  // Line-targeted replacement: find line containing the exact old string value
  const escaped = oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(['"\`])${escaped}\\1`);
  const lines = raw.split('\n');
  const lineIdx = lines.findIndex(l => pattern.test(l));
  if (lineIdx === -1) return;
  lines[lineIdx] = lines[lineIdx].replace(pattern, `'${newValue.replace(/'/g, "\\'")}'`);
  await fs.writeFile(filePath, lines.join('\n'));
}

async function patchMdxFile(filePath: string, field: string, value: string): Promise<void> {
  // Lazy-require gray-matter only when needed
  const matter = (await import('gray-matter')).default;
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  if (field in parsed.data) {
    parsed.data[field] = value;
    await fs.writeFile(filePath, matter.stringify(parsed.content, parsed.data));
  }
}
```

**Also update the `/api/edits` route handler** in `server.ts` (or wherever the route lives) to:
1. Accept `cmsSourceWrite?: { collectionName, itemIndex, field, value }` in request body
2. When present, load the analysis, find the matching collection, call `applySourceEdits()` in parallel with `applyEdits()`

---

## Step 9 — `src/preview.ts` (EDIT)

In `HP_BRIDGE_SCRIPT`, update the CSS selector generator to check for `data-component-id` first:

Find the `generateSelector` function (or equivalent) in the bridge script. Prepend:

```js
// Lovable projects: prefer stable data-component-id over generated CSS paths
var componentId = el.getAttribute && el.getAttribute('data-component-id');
if (componentId) {
  return '[data-component-id="' + componentId.replace(/"/g, '\\"') + '"]';
}
```

This must be the **first check** before any other selector logic.

---

## Step 10 — UI: Generator Badge (EDIT)

In `solo-app`, update the project header / dashboard to show the generator badge when `generatorId` is known and `generatorConfidence` is `'certain'` or `'likely'`.

Files to edit:
- `src/components/ProjectHeader.tsx` (or equivalent) — add generator badge pill
- `src/components/AnalysisView.tsx` — show generator badge during analysis ("Detected: Lovable project")
- If `generatorNotice` is present (Base44), show a dismissable info banner below the page list

Badge display names: "Lovable", "Base44", "Claude Code", "Cursor"
Badge style: small pill, neutral color, shown next to project name

---

## Testing Checklist

After implementation, verify with these specific projects:

| Test | Expected result |
|------|----------------|
| Upload Lovable project | Detected as `vite-react` + `LOVABLE`, builds to `dist/`, canvas uses `data-component-id` selectors |
| Upload Base44 project | Detected as `vite-react` + `BASE44`, dashboard shows backend notice, CMS edits UI copy only |
| Upload Next.js project (app router) | Detected as `nextjs-app-router`, `output: 'export'` patched, builds to `out/`, all pages preview |
| Upload vanilla HTML | No package.json → `vanilla-html`, no build, served immediately |
| Edit CMS field (Lovable) | Built HTML updates (canvas refreshes) + `src/lib/data/*.ts` source file updated |
| Edit CMS field (Next.js) | Built HTML updates + source `.ts`/`.json` file updated |
| Unknown project (Manus) | Falls through to heuristic, graceful preview, no crash |

---

## Dependencies to Install

```bash
# In solo-server:
npm install gray-matter
npm install -D @types/gray-matter
```

No other new dependencies.

---

## File Summary

| File | Action | Lines est. |
|------|--------|-----------|
| `src/analyze/archetypes.ts` | Create | ~120 |
| `src/analyze/detector.ts` | Create | ~80 |
| `src/state.ts` | Edit (4 lines) | +4 |
| `src/analyze/build.ts` | Edit | ~30 changed |
| `src/analyze/index.ts` | Edit | ~20 added |
| `src/analyze/systemPrompt.ts` | Edit | ~40 changed |
| `src/analyze/outputSchema.ts` | Edit | ~8 added |
| `src/analyze/autonomousAgent.ts` | Edit | ~15 changed |
| `src/edits.ts` | Edit | ~80 added |
| `src/preview.ts` | Edit | ~8 changed |
| UI components (badge) | Edit | ~40 total |
