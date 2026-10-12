import { EimzoError } from '../eimzo/client.js'
import type { KeyStatus } from '../eimzo/match.js'
import { type EriStore, EriStoreError } from '../secrets/eri-store.js'
import {
  type AutotypePreflight,
  type AutotypePreflightResult,
  type AutotypeResult,
  type LoginContext,
  type Page,
  type ProgressEvent,
  REJECTING_CODES,
  StepError,
  type StepErrorCode,
} from './contract.js'

/** The Didox window as the runner sees it (view.ts implements it with Electron). */
export interface DidoxWindow {
  page: Page
  /** Clears cookies/storage/cache of the Didox partition: every firm starts from a clean login. */
  resetSession(): Promise<void>
  /** Closes at once (no beforeunload prompt). Safe to call twice. */
  close(): void
}

/**
 * Bridge contract for `window.desktop.didox.checkLogin`. Mirrored in apps/web/src/lib/desktop.ts — change both together.
 * `code` is a StepErrorCode, an EriStoreError code, or one of RUN_IN_PROGRESS / KEY_UNKNOWN / EIMZO_ERROR / UNEXPECTED / UNAVAILABLE.
 */
export type CheckLoginResult = { ok: true } | { ok: false; code: string; message: string; screenshot?: string | null }

export interface DidoxRunnerDeps {
  /** Firm STIR -> its E-IMZO key; throws EimzoError when E-IMZO is down. */
  listKeys(tins: string[]): Promise<Map<string, KeyStatus>>
  eri: Pick<EriStore, 'withPassword' | 'markRejected'>
  /** Keyboard layout, Accessibility, platform, stray E-IMZO dialog — checked before the Didox window opens. */
  preflight: AutotypePreflight
  /** Opens the Didox window; page waits should end early once `signal` aborts. */
  openWindow(opts: { signal: AbortSignal }): DidoxWindow
  login(page: Page, ctx: LoginContext): Promise<void>
  logout(page: Page): Promise<void>
  typePassword(password: string, opts: { dialogTimeoutMs: number; signal: AbortSignal }): Promise<AutotypeResult>
  onProgress(e: ProgressEvent): void
  /** Whole-run limit; after it the run is aborted and the lock is released even if a step hangs. Default 3 min. */
  watchdogMs?: number
}

const WATCHDOG_MS = 180_000
/** After the watchdog aborts, how long the run gets to wind down before the lock is released regardless. */
const WATCHDOG_GRACE_MS = 10_000
const LOGOUT_TIMEOUT_MS = 30_000

/** Preflight verdicts that stop the run before Didox opens. */
const PREFLIGHT_FAILURES: Record<Exclude<AutotypePreflightResult, 'ok'>, { code: StepErrorCode; message: string }> = {
  layout: { code: 'KEYBOARD_LAYOUT', message: "Klaviaturani ABC/US (lotin) tartibiga o'tkazing" },
  no_permission: { code: 'ACCESSIBILITY_DENIED', message: "Ilovaga Accessibility (Universal Access) ruxsatini bering: System Settings → Privacy & Security" },
  unsupported: { code: 'PLATFORM_UNSUPPORTED', message: "Bu tizimda E-IMZO paroli hali avtomatik yozilmaydi" },
  dialog_already_open: { code: 'EIMZO_DIALOG_OPEN', message: "E-IMZO oynasi allaqachon ochiq — uni yoping va qayta urinib ko'ring" },
}

/** Failures after which the firm may be logged in, so a best-effort logout is tried. */
const AFTER_LOGIN_CODES: ReadonlySet<StepErrorCode> = new Set(['WRONG_FIRM'])

const fail = (code: string, message: string, screenshot?: string | null): CheckLoginResult =>
  screenshot === undefined ? { ok: false, code, message } : { ok: false, code, message, screenshot }

const unexpected = (error: unknown) => `Kutilmagan xato: ${error instanceof Error ? error.message : String(error)}`

