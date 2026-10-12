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

/** What the Electron shell exposes as `window.desktop` (apps/desktop/assets/app-preload.cjs). */
export interface DesktopBridge {
  platform: string
  eri: {
    listKeys(tins: string[]): Promise<EriKeyReport>
    /** Encrypted by the OS and kept on this computer only; never readable back. */
    setPassword(tin: string, password: string): Promise<void>
    removePassword(tin: string): Promise<void>
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
