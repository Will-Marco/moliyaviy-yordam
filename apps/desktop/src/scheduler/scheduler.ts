import { type Attempt, isRunDue, monthToBill, nextCheck } from './next-run.js'

/*
 * The monthly schedule (SRS FR-8.10). It owns one decision: *now* is a good moment to let the app drive Didox by
 * itself. Everything about what a run then does lives in didox/; everything about whether the month is owed at all
 * lives in next-run.ts.
 *
 * The app types the ERI password on this computer's own keyboard, so an automatic run is only ever started while
 * the person is away from it. When they are not, the month is not silently dropped: they are told it is waiting,
 * and the next look tries again — when the machine wakes, when the screen unlocks, or simply an hour later.
 */

/** Why the computer is not a good place to run right now. */
export type ReadyVerdict = 'ok' | 'busy' | 'locked' | 'eimzo' | 'permissions' | 'run_in_progress'

export interface SchedulerDeps {
  /** Every run recorded for that month. */
  attempts(month: string): Promise<Attempt[]>
  /** Starts the run; `false` means it was refused (nothing to do, another run going). */
  start(month: string): Promise<boolean>
  /** Whether the computer allows an unattended run at this moment. */
  ready(): Promise<ReadyVerdict>
  /** Says the month is waiting; called at most once per month until something changes. */
  notify(month: string, verdict: Exclude<ReadyVerdict, 'ok'>): void
  nowMs?: () => number
  /** Injected so tests do not wait: returns a cancel function. */
  timer?: (ms: number, fn: () => void) => () => void
  /**
   * Upper bound on the gap between two looks. Production leaves it alone (the next look is the next slot, or an
   * hour); a gate run sets it short so the schedule can be watched making its own decision within a minute.
   */
  maxWaitMs?: number
}

const defaultTimer = (ms: number, fn: () => void) => {
  const handle = setTimeout(fn, ms)
  return () => clearTimeout(handle)
}

export function createScheduler(deps: SchedulerDeps) {
  const nowMs = deps.nowMs ?? Date.now
  const timer = deps.timer ?? defaultTimer
  let cancelTimer: (() => void) | null = null
  let told: string | null = null
  let stopped = false

  /** One look: is a month owed, and may it run now? */
  async function check(): Promise<void> {
    if (stopped) return
    const month = monthToBill(nowMs())
    try {
      const attempts = await deps.attempts(month)
      if (isRunDue({ nowMs: nowMs(), month, attempts })) {
        const verdict = await deps.ready()
        if (verdict === 'ok') {
          told = null
          await deps.start(month)
        } else if (told !== month) {
          // Once per month, not once per look: the accountant should not be nagged every hour.
          told = month
          deps.notify(month, verdict)
        }
      }
    } catch {
      // A schedule that throws is a schedule that stops; the next look is what matters.
    }
    schedule()
  }

  function schedule(): void {
    if (stopped) return
    cancelTimer?.()
    const planned = nextCheck(nowMs(), monthToBill(nowMs())) - nowMs()
    const wait = Math.max(Math.min(planned, deps.maxWaitMs ?? planned), 1000)
    cancelTimer = timer(wait, () => void check())
  }

  return {
    /** Starts looking; also looks straight away, because the app may have been closed all morning. */
    start(): void {
      stopped = false
      void check()
    },
    /** The machine woke, the screen unlocked, or the accountant opened the app: a good moment to look again. */
    wake(): void {
      if (!stopped) void check()
    },
    stop(): void {
      stopped = true
      cancelTimer?.()
      cancelTimer = null
    },
  }
}

export type Scheduler = ReturnType<typeof createScheduler>
