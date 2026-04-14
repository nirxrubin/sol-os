/**
 * Deploy Router
 *
 * Exposes two endpoints:
 *
 *   POST /api/deploy
 *     Builds (if needed) then deploys the current project to Cloudflare Pages.
 *     Body: { projectSlug?: string }  — optional slug override
 *     Returns: { success, url, pagesUrl, deploymentId, error? }
 *
 *   GET /api/deploy/status
 *     Returns the current deployment state from project state.
 */

import { Router } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { getProjectState, setProjectState } from '../state.js';
import { buildProject } from '../analyze/build.js';
import { deployToCloudflarePages } from './cloudflarePages.js';

export const deployRouter = Router();

// ─── POST /api/deploy ──────────────────────────────────────────────────────

deployRouter.post('/deploy', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(404).json({ success: false, error: 'No project uploaded yet' });
    return;
  }

  // Determine slug: explicit body override → existing state slug → derived from projectRoot
  const slugOverride = (req.body?.projectSlug as string | undefined)?.trim();
  const projectSlug = slugOverride
    || state.projectSlug
    || path.basename(state.projectRoot).toLowerCase().replace(/[^a-z0-9]/g, '-');

  console.log(`[deploy] Starting deploy for slug="${projectSlug}"`);

  // ── Build if needed ─────────────────────────────────────────────────────
  let serveDir = state.servePath;

  if (!state.buildSuccess && state.buildNeeded !== false) {
    console.log('[deploy] Build not yet complete — running build...');
    try {
      const buildResult = await buildProject(state.projectRoot);
      serveDir = buildResult.servePath;

      // Persist updated build state
      setProjectState({
        ...state,
        servePath: buildResult.servePath,
        buildSuccess: buildResult.success,
        buildError: buildResult.buildError,
        buildNeeded: buildResult.needed,
      });

      if (!buildResult.success) {
        res.status(400).json({
          success: false,
          error: 'Build failed — cannot deploy source files. See build error for details.',
          buildError: buildResult.buildError,
          buildOutput: buildResult.buildOutput,
        });
        return;
      }
      console.log(`[deploy] Build complete, serveDir=${serveDir}`);
    } catch (err: any) {
      console.error('[deploy] Build threw error:', err.message);
      res.status(500).json({ success: false, error: `Build error: ${err.message}` });
      return;
    }
  }

  // ── Guard: never deploy source files ───────────────────────────────────
  if (!existsSync(path.join(serveDir, 'index.html'))) {
    res.status(400).json({
      success: false,
      error: 'No index.html found in build output. Source files cannot be deployed.',
      serveDir,
    });
    return;
  }

  // ── Deploy ──────────────────────────────────────────────────────────────
  const result = await deployToCloudflarePages(projectSlug, serveDir);

  if (result.success) {
    // Persist deployment info to state
    setProjectState({
      ...getProjectState()!,  // re-read in case build updated it above
      projectSlug,
      deploymentId: result.deploymentId,
      deploymentUrl: result.url,
      deploymentPagesUrl: result.pagesUrl,
    });
    console.log(`[deploy] Success: ${result.url}`);
  } else {
    console.error('[deploy] Failed:', result.error);
  }

  res.status(result.success ? 200 : 500).json({
    success: result.success,
    url: result.url,
    pagesUrl: result.pagesUrl,
    deploymentId: result.deploymentId,
    error: result.error,
  });
});

// ─── GET /api/deploy/status ────────────────────────────────────────────────

deployRouter.get('/deploy/status', (_req, res) => {
  const state = getProjectState();

  if (!state) {
    res.json({
      deployed: false,
      message: 'No project uploaded yet',
    });
    return;
  }

  res.json({
    deployed: !!state.deploymentId,
    projectSlug: state.projectSlug ?? null,
    deploymentId: state.deploymentId ?? null,
    url: state.deploymentUrl ?? null,
    pagesUrl: state.deploymentPagesUrl ?? null,
  });
});
