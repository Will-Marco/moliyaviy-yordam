import type { IsoDate } from '../common/dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OperationType } from '../operations/ledger.js';

/*
 * Interest core (SRS §4, CONSTITUTION §7, §9). Pure: no database, no clock — "today" is `asOf`.
 * Exact arithmetic on integers: money in tiyin, rates in 1/10 000 of a percent. Within a month the
 * days-in-year is constant (months never cross years, CR-2), so a month's interest is one fraction
 *   Σ(balance × rate × days) / (100 × 10⁴ × yearDays)
 * rounded once to tiyin (CR-4). No intermediate rounding anywhere.
 */

export interface EngineInput {
  startDate: IsoDate;
  asOf: IsoDate;
  /** Ordered by effectiveFrom, then entry order — on equal dates the later entry wins (CR-5). */
  rates: { ratePercentE4: bigint; effectiveFrom: IsoDate }[];
  operations: { date: IsoDate; type: OperationType; amount: bigint }[];
}

export interface Segment {
  from: IsoDate;
  /** Inclusive. */
  to: IsoDate;
  days: number;
  balance: bigint;
  ratePercentE4: bigint;
  yearDays: 365 | 366;
  interestExactE6: bigint;
}

export interface MonthRow {
  month: string;
  /** First and last day counted (inclusive): clipped by the start date and by asOf. */
  from: IsoDate;
  to: IsoDate;
  /** The month containing asOf (still in progress), counted only up to asOf. */
  partial: boolean;
  /** Distinct rates in force during the month, in order. */
  rates: bigint[];
  openingBalance: bigint;
  disbursed: bigint;
  repaid: bigint;
  closingBalance: bigint;
  interestNumerator: bigint;
  interestDenominator: bigint;
  /** Rounded to tiyin (CR-4). */
  interest: bigint;
  /** Exact value in millionths of a so'm, for display only. */
  interestExactE6: bigint;
  interestPaid: bigint;
  /** Σ rounded interest − Σ interest payments up to `to` (CR-8). */
  interestDebt: bigint;
  segments: Segment[];
}

const RATE_SCALE = 1_000_000n; // percent (100) × 10⁴

export function computeInterest(input: EngineInput): { months: MonthRow[] } {
  if (input.asOf < input.startDate) return { months: [] };
  const ops = input.operations.filter((op) => op.date <= input.asOf);
  const principal = (until: IsoDate, inclusive: boolean) =>
    ops.reduce((sum, op) => (inclusive ? op.date <= until : op.date < until) ? sum + delta(op) : sum, 0n);
  const rateOn = (day: IsoDate) =>
    input.rates.reduce((rate, r) => (r.effectiveFrom <= day ? r.ratePercentE4 : rate), 0n);
  const changeDays = new Set([
    ...ops.filter((op) => op.type !== 'INTEREST_PAYMENT').map((op) => op.date),
    ...input.rates.map((r) => r.effectiveFrom),
  ]);

  const months: MonthRow[] = [];
  let debt = 0n;
  let paidBefore: IsoDate | null = null;

  for (let first = monthStart(input.startDate); first <= input.asOf; first = nextMonth(first)) {
    const last = monthEnd(first);
    const from = first < input.startDate ? input.startDate : first;
    const to = last > input.asOf ? input.asOf : last;
    const yearDays = isLeap(Number(first.slice(0, 4))) ? 366 : 365;
    const denominator = RATE_SCALE * BigInt(yearDays);

    const starts = [from, ...[...changeDays].filter((d) => d > from && d <= to)].sort();
    const segments: Segment[] = starts.map((segFrom, i) => {
      const segTo = i + 1 < starts.length ? addDays(starts[i + 1], -1) : to;
      const days = daysBetween(segFrom, segTo) + 1;
      const balance = principal(segFrom, true);
      const ratePercentE4 = rateOn(segFrom);
      return {
        from: segFrom,
        to: segTo,
        days,
        balance,
        ratePercentE4,
        yearDays,
        interestExactE6: roundHalfAwayFromZero(balance * ratePercentE4 * BigInt(days), denominator / 10_000n),
      };
    });

    const numerator = segments.reduce((sum, s) => sum + s.balance * s.ratePercentE4 * BigInt(s.days), 0n);
    const interest = roundHalfAwayFromZero(numerator, denominator);
    const inMonth = (op: EngineInput['operations'][number]) => op.date >= from && op.date <= to;
    const sumOf = (type: OperationType, keep: (op: EngineInput['operations'][number]) => boolean) =>
      ops.filter((op) => op.type === type && keep(op)).reduce((sum, op) => sum + op.amount, 0n);
    // Payments made before the first counted day still reduce the first month's debt.
    const interestPaid = sumOf('INTEREST_PAYMENT', (op) => op.date <= to && (paidBefore === null || op.date > paidBefore));
    debt += interest - interestPaid;
    paidBefore = to;

    months.push({
      month: first.slice(0, 7),
      from,
      to,
      // Today's month is still in progress — even on its last day (FR-4.4).
      partial: to === input.asOf,
      rates: [...new Set(segments.map((s) => s.ratePercentE4))],
      openingBalance: principal(from, false),
      disbursed: sumOf('DISBURSEMENT', inMonth),
      repaid: sumOf('PRINCIPAL_REPAYMENT', inMonth),
      closingBalance: principal(to, true),
      interestNumerator: numerator,
      interestDenominator: denominator,
      interest,
      interestExactE6: roundHalfAwayFromZero(numerator, denominator / 10_000n),
      interestPaid,
      interestDebt: debt,
      segments,
    });
  }
  return { months };
}

const delta = (op: EngineInput['operations'][number]) =>
  op.type === 'DISBURSEMENT' ? op.amount : op.type === 'PRINCIPAL_REPAYMENT' ? -op.amount : 0n;

/** Integer division rounded half away from zero (CR-4). `denominator` must be positive. */
export function roundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  let quotient = abs / denominator;
  if ((abs % denominator) * 2n >= denominator) quotient += 1n;
  return negative ? -quotient : quotient;
}

/** "552328.77" / Decimal → 55232877n (tiyin). Never via Number (CONSTITUTION §7). */
export function toTiyin(value: string | Prisma.Decimal): bigint {
  return scaled(typeof value === 'string' ? value : value.toFixed(2), 2);
}

/** "14.5" / Decimal → 145000n (percent × 10⁴). */
export function toRateE4(value: string | Prisma.Decimal): bigint {
  return scaled(typeof value === 'string' ? value : value.toFixed(4), 4);
}

function scaled(value: string, places: number): bigint {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result = BigInt(whole + fraction.padEnd(places, '0').slice(0, places));
  return negative ? -result : result;
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const utc = (day: IsoDate) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const iso = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;
const addDays = (day: IsoDate, n: number) => iso(utc(day) + n * DAY);
const daysBetween = (from: IsoDate, to: IsoDate) => Math.round((utc(to) - utc(from)) / DAY);
const monthStart = (day: IsoDate): IsoDate => `${day.slice(0, 7)}-01`;
function nextMonth(first: IsoDate): IsoDate {
  const d = new Date(utc(first));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return iso(d.getTime());
}
const monthEnd = (first: IsoDate) => addDays(nextMonth(first), -1);
