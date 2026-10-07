import { fromDbDate, IsoDate } from '../common/dates.js';
import { moneyString, rateString } from '../common/decimal.js';
import { Prisma } from '../generated/prisma/client.js';
import { ledgerTotals } from '../operations/ledger.js';

export const contractInclude = {
  lender: { select: { id: true, name: true, tin: true } },
  borrower: { select: { id: true, name: true, tin: true } },
  rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
  operations: { select: { id: true, date: true, type: true, amount: true } },
} satisfies Prisma.ContractInclude;

export type ContractRecord = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

export interface RateView {
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
  totals: { disbursed: string; repaid: string; interestPaid: string; principalBalance: string };
  rates?: RateView[];
}

/** The rate in force `today` (CR-5): latest effective one; before the start date — the initial rate. */
export function currentRate(rates: RateView[], today: IsoDate): RateView {
  const inForce = rates.filter((r) => r.effectiveFrom <= today);
  return inForce.at(-1) ?? rates[0];
}

export function toContractView(record: ContractRecord, today: IsoDate, withRates: boolean): ContractView {
  const rates = record.rateChanges.map((r) => ({
    ratePercent: rateString(r.ratePercent),
    changedOn: fromDbDate(r.changedOn),
    effectiveFrom: fromDbDate(r.effectiveFrom),
  }));
  const { ratePercent, effectiveFrom } = currentRate(rates, today);
  const totals = ledgerTotals(record.operations.map((op) => ({ ...op, date: fromDbDate(op.date) })));
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
    },
    ...(withRates && { rates }),
  };
}
