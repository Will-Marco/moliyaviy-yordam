import { formatDate, formatMoney, formatRate, parseMoneyInput, parseRateInput } from './format'

const nb = ' '

describe('format', () => {
  it.each([
    ['10000000000.00', `10${nb}000${nb}000${nb}000,00`],
    ['552328.77', `552${nb}328,77`],
    ['0.5', '0,50'],
    ['999', '999,00'],
    ['-5000000.00', `\u2212${'5'}${nb}000${nb}000,00`],
  ])('formatMoney(%s)', (value, text) => expect(formatMoney(value)).toBe(text))

  it.each([
    ['10 000 000 000', '10000000000'],
    [`1${nb}234,5`, '1234.5'],
    ['12.50', '12.50'],
    ['  7 ', '7'],
    ['abc', null],
    ['1,2,3', null],
    ['1.234', null],
    ['', null],
  ])('parseMoneyInput(%j)', (input, value) => expect(parseMoneyInput(input)).toBe(value))

  it.each([
    ['14', '14'],
    ['14,5', '14.5'],
    [' 14.25 ', '14.25'],
    ['14,12345', null],
    ['x', null],
  ])('parseRateInput(%j)', (input, value) => expect(parseRateInput(input)).toBe(value))

  it('formats rates and dates the Uzbek way', () => {
    expect(formatRate('14.5')).toBe(`14,5${nb}%`)
    expect(formatDate('2026-01-01')).toBe('01.01.2026')
  })
})
