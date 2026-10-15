import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, createApiClient, type FetchLike } from './client.js'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXNrdG9wIn0.c2lnbmF0dXJl'
const BASE = 'https://moliya.example.uz'
const INSTALL = 'BUXGALTER-PC (3f9a1c2e)'

interface Seen {
  url: string
  method: string
  cookie: string | null
  body: unknown
  redirect: RequestRedirect | undefined
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
      redirect: init?.redirect,
    })
    const next = queue.shift()
    if (!next) throw new Error(`fake fetch: no response queued for ${String(url)}`)
    if (next instanceof Error) throw next
    const payload = 'raw' in next ? next.raw : next.body === undefined ? null : JSON.stringify(next.body)
    return new Response(payload, { status: next.status, headers: { 'content-type': 'application/json' } })
  }
  return { fetch, seen }
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

describe('createApiClient (M8c §6, M13 P6b)', () => {
  let token: string | null = TOKEN
  let refused: string[] = []

  beforeEach(() => {
    token = TOKEN
    refused = []
  })

  const client = (f: FetchLike) =>
    createApiClient({ baseUrl: BASE, token: async () => token, install: INSTALL, onUnauthorized: (t) => void refused.push(t), fetch: f })

  describe('listInvoices', () => {
    it("reads a month from the server with the robot's token as its session cookie", async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody }])
      const list = await client(fetch).listInvoices('2026-09')

      expect(seen[0]!.url).toBe(`${BASE}/api/invoices?month=2026-09`)
      expect(seen[0]!.method).toBe('GET')
      expect(seen[0]!.cookie).toBe(`session=${TOKEN}`)
      expect(list.rows[0]!.amount).toBe('552328.77')
      expect(list.rows[0]!.borrower.tin).toBe('302222222')
      expect(list.rows[0]!.draft).toBeNull()
    })

    it('reads the token for every request — a renewed token is used straight away', async () => {
      const { fetch, seen } = fakeFetch([
        { status: 200, body: listBody },
        { status: 200, body: listBody },
      ])
      const api = client(fetch)
      await api.listInvoices('2026-09')
      token = 'renewed.robot.token'
      await api.listInvoices('2026-09')

      expect(seen[1]!.cookie).toBe('session=renewed.robot.token')
    })

    it('tolerates a baseUrl with a trailing slash', async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody }])
      await createApiClient({ baseUrl: `${BASE}/`, token: async () => TOKEN, install: INSTALL, fetch }).listInvoices('2026-09')
      expect(seen[0]!.url).toBe(`${BASE}/api/invoices?month=2026-09`)
    })

    it('throws ApiError on 401 and reports the refused token — the run stops rather than guessing', async () => {
      const { fetch } = fakeFetch([{ status: 401, body: { message: 'Sessiya tugagan. Qaytadan kiring.' } }])
      await expect(client(fetch).listInvoices('2026-09')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
      expect(refused).toEqual([TOKEN])
    })

    it('sends nothing without a robot token and asks the person to log in again', async () => {
      const { fetch, seen } = fakeFetch([])
      token = null
      await expect(client(fetch).listInvoices('2026-09')).rejects.toMatchObject({
        status: 401,
        code: 'ROBOT_TOKEN_MISSING',
        message: expect.stringContaining('qayta kiring'),
      })
      expect(seen).toHaveLength(0)
    })

    it('throws ApiError with status 0 when the server is not answering, and names the server', async () => {
      const { fetch } = fakeFetch([new TypeError('fetch failed')])
      const error = await client(fetch)
        .listInvoices('2026-09')
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 0, code: 'NETWORK', message: expect.stringMatching(/^Server javob bermadi/) })
      expect((error as Error).message).not.toMatch(/ichki/i)
    })

    // Review findings 4-5: a dying server can answer 200 with half a body; that must not throw a SyntaxError
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
      expect(seen[0]!.cookie).toBe(`session=${TOKEN}`)
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

    it('reports a dead server as status 0 instead of throwing', async () => {
      const { fetch } = fakeFetch([new TypeError('fetch failed')])
      expect(await client(fetch).markDraft('2026-09', 'c1', body)).toMatchObject({ status: 0, code: 'NETWORK' })
    })

    it('reports a missing robot token as the 401 the journal leaves for later', async () => {
      token = null
      expect(await client(fakeFetch([]).fetch).markDraft('2026-09', 'c1', body)).toMatchObject({
        ok: false,
        status: 401,
        code: 'ROBOT_TOKEN_MISSING',
      })
    })

    it('escapes the path parts it is given', async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody.rows[0] }])
      await client(fetch).markDraft('2026-09', 'c 1/..', body)
      expect(seen[0]!.url).toBe(`${BASE}/api/invoices/2026-09/c%201%2F../draft`)
    })
  })

  describe('Didox flags on the server (M13 §4.1)', () => {
    const C = '0199f1a2-0000-7000-8000-000000000001'

    it("reads the month's flags by contract id", async () => {
      const flags = { [C]: { skipped: { at: '2026-10-01T06:00:00.000Z' } } }
      const { fetch, seen } = fakeFetch([{ status: 200, body: flags }])

      expect(await client(fetch).listFlags('2026-09')).toEqual(flags)
      expect(seen[0]).toMatchObject({ url: `${BASE}/api/didox-flags?month=2026-09`, method: 'GET', cookie: `session=${TOKEN}` })
    })

    it('throws when the flags cannot be read — a run must not plan without the skips', async () => {
      await expect(client(fakeFetch([{ status: 503, body: {} }]).fetch).listFlags('2026-09')).rejects.toBeInstanceOf(ApiError)
      await expect(client(fakeFetch([new TypeError('fetch failed')]).fetch).listFlags('2026-09')).rejects.toMatchObject({ status: 0 })
      await expect(client(fakeFetch([{ status: 200, body: [] }]).fetch).listFlags('2026-09')).rejects.toMatchObject({ code: 'BAD_BODY' })
    })

    it('records a needs-check with the run and this install', async () => {
      const { fetch, seen } = fakeFetch([{ status: 201, body: {} }])

      const result = await client(fetch).recordNeedsCheck('2026-09', C, {
        runId: '2026-10-13T09-00-00.000Z-a1b2',
        code: 'SAVED_ID_AMBIGUOUS',
        message: 'Ikki nomzod',
        candidateIds: ['A', 'B'],
      })

      expect(result).toEqual({ ok: true })
      expect(seen[0]).toMatchObject({ url: `${BASE}/api/didox-flags/2026-09/${C}/needs-check`, method: 'POST' })
      expect(seen[0]!.body).toEqual({
        runId: '2026-10-13T09-00-00.000Z-a1b2',
        code: 'SAVED_ID_AMBIGUOUS',
        message: 'Ikki nomzod',
        candidateIds: ['A', 'B'],
        createdByInstall: INSTALL,
      })
    })

    it('fills an empty message from the code and keeps within the server limits', async () => {
      const { fetch, seen } = fakeFetch([
        { status: 201, body: {} },
        { status: 201, body: {} },
      ])
      const api = client(fetch)
      await api.recordNeedsCheck('2026-09', C, { runId: 'r', code: 'INTERRUPTED_SAVE', message: '  ' })
      await api.recordNeedsCheck('2026-09', C, {
        runId: 'r',
        code: 'SAVE_FAILED',
        message: 'x'.repeat(5000),
        candidateIds: Array.from({ length: 80 }, (_, i) => `id-${i}`),
      })

      expect((seen[0]!.body as { message: string }).message).toMatch(/Saqlash/)
      expect((seen[1]!.body as { message: string }).message).toHaveLength(1000)
      expect((seen[1]!.body as { candidateIds: string[] }).candidateIds).toHaveLength(50)
    })

    it('resolves a needs-check', async () => {
      const { fetch, seen } = fakeFetch([{ status: 204 }])

      expect(await client(fetch).resolveNeedsCheck('2026-09', C)).toEqual({ ok: true })
      expect(seen[0]).toMatchObject({ url: `${BASE}/api/didox-flags/2026-09/${C}/needs-check/resolve`, method: 'POST' })
    })

    it('returns a failed flag write as data, so the journal can try again later', async () => {
      expect(await client(fakeFetch([new TypeError('fetch failed')]).fetch).resolveNeedsCheck('2026-09', C)).toMatchObject({
        ok: false,
        status: 0,
      })
      expect(
        await client(fakeFetch([{ status: 404, body: { message: 'Tekshiruv belgisi topilmadi' } }]).fetch).resolveNeedsCheck('2026-09', C),
      ).toEqual({ ok: false, status: 404, message: 'Tekshiruv belgisi topilmadi' })
      token = null
      expect(
        await client(fakeFetch([]).fetch).recordNeedsCheck('2026-09', C, { runId: 'r', code: 'SAVE_FAILED', message: 'x' }),
      ).toMatchObject({ ok: false, status: 401 })
    })
  })

  // Security review M4: the cookie carries a 180-day token; a redirect must not carry it to another host.
  describe('redirects', () => {
    it('never lets fetch follow a redirect on its own', async () => {
      const { fetch, seen } = fakeFetch([{ status: 200, body: listBody }, { status: 204 }])
      const api = client(fetch)
      await api.listInvoices('2026-09')
      await api.resolveNeedsCheck('2026-09', 'c1')

      expect(seen.map((s) => s.redirect)).toEqual(['manual', 'manual'])
    })

    it('treats a redirected read as a failure that names the cause', async () => {
      const { fetch, seen } = fakeFetch([{ status: 302 }])
      const error = await client(fetch)
        .listInvoices('2026-09')
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 0, code: 'REDIRECT', message: expect.stringContaining("yo'naltirdi") })
      expect(seen).toHaveLength(1)
      expect(refused).toEqual([])
    })

    it('returns a redirected write as a failure the journal retries later', async () => {
      const mark = { didoxId: 'D1', expectedAmount: '1.00' }
      expect(await client(fakeFetch([{ status: 301 }]).fetch).markDraft('2026-09', 'c1', mark)).toMatchObject({
        ok: false,
        status: 0,
        code: 'REDIRECT',
      })
      expect(await client(fakeFetch([{ status: 307 }]).fetch).resolveNeedsCheck('2026-09', 'c1')).toMatchObject({ ok: false, status: 0 })
    })
  })
})
