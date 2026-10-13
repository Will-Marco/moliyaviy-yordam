import type { WebSocket as WsWebSocket } from 'ws'

/** One `.pfx` key as E-IMZO lists it; `alias` is parsed by `parseAlias`. */
export interface RawCertificate {
  disk: string
  path: string
  name: string
  alias: string
}

export type EimzoErrorCode = 'EIMZO_NOT_RUNNING' | 'EIMZO_TIMEOUT' | 'EIMZO_ERROR'

/** A failure the UI can explain; `message` is user-facing Uzbek. */
export class EimzoError extends Error {
  constructor(
    readonly code: EimzoErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export interface EimzoClientOptions {
  /** E-IMZO's plain local endpoint, normally `ws://127.0.0.1:64646/service/cryptapi`. */
  url: string
  WebSocket: typeof WsWebSocket
  timeoutMs?: number
}

/*
 * E-IMZO checks which domain is asking (its published API keys are bound to domains) and reads it from the
 * handshake's Origin header. Without one it refuses the key list — status -1022, "Domen null uchun API-kalit
 * yaroqsiz" — even though `version` answers fine. It trusts localhost without an API key, so naming that origin
 * is all the app needs.
 */
const EIMZO_ORIGIN = 'http://localhost'

/**
 * Talks to the local E-IMZO service. Read-only by construction: the only requests it can send are the
 * key list (CONSTITUTION §13 — the app never asks E-IMZO to load a key or sign).
 */
export function createEimzoClient({ url, WebSocket, timeoutMs = 5000 }: EimzoClientOptions) {
  // E-IMZO answers one request per connection, like its official JS client.
  function request<T>(message: object): Promise<T> {
    return new Promise((ok, fail) => {
      const socket = new WebSocket(url, { origin: EIMZO_ORIGIN })
      let settled = false
      // Every outcome ends here exactly once; nothing is thrown from a socket listener (that would hit the main process).
      const settle = (outcome: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        outcome()
        socket.terminate()
      }
      const timer = setTimeout(() => settle(() => fail(new EimzoError('EIMZO_TIMEOUT', 'E-IMZO javob bermadi'))), timeoutMs)
      socket.on('open', () => socket.send(JSON.stringify(message)))
      socket.on('message', (data) => {
        let reply: T
        try {
          reply = JSON.parse(String(data)) as T
        } catch {
          return settle(() => fail(new EimzoError('EIMZO_ERROR', "E-IMZO tushunarsiz javob qaytardi")))
        }
        settle(() => ok(reply))
      })
      socket.on('error', (error: NodeJS.ErrnoException) => {
        const refused = error.code === 'ECONNREFUSED'
        settle(() =>
          fail(
            refused
              ? new EimzoError('EIMZO_NOT_RUNNING', 'E-IMZO ishga tushirilmagan')
              : new EimzoError('EIMZO_ERROR', `E-IMZO bilan aloqa uzildi (${error.code ?? error.message})`),
          ),
        )
      })
      socket.on('close', () => settle(() => fail(new EimzoError('EIMZO_ERROR', 'E-IMZO javob bermasdan ulanishni yopdi'))))
    })
  }

  return {
    async listCertificates(): Promise<RawCertificate[]> {
      const reply = await request<{ success?: boolean; reason?: string; certificates?: RawCertificate[] }>({
        plugin: 'pfx',
        name: 'list_all_certificates',
      })
      if (!reply.success || !Array.isArray(reply.certificates)) {
        throw new EimzoError('EIMZO_ERROR', `E-IMZO kalitlar ro'yxatini bermadi: ${reply.reason ?? "noma'lum sabab"}`)
      }
      return reply.certificates
    },
  }
}
