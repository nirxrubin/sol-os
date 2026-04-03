import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to this file's location, not process.cwd()
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import { uploadRouter } from './upload.js';
import { analysisRouter } from './analysis.js';
import { editsRouter } from './edits.js';
import { previewMiddleware } from './preview.js';
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
app.use('/api', editsRouter);

// Preview: serve extracted project files
app.use('/preview', previewMiddleware());

// Initialize changelog engine
initChangelog(getWorkspacePath());

app.listen(PORT, () => {
  console.log(`solo-server running on http://localhost:${PORT}`);
});
