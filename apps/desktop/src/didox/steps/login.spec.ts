import { describe, expect, it, vi } from 'vitest'
import { type AutotypeResult, FORBIDDEN_LABEL, type LoginContext, type ProgressEvent, StepError } from '../contract.js'
import * as L from '../locators.js'
import { FakePage } from '../testing/fake-page.js'
import { chooseExpire, login } from './login.js'

const TIN = '303471702'
const OTHER = '200000001'

interface Setup {
  items?: L.CertItem[]
  /** STIR Didox shows as selected after the pick; defaults to the clicked card's. */
  selected?: string | null
  autotype?: AutotypeResult
  /** Where Didox lands after a typed password. */
  landsOn?: string
  header?: string | null
  toast?: string | null
  validTo?: string | null
}

function setup(s: Setup = {}) {
  const page = new FakePage()
  const items = s.items ?? [{ inn: TIN, expire: '21.01.2028' }, { inn: OTHER, expire: '01.02.2027' }]
  let selected: string | null = null
  let armedAt = -1

  page.on(L.exists(L.keyPicker).js, true)
  page.on(L.keyMenuOpen.js, true)
  page.on(L.keyMenuItems.js, items)
  page.on(L.selectedKeyInn.js, () => selected)
  page.on(L.blurActive.js, true)
  page.on(L.atDocuments.js, (p: FakePage) => p.currentUrl.startsWith('https://didox.uz/documents'))
  page.on(L.headerFirmInn.js, s.header === undefined ? '303 471 702' : s.header)
  page.on(L.toastText.js, s.toast ?? null)
  for (const expire of [null, '21.01.2028', '01.06.2029']) {
    page.onClick.set(L.keyMenuItem(TIN, expire).js, () => {
      selected = s.selected === undefined ? TIN : s.selected
    })
  }

  const progress: ProgressEvent[] = []
  const armAutotype = vi.fn(async (_: { dialogTimeoutMs: number; signal: AbortSignal }) => {
    armedAt = page.calls.length
    const result = s.autotype ?? 'typed'
    if (result === 'typed') page.currentUrl = s.landsOn ?? 'https://didox.uz/documents/new'
    return result
  })
  const ac = new AbortController()
  const ctx: LoginContext = {
    tin: TIN,
    keyValidTo: s.validTo === undefined ? '2028-01-21T12:04:52' : s.validTo,
    armAutotype,
    signal: ac.signal,
    onProgress: (e) => progress.push(e),
  }
  return { page, ctx, ac, armAutotype, progress, armedAt: () => armedAt }
}

const run = (t: ReturnType<typeof setup>) => login(t.page, t.ctx, { random: () => 0.5 }).catch((e: unknown) => e as StepError)

