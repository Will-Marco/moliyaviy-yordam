import { Prisma } from '../generated/prisma/client.js';
import type { ContractForInterest } from '../interest/report.js';
import { completedMonths, invoiceLineName, invoiceRow, isCompletedMonth, monthInterest } from './invoice.js';

describe('invoiceLineName (§9.1)', () => {
  it('uses the fixed template with the Russian month name', () => {
    expect(invoiceLineName('2026-08')).toBe(
      'Берилган молиявий ёрдамнинг фоиз куринишидаги даромади за август 2026 г.',
    );
  });

  it.each([
    ['01', 'январь'],
    ['02', 'февраль'],
    ['03', 'март'],
    ['04', 'апрель'],
    ['05', 'май'],
    ['06', 'июнь'],
    ['07', 'июль'],
    ['09', 'сентябрь'],
    ['10', 'октябрь'],
    ['11', 'ноябрь'],
    ['12', 'декабрь'],
  ])('month %s → %s', (month, name) => expect(invoiceLineName(`2025-${month}`)).toContain(`за ${name} 2025 г.`));
});

describe('isCompletedMonth', () => {
  it('is true only for months before today’s month', () => {
    expect(isCompletedMonth('2026-09', '2026-10-01')).toBe(true);
    expect(isCompletedMonth('2025-12', '2026-01-01')).toBe(true);
    expect(isCompletedMonth('2026-10', '2026-10-31')).toBe(false);
    expect(isCompletedMonth('2026-11', '2026-10-07')).toBe(false);
  });
});

describe('completedMonths', () => {
  it('lists months from the earliest start to last month, newest first', () => {
    expect(completedMonths(['2026-07-15', '2026-08-01'], '2026-10-07')).toEqual(['2026-09', '2026-08', '2026-07']);
  });

  it('crosses years', () => {
    expect(completedMonths(['2025-11-30'], '2026-02-01')).toEqual(['2026-01', '2025-12', '2025-11']);
  });

  it('is empty without contracts or when every contract starts this month or later', () => {
    expect(completedMonths([], '2026-10-07')).toEqual([]);
    expect(completedMonths(['2026-10-01', '2027-01-01'], '2026-10-07')).toEqual([]);
  });
});

describe('monthInterest and invoiceRow (FR-7.1–7.4)', () => {
  const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const etalon: ContractForInterest = {
    startDate: d('2026-01-01'),
    rateChanges: [{ ratePercent: new Prisma.Decimal('14'), effectiveFrom: d('2026-01-01') }],
    operations: [
      { date: d('2026-01-05'), type: 'DISBURSEMENT', amount: new Prisma.Decimal('60000000') },
      { date: d('2026-01-20'), type: 'PRINCIPAL_REPAYMENT', amount: new Prisma.Decimal('15000000') },
    ],
  };

  it('takes the rounded month interest from the core — SRS etalon January 552 328,77 (FR-7.3)', () => {
    expect(monthInterest(etalon, '2026-01', '2026-10-07')).toBe(55232877n);
    expect(monthInterest(etalon, '2026-02', '2026-03-01')).toBe(48328767n);
  });

  it('is zero outside the contract and when nothing is owed (FR-7.1)', () => {
    expect(monthInterest(etalon, '2025-12', '2026-10-07')).toBe(0n);
    const repaid: ContractForInterest = {
      ...etalon,
      operations: [...etalon.operations, { date: d('2026-01-31'), type: 'PRINCIPAL_REPAYMENT', amount: new Prisma.Decimal('45000000') }],
    };
    expect(monthInterest(repaid, '2026-02', '2026-10-07')).toBe(0n);
  });

  it('is negative for an overpaid principal (CR-10)', () => {
    const overpaid: ContractForInterest = {
      ...etalon,
      operations: [...etalon.operations, { date: d('2026-01-31'), type: 'PRINCIPAL_REPAYMENT', amount: new Prisma.Decimal('46000000') }],
    };
    expect(monthInterest(overpaid, '2026-02', '2026-10-07')).toBeLessThan(0n);
  });

  it('builds the §9.1 line for positive interest', () => {
    expect(invoiceRow('2026-01', 55232877n, null)).toEqual({
      lineName: 'Берилган молиявий ёрдамнинг фоиз куринишидаги даромади за январь 2026 г.',
      amount: '552328.77',
      draft: null,
    });
  });

  it('is null without positive interest (FR-7.1)', () => {
    expect(invoiceRow('2026-01', 0n, null)).toBeNull();
    expect(invoiceRow('2026-01', -5n, null)).toBeNull();
  });

  it('marks a draft and flags an amount that changed since (FR-7.4)', () => {
    const draft = { amount: new Prisma.Decimal('552328.77'), didoxDocumentId: 'abc', draftedAt: new Date('2026-02-01T04:00:00Z') };
    expect(invoiceRow('2026-01', 55232877n, draft)?.draft).toEqual({
      amount: '552328.77',
      didoxDocumentId: 'abc',
      draftedAt: '2026-02-01T04:00:00.000Z',
      amountChanged: false,
    });
    const stale = { ...draft, amount: new Prisma.Decimal('500000') };
    expect(invoiceRow('2026-01', 55232877n, stale)?.draft).toMatchObject({ amount: '500000.00', amountChanged: true });
  });

  it('keeps a drafted month even if its interest is now zero, so the stale draft is visible', () => {
    const draft = { amount: new Prisma.Decimal('100'), didoxDocumentId: null, draftedAt: new Date('2026-01-01T00:00:00Z') };
    expect(invoiceRow('2025-12', 0n, draft)).toMatchObject({
      amount: '0.00',
      draft: { amount: '100.00', amountChanged: true },
    });
  });
});
