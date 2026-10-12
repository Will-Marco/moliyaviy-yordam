/**
 * Network rules of the Didox window (FR-8.9, plan v2 M7). Pure, so they are tested without Electron; view.ts applies them.
 */

/** didox.uz itself and its subdomains (api, cdn, …). Parsed, so `didox.uz.evil.com` and `evil-didox.uz` fail. */
const isDidoxHost = (host: string) => host === 'didox.uz' || host.endsWith('.didox.uz')

/**
 * Local E-IMZO: the Didox login page talks to it over wss://127.0.0.1:64443 (or ws://…:64646). No other local
 * service — other signers (localhost:6210, 127.0.0.1:44480) stay blocked.
 */
const EIMZO_PORTS = new Set(['64443', '64646'])

/** Path segments of Didox's sign/send endpoints (didox-flow.md §2b: documents/{id}/sign|tosign|send, offer/sign, …). */
const ACTION_SEGMENT = /^(sign|tosign|send)$/i

export type RequestVerdict = 'allow' | 'blocked_host' | 'blocked_action'

/**
 * Every request of the Didox window passes through this. Conservative on purpose: only Didox hosts and local E-IMZO;
 * third-party CDNs/analytics are blocked until the spike log shows Didox needs one (then add it here, with a test).
 * data:/blob: never leave the machine. Sign/send paths are blocked on any host and for any method — the app never
 * signs or sends, even if a click goes astray.
 */
export function classifyRequest(rawUrl: string): RequestVerdict {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return 'blocked_host'
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return 'allow'
  if (url.username || url.password) return 'blocked_host'
  if (url.pathname.split('/').some((s) => ACTION_SEGMENT.test(s))) return 'blocked_action'
  const host = url.hostname
  if ((url.protocol === 'https:' || url.protocol === 'wss:') && isDidoxHost(host)) return 'allow'
  if (host === '127.0.0.1' && EIMZO_PORTS.has(url.port) && ['wss:', 'ws:', 'https:', 'http:'].includes(url.protocol)) {
    return 'allow'
  }
  return 'blocked_host'
}

export const isAllowedRequest = (url: string): boolean => classifyRequest(url) === 'allow'

/** Top-level pages the window may show: https Didox only, never a sign/send route. */
export function isAllowedNavigation(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' && isDidoxHost(url.hostname) && !url.username && !url.password && classifyRequest(rawUrl) === 'allow'
  } catch {
    return false
  }
}

/** Subframes may also be empty (about:blank, about:srcdoc — widgets build them); otherwise the request rules apply. */
export function isAllowedFrameNavigation(rawUrl: string): boolean {
  if (rawUrl === 'about:blank' || rawUrl === 'about:srcdoc') return true
  return classifyRequest(rawUrl) === 'allow'
}
