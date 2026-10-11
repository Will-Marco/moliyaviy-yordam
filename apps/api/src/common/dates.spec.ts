import { dateError, fromDbDate, isIsoDate, lastDayOfMonth, previousMonth, toDbDate } from './dates.js';

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

describe('month helpers', () => {
  it.each([
    ['2026-10', '2026-09'],
    ['2026-01', '2025-12'],
  ])('previousMonth(%s) → %s', (month, previous) => expect(previousMonth(month)).toBe(previous));

  it.each([
    ['2026-01', '2026-01-31'],
    ['2026-02', '2026-02-28'],
    ['2028-02', '2028-02-29'],
    ['2026-12', '2026-12-31'],
  ])('lastDayOfMonth(%s) → %s', (month, last) => expect(lastDayOfMonth(month)).toBe(last));
});

describe('dateError (FR-10.2)', () => {
  it('accepts real dates from 2000 to 2100', () => {
    expect(dateError('2000-01-01')).toBeNull();
    expect(dateError('2100-12-31')).toBeNull();
  });
  it.each(['20266-01-01', '2026-02-30', '', 'abc', 42])('rejects %j as not a date', (value) =>
    expect(dateError(value)).toBe("Sana noto'g'ri"),
  );
  it.each(['1999-12-31', '2101-01-01', '0026-05-01'])('rejects %s as out of range', (value) =>
    expect(dateError(value)).toBe("Yil 2000–2100 oralig'ida bo'lishi kerak"),
  );
});
