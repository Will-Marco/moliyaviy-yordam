import { didoxMessage } from '../didox/contract.js'

/** The slice of `fetch` the client uses, so tests can hand it a fake. */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>

/** Cookie the API reads the session from (apps/api/src/auth/session.ts); the robot token travels in it too. */
export const SESSION_COOKIE = 'session'

export interface Party {
  id: string
  name: string
  tin: string
}

/** One row of `GET /api/invoices` — the shape mirrors InvoiceView (apps/api). */
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

/** One contract's unresolved Didox flags on the server (apps/api didox-flags, the web's `DidoxInvoiceFlags`). */
export interface ServerInvoiceFlags {
  skipped?: { at: string }
  needsCheck?: { runId?: string; code: string; message: string; didoxId?: string; candidateIds?: string[]; at: string; createdByInstall: string }
}

/** What the robot records about an invoice that needs a person (POST …/needs-check); the install is added here. */
export interface NeedsCheckFlag {
  runId: string
  code: string
  message: string
  didoxId?: string
  candidateIds?: string[]
}

/** Flag writes are retried later from the journal, so their failures are data, not exceptions. */
export type FlagWriteResult = { ok: true } | { ok: false; status: number; message: string }

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

/** The server keeps at most this much of a flag (apps/api didox-flags/dto/didox-flag.dto.ts). */
const MAX_MESSAGE = 1000
const MAX_CANDIDATES = 50

/** No robot token: nothing is sent, and the caller sees the same 401 the server would give. */
class NoToken extends Error {}

/** The server answered with a redirect, which is not followed (see `send`). */
class Redirected extends Error {}

/**
 * Talks to the shared server (M13) with the robot's own token as its session cookie — never the person's, whose
 * session ends after 12 hours while a scheduled run starts at 06:00 with nobody there. A 401 tells `onUnauthorized`,
 * so main can drop the token and fetch a new one. `confirmWarnings` is never sent: only a person may confirm (FR-8.5).
 */
export function createApiClient({
  baseUrl,
  token,
  install,
  onUnauthorized = (_refused: string) => undefined,
  fetch = globalThis.fetch,
}: {
  baseUrl: string
  /** The stored robot token, or null when there is none yet. */
  token: () => Promise<string | null>
  /** This install's label, written as `createdByInstall` on the flags it records. */
  install: string
  /** Told which token the server refused (a renewal may already have replaced it). */
  onUnauthorized?: (refused: string) => void
  fetch?: FetchLike
}) {
  const root = `${baseUrl.replace(/\/+$/, '')}/api`

  /*
   * Redirects are never followed (security review M4): the cookie carries a 180-day robot token, and a followed
   * redirect would resend it to wherever the Location points. The server has no reason to redirect its API, so a 3xx
   * is a failure — reported like an unreachable server, which the journal tries again later.
   */
  const send = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const current = await token()
    if (!current) throw new NoToken()
    const res = await fetch(url, { ...init, headers: { ...init.headers, cookie: `${SESSION_COOKIE}=${current}` }, redirect: 'manual' })
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) throw new Redirected()
    if (res.status === 401) onUnauthorized(current)
    return res
  }

  /** GET that must succeed: without its answer there is nothing safe to plan with. */
  async function read<T>(url: string, valid: (body: T) => boolean): Promise<T> {
    let res: Response
    try {
      res = await send(url)
    } catch (error) {
      throw unsent(error)
    }
    if (!res.ok) throw new ApiError(res.status, codeOf(res.status, await body(res)), await messageOf(res))
    const parsed = await json<T>(res)
    if (!parsed || !valid(parsed)) throw new ApiError(res.status, 'BAD_BODY', "Server javobini o'qib bo'lmadi")
    return parsed
  }

  async function write(url: string, init: RequestInit): Promise<FlagWriteResult> {
    let res: Response
    try {
      res = await send(url, init)
    } catch (error) {
      const { status, message } = unsent(error)
      return { ok: false, status, message }
    }
    return res.ok ? { ok: true } : { ok: false, status: res.status, message: await messageOf(res) }
  }

  const flagPath = (month: string, contractId: string) =>
    `${root}/didox-flags/${encodeURIComponent(month)}/${encodeURIComponent(contractId)}/needs-check`

  return {
    /** Throws ApiError: without the month's rows there is nothing to drive Didox with. */
    listInvoices: (month: string): Promise<InvoiceList> =>
      read<InvoiceList>(`${root}/invoices?month=${encodeURIComponent(month)}`, (list) => Array.isArray(list.rows)),

    /** The month's unresolved Didox flags by contract id — skips decide what a run plans (M13 §4.2). Throws ApiError. */
    listFlags: (month: string): Promise<Record<string, ServerInvoiceFlags>> =>
      read<Record<string, ServerInvoiceFlags>>(`${root}/didox-flags?month=${encodeURIComponent(month)}`, (flags) => !Array.isArray(flags)),

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
        const { status, code, message } = unsent(error)
        return { ok: false, status, code, message }
      }
      if (res.ok) {
        const row = await json<InvoiceApiRow>(res)
        // Marked, but the answer was unreadable: the caller must not treat that as a confirmed mark.
        return row ? { ok: true, row } : { ok: false, status: res.status, code: 'BAD_BODY', message: "Server javobini o'qib bo'lmadi" }
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

    /** Puts a needs-check on the server, where every accountant sees it (M13 §4.1); replaces an older one. */
    recordNeedsCheck: (month: string, contractId: string, flag: NeedsCheckFlag): Promise<FlagWriteResult> =>
      write(flagPath(month, contractId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          runId: flag.runId,
          code: flag.code,
          message: (flag.message.trim() || didoxMessage(flag.code)).slice(0, MAX_MESSAGE),
          ...(flag.didoxId ? { didoxId: flag.didoxId } : {}),
          ...(flag.candidateIds?.length ? { candidateIds: flag.candidateIds.slice(0, MAX_CANDIDATES) } : {}),
          createdByInstall: install,
        }),
      }),

    /** The invoice no longer needs a person (its draft was found and marked): the server flag is closed. */
    resolveNeedsCheck: (month: string, contractId: string): Promise<FlagWriteResult> =>
      write(`${flagPath(month, contractId)}/resolve`, { method: 'POST' }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

const noToken = () => new ApiError(401, 'ROBOT_TOKEN_MISSING', didoxMessage('ROBOT_TOKEN_MISSING'))

const network = (error: unknown) =>
  new ApiError(0, 'NETWORK', `Server javob bermadi: ${error instanceof Error ? error.message : String(error)}`)

const redirected = () =>
  new ApiError(0, 'REDIRECT', "Server so'rovni boshqa manzilga yo'naltirdi — robot kaliti u yerga yuborilmadi. Server manzilini tekshiring")

/** Why `send` produced no answer to use: no token, a redirect, or no server. */
const unsent = (error: unknown) => (error instanceof NoToken ? noToken() : error instanceof Redirected ? redirected() : network(error))

const codeOf = (status: number, parsed: Record<string, unknown> | null) =>
  status === 401 ? 'UNAUTHORIZED' : typeof parsed?.code === 'string' ? parsed.code : `HTTP_${status}`

/** Parses a successful body; null when it is not JSON at all (a truncated answer from a dying server). */
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
  return `Server xatosi (${status})`
}
