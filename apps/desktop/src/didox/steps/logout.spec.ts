import { describe, expect, it } from 'vitest'
import * as L from '../locators.js'
import { FakePage } from '../testing/fake-page.js'
import { logout } from './logout.js'

describe('logout', () => {
  it('clicks the Didox sign-out entry and waits to leave the documents pages', async () => {
    const page = new FakePage()
    page.currentUrl = 'https://didox.uz/documents/new'
    page.on(L.exists(L.logoutEntry).js, true)
    page.on(L.leftDocuments.js, (p: FakePage) => !p.currentUrl.startsWith(L.DOCUMENTS_URL_PREFIX))
    page.onClick.set(L.logoutEntry.js, (p) => (p.currentUrl = 'https://didox.uz/login'))

    await logout(page)

    expect(page.of('click').map((c) => c.snippet)).toEqual([L.logoutEntry.js])
    expect(page.of('waitFor').map((w) => w.snippet)).toEqual([L.leftDocuments.js])
  })

  it('does nothing when there is no sign-out entry', async () => {
    const page = new FakePage().on(L.exists(L.logoutEntry).js, false)
    await logout(page)
    expect(page.of('click')).toEqual([])
  })

  it('swallows every failure', async () => {
    const page = new FakePage().on(L.exists(L.logoutEntry).js, true)
    page.onClick.set(L.logoutEntry.js, () => {
      throw new Error('detached')
    })
    await expect(logout(page)).resolves.toBeUndefined()

    await expect(logout(new FakePage())).resolves.toBeUndefined() // no answers at all
    const stuck = new FakePage().on(L.exists(L.logoutEntry).js, true).on(L.leftDocuments.js, false)
    await expect(logout(stuck)).resolves.toBeUndefined()
  })
})
