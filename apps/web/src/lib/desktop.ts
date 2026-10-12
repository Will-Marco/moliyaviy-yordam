/** ERI key status of one firm, as the desktop app reads it from local E-IMZO. */
export type EriKey =
  | { status: 'ok' | 'expired'; org: string | null; title: string | null; validTo: string | null }
  | { status: 'missing' }

export type EriKeyReport =
  | { eimzo: 'ok'; keys: Record<string, EriKey> }
  | { eimzo: 'not_running' | 'error'; message: string }

/** What the Electron shell exposes as `window.desktop` (apps/desktop/assets/app-preload.cjs). */
export interface DesktopBridge {
  platform: string
  eri: {
    listKeys(tins: string[]): Promise<EriKeyReport>
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
