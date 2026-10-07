/** A real calendar date as yyyy-mm-dd (mirrors apps/api/src/common/dates.ts). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/** The accountant's calendar date (browser local) as yyyy-mm-dd — default for date fields. */
export const todayIso = () => new Date().toLocaleDateString('en-CA')
