import { ALL_YEARS, selectedYear } from './reportYears'

describe('selectedYear (FR-10.3)', () => {
  const years = ['2025', '2026']
  it('defaults to the current year, else the latest', () => {
    expect(selectedYear(years, '2026', null)).toBe('2026')
    expect(selectedYear(years, '2027', null)).toBe('2026')
    expect(selectedYear([], '2026', null)).toBe(ALL_YEARS)
  })
  it('keeps a picked year or "all" while it is still in the report', () => {
    expect(selectedYear(years, '2026', '2025')).toBe('2025')
    expect(selectedYear(years, '2026', ALL_YEARS)).toBe(ALL_YEARS)
  })
  it('falls back when the picked year is no longer in the report', () => {
    expect(selectedYear(['2026'], '2026', '2025')).toBe('2026')
  })
})
