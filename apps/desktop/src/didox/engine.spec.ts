import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRunEngine, RunBusyError, type RunContext } from './engine.js'

const STALL = 120_000
const GRACE = 60_000
const CRITICAL = 45_000
const BEAT = 30_000

const engine = () => createRunEngine({ stallMs: STALL, graceMs: GRACE, criticalMaxMs: CRITICAL, beatMs: BEAT })

/** A work function that never settles on its own; `settle` ends it. */
function hangingWork() {
  let settle: (() => void) | undefined
  let ctx: RunContext | undefined
  const work = (c: RunContext) => {
    ctx = c
    return new Promise<void>((ok) => {
      settle = ok
    })
  }
  return {
    work,
    ctx: () => ctx!,
    settle: () => settle!(),
    /** Resolves when the signal aborts, like a Page wait does. */
    rejectOnAbort: (c: RunContext) =>
      new Promise<void>((_ok, fail) => c.signal.addEventListener('abort', () => fail(new Error('CANCELLED')))),
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createRunEngine — one run, one lock (§3)', () => {
  it('runs the work and holds the lock until it settles', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run(h.work)

    await vi.advanceTimersByTimeAsync(0)
    expect(e.busy()).toBe(true)
    h.settle()
    await pending
    expect(e.busy()).toBe(false)
    expect(e.stopReason()).toBeNull()
  })

  it('refuses a second run while one is in flight', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run(h.work)
    await vi.advanceTimersByTimeAsync(0)

    await expect(e.run(async () => undefined)).rejects.toBeInstanceOf(RunBusyError)
    h.settle()
    await pending
    // And the engine is reusable afterwards.
    expect(await e.run(async () => 'again')).toBe('again')
  })

  it('releases the lock when the work throws', async () => {
    const e = engine()
    await expect(e.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(e.busy()).toBe(false)
  })

  it('passes the work a signal that is not aborted', async () => {
    const e = engine()
    expect(await e.run(async (ctx) => ctx.signal.aborted)).toBe(false)
  })
})

describe('cancel (§3)', () => {
  it('aborts the page signal', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run((ctx) => h.rejectOnAbort(ctx)).catch((error: unknown) => (error as Error).message)
    await vi.advanceTimersByTimeAsync(0)

    e.cancel()
    expect(await pending).toBe('CANCELLED')
    expect(e.stopReason()).toBe('user')
  })

  it('with nothing running is harmless', () => {
    expect(() => engine().cancel()).not.toThrow()
  })

  it('waits for the critical section: the save is never cut in half', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run(h.work)
    await vi.advanceTimersByTimeAsync(0)
    h.ctx().enterCritical()

    e.cancel()
    expect(e.inCritical()).toBe(true)
    // Inside the critical section (pressing save → writing the found ID) the signal stays alive.
    expect(h.ctx().signal.aborted).toBe(false)

    h.ctx().exitCritical()
    expect(h.ctx().signal.aborted).toBe(true)
    h.settle()
    await pending
  })

  it('aborts at once when the critical section is already over', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run(h.work)
    await vi.advanceTimersByTimeAsync(0)
    h.ctx().enterCritical()
    h.ctx().exitCritical()

    e.cancel()
    expect(h.ctx().signal.aborted).toBe(true)
    h.settle()
    await pending
  })

  it('cuts a critical section that overruns its own cap', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run(h.work)
    await vi.advanceTimersByTimeAsync(0)
    h.ctx().enterCritical()

    await vi.advanceTimersByTimeAsync(CRITICAL - 1)
    expect(h.ctx().signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    // 45 s is more than save + list + slack: the section is stuck, so the page is cut loose anyway.
    expect(h.ctx().signal.aborted).toBe(true)
    expect(e.stopReason()).toBe('critical_timeout')
    expect(e.inCritical()).toBe(false)
    h.settle()
    await pending
  })
})

