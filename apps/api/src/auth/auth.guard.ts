import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import { IS_PUBLIC } from './public.decorator.js';
import { SESSION_COOKIE, SessionPayload } from './session.js';

const SESSION_EXPIRED = 'Sessiya tugagan. Qaytadan kiring.';

/**
 * Global guard: every route needs a valid session cookie unless marked @Public(). The cookie is signed with JWT_SECRET
 * (a person's login) or, when configured, with ROBOT_SECRET — the desktop robot's own key, so an unattended run does
 * not hang on a person's 12-hour session (M13 §4.2).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly robotSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.robotSecret = config.get('ROBOT_SECRET', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: SessionPayload }>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException(SESSION_EXPIRED);
    request.user = await this.verify(token);
    return true;
  }

  private async verify(token: string): Promise<SessionPayload> {
    try {
      return await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      if (!this.robotSecret) throw new UnauthorizedException(SESSION_EXPIRED);
    }
    try {
      return await this.jwt.verifyAsync<SessionPayload>(token, { secret: this.robotSecret, algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
  }
}
