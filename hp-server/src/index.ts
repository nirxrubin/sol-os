import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env'), override: true });

import express from 'express';
import cors from 'cors';
import { uploadRouter } from './upload.js';
import { analysisRouter } from './analysis.js';
import { progressRouter } from './progress.js';
import { createPreviewApp, PREVIEW_PORT } from './preview.js';
import { deployRouter } from './deploy/router.js';

const app = express();
const PORT = 3001;

const ALLOWED_ORIGINS = [
  /^http:\/\/localhost:\d+$/,
  /^https:\/\/.*\.hostaposta\.app$/,
];
app.use(cors({ origin: (origin, cb) => {
  if (!origin || ALLOWED_ORIGINS.some(o => o.test(origin))) cb(null, true);
  else cb(new Error('Not allowed by CORS'));
}}));
app.use(express.json({ limit: '10mb' }));

app.use('/api', uploadRouter);
app.use('/api', analysisRouter);
app.use('/api', progressRouter);
app.use('/api', deployRouter);

createPreviewApp().listen(PREVIEW_PORT, () => {
  console.log(`[hostaposta] preview on http://localhost:${PREVIEW_PORT}`);
});

app.listen(PORT, () => {
  console.log(`[hostaposta] server on http://localhost:${PORT}`);
});
