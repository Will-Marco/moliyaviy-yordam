import { describe, expect, it } from 'vitest'
import { parseAlias } from './alias.js'

// Same shape as a real E-IMZO `list_all_certificates` alias (lower-case X.500 fields), synthetic values.
const legalEntity =
  "cn=aliyev vali,name=vali,surname=aliyev,l=chilonzor tumani,st=toshkent shahri,c=uz,o=alfa savdo mchj," +
  '1.2.860.3.16.1.2=31234567890123,t=direktor,1.2.860.3.16.1.1=300000001,serialnumber=79150f87,' +
  'validfrom=2026.01.21 12:04:52,validto=2028.01.21 12:04:52'

describe('parseAlias', () => {
  it('reads the firm STIR, name, title, serial and validity of a legal-entity key', () => {
    expect(parseAlias(legalEntity)).toEqual({
      tin: '300000001',
      org: 'alfa savdo mchj',
      title: 'direktor',
      serial: '79150f87',
      validFrom: '2026-01-21T12:04:52',
      validTo: '2028-01-21T12:04:52',
    })
  })

  it('returns no STIR for a personal key and never carries the owner name or JShShIR', () => {
    const personal =
      'cn=karimova lola,name=lola,surname=karimova,c=uz,1.2.860.3.16.1.2=41234567890123,' +
      'serialnumber=0a1b2c3d,validfrom=2025.05.01 09:00:00,validto=2027.05.01 09:00:00'

    const info = parseAlias(personal)

    expect(info.tin).toBeNull()
    expect(Object.values(info).join('|')).not.toMatch(/karimova|lola|41234567890123/)
    expect(Object.values(parseAlias(legalEntity)).join('|')).not.toMatch(/aliyev|\bvali\b|31234567890123/)
  })

  it('keeps a comma that belongs to the firm name', () => {
    const info = parseAlias('c=uz,o=beta, texno mchj,t=direktor,1.2.860.3.16.1.1=300000002')

    expect(info.org).toBe('beta, texno mchj')
    expect(info.tin).toBe('300000002')
  })
})
