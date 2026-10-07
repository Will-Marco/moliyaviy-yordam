import { fromDbDate, isIsoDate, toDbDate } from './dates.js';

describe('dates', () => {
  it.each(['2026-01-01', '2028-02-29', '2027-07-31'])('accepts %s', (d) => expect(isIsoDate(d)).toBe(true));
  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '01.01.2026', '2026-1-1', '', 20260101])('rejects %j', (d) =>
    expect(isIsoDate(d)).toBe(false),
  );
  it('round-trips through UTC midnight regardless of the server time zone', () => {
    expect(fromDbDate(toDbDate('2026-01-01'))).toBe('2026-01-01');
    expect(toDbDate('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
