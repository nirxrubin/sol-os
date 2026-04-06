import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getAnalysisStatus, getProjectState, readAnalysis, getWorkspacePath, setAnalysisStatus } from './state.js';

export const analysisRouter = Router();

// Reset: clear workspace so the frontend returns to landing
analysisRouter.post('/reset', async (_req, res) => {
  try {
    const workspace = getWorkspacePath();
    // Delete analysis and state files (but keep workspace dir)
    await Promise.allSettled([
      fs.rm(path.join(workspace, '.sol-analysis.json'), { force: true }),
      fs.rm(path.join(workspace, '.sol-state.json'), { force: true }),
      fs.rm(path.join(workspace, '.sol-edits.json'), { force: true }),
      fs.rm(path.join(workspace, '.sol-cms.json'), { force: true }),
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
    generatorId: projectState.generatorId,
    generatorConfidence: projectState.generatorConfidence,
    generatorNotice: projectState.generatorNotice,
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
