import { fromDbDate, IsoDate } from '../common/dates.js';
import { moneyString, rateString } from '../common/decimal.js';
import { Prisma } from '../generated/prisma/client.js';
import { computeInterest } from '../interest/engine.js';
import { completedInterestDebt, engineInput, money } from '../interest/report.js';
import { ledgerTotals } from '../operations/ledger.js';

export const contractInclude = {
  lender: { select: { id: true, name: true, tin: true } },
  borrower: { select: { id: true, name: true, tin: true } },
  rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
  operations: { select: { id: true, date: true, type: true, amount: true } },
} satisfies Prisma.ContractInclude;

export type ContractRecord = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

export interface RateView {
  id: string;
  /** The rate entered with the contract (FR-5.3/5.4). */
  initial: boolean;
  ratePercent: string;
  changedOn: IsoDate;
  effectiveFrom: IsoDate;
}

export interface ContractView {
  id: string;
  number: string;
  signedOn: IsoDate;
  lender: { id: string; name: string; tin: string };
  borrower: { id: string; name: string; tin: string };
  limitAmount: string;
  startDate: IsoDate;
  endDate: IsoDate;
  currentRate: { ratePercent: string; effectiveFrom: IsoDate };
  /** FR-3.5 — from all recorded operations. */
  /** As of today (CR-11). interestDebt — completed months only (FR-4.4). */
  totals: { disbursed: string; repaid: string; interestPaid: string; principalBalance: string; interestDebt: string };
  rates?: RateView[];
}

/** The rate in force `today` (CR-5): latest effective one; before the start date — the initial rate. */
export function currentRate<T extends Pick<RateView, 'effectiveFrom'>>(rates: T[], today: IsoDate): T {
  const inForce = rates.filter((r) => r.effectiveFrom <= today);
  return inForce.at(-1) ?? rates[0];
}

export function toContractView(record: ContractRecord, today: IsoDate, withRates: boolean): ContractView {
  const initialId = [...record.rateChanges].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.id;
  const rates = record.rateChanges.map((r) => ({
    id: r.id,
    initial: r.id === initialId,
    ratePercent: rateString(r.ratePercent),
    changedOn: fromDbDate(r.changedOn),
    effectiveFrom: fromDbDate(r.effectiveFrom),
  }));
  const { ratePercent, effectiveFrom } = currentRate(rates, today);
  const toDate = record.operations.filter((op) => fromDbDate(op.date) <= today);
  const totals = ledgerTotals(toDate.map((op) => ({ ...op, date: fromDbDate(op.date) })));
  const { months } = computeInterest(engineInput(record, today));
  const paid = months.reduce((sum, m) => sum + m.interestPaid, 0n);
  return {
    id: record.id,
    number: record.number,
    signedOn: fromDbDate(record.signedOn),
    lender: record.lender,
    borrower: record.borrower,
    limitAmount: moneyString(record.limitAmount),
    startDate: fromDbDate(record.startDate),
    endDate: fromDbDate(record.endDate),
    currentRate: { ratePercent, effectiveFrom },
    totals: {
      disbursed: moneyString(totals.disbursed),
      repaid: moneyString(totals.repaid),
      interestPaid: moneyString(totals.interestPaid),
      principalBalance: moneyString(totals.principalBalance),
      interestDebt: money(completedInterestDebt(months, paid)),
    },
    ...(withRates && { rates }),
  };
}
