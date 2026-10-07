import { effectiveFromOf } from './rates'

describe('effectiveFromOf (CR-5, mirrors the API)', () => {
  it.each([
    ['2026-03-15', '2026-04-01'],
    ['2026-04-01', '2026-04-01'],
    ['2026-12-31', '2027-01-01'],
  ])('%s → %s', (changedOn, effective) => expect(effectiveFromOf(changedOn)).toBe(effective))
})
