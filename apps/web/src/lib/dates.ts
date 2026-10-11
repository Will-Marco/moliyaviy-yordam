/** A real calendar date as yyyy-mm-dd (mirrors apps/api/src/common/dates.ts). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

const MIN_YEAR = 2000
const MAX_YEAR = 2100

/** Native date pickers start inside the accepted range (FR-10.2). */
export const DATE_BOUNDS = { min: `${MIN_YEAR}-01-01`, max: `${MAX_YEAR}-12-31` } as const

/** FR-10.2 (mirrors the API): why a value is not an acceptable business date, or null if it is. */
export function dateError(value: string): string | null {
  if (!isIsoDate(value)) return "Sana noto'g'ri"
  const year = Number(value.slice(0, 4))
  return year < MIN_YEAR || year > MAX_YEAR ? `Yil ${MIN_YEAR}–${MAX_YEAR} oralig'ida bo'lishi kerak` : null
}

/** The accountant's calendar date (browser local) as yyyy-mm-dd — default for date fields. */
export const todayIso = () => new Date().toLocaleDateString('en-CA')
