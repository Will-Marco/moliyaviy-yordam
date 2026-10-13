import { describe, expect, it, vi } from 'vitest'
import type { Attempt } from './next-run.js'
import { createScheduler, type ReadyVerdict, type SchedulerDeps } from './scheduler.js'

/** 06:00 of 1 October in Tashkent, when September's drafts come due. */
const DUE = Date.parse('2026-10-01T01:00:00Z')

function setup(over: Partial<SchedulerDeps> & { attempts?: Attempt[]; ready?: () => Promise<ReadyVerdict> } = {}) {
  const started: string[] = []
  const told: { month: string; verdict: string }[] = []
  const timers: { ms: number; fn: () => void }[] = []
  let now = over.nowMs?.() ?? DUE

  const deps: SchedulerDeps = {
    attempts: async () => (Array.isArray(over.attempts) ? over.attempts : []),
    start: async (month) => {
      started.push(month)
      return true
    },
    ready: over.ready ?? (async () => 'ok'),
    notify: (month, verdict) => told.push({ month, verdict }),
    nowMs: () => now,
    timer: (ms, fn) => {
      timers.push({ ms, fn })
      return () => undefined
    },
    ...(over as Partial<SchedulerDeps>),
  }
  const scheduler = createScheduler(deps)
  return {
    scheduler,
    started,
    told,
    timers,
    /** Lets the scheduler's own promise chain settle. */
    settle: () => new Promise((r) => setTimeout(r, 0)),
    setNow: (ms: number) => {
      now = ms
    },
  }
}

describe('the monthly schedule', () => {
  it('starts the month that is owed as soon as the computer allows it', async () => {
    const s = setup()

    s.scheduler.start()
    await s.settle()

    expect(s.started).toEqual(['2026-09'])
    expect(s.told).toEqual([])
  })

  /* Mid-September, August is what a run would bill — September is not touched until it has ended. */
  it('never bills a month that is still running', async () => {
    const s = setup({
      nowMs: () => Date.parse('2026-09-20T06:00:00Z'),
      attempts: [{ startedAt: '2026-09-01T01:00:00Z', status: 'done', transient: false }],
    })

    s.scheduler.start()
    await s.settle()

    expect(s.started).toEqual([])
  })

  it('leaves a month alone once a run has been through it', async () => {
    const s = setup({ attempts: [{ startedAt: '2026-10-01T01:00:00Z', status: 'done', transient: false }] })

    s.scheduler.start()
    await s.settle()

    expect(s.started).toEqual([])
  })

  describe('when the computer is not a good place to run', () => {
    it.each([
      ['busy', 'the accountant is typing'],
      ['locked', 'the screen is locked'],
      ['eimzo', 'E-IMZO is not running'],
      ['permissions', 'the typist may not type'],
    ] as const)('says the month is waiting instead of driving Didox (%s)', async (verdict) => {
      const s = setup({ ready: async () => verdict })

      s.scheduler.start()
      await s.settle()

      expect(s.started).toEqual([])
      expect(s.told).toEqual([{ month: '2026-09', verdict }])
    })

    it('tells the accountant once, not at every look', async () => {
      const s = setup({ ready: async () => 'busy' })

      s.scheduler.start()
      await s.settle()
      s.scheduler.wake()
      await s.settle()
      s.scheduler.wake()
      await s.settle()

      expect(s.told).toHaveLength(1)
    })

    it('runs it the moment the computer frees up', async () => {
      let verdict: ReadyVerdict = 'busy'
      const s = setup({ ready: async () => verdict })

      s.scheduler.start()
      await s.settle()
      verdict = 'ok'
      s.scheduler.wake()
      await s.settle()

      expect(s.started).toEqual(['2026-09'])
    })
  })

  it('keeps looking: a failed look schedules the next one', async () => {
    const s = setup({
      attempts: async () => {
        throw new Error('jurnal o\'qilmadi')
      },
    })

    s.scheduler.start()
    await s.settle()

    expect(s.timers.length).toBeGreaterThan(0)
  })

  it('waits for the next morning slot rather than spinning', async () => {
    const s = setup({ ready: async () => 'busy' })

    s.scheduler.start()
    await s.settle()

    expect(s.timers.at(-1)?.ms).toBe(60 * 60 * 1000) // 07:00 is an hour after 06:00
  })

  it('stops looking when told to', async () => {
    const s = setup({ ready: async () => 'busy' })
    s.scheduler.start()
    await s.settle()

    s.scheduler.stop()
    s.scheduler.wake()
    await s.settle()

    expect(s.told).toHaveLength(1)
  })

  it('does not start a second run while one is going', async () => {
    const s = setup({ ready: async () => 'run_in_progress' })

    s.scheduler.start()
    await s.settle()

    expect(s.started).toEqual([])
  })
})
