import express from 'express';
import path from 'path';
import fs from 'fs';
import { getProjectState } from './state.js';

export function previewMiddleware() {
  // Dynamic static file server — recreated when project changes
  let cachedRoot: string | null = null;
  let staticHandler: express.RequestHandler | null = null;

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const state = getProjectState();
    if (!state) {
      res.status(404).send('No project uploaded');
      return;
    }

    // Use servePath (built output) if available, fall back to projectRoot
    const serveRoot = state.servePath || state.projectRoot;

    // Recreate static handler if serve root changed
    if (serveRoot !== cachedRoot) {
      cachedRoot = serveRoot;
      staticHandler = express.static(serveRoot, {
        extensions: ['html'],
        index: 'index.html',
      });
    }

    // Try static file serving first
    staticHandler!(req, res, () => {
      // Fallback: serve index.html for SPA routing (React Router, etc.)
      const indexPath = path.resolve(serveRoot, 'index.html');
      if (fs.existsSync(indexPath)) {
        // Read and send manually to avoid sendFile path resolution issues
        try {
          const html = fs.readFileSync(indexPath, 'utf-8');
          res.type('html').send(html);
        } catch (err) {
          next(err);
        }
        return;
      }
      next();
    });
  };
}
