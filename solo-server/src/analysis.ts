import { Router } from 'express';
import { getAnalysisStatus, getProjectState, readAnalysis } from './state.js';

export const analysisRouter = Router();

analysisRouter.get('/analysis', async (_req, res) => {
  const status = getAnalysisStatus();
  const projectState = getProjectState();

  if (status === 'idle' || !projectState) {
    res.json({ status: 'idle', project: null });
    return;
  }

  // Only read and return project data when analysis is complete
  if (status === 'complete') {
    const analysis = await readAnalysis();
    res.json({
      status,
      fileCount: projectState.fileCount,
      entryFile: projectState.entryFile,
      project: analysis ?? null,
    });
  } else {
    res.json({
      status,
      fileCount: projectState.fileCount,
      entryFile: projectState.entryFile,
    });
  }
});
