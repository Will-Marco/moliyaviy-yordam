import { type ChildProcess, fork } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { registerIpc } from './bridge/ipc.js'
import { isSameOrigin } from './bridge/trust.js'
import { type AppConfig, isConfigured, loadConfig, saveCredentials } from './config.js'

const here = dirname(fileURLToPath(import.meta.url))
// Files tsc does not emit (setup page, preloads) live next to dist/ in assets/.
const assets = resolve(here, '../assets')
// Dev: read from the monorepo. Packaged: everything is staged under the app's Resources (see electron-builder.yml).
const res = app.isPackaged ? process.resourcesPath : null
const apiEntry = res ? join(res, 'api/dist/server-entry.js') : resolve(here, '../../api/dist/server-entry.js')
const webRoot = res ? join(res, 'web') : resolve(here, '../../web/dist')
const migrationsDir = res ? join(res, 'migrations') : resolve(here, '../../api/prisma/migrations')
const userData = () => app.getPath('userData')

let api: ChildProcess | null = null
let baseUrl: string | null = null
let appWin: BrowserWindow | null = null
let ipcRegistered = false

/** Boot the API in a child process (PGlite, ephemeral port) with this install's credentials. */
function startApi(config: AppConfig): Promise<string> {
  return new Promise((ok, fail) => {
    const child = fork(apiEntry, [], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        DB_DRIVER: 'pglite',
        PGLITE_DATA_DIR: join(userData(), 'db'),
        PGLITE_MIGRATIONS_DIR: migrationsDir,
        WEB_ROOT: webRoot,
        PORT: '0',
        COOKIE_SECURE: 'false',
        TRUST_PROXY: '0',
        AUTH_USERNAME: config.username,
        AUTH_PASSWORD_HASH: config.passwordHash,
        JWT_SECRET: config.jwtSecret,
      },
    })
    api = child
    child.on('message', (msg: { type?: string; port?: number } | null) => {
      if (msg?.type === 'listening') ok(`http://127.0.0.1:${msg.port}`)
    })
    child.on('error', fail)
    child.on('exit', (code) => code && fail(new Error(`API process exited with code ${code}`)))
  })
}

function appWindow(baseUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Moliyaviy yordam',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(assets, 'app-preload.cjs'),
    },
  })
  // Keep the app inside its own origin (parsed, so `http://host@evil` lookalikes fail); other links go to the browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isSameOrigin(url, new URL(baseUrl).origin)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  void win.loadURL(baseUrl)
  return win
}

async function launchApp(): Promise<void> {
  // macOS `activate` reopens a window after the last one closed: reuse the running API, never start a second one.
  if (!baseUrl) {
    const config = loadConfig(userData())
    if (!config) throw new Error('config.json is missing')
    baseUrl = await startApi(config)
  }
  appWin = appWindow(baseUrl)
  if (!ipcRegistered) {
    registerIpc(() => appWin, new URL(baseUrl).origin)
    ipcRegistered = true
  }
}

/** First run: a local setup window collects the password; no network endpoint is involved. */
function setupWindow(): void {
  const win = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    title: 'Moliyaviy yordam — sozlash',
    webPreferences: { contextIsolation: true, sandbox: true, preload: join(assets, 'setup-preload.cjs') },
  })
  void win.loadFile(join(assets, 'setup.html'))

  ipcMain.handle('setup:save', async (_event, { username, password }: { username: unknown; password: unknown }) => {
    if (typeof username !== 'string' || typeof password !== 'string' || password.length < 8) {
      return { ok: false, message: "Parol kamida 8 belgi bo'lishi kerak" }
    }
    await saveCredentials(userData(), username, password)
    return { ok: true }
  })
  ipcMain.once('setup:done', async () => {
    await launchApp()
    win.close()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => (isConfigured(userData()) ? launchApp() : setupWindow()))
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && (isConfigured(userData()) ? launchApp() : setupWindow()))
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
  app.on('quit', () => api?.kill())
}
