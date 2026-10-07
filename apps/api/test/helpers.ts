import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const TEST_USERNAME = 'admin';
export const TEST_PASSWORD = 'test-password-123';

/** Business "today" in e2e tests — fixed so results never depend on the real date. */
export const TEST_TODAY = '2026-10-07';

export async function createTestApp({ today = TEST_TODAY } = {}): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(Clock)
    .useValue({ today: () => today })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app as unknown as INestApplication<App>;
}

export async function resetDb(app: INestApplication): Promise<void> {
  await app.get(PrismaService).$executeRawUnsafe('TRUNCATE TABLE companies CASCADE');
}

/** Returns a supertest agent that carries the session cookie. */
export async function loggedInAgent(app: INestApplication<App>) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/api/auth/login')
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
    .expect(200);
  return agent;
}
