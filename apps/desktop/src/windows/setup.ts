import { join } from 'node:path'
import { type BrowserWindow, ipcMain } from 'electron'
import { checkServer, isConfigured, parseServerUrl, saveServer } from '../config.js'
import { isFrom, localWindow } from './local.js'

let setupWin: BrowserWindow | null = null
let registered = false

/**
 * First run (M13 §4.2): a local window asks for the server's address — nothing else. The person then logs in on
 * the server's own page; this computer keeps no password of the app.
 */
export function openSetupWindow({ assets, userData, onDone }: { assets: string; userData: string; onDone: () => Promise<void> }): BrowserWindow {
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.focus()
    return setupWin
  }
  register(userData, onDone)
  setupWin = localWindow({ title: 'Moliyaviy yordam — sozlash', width: 460, height: 420, preload: join(assets, 'setup-preload.cjs') })
  setupWin.loadFile(join(assets, 'setup.html')).catch(() => undefined)
  return setupWin
}

export const setupWindow = (): BrowserWindow | null => (setupWin && !setupWin.isDestroyed() ? setupWin : null)

/** Registered once: the setup window can be closed and reopened (macOS `activate`) without re-registering. */
function register(userData: string, onDone: () => Promise<void>): void {
  if (registered) return
  registered = true
  ipcMain.handle('setup:save', async (event, address: unknown) => {
    if (!isFrom(setupWin, event)) throw new Error('Untrusted IPC sender')
    if (typeof address !== 'string' || address.length > 500) return { ok: false, message: 'Server manzilini kiriting' }
    const server = parseServerUrl(address)
    if (!server.ok) return server
    const reachable = await checkServer(server.origin)
    if (!reachable.ok) return reachable
    saveServer(userData, server.origin)
    return { ok: true }
  })
  ipcMain.on('setup:done', (event) => {
    if (!isFrom(setupWin, event) || !isConfigured(userData)) return
    const win = setupWin
    void onDone().finally(() => win?.close())
  })
}