/** Resolves `fallback` (or the task's own result) after `ms`, whichever is first; never rejects. */
const within = <T>(task: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise<T>((ok) => {
    const timer = setTimeout(() => ok(fallback), ms)
    task.then(
      (v) => (clearTimeout(timer), ok(v)),
      () => (clearTimeout(timer), ok(fallback)),
    )
  })

type Progress = (step: string, status: ProgressEvent['status'], message?: string) => void

/**
 * "Kirishni tekshirish" (M8b): one firm, key -> password -> preflight -> Didox login -> verify -> logout. One run at a
 * time, no retries. Everything that can be known without Didox is checked before the window opens.
 */
export function createDidoxRunner(deps: DidoxRunnerDeps) {
  let current: AbortController | null = null
  const watchdogMs = deps.watchdogMs ?? WATCHDOG_MS

  async function checkLogin(tin: string): Promise<CheckLoginResult> {
    if (current) return fail('RUN_IN_PROGRESS', 'Didox bilan boshqa ish bajarilmoqda — tugashini kuting')
    const controller = new AbortController()
    current = controller
    const progress: Progress = (step, status, message) =>
      deps.onProgress(message === undefined ? { firmTin: tin, step, status } : { firmTin: tin, step, status, message })
    const timeout = () => fail('TIMEOUT', `Tekshirish ${Math.round(watchdogMs / 60_000) || 1} daqiqada tugamadi`)
    let timedOut = false
    let hardStop: ReturnType<typeof setTimeout> | undefined
    const watchdog = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, watchdogMs)
    try {
      const running = run(tin, controller.signal, progress).catch((error: unknown) => fail('UNEXPECTED', unexpected(error)))
      // If a step ignores the abort, the lock is still released (the run's own finally closes the window later).
      const stuck = new Promise<CheckLoginResult>((ok) => {
        hardStop = setTimeout(() => ok(timeout()), watchdogMs + WATCHDOG_GRACE_MS)
      })
      let result = await Promise.race([running, stuck])
      if (timedOut && !result.ok && result.code === 'CANCELLED') result = timeout()
      progress('result', result.ok ? 'done' : 'failed', result.ok ? 'Kirish tekshirildi' : result.message)
      return result
    } finally {
      clearTimeout(watchdog)
      clearTimeout(hardStop)
      current = null
    }
  }

  async function run(tin: string, signal: AbortSignal, progress: Progress): Promise<CheckLoginResult> {
    const cancelled = () => fail('CANCELLED', 'Bekor qilindi')
    const failStep = (step: string, code: string, message: string): CheckLoginResult => {
      progress(step, 'failed', message)
      return fail(code, message)
    }

    progress('eimzo', 'running')
    let key: KeyStatus | undefined
    try {
      key = (await deps.listKeys([tin])).get(tin)
    } catch (error) {
      if (!(error instanceof EimzoError)) throw error
      return failStep('eimzo', error.code === 'EIMZO_NOT_RUNNING' ? 'EIMZO_NOT_RUNNING' : 'EIMZO_ERROR', error.message)
    }
    if (!key || key.status === 'missing') return failStep('eimzo', 'KEY_MISSING', 'Bu firma uchun E-IMZO kaliti topilmadi')
    if (key.status === 'expired') return failStep('eimzo', 'KEY_EXPIRED', "Kalitning muddati o'tgan")
    if (key.status === 'unknown') return failStep('eimzo', 'KEY_UNKNOWN', "Kalitning amal qilish muddatini o'qib bo'lmadi")
    progress('eimzo', 'done')
    const serial = key.key.serial

    // Decrypt once and discard: missing / rejected / replaced key / unreadable are all known before Didox opens.
    progress('password', 'running')
    try {
      await deps.eri.withPassword(tin, async () => undefined, serial)
    } catch (error) {
      if (!(error instanceof EriStoreError)) throw error
      return failStep('password', error.code, error.message)
    }
    progress('password', 'done')

    progress('preflight', 'running')
    const verdict = await deps.preflight()
    if (verdict !== 'ok') return failStep('preflight', PREFLIGHT_FAILURES[verdict].code, PREFLIGHT_FAILURES[verdict].message)
    progress('preflight', 'done')
    if (signal.aborted) return cancelled()

    progress('window', 'running')
    let win: DidoxWindow
    try {
      win = deps.openWindow({ signal })
    } catch (error) {
      return failStep('window', 'UNEXPECTED', unexpected(error))
    }
    try {
      try {
        await win.resetSession()
      } catch (error) {
        return failStep('window', 'UNEXPECTED', unexpected(error))
      }
      progress('window', 'done')
      if (signal.aborted) return cancelled()
      await deps.login(win.page, {
        tin,
        keyValidTo: key.key.validTo,
        // The password is decrypted only for the moment it is typed into E-IMZO's own window.
        armAutotype: (opts) =>
          deps.eri.withPassword(tin, (pw) => deps.typePassword(pw, { dialogTimeoutMs: opts.dialogTimeoutMs, signal: opts.signal }), serial),
        onProgress: deps.onProgress,
        signal,
      })
      progress('logout', 'running')
      if (await within(deps.logout(win.page).then(() => true), LOGOUT_TIMEOUT_MS, false)) progress('logout', 'done')
      // Logged in and verified; the session is cleared below anyway.
      else progress('logout', 'failed', "Didox'dan chiqib bo'lmadi — sessiya tozalanadi")
      return { ok: true }
    } catch (error) {
      if (error instanceof StepError) {
        // First: a password that was (maybe) typed and did not let us in is never tried again, cancelled or not.
        if (REJECTING_CODES.has(error.code)) {
          await deps.eri.markRejected(tin).catch(() => undefined)
          return fail(error.code, error.message, error.screenshot ?? (await shot(win, error.code)))
        }
        if (signal.aborted) return cancelled()
        const screenshot = error.screenshot ?? (await shot(win, error.code))
        if (AFTER_LOGIN_CODES.has(error.code)) await within(deps.logout(win.page), LOGOUT_TIMEOUT_MS, undefined)
        return fail(error.code, error.message, screenshot)
      }
      if (signal.aborted) return cancelled()
      if (error instanceof EriStoreError) return fail(error.code, error.message)
      return fail('UNEXPECTED', unexpected(error), await shot(win, 'unexpected'))
    } finally {
      // Clear Didox's cookies even when logout failed, then close.
      await within(win.resetSession(), 5_000, undefined)
      win.close()
    }
  }

  return {
    checkLogin,
    /** Ends the current run's waits early; the window closes and the run reports CANCELLED. */
    cancel(): void {
      current?.abort()
    },
    busy: (): boolean => current !== null,
  }
}

const shot = (win: DidoxWindow, label: string) => win.page.screenshot(`check-login-${label}`).catch(() => null)

export type DidoxRunner = ReturnType<typeof createDidoxRunner>
