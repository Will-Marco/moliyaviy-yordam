import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, TEST_PASSWORD, TEST_USERNAME } from './helpers.js';

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Mints a session cookie the way the desktop app does (apps/desktop/src/api/jwt.ts), outside this process. */
function mintToken({ sub = 'desktop', ttlSec = 900, alg = 'HS256', secret = process.env.JWT_SECRET! } = {}) {
  const iat = Math.floor(Date.now() / 1000);
  const signed = `${b64({ alg, typ: 'JWT' })}.${b64({ sub, iat, exp: iat + ttlSec })}`;
  const signature = alg === 'none' ? '' : createHmac('sha256', secret).update(signed).digest('base64url');
  return `${signed}.${signature}`;
}

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

  /*
   * M8c §6: the desktop app owns this install's JWT_SECRET and signs its own short-lived cookie instead of
   * logging in with the accountant's password. The guard must accept that token — and only that token.
   */
  describe('a session minted outside the API (desktop, M8c)', () => {
    it('accepts an HS256 cookie signed with this install\'s secret', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `session=${mintToken()}`)
        .expect(200);
      expect(me.body).toEqual({ username: 'desktop' });
      await request(app.getHttpServer()).get('/api/invoices').set('Cookie', `session=${mintToken()}`).expect(200);
    });

    it('rejects alg:none', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `session=${mintToken({ alg: 'none' })}`)
        .expect(401);
    });

    it('rejects another secret', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `session=${mintToken({ secret: `${process.env.JWT_SECRET!}-other` })}`)
        .expect(401);
    });

    it('rejects an expired token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `session=${mintToken({ ttlSec: -60 })}`)
        .expect(401);
    });
  });

  /* M13 §4.2: on the shared server the desktop robot signs its token with ROBOT_SECRET (.env.test sets one). */
  describe('a robot session (ROBOT_SECRET, M13)', () => {
    it('accepts an HS256 cookie signed with ROBOT_SECRET next to a person\'s session', async () => {
      const cookie = `session=${mintToken({ secret: process.env.ROBOT_SECRET! })}`;
      const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body).toEqual({ username: 'desktop' });
      await request(app.getHttpServer()).get('/api/invoices').set('Cookie', `session=${mintToken()}`).expect(200);
    });

    it('rejects an expired robot token and alg:none', async () => {
      const secret = process.env.ROBOT_SECRET!;
      for (const token of [mintToken({ secret, ttlSec: -60 }), mintToken({ secret, alg: 'none' })]) {
        await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `session=${token}`).expect(401);
      }
    });
  });

  /* M13 P6a: the desktop never holds ROBOT_SECRET — after a person logs in, the server issues the robot's token. */
  describe('POST /api/auth/robot-token', () => {
    const ROBOT_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;
    const decode = (token: string) =>
      JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

    it('issues a 180-day robot token to a logged-in person, and that token opens the API', async () => {
      const agent = await loggedInAgent(app);
      const before = Date.now();
      const res = await agent.post('/api/auth/robot-token').send({ install: '  Buxgalter-PC  ' }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'token']);
      const { token, expiresAt } = res.body as { token: string; expiresAt: string };
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()) as { alg: string };
      expect(header.alg).toBe('HS256');
      const payload = decode(token);
      expect(payload).toMatchObject({ sub: 'robot', install: 'Buxgalter-PC' });
      expect(Number(payload.exp) - Number(payload.iat)).toBe(ROBOT_TOKEN_TTL_MS / 1000);
      expect(new Date(expiresAt).toISOString()).toBe(expiresAt);
      expect(Date.parse(expiresAt)).toBe(Number(payload.exp) * 1000);
      expect(Date.parse(expiresAt) - before).toBeGreaterThan(ROBOT_TOKEN_TTL_MS - 60_000);

      await request(app.getHttpServer()).get('/api/invoices').set('Cookie', `session=${token}`).expect(200);
      const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `session=${token}`).expect(200);
      expect(me.body).toEqual({ username: 'robot' });
    });

    it('is signed with ROBOT_SECRET, not JWT_SECRET', async () => {
      const agent = await loggedInAgent(app);
      const { body } = await agent.post('/api/auth/robot-token').send({ install: 'PC' }).expect(201);
      const [header, payload, signature] = (body as { token: string }).token.split('.');
      const hmac = (secret: string) => createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
      expect(signature).toBe(hmac(process.env.ROBOT_SECRET!));
      expect(signature).not.toBe(hmac(process.env.JWT_SECRET!));
    });

    it('refuses a robot session, whether minted or issued here, so a robot token never renews itself', async () => {
      const agent = await loggedInAgent(app);
      const { body } = await agent.post('/api/auth/robot-token').send({ install: 'PC' }).expect(201);
      const minted = mintToken({ sub: 'robot', secret: process.env.ROBOT_SECRET! });
      for (const token of [(body as { token: string }).token, minted]) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/robot-token')
          .set('Cookie', `session=${token}`)
          .send({ install: 'PC' })
          .expect(403);
        expect(res.body.message).toBe('Robot tokeni bilan robot tokeni olinmaydi');
      }
    });

    it('treats a JWT_SECRET token that says sub "robot" as an ordinary person session', async () => {
      const cookie = `session=${mintToken({ sub: 'robot' })}`;
      await request(app.getHttpServer()).get('/api/invoices').set('Cookie', cookie).expect(200);
      // Only the secret makes a robot: this person may still ask for a robot token, as any person may.
      await request(app.getHttpServer())
        .post('/api/auth/robot-token')
        .set('Cookie', cookie)
        .send({ install: 'PC' })
        .expect(201);
    });

    it('needs a session', async () => {
      await request(app.getHttpServer()).post('/api/auth/robot-token').send({ install: 'PC' }).expect(401);
    });

    it('validates install: a trimmed string of 1 to 100 characters', async () => {
      const agent = await loggedInAgent(app);
      for (const body of [{}, { install: '' }, { install: '   ' }, { install: 42 }, { install: 'x'.repeat(101) }]) {
        const res = await agent.post('/api/auth/robot-token').send(body).expect(400);
        expect(res.body.errors).toHaveProperty('install');
      }
      await agent.post('/api/auth/robot-token').send({ install: 'x'.repeat(100) }).expect(201);
      await agent.post('/api/auth/robot-token').send({ install: 'PC', extra: 1 }).expect(400);
    });

    it('answers 503 when the server has no ROBOT_SECRET', async () => {
      const config = app.get(ConfigService);
      const get = config.get.bind(config);
      vi.spyOn(config, 'get').mockImplementation(((key: string, options?: object) =>
        key === 'ROBOT_SECRET' ? '' : get(key as never, options as never)) as typeof config.get);
      const agent = await loggedInAgent(app);
      const res = await agent.post('/api/auth/robot-token').send({ install: 'PC' }).expect(503);
      expect(res.body.message).toBe('Serverda robot kaliti sozlanmagan');
    });
  });
});
