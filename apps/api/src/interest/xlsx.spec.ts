import { moneyCell } from './xlsx.js';

describe('moneyCell (FR-6.3)', () => {
  it.each([
    ['552328.77', 552328.77],
    ['-5000000.00', -5000000],
    ['9999999999999.99', 9999999999999.99], // 15 significant digits — still exact in Excel
  ])('%s → number', (value, expected) => expect(moneyCell(value)).toBe(expected));

  it('keeps longer amounts as text so no digit is lost', () => {
    expect(moneyCell('10000000000000.00')).toBe('10000000000000.00');
    expect(moneyCell('9999999999999999.99')).toBe('9999999999999999.99');
  });
});
