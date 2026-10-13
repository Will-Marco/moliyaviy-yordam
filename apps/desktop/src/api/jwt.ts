import { createHmac } from 'node:crypto'

/** Cookie the API reads the session from (apps/api/src/auth/session.ts). */
export const SESSION_COOKIE = 'session'

/** Short-lived by design: a token only has to outlive the request it is minted for. */
const DEFAULT_TTL_SEC = 900

/** What the API's AuthGuard verifies; `sub` is echoed by `/auth/me`. */
interface SessionPayload {
  sub: string
  iat: number
  exp: number
}

/**
 * Mints the session cookie the desktop app calls its own API with (M8c §6). The app owns the API's `JWT_SECRET`
 * (config.json, this install only), so it signs a token instead of logging in with the accountant's password.
 * HS256 with `node:crypto` — @nestjs/jwt's default algorithm, no dependency on the API package.
 */
export function mintSessionToken(secret: string, opts: { sub: string; ttlSec?: number; nowMs?: number }): string {
  if (!secret) throw new Error('JWT siri yo‘q — sessiya tokenini yasab bo‘lmaydi')
  const iat = Math.floor((opts.nowMs ?? Date.now()) / 1000)
  const payload: SessionPayload = { sub: opts.sub, iat, exp: iat + (opts.ttlSec ?? DEFAULT_TTL_SEC) }
  const signed = `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}`
  return `${signed}.${createHmac('sha256', secret).update(signed).digest('base64url')}`
}

export const sessionCookie = (token: string): string => `${SESSION_COOKIE}=${token}`

const part = (value: object): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
