import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { Parse } from 'unzipper';
import { getWorkspacePath, setProjectState, setAnalysisStatus } from './state.js';
import { analyzeProject } from './analyze/index.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

export const uploadRouter = Router();

uploadRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const workspace = getWorkspacePath();

    // Clear previous workspace
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.mkdir(workspace, { recursive: true });

    // Write zip to temp file then extract
    const zipPath = path.join(workspace, '__upload.zip');
    await fs.writeFile(zipPath, req.file.buffer);

    // Extract zip
    const extractDir = path.join(workspace, '__extracted');
    await fs.mkdir(extractDir, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(Parse())
        .on('entry', async (entry) => {
          const filePath = entry.path as string;
          const type = entry.type as string;

          // Skip junk
          if (
            filePath.startsWith('__MACOSX') ||
            filePath.startsWith('.git/') ||
            filePath.includes('node_modules/') ||
            filePath.startsWith('.DS_Store') ||
            filePath.includes('.DS_Store')
          ) {
            entry.autodrain();
            return;
          }

          const fullPath = path.join(extractDir, filePath);

          if (type === 'Directory') {
            await fs.mkdir(fullPath, { recursive: true });
            entry.autodrain();
          } else {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            const chunks: Buffer[] = [];
            entry.on('data', (chunk: Buffer) => chunks.push(chunk));
            entry.on('end', async () => {
              await fs.writeFile(fullPath, Buffer.concat(chunks));
            });
          }
        })
        .on('close', resolve)
        .on('error', reject);
    });

    // Clean up zip
    await fs.unlink(zipPath);

    // Detect project root: if extracted has single folder, use that
    const entries = await fs.readdir(extractDir);
    const nonHidden = entries.filter((e) => !e.startsWith('.'));
    let projectRoot = extractDir;

    if (nonHidden.length === 1) {
      const singleEntry = path.join(extractDir, nonHidden[0]);
      const stat = await fs.stat(singleEntry);
      if (stat.isDirectory()) {
        projectRoot = singleEntry;
      }
    }

    // Build file tree
    const fileTree = await walkDir(projectRoot, projectRoot);

    // Detect entry file
    const entryFile = fileTree.find((f) => f === 'index.html')
      ?? fileTree.find((f) => f.endsWith('/index.html'))
      ?? fileTree.find((f) => f.endsWith('.html'))
      ?? 'index.html';

    // Save state
    setProjectState({ projectRoot, fileTree, fileCount: fileTree.length, entryFile });
    setAnalysisStatus('analyzing');

    // Respond immediately, run analysis async
    res.json({ fileCount: fileTree.length, fileTree, entryFile, status: 'analyzing' });

    // Run autonomous analysis in background
    try {
      await analyzeProject(projectRoot, fileTree);
      setAnalysisStatus('complete');
      console.log('Analysis complete');
    } catch (err) {
      console.error('Analysis failed:', err);
      setAnalysisStatus('error');
    }
  } catch (err) {
    console.error('Upload failed:', err);
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
