import { type ChildProcess, fork } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { createKeyReader, registerIpc, sendProgress } from './bridge/ipc.js'
import { isSameOrigin } from './bridge/trust.js'
import { type AppConfig, isConfigured, loadConfig, saveCredentials } from './config.js'
import { autotypePreflight, typeEimzoPassword } from './didox/autotype/index.js'
import { createDidoxRunner, type DidoxRunner } from './didox/run.js'
import { login } from './didox/steps/login.js'
import { logout } from './didox/steps/logout.js'
import { openDidoxWindow } from './didox/view.js'
import { createEriStore } from './secrets/eri-store.js'

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
let apiReady: Promise<string> | null = null
let appWin: BrowserWindow | null = null
let setupWin: BrowserWindow | null = null
let ipcRegistered = false
let quitting = false
let didox: DidoxRunner | null = null
/** Set once the quit waited for a Didox run; the second before-quit goes through. */
let quitAfterDidox = false
const QUIT_WAIT_MS = 5_000

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
    let started = false
    child.on('message', (msg: { type?: string; port?: number } | null) => {
      if (msg?.type !== 'listening') return
      started = true
      ok(`http://127.0.0.1:${msg.port}`)
    })
    child.on('error', fail)
    child.on('exit', (code) => {
      if (!started) return fail(new Error(`API process exited with code ${code}`))
      if (quitting) return
      // The window would keep showing a dead app; say so and close instead.
      dialog.showErrorBox('Moliyaviy yordam', "Ilovaning ichki serveri to'xtadi. Dasturni qayta oching.")
      app.quit()
    })
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
  // Nobody would see the run's result: stop driving Didox.
  win.on('closed', () => didox?.cancel())
  void win.loadURL(baseUrl)
  return win
}

async function launchApp(): Promise<void> {
  // One API per app run: macOS `activate` can call this again (even while the first start is still booting).
  apiReady ??= (async () => {
    const config = loadConfig(userData())
    if (!config) throw new Error('config.json is missing')
    return startApi(config)
  })()
  const baseUrl = await apiReady
  if (appWin && !appWin.isDestroyed()) return void appWin.focus()
  appWin = appWindow(baseUrl)
  if (!ipcRegistered) {
    const eri = createEriStore({ file: join(userData(), 'eri-secrets.json'), safeStorage })
    didox = createDidoxRunner({
      listKeys: createKeyReader(),
      eri,
      preflight: autotypePreflight,
      openWindow: ({ signal }) => openDidoxWindow({ diagnosticsDir: join(userData(), 'didox-diagnostics'), signal }),
      login,
      logout,
      typePassword: typeEimzoPassword,
      onProgress: sendProgress(() => appWin),
    })
    registerIpc(() => appWin, new URL(baseUrl).origin, join(userData(), 'backups'), eri, didox)
    ipcRegistered = true
  }
}

/** First run: a local setup window collects the password; no network endpoint is involved. */
function setupWindow(): void {
  if (setupWin && !setupWin.isDestroyed()) return void setupWin.focus()
  registerSetupIpc()
  const win = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    title: 'Moliyaviy yordam — sozlash',
    webPreferences: { contextIsolation: true, sandbox: true, preload: join(assets, 'setup-preload.cjs') },
  })
  void win.loadFile(join(assets, 'setup.html'))
  setupWin = win
}

let setupIpcRegistered = false
/** Registered once: the setup window can be closed and reopened (macOS `activate`) without re-registering. */
function registerSetupIpc(): void {
  if (setupIpcRegistered) return
  setupIpcRegistered = true
  const fromSetup = (event: { sender: { id: number } }) => !!setupWin && !setupWin.isDestroyed() && event.sender.id === setupWin.webContents.id
  ipcMain.handle('setup:save', async (event, { username, password }: { username: unknown; password: unknown }) => {
    if (!fromSetup(event)) throw new Error('Untrusted IPC sender')
    if (typeof username !== 'string' || typeof password !== 'string' || password.length < 8) {
      return { ok: false, message: "Parol kamida 8 belgi bo'lishi kerak" }
    }
    await saveCredentials(userData(), username, password)
    return { ok: true }
  })
  ipcMain.on('setup:done', async (event) => {
    if (!fromSetup(event) || !isConfigured(userData())) return
    const win = setupWin
    await launchApp()
    win?.close()
  })
}

const open = () => (isConfigured(userData()) ? launchApp() : setupWindow())
const fatal = (error: unknown) => {
  dialog.showErrorBox('Moliyaviy yordam', `Ilovani ishga tushirib bo'lmadi: ${error instanceof Error ? error.message : String(error)}`)
  app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Focus the app (or setup) window — never the Didox window, which only the app drives.
  app.on('second-instance', () => {
    const win = [appWin, setupWin].find((w) => w && !w.isDestroyed())
    if (!win) return void Promise.resolve(open()).catch(fatal)
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(open).catch(fatal)
  // The Didox window may still be open; what matters is whether the app window is.
  app.on('activate', () => {
    const shown = [appWin, setupWin].some((w) => w && !w.isDestroyed())
    if (!shown) Promise.resolve(open()).catch(fatal)
  })
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
  app.on('before-quit', (event) => {
    quitting = true
    // Let a running Didox check end cleanly (cancel, clear session, close its window) — at most 5 s.
    if (!didox?.busy() || quitAfterDidox) return
    event.preventDefault()
    quitAfterDidox = true
    didox.cancel()
    const started = Date.now()
    const wait = setInterval(() => {
      if (didox?.busy() && Date.now() - started < QUIT_WAIT_MS) return
      clearInterval(wait)
      app.quit()
    }, 100)
  })
  app.on('quit', () => api?.kill())
}
