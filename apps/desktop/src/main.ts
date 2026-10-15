import { type ChildProcess, fork } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Notification, powerMonitor, safeStorage, shell, Tray, Menu } from 'electron'
import { createKeyReader, registerIpc, sendProgress } from './bridge/ipc.js'
import { isSameOrigin } from './bridge/trust.js'
import { type AppConfig, isConfigured, loadConfig, saveCredentials } from './config.js'
import { autotypePreflight, typeEimzoPassword } from './didox/autotype/index.js'
import { createApiClient } from './api/client.js'
import { createJournal } from './didox/journal.js'
import { createDidoxRunner, type DidoxRunner } from './didox/run.js'
import { createSkipStore } from './didox/skips.js'
import { login } from './didox/steps/login.js'
import { logout } from './didox/steps/logout.js'
import { openDidoxWindow } from './didox/view.js'
import { createScheduler, type ReadyVerdict, type Scheduler } from './scheduler/scheduler.js'
import { createEriStore } from './secrets/eri-store.js'

const here = dirname(fileURLToPath(import.meta.url))
// Files tsc does not emit (setup page, preloads) live next to dist/ in assets/.
const assets = resolve(here, '../assets')
// Dev: read from the monorepo. Packaged: everything is staged under the app's Resources (see electron-builder.yml).
const res = app.isPackaged ? process.resourcesPath : null
const apiEntry = res ? join(res, 'api/dist/server-entry.js') : resolve(here, '../../api/dist/server-entry.js')
const webRoot = res ? join(res, 'web') : resolve(here, '../../web/dist')
const migrationsDir = res ? join(res, 'migrations') : resolve(here, '../../api/prisma/migrations')
/*
 * macOS backgrounds a window the moment another one covers it, and a backgrounded renderer drops the synthetic
 * keystrokes the Didox form is filled with (c1 gate). Both switches must be set before the app is ready.
 */
/*
 * Windows shows a notification only for an app it can name, and it names it by this id — which must match the one
 * the installer registers (electron-builder's appId). Without it the monthly reminder would be dropped silently.
 */
app.setAppUserModelId('uz.moliyaviyyordam.desktop')

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

const userData = () => app.getPath('userData')

let api: ChildProcess | null = null
let apiReady: Promise<string> | null = null
let appWin: BrowserWindow | null = null
let setupWin: BrowserWindow | null = null
let ipcRegistered = false
let quitting = false
let didox: DidoxRunner | null = null
let tray: Tray | null = null
let scheduler: Scheduler | null = null
/** The month the schedule could not do, shown in the tray until it is done (the notification may not arrive). */
let waitingMonth: string | null = null
/** Set once the quit waited for a Didox run; the second before-quit goes through. */
let quitAfterDidox = false
const QUIT_WAIT_MS = 5_000

