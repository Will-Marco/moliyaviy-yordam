import { describe, expect, it, vi } from 'vitest'
import { createRobotKey, type ObtainResult, requestRobotToken } from './robot-key.js'
import type { StoredRobotToken } from './token-store.js'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXNrdG9wIn0.c2lnbmF0dXJl'
const NOW = Date.parse('2026-10-15T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('requestRobotToken (contract: POST /api/auth/robot-token)', () => {
  const reply = (status: number, body?: unknown) => {
    const seen: { url: string; init: RequestInit | undefined }[] = []
    const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), init })
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    })
    return { fetch, seen }
  }
  const ask = (fetch: (url: string | URL, init?: RequestInit) => Promise<Response>) =>
    requestRobotToken({ origin: 'https://moliya.example.uz', install: 'BUXGALTER-PC (3f9a1c2e)', personSession: 'person-jwt', fetch })

  it("sends the person's session cookie and this install's name, and reads the token", async () => {
    const { fetch, seen } = reply(201, { token: TOKEN, expiresAt: '2027-04-13T10:00:00.000Z' })

    expect(await ask(fetch)).toEqual({ ok: true, token: TOKEN, expiresAt: '2027-04-13T10:00:00.000Z' })
    expect(seen[0]?.url).toBe('https://moliya.example.uz/api/auth/robot-token')
    expect(seen[0]?.init?.method).toBe('POST')
    const headers = new Headers(seen[0]?.init?.headers)
    expect(headers.get('cookie')).toBe('session=person-jwt')
    expect(headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({ install: 'BUXGALTER-PC (3f9a1c2e)' })
  })

  it('names each refusal the contract defines', async () => {
    expect(await ask(reply(401, { message: 'x' }).fetch)).toMatchObject({ ok: false, code: 'NOT_LOGGED_IN' })
    expect(await ask(reply(403, { message: 'x' }).fetch)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await ask(reply(503, { message: 'x' }).fetch)).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' })
    expect(await ask(reply(404, { message: 'x' }).fetch)).toMatchObject({ ok: false, code: 'HTTP_404' })
  })

  it('refuses an answer that is not a token', async () => {
    expect(await ask(reply(201, { token: 'not-a-jwt', expiresAt: '2027-04-13T10:00:00.000Z' }).fetch)).toMatchObject({ ok: false, code: 'BAD_BODY' })
    expect(await ask(reply(201, { token: TOKEN, expiresAt: 'soon' }).fetch)).toMatchObject({ ok: false, code: 'BAD_BODY' })
  })

  it('reports a server that does not answer', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await ask(fetch)).toMatchObject({ ok: false, code: 'NETWORK' })
  })
})

describe('createRobotKey', () => {
  function setup({ stored = null as StoredRobotToken | null, person = 'person-jwt' as string | null, obtain = undefined as ((s: string) => Promise<ObtainResult>) | undefined } = {}) {
    let current = stored
    const store = {
      get: vi.fn(async () => (current && Date.parse(current.expiresAt) > NOW ? current : null)),
      set: vi.fn(async (token: string, expiresAt: string) => void (current = { token, expiresAt })),
      clear: vi.fn(async () => void (current = null)),
    }
    const obtainFn = vi.fn(obtain ?? (async () => ({ ok: true as const, token: TOKEN, expiresAt: new Date(NOW + 180 * DAY).toISOString() })))
    const personSession = vi.fn(async () => person)
    const key = createRobotKey({ store, obtain: obtainFn, personSession, nowMs: () => NOW })
    return { key, store, obtain: obtainFn, personSession, current: () => current }
  }

  it('fetches a token once a person is logged in, and stores it', async () => {
    const s = setup()

    expect(await s.key.ensure()).toBe(true)
    expect(s.obtain).toHaveBeenCalledWith('person-jwt')
    expect(await s.key.token()).toBe(TOKEN)
  })

  it('does nothing while nobody is logged in — the robot then has no key', async () => {
    const s = setup({ person: null })

    expect(await s.key.ensure()).toBe(false)
    expect(s.obtain).not.toHaveBeenCalled()
    expect(await s.key.token()).toBeNull()
  })

  it('keeps a token that is still good for a while', async () => {
    const s = setup({ stored: { token: TOKEN, expiresAt: new Date(NOW + 100 * DAY).toISOString() } })

    expect(await s.key.ensure()).toBe(true)
    expect(s.obtain).not.toHaveBeenCalled()
  })

  it('renews a token that is close to expiring, while a person session is there to do it', async () => {
    const s = setup({ stored: { token: 'old.token.value', expiresAt: new Date(NOW + 5 * DAY).toISOString() } })

    expect(await s.key.ensure()).toBe(true)
    expect(s.obtain).toHaveBeenCalled()
    expect(await s.key.token()).toBe(TOKEN)
  })

  it('keeps the old token when renewing fails — it still works until it expires', async () => {
    const s = setup({
      stored: { token: 'old.token.value', expiresAt: new Date(NOW + 5 * DAY).toISOString() },
      obtain: async () => ({ ok: false, code: 'NETWORK', message: 'x' }),
    })

    expect(await s.key.ensure()).toBe(true)
    expect(await s.key.token()).toBe('old.token.value')
  })

  it('drops a token the server refused and fetches a new one when it can', async () => {
    const s = setup({ stored: { token: 'refused.token.value', expiresAt: new Date(NOW + 100 * DAY).toISOString() } })

    await s.key.invalidate()

    expect(s.store.clear).toHaveBeenCalled()
    expect(s.obtain).toHaveBeenCalledTimes(1)
    expect(await s.key.token()).toBe(TOKEN)
  })

  it('stays without a token after a refusal when nobody is logged in', async () => {
    const s = setup({ stored: { token: 'refused.token.value', expiresAt: new Date(NOW + 100 * DAY).toISOString() }, person: null })

    await s.key.invalidate()

    expect(await s.key.token()).toBeNull()
  })

  it('asks the server once even when several callers want a token at the same moment', async () => {
    let release: (r: ObtainResult) => void = () => undefined
    const s = setup({ obtain: () => new Promise((ok) => (release = ok)) })

    const both = Promise.all([s.key.ensure(), s.key.ensure()])
    await vi.waitFor(() => expect(s.obtain).toHaveBeenCalled())
    release({ ok: true, token: TOKEN, expiresAt: new Date(NOW + 180 * DAY).toISOString() })

    expect(await both).toEqual([true, true])
    expect(s.obtain).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the store cannot save — the next login tries again', async () => {
    const s = setup()
    s.store.set.mockRejectedValueOnce(new Error("shifrlab bo'lmaydi"))

    expect(await s.key.ensure()).toBe(false)
  })
})
