import type { RobotTokenStore } from './token-store.js'

/*
 * The robot's key to the shared server (M13 P6b). The scheduled run happens at 06:00 with nobody logged in, so the
 * robot cannot borrow the person's 12-hour session; instead, while a person *is* logged in, main asks the server for
 * a long-lived robot token with that person's session cookie and keeps it encrypted. The page never sees either.
 */

type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>

export type ObtainCode = 'NOT_LOGGED_IN' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'NETWORK' | 'BAD_BODY' | `HTTP_${number}`
export type ObtainResult = { ok: true; token: string; expiresAt: string } | { ok: false; code: ObtainCode; message: string }

const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const TIMEOUT_MS = 15_000
/** Renewed this long before it runs out, so a run in the small hours never finds it just expired. */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000

const REFUSALS: Record<number, { code: ObtainCode; message: string }> = {
  401: { code: 'NOT_LOGGED_IN', message: 'Server sessiyasi tugagan — ilovaga qayta kiring' },
  403: { code: 'FORBIDDEN', message: 'Server robot kalitini bermadi' },
  503: { code: 'NOT_CONFIGURED', message: 'Serverda robot kaliti sozlanmagan (ROBOT_SECRET)' },
}

/** `POST /api/auth/robot-token` with the person's session cookie → `201 { token, expiresAt }`. */
export async function requestRobotToken({
  origin,
  install,
  personSession,
  fetch = globalThis.fetch,
}: {
  origin: string
  install: string
  personSession: string
  fetch?: FetchLike
}): Promise<ObtainResult> {
  let res: Response
  try {
    res = await fetch(`${origin}/api/auth/robot-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `session=${personSession}` },
      body: JSON.stringify({ install }),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, code: 'NETWORK', message: `Server javob bermadi: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!res.ok) return { ok: false, ...(REFUSALS[res.status] ?? { code: `HTTP_${res.status}`, message: `Server xatosi (${res.status})` }) }
  const body = (await res.json().catch(() => null)) as { token?: unknown; expiresAt?: unknown } | null
  const token = body?.token
  const expiresAt = body?.expiresAt
  if (typeof token !== 'string' || !JWT.test(token) || typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) {
    return { ok: false, code: 'BAD_BODY', message: "Server javobini o'qib bo'lmadi" }
  }
  return { ok: true, token, expiresAt }
}

export interface RobotKeyDeps {
  store: Pick<RobotTokenStore, 'get' | 'set' | 'clear'>
  /** Asks the server for a token on behalf of the logged-in person (requestRobotToken, bound to this install). */
  obtain(personSession: string): Promise<ObtainResult>
  /** The person's `session` cookie from the app window, or null while nobody is logged in. */
  personSession(): Promise<string | null>
  nowMs?: () => number
  /** Where a failed renewal is reported; never the token itself. */
  log?: (message: string) => void
}

export function createRobotKey(deps: RobotKeyDeps) {
  const nowMs = deps.nowMs ?? Date.now
  const log = deps.log ?? (() => undefined)
  let inFlight: Promise<boolean> | null = null

  async function renew(): Promise<boolean> {
    const current = await deps.store.get()
    if (current && Date.parse(current.expiresAt) - nowMs() > RENEW_BEFORE_MS) return true
    const person = await deps.personSession()
    if (!person) return !!current
    const result = await deps.obtain(person)
    if (!result.ok) {
      log(`[robot] kalit olinmadi: ${result.code} — ${result.message}`)
      return !!current
    }
    try {
      await deps.store.set(result.token, result.expiresAt)
      return true
    } catch (error) {
      log(`[robot] kalitni saqlab bo'lmadi: ${error instanceof Error ? error.message : String(error)}`)
      return !!current
    }
  }

  /** One renewal at a time: a login, a page load and a run start often arrive together. */
  const ensure = (): Promise<boolean> => {
    inFlight ??= renew()
      .catch(() => false)
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    /** The stored token for the API client, or null (the run then refuses and says to log in again). */
    token: async (): Promise<string | null> => (await deps.store.get())?.token ?? null,
    /** Fetches a token when there is none or it runs out soon — only possible while a person is logged in. */
    ensure,
    /** The server answered 401 to the robot: the token is useless, so drop it and try once to get another. */
    async invalidate(): Promise<void> {
      await deps.store.clear().catch(() => undefined)
      await ensure()
    },
  }
}

export type RobotKey = ReturnType<typeof createRobotKey>