describe('login', () => {
  it('opens the login page, picks the firm key, arms the typist, enters and confirms the firm', async () => {
    const t = setup()

    await expect(run(t)).resolves.toBeUndefined()

    expect(t.page.of('goto')).toEqual([{ kind: 'goto', url: L.LOGIN_URL }])
    expect(t.page.of('click').map((c) => c.snippet)).toEqual([
      L.keyPicker.js,
      L.keyMenuItem(TIN, null).js,
      L.enterButton.js,
    ])
    expect(t.page.of('waitFor').find((w) => w.snippet === L.exists(L.keyPicker).js)?.timeoutMs).toBe(15_000)
    expect(t.page.of('waitFor').find((w) => w.snippet === L.atDocuments.js)?.timeoutMs).toBe(45_000)
    expect(t.armAutotype).toHaveBeenCalledTimes(1)
    expect(t.armAutotype).toHaveBeenCalledWith({ dialogTimeoutMs: 20_000, signal: t.ctx.signal })
    expect(t.page.of('type')).toEqual([])
    expect(t.page.of('screenshot')).toEqual([])
    expect(t.progress.filter((p) => p.status === 'done').map((p) => p.step)).toEqual([
      'openLogin',
      'pickKey',
      'armAndEnter',
      'awaitLogin',
      'verifyFirm',
    ])
  })

  it('pauses like a person between actions, with the injected jitter', async () => {
    const t = setup()
    await run(t)
    const pauses = t.page.of('pause').map((p) => p.ms)
    expect(pauses).toEqual([550, 550, 300])
  })

  it('blurs the page, then arms the typist, then clicks "Кириш" 300 ms later', async () => {
    const t = setup()
    await run(t)

    const blur = t.page.calls.findIndex((c) => c.kind === 'read' && c.snippet === L.blurActive.js)
    const enter = t.page.calls.findIndex((c) => c.kind === 'click' && c.snippet === L.enterButton.js)
    expect(blur).toBeGreaterThanOrEqual(0)
    expect(t.armedAt()).toBeGreaterThan(blur)
    expect(enter).toBeGreaterThanOrEqual(t.armedAt())
    expect(t.page.calls[enter - 1]).toEqual({ kind: 'pause', ms: 300 })
  })

  it('stops with KEY_NOT_IN_DIDOX_LIST when Didox does not list the firm key', async () => {
    const t = setup({ items: [{ inn: OTHER, expire: '01.02.2027' }] })

    const err = await run(t)

    expect(err).toMatchObject({ code: 'KEY_NOT_IN_DIDOX_LIST', step: 'pickKey', screenshot: '/diag/pickKey.png' })
    expect(t.armAutotype).not.toHaveBeenCalled()
    expect(t.page.of('click').map((c) => c.snippet)).toEqual([L.keyPicker.js])
  })

  it('picks the card whose expiry matches the chosen key when the firm has several', async () => {
    const t = setup({
      items: [
        { inn: TIN, expire: '01.06.2029' },
        { inn: TIN, expire: '21.01.2028' },
      ],
    })

    await expect(run(t)).resolves.toBeUndefined()

    expect(t.page.of('click').map((c) => c.snippet)).toContain(L.keyMenuItem(TIN, '21.01.2028').js)
  })

  it('refuses to guess among several keys without a matching expiry', async () => {
    const items = [
      { inn: TIN, expire: '01.06.2029' },
      { inn: TIN, expire: '01.07.2029' },
    ]
    expect(await run(setup({ items }))).toMatchObject({ code: 'KEY_NOT_IN_DIDOX_LIST' })
    expect(await run(setup({ items, validTo: null }))).toMatchObject({ code: 'KEY_NOT_IN_DIDOX_LIST' })
  })

  it('re-reads the picked STIR and stops when Didox selected another key', async () => {
    const t = setup({ selected: OTHER })

    expect(await run(t)).toMatchObject({ code: 'PAGE_UNEXPECTED', step: 'pickKey' })
    expect(t.armAutotype).not.toHaveBeenCalled()
  })

  it('stops with TIMEOUT when the login page never shows the key picker', async () => {
    const t = setup()
    t.page.on(L.exists(L.keyPicker).js, false)

    expect(await run(t)).toMatchObject({ code: 'TIMEOUT', step: 'openLogin', screenshot: '/diag/openLogin.png' })
  })

  it.each<[AutotypeResult, string, RegExp]>([
    ['no_dialog', 'EIMZO_DIALOG_MISSING', /chiqmadi/],
    ['not_focused', 'EIMZO_DIALOG_MISSING', /fokusda emas.*parol yozilmadi/],
    ['rejected', 'WRONG_PASSWORD', /parol/i],
    ['layout', 'KEYBOARD_LAYOUT', /ABC\/US/],
    ['no_permission', 'ACCESSIBILITY_DENIED', /Accessibility/],
    ['interrupted', 'AUTOTYPE_INTERRUPTED', /to'xtab qoldi.*qayta kiriting/],
    ['dialog_already_open', 'EIMZO_DIALOG_OPEN', /ochiq oyna bor/],
  ])('maps autotype %s to %s and goes no further', async (result, code, message) => {
    const t = setup({ autotype: result })

    const err = await run(t)

    expect(err).toBeInstanceOf(StepError)
    expect(err).toMatchObject({ code, step: 'armAndEnter', screenshot: '/diag/armAndEnter.png' })
    expect((err as StepError).message).toMatch(message)
    expect(t.armAutotype).toHaveBeenCalledTimes(1)
    expect(t.page.of('waitFor').map((w) => w.snippet)).not.toContain(L.atDocuments.js)
  })

  it('waits for the typist even when clicking "Кириш" fails', async () => {
    const t = setup()
    let finished = false
    t.armAutotype.mockImplementation(async () => {
      await new Promise((ok) => setTimeout(ok, 5))
      finished = true
      return 'no_dialog'
    })
    t.page.onClick.set(L.enterButton.js, () => {
      throw new Error('element detached')
    })

    expect(await run(t)).toMatchObject({ code: 'PAGE_UNEXPECTED', step: 'armAndEnter' })
    expect(finished).toBe(true)
  })

  it('reports LOGIN_FAILED with the Didox toast when the documents page never comes', async () => {
    const t = setup({ landsOn: 'https://didox.uz/login_with_signature', toast: 'Сертификат блокланган' })

    const err = await run(t)

    expect(err).toMatchObject({ code: 'LOGIN_FAILED', step: 'awaitLogin', screenshot: '/diag/awaitLogin.png' })
    expect((err as StepError).message).toContain('45')
    expect((err as StepError).message).toContain('Сертификат блокланган')
  })

  it('reports LOGIN_FAILED without a toast too, naming the underlying cause', async () => {
    const err = await run(setup({ landsOn: 'https://didox.uz/login_with_signature' }))
    expect(err).toMatchObject({ code: 'LOGIN_FAILED' })
    expect((err as StepError).message).toContain('TIMEOUT')
    expect((err as StepError).message).not.toContain('Didox:')
  })

  it('keeps the real reason when the wait dies for another cause (e.g. the window closed)', async () => {
    const t = setup()
    t.page.on(L.atDocuments.js, () => {
      throw new StepError('PAGE_UNEXPECTED', 'Didox oynasi yopildi')
    })
    const err = await run(t)
    expect(err).toMatchObject({ code: 'LOGIN_FAILED', step: 'awaitLogin' })
    expect((err as StepError).message).toContain('PAGE_UNEXPECTED: Didox oynasi yopildi')
  })

  it('stops with WRONG_FIRM when Didox signed in to another firm', async () => {
    const err = await run(setup({ header: '200 000 001' }))
    expect(err).toMatchObject({ code: 'WRONG_FIRM', step: 'verifyFirm', screenshot: '/diag/verifyFirm.png' })
  })

  it('accepts the header STIR with any whitespace (NBSP included)', async () => {
    await expect(run(setup({ header: '303 471 702 ' }))).resolves.toBeUndefined()
  })

  it('stops with CANCELLED at the next step once the run is cancelled, without a screenshot', async () => {
    const t = setup()
    t.armAutotype.mockImplementation(async () => {
      t.ac.abort()
      t.page.currentUrl = 'https://didox.uz/documents/new'
      return 'typed'
    })

    const err = await run(t)

    expect(err).toMatchObject({ code: 'CANCELLED', step: 'awaitLogin', screenshot: null })
    expect(t.page.of('screenshot')).toEqual([])
    expect(t.page.of('waitFor').map((w) => w.snippet)).not.toContain(L.atDocuments.js)
  })

  it.each<[AutotypeResult, string]>([
    ['rejected', 'WRONG_PASSWORD'],
    ['interrupted', 'AUTOTYPE_INTERRUPTED'],
  ])('reports %s as %s even when the run was cancelled while typing', async (result, code) => {
    const t = setup()
    t.armAutotype.mockImplementation(async () => {
      t.ac.abort()
      return result
    })
    expect(await run(t)).toMatchObject({ code, step: 'armAndEnter' })
  })

  it('a rejecting typist verdict wins over a failed (cancelled) "Кириш" click', async () => {
    const t = setup()
    t.armAutotype.mockImplementation(async () => {
      await new Promise((ok) => setTimeout(ok, 5))
      return 'rejected'
    })
    t.page.onClick.set(L.enterButton.js, () => {
      t.ac.abort()
      throw new StepError('CANCELLED', 'Bekor qilindi')
    })
    expect(await run(t)).toMatchObject({ code: 'WRONG_PASSWORD', step: 'armAndEnter' })
  })

  it('does nothing when cancelled before it starts', async () => {
    const t = setup()
    t.ac.abort()
    expect(await run(t)).toMatchObject({ code: 'CANCELLED', step: 'openLogin' })
    expect(t.page.calls).toEqual([])
  })

  it('a CANCELLED wait during login is not reported as LOGIN_FAILED', async () => {
    const t = setup()
    t.page.on(L.atDocuments.js, () => {
      t.ac.abort()
      throw new StepError('CANCELLED', 'Bekor qilindi')
    })
    expect(await run(t)).toMatchObject({ code: 'CANCELLED', step: 'awaitLogin' })
  })

  it('never clicks anything labelled sign/send', async () => {
    const t = setup()
    await run(t)
    for (const c of t.page.of('click')) {
      expect(c.what).not.toMatch(FORBIDDEN_LABEL)
      expect(c.snippet).not.toMatch(FORBIDDEN_LABEL)
    }
  })

  it('surfaces the page guard when a click would hit a sign/send button', async () => {
    const t = setup()
    t.page.labels.set(L.enterButton.js, 'Имзолаш')

    expect(await run(t)).toMatchObject({ code: 'FORBIDDEN_ACTION', step: 'armAndEnter' })
  })
})

describe('chooseExpire', () => {
  const one = [{ inn: TIN, expire: '21.01.2028' }]
  it('needs no date for a single card', () => expect(chooseExpire(one, TIN, null)).toBeNull())
  it('converts the key validTo to the Didox date', () =>
    expect(chooseExpire([...one, { inn: TIN, expire: '01.06.2029' }], TIN, '2029-06-01T00:00:00')).toBe('01.06.2029'))
  it('throws when the STIR is absent', () =>
    expect(() => chooseExpire(one, OTHER, null)).toThrow(expect.objectContaining({ code: 'KEY_NOT_IN_DIDOX_LIST' })))
})
