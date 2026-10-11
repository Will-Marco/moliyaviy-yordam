import { decimalUnits } from '@/lib/format'
import type { Contract } from './api'

/** FR-11.1/11.2 — kept in the address bar, so a filtered list can be shared as a link. */
export interface ListFilters {
  q: string
  lender: string
  borrower: string
  signedFrom: string
  signedTo: string
}

export function filterContracts(contracts: Contract[], f: ListFilters): Contract[] {
  const q = f.q.trim().toLowerCase()
  return contracts.filter(
    (c) =>
      (!q ||
        [c.number, c.lender.name, c.borrower.name, c.lender.tin, c.borrower.tin].some((v) => v.toLowerCase().includes(q))) &&
      (!f.lender || c.lender.id === f.lender) &&
      (!f.borrower || c.borrower.id === f.borrower) &&
      (!f.signedFrom || c.signedOn >= f.signedFrom) &&
      (!f.signedTo || c.signedOn <= f.signedTo),
  )
}

/** Exact order of API decimal strings (money: 2 places, rates: 4) — no floating point (CONSTITUTION §7). */
export function compareDecimal(a: string, b: string): number {
  const d = decimalUnits(a, 4) - decimalUnits(b, 4)
  return d > 0n ? 1 : d < 0n ? -1 : 0
}

export type SortKind = 'text' | 'money' | 'date'
export type SortDir = 'asc' | 'desc'

const collator = new Intl.Collator('uz', { sensitivity: 'base', numeric: true })

/** FR-11.3: a sorted copy. Dates are yyyy-mm-dd, so they sort as text. */
export function sortBy<T>(rows: T[], value: (row: T) => string, kind: SortKind, dir: SortDir): T[] {
  const compare = kind === 'money' ? compareDecimal : collator.compare
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => sign * compare(value(a), value(b)))
}

export type PeriodPreset = 'month' | 'lastMonth' | 'quarter' | 'lastQuarter' | 'year' | 'lastYear'

const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

/** FR-12.1: quick periods as [from, to] months; never beyond the current month. */
export function periodPreset(preset: PeriodPreset, today: string): [string, string] {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const current = ym(year, month)
  const quarterStart = month - ((month - 1) % 3)
  switch (preset) {
    case 'month':
      return [current, current]
    case 'lastMonth': {
      const last = month === 1 ? ym(year - 1, 12) : ym(year, month - 1)
      return [last, last]
    }
    case 'quarter':
      return [ym(year, quarterStart), current]
    case 'lastQuarter':
      return quarterStart === 1 ? [ym(year - 1, 10), ym(year - 1, 12)] : [ym(year, quarterStart - 3), ym(year, quarterStart - 1)]
    case 'year':
      return [ym(year, 1), current]
    case 'lastYear':
      return [ym(year - 1, 1), ym(year - 1, 12)]
  }
}
