import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { getProjectState } from '../state.js';
import { stripDirectory } from './index.js';

export const stripRouter = Router();

/**
 * POST /api/deploy/strip
 * Strips all data-sol-* attributes from the project source files.
 * Returns { ok, filesModified, projectRoot }
 */
stripRouter.post('/deploy/strip', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(404).json({ ok: false, error: 'No project uploaded' });
    return;
  }

  const target = state.projectRoot;
  try {
    const filesModified = await stripDirectory(target);
    res.json({ ok: true, filesModified, projectRoot: target });
  } catch (err) {
    console.error('[strip] Error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/deploy/plugin
 * Download the Vite plugin source — drop it into any project's plugins folder.
 */
stripRouter.get('/deploy/plugin', async (_req, res) => {
  const pluginPath = new URL('./index.js', import.meta.url).pathname;
  try {
    const code = await fs.readFile(pluginPath, 'utf-8');
    res.type('application/javascript').send(code);
  } catch {
    res.status(404).json({ ok: false, error: 'Plugin not built yet' });
  }
});

/**
 * POST /api/deploy/build
 * Runs: strip → npm run build inside the project root.
 * Returns streaming build logs via SSE.
 */
stripRouter.post('/deploy/build', async (req, res) => {
  const state = getProjectState();
  if (!state) {
    res.status(404).json({ ok: false, error: 'No project uploaded' });
    return;
  }

  const { spawn } = await import('child_process');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (type: string, message: string) => {
    res.write(`data: ${JSON.stringify({ type, message })}\n\n`);
  };

  send('info', 'Stripping data-sol-* attributes...');
  const modified = await stripDirectory(state.projectRoot);
  send('info', `Stripped ${modified} file${modified === 1 ? '' : 's'}`);

  const buildCmd = state.buildCommand || 'npm run build';
  const [cmd, ...args] = buildCmd.split(' ');
  send('info', `Running: ${buildCmd}`);

  const child = spawn(cmd, args, {
    cwd: state.projectRoot,
    env: { ...process.env },
    shell: true,
  });

  child.stdout.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) send('log', line);
    }
  });

  child.stderr.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) send('log', line);
    }
  });

  child.on('close', (code) => {
    if (code === 0) {
      send('complete', `Build complete (exit ${code})`);
    } else {
      send('error', `Build failed (exit ${code})`);
    }
    res.end();
  });

  req.on('close', () => child.kill());
});
