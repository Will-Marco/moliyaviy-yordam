import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import { timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';
import { ROBOT_TOKEN_TTL_SECONDS, RobotTokenPayload, SessionPayload } from './session.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
  ) {}

  /** Returns a signed session token, or throws the same error for any wrong username/password. */
  async login(username: string, password: string): Promise<string> {
    const expected = this.config.get('AUTH_USERNAME', { infer: true });
    // Always verify the password so timing does not reveal whether the username matched.
    const passwordOk = await verify(this.config.get('AUTH_PASSWORD_HASH', { infer: true }), password);
    if (!sameString(username, expected) || !passwordOk) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }
    const payload: SessionPayload = { sub: expected };
    return this.jwt.signAsync(payload);
  }

  /**
   * The desktop robot's long-lived token (M13 P6a): the server signs it so the desktop never holds ROBOT_SECRET, and
   * it outlives a person's 12-hour session so an unattended run does not stop. There is no revocation list —
   * rotating ROBOT_SECRET invalidates every robot token at once.
   */
  async issueRobotToken(install: string): Promise<{ token: string; expiresAt: string }> {
    const secret = this.config.get('ROBOT_SECRET', { infer: true });
    if (!secret) throw new ServiceUnavailableException('Serverda robot kaliti sozlanmagan');
    const payload: RobotTokenPayload = { sub: 'robot', install };
    const token = await this.jwt.signAsync(payload, {
      secret,
      algorithm: 'HS256',
      expiresIn: ROBOT_TOKEN_TTL_SECONDS,
    });
    // Read exp back from the token so the reported expiry is exactly the one the guard will enforce.
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return { token, expiresAt: new Date(exp * 1000).toISOString() };
  }
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
