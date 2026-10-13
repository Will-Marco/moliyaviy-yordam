import type { ApiClient } from '../api/client.js'
import type { KeyStatus } from '../eimzo/match.js'
import { EimzoError } from '../eimzo/client.js'
import type { EriStore } from '../secrets/eri-store.js'
import { EriStoreError } from '../secrets/eri-store.js'
import { type AutotypePreflight, type DidoxCode, didoxMessage, type ProgressEvent, REJECTING_CODES, StepError } from './contract.js'
import type { DidoxWindow } from './run.js'
import type { RunContext } from './engine.js'
import type { FirmPlan, InvoicePlan, Journal, RunHandle } from './journal.js'
import type { SkipStore } from './skips.js'
import { createDraft } from './steps/create-draft.js'

/**
 * One run of "create the drafts of month M in Didox" (M8c §3). The rules that shape it:
 *
 *  - A firm that cannot be dealt with never stops the others (FR-8.8), and a page that does not look like Didox stops
 *    that firm rather than being guessed at.
 *  - Everything knowable without Didox — keys, passwords, the typist's preconditions — is settled before the window
 *    opens, so the accountant is not watching a browser while the app finds out it has no password.
 *  - The invoice list is read again after login: by then the accountant may have changed an amount or marked the
 *    invoice by hand, and nothing has been written to Didox yet, so it is safe to follow.
 */

export interface CreateDraftsDeps {
  api: Pick<ApiClient, 'listInvoices' | 'markDraft'>
  journal: Journal
  skips: Pick<SkipStore, 'list'>
  listKeys(tins: string[]): Promise<Map<string, KeyStatus>>
  eri: Pick<EriStore, 'withPassword' | 'markRejected'>
  preflight: AutotypePreflight
  openWindow(opts: { signal: AbortSignal }): DidoxWindow
  /** Shared with "Kirishni tekshirish": the same login, the same verification of which firm got in. */
  loginFirm(win: DidoxWindow, firm: FirmKey, signal: AbortSignal): Promise<void>
  logout(page: DidoxWindow['page']): Promise<void>
  onProgress(e: ProgressEvent): void
  /** c1 runs with 1 (`DIDOX_MAX_INVOICES`): one invoice end to end before many are let loose. */
  maxInvoices?: number
  nowMs?: () => number
}

export interface FirmKey {
  tin: string
  keyValidTo: string | null
  serial: string | null
}

export interface StartOptions {
  month: string
  /** Lender firm ids from the invoice list, or every lender of the month. */
  lenderIds: string[] | 'all'
}

/** What the planner found; `null` means there is nothing to do and no run is started. */
export interface RunPlan {
  month: string
  firms: FirmPlan[]
  keys: Map<string, KeyStatus>
}

const LOGOUT_TIMEOUT_MS = 30_000
const SESSION_TIMEOUT_MS = 60_000
/** Between two invoices and between two firms: the page is driven at human speed (§3). */
const PAUSE_INVOICE_MS = 2_000
const PAUSE_FIRM_MS = 3_000

/** Why a firm never got as far as Didox. The invoice entries say the same thing, so the summary is self-explaining. */
const KEY_PROBLEMS: Record<Exclude<KeyStatus['status'], 'ok'>, DidoxCode> = {
  missing: 'KEY_MISSING',
  expired: 'KEY_EXPIRED',
  unknown: 'KEY_UNKNOWN',
}

/**
 * Builds the plan from the app's own API: invoices of the month that have no draft yet, minus the ones the accountant
 * has told the app to skip, grouped by the firm that issues them.
 */
export async function planRun(
  deps: Pick<CreateDraftsDeps, 'api' | 'skips' | 'maxInvoices'>,
  { month, lenderIds }: StartOptions,
): Promise<RunPlan | null> {
  const list = await deps.api.listInvoices(month)
  const skipped = await deps.skips.list(month)
  const wanted = lenderIds === 'all' ? null : new Set(lenderIds)
  const byFirm = new Map<string, FirmPlan>()
  let taken = 0
  const limit = deps.maxInvoices ?? Number.POSITIVE_INFINITY

  for (const row of list.rows) {
    if (row.draft !== null) continue
    if (wanted && !wanted.has(row.lender.id)) continue
    if (row.contractId in skipped) continue
    if (taken >= limit) break
    const invoice: InvoicePlan = {
      contractId: row.contractId,
      contractNumber: row.contract.number,
      contractSignedOn: row.contract.signedOn,
      borrowerTin: row.borrower.tin,
      borrowerName: row.borrower.name,
      lineName: row.lineName,
      amount: row.amount,
    }
    const firm = byFirm.get(row.lender.tin)
    if (firm) firm.invoices.push(invoice)
    else byFirm.set(row.lender.tin, { tin: row.lender.tin, name: row.lender.name, invoices: [invoice] })
    taken++
  }

  if (!byFirm.size) return null
  return { month, firms: [...byFirm.values()], keys: new Map() }
}

export type RunOutcome = { status: 'done' | 'cancelled' | 'failed'; failure?: { code: string; message: string } }

