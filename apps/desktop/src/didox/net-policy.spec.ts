import { describe, expect, it } from 'vitest'
import { classifyRequest, isAllowedFrameNavigation, isAllowedNavigation, isAllowedRequest } from './net-policy.js'

describe('classifyRequest', () => {
  it.each([
    'https://didox.uz/login_with_signature?r=/documents/new&isInternal=true',
    'https://api-gateway.didox.uz/v1/documents?owner=1',
    'https://cdn.didox.uz/static/index_abc.js',
    'wss://ws.didox.uz/socket',
    'wss://127.0.0.1:64443/service/cryptapi',
    'ws://127.0.0.1:64646/service/cryptapi',
    'data:image/png;base64,AAAA',
    'blob:https://didox.uz/5b1c',
  ])('allows %s', (url) => {
    expect(classifyRequest(url)).toBe('allow')
  })

  it.each([
    'https://api-gateway.didox.uz/v1/documents/0A1B/sign',
    'https://api-gateway.didox.uz/v1/documents/0A1B/tosign',
    'https://api-gateway.didox.uz/v1/documents/0A1B/send',
    'https://api-gateway.didox.uz/v1/documents/import/0A1B/send',
    'https://api-gateway.didox.uz/v1/documents/offer/sign',
    'https://api-gateway.didox.uz/v1/documents/uzcard_offer/sign',
    'https://didox.uz/documents/0A1B/SIGN?x=1',
    'http://localhost:6210/crypto/sign',
    'ws://127.0.0.1:44480/sign',
  ])('blocks the sign/send endpoint %s', (url) => {
    expect(classifyRequest(url)).toBe('blocked_action')
  })

  it.each([
    'http://didox.uz/login', // plain http
    'https://didox.uz.evil.com/',
    'https://evil-didox.uz/',
    'https://fonts.googleapis.com/css',
    'https://127.0.0.1:64443@evil.com/',
    'https://didox.uz@evil.com/',
    'http://localhost:6210/crypto/version',
    'ws://127.0.0.1:44480/',
    'http://127.0.0.1:8080/',
    'file:///etc/passwd',
    'not a url',
  ])('blocks the foreign host %s', (url) => {
    expect(classifyRequest(url)).toBe('blocked_host')
  })

  it('does not mistake a query or a longer word for a sign/send path', () => {
    expect(isAllowedRequest('https://api-gateway.didox.uz/v1/documents?status=send')).toBe(true)
    expect(isAllowedRequest('https://api-gateway.didox.uz/v1/signature/info')).toBe(true)
    expect(isAllowedRequest('https://didox.uz/login_with_signature')).toBe(true)
  })
})

describe('isAllowedNavigation', () => {
  it('lets the window show https Didox pages only', () => {
    expect(isAllowedNavigation('https://didox.uz/documents/new')).toBe(true)
    expect(isAllowedNavigation('https://my.didox.uz/profile')).toBe(true)
    expect(isAllowedNavigation('http://didox.uz/documents')).toBe(false)
    expect(isAllowedNavigation('wss://127.0.0.1:64443/service/cryptapi')).toBe(false)
    expect(isAllowedNavigation('https://example.com/')).toBe(false)
    expect(isAllowedNavigation('https://didox.uz/documents/0A1B/sign')).toBe(false)
    expect(isAllowedNavigation('javascript:alert(1)')).toBe(false)
  })
})

describe('isAllowedFrameNavigation', () => {
  it('allows empty frames and Didox/E-IMZO frames only', () => {
    expect(isAllowedFrameNavigation('about:blank')).toBe(true)
    expect(isAllowedFrameNavigation('about:srcdoc')).toBe(true)
    expect(isAllowedFrameNavigation('https://didox.uz/widget')).toBe(true)
    expect(isAllowedFrameNavigation('about:config')).toBe(false)
    expect(isAllowedFrameNavigation('https://ads.example.com/frame')).toBe(false)
    expect(isAllowedFrameNavigation('https://didox.uz/documents/1/send')).toBe(false)
  })
})
