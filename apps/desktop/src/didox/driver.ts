import { type Page, type ProgressEvent, StepError } from './contract.js'

export interface StepContext {
  tin: string
  onProgress?: (e: ProgressEvent) => void
  signal: AbortSignal
}

/**
 * Runs one named step: refuses to start once cancelled, reports running/done/failed, turns any foreign error into
 * StepError('PAGE_UNEXPECTED') and attaches a diagnostics screenshot. Never retries — Didox state is unknown after a
 * failure, so the caller stops the firm.
 */
export async function step<T>(name: string, page: Page, ctx: StepContext, fn: () => Promise<T>): Promise<T> {
  if (ctx.signal.aborted) throw new StepError('CANCELLED', CANCELLED_MESSAGE, name, null)
  emit(ctx, name, 'running')
  try {
    const result = await fn()
    emit(ctx, name, 'done')
    return result
  } catch (e) {
    const base = toStepError(e, ctx.signal)
    // A cancel is not a page fault: no screenshot.
    const shot = base.code === 'CANCELLED' ? null : await screenshot(page, name)
    const err = new StepError(base.code, base.message, base.step ?? name, shot ?? base.screenshot ?? null)
    emit(ctx, name, 'failed', err.message)
    throw err
  }
}

/** Human pause between actions: 300–800 ms. `random` is injectable so tests stay deterministic. */
export const humanPauseMs = (random: () => number = Math.random): number => 300 + Math.floor(clamp01(random()) * 501)

const CANCELLED_MESSAGE = 'Bekor qilindi'

/** A StepError from the body keeps its code even after a cancel — WRONG_PASSWORD etc. must reach the journal. */
function toStepError(e: unknown, signal: AbortSignal): StepError {
  if (e instanceof StepError) return e
  if (signal.aborted) return new StepError('CANCELLED', CANCELLED_MESSAGE)
  const detail = e instanceof Error ? e.message : String(e)
  return new StepError('PAGE_UNEXPECTED', `Didox sahifasi kutilganidek emas: ${detail}`)
}

async function screenshot(page: Page, label: string): Promise<string | null> {
  try {
    return await page.screenshot(label)
  } catch {
    return null // diagnostics must never hide the real error
  }
}

function emit(ctx: StepContext, step: string, status: ProgressEvent['status'], message?: string): void {
  try {
    ctx.onProgress?.({ firmTin: ctx.tin, step, status, ...(message === undefined ? {} : { message }) })
  } catch {
    // a broken listener must not change the step's outcome
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0)
