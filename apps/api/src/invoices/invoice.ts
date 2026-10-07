import { IsoDate, lastDayOfMonth, previousMonth } from '../common/dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import { computeInterest, toTiyin } from '../interest/engine.js';
import { ContractForInterest, engineInput, money } from '../interest/report.js';

/*
 * Module 7: one invoice = one contract × one completed month, one line (FR-7.2, SRS §9.1).
 * The amount is the core's rounded month interest — never computed here (CONSTITUTION §11).
 */

const RU_MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

/** §9.1 line template — fixed for every contract; only the month changes. */
export function invoiceLineName(month: string): string {
  const [year, m] = month.split('-');
  return `Берилган молиявий ёрдамнинг фоиз куринишидаги даромади за ${RU_MONTHS[Number(m) - 1]} ${year} г.`;
}

/** Invoices are prepared only after the month is over. */
export const isCompletedMonth = (month: string, today: IsoDate) => month < today.slice(0, 7);

/** Months that can be invoiced: from the earliest contract start up to last month, newest first. */
export function completedMonths(startDates: IsoDate[], today: IsoDate): string[] {
  if (!startDates.length) return [];
  const first = [...startDates].sort()[0].slice(0, 7);
  const months: string[] = [];
  for (let month = previousMonth(today.slice(0, 7)); month >= first; month = previousMonth(month)) months.push(month);
  return months;
}

export interface StoredDraft {
  amount: Prisma.Decimal;
  didoxDocumentId: string | null;
  draftedAt: Date;
}

export interface InvoiceRow {
  lineName: string;
  amount: string;
  /** Null — `tayyor`; otherwise `qoralama yaratildi` (FR-7.4). */
  draft: { amount: string; didoxDocumentId: string | null; draftedAt: string; amountChanged: boolean } | null;
}

/**
 * Month interest in tiyin, rounded (CR-4); 0 if the month is outside the contract.
 * A month's interest depends only on its own days, so the core stops at the month's last day.
 */
export function monthInterest(contract: ContractForInterest, month: string, today: IsoDate): bigint {
  const last = lastDayOfMonth(month);
  const row = computeInterest(engineInput(contract, last < today ? last : today)).months.find((m) => m.month === month);
  return row?.interest ?? 0n;
}

/**
 * FR-7.1: a row only when the month has positive interest — or when a draft already exists,
 * so a draft whose amount no longer matches stays visible.
 */
export function invoiceRow(month: string, interest: bigint, draft: StoredDraft | null): InvoiceRow | null {
  if (interest <= 0n && !draft) return null;
  return {
    lineName: invoiceLineName(month),
    amount: money(interest),
    draft: draft && {
      amount: money(toTiyin(draft.amount)),
      didoxDocumentId: draft.didoxDocumentId,
      draftedAt: draft.draftedAt.toISOString(),
      amountChanged: toTiyin(draft.amount) !== interest,
    },
  };
}
