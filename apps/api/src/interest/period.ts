import type { MonthRow } from './engine.js';

/** FR-12.2: one contract over whole months — movements inside the period, balances at its end. */
export interface PeriodSummary {
  disbursed: bigint;
  repaid: bigint;
  /** Σ rounded month interest — equals the sum of that period's invoices (CONSTITUTION §11). */
  interest: bigint;
  interestPaid: bigint;
  closingBalance: bigint;
  interestDebt: bigint;
}

/** `from`/`to` are "yyyy-mm" (inclusive). Null when the contract has no month in the period. */
export function periodSummary(months: MonthRow[], from: string, to: string): PeriodSummary | null {
  const inPeriod = months.filter((m) => m.month >= from && m.month <= to);
  const last = inPeriod.at(-1);
  if (!last) return null;
  const sum = (pick: (m: MonthRow) => bigint) => inPeriod.reduce((total, m) => total + pick(m), 0n);
  return {
    disbursed: sum((m) => m.disbursed),
    repaid: sum((m) => m.repaid),
    interest: sum((m) => m.interest),
    interestPaid: sum((m) => m.interestPaid),
    closingBalance: last.closingBalance,
    interestDebt: last.interestDebt,
  };
}
