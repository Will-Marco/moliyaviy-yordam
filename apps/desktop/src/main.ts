import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, Menu, Notification, powerMonitor, safeStorage, session, shell, Tray } from 'electron'
import { createApiClient } from './api/client.js'
import { type Confirm, guardConfirm } from './bridge/confirm.js'
import { createKeyReader, registerIpc, sendProgress } from './bridge/ipc.js'
import { createDidoxRequests, type DidoxRequests } from './bridge/requests.js'
import { createExternalOpener, isPermissionAllowed, isSameOrigin } from './bridge/trust.js'
import { type AppConfig, installLabel, loadConfig, robotTokenPath } from './config.js'
import { autotypePreflight, typeEimzoPassword } from './didox/autotype/index.js'
import { createJournal } from './didox/journal.js'
import { createDidoxRunner, type DidoxRunner } from './didox/run.js'
import { login } from './didox/steps/login.js'
import { logout } from './didox/steps/logout.js'
import { openDidoxWindow } from './didox/view.js'
import { createRobotKey, type RobotKey, requestRobotToken } from './robot/robot-key.js'
import { createRobotTokenStore } from './robot/token-store.js'
import { monthToBill } from './scheduler/next-run.js'
import { createScheduler, type ReadyVerdict, type Scheduler } from './scheduler/scheduler.js'
import { createEriStore } from './secrets/eri-store.js'
import { createEriPasswordWindows } from './windows/eri-password.js'
import { openSetupWindow, setupWindow } from './windows/setup.js'

const here = dirname(fileURLToPath(import.meta.url))
// Files tsc does not emit (local pages, preloads, tray icons) live next to dist/ in assets/.
const assets = resolve(here, '../assets')
/*
 * Windows shows a notification only for an app it can name, and it names it by this id — which must match the one
 * the installer registers (electron-builder's appId). Without it the monthly reminder would be dropped silently.
 */
app.setAppUserModelId('uz.moliyaviyyordam.desktop')
/*
 * macOS backgrounds a window the moment another one covers it, and a backgrounded renderer drops the synthetic
 * keystrokes the Didox form is filled with (c1 gate). Both switches must be set before the app is ready.
 */
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

const userData = () => app.getPath('userData')

let appWin: BrowserWindow | null = null
let didox: DidoxRunner | null = null
let requests: DidoxRequests | null = null
let robotKey: RobotKey | null = null
let tray: Tray | null = null
let scheduler: Scheduler | null = null
/** The month the schedule could not do, shown in the tray until it is done (the notification may not arrive). */
let waitingMonth: string | null = null
/** Set once the quit waited for a Didox run; the second before-quit goes through. */
let quitAfterDidox = false
const QUIT_WAIT_MS = 5_000
/** Cookie the server keeps a person's login in (apps/api/src/auth/session.ts). */
const SESSION_COOKIE = 'session'

const alive = (win: BrowserWindow | null): win is BrowserWindow => !!win && !win.isDestroyed()

/*
 * M13: the app window shows the shared server — its own login page first. The desktop no longer runs an API or keeps
 * a database; what stays on this computer is what belongs to it: E-IMZO, the ERI passwords, the Didox window, and the
 * robot's journal and screenshots (FR-8.7).
 */
function appWindow(origin: string, onLoad: () => void): BrowserWindow {
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
  // Only web links reach the browser, one per 2 s: the page is from the internet, other schemes can start programs.
  const openOutside = createExternalOpener({ open: (url) => void shell.openExternal(url).catch(() => undefined) })
  /*
   * Keep the window on the server's origin (parsed, so `https://host@evil` lookalikes fail); other links of the page
   * itself go to the browser. A frame inside the page is only blocked: the web app has none of its own.
   */
  const keepOnOrigin = (event: { preventDefault(): void }, url: string, isMainFrame: boolean) => {
    if (isSameOrigin(url, origin)) return
    event.preventDefault()
    if (isMainFrame) openOutside(url)
  }
  win.webContents.on('will-navigate', (event, url) => keepOnOrigin(event, url, true))
  // will-navigate covers the main frame only; iframes navigate through this one (security review M3a).
  win.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame) keepOnOrigin(event, event.url, false)
  })
  // A server-side redirect is not a navigation the events above see: an origin URL could 302 the window elsewhere.
  win.webContents.on('will-redirect', (event) => keepOnOrigin(event, event.url, event.isMainFrame))
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-finish-load', onLoad)
  /*
   * Server down (M13 §7.1: accepted, the app then does not work): Chromium shows its error page and the window tries
   * the server again every so often, so the app comes back by itself when the server does.
   */
  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === ABORTED) return
    setTimeout(() => {
      if (!win.isDestroyed()) win.loadURL(origin).catch(() => undefined)
    }, RELOAD_AFTER_FAIL_MS)
  })
  // Nobody would see the run's result: stop driving Didox.
  win.on('closed', () => didox?.cancel())
  // A failed load is handled by did-fail-load above; the rejection itself says nothing more.
  win.loadURL(origin).catch(() => undefined)
  return win
}

