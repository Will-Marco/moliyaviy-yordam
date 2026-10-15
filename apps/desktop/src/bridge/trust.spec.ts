import { describe, expect, it } from 'vitest'
import { isTrustedSender } from './trust.js'

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
