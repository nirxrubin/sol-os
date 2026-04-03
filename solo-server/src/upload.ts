import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { Parse } from 'unzipper';
import { getWorkspacePath, setProjectState, setAnalysisStatus } from './state.js';
import { analyzeProject } from './analyze/index.js';
import { createProject, updateProject, upsertContentTypes } from './db/client.js';
import { sendAnalysisReady } from './email/client.js';

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
      const writePromises: Promise<void>[] = [];
      const resolvedExtractDir = path.resolve(extractDir);

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

    // Extract notification email and project name from request (optional)
    const notifyEmail = (req.body?.email as string | undefined) ?? null;
    const isLargeProject = fileTree.length > 50;

    // Create DB record
    let dbProjectId: string | null = null;
    try {
      const slug = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9]/g, '-');
      const dbProject = await createProject({ name: slug, slug, projectRoot });
      dbProjectId = dbProject.id;
    } catch (err) {
      // DB unavailable - continue without persistence, don't block upload
      console.warn('DB project creation failed (non-fatal):', err);
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
              id: ct.id,
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
      console.error('Analysis failed:', err);
      setAnalysisStatus('error');
      if (dbProjectId) {
        updateProject(dbProjectId, { status: 'error', build_error: String(err) }).catch(() => {});
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
