import { type BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { WebSocket } from 'ws'
import { parseAlias } from '../eimzo/alias.js'
import { createEimzoClient, EimzoError } from '../eimzo/client.js'
import { matchKeys } from '../eimzo/match.js'
import { isTrustedSender } from './trust.js'

const EIMZO_URL = 'ws://127.0.0.1:64646/service/cryptapi'
const TIN = /^\d{9}$/

/** Key status per firm STIR, as `window.desktop.eri.listKeys` returns it. No personal certificate data. */
export type KeyReport =
  | { eimzo: 'ok'; keys: Record<string, { status: 'ok' | 'expired' | 'missing'; org?: string | null; title?: string | null; validTo?: string | null }> }
  | { eimzo: 'not_running' | 'error'; message: string }

/** Tashkent wall-clock time in the certificate date form (`yyyy-mm-ddTHH:mm:ss`). */
const tashkentNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).replace(' ', 'T')

/** `getAppWindow` returns the current app window (macOS can recreate it), so the guard follows it. */
export function registerIpc(getAppWindow: () => BrowserWindow | null, origin: string): void {
  const eimzo = createEimzoClient({ url: EIMZO_URL, WebSocket })

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

  ipcMain.handle(
    'eri:list-keys',
    guarded(async (tins: unknown): Promise<KeyReport> => {
      if (!Array.isArray(tins) || tins.length > 1000 || !tins.every((t) => typeof t === 'string' && TIN.test(t))) {
        throw new Error('Invalid STIR list')
      }
      try {
        const keys = (await eimzo.listCertificates()).map((c) => parseAlias(c.alias))
        const matched = matchKeys(keys, tins, tashkentNow())
        const report: Extract<KeyReport, { eimzo: 'ok' }>['keys'] = {}
        for (const [tin, m] of matched) {
          report[tin] = m.status === 'missing' ? { status: 'missing' } : { status: m.status, org: m.key.org, title: m.key.title, validTo: m.key.validTo }
        }
        return { eimzo: 'ok', keys: report }
      } catch (error) {
        if (error instanceof EimzoError) {
          return { eimzo: error.code === 'EIMZO_NOT_RUNNING' ? 'not_running' : 'error', message: error.message }
        }
        throw error
      }
    }),
  )
}
