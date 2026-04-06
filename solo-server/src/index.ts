import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to this file's location, not process.cwd()
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env'), override: true });

import express from 'express';
import cors from 'cors';
import { uploadRouter } from './upload.js';
import { analysisRouter } from './analysis.js';
import { progressRouter } from './progress.js';
import { editsRouter } from './edits.js';
import { createPreviewApp, PREVIEW_PORT } from './preview.js';
import { stripRouter } from './strip/router.js';
import { initChangelog } from './engine/changelog.js';
import { getWorkspacePath } from './state.js';

const app = express();
const PORT = 3001;

// Allow any localhost port (5173, 5174, etc.)
app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', uploadRouter);
app.use('/api', analysisRouter);
app.use('/api', progressRouter);
app.use('/api', editsRouter);
app.use('/api', stripRouter);

// Preview: dedicated port — project served from / (no subpath prefix)
// Maps to {project-id}.preview.hostaposta.app in production SaaS
createPreviewApp().listen(PREVIEW_PORT, () => {
  console.log(`preview server on http://localhost:${PREVIEW_PORT}`);
});

// Initialize changelog engine
initChangelog(getWorkspacePath());

app.listen(PORT, () => {
  console.log(`solo-server running on http://localhost:${PORT}`);
});