/**
 * Drives the plan. The journal is the record: every state the invoices pass through is on disk before the app acts
 * on it, so "created in Didox, missing in the app" is always answerable afterwards (§2).
 */
export async function runPlan(
  deps: CreateDraftsDeps,
  handle: RunHandle,
  plan: RunPlan,
  ctx: RunContext,
): Promise<RunOutcome> {
  const { signal } = ctx
  const nowMs = deps.nowMs ?? Date.now
  const progress = (e: Omit<ProgressEvent, 'runId'>) => deps.onProgress({ runId: handle.runId, ...e })

  const firmFailed = async (firm: FirmPlan, code: DidoxCode, message: string, screenshot?: string | null) => {
    await handle.setFirm(firm.tin, { status: 'failed', code, message, ...(screenshot === undefined ? {} : { screenshot }) })
    for (const invoice of firm.invoices) {
      const entry = findEntry(handle, firm.tin, invoice.contractId)
      if (entry?.state === 'pending') {
        await handle.setInvoice(firm.tin, invoice.contractId, { state: 'skipped', code, message })
      }
    }
    progress({ firmTin: firm.tin, step: 'firm', status: 'failed', message })
  }

  // Keys and passwords first: a firm without them never opens a window.
  let keys: Map<string, KeyStatus>
  try {
    keys = await deps.listKeys(plan.firms.map((f) => f.tin))
  } catch (error) {
    const code = error instanceof EimzoError && error.code === 'EIMZO_NOT_RUNNING' ? 'EIMZO_NOT_RUNNING' : 'EIMZO_ERROR'
    const message = error instanceof Error ? error.message : didoxMessage(code)
    return { status: 'failed', failure: { code, message } }
  }

  const verdict = await deps.preflight()
  if (verdict !== 'ok') {
    const code = verdict === 'layout' ? 'KEYBOARD_LAYOUT' : verdict === 'no_permission' ? 'ACCESSIBILITY_DENIED' : verdict === 'dialog_already_open' ? 'EIMZO_DIALOG_OPEN' : 'PLATFORM_UNSUPPORTED'
    return { status: 'failed', failure: { code, message: didoxMessage(code) } }
  }

  const ready: { firm: FirmPlan; key: FirmKey }[] = []
  for (const firm of plan.firms) {
    const key = keys.get(firm.tin)
    if (!key || key.status !== 'ok') {
      const code = KEY_PROBLEMS[(key?.status ?? 'missing') as Exclude<KeyStatus['status'], 'ok'>]
      await skipFirm(handle, firm, code, didoxMessage(code))
      progress({ firmTin: firm.tin, step: 'firm', status: 'failed', message: didoxMessage(code) })
      continue
    }
    try {
      await deps.eri.withPassword(firm.tin, async () => undefined, key.key.serial)
    } catch (error) {
      const code = error instanceof EriStoreError ? (error.code as DidoxCode) : 'PASSWORD_MISSING'
      const message = error instanceof Error ? error.message : didoxMessage(code)
      await skipFirm(handle, firm, code, message)
      progress({ firmTin: firm.tin, step: 'firm', status: 'failed', message })
      continue
    }
    ready.push({ firm, key: { tin: firm.tin, keyValidTo: key.key.validTo, serial: key.key.serial } })
  }

  if (!ready.length) return { status: 'done' }
  if (signal.aborted) return { status: 'cancelled' }

  const win = deps.openWindow({ signal })
  ctx.onForceStop(() => win.close())
  let outcome: RunOutcome = { status: 'done' }
  try {
    for (const { firm, key } of ready) {
      if (signal.aborted) {
        outcome = { status: 'cancelled' }
        break
      }
      const stop = await runFirm(deps, handle, plan, { firm, key, win, ctx, nowMs, progress, firmFailed })
      if (stop) {
        outcome = stop
        break
      }
      await win.page.pause(PAUSE_FIRM_MS)
    }
  } finally {
    await settleWithin(win.resetSession(), SESSION_TIMEOUT_MS)
    win.close()
  }
  if (signal.aborted && outcome.status === 'done') outcome = { status: 'cancelled' }
  return outcome
}

interface FirmRun {
  firm: FirmPlan
  key: FirmKey
  win: DidoxWindow
  ctx: RunContext
  nowMs: () => number
  progress: (e: Omit<ProgressEvent, 'runId'>) => void
  firmFailed: (firm: FirmPlan, code: DidoxCode, message: string, screenshot?: string | null) => Promise<void>
}

