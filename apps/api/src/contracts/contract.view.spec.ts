import { currentRate } from './contract.view.js';

const rates = [
  { ratePercent: '14', changedOn: '2026-01-01', effectiveFrom: '2026-01-01' },
  { ratePercent: '16', changedOn: '2026-03-15', effectiveFrom: '2026-04-01' },
  { ratePercent: '15', changedOn: '2026-04-01', effectiveFrom: '2026-04-01' },
];

describe('currentRate (CR-5)', () => {
  it.each([
    ['2025-12-31', '14'], // before the start: the initial rate
    ['2026-01-01', '14'],
    ['2026-03-31', '14'],
    ['2026-04-01', '15'], // same effective date: the later entry wins
    ['2027-01-01', '15'],
  ])('on %s is %s%%', (today, expected) => {
    expect(currentRate(rates, today).ratePercent).toBe(expected);
  });
});
