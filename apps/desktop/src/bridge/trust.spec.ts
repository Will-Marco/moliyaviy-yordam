import { describe, expect, it, vi } from 'vitest'
import { createExternalOpener, isExternalWebUrl, isPermissionAllowed, isTrustedSender } from './trust.js'

describe('isExternalWebUrl', () => {
  it('lets web links go to the browser', () => {
    expect(isExternalWebUrl('https://didox.uz/')).toBe(true)
    expect(isExternalWebUrl('http://example.uz/help')).toBe(true)
  })

  it('keeps every other scheme from reaching the OS', () => {
    for (const url of ['file:///C:/Windows/System32/calc.exe', 'smb://evil/share', 'ms-msdt:/id', 'javascript:alert(1)', 'not a url']) {
      expect(isExternalWebUrl(url), url).toBe(false)
    }
  })
})

const app = { webContentsId: 7, origin: 'https://moliya.example.uz' }

describe('isTrustedSender', () => {
  it('trusts the app window showing a page of the app origin', () => {
    expect(isTrustedSender({ senderId: 7, frameUrl: 'https://moliya.example.uz/companies' }, app)).toBe(true)
  })

  it('rejects a URL that only starts like the app origin (userinfo trick)', () => {
    expect(isTrustedSender({ senderId: 7, frameUrl: 'https://moliya.example.uz@evil.example/x' }, app)).toBe(false)
  })

  it('rejects the same host over plain http (M13: the server origin is https only)', () => {
    expect(isTrustedSender({ senderId: 7, frameUrl: 'http://moliya.example.uz/companies' }, app)).toBe(false)
  })

  it('rejects any other window, even on the same origin', () => {
    expect(isTrustedSender({ senderId: 8, frameUrl: 'https://moliya.example.uz/' }, app)).toBe(false)
  })

  it('rejects a frame whose URL cannot be parsed', () => {
    expect(isTrustedSender({ senderId: 7, frameUrl: 'not a url' }, app)).toBe(false)
  })
})

describe('isPermissionAllowed (security review M2)', () => {
  it("lets the app's own pages write to the clipboard — the copy buttons on the invoices page", () => {
    expect(isPermissionAllowed('clipboard-sanitized-write', 'https://moliya.example.uz/invoices', app.origin)).toBe(true)
    expect(isPermissionAllowed('clipboard-sanitized-write', 'https://moliya.example.uz', app.origin)).toBe(true)
  })

  it('refuses everything else, and the clipboard to any other origin', () => {
    for (const permission of ['clipboard-read', 'media', 'geolocation', 'notifications', 'openExternal', 'hid', 'serial', 'usb', 'fullscreen']) {
      expect(isPermissionAllowed(permission, 'https://moliya.example.uz/', app.origin), permission).toBe(false)
    }
    expect(isPermissionAllowed('clipboard-sanitized-write', 'https://evil.example/', app.origin)).toBe(false)
    expect(isPermissionAllowed('clipboard-sanitized-write', 'file:///index.html', app.origin)).toBe(false)
  })
})

describe('createExternalOpener (security review L2)', () => {
  const setup = () => {
    let now = 0
    const open = vi.fn()
    const openOutside = createExternalOpener({ open, now: () => now })
    return { open, openOutside, wait: (ms: number) => void (now += ms) }
  }

  it('opens web links only', () => {
    const s = setup()
    s.openOutside('file:///C:/Windows/System32/calc.exe')
    s.openOutside('https://didox.uz/')

    expect(s.open.mock.calls).toEqual([['https://didox.uz/']])
  })

  it('opens at most one link per 2 seconds and drops the rest', () => {
    const s = setup()
    s.openOutside('https://a.example/')
    s.wait(1_999)
    s.openOutside('https://b.example/')
    s.wait(1)
    s.openOutside('https://c.example/')

    expect(s.open.mock.calls).toEqual([['https://a.example/'], ['https://c.example/']])
  })

  it('does not let a refused link hold up the next web link', () => {
    const s = setup()
    s.openOutside('smb://evil/share')
    s.openOutside('https://a.example/')

    expect(s.open.mock.calls).toEqual([['https://a.example/']])
  })
})
