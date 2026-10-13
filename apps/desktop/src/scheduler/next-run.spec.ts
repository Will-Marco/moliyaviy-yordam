import { describe, expect, it } from 'vitest'
import { type Attempt, isRunDue, MAX_ATTEMPTS, monthStart, monthToBill, nextCheck, slots } from './next-run.js'

/** Tashkent is UTC+5, so 06:00 there is 01:00Z on the same day. */
const at = (iso: string) => Date.parse(iso)
const attempt = (startedAt: string, over: Partial<Attempt> = {}): Attempt => ({
  startedAt,
  status: 'done',
  transient: false,
  ...over,
})

describe('which month is billed', () => {
  it('bills the month that has just ended', () => {
    expect(monthToBill(at('2026-10-01T01:00:00Z'))).toBe('2026-09')
    expect(monthToBill(at('2026-10-31T18:59:00Z'))).toBe('2026-09')
  })

  it('crosses the year end', () => {
    expect(monthToBill(at('2027-01-01T01:00:00Z'))).toBe('2026-12')
  })

  /* 2026-01-01T00:30Z is still 05:30 of the 1st in Tashkent, so the month that ended is December. */
  it('counts the date in Tashkent, not in UTC', () => {
    expect(monthToBill(at('2026-09-30T19:30:00Z'))).toBe('2026-09') // 00:30 on 1 Oct there
  })
})

describe('when a month comes due', () => {
  it('is owed from 06:00 Tashkent on the first of the next month', () => {
    expect(slots('2026-09')[0]).toBe(at('2026-10-01T01:00:00Z'))
    expect(slots('2026-09')).toHaveLength(3)
    expect(slots('2026-09')[2]).toBe(at('2026-10-01T03:00:00Z'))
  })

  it('starts the month at midnight in Tashkent', () => {
    expect(monthStart('2026-10')).toBe(at('2026-09-30T19:00:00Z'))
  })

  it('is not owed before its month is over', () => {
    expect(isRunDue({ nowMs: at('2026-09-28T06:00:00Z'), month: '2026-09', attempts: [] })).toBe(false)
  })

  it('is owed once the hour arrives and nothing has been tried', () => {
    expect(isRunDue({ nowMs: at('2026-10-01T01:00:00Z'), month: '2026-09', attempts: [] })).toBe(true)
  })
})

describe('what an earlier attempt means', () => {
  it('closes the month once an attempt reached Didox, whatever it found there', () => {
    const attempts = [attempt('2026-10-01T01:00:00Z', { status: 'failed' })]
    expect(isRunDue({ nowMs: at('2026-10-01T02:00:00Z'), month: '2026-09', attempts })).toBe(false)
  })

  it('closes the month after a run that finished', () => {
    const attempts = [attempt('2026-10-01T01:00:00Z')]
    expect(isRunDue({ nowMs: at('2026-10-05T06:00:00Z'), month: '2026-09', attempts })).toBe(false)
  })

  it('tries again in the next slot when the app could not get going at all', () => {
    const attempts = [attempt('2026-10-01T01:00:00Z', { status: 'failed', transient: true })]

    expect(isRunDue({ nowMs: at('2026-10-01T01:30:00Z'), month: '2026-09', attempts })).toBe(false)
    expect(isRunDue({ nowMs: at('2026-10-01T02:00:00Z'), month: '2026-09', attempts })).toBe(true)
  })

  it('gives up on the schedule after three attempts, and leaves it to the accountant', () => {
    const attempts = [
      attempt('2026-10-01T01:00:00Z', { status: 'failed', transient: true }),
      attempt('2026-10-01T02:00:00Z', { status: 'failed', transient: true }),
      attempt('2026-10-01T03:00:00Z', { status: 'failed', transient: true }),
    ]
    expect(attempts).toHaveLength(MAX_ATTEMPTS)
    expect(isRunDue({ nowMs: at('2026-10-01T04:00:00Z'), month: '2026-09', attempts })).toBe(false)
  })

  /* A laptop that was shut all week: the morning slots are long gone, and the month is still owed. */
  it('still catches up days later', () => {
    const attempts = [attempt('2026-10-01T01:00:00Z', { status: 'failed', transient: true })]
    expect(isRunDue({ nowMs: at('2026-10-06T09:00:00Z'), month: '2026-09', attempts })).toBe(true)
  })

  it('ignores a run that is still going', () => {
    const attempts = [attempt('2026-10-01T01:00:00Z', { status: 'running', transient: false })]
    expect(isRunDue({ nowMs: at('2026-10-01T01:05:00Z'), month: '2026-09', attempts })).toBe(true)
  })
})

describe('when to look again', () => {
  it('waits for the next morning slot', () => {
    expect(nextCheck(at('2026-10-01T01:10:00Z'), '2026-09')).toBe(at('2026-10-01T02:00:00Z'))
  })

  it('falls back to hourly once the morning is over', () => {
    const now = at('2026-10-01T05:00:00Z')
    expect(nextCheck(now, '2026-09')).toBe(now + 60 * 60 * 1000)
  })
})
