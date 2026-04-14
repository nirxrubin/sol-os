import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getAnalysisStatus, getProjectState, setProjectState, readAnalysis, getWorkspacePath, setAnalysisStatus } from './state.js';
import { getEnvVarStatus, mergeUserEnvVars } from './analyze/envVars.js';
import { buildProject } from './analyze/build.js';
import { ARCHETYPES, type ArchetypeId } from './analyze/archetypes.js';
import { analyzeProject } from './analyze/index.js';

export const analysisRouter = Router();

// Reset: clear workspace so the frontend returns to landing
analysisRouter.post('/reset', async (_req, res) => {
  try {
    const workspace = getWorkspacePath();
    // Delete analysis and state files (but keep workspace dir)
    await Promise.allSettled([
      fs.rm(path.join(workspace, '.hp-analysis.json'), { force: true }),
      fs.rm(path.join(workspace, '.hp-state.json'), { force: true }),
      fs.rm(path.join(workspace, '.hp-edits.json'), { force: true }),
      fs.rm(path.join(workspace, '.hp-cms.json'), { force: true }),
      fs.rm(path.join(workspace, '__extracted'), { recursive: true, force: true }),
    ]);
    setAnalysisStatus('idle');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

analysisRouter.get('/analysis', async (_req, res) => {
  const status = getAnalysisStatus();
  const projectState = getProjectState();

  if (status === 'idle' || !projectState) {
    res.json({ status: 'idle', project: null });
    return;
  }

  // Detection fields — available as soon as detection runs (before full analysis)
  const detectionFields = {
    archetypeId: projectState.archetypeId,
    detectionConfidence: projectState.detectionConfidence,
    needsBackend: projectState.needsBackend,
    generatorId: projectState.generatorId,
    generatorConfidence: projectState.generatorConfidence,
    generatorNotice: projectState.generatorNotice,
    buildSuccess: projectState.buildSuccess,
    buildError: projectState.buildError,
    buildOutput: projectState.buildOutput,
    envVarsComplete: projectState.envVarsComplete,
  };

  // Only read and return project data when analysis is complete
  if (status === 'complete') {
    const analysis = await readAnalysis();
    res.json({
      status,
      fileCount: projectState.fileCount,
      entryFile: projectState.entryFile,
      ...detectionFields,
      project: analysis ?? null,
    });
  } else {
    res.json({
      status,
      fileCount: projectState.fileCount,
      entryFile: projectState.entryFile,
      ...detectionFields,
    });
  }
});

// ─── POST /api/analysis/confirm-framework ─────────────────────────────────
// Stage 3: user corrects the detected framework and/or provides a custom build command.
// Retries the build with the corrected archetype and, if successful, resumes AI analysis.

analysisRouter.post('/analysis/confirm-framework', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(404).json({ error: 'No project uploaded' });
    return;
  }

  const { archetypeId, buildCommand } = req.body as {
    archetypeId?: string;
    buildCommand?: string;
  };

  const archetype = archetypeId && archetypeId in ARCHETYPES
    ? ARCHETYPES[archetypeId as ArchetypeId]
    : undefined;

  if (!archetype && !buildCommand) {
    res.status(400).json({ error: 'Provide archetypeId or buildCommand' });
    return;
  }

  const effectiveArchetype = archetype
    ?? (state.archetypeId && state.archetypeId in ARCHETYPES
      ? ARCHETYPES[state.archetypeId as ArchetypeId]
      : ARCHETYPES['vanilla-html']);

  // Persist user override
  setProjectState({
    ...state,
    userConfirmedArchetype: archetypeId ?? state.archetypeId,
    userBuildCommand: buildCommand,
    buildSuccess: undefined,
    buildError: undefined,
  });

  // Retry build
  const buildResult = await buildProject(state.projectRoot, {
    archetype: effectiveArchetype,
    buildCommand,
    force: true,
  });

  setProjectState({
    ...getProjectState()!,
    servePath: buildResult.success ? buildResult.servePath : state.projectRoot,
    buildSuccess: buildResult.success,
    buildError: buildResult.buildError,
    buildOutput: buildResult.buildOutput,
    buildNeeded: buildResult.needed,
  });

  if (!buildResult.success) {
    res.json({
      success: false,
      buildError: buildResult.buildError,
      buildOutput: buildResult.buildOutput,
    });
    return;
  }

  // Build succeeded — resume analysis in background
  setAnalysisStatus('analyzing');
  res.json({ success: true, message: 'Build succeeded — resuming analysis' });

  const currentState = getProjectState()!;
  analyzeProject(currentState.projectRoot, currentState.fileTree)
    .then(() => setAnalysisStatus('complete'))
    .catch((err) => {
      console.error('[confirm-framework] Analysis failed:', err);
      setAnalysisStatus('error');
    });
});

// ─── GET /api/analysis/env-vars ───────────────────────────────────────────
// Returns the env var status for the current project.

analysisRouter.get('/analysis/env-vars', async (_req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(404).json({ error: 'No project uploaded' });
    return;
  }

  const status = await getEnvVarStatus(state.projectRoot);
  res.json(status);
});

// ─── POST /api/analysis/env-vars ─────────────────────────────────────────
// User submits env var values. Merges into .env.local and marks gate complete.

analysisRouter.post('/analysis/env-vars', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(404).json({ error: 'No project uploaded' });
    return;
  }

  const { vars } = req.body as { vars: Record<string, string> };
  if (!vars || typeof vars !== 'object') {
    res.status(400).json({ error: 'Body must be { vars: { KEY: value } }' });
    return;
  }

  await mergeUserEnvVars(state.projectRoot, vars);

  const status = await getEnvVarStatus(state.projectRoot);
  setProjectState({
    ...state,
    providedEnvVars: status.provided,
    envVarsComplete: status.complete,
  });

  res.json({ ok: true, ...status });
});
