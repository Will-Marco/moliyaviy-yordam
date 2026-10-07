import { effectiveFromOf, retroactiveMonths } from './rates.js';

describe('effectiveFromOf (CR-5)', () => {
  it.each([
    ['2026-03-15', '2026-04-01'],
    ['2026-04-01', '2026-04-01'],
    ['2026-12-31', '2027-01-01'],
    ['2026-01-02', '2026-02-01'],
  ])('%s → %s', (changedOn, effective) => expect(effectiveFromOf(changedOn)).toBe(effective));
});

describe('retroactiveMonths (FR-5.5)', () => {
  it('lists completed months from the effective month to last month', () => {
    expect(retroactiveMonths('2026-04-01', '2026-01-01', '2026-05-10')).toEqual({ from: '2026-04', to: '2026-04' });
    expect(retroactiveMonths('2026-02-01', '2026-01-01', '2026-10-31')).toEqual({ from: '2026-02', to: '2026-09' });
  });

  it('never reaches before the contract start month', () => {
    expect(retroactiveMonths('2025-11-01', '2026-01-15', '2026-03-01')).toEqual({ from: '2026-01', to: '2026-02' });
  });

  it('is empty for the current month and the future', () => {
    expect(retroactiveMonths('2026-05-01', '2026-01-01', '2026-05-10')).toBeNull();
    expect(retroactiveMonths('2026-06-01', '2026-01-01', '2026-05-10')).toBeNull();
    expect(retroactiveMonths('2026-01-01', '2026-01-01', '2026-01-31')).toBeNull();
  });
});
