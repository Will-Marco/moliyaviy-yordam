import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { AuthGuard } from './auth.guard.js';
import { SESSION_COOKIE } from './session.js';

const JWT_SECRET = 'j'.repeat(32);
const ROBOT_SECRET = 'r'.repeat(32);

function guard(robotSecret = '') {
  const config = { get: (key: keyof Env) => (key === 'ROBOT_SECRET' ? robotSecret : undefined) };
  return new AuthGuard(
    new Reflector(),
    new JwtService({ secret: JWT_SECRET }),
    config as unknown as ConfigService<Env, true>,
  );
}

function context(token?: string) {
  const request: { cookies: Record<string, string>; user?: unknown } = {
    cookies: token === undefined ? {} : { [SESSION_COOKIE]: token },
  };
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

const sign = (
  secret: string,
  options: { algorithm?: 'HS256' | 'HS512'; expiresIn?: number } = {},
  payload: object = { sub: 'desktop' },
) => new JwtService({ secret }).signAsync(payload, { expiresIn: 900, ...options });

describe('AuthGuard', () => {
  it('accepts a session signed with JWT_SECRET', async () => {
    const { ctx, request } = context(await sign(JWT_SECRET));
    await expect(guard().canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 'desktop', kind: 'person' });
  });

  it('rejects a missing cookie', async () => {
    await expect(guard(ROBOT_SECRET).canActivate(context().ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('with ROBOT_SECRET unset', () => {
    it('rejects a token signed with any other secret', async () => {
      const { ctx } = context(await sign(ROBOT_SECRET));
      await expect(guard().canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('with ROBOT_SECRET set (M13 §4.2)', () => {
    it('accepts an HS256 token signed with it', async () => {
      const { ctx, request } = context(await sign(ROBOT_SECRET));
      await expect(guard(ROBOT_SECRET).canActivate(ctx)).resolves.toBe(true);
      expect(request.user).toMatchObject({ sub: 'desktop', kind: 'robot' });
    });

    it('still accepts a person\'s JWT_SECRET session', async () => {
      const { ctx, request } = context(await sign(JWT_SECRET));
      await expect(guard(ROBOT_SECRET).canActivate(ctx)).resolves.toBe(true);
      expect(request.user).toMatchObject({ kind: 'person' });
    });

    it('takes the kind from the secret, never from the claims', async () => {
      const { ctx, request } = context(await sign(JWT_SECRET, {}, { sub: 'robot', kind: 'robot' }));
      await expect(guard(ROBOT_SECRET).canActivate(ctx)).resolves.toBe(true);
      expect(request.user).toMatchObject({ sub: 'robot', kind: 'person' });
    });

    it('rejects a robot token that is expired, of another algorithm, or signed with a third secret', async () => {
      for (const token of [
        await sign(ROBOT_SECRET, { expiresIn: -60 }),
        await sign(ROBOT_SECRET, { algorithm: 'HS512' }),
        await sign('x'.repeat(32)),
      ]) {
        const { ctx, request } = context(token);
        await expect(guard(ROBOT_SECRET).canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
        expect(request.user).toBeUndefined();
      }
    });
  });
});
