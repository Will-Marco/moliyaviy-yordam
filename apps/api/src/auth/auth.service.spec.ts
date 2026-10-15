import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { ROBOT_TOKEN_TTL_SECONDS, SESSION_TTL_SECONDS } from './session.js';

const JWT_SECRET = 'j'.repeat(32);
const ROBOT_SECRET = 'r'.repeat(32);

function service(robotSecret = ROBOT_SECRET) {
  const config = { get: (key: keyof Env) => (key === 'ROBOT_SECRET' ? robotSecret : undefined) };
  // Same defaults as AuthModule, so the test proves the robot token does not inherit the person's secret or lifetime.
  const jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: SESSION_TTL_SECONDS } });
  return new AuthService(config as unknown as ConfigService<Env, true>, jwt);
}

describe('AuthService.issueRobotToken (M13 P6a)', () => {
  it('signs an HS256 token with ROBOT_SECRET for 180 days', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { token, expiresAt } = await service().issueRobotToken('Buxgalter-PC');

    const payload = await new JwtService().verifyAsync<{ sub: string; install: string; iat: number; exp: number }>(
      token,
      { secret: ROBOT_SECRET, algorithms: ['HS256'] },
    );
    expect(payload).toMatchObject({ sub: 'robot', install: 'Buxgalter-PC' });
    expect(ROBOT_TOKEN_TTL_SECONDS).toBe(180 * 24 * 60 * 60);
    expect(payload.exp - payload.iat).toBe(ROBOT_TOKEN_TTL_SECONDS);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(expiresAt).toBe(new Date(payload.exp * 1000).toISOString());
  });

  it('is not a person session', async () => {
    const { token } = await service().issueRobotToken('Buxgalter-PC');
    await expect(new JwtService({ secret: JWT_SECRET }).verifyAsync(token)).rejects.toThrow();
  });

  it('refuses with 503 when ROBOT_SECRET is not configured', async () => {
    const issuing = service('').issueRobotToken('Buxgalter-PC');
    await expect(issuing).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(issuing).rejects.toThrow('Serverda robot kaliti sozlanmagan');
  });
});
