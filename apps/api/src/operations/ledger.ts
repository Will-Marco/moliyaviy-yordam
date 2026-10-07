import type { IsoDate } from '../common/dates.js';
import { formatDate, formatMoney } from '../common/format.js';
import { Prisma } from '../generated/prisma/client.js';

// Pure bookkeeping over a contract's operations — no database, no clock (CONSTITUTION §9).

export type OperationType = 'DISBURSEMENT' | 'PRINCIPAL_REPAYMENT' | 'INTEREST_PAYMENT';

export interface LedgerOperation {
  id: string;
  date: IsoDate;
  type: OperationType;
  amount: Prisma.Decimal;
}

export interface Warning {
  code: 'LIMIT_EXCEEDED' | 'NEGATIVE_BALANCE' | 'BEFORE_START' | 'AFTER_END' | 'FUTURE_DATE' | 'INTEREST_OVERPAID';
  message: string;
}

const ZERO = new Prisma.Decimal(0);

/** Effect on the principal balance (CR-1, CR-8). */
const principalDelta = (op: LedgerOperation) =>
  op.type === 'DISBURSEMENT' ? op.amount : op.type === 'PRINCIPAL_REPAYMENT' ? op.amount.neg() : ZERO;

/** Stable sort by date: entry order is kept within a day. */
const byDate = <T extends { date: IsoDate }>(ops: T[]) => [...ops].sort((a, b) => a.date.localeCompare(b.date));

export function withBalances<T extends LedgerOperation>(ops: T[]): (T & { balanceAfter: Prisma.Decimal })[] {
  let balance = ZERO;
  return byDate(ops).map((op) => {
    balance = balance.add(principalDelta(op));
    return { ...op, balanceAfter: balance };
  });
}

export function ledgerTotals(ops: LedgerOperation[]) {
  const sum = (type: OperationType) =>
    ops.filter((op) => op.type === type).reduce((acc, op) => acc.add(op.amount), ZERO);
  const disbursed = sum('DISBURSEMENT');
  const repaid = sum('PRINCIPAL_REPAYMENT');
  return { disbursed, repaid, interestPaid: sum('INTEREST_PAYMENT'), principalBalance: disbursed.sub(repaid) };
}

/** Lowest end-of-day balance and the first day it is reached (CR-1 uses end-of-day balances). */
function lowestBalance(ops: LedgerOperation[]): { date: IsoDate; balance: Prisma.Decimal } | null {
  const rows = withBalances(ops);
  let lowest: { date: IsoDate; balance: Prisma.Decimal } | null = null;
  rows.forEach((row, i) => {
    const endOfDay = i === rows.length - 1 || rows[i + 1].date !== row.date;
    if (endOfDay && (!lowest || row.balanceAfter.lt(lowest.balance))) {
      lowest = { date: row.date, balance: row.balanceAfter };
    }
  });
  return lowest;
}

interface ContractTerms {
  limitAmount: Prisma.Decimal;
  startDate: IsoDate;
  endDate: IsoDate;
}

/**
 * FR-3.3: non-blocking warnings for adding/editing `candidate`, comparing the ledger before and after.
 * Already-accepted problems are not repeated unless the change makes them worse.
 */
export function operationWarnings(
  contract: ContractTerms,
  before: LedgerOperation[],
  after: LedgerOperation[],
  candidate: LedgerOperation,
): Warning[] {
  const warnings: Warning[] = [];
  const previous = before.find((op) => op.id === candidate.id);
  const sameDateAndType = previous?.date === candidate.date && previous.type === candidate.type;

  if (candidate.type === 'DISBURSEMENT') {
    const disbursedAfter = ledgerTotals(after).disbursed;
    const excess = disbursedAfter.sub(contract.limitAmount);
    if (excess.gt(0) && disbursedAfter.gt(ledgerTotals(before).disbursed)) {
      warnings.push({ code: 'LIMIT_EXCEEDED', message: `Jami berilgan summa limitdan ${formatMoney(excess)} so'mga oshadi` });
    }
  }

  const low = lowestBalance(after);
  const previousLow = lowestBalance(before)?.balance ?? ZERO;
  if (low && low.balance.isNegative() && low.balance.lt(previousLow)) {
    warnings.push({
      code: 'NEGATIVE_BALANCE',
      message: `${formatDate(low.date)} da asosiy qarz qoldig'i manfiy bo'ladi: ${formatMoney(low.balance)} so'm`,
    });
  }

  if (candidate.date < contract.startDate && !sameDateAndType) {
    warnings.push({
      code: 'BEFORE_START',
      message: `Operatsiya sanasi shartnoma boshlanishidan (${formatDate(contract.startDate)}) oldin`,
    });
  }

  if (candidate.type === 'DISBURSEMENT' && candidate.date > contract.endDate && !sameDateAndType) {
    warnings.push({
      code: 'AFTER_END',
      message: `Shartnoma muddati (${formatDate(contract.endDate)}) tugaganidan keyin pul berilmoqda`,
    });
  }

  return warnings;
}
