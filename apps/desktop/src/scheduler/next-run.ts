/*
 * When a month's drafts are owed (M8d, SRS FR-8.10). Pure: it answers from the clock and the run record only, so
 * the rules can be read and tested without a computer that sleeps, locks or runs out of E-IMZO.
 *
 * The shape of the promise (Sir, 2026-10-12): drafts for a finished month are attempted on the 1st at 06:00
 * Tashkent, twice more within the morning if something transient got in the way, and otherwise whenever the
 * computer next allows it — the result time is explicitly not guaranteed. What is guaranteed is that a month is
 * never attempted again once an attempt has run to the end: what it left behind is for the accountant to settle.
 */

/** Asia/Tashkent is UTC+5 all year (CONSTITUTION §6). */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
/** The morning slots of the 1st: 06:00, then 07:00 and 08:00 if the first attempts could not finish. */
const FIRST_SLOT_HOUR = 6
const SLOTS = 3
/** One month is never attempted more than this many times by the schedule itself. */
export const MAX_ATTEMPTS = SLOTS

/** What one earlier attempt at a month amounted to. */
export interface Attempt {
  startedAt: string
  status: 'running' | 'done' | 'cancelled' | 'failed'
  /**
   * True when nothing about this month was settled — the app could not get going at all (E-IMZO down, the app was
   * closed mid-run). A failure that reached Didox is not transient: its outcome is in the journal, for a person.
   */
  transient: boolean
}

export interface DueOptions {
  nowMs: number
  /** The month the drafts would be for, `yyyy-mm`. */
  month: string
  /** Every run recorded for that month, in any order. */
  attempts: Attempt[]
}

/** The month a run started now would bill: the one that has just ended, in Tashkent. */
export function monthToBill(nowMs: number): string {
  const local = new Date(nowMs + TASHKENT_OFFSET_MS)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth() // 0-based; the previous month is this index as a 1-based number
  return month === 0 ? `${year - 1}-12` : `${year}-${String(month).padStart(2, '0')}`
}

/** First instant of `month` (plus whole months) in Tashkent, as Unix ms. */
export function monthStart(month: string, offsetMonths = 0): number {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!match) throw new Error(`Oy formati kutilganidek emas: ${JSON.stringify(month)}`)
  const zeroBased = Number(match[1]) * 12 + Number(match[2]) - 1 + offsetMonths
  const year = Math.floor(zeroBased / 12)
  const monthIndex = zeroBased % 12
  return Date.UTC(year, monthIndex, 1) - TASHKENT_OFFSET_MS
}

/** 06:00, 07:00 and 08:00 Tashkent on the 1st of the month after `month`. */
export function slots(month: string): number[] {
  const first = monthStart(month, 1) + FIRST_SLOT_HOUR * HOUR_MS
  return Array.from({ length: SLOTS }, (_, i) => first + i * HOUR_MS)
}

/**
 * Whether the month's drafts are owed right now. Attempts that got as far as Didox close the month; attempts that
 * could not start at all are retried — in the morning slots, and after that whenever the computer allows, because
 * a laptop that was shut all week should still catch up when it is opened.
 */
export function isRunDue({ nowMs, month, attempts }: DueOptions): boolean {
  const mine = attempts.filter((a) => a.status !== 'running')
  if (mine.some((a) => !a.transient)) return false
  if (mine.length >= MAX_ATTEMPTS) return false
  const [first] = slots(month)
  if (nowMs < first!) return false
  const last = mine.map((a) => Date.parse(a.startedAt)).sort((a, b) => a - b).at(-1)
  // A retry waits for the next slot — or, once the morning is over, for the next hour, so a catch-up is not a loop.
  return last === undefined || nowMs >= last + HOUR_MS
}

/** When the schedule should look again: the next slot, or the next hour while catching up. */
export function nextCheck(nowMs: number, month: string): number {
  const upcoming = slots(month).find((slot) => slot > nowMs)
  return upcoming ?? nowMs + HOUR_MS
}
