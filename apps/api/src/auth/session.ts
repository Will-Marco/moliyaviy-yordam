import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionPayload {
  sub: string;
}

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/' };
}
