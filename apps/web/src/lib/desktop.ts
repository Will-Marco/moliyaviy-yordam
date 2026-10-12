/**
 * ERI key status of one firm, as the desktop app reads it from local E-IMZO.
 * Mirrors the bridge contract in apps/desktop/src/bridge/ipc.ts — change both together.
 */
export type EriKey =
  | { status: 'ok' | 'expired' | 'unknown'; org: string | null; title: string | null; validTo: string | null }
  | { status: 'missing' }

/** Saved ERI password per firm: `rejected` — E-IMZO refused it; `key_changed` — the firm got a new key since. */
export type EriPasswordStatus = 'set' | 'missing' | 'rejected' | 'key_changed'

/** `passwords` comes from the app's own encrypted store, so it is there even when E-IMZO is down. */
export type EriKeyReport = { passwords?: Record<string, EriPasswordStatus> } & (
  | { eimzo: 'ok'; keys: Record<string, EriKey> }
  | { eimzo: 'not_running' | 'error'; message: string }
)

/** One step of a Didox run, as the desktop app reports it (apps/desktop/src/didox/contract.ts ProgressEvent). */
export interface DidoxProgress {
  firmTin: string
  step: string
  status: 'running' | 'done' | 'failed'
  message?: string
}

/** Outcome of "Kirishni tekshirish" (apps/desktop/src/didox/run.ts CheckLoginResult); `message` is Uzbek. */
export type DidoxCheckResult = { ok: true } | { ok: false; code: string; message: string; screenshot?: string | null }

/** What the Electron shell exposes as `window.desktop` (apps/desktop/assets/app-preload.cjs). */
export interface DesktopBridge {
  platform: string
  eri: {
    listKeys(tins: string[]): Promise<EriKeyReport>
    /** Encrypted by the OS and kept on this computer only; never readable back. */
    setPassword(tin: string, password: string): Promise<void>
    removePassword(tin: string): Promise<void>
  }
  /** Absent in desktop builds older than M8b. The app logs in to Didox in its own window; it never signs or sends. */
  didox?: {
    checkLogin(tin: string): Promise<DidoxCheckResult>
    cancel(): Promise<void>
    /** Returns the unsubscribe function. */
    onProgress(callback: (progress: DidoxProgress) => void): () => void
  }
  backups: {
    /** `last` — when the newest daily backup was written (ISO), or null. */
    status(): Promise<{ last: string | null }>
    openFolder(): Promise<void>
  }
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

/** The desktop bridge, or null in a plain browser. */
export function useDesktop(): DesktopBridge | null {
  return window.desktop ?? null
}
