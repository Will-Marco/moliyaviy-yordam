import { type BrowserWindow, ipcMain, type IpcMainInvokeEvent, shell } from 'electron'
import { WebSocket } from 'ws'
import { parseAlias } from '../eimzo/alias.js'
import { createEimzoClient, EimzoError } from '../eimzo/client.js'
import { type KeyStatus, matchKeys } from '../eimzo/match.js'
import type { ProgressEvent } from '../didox/contract.js'
import type { RunJournal, RunSummary } from '../didox/journal.js'
import type { CheckLoginResult, StartDraftsResult } from '../didox/run.js'
import type { EriStore, PasswordStatus } from '../secrets/eri-store.js'
import type { DidoxRequests } from './requests.js'
import { MONTH, TIN } from './requests.js'
import { isTrustedSender } from './trust.js'

const EIMZO_URL = 'ws://127.0.0.1:64646/service/cryptapi'

/**
 * Bridge contract for `window.desktop.eri.listKeys`. Mirrored in apps/web/src/lib/desktop.ts — change both together.
 * No personal certificate data.
 */
export type EriKey =
  | { status: 'ok' | 'expired' | 'unknown'; org: string | null; title: string | null; validTo: string | null }
  | { status: 'missing' }

/** `passwords` is answered even when E-IMZO is down: it comes from the app's own encrypted store. */
export type KeyReport = { passwords: Record<string, PasswordStatus> } & (
  | { eimzo: 'ok'; keys: Record<string, EriKey> }
  | { eimzo: 'not_running' | 'error'; message: string }
)

/** Who this computer is on the shared server (`window.desktop.install`); `label` is what its flags carry. */
export interface InstallInfo {
  id: string
  name: string
  label: string
}

/** Tashkent wall-clock time in the certificate date form (`yyyy-mm-ddTHH:mm:ss`). */
const tashkentNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).replace(' ', 'T')

/** Firm STIR -> the E-IMZO key it would log in with, read live from local E-IMZO (throws EimzoError when it is down). */
export function createKeyReader(): (tins: string[]) => Promise<Map<string, KeyStatus>> {
  const eimzo = createEimzoClient({ url: EIMZO_URL, WebSocket })
  return async (tins) => matchKeys((await eimzo.listCertificates()).map((c) => parseAlias(c.alias)), tins, tashkentNow())
}

/** What the IPC layer reads from the Didox runner (didox/run.ts); starting work goes through `requests`. */
export interface DidoxIpc {
  status(): Promise<RunJournal | null>
  listRuns(opts: { month?: string; limit?: number }): Promise<RunSummary[]>
  getRun(runId: string): Promise<RunJournal | null>
  cancel(): void
}

/** Run ids are built from a timestamp and four hex characters (journal.ts). */
const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{4}$/
const MAX_RUNS_LISTED = 50

/** The runner's `onProgress`: forwards each step to the app window as `didox:progress` (if it is open). */
export function sendProgress(getAppWindow: () => BrowserWindow | null): (e: ProgressEvent) => void {
  return (e) => {
    const win = getAppWindow()
    if (win && !win.isDestroyed()) win.webContents.send('didox:progress', e)
  }
}

export interface IpcOptions {
  /** The current app window (macOS can recreate it), so the guard follows it. */
  getAppWindow: () => BrowserWindow | null
  /** The shared server's origin: the only page the bridge answers. */
  origin: string
  diagnosticsDir: string
  eri: Pick<EriStore, 'status' | 'remove'>
  readKeys: (tins: string[]) => Promise<Map<string, KeyStatus>>
  /** Validated, natively confirmed starts of Didox work (bridge/requests.ts). */
  requests: DidoxRequests
  /** Without it the read-only calls answer empty. */
  didox?: DidoxIpc
  /** Opens the bundled ERI password window for a firm; resolves once it is closed. */
  openPasswordWindow(tin: string): Promise<{ saved: boolean }>
  install: InstallInfo
}

/**
 * The page-callable surface (M13). Nothing here takes or returns a secret: the ERI password is typed in a local
 * window, and every Didox login is confirmed on this computer before it starts (CONSTITUTION §13).
 */
