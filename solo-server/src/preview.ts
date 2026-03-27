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

    // Recreate static handler if project root changed
    if (state.projectRoot !== cachedRoot) {
      cachedRoot = state.projectRoot;
      staticHandler = express.static(state.projectRoot, {
        extensions: ['html'],
        index: 'index.html',
      });
    }

    // Try static file serving first
    staticHandler!(req, res, () => {
      // Fallback: serve index.html for SPA routing
      const indexPath = path.join(state.projectRoot, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
        return;
      }
      next();
    });
  };
}
