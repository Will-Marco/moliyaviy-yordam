import { join } from 'node:path'
import { type BrowserWindow, ipcMain } from 'electron'
import type { KeyStatus } from '../eimzo/match.js'
import { type EriStore, EriStoreError } from '../secrets/eri-store.js'
import { isFrom, localWindow } from './local.js'

const MAX_PASSWORD = 256

interface Open {
  win: BrowserWindow
  tin: string
  name: string | null
  saved: boolean
  closed: Promise<{ saved: boolean }>
}

/**
 * FR-8.2 under M13 (CONSTITUTION §13): the ERI password is typed into a window bundled with the app, never into the
 * server's page. The page only asks for the window to open (`eri:open-password-window`) and learns, when it closes,
 * whether a password was saved — the password itself goes from this window to main to OS encryption, and nowhere else.
 */
export function createEriPasswordWindows({
  assets,
  parent,
  eri,
  readKeys,
}: {
  assets: string
  parent: () => BrowserWindow | null
  eri: Pick<EriStore, 'set'>
  readKeys: (tins: string[]) => Promise<Map<string, KeyStatus>>
}) {
  let current: Open | null = null
  const fromCurrent = (event: Parameters<typeof isFrom>[1]) => isFrom(current?.win ?? null, event)

  /** The firm as this computer knows it: STIR, and the organisation on its E-IMZO key when E-IMZO answers. */
  ipcMain.handle('eri-window:info', (event) => {
    if (!fromCurrent(event) || !current) throw new Error('Untrusted IPC sender')
    return { tin: current.tin, name: current.name }
  })

  ipcMain.handle('eri-window:save', async (event, password: unknown) => {
    if (!fromCurrent(event) || !current) throw new Error('Untrusted IPC sender')
    if (typeof password !== 'string' || password.length === 0) return { ok: false, message: 'Parolni kiriting' }
    if (password.length > MAX_PASSWORD) return { ok: false, message: 'Parol juda uzun' }
    const open = current
    // Tie the password to the key it unlocks, so a replaced key asks again (null if E-IMZO is not running now).
    const key = (await readKeys([open.tin]).catch(() => null))?.get(open.tin)
    try {
      await eri.set(open.tin, password, key && key.status !== 'missing' ? key.key.serial : null)
    } catch (error) {
      if (error instanceof EriStoreError) return { ok: false, message: error.message }
      throw error
    }
    open.saved = true
    return { ok: true }
  })

  ipcMain.on('eri-window:close', (event) => {
    if (fromCurrent(event)) current?.win.close()
  })

  return {
    /** Opens (or focuses) the window; resolves once it is closed. One at a time — a second request waits on the first. */
    async open(tin: string): Promise<{ saved: boolean }> {
      if (current) {
        current.win.focus()
        return current.closed
      }
      const key = (await readKeys([tin]).catch(() => null))?.get(tin)
      const win = localWindow({
        title: 'ERI paroli',
        width: 440,
        height: 380,
        preload: join(assets, 'eri-password-preload.cjs'),
        parent: parent(),
      })
      let finish: (result: { saved: boolean }) => void = () => undefined
      const open: Open = {
        win,
        tin,
        name: key && key.status !== 'missing' ? key.key.org : null,
        saved: false,
        closed: new Promise((ok) => (finish = ok)),
      }
      current = open
      win.on('closed', () => {
        if (current === open) current = null
        finish({ saved: open.saved })
      })
      void win.loadFile(join(assets, 'eri-password.html'))
      return open.closed
    },
  }
}