describe('the heartbeat watchdog (§3, review B4)', () => {
  it('stops a run that has made no progress for stallMs', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run((ctx) => h.rejectOnAbort(ctx)).catch((error: unknown) => (error as Error).message)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(STALL + BEAT)
    expect(await pending).toBe('CANCELLED')
    expect(e.stopReason()).toBe('stalled')
  })

  it('leaves a working run alone however long it takes — each beat is progress', async () => {
    const e = engine()
    const h = hangingWork()
    const pending = e.run(h.work)
    await vi.advanceTimersByTimeAsync(0)

    // A long firm: ten invoices, each beating well within the stall window.
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(STALL / 2)
      h.ctx().beat()
    }
    expect(h.ctx().signal.aborted).toBe(false)
    expect(e.stopReason()).toBeNull()
    h.settle()
    await pending
  })

  it('defers even a stall cancel until the critical section ends', async () => {
    // With the real numbers the 45 s cap always cuts in before 2 min of silence; these let the deferral be seen on
    // its own, which is the behaviour that matters: a stall must not abort between save and ID either.
    const e = createRunEngine({ stallMs: 10_000, graceMs: GRACE, criticalMaxMs: 600_000, beatMs: 1_000 })
    const h = hangingWork()
    const pending = e.run(h.work)
    await vi.advanceTimersByTimeAsync(0)
    h.ctx().enterCritical()

    await vi.advanceTimersByTimeAsync(12_000)
    expect(e.stopReason()).toBe('stalled')
    expect(h.ctx().signal.aborted).toBe(false)

    h.ctx().exitCritical()
    expect(h.ctx().signal.aborted).toBe(true)
    h.settle()
    await pending
  })

  it('closes the window by force when a hung step ignores the cancel', async () => {
    const e = engine()
    const close = vi.fn()
    let settle: (() => void) | undefined
    const pending = e
      .run(async (ctx) => {
        ctx.onForceStop(close)
        // A step that honours nothing: only the window closing ends it (that is what the real Page does).
        await new Promise<void>((ok) => {
          settle = ok
          close.mockImplementation(() => ok())
        })
      })
      .then(() => 'ended')

    await vi.advanceTimersByTimeAsync(STALL + BEAT)
    expect(close).not.toHaveBeenCalled() // the cancel is given its grace period first
    await vi.advanceTimersByTimeAsync(GRACE + BEAT)

    expect(close).toHaveBeenCalledOnce()
    expect(await pending).toBe('ended')
    expect(e.busy()).toBe(false)
    expect(e.stopReason()).toBe('stalled')
    expect(settle).toBeTypeOf('function')
  })

  it('does not force the window closed when the run ends on its own', async () => {
    const e = engine()
    const close = vi.fn()
    const pending = e.run(async (ctx) => {
      ctx.onForceStop(close)
      await Promise.resolve()
    })
    await pending
    await vi.advanceTimersByTimeAsync(STALL + GRACE + BEAT)
    expect(close).not.toHaveBeenCalled()
  })

  it('forgets the previous run\'s reason', async () => {
    const e = engine()
    const h = hangingWork()
    const first = e.run((ctx) => h.rejectOnAbort(ctx)).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    e.cancel()
    await first
    expect(e.stopReason()).toBe('user')

    await e.run(async () => undefined)
    expect(e.stopReason()).toBeNull()
  })

  it('stops its timers with the run — nothing ticks between runs', async () => {
    const e = engine()
    const close = vi.fn()
    await e.run(async (ctx) => {
      ctx.onForceStop(close)
      ctx.enterCritical()
      ctx.exitCritical()
    })
    await vi.advanceTimersByTimeAsync(10 * (STALL + GRACE))
    expect(close).not.toHaveBeenCalled()
    expect(e.busy()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the critical section outranks the force stop (review finding 9)', () => {
  it('does not close the window while a save is in flight, and forces once the section ends', async () => {
    // criticalMaxMs longer than graceMs on purpose: the engine must not rely on the defaults' ordering.
    const e = createRunEngine({ stallMs: 10_000, graceMs: 20_000, criticalMaxMs: 600_000, beatMs: 1_000 })
    const close = vi.fn()
    let ctx: RunContext | undefined
    let settle: (() => void) | undefined
    const pending = e.run(async (c) => {
      ctx = c
      c.onForceStop(close)
      await new Promise<void>((ok) => {
        settle = ok
        close.mockImplementation(() => ok())
      })
    })
    await vi.advanceTimersByTimeAsync(0)
    ctx!.enterCritical()

    // Well past stall + grace: the save is still protected.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(e.stopReason()).toBe('stalled')
    expect(close).not.toHaveBeenCalled()
    expect(ctx!.signal.aborted).toBe(false)

    ctx!.exitCritical()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(close).toHaveBeenCalledOnce()
    await pending
    expect(e.busy()).toBe(false)
    expect(settle).toBeTypeOf('function')
  })
})
