// Money and rates stay strings end to end — no JS numbers, no rounding surprises (CONSTITUTION §7).
const NBSP = ' '
const MONEY = /^\d{1,16}(\.\d{1,2})?$/
const RATE = /^\d{1,3}(\.\d{1,4})?$/

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)

/** "10000000000.00" → "10 000 000 000,00", "-5.00" → "−5,00" (non-breaking spaces, true minus sign). */
export function formatMoney(value: string): string {
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  return `${negative ? '\u2212' : ''}${group(whole)},${fraction.padEnd(2, '0').slice(0, 2)}`
}

/** Like formatMoney but keeps every fraction digit: "552328.767123" → "552 328,767123". */
export function formatDecimal(value: string): string {
  const negative = value.startsWith('-')
  const [whole, fraction] = (negative ? value.slice(1) : value).split('.')
  return `${negative ? '\u2212' : ''}${group(whole)}${fraction ? `,${fraction}` : ''}`
}

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']

/** "2026-01" → "Yanvar 2026" */
export function formatMonth(value: string): string {
  const [year, month] = value.split('-')
  return `${MONTHS[Number(month) - 1]} ${year}`
}

/** "2026-01-05" → "05.01" */
export const formatDayMonth = (value: string) => formatDate(value).slice(0, 5)

export const isNegativeMoney = (value: string) => value.startsWith('-') && !/^-0*(\.0*)?$/.test(value)

/** "14.5" → "14,5 %". */
export const formatRate = (value: string) => `${value.replace('.', ',')}${NBSP}%`

/** "2026-01-01" → "01.01.2026". */
export function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

const normalize = (input: string) => input.replace(/[\s  ]/g, '').replace(',', '.')

/** What an accountant types ("10 000 000 000", "1 234,5") → API string, or null if invalid. */
export function parseMoneyInput(input: string): string | null {
  const value = normalize(input)
  return MONEY.test(value) ? value : null
}

/** "14,5" → "14.5", or null if invalid. */
export function parseRateInput(input: string): string | null {
  const value = normalize(input)
  return RATE.test(value) ? value : null
}

/** Compare two valid rate strings without floating point. */
export function rateInRange(value: string): boolean {
  const [whole, fraction = ''] = value.split('.')
  const units = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'))
  return units > 0n && units <= 100n * 10_000n
}

/** A moment ("2026-09-30T20:00:00.000Z") → the accountants' calendar date in Tashkent ("01.10.2026"). */
export function formatInstantDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(value),
  )
}

/**
 * FR-10.1: an amount as the accountant types it — digits grouped by thousands, one decimal comma, at most
 * 2 decimals. "2000000" → "2 000 000", "1234.5" → "1 234,5". Exactly 3 digits after the last dot/comma
 * ("1.500", "1.234.567") mean thousands — an amount never has 3 decimals, so nothing is silently cut off.
 */
export function formatMoneyTyping(input: string): string {
  const parts = input.replace(/[^\d.,]/g, '').split(/[.,]/)
  const last = parts.at(-1)!
  const thousandsOnly = parts.length === 1 || last.length === 3
  const whole = (thousandsOnly ? parts : parts.slice(0, -1)).join('').replace(/^0+(?=\d)/, '')
  if (thousandsOnly) return group(whole)
  return `${group(whole || '0')},${last.slice(0, 2)}`
}

/** Where the caret goes after reformatting: right after the same number of digits/commas as before. */
export function caretAfterFormat(before: string, caret: number, after: string): number {
  const significant = (s: string) => s.replace(/[^\d.,]/g, '').length
  const wanted = significant(before.slice(0, caret))
  if (wanted === 0) return 0
  let seen = 0
  for (let i = 0; i < after.length; i++) {
    if (/[\d,]/.test(after[i]) && ++seen === wanted) return i + 1
  }
  return after.length
}

/** An API decimal string as an integer of 10^-scale units: decimalUnits("-1.5", 2) → -150n. */
export function decimalUnits(value: string, scale: number): bigint {
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = value.replace('-', '').split('.')
  const n = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0').slice(0, scale))
  return negative ? -n : n
}

/** Exact sum of API money strings — for total rows (CONSTITUTION §7). */
export function sumMoney(values: string[]): string {
  const tiyin = values.reduce((total, v) => total + decimalUnits(v, 2), 0n)
  const negative = tiyin < 0n
  const digits = (negative ? -tiyin : tiyin).toString().padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}
