import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import { timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';
import { SessionPayload } from './session.js';

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
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
