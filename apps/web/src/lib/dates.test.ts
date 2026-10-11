import { dateError, tashkentToday } from './dates'

describe('dateError (FR-10.2, mirrors the API)', () => {
  it('accepts real dates from 2000 to 2100', () => {
    expect(dateError('2000-01-01')).toBeNull()
    expect(dateError('2100-12-31')).toBeNull()
  })
  it.each(['20266-01-01', '2026-02-30', '', 'abc'])('rejects %j as not a date', (value) =>
    expect(dateError(value)).toBe("Sana noto'g'ri"),
  )
  it.each(['1999-12-31', '2101-01-01', '0026-05-01'])('rejects %s as out of range', (value) =>
    expect(dateError(value)).toBe("Yil 2000–2100 oralig'ida bo'lishi kerak"),
  )
})

describe('tashkentToday', () => {
  it('is the calendar date in Tashkent, whatever the browser time zone', () => {
    expect(tashkentToday(new Date('2026-09-30T19:30:00Z'))).toBe('2026-10-01')
    expect(tashkentToday(new Date('2026-09-30T18:30:00Z'))).toBe('2026-09-30')
  })
})