/** Chromium's ERR_ABORTED: a navigation replaced by another one, not a failure. */
const ABORTED = -3
const RELOAD_AFTER_FAIL_MS = 15_000

/** The person's server session, read in main only: the robot asks for its own key with it (M13 P6b). */
async function personSession(origin: string): Promise<string | null> {
  const [cookie] = await session.defaultSession.cookies.get({ url: origin, name: SESSION_COOKIE })
  return cookie?.value || null
}

/**
 * Native and on this computer: the page can ask for a Didox login, only the person can say yes (CONSTITUTION §13).
 * Guarded, so a page can neither stack these dialogs nor get a yes from a click that was aimed at the page.
 */
const confirm: Confirm = guardConfirm(async ({ message, detail, button = 'Boshlash' }) => {
  const options = {
    type: 'question' as const,
    title: 'Moliyaviy yordam',
    buttons: [button, 'Bekor qilish'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    message,
    detail,
  }
  const { response } = alive(appWin) ? await dialog.showMessageBox(appWin, options) : await dialog.showMessageBox(options)
  return response === 0
})

async function launchApp(): Promise<void> {
  const config = loadConfig(userData())
  if (!config) return void openSetup()
  if (alive(appWin)) return void appWin.focus()
  const robot = wire(config)
  appWin = appWindow(config.serverUrl, () => void robot.ensure())
}

/** Everything the app window talks to, built once per app run (macOS `activate` can open the window again). */
function wire(config: AppConfig): RobotKey {
  if (robotKey) return robotKey
  const origin = config.serverUrl
  const label = installLabel(config)
  const eri = createEriStore({ file: join(userData(), 'eri-secrets.json'), safeStorage })
  const readKeys = createKeyReader()

  const robot = createRobotKey({
    store: createRobotTokenStore({ file: robotTokenPath(userData()), origin, safeStorage }),
    obtain: (person) => requestRobotToken({ origin, install: label, personSession: person }),
    personSession: () => personSession(origin),
    log: (message) => console.warn(message),
  })
  robotKey = robot
  // Without handlers Electron grants every permission a page asks for; the app window's page is from the internet.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, grant, details) =>
    grant(isPermissionAllowed(permission, details.requestingUrl, origin)),
  )
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => isPermissionAllowed(permission, requestingOrigin, origin))
  // A login sets the server's session cookie: that is the moment the robot can get (or renew) its key.
  session.defaultSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (!removed && cookie.name === SESSION_COOKIE) void robot.ensure()
  })

  const api = createApiClient({ baseUrl: origin, token: robot.token, install: label, onUnauthorized: (refused) => void robot.invalidate(refused) })
  /*
   * c1 shipped with DIDOX_MAX_INVOICES=1: one invoice went through end to end before a run was allowed to do many.
   * It stays as a cap for a careful first run on a new computer.
   */
  const configured = Number.parseInt(process.env.DIDOX_MAX_INVOICES ?? '', 10)
  const drafts = {
    api,
    journal: createJournal({ dir: join(userData(), 'didox-runs') }),
    ...(Number.isFinite(configured) && configured > 0 ? { maxInvoices: configured } : {}),
  }
  const runner = createDidoxRunner({
    listKeys: readKeys,
    eri,
    preflight: autotypePreflight,
    openWindow: ({ signal }) => openDidoxWindow({ diagnosticsDir: join(userData(), 'didox-diagnostics'), signal }),
    login,
    logout,
    typePassword: typeEimzoPassword,
    onProgress: sendProgress(() => appWin),
    drafts,
  })
  didox = runner
  requests = createDidoxRequests({
    confirm,
    didox: {
      checkLogin: (tin) => runner.checkLogin(tin),
      createDrafts: async (opts) => {
        const result = await runner.createDrafts(opts)
        if (result.ok && waitingMonth === opts.month) {
          waitingMonth = null
          refreshTray()
        }
        return result
      },
    },
    prepareRobot: () => robot.ensure(),
    removePassword: (tin) => eri.remove(tin),
    firmNames: async (tins) => {
      const names = new Map<string, string>()
      for (const [tin, key] of await readKeys(tins)) if (key.status !== 'missing' && key.key.org) names.set(tin, key.key.org)
      return names
    },
    // Only the STIRs: the server's firm names never reach the confirmation (security review H1).
    lenderTins: async (month, ids) => {
      const { lenders } = await api.listInvoices(month)
      const tins = ids.flatMap((id) => lenders.filter((l) => l.id === id).map((l) => l.tin))
      return tins.length === ids.length ? tins : null
    },
  })
  const passwords = createEriPasswordWindows({ assets, parent: () => appWin, eri, readKeys })
  registerIpc({
    getAppWindow: () => appWin,
    origin,
    diagnosticsDir: join(userData(), 'didox-diagnostics'),
    eri,
    readKeys,
    requests,
    didox: runner,
    openPasswordWindow: (tin) => passwords.open(tin),
    install: { id: config.installId, name: config.installName, label },
  })
  startSchedule(drafts.journal)
  refreshTray()
  /*
   * A run that the app died in the middle of is closed now, while nothing else is going on: its interrupted save
   * becomes "needs checking", any id it had already found is sent to the server again (M8c §2), and every flag the
   * server has not heard of yet is sent (M13). Without a robot key yet, they wait for the next run.
   */
  void drafts.journal
    .recoverStaleRuns()
    .then(() => drafts.journal.flushIdFound({ markDraft: api.markDraft }))
    .then(() => drafts.journal.pushFlags(api))
    .then(() => drafts.journal.rotate())
    .catch(() => undefined)
  return robot
}

