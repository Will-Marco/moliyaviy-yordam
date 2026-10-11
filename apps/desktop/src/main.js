import { fork } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, shell } from 'electron'

const here = dirname(fileURLToPath(import.meta.url))
const apiEntry = resolve(here, '../../api/dist/server-entry.js')
const webRoot = resolve(here, '../../web/dist')
const migrationsDir = resolve(here, '../../api/prisma/migrations')
const envFile = resolve(here, '../../api/.env')

/** Dev credentials come from apps/api/.env for now; first-run setup is a later M9b slice. */
function readDevEnv() {
  const out = {}
  try {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*(AUTH_USERNAME|AUTH_PASSWORD_HASH|JWT_SECRET)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    /* no .env in a packaged build — first-run setup will provide these */
  }
  return out
}

let api = null

/** Boot the API in a child process (PGlite, ephemeral port) and resolve with its base URL. */
function startApi() {
  return new Promise((ok, fail) => {
    api = fork(apiEntry, [], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: {
        ...readDevEnv(),
        ELECTRON_RUN_AS_NODE: '1',
        DB_DRIVER: 'pglite',
        PGLITE_DATA_DIR: join(app.getPath('userData'), 'db'),
        PGLITE_MIGRATIONS_DIR: migrationsDir,
        WEB_ROOT: webRoot,
        PORT: '0',
        COOKIE_SECURE: 'false',
        TRUST_PROXY: '0',
      },
    })
    api.on('message', (msg) => msg?.type === 'listening' && ok(`http://127.0.0.1:${msg.port}`))
    api.on('error', fail)
    api.on('exit', (code) => code && fail(new Error(`API process exited with code ${code}`)))
  })
}

function createWindow(baseUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Moliyaviy yordam',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  void win.loadURL(baseUrl)
  return win
}

// One running copy per machine.
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

  app.whenReady().then(async () => {
    const baseUrl = await startApi()
    // Keep the app inside its own origin; send any other link to the real browser (hardening before M8).
    app.on('web-contents-created', (_e, contents) => {
      contents.on('will-navigate', (event, url) => {
        if (!url.startsWith(baseUrl)) {
          event.preventDefault()
          void shell.openExternal(url)
        }
      })
      contents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url)
        return { action: 'deny' }
      })
    })
    createWindow(baseUrl)
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow(baseUrl))
  })

  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
  app.on('quit', () => api?.kill())
}