export function registerIpc({ getAppWindow, origin, diagnosticsDir, eri, readKeys, requests, didox, openPasswordWindow, install }: IpcOptions): void {
  const serialOf = (m: KeyStatus | undefined) => (m && m.status !== 'missing' ? m.key.serial : null)

  const guarded =
    <A, R>(handler: (arg: A) => Promise<R>) =>
    (event: IpcMainInvokeEvent, arg: A): Promise<R> => {
      const sender = { senderId: event.sender.id, frameUrl: event.senderFrame?.url ?? '' }
      const appWin = getAppWindow()
      if (!appWin || !isTrustedSender(sender, { webContentsId: appWin.webContents.id, origin })) {
        return Promise.reject(new Error('Untrusted IPC sender'))
      }
      return handler(arg)
    }

  const tinOf = (tin: unknown): string => {
    if (typeof tin !== 'string' || !TIN.test(tin)) throw new Error('Invalid STIR')
    return tin
  }

  ipcMain.handle('app:install', guarded(async (): Promise<InstallInfo> => install))

  ipcMain.handle(
    'eri:list-keys',
    guarded(async (tins: unknown): Promise<KeyReport> => {
      if (!Array.isArray(tins) || tins.length > 1000 || !tins.every((t) => typeof t === 'string' && TIN.test(t))) {
        throw new Error('Invalid STIR list')
      }
      let matched: Map<string, KeyStatus> | null = null
      let failure: Extract<KeyReport, { message: string }> | null = null
      try {
        matched = await readKeys(tins)
      } catch (error) {
        if (!(error instanceof EimzoError)) throw error
        failure = { eimzo: error.code === 'EIMZO_NOT_RUNNING' ? 'not_running' : 'error', message: error.message, passwords: {} }
      }
      const passwords: Record<string, PasswordStatus> = {}
      for (const tin of tins) passwords[tin] = await eri.status(tin, serialOf(matched?.get(tin)))
      if (!matched) return { ...failure!, passwords }
      const keys: Record<string, EriKey> = {}
      for (const [tin, m] of matched) {
        keys[tin] = m.status === 'missing' ? { status: 'missing' } : { status: m.status, org: m.key.org, title: m.key.title, validTo: m.key.validTo }
      }
      return { eimzo: 'ok', keys, passwords }
    }),
  )

  // The page only asks for the window; the password never passes through it (FR-8.2, CONSTITUTION §13).
  ipcMain.handle('eri:open-password-window', guarded(async (tin: unknown) => openPasswordWindow(tinOf(tin))))

  ipcMain.handle(
    'eri:remove-password',
    guarded(async (tin: unknown): Promise<void> => {
      await eri.remove(tinOf(tin))
    }),
  )

  ipcMain.handle('didox:check-login', guarded(async (tin: unknown): Promise<CheckLoginResult> => requests.checkLogin(tin)))
  ipcMain.handle('didox:create-drafts', guarded(async (payload: unknown): Promise<StartDraftsResult> => requests.createDrafts(payload)))
  ipcMain.handle(
    'didox:status',
    guarded(async (): Promise<RunJournal | null> => (didox ? didox.status() : null)),
  )
  ipcMain.handle(
    'didox:list-runs',
    guarded(async (payload: unknown): Promise<RunSummary[]> => {
      const { month, limit } = (payload ?? {}) as { month?: unknown; limit?: unknown }
      if (month !== undefined && (typeof month !== 'string' || !MONTH.test(month))) throw new Error('Invalid month')
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_RUNS_LISTED)) {
        throw new Error('Invalid limit')
      }
      if (!didox) return []
      return didox.listRuns({ ...(month === undefined ? {} : { month }), ...(limit === undefined ? {} : { limit }) })
    }),
  )
  ipcMain.handle(
    'didox:get-run',
    guarded(async (runId: unknown): Promise<RunJournal | null> => {
      if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new Error('Invalid runId')
      return didox ? didox.getRun(runId) : null
    }),
  )
  ipcMain.handle(
    'didox:open-diagnostics',
    guarded(async (): Promise<void> => {
      const error = await shell.openPath(diagnosticsDir)
      if (error) throw new Error(error)
    }),
  )
  ipcMain.handle(
    'didox:cancel',
    guarded(async (): Promise<void> => {
      didox?.cancel()
    }),
  )
}
