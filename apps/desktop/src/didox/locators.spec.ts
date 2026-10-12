import { describe, expect, it } from 'vitest'
import { FORBIDDEN_LABEL } from './contract.js'
import * as L from './locators.js'

const all = (): L.Locator[] => [
  ...Object.values(L).filter((v): v is L.Locator => typeof v === 'object' && v !== null && 'js' in v),
  L.keyMenuItem('303471702', null),
  L.keyMenuItem('303471702', '21.01.2028'),
  L.exists(L.keyPicker),
]

describe('locators', () => {
  it('are syntactically valid expressions', () => {
    for (const loc of all()) expect(() => new Function(`return (${loc.js})`), loc.what).not.toThrow()
  })

  it('never name a sign/send button', () => {
    for (const loc of all()) {
      expect(loc.js).not.toMatch(FORBIDDEN_LABEL)
      expect(loc.what).not.toMatch(FORBIDDEN_LABEL)
    }
  })

  it('embeds key parameters as JSON literals, so quotes cannot break out', () => {
    const loc = L.keyMenuItem(`1"); alert(1); ("`, `0'1`)
    expect(loc.js).toContain(JSON.stringify(`1"); alert(1); ("`))
    expect(() => new Function(`return (${loc.js})`)).not.toThrow()
  })
})
