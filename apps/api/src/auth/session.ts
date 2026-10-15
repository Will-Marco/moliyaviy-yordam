import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
/**
 * Long enough that months of unattended monthly runs never find the token expired; the desktop gets a fresh one each
 * time a person logs in in its window.
 */
export const ROBOT_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

export interface SessionPayload {
  sub: string;
}

/** What the server signs for the desktop robot (M13 P6a); `install` names the computer it was issued to. */
export interface RobotTokenPayload extends SessionPayload {
  sub: 'robot';
  install: string;
}

/** Which secret verified the cookie: JWT_SECRET (a person) or ROBOT_SECRET (the desktop robot). */
export type SessionKind = 'person' | 'robot';

/** `request.user` once the guard has let the request through. */
export interface SessionUser extends SessionPayload {
  kind: SessionKind;
}

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/' };
}
