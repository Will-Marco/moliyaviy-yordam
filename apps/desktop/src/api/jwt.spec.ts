import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mintSessionToken, SESSION_COOKIE, sessionCookie } from './jwt.js'

const SECRET = 'test-secret-0123456789'
const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>

describe('mintSessionToken (M8c §6)', () => {
  it('mints an HS256 token the API can verify', () => {
    const token = mintSessionToken(SECRET, { sub: 'desktop', ttlSec: 900, nowMs: 1_760_000_000_000 })
    const [header, payload, signature] = token.split('.')

    expect(decode(header!)).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(decode(payload!)).toEqual({ sub: 'desktop', iat: 1_760_000_000, exp: 1_760_000_900 })
    expect(signature).toBe(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url'))
  })

  it('stays url-safe: no padding or +/ in any part', () => {
    // A padded or +/-bearing part would be rejected by the API's verifier and break the cookie.
    for (let i = 0; i < 40; i++) {
      const token = mintSessionToken(`secret-${i}`, { sub: 'desktop', ttlSec: 900, nowMs: 1_760_000_000_000 + i })
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    }
  })

  it('signs with the secret: another secret gives another signature', () => {
    const opts = { sub: 'desktop', ttlSec: 900, nowMs: 1_760_000_000_000 } as const
    expect(mintSessionToken(SECRET, opts)).not.toBe(mintSessionToken(`${SECRET}x`, opts))
  })

  it('defaults to a short life and the real clock', () => {
    const before = Math.floor(Date.now() / 1000)
    const { iat, exp } = decode(mintSessionToken(SECRET, { sub: 'desktop' }).split('.')[1]!) as { iat: number; exp: number }
    expect(iat).toBeGreaterThanOrEqual(before)
    expect(exp - iat).toBe(900)
  })

  it('refuses an empty secret rather than signing with nothing', () => {
    expect(() => mintSessionToken('', { sub: 'desktop' })).toThrow(/sir/i)
  })

  it('formats the cookie header the API expects', () => {
    expect(SESSION_COOKIE).toBe('session')
    expect(sessionCookie('abc.def.ghi')).toBe('session=abc.def.ghi')
  })
})