/*
 * The monthly schedule (SRS FR-8.10). Everything it needs to know about the computer is asked here; everything it
 * decides lives in scheduler/. A run is only ever started while the accountant is away from the keyboard, because
 * the app types the ERI password on it. It needs no confirmation: it is this computer's own schedule, not a page.
 */

/** No automatic run while someone has touched the keyboard in the last few minutes. */
const IDLE_SECONDS = 180
/**
 * Run failures that say nothing about the month: the app never reached Didox, or the robot lost its server key, so
 * the schedule tries again. Anything else — a page that changed, a password Didox refused — is for the accountant,
 * and is not retried behind their back. (A look while the server is down records no run at all, so it never counts.)
 */
const TRANSIENT: ReadySet = new Set([
  'EIMZO_NOT_RUNNING',
  'EIMZO_ERROR',
  'ACCESSIBILITY_DENIED',
  'KEYBOARD_LAYOUT',
  'EIMZO_DIALOG_OPEN',
  'PLATFORM_UNSUPPORTED',
  'APP_CLOSED',
  'RUN_IN_PROGRESS',
  'ROBOT_TOKEN_MISSING',
])
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
      await robotKey?.ensure()
      const result = await didox?.createDrafts({ month, lenderIds: 'all', trigger: 'scheduled' })
      if (result && !result.ok) console.info(`[didox] jadval: ${result.code} — ${result.message}`)
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
        body: `${month} oyi uchun qoralamalar yaratilmadi (${NOT_READY[verdict]}). Tray menyusidan yoki ilovadan "Didox'da qoralama yaratish"ni bosing.`,
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

/**
 * The tray's "create drafts": the same confirmed path as the page's button (bridge/requests.ts), for the month the
 * schedule would do. The app window is opened so the run can be watched.
 */
async function startFromTray(): Promise<void> {
  if (!requests) return void open()
  const month = monthToBill(Date.now())
  const result = await requests.createDrafts({ month, lenderIds: 'all' })
  if (result.ok) return void open()
  if (result.code === 'CANCELLED') return
  const options = { type: 'info' as const, title: 'Moliyaviy yordam', message: "Didox'da qoralamalar boshlanmadi", detail: result.message }
  void (alive(appWin) ? dialog.showMessageBox(appWin, options) : dialog.showMessageBox(options))
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
      ...(waitingMonth ? [{ label: `${waitingMonth}: Didox qoralamalari kutmoqda`, enabled: false }] : []),
      // No month in the label: it would go stale across a month's end; the confirmation names the month.
      ...(requests ? [{ label: "Didox'da qoralama yaratish (o'tgan oy)", click: () => void startFromTray() }, { type: 'separator' as const }] : []),
      { label: 'Ilovani ochish', click: () => void open() },
      { type: 'separator' as const },
      { label: 'Chiqish', click: () => app.quit() },
    ]),
  )
}

const openSetup = () => openSetupWindow({ assets, userData: userData(), onDone: launchApp })
const open = () => launchApp()
const fatal = (error: unknown) => {
  dialog.showErrorBox('Moliyaviy yordam', `Ilovani ishga tushirib bo'lmadi: ${error instanceof Error ? error.message : String(error)}`)
  app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Focus the app (or setup) window — never the Didox window, which only the app drives.
  app.on('second-instance', () => {
    const win = [appWin, setupWindow()].find(alive)
    if (!win) return void open().catch(fatal)
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
    if (![appWin, setupWindow()].some(alive)) open().catch(fatal)
  })
  // Closing the window leaves the app in the tray: a closed window must not cost the month its drafts (FR-8.10).
  app.on('window-all-closed', () => undefined)
  app.on('before-quit', (event) => {
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
}
