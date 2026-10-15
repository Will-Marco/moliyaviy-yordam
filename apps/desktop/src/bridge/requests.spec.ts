import { describe, expect, it, vi } from 'vitest'
import { CANCELLED, type ConfirmRequest } from './confirm.js'
import { createDidoxRequests, type DidoxRequestDeps } from './requests.js'

const TIN = '300000001'
const LENDER = '0199f1a2-0000-7000-8000-000000000001'

function setup(over: Partial<DidoxRequestDeps> & { answer?: boolean } = {}) {
  const asked: ConfirmRequest[] = []
  const order: string[] = []
  const didox = {
    checkLogin: vi.fn(async () => (order.push('checkLogin'), { ok: true as const })),
    createDrafts: vi.fn(async () => (order.push('createDrafts'), { ok: true as const, runId: 'r1' })),
  }
  const deps: DidoxRequestDeps = {
    confirm: async (request) => {
      asked.push(request)
      order.push('confirm')
      return over.answer ?? true
    },
    didox,
    prepareRobot: vi.fn(async () => void order.push('prepareRobot')),
    firmName: vi.fn(async () => 'ALFA SAVDO MCHJ'),
    lenderNames: vi.fn(async () => ['ALFA SAVDO MCHJ']),
    ...over,
  }
  return { requests: createDidoxRequests(deps), deps, didox, asked, order }
}

describe('didox:check-login from the page', () => {
  it('asks on this computer first, naming the firm from its E-IMZO key, then checks', async () => {
    const s = setup()

    expect(await s.requests.checkLogin(TIN)).toEqual({ ok: true })
    expect(s.order).toEqual(['confirm', 'checkLogin'])
    expect(s.asked[0]?.detail).toContain('ALFA SAVDO MCHJ (STIR 300000001)')
    expect(s.didox.checkLogin).toHaveBeenCalledWith(TIN)
  })

  it('does not touch Didox when the person says no', async () => {
    const s = setup({ answer: false })

    expect(await s.requests.checkLogin(TIN)).toEqual(CANCELLED)
    expect(s.didox.checkLogin).not.toHaveBeenCalled()
  })

  it('still asks when E-IMZO cannot name the firm', async () => {
    const s = setup({ firmName: async () => Promise.reject(new Error('E-IMZO down')) })

    await s.requests.checkLogin(TIN)

    expect(s.asked[0]?.detail).toContain('STIR 300000001')
  })

  it('refuses a malformed STIR before asking anyone', async () => {
    const s = setup()
    await expect(s.requests.checkLogin('30000000x')).rejects.toThrow('Invalid STIR')
    expect(s.asked).toEqual([])
  })

  it('answers UNAVAILABLE in a build without Didox', async () => {
    const s = setup({ didox: undefined })
    expect(await s.requests.checkLogin(TIN)).toMatchObject({ ok: false, code: 'UNAVAILABLE' })
    expect(s.asked).toEqual([])
  })
})

describe('didox:create-drafts from the page', () => {
  it('asks first, renews the robot key, then starts the run', async () => {
    const s = setup()

    expect(await s.requests.createDrafts({ month: '2026-09', lenderIds: 'all' })).toEqual({ ok: true, runId: 'r1' })
    expect(s.order).toEqual(['confirm', 'prepareRobot', 'createDrafts'])
    expect(s.asked[0]?.message).toContain('Sentabr 2026')
    expect(s.didox.createDrafts).toHaveBeenCalledWith({ month: '2026-09', lenderIds: 'all' })
  })

  it('starts nothing — not even a key renewal — when the person says no', async () => {
    const s = setup({ answer: false })

    expect(await s.requests.createDrafts({ month: '2026-09', lenderIds: 'all' })).toEqual(CANCELLED)
    expect(s.order).toEqual(['confirm'])
  })

  it('names the picked firms, or counts them when the names cannot be read', async () => {
    const named = setup()
    await named.requests.createDrafts({ month: '2026-09', lenderIds: [LENDER] })
    expect(named.asked[0]?.detail).toContain('ALFA SAVDO MCHJ')
    expect(named.deps.lenderNames).toHaveBeenCalledWith('2026-09', [LENDER])

    const counted = setup({ lenderNames: async () => null })
    await counted.requests.createDrafts({ month: '2026-09', lenderIds: [LENDER] })
    expect(counted.asked[0]?.detail).toContain('1 ta firma')
  })

  it('still starts when the robot key cannot be renewed — the run then says why it stopped', async () => {
    const s = setup({ prepareRobot: async () => Promise.reject(new Error('offline')) })

    expect(await s.requests.createDrafts({ month: '2026-09', lenderIds: 'all' })).toEqual({ ok: true, runId: 'r1' })
  })

  it('refuses malformed input before asking anyone', async () => {
    const s = setup()
    await expect(s.requests.createDrafts({ month: '2026-13', lenderIds: 'all' })).rejects.toThrow('Invalid month')
    await expect(s.requests.createDrafts({ month: '2026-09', lenderIds: ['not-a-uuid'] })).rejects.toThrow('Invalid lenderIds')
    await expect(s.requests.createDrafts({ month: '2026-09', lenderIds: [] })).rejects.toThrow('Invalid lenderIds')
    await expect(s.requests.createDrafts(null)).rejects.toThrow('Invalid month')
    expect(s.asked).toEqual([])
  })
})
