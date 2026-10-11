import { compareDecimal, filterContracts, periodPreset, sortBy } from './contractList'
import { etalon } from './fixtures'
import type { Contract } from './api'

const contract = (patch: Partial<Contract>): Contract => ({ ...etalon, ...patch })
const gamma = contract({
  id: 'g',
  number: '12/25',
  signedOn: '2025-06-10',
  lender: { id: 'L1', name: '"GAMMA QURILISH" MCHJ', tin: '900000001' },
  borrower: { id: 'B1', name: '"DELTA AGRO" MCHJ', tin: '900000002' },
})
const kappa = contract({
  id: 'k',
  number: '2026/01',
  signedOn: '2026-01-15',
  lender: { id: 'L2', name: '"KAPPA FARM" MCHJ', tin: '900000006' },
  borrower: { id: 'B2', name: '"LAMBDA ENERGO" MCHJ', tin: '900000007' },
})
const all = [gamma, kappa]
const none = { q: '', lender: '', borrower: '', signedFrom: '', signedTo: '' }

describe('filterContracts (FR-11.1, FR-11.2)', () => {
  it('searches the number, both names and both STIRs, ignoring case', () => {
    expect(filterContracts(all, { ...none, q: 'gamma' })).toEqual([gamma])
    expect(filterContracts(all, { ...none, q: '12/25' })).toEqual([gamma])
    expect(filterContracts(all, { ...none, q: 'lambda' })).toEqual([kappa])
    expect(filterContracts(all, { ...none, q: '900000006' })).toEqual([kappa])
    expect(filterContracts(all, { ...none, q: '  ' })).toEqual(all)
  })

  it('filters by lender, borrower and signing date range (inclusive)', () => {
    expect(filterContracts(all, { ...none, lender: 'L2' })).toEqual([kappa])
    expect(filterContracts(all, { ...none, borrower: 'B1' })).toEqual([gamma])
    expect(filterContracts(all, { ...none, signedFrom: '2026-01-15' })).toEqual([kappa])
    expect(filterContracts(all, { ...none, signedTo: '2025-06-10' })).toEqual([gamma])
  })
})

describe('compareDecimal', () => {
  it('compares exact decimal strings, including negatives and long values', () => {
    expect(compareDecimal('10.5', '9.99')).toBeGreaterThan(0)
    expect(compareDecimal('-1.00', '0')).toBeLessThan(0)
    expect(compareDecimal('99999999999999999.99', '99999999999999999.98')).toBeGreaterThan(0)
    expect(compareDecimal('14', '14.0000')).toBe(0)
  })
})

describe('sortBy (FR-11.3)', () => {
  it('sorts text, dates and money both ways without mutating the input', () => {
    const rows = [{ v: '1000.00' }, { v: '-5.00' }, { v: '20.50' }]
    expect(sortBy(rows, (r) => r.v, 'money', 'asc').map((r) => r.v)).toEqual(['-5.00', '20.50', '1000.00'])
    expect(sortBy(rows, (r) => r.v, 'money', 'desc').map((r) => r.v)).toEqual(['1000.00', '20.50', '-5.00'])
    expect(rows[0].v).toBe('1000.00')
    const names = [{ v: 'Zeta' }, { v: 'alfa' }, { v: 'Beta' }]
    expect(sortBy(names, (r) => r.v, 'text', 'asc').map((r) => r.v)).toEqual(['alfa', 'Beta', 'Zeta'])
  })
})

describe('periodPreset (FR-12.1)', () => {
  const today = '2026-10-11'
  it.each([
    ['month', ['2026-10', '2026-10']],
    ['lastMonth', ['2026-09', '2026-09']],
    ['quarter', ['2026-10', '2026-10']],
    ['lastQuarter', ['2026-07', '2026-09']],
    ['year', ['2026-01', '2026-10']],
    ['lastYear', ['2025-01', '2025-12']],
  ] as const)('%s', (preset, range) => expect(periodPreset(preset, today)).toEqual(range))

  it('handles January and the first quarter', () => {
    expect(periodPreset('lastMonth', '2026-01-05')).toEqual(['2025-12', '2025-12'])
    expect(periodPreset('lastQuarter', '2026-02-05')).toEqual(['2025-10', '2025-12'])
    expect(periodPreset('quarter', '2026-05-05')).toEqual(['2026-04', '2026-05'])
  })
})
