import { EimzoError } from '../eimzo/client.js'
import type { KeyStatus } from '../eimzo/match.js'
import { type EriStore, EriStoreError } from '../secrets/eri-store.js'
import {
  type AutotypePreflight,
  type AutotypePreflightResult,
  type AutotypeResult,
  didoxMessage,
  type LoginContext,
  type Page,
  type ProgressEvent,
  REJECTING_CODES,
  StepError,
  type StepErrorCode,
} from './contract.js'
import { type CreateDraftsDeps, planRun, runPlan, type StartOptions } from './create-drafts.js'
import type { SkipStore } from './skips.js'
import { createRunEngine, RunBusyError, type RunContext } from './engine.js'
import type { InvoiceFlag, RunJournal } from './journal.js'

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

/** Everything `createDrafts` needs that the runner itself does not already have (M8c §3). */
export type DraftsDeps = Pick<CreateDraftsDeps, 'api' | 'journal' | 'maxInvoices' | 'nowMs'> & {
  /** The run planner only reads the flags; the IPC layer sets and clears them (§7). */
  skips: SkipStore
}

/** Start of a draft run: the run id is returned at once and the work goes on in the background (§3). */
export type StartDraftsResult = { ok: true; runId: string } | { ok: false; code: string; message: string }

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/
const MAX_LENDERS = 200

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
  typePassword(password: string, opts: { dialogTimeoutMs: number; signal: AbortSignal; onReady?: () => void }): Promise<AutotypeResult>
  onProgress(e: ProgressEvent): void
  /*
   * Watchdog shape (M8c §3, review B4). There is no whole-run deadline any more: a real run has no sensible total
   * time, but it always makes progress, so silence is what stops it. Tests pass small values.
   */
  /** Silence (no progress event) longer than this stops the run. Default 2 min. */
  stallMs?: number
  /** After that cancel, how long the run may take to wind down before its window is closed by force. Default 1 min. */
  graceMs?: number
  /** Cap on the section between pressing save and writing the found ID. Default 45 s. */
  criticalMaxMs?: number
  /** How often the watchdog looks. Default 30 s. */
  beatMs?: number
  /** M8c: absent in a build that can only check the login. */
  drafts?: DraftsDeps
}

const LOGOUT_TIMEOUT_MS = 30_000
/*
 * Review finding 1: the engine releases the lock when the work settles, and a hung *page* step is ended by closing
 * the Didox window. The steps before that window exists (E-IMZO list, keychain, preflight, clearing the session) have
 * no window to take away, so each gets its own bound — otherwise one dep that never settles would wedge the feature
 * until the app is restarted. These are all local operations; a minute is already far beyond normal.
 */
const PREPARE_TIMEOUT_MS = 60_000
/** Codes that say nothing on their own; when the watchdog stopped the run, it is the better explanation. */
const STALL_MASKS: ReadonlySet<string> = new Set(['CANCELLED', 'PAGE_UNEXPECTED', 'TIMEOUT'])

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

