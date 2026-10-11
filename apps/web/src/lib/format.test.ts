import { caretAfterFormat, formatDate, formatInstantDate, formatMoney, formatMoneyTyping, formatRate, parseMoneyInput, parseRateInput, sumMoney } from './format'

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

describe('formatInstantDate', () => {
  it('shows the Tashkent calendar date, not UTC', () => {
    expect(formatInstantDate('2026-09-30T20:00:00.000Z')).toBe('01.10.2026')
    expect(formatInstantDate('2026-10-01T04:00:00.000Z')).toBe('01.10.2026')
  })
})

describe('formatMoneyTyping (FR-10.1)', () => {
  const n = (s: string) => s.replace(/ /g, ' ')
  it.each([
    ['2000000', '2 000 000'],
    ['2 000 000', '2 000 000'],
    ['1234,5', '1 234,5'],
    ['1234.56', '1 234,56'],
    ['1234,567', '1 234 567'],
    ['1.500', '1 500'],
    ['1,500', '1 500'],
    ['1,5', '1,5'],
    ['1234,', '1 234,'],
    [',5', '0,5'],
    ['007', '7'],
    ['0', '0'],
    ['', ''],
    ['12a3б4', '1 234'],
    ['2 000 000,00 so‘m', '2 000 000,00'],
    ['1.234.567', '1 234 567'],
  ])('%j → %j', (input, expected) => expect(formatMoneyTyping(input)).toBe(n(expected)))

  it('formats what parseMoneyInput accepts', () => {
    expect(parseMoneyInput(formatMoneyTyping('2000000'))).toBe('2000000')
    expect(parseMoneyInput(formatMoneyTyping('1234,5'))).toBe('1234.5')
  })
})

describe('caretAfterFormat', () => {
  it('keeps the caret after the same digit', () => {
    // "200000|0" typed last digit → "2 000 000|"
    expect(caretAfterFormat('2000000', 7, formatMoneyTyping('2000000'))).toBe(9)
    // caret after "12" in "1234" → after "12" in "1 234"
    expect(caretAfterFormat('1234', 2, '1 234')).toBe(3)
    expect(caretAfterFormat('1234', 0, '1 234')).toBe(0)
    expect(caretAfterFormat('1234,5', 6, '1 234,5')).toBe(7)
  })
})

describe('sumMoney', () => {
  it('adds exactly, with negatives and no floating point', () => {
    expect(sumMoney(['552328.77', '483287.67'])).toBe('1035616.44')
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30')
    expect(sumMoney(['-5.00', '1.25'])).toBe('-3.75')
    expect(sumMoney(['99999999999999999.99', '0.01'])).toBe('100000000000000000.00')
    expect(sumMoney([])).toBe('0.00')
  })
})
