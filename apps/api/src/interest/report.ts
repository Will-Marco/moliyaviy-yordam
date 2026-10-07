import { fromDbDate, IsoDate } from '../common/dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OperationType } from '../operations/ledger.js';
import { computeInterest, EngineInput, MonthRow, toRateE4, toTiyin } from './engine.js';

/** What the engine needs from a stored contract (rates ordered by effectiveFrom, then entry). */
export interface ContractForInterest {
  startDate: Date;
  rateChanges: { ratePercent: Prisma.Decimal; effectiveFrom: Date }[];
  operations: { date: Date; type: OperationType; amount: Prisma.Decimal }[];
}

export function engineInput(contract: ContractForInterest, asOf: IsoDate): EngineInput {
  return {
    startDate: fromDbDate(contract.startDate),
    asOf,
    rates: contract.rateChanges.map((r) => ({ ratePercentE4: toRateE4(r.ratePercent), effectiveFrom: fromDbDate(r.effectiveFrom) })),
    operations: contract.operations.map((op) => ({ date: fromDbDate(op.date), type: op.type, amount: toTiyin(op.amount) })),
  };
}

/** Interest debt for completed months only — the figure invoices are based on (FR-4.4). */
export function completedInterestDebt(months: MonthRow[], paidToDate: bigint): bigint {
  return months.filter((m) => !m.partial).reduce((sum, m) => sum + m.interest, 0n) - paidToDate;
}

// ---- API view (strings only, CONSTITUTION §7) ----

/** 55232877n → "552328.77" */
export function money(tiyin: bigint): string {
  return fixed(tiyin, 2);
}

/** 145000n → "14.5" */
export function percent(e4: bigint): string {
  return fixed(e4, 4).replace(/\.?0+$/, '');
}

function fixed(value: bigint, places: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(places + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

export function reportView(contract: ContractForInterest, asOf: IsoDate) {
  const { months } = computeInterest(engineInput(contract, asOf));
  const accrued = months.reduce((sum, m) => sum + m.interest, 0n);
  const paid = months.reduce((sum, m) => sum + m.interestPaid, 0n);
  return {
    asOf,
    months: months.map((m) => ({
      month: m.month,
      from: m.from,
      to: m.to,
      partial: m.partial,
      rates: m.rates.map(percent),
      openingBalance: money(m.openingBalance),
      disbursed: money(m.disbursed),
      repaid: money(m.repaid),
      closingBalance: money(m.closingBalance),
      interest: money(m.interest),
      interestExact: fixed(m.interestExactE6, 6),
      interestPaid: money(m.interestPaid),
      interestDebt: money(m.interestDebt),
      segments: m.segments.map((s) => ({
        from: s.from,
        to: s.to,
        days: s.days,
        balance: money(s.balance),
        ratePercent: percent(s.ratePercentE4),
        yearDays: s.yearDays,
        interestExact: fixed(s.interestExactE6, 6),
      })),
    })),
    totals: {
      interestAccrued: money(accrued),
      interestPaid: money(paid),
      interestDebt: money(accrued - paid),
      interestDebtCompleted: money(completedInterestDebt(months, paid)),
    },
  };
}
