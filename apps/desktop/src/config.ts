import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * This install's settings (M13 §4.2): which server it is a client of, and who it is. There is no local login any
 * more — the person signs in on the server's own page; the install id only says which computer recorded a Didox flag.
 */
export interface AppConfig {
  /** An https origin, nothing more (no path, no query). */
  serverUrl: string
  /** Random, made once on the first run, kept when the server address is saved again. */
  installId: string
  /** The computer's name at the first run — what other accountants read on a flag this computer recorded. */
  installName: string
}

export type ServerUrlCheck = { ok: true; origin: string } | { ok: false; message: string }

const NOT_HTTPS = "Manzil https:// bilan boshlanishi kerak (masalan, https://moliya.example.uz)"
const NOT_ORIGIN = "Faqat server manzilini kiriting — sahifa yo'li, ? yoki # qismi bo'lmasin"
/** The server's own limit for an install name (apps/api didox-flags/dto/didox-flag.dto.ts). */
const MAX_LABEL = 100
const ID_PREFIX = 8
const CHECK_TIMEOUT_MS = 10_000

/**
 * Accepts `https://host[:port]` (a trailing slash is fine) and nothing else: the IPC trust check compares origins,
 * and the session cookie is Secure, so a plain-http server or one with a path would quietly break both.
 */
export function parseServerUrl(input: string): ServerUrlCheck {
  const raw = input.trim()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, message: NOT_HTTPS }
  }
  if (url.protocol !== 'https:' || !url.hostname) return { ok: false, message: NOT_HTTPS }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || raw.endsWith('?') || raw.endsWith('#')) {
    return { ok: false, message: NOT_ORIGIN }
  }
  return { ok: true, origin: url.origin }
}

type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>

/**
 * Is this the app's server? Its API answers `/api/auth/me` with JSON — 401 before anyone has logged in, 200 after.
 * Anything else (an HTML page, a proxy's plain-text error) means the address points somewhere else.
 */
export async function checkServer(origin: string, fetch: FetchLike = globalThis.fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  let res: Response
  try {
    res = await fetch(`${origin}/api/auth/me`, { redirect: 'manual', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Serverga ulanib bo'lmadi (${cause}). Manzilni va internetni tekshiring.` }
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
  const body: unknown = isJson ? await res.json().catch(() => null) : null
  if ((res.status === 401 || res.status === 200) && body && typeof body === 'object') return { ok: true }
  return { ok: false, message: `Bu manzil Moliyaviy yordam serveriga o'xshamaydi (javob: ${res.status}).` }
}

export const configPath = (userData: string) => join(userData, 'config.json')
/** Where the robot's encrypted server token is kept (robot/token-store.ts). */
export const robotTokenPath = (userData: string) => join(userData, 'robot-token.json')

export function loadConfig(userData: string): AppConfig | null {
  let parsed: Partial<AppConfig> | null
  try {
    parsed = JSON.parse(readFileSync(configPath(userData), 'utf8')) as Partial<AppConfig> | null
  } catch {
    return null
  }
  if (!parsed || typeof parsed.serverUrl !== 'string' || typeof parsed.installId !== 'string' || !parsed.installId) return null
  // The file is ours, but a hand-edited http:// address must not loosen what the window trusts.
  const server = parseServerUrl(parsed.serverUrl)
  if (!server.ok) return null
  return {
    serverUrl: server.origin,
    installId: parsed.installId,
    installName: typeof parsed.installName === 'string' && parsed.installName ? parsed.installName : 'Kompyuter',
  }
}

/** True once a server address has been saved on this computer. A pre-M13 config (local login) does not count. */
export function isConfigured(userData: string): boolean {
  return loadConfig(userData) !== null
}

/** Saves the checked server origin; the install identity is created on the first save and kept after that. */
export function saveServer(
  userData: string,
  origin: string,
  ids: { randomUUID: () => string; hostname: () => string } = { randomUUID, hostname },
): AppConfig {
  const previous = loadConfig(userData)
  const config: AppConfig = {
    serverUrl: origin,
    installId: previous?.installId ?? ids.randomUUID(),
    installName: previous?.installName ?? (ids.hostname().trim() || 'Kompyuter'),
  }
  mkdirSync(dirname(configPath(userData)), { recursive: true })
  // The robot token is a key to the old server: it must not be sent to the new one (security review L5).
  if (previous?.serverUrl !== origin) rmSync(robotTokenPath(userData), { force: true })
  writeFileSync(configPath(userData), JSON.stringify(config, null, 2), { mode: 0o600 })
  return config
}

/**
 * How this install signs what it writes to the server (`createdByInstall`): readable, and still unique when two
 * offices both call their computer "BUXGALTER".
 */
export function installLabel(config: AppConfig): string {
  const suffix = ` (${config.installId.slice(0, ID_PREFIX)})`
  return `${config.installName.slice(0, MAX_LABEL - suffix.length)}${suffix}`
}
