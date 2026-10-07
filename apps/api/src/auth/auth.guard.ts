import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator.js';
import { SESSION_COOKIE, SessionPayload } from './session.js';

const SESSION_EXPIRED = 'Sessiya tugagan. Qaytadan kiring.';

/** Global guard: every route needs a valid session cookie unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: SessionPayload }>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException(SESSION_EXPIRED);
    try {
      request.user = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    return true;
  }
}
