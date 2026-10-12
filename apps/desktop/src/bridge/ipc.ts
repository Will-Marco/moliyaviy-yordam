import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { type BrowserWindow, ipcMain, type IpcMainInvokeEvent, shell } from 'electron'
import { WebSocket } from 'ws'
import { parseAlias } from '../eimzo/alias.js'
import { createEimzoClient, EimzoError } from '../eimzo/client.js'
import { matchKeys } from '../eimzo/match.js'
import { isTrustedSender } from './trust.js'

const EIMZO_URL = 'ws://127.0.0.1:64646/service/cryptapi'
const TIN = /^\d{9}$/

/**
 * Bridge contract for `window.desktop.eri.listKeys`. Mirrored in apps/web/src/lib/desktop.ts — change both together.
 * No personal certificate data.
 */
export type EriKey =
  | { status: 'ok' | 'expired' | 'unknown'; org: string | null; title: string | null; validTo: string | null }
  | { status: 'missing' }

export type KeyReport =
  | { eimzo: 'ok'; keys: Record<string, EriKey> }
  | { eimzo: 'not_running' | 'error'; message: string }

/** Tashkent wall-clock time in the certificate date form (`yyyy-mm-ddTHH:mm:ss`). */
const tashkentNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).replace(' ', 'T')

const DAILY_BACKUP = /^daily-\d{4}-\d{2}-\d{2}\.tgz$/

/** When the newest daily backup (written by the API's BackupService) was saved; null if none yet. */
async function lastBackup(dir: string): Promise<string | null> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => DAILY_BACKUP.test(n)).sort()
  const newest = names.at(-1)
  return newest ? (await stat(join(dir, newest))).mtime.toISOString() : null
}

/** `getAppWindow` returns the current app window (macOS can recreate it), so the guard follows it. */
export function registerIpc(getAppWindow: () => BrowserWindow | null, origin: string, backupsDir: string): void {
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

  ipcMain.handle('backups:status', guarded(async () => ({ last: await lastBackup(backupsDir) })))
  ipcMain.handle(
    'backups:open-folder',
    guarded(async () => {
      await mkdir(backupsDir, { recursive: true }) // before the first backup the folder may not exist yet
      const error = await shell.openPath(backupsDir)
      if (error) throw new Error(error)
    }),
  )
}
