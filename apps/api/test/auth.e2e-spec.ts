import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, TEST_PASSWORD, TEST_USERNAME } from './helpers.js';

describe('Auth (FR-1.1)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects protected routes without a session', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    expect(res.body.message).toBe('Sessiya tugagan. Qaytadan kiring.');
    await request(app.getHttpServer()).get('/api/companies').expect(401);
  });

  it('rejects a wrong password with a generic Uzbek message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: TEST_USERNAME, password: 'wrong-password' })
      .expect(401);
    expect(res.body.message).toBe("Login yoki parol noto'g'ri");
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an unknown username with the same message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'someone', password: TEST_PASSWORD })
      .expect(401);
    expect(res.body.message).toBe("Login yoki parol noto'g'ri");
  });

  it('logs in with an httpOnly session cookie and exposes /me', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const agent = await loggedInAgent(app);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toEqual({ username: TEST_USERNAME });
  });

  it('rejects a tampered session cookie', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'session=not-a-valid-token')
      .expect(401);
  });

  it('logs out by clearing the session', async () => {
    const agent = await loggedInAgent(app);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('locks an IP for a minute after 5 failed attempts, with an Uzbek message', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      await request(server).post('/api/auth/login').send({ username: 'x', password: 'y' }).expect(401);
    }
    const res = await request(server)
      .post('/api/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(429);
    expect(res.body.message).toBe("Juda ko'p noto'g'ri urinish. 1 daqiqadan keyin qayta urinib ko'ring.");
  });

  it('does not count successful logins toward the limit', async () => {
    for (let i = 0; i < 8; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
        .expect(200);
    }
  });

  it('keys the limit on the real client IP behind the reverse proxy', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ username: 'x', password: 'y' })
        .expect(401);
    }
    await request(server)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(429);
    await request(server)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.20')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);
  });

  it('validates the login body', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
  });
});
