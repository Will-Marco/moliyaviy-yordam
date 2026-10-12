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

/**
 * Talks to the local E-IMZO service. Read-only by construction: the only requests it can send are the
 * key list (CONSTITUTION §13 — the app never asks E-IMZO to load a key or sign).
 */
export function createEimzoClient({ url, WebSocket, timeoutMs = 5000 }: EimzoClientOptions) {
  // E-IMZO answers one request per connection, like its official JS client.
  function request<T>(message: object): Promise<T> {
    return new Promise((ok, fail) => {
      const socket = new WebSocket(url)
      const timer = setTimeout(() => {
        socket.terminate()
        fail(new EimzoError('EIMZO_TIMEOUT', "E-IMZO javob bermadi"))
      }, timeoutMs)
      socket.on('open', () => socket.send(JSON.stringify(message)))
      socket.on('message', (data) => {
        clearTimeout(timer)
        ok(JSON.parse(String(data)) as T)
        socket.close()
      })
      socket.on('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        fail(error.code === 'ECONNREFUSED' ? new EimzoError('EIMZO_NOT_RUNNING', "E-IMZO ishga tushirilmagan") : error)
      })
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
