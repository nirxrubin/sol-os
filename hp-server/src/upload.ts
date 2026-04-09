import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { createReadStream, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { Parse } from 'unzipper';
import { getWorkspacePath, setProjectState, setAnalysisStatus } from './state.js';
import { analyzeProject } from './analyze/index.js';
import { sendAnalysisReady } from './email/client.js';
import { resetProgress, stepStart, stepDone, stepError } from './progress.js';

const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'hp-uploads');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
      cb(null, TEMP_UPLOAD_DIR);
    },
    filename: (_req, _file, cb) => cb(null, `upload-${Date.now()}.zip`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB cap
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip')) cb(null, true);
    else cb(new Error('Only .zip files are accepted'));
  },
});

export const uploadRouter = Router();

uploadRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const workspace = getWorkspacePath();

    resetProgress();
    stepStart('extract', 'Receiving upload…');

    // Clear previous workspace
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.mkdir(workspace, { recursive: true });

    const zipPath = req.file.path;
    const extractDir = path.join(workspace, '__extracted');
    await fs.mkdir(extractDir, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const writePromises: Promise<void>[] = [];
      const resolvedExtractDir = path.resolve(extractDir);

      createReadStream(zipPath)
        .pipe(Parse())
        .on('entry', async (entry) => {
          const filePath = entry.path as string;
          const type = entry.type as string;

          if (
            filePath.startsWith('__MACOSX') ||
            filePath.includes('/.git/') || filePath.startsWith('.git/') ||
            filePath.includes('/node_modules/') || filePath.includes('node_modules/') ||
            filePath.includes('/.claude/') || filePath.startsWith('.claude/') ||
            filePath.includes('/.cursor/') || filePath.startsWith('.cursor/') ||
            filePath.includes('.DS_Store')
          ) {
            entry.autodrain();
            return;
          }

          const fullPath = path.resolve(extractDir, filePath);
          if (!fullPath.startsWith(resolvedExtractDir + path.sep) && fullPath !== resolvedExtractDir) {
            entry.autodrain();
            return;
          }

          if (type === 'Directory') {
            await fs.mkdir(fullPath, { recursive: true });
            entry.autodrain();
          } else {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            const chunks: Buffer[] = [];
            entry.on('data', (chunk: Buffer) => chunks.push(chunk));
            const writeComplete = new Promise<void>((resolveWrite) => {
              entry.on('end', async () => {
                await fs.writeFile(fullPath, Buffer.concat(chunks));
                resolveWrite();
              });
            });
            writePromises.push(writeComplete);
          }
        })
        .on('close', async () => {
          try { await Promise.all(writePromises); resolve(); }
          catch (err) { reject(err); }
        })
        .on('error', reject);
    });

    await fs.unlink(zipPath);

    // Detect project root: if extracted has single folder, use that
    const entries = await fs.readdir(extractDir);
    const nonHidden = entries.filter((e) => !e.startsWith('.'));
    let projectRoot = extractDir;

    if (nonHidden.length === 1) {
      const singleEntry = path.join(extractDir, nonHidden[0]);
      const stat = await fs.stat(singleEntry);
      if (stat.isDirectory()) projectRoot = singleEntry;
    }

    const fileTree = await walkDir(projectRoot, projectRoot);
    const entryFile = fileTree.find((f) => f === 'index.html')
      ?? fileTree.find((f) => f.endsWith('/index.html'))
      ?? fileTree.find((f) => f.endsWith('.html'))
      ?? 'index.html';

    setProjectState({ projectRoot, servePath: projectRoot, fileTree, fileCount: fileTree.length, entryFile });
    setAnalysisStatus('analyzing');
    stepDone('extract', `${fileTree.length} files extracted`);

    const notifyEmail = (req.body?.email as string | undefined)?.trim() || null;

    // Respond immediately — analysis runs in background
    res.json({ fileCount: fileTree.length, fileTree, entryFile, status: 'analyzing' });

    try {
      const project = await analyzeProject(projectRoot, fileTree) as any;
      setAnalysisStatus('complete');
      console.log('[upload] Analysis complete');

      if (notifyEmail) {
        await sendAnalysisReady(notifyEmail, project?.name ?? 'your project');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[upload] Analysis failed:', err);
      setAnalysisStatus('error');
      stepError('heuristic', msg.slice(0, 200));
    }
  } catch (err) {
    console.error('[upload] Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

async function walkDir(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkDir(fullPath, root));
    } else {
      results.push(path.relative(root, fullPath));
    }
  }
  return results;
}
