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
  /** E-IMZO only names the firm and the key serial; a slow or hung E-IMZO must not hold the window up. */
  const keysWithin = (tin: string) =>
    Promise.race([readKeys([tin]).catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), NAME_WAIT_MS))])

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
    const key = (await keysWithin(open.tin))?.get(open.tin)
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

  /** Set from the first moment of an open, before anything is awaited, so two requests never make two windows. */
  let opening: { tin: string; closed: Promise<{ saved: boolean }> } | null = null

  async function create(tin: string): Promise<{ saved: boolean }> {
    const keys = await keysWithin(tin)
    const key = keys?.get(tin)
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
    // Closing the window before the page has loaded rejects the load; `closed` above has already answered.
    win.loadFile(join(assets, 'eri-password.html')).catch(() => undefined)
    return open.closed
  }

  return {
    /**
     * Opens the window for `tin`; resolves once it is closed. One window at a time: a request for the same firm waits
     * on the open one, a request for another firm only brings the open one forward and reports nothing saved.
     */
    open(tin: string): Promise<{ saved: boolean }> {
      const busy = current ?? opening
      if (busy) {
        current?.win.focus()
        return busy.tin === tin ? busy.closed : Promise.resolve({ saved: false })
      }
      const closed = create(tin).finally(() => {
        opening = null
      })
      opening = { tin, closed }
      return closed
    },
  }
}

/** How long E-IMZO is waited for: past it the window opens with the STIR alone, and a password is saved untied to a key serial. */
const NAME_WAIT_MS = 3_000
