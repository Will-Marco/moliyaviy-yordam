import { fork } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { isConfigured, loadConfig, saveCredentials } from './config.js'

const here = dirname(fileURLToPath(import.meta.url))
const apiEntry = resolve(here, '../../api/dist/server-entry.js')
const webRoot = resolve(here, '../../web/dist')
const migrationsDir = resolve(here, '../../api/prisma/migrations')
const userData = () => app.getPath('userData')

let api = null

/** Boot the API in a child process (PGlite, ephemeral port) with this install's credentials. */
function startApi(config) {
  return new Promise((ok, fail) => {
    api = fork(apiEntry, [], {
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
    api.on('message', (msg) => msg?.type === 'listening' && ok(`http://127.0.0.1:${msg.port}`))
    api.on('error', fail)
    api.on('exit', (code) => code && fail(new Error(`API process exited with code ${code}`)))
  })
}

function appWindow(baseUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Moliyaviy yordam',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  // Keep the app inside its own origin; send any other link to the real browser (hardening before M8).
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(baseUrl)) {
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

async function launchApp() {
  const baseUrl = await startApi(loadConfig(userData()))
  appWindow(baseUrl)
}

/** First run: a local setup window collects the password; no network endpoint is involved. */
function setupWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    title: 'Moliyaviy yordam — sozlash',
    webPreferences: { contextIsolation: true, sandbox: true, preload: join(here, 'setup-preload.js') },
  })
  void win.loadFile(join(here, 'setup.html'))

  ipcMain.handle('setup:save', async (_event, { username, password }) => {
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
