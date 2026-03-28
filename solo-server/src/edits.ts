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
    const results = await applyEdits(state.projectRoot, page, pageEdits);
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
// Apply CMS field changes via stored bindings from content analysis.

editsRouter.post('/source/cms-sync', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(400).json({ error: 'No project loaded' });
    return;
  }

  const { changes } = req.body as { changes: CMSFieldChange[] };
  if (!changes || changes.length === 0) {
    res.status(400).json({ error: 'changes array required' });
    return;
  }

  // Read bindings from analysis data
  const analysis = await readAnalysis() as any;
  if (!analysis?.contentTypes) {
    res.status(400).json({ error: 'No analysis data with bindings' });
    return;
  }

  // Separate changes into HTML-binding changes and source-array changes
  const htmlChanges: CMSFieldChange[] = [];
  const sourceArrayEdits: SourceArrEdit[] = [];

  // Build bindings map for HTML: { [ctId]: { [itemId]: CMSBinding[] } }
  const bindingsMap: Record<string, Record<string, any[]>> = {};
  // Build source bindings map: { [ctId]: { file, varName, items: { [itemId]: { itemIndex } } } }
  const sourceBindingsMap: Record<string, any> = {};

  for (const ct of analysis.contentTypes) {
    if (ct.bindings) {
      bindingsMap[ct.id] = ct.bindings;
    }
    if (ct.sourceBindings) {
      sourceBindingsMap[ct.id] = ct.sourceBindings;
    }
  }

  // Route each change to the right editor
  for (const change of changes) {
    const sourceBinding = sourceBindingsMap[change.contentTypeId];
    if (sourceBinding?.items?.[change.itemId]) {
      // This content type has source array bindings
      const itemBinding = sourceBinding.items[change.itemId];
      sourceArrayEdits.push({
        file: sourceBinding.file,
        varName: sourceBinding.varName,
        itemIndex: itemBinding.itemIndex,
        fieldName: change.fieldName,
        newValue: change.newValue,
      });
    } else if (bindingsMap[change.contentTypeId]) {
      // This content type has HTML DOM bindings
      htmlChanges.push(change);
    }
  }

  const allResults: any[] = [];

  // Apply HTML binding changes
  if (htmlChanges.length > 0) {
    const htmlResults = await applyCMSChanges(state.projectRoot, bindingsMap, htmlChanges);
    allResults.push(...htmlResults);
  }

  // Apply source array changes
  if (sourceArrayEdits.length > 0) {
    const sourceResults = await applySourceArrayEdits(state.projectRoot, sourceArrayEdits);
    allResults.push(...sourceResults.map(r => ({
      success: r.success,
      changeId: r.changeId,
      page: r.file,
      selector: `${r.varName}[${r.itemIndex}].${r.fieldName}`,
      editType: 'text' as const,
      oldValue: r.oldValue,
      newValue: r.newValue,
      error: r.error,
    })));

    // For SPA projects, rebuild synchronously so the frontend can reload immediately
    if (sourceResults.some(r => r.success) && state.buildNeeded) {
      console.log('  Rebuilding project after CMS edits...');
      try {
        const buildResult = await buildProject(state.projectRoot, { force: true });
        if (buildResult.success) {
          setProjectState({ ...state, servePath: buildResult.servePath });
          console.log('  Rebuild complete');
        } else {
          console.warn('  Rebuild failed:', buildResult.buildError?.slice(0, 200));
        }
      } catch (err) {
        console.error('  Rebuild error:', err);
      }
    }
  }

  await recordChanges(allResults, 'cms');

  res.json({
    ok: allResults.some((r: any) => r.success),
    rebuilt: state.buildNeeded && allResults.some((r: any) => r.success),
    results: allResults,
  });
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
