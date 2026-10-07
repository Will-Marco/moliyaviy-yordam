import { Prisma } from '../generated/prisma/client.js';
import { LedgerOperation, ledgerTotals, operationWarnings, withBalances } from './ledger.js';

const D = (v: string) => new Prisma.Decimal(v);
let seq = 0;
const op = (date: string, type: LedgerOperation['type'], amount: string): LedgerOperation => ({
  id: `op${++seq}`,
  date,
  type,
  amount: D(amount),
});

/** SRS etalon: 10 mlrd, 01.01.2026 – 31.07.2027 */
const contract = { limitAmount: D('10000000000'), startDate: '2026-01-01', endDate: '2027-07-31' };
const etalonOps = [op('2026-01-05', 'DISBURSEMENT', '60000000'), op('2026-01-20', 'PRINCIPAL_REPAYMENT', '15000000')];

describe('ledger', () => {
  it('keeps a running principal balance; interest payments do not touch it (CR-8)', () => {
    const rows = withBalances([...etalonOps, op('2026-01-31', 'INTEREST_PAYMENT', '500000')]);
    expect(rows.map((r) => r.balanceAfter.toFixed(2))).toEqual(['60000000.00', '45000000.00', '45000000.00']);
  });

  it('orders by date, keeping entry order within a day', () => {
    const rows = withBalances([
      op('2026-02-01', 'PRINCIPAL_REPAYMENT', '5'),
      op('2026-01-10', 'DISBURSEMENT', '10'),
      op('2026-02-01', 'DISBURSEMENT', '1'),
    ]);
    expect(rows.map((r) => `${r.date}:${r.balanceAfter.toString()}`)).toEqual([
      '2026-01-10:10',
      '2026-02-01:5',
      '2026-02-01:6',
    ]);
  });

  it('totals disbursed, repaid, interest paid and the principal balance', () => {
    const totals = ledgerTotals([...etalonOps, op('2026-02-10', 'INTEREST_PAYMENT', '535068.49')]);
    expect(Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(2)]))).toEqual({
      disbursed: '60000000.00',
      repaid: '15000000.00',
      interestPaid: '535068.49',
      principalBalance: '45000000.00',
    });
  });

  describe('operationWarnings (FR-3.3)', () => {
    const codes = (before: LedgerOperation[], after: LedgerOperation[], candidate: LedgerOperation) =>
      operationWarnings(contract, before, after, candidate).map((w) => w.code);

    it('is quiet for the etalon operations', () => {
      const candidate = etalonOps[1];
      expect(codes([etalonOps[0]], etalonOps, candidate)).toEqual([]);
    });

    it('warns when total disbursements exceed the limit, saying by how much (CR-7)', () => {
      const big = op('2026-03-01', 'DISBURSEMENT', '9945000000');
      const [warning] = operationWarnings(contract, etalonOps, [...etalonOps, big], big);
      expect(warning).toEqual({
        code: 'LIMIT_EXCEEDED',
        message: "Jami berilgan summa limitdan 5 000 000,00 so'mga oshadi",
      });
    });

    it('warns about the first date the balance turns negative (CR-10)', () => {
      const repay = op('2026-01-25', 'PRINCIPAL_REPAYMENT', '50000000');
      const [warning] = operationWarnings(contract, etalonOps, [...etalonOps, repay], repay);
      expect(warning).toEqual({
        code: 'NEGATIVE_BALANCE',
        message: "25.01.2026 da asosiy qarz qoldig'i manfiy bo'ladi: −5 000 000,00 so'm",
      });
    });

    it('catches a negative balance caused by shrinking an earlier disbursement', () => {
      const smaller = { ...etalonOps[0], amount: D('10000000') };
      expect(codes(etalonOps, [smaller, etalonOps[1]], smaller)).toEqual(['NEGATIVE_BALANCE']);
    });

    it('does not repeat a negative balance that is already accepted and not worsened', () => {
      const repay = op('2026-01-25', 'PRINCIPAL_REPAYMENT', '50000000');
      const before = [...etalonOps, repay];
      const pay = op('2026-02-01', 'INTEREST_PAYMENT', '1000');
      expect(codes(before, [...before, pay], pay)).toEqual([]);
    });

    it('does not repeat an accepted over-limit total unless the edit increases it', () => {
      const big = op('2026-03-01', 'DISBURSEMENT', '9945000000');
      const before = [...etalonOps, big];
      const renoted = { ...big };
      expect(codes(before, [...etalonOps, renoted], renoted)).toEqual([]);
      const bigger = { ...big, amount: D('9946000000') };
      expect(codes(before, [...etalonOps, bigger], bigger)).toEqual(['LIMIT_EXCEEDED']);
    });

    it('does not repeat date warnings when the date and type are unchanged', () => {
      const early = op('2025-12-31', 'INTEREST_PAYMENT', '1');
      const edited = { ...early, amount: D('2') };
      expect(codes([early], [edited], edited)).toEqual([]);
      const late = op('2027-08-01', 'DISBURSEMENT', '1');
      const lateEdited = { ...late, amount: D('2') };
      expect(codes([etalonOps[0], late], [etalonOps[0], lateEdited], lateEdited)).toEqual([]);
      const moved = { ...early, date: '2025-12-30' };
      expect(codes([early], [moved], moved)).toEqual(['BEFORE_START']);
    });

    it('warns about dates before the start and disbursements after the end', () => {
      const early = op('2025-12-31', 'INTEREST_PAYMENT', '1');
      expect(codes([], [early], early)).toEqual(['BEFORE_START']);
      const late = op('2027-08-01', 'DISBURSEMENT', '1');
      expect(codes([], [late], late)).toEqual(['AFTER_END']);
      const lateRepay = op('2027-08-01', 'PRINCIPAL_REPAYMENT', '1');
      expect(codes([etalonOps[0]], [etalonOps[0], lateRepay], lateRepay)).toEqual([]);
    });
  });
});
