/**
 * Source Editing API
 *
 * REST endpoints for source-file mutation, CMS sync, asset upload,
 * and changelog access. All edits write to the actual project files —
 * the project on disk is always deployment-ready.
 *
 * Legacy overlay endpoints are kept temporarily for migration.
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import {
  applyEdits,
  applyCMSChanges,
  type SourceEdit,
  type CMSFieldChange,
} from './engine/source.js';
import { recordChanges, getChangelog, getChangelogSummary, getChangesSince } from './engine/changelog.js';
import { uploadAsset } from './engine/assets.js';
import { getProjectState, setProjectState, readAnalysis, readEdits, writeEdits, readCMS, writeCMS } from './state.js';
import type { PageEdits } from './state.js';
import { buildProject } from './analyze/build.js';
import { applySourceArrayEdits, type SourceArrayEdit as SourceArrEdit } from './engine/sourceArray.js';

// ─── Dual-Write CMS: Source File Patchers ─────────────────────────────────
//
// Write B of the dual-write strategy: persist a CMS field change back to the
// original source data file so it survives rebuilds.
//
// Write A (built HTML) is handled by the existing applyEdits() path.
// Write B (source file) is fire-and-forget — never blocks the UI response.

type SourceType = 'ts-array' | 'json' | 'mdx' | 'html';

async function applySourceFileWrite(
  projectRoot: string,
  sourceFile: string,
  sourceType: SourceType,
  itemIndex: number,
  field: string,
  oldValue: string,
  newValue: string,
): Promise<void> {
  const absPath = path.join(projectRoot, sourceFile);
  try {
    await fs.access(absPath);
  } catch {
    console.warn(`[source-write] File not found: ${sourceFile}`);
    return;
  }

  try {
    switch (sourceType) {
      case 'json':
        await patchJsonSource(absPath, itemIndex, field, newValue);
        break;
      case 'ts-array':
        await patchTsArraySource(absPath, oldValue, newValue);
        break;
      case 'mdx':
        await patchMdxSource(absPath, field, newValue);
        break;
      case 'html':
        // HTML handled by Write A (applyEdits) — no-op here
        break;
    }
    console.log(`[source-write] Patched ${sourceFile} [${sourceType}] item[${itemIndex}].${field}`);
  } catch (err) {
    console.warn(`[source-write] Failed to patch ${sourceFile}:`, err instanceof Error ? err.message : err);
  }
}

async function patchJsonSource(filePath: string, index: number, field: string, value: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  // Handle both top-level array and object with one array property
  const arr: Record<string, unknown>[] | null = Array.isArray(data)
    ? data
    : (Object.values(data).find(v => Array.isArray(v)) as Record<string, unknown>[] | undefined) ?? null;
  if (!arr || !arr[index]) return;
  arr[index][field] = value;
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function patchTsArraySource(filePath: string, oldValue: string, newValue: string): Promise<void> {
  if (!oldValue || oldValue === newValue) return;
  const raw = await fs.readFile(filePath, 'utf-8');
  // Find and replace the first line containing the exact old string literal
  const escaped = oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match: 'old' or "old" or `old`
  const pattern = new RegExp(`(['"\`])${escaped}\\1`);
  const lines = raw.split('\n');
  const lineIdx = lines.findIndex(l => pattern.test(l));
  if (lineIdx === -1) {
    console.warn(`[source-write] Could not find "${oldValue}" in ${filePath}`);
    return;
  }
  const safeNew = newValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  lines[lineIdx] = lines[lineIdx].replace(pattern, `'${safeNew}'`);
  await fs.writeFile(filePath, lines.join('\n'));
}

async function patchMdxSource(filePath: string, field: string, value: string): Promise<void> {
  // Lazy-load gray-matter only when needed — avoids startup cost
  let matter: typeof import('gray-matter').default;
  try {
    matter = (await import('gray-matter')).default;
  } catch {
    console.warn('[source-write] gray-matter not installed — MDX write skipped');
    return;
  }
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  if (!(field in parsed.data)) return;
  parsed.data[field] = value;
  await fs.writeFile(filePath, matter.stringify(parsed.content, parsed.data));
}

export const editsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Source Edit ──────────────────────────────────────────────────
// Apply edits directly to project source files.

editsRouter.post('/source/edit', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(400).json({ error: 'No project loaded' });
    return;
  }

  const { edits, source = 'canvas' } = req.body as {
    edits: SourceEdit[];
    source?: 'canvas' | 'cms' | 'provider' | 'system';
  };

  if (!edits || !Array.isArray(edits) || edits.length === 0) {
    res.status(400).json({ error: 'edits array required' });
    return;
  }

  // Group edits by page for efficient batch processing
  const byPage = new Map<string, SourceEdit[]>();
  for (const edit of edits) {
    const page = edit.page;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page)!.push(edit);
  }

  const allResults = [];
  for (const [page, pageEdits] of byPage) {
    // Use servePath for canvas edits on compiled projects (Next.js, React, etc.)
    // so CSS-selector edits target the built HTML files, not the TypeScript source.
    const editRoot = (state as any).servePath || state.projectRoot;
    const results = await applyEdits(editRoot, page, pageEdits);
    allResults.push(...results);
  }

  // Record in changelog
  await recordChanges(allResults, source);

  const succeeded = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;

  // For built projects, trigger async rebuild so preview updates
  if (succeeded > 0 && state.buildNeeded) {
    triggerRebuild(state.projectRoot);
  }

  res.json({
    ok: succeeded > 0,
    succeeded,
    failed,
    results: allResults,
  });
});

// ─── CMS Sync ─────────────────────────────────────────────────────
//
// New architecture (compiler + adapter pattern):
//   Phase 2 injector has already added window.__HP_DATA bridge to source arrays.
//   CMS sync now works by:
//     1. Writing updated CMS state to .sol-cms.json
//     2. Returning { ok: true }
//     3. Frontend bumps previewVersion → iframe reloads
//     4. Preview server injects window.__HP_DATA from .sol-cms.json on every HTML serve
//     5. React/Vue reads window.__HP_DATA?.varName on first render — shows updated content
//
//   No rebuild needed. No source file mutation per edit. Instant round-trip.
//
// Payload: { contentTypes: ContentType[] } — full CMS state, not field-level diffs.

editsRouter.post('/source/cms-sync', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(400).json({ error: 'No project loaded' });
    return;
  }

  const body = req.body as { contentTypes?: unknown[]; changes?: unknown[] };

  // Accept both full contentTypes payload (new) and legacy changes payload (old)
  if (body.contentTypes && Array.isArray(body.contentTypes)) {
    // New flow: persist full CMS state, preview server injects __HP_DATA
    await writeCMS(body.contentTypes);
    res.json({ ok: true, strategy: 'hp-data-injection' });
    return;
  }

  // Legacy fallback: field-level changes via source array editing
  // Kept for backward compatibility with older sessions that lack Phase 2 injection.
  const { changes } = body as { changes: CMSFieldChange[] };
  if (!changes || changes.length === 0) {
    res.status(400).json({ error: 'contentTypes array or changes array required' });
    return;
  }

  const analysis = await readAnalysis() as any;
  if (!analysis?.contentTypes) {
    res.status(400).json({ error: 'No analysis data' });
    return;
  }

  const sourceBindingsMap: Record<string, any> = {};
  for (const ct of analysis.contentTypes) {
    if (ct.sourceBindings) sourceBindingsMap[ct.id] = ct.sourceBindings;
  }

  const sourceArrayEdits: SourceArrEdit[] = [];
  for (const change of changes) {
    const sourceBinding = sourceBindingsMap[change.contentTypeId];
    if (sourceBinding?.items?.[change.itemId]) {
      const itemBinding = sourceBinding.items[change.itemId];
      sourceArrayEdits.push({
        file: sourceBinding.file,
        varName: sourceBinding.varName,
        itemIndex: itemBinding.itemIndex,
        fieldName: change.fieldName,
        newValue: change.newValue,
      });
    }
  }

  if (sourceArrayEdits.length === 0) {
    res.json({ ok: false, error: 'No applicable bindings found' });
    return;
  }

  const sourceResults = await applySourceArrayEdits(state.projectRoot, sourceArrayEdits);

  if (sourceResults.some(r => r.success) && state.buildNeeded) {
    console.log('  Rebuilding after legacy CMS sync...');
    try {
      const buildResult = await buildProject(state.projectRoot, { force: true });
      if (buildResult.success) setProjectState({ ...state, servePath: buildResult.servePath });
    } catch (err) {
      console.error('  Rebuild error:', err);
    }
  }

  const mappedResults = sourceResults.map(r => ({
    success: r.success,
    changeId: r.changeId,
    page: r.file,
    selector: `${r.varName}[${r.itemIndex}].${r.fieldName}`,
    editType: 'text' as const,
    oldValue: r.oldValue,
    newValue: r.newValue,
    error: r.error,
  }));

  await recordChanges(mappedResults, 'cms');
  res.json({
    ok: mappedResults.some(r => r.success),
    rebuilt: state.buildNeeded && mappedResults.some(r => r.success),
    strategy: 'source-array-legacy',
    results: mappedResults,
  });
});

// ─── CMS Source Field Write ───────────────────────────────────────
// Write B of dual-write: persist a single CMS field change to the source file.
// Called by the frontend in parallel with cms-sync (Write A = built HTML/HP_DATA).
// Fire-and-forget from the client's perspective — always returns { ok: true }.

editsRouter.post('/source/cms-field-write', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.json({ ok: false, error: 'No project loaded' });
    return;
  }

  const { collectionId, itemIndex, field, oldValue, newValue } = req.body as {
    collectionId: string;
    itemIndex: number;
    field: string;
    oldValue: string;
    newValue: string;
  };

  if (!collectionId || itemIndex === undefined || !field || newValue === undefined) {
    res.json({ ok: false, error: 'collectionId, itemIndex, field, newValue required' });
    return;
  }

  // Look up source binding from stored analysis
  const analysis = await readAnalysis() as any;
  const contentType = analysis?.contentTypes?.find((ct: any) => ct.id === collectionId);
  const bindings = contentType?.sourceBindings;

  if (!bindings?.file || !bindings?.sourceType) {
    // No source mapping — skip silently (Base44, API-driven, etc.)
    res.json({ ok: true, skipped: true, reason: 'No source mapping for this collection' });
    return;
  }

  // Fire-and-forget — don't await, don't block the response
  applySourceFileWrite(
    state.projectRoot,
    bindings.file,
    bindings.sourceType as SourceType,
    itemIndex,
    field,
    oldValue ?? '',
    newValue,
  ).catch(err => console.warn('[source-write] Background write failed:', err));

  res.json({ ok: true, sourceFile: bindings.file, sourceType: bindings.sourceType });
});

// ─── Asset Upload ─────────────────────────────────────────────────
// Upload an image/file and get a project-relative path for source edits.

editsRouter.post('/source/upload-asset', upload.single('file'), async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(400).json({ error: 'No project loaded' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const asset = await uploadAsset(
    state.projectRoot,
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
  );

  res.json({
    ok: true,
    path: asset.relativePath,
    size: asset.size,
    mimeType: asset.mimeType,
  });
});

// ─── Changelog ────────────────────────────────────────────────────

editsRouter.get('/source/changelog', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const page = req.query.page as string | undefined;
  const source = req.query.source as any;

  const entries = await getChangelog({ limit, offset, page, source });
  res.json(entries);
});

editsRouter.get('/source/changelog/summary', async (_req, res) => {
  const summary = await getChangelogSummary();
  res.json(summary);
});

editsRouter.get('/source/changelog/since/:version', async (req, res) => {
  const version = parseInt(req.params.version) || 0;
  const entries = await getChangesSince(version);
  res.json(entries);
});

// ─── Legacy overlay endpoints (kept for backward compat) ──────────
// These will be removed once the frontend fully migrates to source edits.
// On first access, migrates existing overlays to source edits.

editsRouter.get('/edits', async (_req, res) => {
  const edits = await readEdits();
  res.json(edits);
});

editsRouter.post('/edits', async (req, res) => {
  const { pagePath, edits: pageEdits } = req.body as {
    pagePath: string;
    edits: PageEdits[string];
  };
  if (!pagePath) {
    res.status(400).json({ error: 'pagePath required' });
    return;
  }

  // MIGRATION: Also apply to source files if a project is loaded
  const state = getProjectState();
  if (state && pageEdits && pageEdits.length > 0) {
    const sourceEdits: SourceEdit[] = pageEdits.map((e) => ({
      page: pagePath === '/' ? '/index.html' : pagePath,
      selector: e.selector,
      type: e.type,
      content: e.content,
      alt: e.alt,
    }));
    const results = await applyEdits(state.projectRoot, sourceEdits[0].page, sourceEdits);
    await recordChanges(results, 'canvas');
  }

  // Also save to legacy file for now
  const allEdits = await readEdits();
  if (pageEdits && pageEdits.length > 0) {
    allEdits[pagePath] = pageEdits;
  } else {
    delete allEdits[pagePath];
  }
  await writeEdits(allEdits);
  res.json({ ok: true });
});

// ─── CMS persistence ─────────────────────────────────────────────

editsRouter.get('/cms', async (_req, res) => {
  const data = await readCMS();
  res.json(data ?? null);
});

editsRouter.post('/cms', async (req, res) => {
  await writeCMS(req.body);
  res.json({ ok: true });
});

// ─── Debounced Rebuild for Built Projects ─────────────────────────
// After source edits on React/Vite projects, rebuild so preview updates.

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let isRebuilding = false;

function triggerRebuild(projectRoot: string) {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    if (isRebuilding) return;
    isRebuilding = true;
    console.log('  Rebuilding project after edits...');
    try {
      const result = await buildProject(projectRoot, { force: true });
      if (result.success) {
        const state = getProjectState();
        if (state) {
          setProjectState({ ...state, servePath: result.servePath });
        }
        console.log('  Rebuild complete');
      } else {
        console.warn('  Rebuild failed:', result.buildError?.slice(0, 200));
      }
    } catch (err) {
      console.error('  Rebuild error:', err);
    } finally {
      isRebuilding = false;
    }
  }, 2000); // 2s debounce to batch multiple edits
}
