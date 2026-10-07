import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginLimiter } from './login-limiter.js';
import { Public } from './public.decorator.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, SessionPayload, sessionCookieOptions } from './session.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: LoginLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // req.ip honours TRUST_PROXY, so behind nginx this is the client, not the proxy.
    const ip = req.ip ?? 'unknown';
    this.limiter.assertAllowed(ip);
    let token: string;
    try {
      token = await this.auth.login(dto.username, dto.password);
    } catch (error) {
      if (error instanceof UnauthorizedException) this.limiter.recordFailure(ip);
      throw error;
    }
    this.limiter.reset(ip);
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(this.config.get('COOKIE_SECURE', { infer: true })),
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
    return { username: dto.username };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.config.get('COOKIE_SECURE', { infer: true })));
  }

  @Get('me')
  me(@Req() req: Request & { user: SessionPayload }) {
    return { username: req.user.sub };
  }
}
