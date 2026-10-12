import { describe, expect, it } from 'vitest'
import { isTrustedSender } from './trust.js'

const app = { webContentsId: 7, origin: 'http://127.0.0.1:54321' }

describe('isTrustedSender', () => {
  it('trusts the app window showing a page of the app origin', () => {
    expect(isTrustedSender({ senderId: 7, frameUrl: 'http://127.0.0.1:54321/companies' }, app)).toBe(true)
  })

  it('rejects a URL that only starts like the app origin (userinfo trick)', () => {
    expect(isTrustedSender({ senderId: 7, frameUrl: 'http://127.0.0.1:54321@evil.example/x' }, app)).toBe(false)
  })

  it('rejects any other window, even on the same origin', () => {
    expect(isTrustedSender({ senderId: 8, frameUrl: 'http://127.0.0.1:54321/' }, app)).toBe(false)
  })

  it('rejects a frame whose URL cannot be parsed', () => {
    expect(isTrustedSender({ senderId: 7, frameUrl: 'not a url' }, app)).toBe(false)
  })
})