/** One firm: log in, go through its invoices, log out. Returns a run-level stop, or nothing to carry on. */
async function runFirm(deps: CreateDraftsDeps, handle: RunHandle, plan: RunPlan, run: FirmRun): Promise<RunOutcome | null> {
  const { firm, key, win, ctx, progress } = run
  await handle.setFirm(firm.tin, { status: 'login' })
  progress({ firmTin: firm.tin, step: 'login', status: 'running' })
  try {
    await settleWithin(win.resetSession(), SESSION_TIMEOUT_MS)
    await deps.loginFirm(win, key, ctx.signal)
  } catch (error) {
    if (ctx.signal.aborted) return { status: 'cancelled' }
    const code = (error instanceof StepError ? error.code : 'UNEXPECTED') as DidoxCode
    const message = error instanceof Error ? error.message : didoxMessage(code)
    if (error instanceof StepError && REJECTING_CODES.has(error.code)) {
      await deps.eri.markRejected(firm.tin).catch(() => undefined)
    }
    await run.firmFailed(firm, code, message, error instanceof StepError ? error.screenshot : null)
    return null // FR-8.8: the next firm still gets its turn
  }
  await handle.setFirm(firm.tin, { status: 'running' })
  progress({ firmTin: firm.tin, step: 'login', status: 'done' })

  /*
   * What the API says now wins over the plan: while the window was opening the accountant may have marked an invoice
   * by hand or changed an amount. Nothing is in Didox yet, so following the fresh list cannot contradict it.
   */
  let fresh
  try {
    fresh = await deps.api.listInvoices(plan.month)
  } catch {
    fresh = null
  }

  const invoices = firm.invoices
  for (const [index, planned] of invoices.entries()) {
    if (ctx.signal.aborted) return { status: 'cancelled' }
    const row = fresh?.rows.find((r) => r.contractId === planned.contractId)
    if (fresh && !row) {
      await handle.setInvoice(firm.tin, planned.contractId, {
        state: 'skipped',
        code: 'NOTHING_TO_DO',
        message: "Faktura ro'yxatdan chiqdi",
      })
      continue
    }
    if (row?.draft) {
      await handle.setInvoice(firm.tin, planned.contractId, {
        state: 'skipped',
        code: 'ALREADY_DRAFTED',
        message: 'Allaqachon belgilangan',
      })
      continue
    }
    const amount = row?.amount ?? planned.amount
    const entry = { ...findEntry(handle, firm.tin, planned.contractId)!, amount }
    const position = { invoiceIndex: index + 1, invoiceCount: invoices.length }
    progress({ firmTin: firm.tin, contractId: planned.contractId, ...position, step: 'invoice', status: 'running' })

    try {
      const result = await createDraft({
        page: win.page,
        ctx: {
          tin: firm.tin,
          signal: ctx.signal,
          onProgress: (e) => progress({ ...e, contractId: planned.contractId, ...position }),
        },
        item: entry,
        month: plan.month,
        lenderTin: firm.tin,
        journal: {
          setInvoice: (patch) => handle.setInvoice(firm.tin, planned.contractId, patch),
          mark: () => handle.markInvoice(deps.api.markDraft, firm.tin, planned.contractId),
        },
        critical: { enter: () => ctx.enterCritical(), exit: () => ctx.exitCritical() },
        nowMs: run.nowMs,
      })
      progress({
        firmTin: firm.tin,
        contractId: planned.contractId,
        ...position,
        step: 'invoice',
        status: result.kind === 'marked' || result.kind === 'id_found' ? 'done' : 'failed',
        ...(result.kind === 'marked' || result.kind === 'id_found' ? {} : { message: result.message }),
      })
      if (result.kind === 'run_failed') return { status: 'failed', failure: { code: result.code, message: result.message } }
    } catch (error) {
      if (ctx.signal.aborted) return { status: 'cancelled' }
      // A page that stopped looking like Didox: this firm is done, the next one still runs.
      const code = (error instanceof StepError ? error.code : 'UNEXPECTED') as DidoxCode
      const message = error instanceof Error ? error.message : didoxMessage(code)
      await run.firmFailed(firm, code, message, error instanceof StepError ? error.screenshot : null)
      return null
    }
    await win.page.pause(PAUSE_INVOICE_MS)
  }

  await settleWithin(deps.logout(win.page), LOGOUT_TIMEOUT_MS)
  await handle.setFirm(firm.tin, { status: 'done' })
  progress({ firmTin: firm.tin, step: 'firm', status: 'done' })
  return null
}

/** A firm that never reached Didox: its invoices say why, so the summary needs no second source. */
async function skipFirm(handle: RunHandle, firm: FirmPlan, code: DidoxCode, message: string): Promise<void> {
  await handle.setFirm(firm.tin, { status: 'skipped', code, message })
  for (const invoice of firm.invoices) {
    await handle.setInvoice(firm.tin, invoice.contractId, { state: 'skipped', code, message })
  }
}

const findEntry = (handle: RunHandle, tin: string, contractId: string) =>
  handle
    .snapshot()
    .firms.find((f) => f.tin === tin)
    ?.invoices.find((i) => i.contractId === contractId)

/** Best effort with a bound: logging out or clearing a session must not hold a run open. */
const settleWithin = <T>(task: Promise<T>, ms: number): Promise<T | undefined> =>
  new Promise((ok) => {
    const timer = setTimeout(() => ok(undefined), ms)
    task.then(
      (v) => (clearTimeout(timer), ok(v)),
      () => (clearTimeout(timer), ok(undefined)),
    )
  })
