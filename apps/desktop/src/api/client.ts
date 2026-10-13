import { mintSessionToken, sessionCookie } from './jwt.js'

/** The slice of `fetch` the client uses, so tests can hand it a fake. */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>

export interface Party {
  id: string
  name: string
  tin: string
}

/** One row of `GET /api/invoices` — the app's own API, so the shape mirrors InvoiceView (apps/api). */
export interface InvoiceApiRow {
  contractId: string
  lender: Party
  borrower: Party
  contract: { number: string; signedOn: string }
  lineName: string
  /** The month's interest as the API prints it (`^\d+\.\d{2}$`); the only source of the Didox amount (§1). */
  amount: string
  draft: { amount: string; didoxDocumentId: string | null; draftedAt: string; amountChanged: boolean; source: string } | null
}

export interface InvoiceList {
  month: string | null
  months: string[]
  lenders: Party[]
  rows: InvoiceApiRow[]
}

export interface MarkDraftBody {
  didoxDocumentId: string
  expectedAmount: string
}

export interface ApiWarning {
  code: string
  message: string
}

/** `status: 0` — the API never answered. `code` is the API's own code when it sent one (AMOUNT_CHANGED, …). */
export type MarkDraftResult =
  | { ok: true; row: InvoiceApiRow }
  | { ok: false; status: number; code?: string; warnings?: ApiWarning[]; message: string }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Talks to this install's own API over loopback (M8c §6). Every request carries a freshly minted session cookie, so a
 * long run never fails on an expired token. `confirmWarnings` is never sent: only a person may confirm a warning (FR-8.5).
 */
export function createApiClient({
  baseUrl,
  secret,
  fetch = globalThis.fetch,
  nowMs = Date.now,
}: {
  baseUrl: string
  secret: string
  fetch?: FetchLike
  nowMs?: () => number
}) {
  const root = `${baseUrl.replace(/\/+$/, '')}/api`
  const cookie = () => sessionCookie(mintSessionToken(secret, { sub: 'desktop', nowMs: nowMs() }))

  const send = (url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, headers: { ...init.headers, cookie: cookie() } })

  return {
    /** Throws ApiError: without the month's rows there is nothing to drive Didox with. */
    async listInvoices(month: string): Promise<InvoiceList> {
      let res: Response
      try {
        res = await send(`${root}/invoices?month=${encodeURIComponent(month)}`)
      } catch (error) {
        throw network(error)
      }
      if (!res.ok) throw new ApiError(res.status, codeOf(res.status, await body(res)), await messageOf(res))
      const list = await json<InvoiceList>(res)
      if (!list || !Array.isArray(list.rows)) throw new ApiError(res.status, 'BAD_BODY', "Ichki server javobini o'qib bo'lmadi")
      return list
    },

    /**
     * FR-8.4: marks the invoice with the ID read from Didox and the amount written into it. Failures are returned,
     * not thrown — the journal records each one against the invoice and the run carries on.
     */
    async markDraft(month: string, contractId: string, mark: MarkDraftBody): Promise<MarkDraftResult> {
      const url = `${root}/invoices/${encodeURIComponent(month)}/${encodeURIComponent(contractId)}/draft`
      let res: Response
      try {
        res = await send(url, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...mark, source: 'didox' }),
        })
      } catch (error) {
        const { status, code, message } = network(error)
        return { ok: false, status, code, message }
      }
      if (res.ok) {
        const row = await json<InvoiceApiRow>(res)
        // Marked, but the answer was unreadable: the caller must not treat that as a confirmed mark.
        return row
          ? { ok: true, row }
          : { ok: false, status: res.status, code: 'BAD_BODY', message: "Ichki server javobini o'qib bo'lmadi" }
      }
      const parsed = await body(res)
      const code = typeof parsed?.code === 'string' ? parsed.code : undefined
      const warnings = Array.isArray(parsed?.warnings) ? (parsed.warnings as ApiWarning[]) : undefined
      return {
        ok: false,
        status: res.status,
        ...(code === undefined ? {} : { code }),
        ...(warnings === undefined ? {} : { warnings }),
        message: message(parsed, res.status),
      }
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

const network = (error: unknown) =>
  new ApiError(0, 'NETWORK', `Ilovaning ichki serveri javob bermadi: ${error instanceof Error ? error.message : String(error)}`)

const codeOf = (status: number, parsed: Record<string, unknown> | null) =>
  status === 401 ? 'UNAUTHORIZED' : typeof parsed?.code === 'string' ? parsed.code : `HTTP_${status}`

/** Parses a successful body; null when it is not JSON at all (a truncated answer from a dying API process). */
async function json<T>(res: Response): Promise<T | null> {
  try {
    const parsed: unknown = await res.clone().json()
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}

async function body(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await res.clone().json()
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null // a non-JSON error body still has a status, which is what the caller keys off
  }
}

const messageOf = async (res: Response) => message(await body(res), res.status)

/** Nest sends a validation 400 as an array of messages; the journal shows one line. */
function message(parsed: Record<string, unknown> | null, status: number): string {
  const raw = parsed?.message
  if (Array.isArray(raw)) return raw.map(String).join('; ')
  if (typeof raw === 'string' && raw) return raw
  return `Ichki server xatosi (${status})`
}
