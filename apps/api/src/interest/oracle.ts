import type { IsoDate } from '../common/dates.js';
import type { EngineInput } from './engine.js';

/**
 * Test-only reference: walks every calendar day and applies CR-1/CR-2/CR-5/CR-11 literally.
 * Deliberately naive and independent of the engine's segmentation. Returns the exact monthly
 * numerator per month; the denominator is 100 × 10⁴ × days-in-year of that month.
 */
export function oracleMonthlyNumerators(input: EngineInput): Map<string, { numerator: bigint; yearDays: bigint }> {
  const result = new Map<string, { numerator: bigint; yearDays: bigint }>();
  if (input.asOf < input.startDate) return result;
  const ops = input.operations.filter((op) => op.date <= input.asOf);
  for (let day = input.startDate; day <= input.asOf; day = nextDay(day)) {
    let balance = 0n;
    for (const op of ops) {
      if (op.date > day) continue;
      if (op.type === 'DISBURSEMENT') balance += op.amount;
      if (op.type === 'PRINCIPAL_REPAYMENT') balance -= op.amount;
    }
    let rate = 0n;
    for (const r of input.rates) if (r.effectiveFrom <= day) rate = r.ratePercentE4;
    const year = Number(day.slice(0, 4));
    const yearDays = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366n : 365n;
    const month = day.slice(0, 7);
    const entry = result.get(month) ?? { numerator: 0n, yearDays };
    entry.numerator += balance * rate;
    result.set(month, entry);
  }
  return result;
}

function nextDay(day: IsoDate): IsoDate {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
