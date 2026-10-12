import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { type BrowserWindow, ipcMain, type IpcMainInvokeEvent, shell } from 'electron'
import { WebSocket } from 'ws'
import { parseAlias } from '../eimzo/alias.js'
import { createEimzoClient, EimzoError } from '../eimzo/client.js'
import { type KeyStatus, matchKeys } from '../eimzo/match.js'
import type { EriStore, PasswordStatus } from '../secrets/eri-store.js'
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

/** `passwords` is answered even when E-IMZO is down: it comes from the app's own encrypted store. */
export type KeyReport = { passwords: Record<string, PasswordStatus> } & (
  | { eimzo: 'ok'; keys: Record<string, EriKey> }
  | { eimzo: 'not_running' | 'error'; message: string }
)

const MAX_PASSWORD = 256

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
export function registerIpc(getAppWindow: () => BrowserWindow | null, origin: string, backupsDir: string, eri: EriStore): void {
  const eimzo = createEimzoClient({ url: EIMZO_URL, WebSocket })
  const readKeys = async (tins: string[]) => matchKeys((await eimzo.listCertificates()).map((c) => parseAlias(c.alias)), tins, tashkentNow())
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

  // The password goes renderer -> main -> OS encryption once; nothing ever sends it back.
  ipcMain.handle(
    'eri:set-password',
    guarded(async (arg: unknown): Promise<void> => {
      const { tin, password } = (arg ?? {}) as { tin?: unknown; password?: unknown }
      if (typeof tin !== 'string' || !TIN.test(tin)) throw new Error('Invalid STIR')
      if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD) throw new Error('Invalid password')
      // Tie the password to the key it unlocks, so a replaced key asks again (null if E-IMZO is not running now).
      const serial = serialOf((await readKeys([tin]).catch(() => null))?.get(tin))
      await eri.set(tin, password, serial)
    }),
  )

  ipcMain.handle(
    'eri:remove-password',
    guarded(async (tin: unknown): Promise<void> => {
      if (typeof tin !== 'string' || !TIN.test(tin)) throw new Error('Invalid STIR')
      await eri.remove(tin)
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
