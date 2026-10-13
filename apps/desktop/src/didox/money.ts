/*
 * Money inside the Didox driver (M8c §1, CONSTITUTION §7–11). Amounts live as tiyin in BigInt: the app never computes
 * an amount, it carries the API's string into the form and compares what Didox shows back, digit for digit.
 * No Number / parseFloat / toFixed anywhere — money.spec.ts enforces that for this whole layer.
 */

/** The API's own money format (`money()` in apps/api): whole tiyin, always two decimals. */
const API_AMOUNT = /^\d{1,16}\.\d{2}$/

/** What Didox may show in an amount field: optional thousand groups, one separator, at most two decimals. */
const DIDOX_AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/

/** Decimal separator the form accepts; `.` until spike S2 proves otherwise. */
export const DIDOX_DECIMAL_SEP: '.' | ',' = '.'

/** Reads the amount exactly as the API printed it. Any other shape throws: it is not ours to reinterpret. */
export function tiyinOf(apiAmount: string): bigint {
  if (!API_AMOUNT.test(apiAmount)) throw new Error(`Summa formati kutilganidek emas: ${JSON.stringify(apiAmount)}`)
  return BigInt(apiAmount.replace('.', ''))
}

/**
 * Reads an amount back from the page. Returns null when the text is not a plain amount — a missing kopeck or a
 * third decimal must stop the invoice, never be rounded away (fail-closed).
 */
export function parseDidoxMoney(text: string): bigint | null {
  const match = DIDOX_AMOUNT.exec(text.replace(/[\s  ]/g, ''))
  if (!match) return null
  const [, whole, frac = ''] = match
  return BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0') || '0')
}

/** Writes tiyin as the form's text: digits only, straight from BigInt. */
export function formatForDidox(tiyin: bigint, sep: '.' | ','): string {
  if (tiyin < 0n) throw new Error(`Manfiy summa Didox'ga yozilmaydi: ${tiyin}`)
  return `${tiyin / 100n}${sep}${String(tiyin % 100n).padStart(2, '0')}`
}
