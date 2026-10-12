import { describe, expect, it, vi } from 'vitest'
import { EimzoError } from '../eimzo/client.js'
import type { KeyStatus } from '../eimzo/match.js'
import { EriStoreError, type EriStoreErrorCode } from '../secrets/eri-store.js'
import { type LoginContext, type Page, type ProgressEvent, StepError } from './contract.js'
import { createDidoxRunner, type DidoxRunnerDeps } from './run.js'

const TIN = '303471702'
const okKey: KeyStatus = {
  status: 'ok',
  key: { tin: TIN, org: 'alfa', title: 'direktor', validFrom: '2025-01-21T12:04:52', validTo: '2028-01-21T12:04:52', serial: '7a1b' },
} as KeyStatus

const page = (): Page => ({
  goto: vi.fn(async () => undefined),
  url: () => 'https://didox.uz/documents/new',
  read: vi.fn(async () => null) as Page['read'],
  waitFor: vi.fn(async () => true) as Page['waitFor'],
  click: vi.fn(async () => undefined),
  type: vi.fn(async () => undefined),
  pause: vi.fn(async () => undefined),
  screenshot: vi.fn(async (label: string) => `/diag/${label}.png`),
})

/** Fake deps; `password` null means no saved password. */
function setup(over: Partial<DidoxRunnerDeps> & { password?: string | null; storeError?: EriStoreErrorCode } = {}) {
  const events: ProgressEvent[] = []
  const win = { page: page(), resetSession: vi.fn(async () => undefined), close: vi.fn() }
  const password = over.password === undefined ? 'Maxfiy-1' : over.password
  const eri = {
    withPassword: vi.fn(async <T>(_tin: string, use: (pw: string) => Promise<T>, _serial?: string | null): Promise<T> => {
      if (over.storeError) throw new EriStoreError(over.storeError, `store: ${over.storeError}`)
      if (password === null) throw new EriStoreError('PASSWORD_MISSING', 'ERI paroli kiritilmagan')
      return use(password)
    }),
    markRejected: vi.fn(async () => undefined),
  }
  const deps: DidoxRunnerDeps = {
    listKeys: vi.fn(async (tins: string[]) => new Map(tins.map((t) => [t, okKey]))),
    preflight: vi.fn(async () => 'ok' as const),
    eri: eri as unknown as DidoxRunnerDeps['eri'], // vi.fn drops withPassword's generic
    openWindow: vi.fn(() => win),
    login: vi.fn(async (_page: Page, ctx: LoginContext) => {
      await ctx.armAutotype({ dialogTimeoutMs: 20_000, signal: ctx.signal })
    }),
    logout: vi.fn(async () => undefined),
    typePassword: vi.fn(async () => 'typed' as const),
    onProgress: (e) => events.push(e),
    ...over,
  }
  return { runner: createDidoxRunner(deps), deps, win, eri, events }
}

