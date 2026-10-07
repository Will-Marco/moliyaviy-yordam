import { computeInterest, EngineInput, roundHalfAwayFromZero, toRateE4, toTiyin } from './engine.js';
import { oracleMonthlyNumerators } from './oracle.js';

const so = (v: string) => toTiyin(v);
const rate = (percent: string, effectiveFrom: string) => ({ ratePercentE4: toRateE4(percent), effectiveFrom });
const D = 'DISBURSEMENT' as const;
const R = 'PRINCIPAL_REPAYMENT' as const;
const P = 'INTEREST_PAYMENT' as const;

/** SRS etalon contract. */
const etalon = (asOf: string, extra: EngineInput['operations'] = []): EngineInput => ({
  startDate: '2026-01-01',
  asOf,
  rates: [rate('14', '2026-01-01')],
  operations: [
    { date: '2026-01-05', type: D, amount: so('60000000') },
    { date: '2026-01-20', type: R, amount: so('15000000') },
    ...extra,
  ],
});

const month = (input: EngineInput, m: string) => {
  const row = computeInterest(input).months.find((x) => x.month === m);
  if (!row) throw new Error(`no row for ${m}`);
  return row;
};

describe('interest engine', () => {
  describe('SRS etalon', () => {
    it('January 2026 = 552 328,77 (exact 552 328,767123…) — CR-1, CR-4', () => {
      const jan = month(etalon('2026-02-28'), '2026-01');
      expect(jan.interest).toBe(55232877n);
      expect(jan.interestExactE6).toBe(552328767123n);
      expect(jan.segments.map((s) => [s.from, s.to, s.days, s.balance])).toEqual([
        ['2026-01-01', '2026-01-04', 4, 0n],
        ['2026-01-05', '2026-01-19', 15, 6000000000n],
        ['2026-01-20', '2026-01-31', 12, 4500000000n],
      ]);
    });

    it('February 2026 = 483 287,67', () => {
      expect(month(etalon('2026-02-28'), '2026-02').interest).toBe(48328767n);
    });

    it('keeps opening + disbursed − repaid = closing per month', () => {
      for (const row of computeInterest(etalon('2026-06-15')).months) {
        expect(row.openingBalance + row.disbursed - row.repaid).toBe(row.closingBalance);
      }
    });
  });

  it('uses 366 days in a leap year — Feb 2028 = 499 180,33 (CR-2)', () => {
    const input: EngineInput = {
      startDate: '2028-02-01',
      asOf: '2028-03-31',
      rates: [rate('14', '2028-02-01')],
      operations: [{ date: '2028-02-01', type: D, amount: so('45000000') }],
    };
    const feb = month(input, '2028-02');
    expect(feb.segments[0].yearDays).toBe(366);
    expect(feb.interest).toBe(49918033n);
  });

  it('applies a rate change from its effective date (CR-5), last entry wins on ties', () => {
    const input: EngineInput = {
      startDate: '2026-01-01',
      asOf: '2026-04-30',
      rates: [rate('14', '2026-01-01'), rate('16', '2026-04-01'), rate('15', '2026-04-01')],
      operations: [{ date: '2026-01-01', type: D, amount: so('36500000') }],
    };
    // 36 500 000 × 15% × 30 / 365 = 450 000,00
    expect(month(input, '2026-04').interest).toBe(45000000n);
    expect(month(input, '2026-04').rates).toEqual([150000n]);
    expect(month(input, '2026-03').rates).toEqual([140000n]);
  });

  it('starts mid-month with the initial rate from the start date', () => {
    const input: EngineInput = {
      startDate: '2026-03-17',
      asOf: '2026-03-31',
      rates: [rate('10', '2026-03-17')],
      operations: [{ date: '2026-03-01', type: D, amount: so('36500000') }],
    };
    const mar = month(input, '2026-03');
    // pre-start disbursement is in the balance, interest only from 17.03: 15 days × 10 000 = 150 000,00
    expect(mar.from).toBe('2026-03-17');
    expect(mar.openingBalance).toBe(so('36500000'));
    expect(mar.interest).toBe(15000000n);
  });

  it('nets several operations on the same day by end of day (CR-1)', () => {
    const input = etalon('2026-01-31', [
      { date: '2026-01-25', type: D, amount: so('1000') },
      { date: '2026-01-25', type: R, amount: so('1000') },
    ]);
    expect(month(input, '2026-01').interest).toBe(55232877n);
  });

  it('charges negative interest on a negative balance (CR-10)', () => {
    const input = etalon('2026-01-31', [{ date: '2026-01-25', type: R, amount: so('50000000') }]);
    const jan = month(input, '2026-01');
    expect(jan.closingBalance).toBe(so('-5000000'));
    // 60M×15 + 45M×5 − 5M×7 = 1 090 000 000 so'm-days × 14% / 365
    expect(jan.interest).toBe(roundHalfAwayFromZero(109000000000n * 140000n, 365000000n));
  });

  it('keeps charging after the term while principal remains (CR-6)', () => {
    const input: EngineInput = {
      startDate: '2026-01-01',
      asOf: '2026-03-31',
      rates: [rate('14', '2026-01-01')],
      operations: [{ date: '2026-01-01', type: D, amount: so('36500000') }],
    };
    expect(month(input, '2026-03').interest).toBe(43400000n); // 36.5M × 14% × 31 / 365
  });

  it('only counts operations up to asOf; the current month is partial (CR-11)', () => {
    const input = etalon('2026-02-10', [{ date: '2026-02-20', type: D, amount: so('1000000000') }]);
    const { months } = computeInterest(input);
    expect(months.map((m) => [m.month, m.partial, m.to])).toEqual([
      ['2026-01', false, '2026-01-31'],
      ['2026-02', true, '2026-02-10'],
    ]);
    expect(months[1].disbursed).toBe(0n);
    expect(months[1].segments.at(-1)!.days).toBe(10);
  });

  it('treats the month as in progress on its own last day (FR-4.4)', () => {
    const { months } = computeInterest(etalon('2026-01-31'));
    expect(months[0]).toMatchObject({ to: '2026-01-31', partial: true });
    expect(computeInterest(etalon('2026-02-01')).months[0].partial).toBe(false);
  });

  it('returns no months before the start and one day on the start date', () => {
    expect(computeInterest(etalon('2025-12-31')).months).toEqual([]);
    const first = computeInterest(etalon('2026-01-01')).months;
    expect(first).toHaveLength(1);
    expect(first[0].segments[0].days).toBe(1);
  });

  it('accrues simple interest only — unpaid interest earns nothing (CR-3)', () => {
    const input: EngineInput = {
      startDate: '2026-01-01',
      asOf: '2026-12-31',
      rates: [rate('12', '2026-01-01')],
      operations: [{ date: '2026-01-01', type: D, amount: so('36500000') }],
    };
    const { months } = computeInterest(input);
    // every 31-day month identical: interest never grows with the unpaid debt
    expect(new Set(months.filter((m) => m.segments[0].days === 31).map((m) => m.interest)).size).toBe(1);
  });

  it('tracks interest debt from rounded months minus payments (CR-8)', () => {
    const input = etalon('2026-02-28', [{ date: '2026-02-05', type: P, amount: so('552328.77') }]);
    const [jan, feb] = computeInterest(input).months;
    expect(jan.interestDebt).toBe(55232877n);
    expect(feb.interestPaid).toBe(55232877n);
    expect(feb.interestDebt).toBe(48328767n);
  });

  it('recomputes from operations alone — order of input does not matter (CR-9)', () => {
    const input = etalon('2026-03-31');
    const shuffled = { ...input, operations: [...input.operations].reverse() };
    expect(computeInterest(shuffled)).toEqual(computeInterest(input));
  });

  it('rounds half away from zero, also for negative interest (CR-4)', () => {
    expect(roundHalfAwayFromZero(1n, 2n)).toBe(1n);
    expect(roundHalfAwayFromZero(-1n, 2n)).toBe(-1n);
    expect(roundHalfAwayFromZero(4n, 10n)).toBe(0n);
    expect(roundHalfAwayFromZero(-4n, 10n)).toBe(0n);
    // 1,83 so'm at 100% for one day of a leap year = exactly 0,5 tiyin
    const input: EngineInput = {
      startDate: '2028-01-01',
      asOf: '2028-01-01',
      rates: [rate('100', '2028-01-01')],
      operations: [{ date: '2028-01-01', type: D, amount: so('1.83') }],
    };
    expect(computeInterest(input).months[0].interest).toBe(1n);
  });

  it('never needs float: numerators beyond 2^53 stay exact', () => {
    const input: EngineInput = {
      startDate: '2026-01-01',
      asOf: '2026-01-31',
      rates: [rate('99.9999', '2026-01-01')],
      operations: [{ date: '2026-01-01', type: D, amount: so('9999999999999999.99') }],
    };
    const [jan] = computeInterest(input).months;
    expect(jan.interestNumerator > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(jan.interest).toBe(roundHalfAwayFromZero(999999999999999999n * 999999n * 31n, 365000000n));
  });

  it('matches the day-by-day oracle on random contracts', () => {
    const random = mulberry32(20261007);
    const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
    const dateBetween = (from: string, days: number) => {
      const d = new Date(`${from}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Math.floor(random() * days));
      return d.toISOString().slice(0, 10);
    };
    for (let i = 0; i < 150; i++) {
      const startDate = dateBetween('2026-11-01', 600); // crosses 2027 and the 2028 leap year
      const asOf = dateBetween(startDate, 500);
      const rates = [rate(String(1 + Math.floor(random() * 30)), startDate)];
      for (let k = 0; k < 3; k++) {
        const d = dateBetween(startDate, 500).slice(0, 8) + '01';
        if (d > startDate) rates.push(rate(`${Math.floor(random() * 40)}.${Math.floor(random() * 9999)}`, d));
      }
      rates.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      const operations = Array.from({ length: 1 + Math.floor(random() * 8) }, () => ({
        date: dateBetween(startDate.slice(0, 8) + '01', 560),
        type: pick([D, D, R, P]),
        amount: BigInt(1 + Math.floor(random() * 1e12)),
      }));
      const input: EngineInput = { startDate, asOf, rates, operations };
      const oracle = oracleMonthlyNumerators(input);
      const { months } = computeInterest(input);
      expect(months.map((m) => m.month)).toEqual([...oracle.keys()]);
      for (const m of months) {
        const o = oracle.get(m.month)!;
        expect(m.interestNumerator).toBe(o.numerator);
        expect(m.interest).toBe(roundHalfAwayFromZero(o.numerator, 1000000n * o.yearDays));
      }
    }
  });
});

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
