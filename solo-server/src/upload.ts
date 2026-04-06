import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { createReadStream, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { Parse } from 'unzipper';
import { getWorkspacePath, setProjectState, setAnalysisStatus } from './state.js';
import { analyzeProject } from './analyze/index.js';
import { createProject, updateProject, upsertContentTypes } from './db/client.js';
import { sendAnalysisReady } from './email/client.js';
import { resetProgress, stepStart, stepDone, stepError } from './progress.js';

// Stream zip directly to disk — never buffer in RAM.
// This handles arbitrarily large zips (node_modules included) without OOM.
// The 2 GB limit is a safety cap; actual extracted source will be far smaller
// because node_modules is skipped during extraction.
const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'sol-uploads');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
      cb(null, TEMP_UPLOAD_DIR);
    },
    filename: (_req, _file, cb) => cb(null, `upload-${Date.now()}.zip`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB cap
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

    // Reset progress tracking for this new upload
    resetProgress();
    stepStart('extract', 'Receiving upload…');

    // Clear previous workspace
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.mkdir(workspace, { recursive: true });

    // Zip is already on disk (diskStorage streamed it there)
    const zipPath = req.file.path;

    // Extract zip
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

          // Skip junk — node_modules is the main culprit for huge zips
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

          // Path traversal protection: ensure resolved path stays within extractDir
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
            // Track each file write to avoid race condition on 'close'
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
          try {
            await Promise.all(writePromises);
            resolve();
          } catch (err) {
            reject(err);
          }
        })
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

    // Save state (servePath starts as projectRoot, updated after build)
    setProjectState({ projectRoot, servePath: projectRoot, fileTree, fileCount: fileTree.length, entryFile });
    setAnalysisStatus('analyzing');
    stepDone('extract', `${fileTree.length} files extracted`);

    // Extract notification email and project name from request (optional)
    const notifyEmail = (req.body?.email as string | undefined) ?? 'jaco@techstura.com'; // temp hardcoded for testing
    const isLargeProject = fileTree.length > 50;

    console.log('[upload] req.body:', req.body);
    console.log('[upload] notifyEmail:', notifyEmail);
    console.log('[upload] SUPABASE_URL:', process.env.SUPABASE_URL ? '✓' : 'MISSING');
    console.log('[upload] RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✓' : 'MISSING');

    // Create DB record
    let dbProjectId: string | null = null;
    try {
      const slug = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9]/g, '-');
      console.log('[upload] creating DB project, slug:', slug);
      const dbProject = await createProject({ name: slug, slug, projectRoot });
      dbProjectId = dbProject.id;
      console.log('[upload] DB project created:', dbProjectId);
    } catch (err) {
      console.warn('[upload] DB project creation failed:', err);
    }

    // Respond immediately, run analysis async
    res.json({ fileCount: fileTree.length, fileTree, entryFile, status: 'analyzing', dbProjectId });

    // Run autonomous analysis in background
    try {
      const project = await analyzeProject(projectRoot, fileTree) as any;
      setAnalysisStatus('complete');
      console.log('Analysis complete');

      // Persist manifest + content types to DB
      if (dbProjectId && project) {
        try {
          await updateProject(dbProjectId, {
            name: project.name,
            slug: project.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            status: 'ready',
            framework: project.framework ?? 'unknown',
            serve_path: project.servePath ?? projectRoot,
            manifest: project,
            build_success: project.buildSuccess ?? null,
            build_error: project.buildError ?? null,
          });

          if (project.contentTypes?.length > 0) {
            await upsertContentTypes(dbProjectId, project.contentTypes.map((ct: { id: string; name: string; fields: unknown[]; items: unknown[]; sourceBindings?: { file: string; varName: string } }) => ({
              name: ct.name,
              slug: ct.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
              sourceFile: ct.sourceBindings?.file,
              sourceVar: ct.sourceBindings?.varName,
              fields: ct.fields ?? [],
              items: ct.items ?? [],
            })));
          }
        } catch (err) {
          console.warn('DB persist failed (non-fatal):', err);
        }
      }

      // Send email notification if provided
      if (notifyEmail && (isLargeProject || true)) {
        await sendAnalysisReady(notifyEmail, project?.name ?? 'your project');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Analysis failed:', err);
      setAnalysisStatus('error');
      stepError('heuristic', msg.slice(0, 200));
      if (dbProjectId) {
        updateProject(dbProjectId, { status: 'error', build_error: msg }).catch(() => {});
      }
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
