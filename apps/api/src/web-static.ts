import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * SPA fallback (M9b): a GET for an app route (no file extension, not under /api) returns index.html,
 * so React Router handles it. API calls and real asset files fall through.
 */
export function spaFallback(webRoot: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
      // `root` lets express resolve a relative webRoot safely (no "path must be absolute").
      res.sendFile('index.html', { root: webRoot });
    } else {
      next();
    }
  };
}

/** Serve the built web UI from Nest so the desktop shell needs no separate web server (M9b). */
export function registerWebStatic(app: NestExpressApplication, webRoot: string): void {
  app.use(express.static(webRoot, { index: false }));
  app.use(spaFallback(webRoot));
}
