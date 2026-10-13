import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, createApiClient, type FetchLike } from './client.js'

const SECRET = 'install-secret-0123456789'
const BASE = 'http://127.0.0.1:51234'

interface Seen {
  url: string
  method: string
  cookie: string | null
  body: unknown
}

/** Records every request and answers with the queued responses, oldest first. */
function fakeFetch(queue: ({ status: number; body?: unknown; raw?: string } | Error)[]) {
  const seen: Seen[] = []
  const fetch: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers)
    seen.push({
      url: String(url),
      method: init?.method ?? 'GET',
      cookie: headers.get('cookie'),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    const next = queue.shift()
    if (!next) throw new Error(`fake fetch: no response queued for ${String(url)}`)
    if (next instanceof Error) throw next
    const payload = 'raw' in next ? next.raw : next.body === undefined ? null : JSON.stringify(next.body)
    return new Response(payload, { status: next.status, headers: { 'content-type': 'application/json' } })
  }
  return { fetch, seen }
}

/** The API's AuthGuard check, done here so the test fails if the cookie stops being verifiable. */
function verify(cookie: string | null): { sub: string; iat: number; exp: number } {
  expect(cookie).toMatch(/^session=/)
  const [header, payload, signature] = cookie!.slice('session='.length).split('.')
  expect(signature).toBe(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url'))
  expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' })
  return JSON.parse(Buffer.from(payload!, 'base64url').toString())
}

const listBody = {
  month: '2026-09',
  months: ['2026-09', '2026-08'],
  lenders: [{ id: 'l1', name: 'ALFA MCHJ', tin: '301234567' }],
  rows: [
    {
      contractId: 'c1',
      lender: { id: 'l1', name: 'ALFA MCHJ', tin: '301234567' },
      borrower: { id: 'b1', name: 'BETA MCHJ', tin: '302222222' },
      contract: { number: '12/25', signedOn: '2025-12-01' },
      lineName: 'Берилган молиявий ёрдам…',
      amount: '552328.77',
      draft: null,
    },
  ],
}

describe('createApiClient (M8c §6)', () => {
  let now = 1_760_000_000_000

  beforeEach(() => {
    now = 1_760_000_000_000
  })

  const client = (f: FetchLike) => createApiClient({ baseUrl: BASE, secret: SECRET, fetch: f, nowMs: () => now })

  describe('listInvoices', () => {
    it('reads a month with a freshly minted session cookie', async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody }])
      const list = await client(fetch).listInvoices('2026-09')

      expect(seen[0]!.url).toBe(`${BASE}/api/invoices?month=2026-09`)
      expect(seen[0]!.method).toBe('GET')
      expect(verify(seen[0]!.cookie)).toEqual({ sub: 'desktop', iat: 1_760_000_000, exp: 1_760_000_900 })
      expect(list.rows[0]!.amount).toBe('552328.77')
      expect(list.rows[0]!.borrower.tin).toBe('302222222')
      expect(list.rows[0]!.draft).toBeNull()
    })

    it('mints a new token per request — a run outlives one token', async () => {
      const { fetch, seen } = fakeFetch([
        { status: 200, body: listBody },
        { status: 200, body: listBody },
      ])
      const api = client(fetch)
      await api.listInvoices('2026-09')
      now += 1_000_000
      await api.listInvoices('2026-09')

      expect(seen[0]!.cookie).not.toBe(seen[1]!.cookie)
      expect(verify(seen[1]!.cookie).iat).toBe(1_760_001_000)
    })

    it('tolerates a baseUrl with a trailing slash', async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody }])
      await createApiClient({ baseUrl: `${BASE}/`, secret: SECRET, fetch, nowMs: () => now }).listInvoices('2026-09')
      expect(seen[0]!.url).toBe(`${BASE}/api/invoices?month=2026-09`)
    })

    it('throws ApiError on 401 — the run stops rather than guessing', async () => {
      const { fetch } = fakeFetch([{ status: 401, body: { message: 'Sessiya tugagan. Qaytadan kiring.' } }])
      await expect(client(fetch).listInvoices('2026-09')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    })

    it('throws ApiError with status 0 when the API is not answering', async () => {
      const { fetch } = fakeFetch([new TypeError('fetch failed')])
      const error = await client(fetch)
        .listInvoices('2026-09')
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 0, code: 'NETWORK' })
    })

    // Review findings 4-5: a dying API process can answer 200 with half a body; that must not throw a SyntaxError
    // out of the client, whose contract is "throws ApiError" / "failures are returned".
    it('throws ApiError when a 200 body is not readable JSON', async () => {
      const { fetch } = fakeFetch([{ status: 200, raw: '{"rows": [' }])
      const error = await client(fetch)
        .listInvoices('2026-09')
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ code: 'BAD_BODY' })
    })

    it('throws ApiError when a 200 body is JSON but not an invoice list', async () => {
      const { fetch } = fakeFetch([{ status: 200, body: { month: '2026-09' } }])
      await expect(client(fetch).listInvoices('2026-09')).rejects.toMatchObject({ code: 'BAD_BODY' })
    })

    it('throws ApiError on a 500', async () => {
      const { fetch } = fakeFetch([{ status: 500, body: { message: 'Internal' } }])
      await expect(client(fetch).listInvoices('2026-09')).rejects.toMatchObject({ status: 500 })
    })
  })

  describe('markDraft', () => {
    const body = { didoxDocumentId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', expectedAmount: '552328.77' } as const

    it('sends source didox with the amount it put into Didox — and never confirmWarnings', async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody.rows[0] }])
      const result = await client(fetch).markDraft('2026-09', 'c1', body)

      expect(seen[0]!.url).toBe(`${BASE}/api/invoices/2026-09/c1/draft`)
      expect(seen[0]!.method).toBe('PUT')
      expect(seen[0]!.body).toEqual({ ...body, source: 'didox' })
      expect(Object.keys(seen[0]!.body as object)).not.toContain('confirmWarnings')
      verify(seen[0]!.cookie)
      expect(result).toEqual({ ok: true, row: listBody.rows[0] })
    })

    it('reports 409 AMOUNT_CHANGED as data, not an exception', async () => {
      const { fetch } = fakeFetch([
        { status: 409, body: { statusCode: 409, code: 'AMOUNT_CHANGED', message: "Summa o'zgargan: …" } },
      ])
      expect(await client(fetch).markDraft('2026-09', 'c1', body)).toEqual({
        ok: false,
        status: 409,
        code: 'AMOUNT_CHANGED',
        message: "Summa o'zgargan: …",
      })
    })

    it('passes the warning code through on 409 CONFIRMATION_REQUIRED', async () => {
      const { fetch } = fakeFetch([
        {
          status: 409,
          body: {
            statusCode: 409,
            code: 'CONFIRMATION_REQUIRED',
            message: "Ogohlantirishlarni ko'rib chiqing",
            warnings: [{ code: 'POSSIBLE_DUPLICATE', message: "Didox'da ikkita qoralama bo'lishi mumkin" }],
          },
        },
      ])
      const result = await client(fetch).markDraft('2026-09', 'c1', body)
      expect(result).toMatchObject({ ok: false, status: 409, code: 'CONFIRMATION_REQUIRED' })
      expect(result.ok === false && result.warnings).toEqual([
        { code: 'POSSIBLE_DUPLICATE', message: "Didox'da ikkita qoralama bo'lishi mumkin" },
      ])
    })

    it('joins a validation 400 into one message', async () => {
      const { fetch } = fakeFetch([
        { status: 400, body: { statusCode: 400, message: ['Didox ID kiritilmagan', 'Summa noto‘g‘ri'] } },
      ])
      expect(await client(fetch).markDraft('2026-09', 'c1', body)).toEqual({
        ok: false,
        status: 400,
        message: 'Didox ID kiritilmagan; Summa noto‘g‘ri',
      })
    })

    it('does not report a mark as done when the answer is unreadable', async () => {
      const { fetch } = fakeFetch([{ status: 200, raw: 'not json at all' }])
      expect(await client(fetch).markDraft('2026-09', 'c1', body)).toMatchObject({ ok: false, code: 'BAD_BODY' })
    })

    it('reports a dead API as status 0 instead of throwing', async () => {
      const { fetch } = fakeFetch([new TypeError('fetch failed')])
      expect(await client(fetch).markDraft('2026-09', 'c1', body)).toMatchObject({ status: 0, code: 'NETWORK' })
    })

    it('escapes the path parts it is given', async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody.rows[0] }])
      await client(fetch).markDraft('2026-09', 'c 1/..', body)
      expect(seen[0]!.url).toBe(`${BASE}/api/invoices/2026-09/c%201%2F../draft`)
    })
  })
})