describe('createDidoxRunner.checkLogin', () => {
  it('logs in with the firm key, types the saved password once, logs out and closes the window', async () => {
    const { runner, deps, win, eri, events } = setup()
    expect(await runner.checkLogin(TIN)).toEqual({ ok: true })

    expect(deps.listKeys).toHaveBeenCalledWith([TIN])
    expect(win.resetSession).toHaveBeenCalledTimes(2) // clean start, and cleared again before closing
    expect(deps.preflight).toHaveBeenCalledOnce()
    const ctx = vi.mocked(deps.login).mock.calls[0]![1]
    expect(ctx).toMatchObject({ tin: TIN, keyValidTo: '2028-01-21T12:04:52' })
    expect(ctx.signal.aborted).toBe(false)
    expect(deps.typePassword).toHaveBeenCalledExactlyOnceWith('Maxfiy-1', { dialogTimeoutMs: 20_000, signal: ctx.signal })
    expect(eri.withPassword).toHaveBeenCalledWith(TIN, expect.any(Function), '7a1b') // tied to the key it unlocks
    expect(deps.logout).toHaveBeenCalledWith(win.page)
    expect(win.close).toHaveBeenCalledOnce()
    expect(eri.markRejected).not.toHaveBeenCalled()
    expect(events.at(-1)).toEqual({ firmTin: TIN, step: 'result', status: 'done', message: 'Kirish tekshirildi' })
    expect(JSON.stringify(events)).not.toContain('Maxfiy-1')
  })

  it('stops before Didox when E-IMZO is not running', async () => {
    const { runner, deps } = setup({
      listKeys: async () => Promise.reject(new EimzoError('EIMZO_NOT_RUNNING', 'E-IMZO ishga tushirilmagan')),
    })
    expect(await runner.checkLogin(TIN)).toEqual({ ok: false, code: 'EIMZO_NOT_RUNNING', message: 'E-IMZO ishga tushirilmagan' })
    expect(deps.openWindow).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', { status: 'missing' }, 'KEY_MISSING'],
    ['expired', { ...okKey, status: 'expired' }, 'KEY_EXPIRED'],
    ['unknown', { ...okKey, status: 'unknown' }, 'KEY_UNKNOWN'],
  ] as const)('stops before Didox when the key is %s', async (_name, key, code) => {
    const { runner, deps } = setup({ listKeys: async () => new Map([[TIN, key as KeyStatus]]) })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code })
    expect(deps.openWindow).not.toHaveBeenCalled()
  })

  it.each(['PASSWORD_MISSING', 'PASSWORD_REJECTED', 'PASSWORD_UNREADABLE', 'KEY_CHANGED'] as const)(
    'stops before Didox when the password store says %s',
    async (code) => {
      const { runner, deps, eri } = setup({ storeError: code })
      expect(await runner.checkLogin(TIN)).toEqual({ ok: false, code, message: `store: ${code}` })
      expect(deps.openWindow).not.toHaveBeenCalled()
      expect(deps.typePassword).not.toHaveBeenCalled()
      expect(eri.markRejected).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['layout', 'KEYBOARD_LAYOUT'],
    ['no_permission', 'ACCESSIBILITY_DENIED'],
    ['unsupported', 'PLATFORM_UNSUPPORTED'],
    ['dialog_already_open', 'EIMZO_DIALOG_OPEN'],
  ] as const)('stops before Didox when the preflight says %s', async (verdict, code) => {
    const { runner, deps, events } = setup({ preflight: async () => verdict })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code })
    expect(deps.openWindow).not.toHaveBeenCalled()
    expect(deps.typePassword).not.toHaveBeenCalled()
    expect(events).toContainEqual(expect.objectContaining({ step: 'preflight', status: 'failed' }))
  })

  it('checks the password store before the preflight', async () => {
    const { runner, deps } = setup({ storeError: 'PASSWORD_MISSING' })
    await runner.checkLogin(TIN)
    expect(deps.preflight).not.toHaveBeenCalled()
  })

  it.each(['WRONG_PASSWORD', 'LOGIN_FAILED', 'AUTOTYPE_INTERRUPTED'] as const)('marks the password rejected after %s and does not try again', async (code) => {
    const { runner, deps, eri, win } = setup({
      login: async (_p, ctx) => {
        await ctx.armAutotype({ dialogTimeoutMs: 20_000, signal: ctx.signal })
        throw new StepError(code, 'Kirib bo\'lmadi', 'armAutotypeAndEnter', '/diag/x.png')
      },
    })
    expect(await runner.checkLogin(TIN)).toEqual({ ok: false, code, message: "Kirib bo'lmadi", screenshot: '/diag/x.png' })
    expect(eri.markRejected).toHaveBeenCalledExactlyOnceWith(TIN)
    expect(deps.typePassword).toHaveBeenCalledOnce()
    expect(deps.logout).not.toHaveBeenCalled()
    expect(win.close).toHaveBeenCalledOnce()
  })

  it('marks the password rejected even when the run was cancelled meanwhile', async () => {
    const { runner, deps, eri } = setup()
    vi.mocked(deps.login).mockImplementation(async (_p, ctx) => {
      runner.cancel()
      expect(ctx.signal.aborted).toBe(true)
      throw new StepError('WRONG_PASSWORD', 'E-IMZO parolni qabul qilmadi')
    })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'WRONG_PASSWORD' })
    expect(eri.markRejected).toHaveBeenCalledExactlyOnceWith(TIN)
  })

  it('tries to log out after landing in the wrong firm', async () => {
    const { runner, deps, win } = setup({ login: async () => Promise.reject(new StepError('WRONG_FIRM', 'Boshqa firma')) })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'WRONG_FIRM' })
    expect(deps.logout).toHaveBeenCalledWith(win.page)
    expect(win.resetSession).toHaveBeenCalledTimes(2)
  })

  it('does not try to log out when the login itself timed out', async () => {
    const { runner, deps } = setup({ login: async () => Promise.reject(new StepError('TIMEOUT', 'Kalit menyusi chiqmadi')) })
    await runner.checkLogin(TIN)
    expect(deps.logout).not.toHaveBeenCalled()
  })

  it('reports the window step as failed when the window cannot open', async () => {
    const { runner, events } = setup({
      openWindow: () => {
        throw new Error('no display')
      },
    })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'UNEXPECTED' })
    expect(events).toContainEqual(expect.objectContaining({ step: 'window', status: 'failed' }))
    expect(runner.busy()).toBe(false)
  })

  it('reports the window step as failed when the session cannot be cleared, and still closes it', async () => {
    const { runner, deps, win, events } = setup()
    win.resetSession.mockRejectedValue(new Error('storage busy'))
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'UNEXPECTED' })
    expect(events).toContainEqual(expect.objectContaining({ step: 'window', status: 'failed' }))
    expect(deps.login).not.toHaveBeenCalled()
    expect(win.close).toHaveBeenCalledOnce()
  })

  it('the watchdog aborts a run that takes too long and reports TIMEOUT', async () => {
    const { runner } = setup({
      watchdogMs: 20,
      login: (_p, ctx) =>
        new Promise<void>((_ok, fail) => ctx.signal.addEventListener('abort', () => fail(new StepError('CANCELLED', 'Bekor qilindi')))),
    })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'TIMEOUT' })
    expect(runner.busy()).toBe(false)
  })

  it('the watchdog releases the lock even if a step ignores the abort', async () => {
    vi.useFakeTimers()
    try {
      const { runner, win } = setup({ watchdogMs: 1_000, login: () => new Promise<void>(() => undefined) })
      const pending = runner.checkLogin(TIN)
      await vi.advanceTimersByTimeAsync(12_000)
      expect(await pending).toMatchObject({ ok: false, code: 'TIMEOUT' })
      expect(runner.busy()).toBe(false)
      expect(win.close).not.toHaveBeenCalled() // the hung step still owns the window
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports other step errors with a screenshot, without touching the password', async () => {
    const { runner, eri, win } = setup({
      login: async () => Promise.reject(new StepError('WRONG_FIRM', 'Boshqa firmaga kirildi')),
    })
    expect(await runner.checkLogin(TIN)).toEqual({
      ok: false,
      code: 'WRONG_FIRM',
      message: 'Boshqa firmaga kirildi',
      screenshot: '/diag/check-login-WRONG_FIRM.png',
    })
    expect(eri.markRejected).not.toHaveBeenCalled()
    expect(win.close).toHaveBeenCalledOnce()
  })

  it('turns a store error raised at typing time into a result', async () => {
    let calls = 0
    const { runner, deps } = setup()
    vi.mocked(deps.eri.withPassword).mockImplementation(async (_t, use) => {
      if (++calls === 2) throw new EriStoreError('PASSWORD_UNREADABLE', "o'qib bo'lmadi")
      return use('x')
    })
    expect(await runner.checkLogin(TIN)).toEqual({ ok: false, code: 'PASSWORD_UNREADABLE', message: "o'qib bo'lmadi" })
  })

  it('still succeeds when only the logout fails', async () => {
    const { runner, win, events } = setup({ logout: async () => Promise.reject(new StepError('TIMEOUT', 'x')) })
    expect(await runner.checkLogin(TIN)).toEqual({ ok: true })
    expect(events).toContainEqual(expect.objectContaining({ step: 'logout', status: 'failed' }))
    expect(win.close).toHaveBeenCalledOnce()
  })

  it('reports an unexpected error instead of throwing', async () => {
    const { runner, win } = setup({ login: async () => Promise.reject(new Error('webContents destroyed')) })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'UNEXPECTED', message: expect.stringContaining('webContents destroyed') })
    expect(win.close).toHaveBeenCalledOnce()
  })

  it('runs one check at a time', async () => {
    let release: (() => void) | undefined
    let calls = 0
    const { runner } = setup({ login: () => (++calls === 1 ? new Promise<void>((ok) => (release = ok)) : Promise.resolve()) })
    const first = runner.checkLogin(TIN)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(runner.busy()).toBe(true)
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'RUN_IN_PROGRESS' })
    release!()
    expect(await first).toEqual({ ok: true })
    expect(runner.busy()).toBe(false)
    expect(await runner.checkLogin(TIN)).toEqual({ ok: true })
  })

  it('cancel aborts the login signal, closes the window and reports CANCELLED', async () => {
    const { runner, deps, win, eri } = setup({
      login: vi.fn(
        (_p: Page, ctx: LoginContext) =>
          new Promise<void>((_ok, fail) => {
            ctx.signal.addEventListener('abort', () => fail(new StepError('CANCELLED', 'Bekor qilindi')))
          }),
      ),
    })
    const pending = runner.checkLogin(TIN)
    await vi.waitFor(() => expect(deps.login).toHaveBeenCalled())
    runner.cancel()
    expect(await pending).toEqual({ ok: false, code: 'CANCELLED', message: 'Bekor qilindi' })
    expect(vi.mocked(deps.openWindow).mock.calls[0]![0].signal.aborted).toBe(true)
    expect(win.close).toHaveBeenCalledOnce()
    expect(eri.markRejected).not.toHaveBeenCalled()
    expect(runner.busy()).toBe(false)
  })

  it('cancel with nothing running is harmless', () => {
    const { runner } = setup()
    expect(() => runner.cancel()).not.toThrow()
  })
})
