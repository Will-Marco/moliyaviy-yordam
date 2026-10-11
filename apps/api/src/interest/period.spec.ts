import { computeInterest, EngineInput } from './engine.js';
import { periodSummary } from './period.js';

/** SRS etalon: 14 %, 05.01 — 60 mln berildi, 20.01 — 15 mln qaytarildi; seen on 15.03.2026. */
const etalon: EngineInput = {
  startDate: '2026-01-01',
  asOf: '2026-03-15',
  rates: [{ ratePercentE4: 140000n, effectiveFrom: '2026-01-01' }],
  operations: [
    { date: '2026-01-05', type: 'DISBURSEMENT', amount: 6_000_000_000n },
    { date: '2026-01-20', type: 'PRINCIPAL_REPAYMENT', amount: 1_500_000_000n },
    { date: '2026-02-10', type: 'INTEREST_PAYMENT', amount: 30_000_000n },
  ],
};
const months = computeInterest(etalon).months;

describe('periodSummary (FR-12.2)', () => {
  it('sums movements and rounded month interest inside the period — acceptance Jan–Feb 2026', () => {
    expect(periodSummary(months, '2026-01', '2026-02')).toEqual({
      disbursed: 6_000_000_000n,
      repaid: 1_500_000_000n,
      interest: 55_232_877n + 48_328_767n, // 1 035 616,44 — same as the two invoices
      interestPaid: 30_000_000n,
      closingBalance: 4_500_000_000n,
      interestDebt: 103_561_644n - 30_000_000n,
    });
  });

  it('takes balances at the end of the period and only that period’s movements', () => {
    expect(periodSummary(months, '2026-02', '2026-02')).toMatchObject({
      disbursed: 0n,
      repaid: 0n,
      interest: 48_328_767n,
      interestPaid: 30_000_000n,
      closingBalance: 4_500_000_000n,
    });
  });

  it('counts the current month up to today', () => {
    expect(periodSummary(months, '2026-03', '2026-03')?.interest).toBe(25_890_411n); // 45M × 14 % × 15 / 365
  });

  it('starts at the contract start when the period begins earlier', () => {
    expect(periodSummary(months, '2025-11', '2026-01')).toMatchObject({ disbursed: 6_000_000_000n, interest: 55_232_877n });
  });

  it('is null when the contract starts after the period', () => {
    expect(periodSummary(months, '2025-06', '2025-12')).toBeNull();
  });
});