/** Boot the API in a child process (PGlite, ephemeral port) with this install's credentials. */
function startApi(config: AppConfig): Promise<string> {
  return new Promise((ok, fail) => {
    const child = fork(apiEntry, [], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: {
        /*
         * The system environment comes along. On Windows a child started with a scrubbed environment has no
         * SystemRoot, TEMP or APPDATA, and Node needs them: without SystemRoot its crypto and DNS fail to load,
         * and PGlite has nowhere to put its temporary files. The settings below are what this install adds.
         */
        ...process.env,
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
    const config = loadConfig(userData())
    if (!config) throw new Error('config.json is missing')
    /*
     * The app talks to its own API over loopback with a short-lived cookie it signs itself (M8c §6), so a draft run
     * reads the very same invoice rows the accountant is looking at. c1 ships with DIDOX_MAX_INVOICES=1: one invoice
     * goes through end to end before a run is allowed to do many.
     */
    const configured = Number.parseInt(process.env.DIDOX_MAX_INVOICES ?? '', 10)
    const drafts = {
      api: createApiClient({ baseUrl, secret: config.jwtSecret }),
      journal: createJournal({ dir: join(userData(), 'didox-runs') }),
      skips: createSkipStore({ file: join(userData(), 'didox-skips.json') }),
      // c2: a run takes the month's invoices; `DIDOX_MAX_INVOICES` caps it for a careful first run.
      ...(Number.isFinite(configured) && configured > 0 ? { maxInvoices: configured } : {}),
    }
    didox = createDidoxRunner({
      listKeys: createKeyReader(),
      eri,
      preflight: autotypePreflight,
      openWindow: ({ signal }) => openDidoxWindow({ diagnosticsDir: join(userData(), 'didox-diagnostics'), signal }),
      login,
      logout,
      typePassword: typeEimzoPassword,
      onProgress: sendProgress(() => appWin),
      drafts,
    })
    registerIpc(() => appWin, new URL(baseUrl).origin, join(userData(), 'backups'), join(userData(), 'didox-diagnostics'), eri, didox)
    ipcRegistered = true
    startSchedule(drafts.journal)
    /*
     * A run that the app died in the middle of is closed now, while nothing else is going on: its interrupted save
     * becomes "needs checking", and any id it had already found is sent to the API again (M8c §2).
     */
    void drafts.journal
      .recoverStaleRuns()
      .then(() => drafts.journal.flushIdFound({ markDraft: drafts.api.markDraft }))
      .then(() => drafts.journal.rotate())
      .catch(() => undefined)
  }
}

/*
 * The monthly schedule (SRS FR-8.10). Everything it needs to know about the computer is asked here; everything it
 * decides lives in scheduler/. A run is only ever started while the accountant is away from the keyboard, because
 * the app types the ERI password on it.
 */

/** No automatic run while someone has touched the keyboard in the last few minutes. */
const IDLE_SECONDS = 180
/**
 * Run failures that say nothing about the month: the app never reached Didox, so the schedule tries again. Anything
 * else — a page that changed, a password Didox refused — is for the accountant, and is not retried behind their back.
 */
const TRANSIENT: ReadySet = new Set(['EIMZO_NOT_RUNNING', 'EIMZO_ERROR', 'ACCESSIBILITY_DENIED', 'KEYBOARD_LAYOUT', 'EIMZO_DIALOG_OPEN', 'PLATFORM_UNSUPPORTED', 'APP_CLOSED', 'RUN_IN_PROGRESS'])
type ReadySet = ReadonlySet<string>

const NOT_READY: Record<Exclude<ReadyVerdict, 'ok'>, string> = {
  busy: 'kompyuterda ish ketyapti',
  locked: 'ekran qulflangan',
  eimzo: 'E-IMZO ishga tushirilmagan',
  permissions: 'ilovaga ruxsatlar berilmagan',
  run_in_progress: 'boshqa ish bajarilmoqda',
}

function startSchedule(journal: ReturnType<typeof createJournal>): void {
  // Dev/gate only: how often the schedule looks. Unset in production, where it follows the morning slots.
  const checkEvery = Number.parseInt(process.env.DIDOX_SCHEDULE_CHECK_MS ?? '', 10)
  scheduler = createScheduler({
    ...(Number.isFinite(checkEvery) && checkEvery >= 5_000 ? { maxWaitMs: checkEvery } : {}),
    attempts: async (month) =>
      (await journal.list({ month, limit: 50 })).map((run) => ({
        startedAt: run.startedAt,
        status: run.status,
        transient: !!run.failure && TRANSIENT.has(run.failure.code),
      })),
    start: async (month) => {
      console.info(`[didox] jadval bo'yicha ishga tushirilmoqda: ${month}`)
      const result = await didox?.createDrafts({ month, lenderIds: 'all', trigger: 'scheduled' })
      if (result?.ok) {
        waitingMonth = null
        refreshTray()
      }
      return !!result?.ok
    },
    ready: async (): Promise<ReadyVerdict> => {
      if (didox?.busy()) return 'run_in_progress'
      const idle = powerMonitor.getSystemIdleState(IDLE_SECONDS)
      if (idle === 'locked') return 'locked'
      if (idle === 'active') return 'busy'
      try {
        await createKeyReader()([])
      } catch {
        return 'eimzo'
      }
      return (await autotypePreflight()) === 'ok' ? 'ok' : 'permissions'
    },
    notify: (month, verdict) => {
      /*
       * The tray is the reliable half of this: macOS refuses notifications from an app it does not know (measured
       * on 2026-10-14 in dev — UNErrorDomain error 1), so the month must also be visible without one.
       */
      waitingMonth = month
      refreshTray()
      if (!Notification.isSupported()) return
      const note = new Notification({
        title: 'Didox qoralamalari kutmoqda',
        body: `${month} oyi uchun qoralamalar yaratilmadi (${NOT_READY[verdict]}). Ilovani ochib "Didox'da qoralama yaratish"ni bosing.`,
      })
      note.on('failed', () => undefined) // the tray already says it; a refused notification is not an error here
      note.show()
    },
  })
  scheduler.start()
  // The moments when a computer that was unavailable becomes available again.
  const wake = () => scheduler?.wake()
  powerMonitor.on('resume', wake)
  powerMonitor.on('unlock-screen', wake)
  powerMonitor.on('user-did-become-active', wake)
}

/** A tray icon, so the app can keep its schedule with no window open (FR-8.10). */
function createTray(): void {
  if (tray) return
  /*
   * macOS tints a template image (black on transparent) to the menu bar; Windows draws the file as it is, and a
   * black glyph on Windows 11's dark taskbar is an icon nobody can see — so Windows gets a white one with a dark
   * outline, which stands out on a light taskbar too.
   */
  tray = new Tray(join(assets, process.platform === 'win32' ? 'trayWin.png' : 'trayTemplate.png'))
  // Windows opens a tray menu on right-click only; a left click there is expected to open the app.
  if (process.platform === 'win32') tray.on('click', () => void open())
  refreshTray()
}

/** The tray says what the app is waiting for; it is the one channel that needs nobody's permission. */
function refreshTray(): void {
  if (!tray) return
  tray.setToolTip(waitingMonth ? `Moliyaviy yordam — ${waitingMonth} Didox qoralamalari kutmoqda` : 'Moliyaviy yordam')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(waitingMonth
        ? [
            { label: `${waitingMonth}: Didox qoralamalari kutmoqda`, enabled: false },
            { label: 'Ochib yaratish', click: () => void open() },
            { type: 'separator' as const },
          ]
        : []),
      { label: 'Ilovani ochish', click: () => void open() },
      { type: 'separator' as const },
      { label: 'Chiqish', click: () => app.quit() },
    ]),
  )
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

  app.whenReady()
    .then(() => {
      createTray()
      /*
       * The schedule can only keep its 06:00 promise if the app is running then, so it starts with the computer
       * and stays in the tray when its window is closed (FR-8.10). Nothing is hidden: the tray icon is the app.
       */
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true })
      return open()
    })
    .catch(fatal)
  // The Didox window may still be open; what matters is whether the app window is.
  app.on('activate', () => {
    const shown = [appWin, setupWin].some((w) => w && !w.isDestroyed())
    if (!shown) Promise.resolve(open()).catch(fatal)
  })
  // Closing the window leaves the app in the tray: a closed window must not cost the month its drafts (FR-8.10).
  app.on('window-all-closed', () => undefined)
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
