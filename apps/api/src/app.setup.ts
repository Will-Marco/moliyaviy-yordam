import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { validationPipe } from './common/validation.js';
import type { Env } from './config/env.js';
import { registerWebStatic } from './web-static.js';

/** Shared by main.ts and e2e tests so both run the same HTTP pipeline. */
export function configureApp(app: NestExpressApplication): void {
  app.set('trust proxy', app.get<ConfigService<Env, true>>(ConfigService).get('TRUST_PROXY', { infer: true }));
  app.setGlobalPrefix('api');
  // Invoice imports carry up to 50 small HTML files (FR-1.3).
  app.useBodyParser('json', { limit: '10mb' });
  app.use(cookieParser());
  app.useGlobalPipes(validationPipe);
  // Desktop (M9b): serve the built web UI from here so no separate web server is needed.
  const webRoot = app.get<ConfigService<Env, true>>(ConfigService).get('WEB_ROOT', { infer: true });
  if (webRoot) registerWebStatic(app, webRoot);
  app.enableShutdownHooks();
}
