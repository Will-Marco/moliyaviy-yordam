import { fromDbDate, IsoDate } from '../common/dates.js';
import { moneyString, rateString } from '../common/decimal.js';
import { Prisma } from '../generated/prisma/client.js';

export const contractInclude = {
  lender: { select: { id: true, name: true, tin: true } },
  borrower: { select: { id: true, name: true, tin: true } },
  rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
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
    ...(withRates && { rates }),
  };
}
