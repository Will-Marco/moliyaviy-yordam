import { BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

/**
 * A small window that shows one page bundled with the app (setup, ERI password). It never loads anything from the
 * network and cannot be navigated away, so what it collects goes to main only — never to the server's page.
 */
export function localWindow(opts: {
  title: string
  width: number
  height: number
  preload: string
  parent?: BrowserWindow | null
}): BrowserWindow {
  const parent = opts.parent && !opts.parent.isDestroyed() ? opts.parent : undefined
  const win = new BrowserWindow({
    width: opts.width,
    height: opts.height,
    resizable: false,
    minimizable: false,
    title: opts.title,
    ...(parent ? { parent, modal: true } : {}),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: opts.preload },
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return win
}

/** True when the IPC message comes from `win` itself. */
export const isFrom = (win: BrowserWindow | null, event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  !!win && !win.isDestroyed() && event.sender.id === win.webContents.id
