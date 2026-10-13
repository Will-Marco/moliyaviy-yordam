/*
 * The run engine (M8c §3, review B4): one run at a time, one lock, one heartbeat. It knows nothing about Didox —
 * only about time, cancelling and the one place a run must not be interrupted.
 *
 * Why a heartbeat instead of a whole-run deadline: a real run (several firms, many invoices, human-speed typing) has
 * no sensible total time, but it always makes progress. Silence is the symptom worth acting on.
 *
 * Why a critical section: between pressing "Сақлаб қолиш" and writing the found ID to disk, an abort would leave a
 * draft in Didox that the app does not know about. Inside it a cancel waits; the section has its own cap so it can
 * never wait forever.
 */

export type StopReason = 'user' | 'stalled' | 'critical_timeout'

export interface RunContext {
  /** Aborts when the run is cancelled — never inside a critical section (unless the section overruns its cap). */
  signal: AbortSignal
  /** "Still working": every progress event calls this, and silence longer than stallMs stops the run. */
  beat(): void
  enterCritical(): void
  exitCritical(): void
  /** How to stop a step that honours nothing: closing the Didox window makes its waits throw. */
  onForceStop(stop: () => void): void
}

export class RunBusyError extends Error {
  constructor() {
    super("Didox bilan boshqa ish bajarilmoqda — tugashini kuting")
    this.name = 'RunBusyError'
  }
}

/** Defaults from the plan: 2 min of silence stops a run, 1 min of grace, 45 s for the save-and-identify section. */
export function createRunEngine({
  stallMs = 120_000,
  graceMs = 60_000,
  criticalMaxMs = 45_000,
  beatMs = 30_000,
}: { stallMs?: number; graceMs?: number; criticalMaxMs?: number; beatMs?: number } = {}) {
  interface Current {
    controller: AbortController
    lastBeatAt: number
    critical: boolean
    cancelRequested: boolean
    stalledAt: number | null
    forced: boolean
    forceStop?: () => void
    criticalTimer?: ReturnType<typeof setTimeout>
  }

  let current: Current | null = null
  let stopReason: StopReason | null = null

  /** Aborts now, or remembers to abort as soon as the critical section ends. */
  function requestCancel(run: Current, reason: StopReason): void {
    stopReason ??= reason
    run.cancelRequested = true
    if (!run.critical) run.controller.abort()
  }

  function watchdog(run: Current): void {
    const now = Date.now()
    if (run.stalledAt === null) {
      if (now - run.lastBeatAt > stallMs) {
        run.stalledAt = now
        requestCancel(run, 'stalled')
      }
      return
    }
    // The cancel was given its grace period and the run is still here: take the window away from it. Never while a
    // critical section is open — closing the window there is exactly the half-saved draft this guards against. That
    // section has its own cap (criticalMaxMs), so this wait is bounded whatever the two values are.
    if (!run.forced && !run.critical && now - run.stalledAt >= graceMs) {
      run.forced = true
      run.forceStop?.()
    }
  }

  return {
    busy: (): boolean => current !== null,
    inCritical: (): boolean => current?.critical ?? false,
    /** Why the last (or current) run was stopped from outside; null when it ran its own course. */
    stopReason: (): StopReason | null => stopReason,

    /** Ends the current run's waits early. Inside a critical section it takes effect when that section ends. */
    cancel(): void {
      if (current) requestCancel(current, 'user')
    },

    /**
     * Holds the lock for `work`. The lock is released only when `work` settles — a run that ignores its signal keeps
     * the lock and gets its window closed, so there is never a second run beside a zombie one.
     */
    async run<T>(work: (ctx: RunContext) => Promise<T>): Promise<T> {
      if (current) throw new RunBusyError()
      const run: Current = {
        controller: new AbortController(),
        lastBeatAt: Date.now(),
        critical: false,
        cancelRequested: false,
        stalledAt: null,
        forced: false,
      }
      current = run
      stopReason = null
      const beats = setInterval(() => watchdog(run), beatMs)
      const ctx: RunContext = {
        signal: run.controller.signal,
        beat: () => {
          run.lastBeatAt = Date.now()
        },
        enterCritical: () => {
          run.critical = true
          clearTimeout(run.criticalTimer)
          run.criticalTimer = setTimeout(() => {
            // Stuck between save and ID: stop protecting it, the invoice will be left for a person to check.
            run.critical = false
            stopReason ??= 'critical_timeout'
            run.controller.abort()
          }, criticalMaxMs)
        },
        exitCritical: () => {
          run.critical = false
          clearTimeout(run.criticalTimer)
          run.criticalTimer = undefined
          if (run.cancelRequested) run.controller.abort()
        },
        onForceStop: (stop) => {
          run.forceStop = stop
        },
      }
      try {
        return await work(ctx)
      } finally {
        clearInterval(beats)
        clearTimeout(run.criticalTimer)
        current = null
      }
    },
  }
}

export type RunEngine = ReturnType<typeof createRunEngine>
