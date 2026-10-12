import { describe, expect, it } from 'vitest'
import type { KeyInfo } from './alias.js'
import { matchKeys } from './match.js'

const key = (tin: string | null, validTo: string, serial = 'a1'): KeyInfo => ({
  tin,
  org: 'firma mchj',
  title: 'direktor',
  serial,
  validFrom: '2025-01-01T00:00:00',
  validTo,
})
const now = '2026-10-12T10:00:00'

describe('matchKeys', () => {
  it("gives each firm its valid key by STIR", () => {
    const k = key('300000001', '2028-01-21T12:04:52')

    const result = matchKeys([k, key('300000009', '2028-01-01T00:00:00')], ['300000001'], now)

    expect(result.get('300000001')).toEqual({ status: 'ok', key: k })
  })

  it('reports a firm without a key as missing', () => {
    expect(matchKeys([key('300000009', '2028-01-01T00:00:00')], ['300000001'], now).get('300000001')).toEqual({
      status: 'missing',
    })
  })

  it('reports a key whose validity ended as expired, even earlier the same day', () => {
    const old = key('300000001', '2026-10-12T09:59:59')

    expect(matchKeys([old], ['300000001'], now).get('300000001')).toEqual({ status: 'expired', key: old })
  })

  it('picks the valid key that lasts longest when a firm has several', () => {
    const expired = key('300000001', '2026-01-01T00:00:00', 'old')
    const sooner = key('300000001', '2027-03-01T00:00:00', 'soon')
    const later = key('300000001', '2028-06-01T00:00:00', 'late')

    expect(matchKeys([expired, later, sooner], ['300000001'], now).get('300000001')).toEqual({ status: 'ok', key: later })
  })
})