/** `task`, but failing with TIMEOUT if it has not settled in `ms` — used where no window can be closed to end it. */
const bounded = <T>(task: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise<T>((ok, fail) => {
    const timer = setTimeout(() => fail(new StepError('TIMEOUT', `${what} ${Math.round(ms / 1000)} s ichida tugamadi`)), ms)
    task.then(
      (v) => (clearTimeout(timer), ok(v)),
      (e: unknown) => (clearTimeout(timer), fail(e)),
    )
  })

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
 * The Didox runner. Today: "Kirishni tekshirish" (M8b) — one firm, key -> password -> preflight -> Didox login ->
 * verify -> logout. M8c's createDrafts shares the same engine, the same lock and the same `loginFirm`.
 * One run at a time, no retries. Everything that can be known without Didox is checked before the window opens.
 */
export function createDidoxRunner(deps: DidoxRunnerDeps) {
  const engine = createRunEngine({
    ...(deps.stallMs === undefined ? {} : { stallMs: deps.stallMs }),
    ...(deps.graceMs === undefined ? {} : { graceMs: deps.graceMs }),
    ...(deps.criticalMaxMs === undefined ? {} : { criticalMaxMs: deps.criticalMaxMs }),
    ...(deps.beatMs === undefined ? {} : { beatMs: deps.beatMs }),
  })
  /** Set while a run holds the lock, so every progress event counts as a heartbeat. */
  let beat: () => void = () => undefined
  /** Between planning and taking the lock there is a gap; a second start must not slip into it. */
  let starting = false
  let lastRun: string | null = null
  const onProgress = (e: ProgressEvent): void => {
    beat()
    deps.onProgress(e)
  }

  /**
   * One firm's Didox login in an already-open window (§3): the saved password is decrypted only for the moment it is
   * typed into E-IMZO's own window, and `steps/login` verifies which firm got in. Shared by checkLogin and createDrafts.
   */
  const loginFirm = (win: DidoxWindow, firm: { tin: string; keyValidTo: string | null; serial: string | null }, signal: AbortSignal) =>
    deps.login(win.page, {
      tin: firm.tin,
      keyValidTo: firm.keyValidTo,
      armAutotype: (opts) =>
        deps.eri.withPassword(firm.tin, (pw) => deps.typePassword(pw, { dialogTimeoutMs: opts.dialogTimeoutMs, signal: opts.signal, onReady: opts.onReady }), firm.serial),
      onProgress,
      signal,
    })

  async function checkLogin(tin: string): Promise<CheckLoginResult> {
    if (engine.busy()) return fail('RUN_IN_PROGRESS', 'Didox bilan boshqa ish bajarilmoqda — tugashini kuting')
    const progress: Progress = (step, status, message) =>
      onProgress(message === undefined ? { firmTin: tin, step, status } : { firmTin: tin, step, status, message })
    let result: CheckLoginResult
    try {
      result = await engine.run(async (ctx) => {
        beat = ctx.beat
        return run(tin, ctx, progress)
      })
    } catch (error) {
      result = error instanceof RunBusyError ? fail('RUN_IN_PROGRESS', error.message) : fail('UNEXPECTED', unexpected(error))
    } finally {
      beat = () => undefined
    }
    // A run the watchdog stopped reports why. Only the "we cannot tell what happened" codes are replaced: a real
    // verdict (a rejected password, a wrong firm) is what the accountant has to act on, stall or no stall.
    if (!result.ok && engine.stopReason() === 'stalled' && STALL_MASKS.has(result.code)) {
      result = fail('STALLED', didoxMessage('STALLED'))
    }
    progress('result', result.ok ? 'done' : 'failed', result.ok ? 'Kirish tekshirildi' : result.message)
    return result
  }

  async function run(tin: string, ctx: RunContext, progress: Progress): Promise<CheckLoginResult> {
    const signal = ctx.signal
    const cancelled = () => fail('CANCELLED', 'Bekor qilindi')
    const failStep = (step: string, code: string, message: string): CheckLoginResult => {
      progress(step, 'failed', message)
      return fail(code, message)
    }

    progress('eimzo', 'running')
    let key: KeyStatus | undefined
    try {
      key = (await bounded(deps.listKeys([tin]), PREPARE_TIMEOUT_MS, "E-IMZO kalitlar ro'yxati")).get(tin)
    } catch (error) {
      if (error instanceof StepError) return failStep('eimzo', error.code, error.message)
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
      await bounded(deps.eri.withPassword(tin, async () => undefined, serial), PREPARE_TIMEOUT_MS, 'Saqlangan parolni ochish')
    } catch (error) {
      if (error instanceof StepError) return failStep('password', error.code, error.message)
      if (!(error instanceof EriStoreError)) throw error
      return failStep('password', error.code, error.message)
    }
    progress('password', 'done')

    progress('preflight', 'running')
    let verdict: AutotypePreflightResult
    try {
      verdict = await bounded(deps.preflight(), PREPARE_TIMEOUT_MS, 'Tizim tekshiruvi')
    } catch (error) {
      if (error instanceof StepError) return failStep('preflight', error.code, error.message)
      throw error
    }
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
    // A step that honours nothing is ended by taking its window away (engine's force stop).
    ctx.onForceStop(() => win.close())
    try {
      try {
        await bounded(win.resetSession(), PREPARE_TIMEOUT_MS, 'Didox sessiyasini tozalash')
      } catch (error) {
        if (error instanceof StepError) return failStep('window', error.code, error.message)
        return failStep('window', 'UNEXPECTED', unexpected(error))
      }
      progress('window', 'done')
      if (signal.aborted) return cancelled()
      await loginFirm(win, { tin, keyValidTo: key.key.validTo, serial }, signal)
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

  /**
   * Starts a draft run and returns its id straight away: the accountant keeps using the app while it works (Sir,
   * 2026-10-13). Everything that decides whether there is anything to do — the API's list, the skip flags — happens
   * before the lock is taken, so "nothing to do" is an answer, not a run that ends immediately.
   */
  async function createDrafts({ month, lenderIds }: StartOptions): Promise<StartDraftsResult> {
    const refuse = (code: string, message: string): StartDraftsResult => ({ ok: false, code, message })
    const drafts = deps.drafts
    if (!drafts) return { ok: false, code: 'UNAVAILABLE', message: "Didox bilan ishlash bu versiyada yo'q" }
    if (!MONTH.test(month)) return { ok: false, code: 'UNEXPECTED', message: 'Oy formati kutilganidek emas' }
    if (lenderIds !== 'all' && (lenderIds.length === 0 || lenderIds.length > MAX_LENDERS)) {
      return { ok: false, code: 'UNEXPECTED', message: "Firmalar ro'yxati kutilganidek emas" }
    }
    if (engine.busy() || starting) return refuse('RUN_IN_PROGRESS', didoxMessage('RUN_IN_PROGRESS'))

    starting = true
    let handle: Awaited<ReturnType<DraftsDeps['journal']['start']>>
    try {
      // Anything found in an earlier run but never recorded in the API goes first, before new work is planned (§3).
      await drafts.journal.flushIdFound({ markDraft: drafts.api.markDraft }).catch(() => undefined)
      const plan = await planRun(drafts, { month, lenderIds })
      if (!plan) return refuse('NOTHING_TO_DO', didoxMessage('NOTHING_TO_DO'))
      handle = await drafts.journal.start({ month, trigger: 'manual', firms: plan.firms })
      lastRun = handle.runId
      void engine
        .run(async (ctx) => {
          beat = ctx.beat
          return runPlan({ ...drafts, ...sharedDeps(), onProgress }, handle, plan, ctx)
        })
        .then(
          (outcome) => handle.finish(outcome.status, outcome.failure),
          (error: unknown) =>
            handle.finish('failed', {
              code: error instanceof RunBusyError ? 'RUN_IN_PROGRESS' : 'UNEXPECTED',
              message: unexpected(error),
            }),
        )
        .catch(() => undefined)
        .finally(() => {
          beat = () => undefined
        })
      return { ok: true, runId: handle.runId }
    } catch (error) {
      return refuse('UNEXPECTED', unexpected(error))
    } finally {
      starting = false
    }
  }

  /** The pieces a draft run shares with "Kirishni tekshirish": same window, same login, same typist. */
  const sharedDeps = () => ({
    listKeys: deps.listKeys,
    eri: deps.eri,
    preflight: deps.preflight,
    openWindow: deps.openWindow,
    loginFirm,
    logout: deps.logout,
  })

  /** The run this app started last, live while it is going (the UI polls it). */
  async function status(): Promise<RunJournal | null> {
    if (!deps.drafts || !lastRun) return null
    return deps.drafts.journal.read(lastRun)
  }

  /* What the invoices page reads next to the API's own draft state (§7). */

  const listRuns = async (opts: { month?: string; limit?: number } = {}) =>
    deps.drafts ? deps.drafts.journal.list(opts) : []

  const getRun = async (runId: string) => (deps.drafts ? deps.drafts.journal.read(runId) : null)

  /** The shape the web reads (`DidoxInvoiceFlags` in apps/web/src/lib/desktop.ts): both flags nested, either may be absent. */
  const invoiceFlags = async (month: string): Promise<Record<string, { needsCheck?: InvoiceFlag; skipped?: { at: string } }>> => {
    if (!deps.drafts) return {}
    const [needsCheck, skipped] = await Promise.all([deps.drafts.journal.flags(month), deps.drafts.skips.list(month)])
    const flags: Record<string, { needsCheck?: InvoiceFlag; skipped?: { at: string } }> = {}
    for (const [contractId, flag] of Object.entries(needsCheck)) flags[contractId] = { needsCheck: flag }
    for (const [contractId, flag] of Object.entries(skipped)) {
      flags[contractId] = { ...flags[contractId], skipped: { at: flag.at } }
    }
    return flags
  }

  const skipInvoice = async ({ month, contractId, skip }: { month: string; contractId: string; skip: boolean }) => {
    if (!deps.drafts) return
    if (skip) await deps.drafts.skips.set(month, contractId)
    else await deps.drafts.skips.remove(month, contractId)
  }

  /** "Hal qilindi": the flag goes, the record stays, and the API is not touched (FR-8.5). */
  const resolveNeedsCheck = async ({ month, contractId }: { month: string; contractId: string }) => {
    if (!deps.drafts) return
    const flag = (await deps.drafts.journal.flags(month))[contractId]
    if (!flag) return
    const run = await deps.drafts.journal.read(flag.runId)
    const firm = run?.firms.find((f) => f.invoices.some((i) => i.contractId === contractId))
    if (firm) await deps.drafts.journal.resolveNeedsCheck(flag.runId, firm.tin, contractId)
  }

  return {
    checkLogin,
    createDrafts,
    status,
    listRuns,
    getRun,
    invoiceFlags,
    skipInvoice,
    resolveNeedsCheck,
    /** Ends the current run's waits early; the window closes and the run reports CANCELLED. */
    cancel: (): void => engine.cancel(),
    busy: (): boolean => engine.busy(),
    /** True between pressing "Сақлаб қолиш" and the found ID reaching the disk — quitting waits for it (§3). */
    inCritical: (): boolean => engine.inCritical(),
  }
}

const shot = (win: DidoxWindow, label: string) => win.page.screenshot(`check-login-${label}`).catch(() => null)

export type DidoxRunner = ReturnType<typeof createDidoxRunner>
