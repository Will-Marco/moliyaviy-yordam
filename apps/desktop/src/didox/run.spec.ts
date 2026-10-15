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
  clear: vi.fn(async () => undefined),
  reload: vi.fn(async () => undefined),
  selectOption: vi.fn(async () => undefined),
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

  it('the heartbeat stops a run that has gone quiet and says so', async () => {
    const { runner } = setup({
      stallMs: 20,
      beatMs: 5,
      login: (_p, ctx) =>
        new Promise<void>((_ok, fail) => ctx.signal.addEventListener('abort', () => fail(new StepError('CANCELLED', 'Bekor qilindi')))),
    })
    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'STALLED' })
    expect(runner.busy()).toBe(false)
  })

  it('closes the window by force when a hung step ignores the cancel, and keeps no zombie lock', async () => {
    let closed: (() => void) | undefined
    const { runner, win } = setup({
      stallMs: 20,
      graceMs: 20,
      beatMs: 5,
      // Like the real Page: its waits end only when the window goes away.
      login: () =>
        new Promise<void>((_ok, fail) => {
          closed = () => fail(new StepError('PAGE_UNEXPECTED', 'Didox oynasi yopildi'))
        }),
    })
    win.close.mockImplementation(() => closed?.())

    expect(await runner.checkLogin(TIN)).toMatchObject({ ok: false, code: 'STALLED' })
    expect(win.close).toHaveBeenCalled()
    expect(runner.busy()).toBe(false)
  })

  it('a long run that keeps reporting progress is left alone', async () => {
    const { runner, deps } = setup({
      stallMs: 60,
      beatMs: 5,
      login: async (_p, ctx) => {
        // Six beats over ~90 ms: longer than the stall window, but never silent for it.
        for (let i = 0; i < 6; i++) {
          await new Promise((ok) => setTimeout(ok, 15))
          ctx.onProgress?.({ firmTin: TIN, step: `ish-${i}`, status: 'done' })
        }
      },
    })
    expect(await runner.checkLogin(TIN)).toEqual({ ok: true })
    expect(deps.logout).toHaveBeenCalled()
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

  // Review finding 1: before the Didox window exists there is nothing to close, so each preparation step is bounded.
  it.each([
    ['listKeys', { listKeys: () => new Promise<Map<string, KeyStatus>>(() => undefined) }],
    ['preflight', { preflight: () => new Promise<'ok'>(() => undefined) }],
  ])('does not wedge the lock when %s never answers', async (_name, over) => {
    vi.useFakeTimers()
    try {
      const { runner, deps } = setup(over as Partial<DidoxRunnerDeps>)
      const pending = runner.checkLogin(TIN)
      await vi.advanceTimersByTimeAsync(61_000)
      expect(await pending).toMatchObject({ ok: false, code: 'TIMEOUT' })
      expect(runner.busy()).toBe(false)
      expect(deps.openWindow).not.toHaveBeenCalled()
      } finally {
      vi.useRealTimers()
    }
  })

  it('does not wedge the lock when clearing the Didox session never answers', async () => {
    vi.useFakeTimers()
    try {
      const { runner, win, deps } = setup()
      win.resetSession.mockReturnValue(new Promise<void>(() => undefined))
      const pending = runner.checkLogin(TIN)
      await vi.advanceTimersByTimeAsync(61_000)
      // The window is closed anyway: the second resetSession in the run's finally has its own 5 s bound.
      await vi.advanceTimersByTimeAsync(6_000)
      expect(await pending).toMatchObject({ ok: false, code: 'TIMEOUT' })
      expect(deps.login).not.toHaveBeenCalled()
      expect(win.close).toHaveBeenCalledOnce()
      expect(runner.busy()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancel with nothing running is harmless', () => {
    const { runner } = setup()
    expect(() => runner.cancel()).not.toThrow()
  })
})

describe('createDidoxRunner.createDrafts', () => {
  const invoice = {
    contractId: 'c-1',
    contractNumber: '12/25',
    contractSignedOn: '2026-09-01',
    borrowerTin: '300000002',
    borrowerName: 'BETA TRADE MCHJ',
    lineName: 'Foiz',
    amount: '552328.77',
  }

  /** A journal that records what it was asked to do, without touching the disk. */
  function fakeJournal(runId = '2026-10-13T09-00-00.000Z-a1b2') {
    const finished: { status: string; failure?: { code: string } }[] = []
    const handle = {
      runId,
      snapshot: () => ({ runId, month: '2026-09', trigger: 'manual' as const, startedAt: 'x', status: 'running' as const, firms: [] }),
      setFirm: vi.fn(async () => undefined),
      setInvoice: vi.fn(async () => undefined),
      markInvoice: vi.fn(async () => 'marked' as const),
      addStep: vi.fn(async () => undefined),
      finish: vi.fn(async (status: string, failure?: { code: string }) => void finished.push({ status, ...(failure ? { failure } : {}) })),
    }
    return {
      finished,
      handle,
      journal: {
        start: vi.fn(async () => handle),
        read: vi.fn(async () => null),
        flushIdFound: vi.fn(async () => ({ marked: 0, needsCheck: 0, left: 0, unauthorized: false })),
      },
    }
  }

  const drafts = (over: { rows?: unknown[]; journal?: unknown } = {}) => {
    const j = fakeJournal()
    return {
      spy: j,
      deps: {
        api: {
          listInvoices: vi.fn(async () => ({
            month: '2026-09',
            months: ['2026-09'],
            lenders: [],
            rows: over.rows ?? [
              { ...invoice, lender: { id: 'l1', tin: TIN, name: 'ALFA' }, borrower: { id: 'b1', tin: invoice.borrowerTin, name: invoice.borrowerName }, contract: { number: invoice.contractNumber, signedOn: invoice.contractSignedOn }, draft: null },
            ],
          })),
          markDraft: vi.fn(async () => ({ ok: true as const, row: {} as never })),
        },
        journal: (over.journal ?? j.journal) as never,
        skips: { list: vi.fn(async () => ({})) },
      } as never,
    }
  }

  it('answers with the run id at once and does the work in the background', async () => {
    const d = drafts()
    const { runner } = setup({ drafts: d.deps })

    const started = await runner.createDrafts({ month: '2026-09', lenderIds: 'all' })

    expect(started).toEqual({ ok: true, runId: '2026-10-13T09-00-00.000Z-a1b2' })
    await vi.waitFor(() => expect(d.spy.handle.finish).toHaveBeenCalled())
  })

  it('sends any id found earlier before it plans new work', async () => {
    const d = drafts()
    const { runner } = setup({ drafts: d.deps })

    await runner.createDrafts({ month: '2026-09', lenderIds: 'all' })

    expect(d.spy.journal.flushIdFound).toHaveBeenCalled()
  })

  it('says there is nothing to do instead of starting an empty run', async () => {
    const d = drafts({ rows: [] })
    const { runner } = setup({ drafts: d.deps })

    await expect(runner.createDrafts({ month: '2026-09', lenderIds: 'all' })).resolves.toMatchObject({
      ok: false,
      code: 'NOTHING_TO_DO',
    })
    expect(d.spy.journal.start).not.toHaveBeenCalled()
  })

  it('refuses a month it cannot read', async () => {
    const { runner } = setup({ drafts: drafts().deps })
    await expect(runner.createDrafts({ month: '2026-13', lenderIds: 'all' })).resolves.toMatchObject({ ok: false })
  })

  it('runs one at a time', async () => {
    const d = drafts()
    const { runner } = setup({ drafts: d.deps })

    const first = await runner.createDrafts({ month: '2026-09', lenderIds: 'all' })
    const second = await runner.createDrafts({ month: '2026-09', lenderIds: 'all' })

    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: false, code: 'RUN_IN_PROGRESS' })
  })

  it('refuses to create drafts in a build without the draft side', async () => {
    const { runner } = setup()
    await expect(runner.createDrafts({ month: '2026-09', lenderIds: 'all' })).resolves.toMatchObject({
      ok: false,
      code: 'UNAVAILABLE',
    })
  })

  it('has no status to show before the first run', async () => {
    const { runner } = setup({ drafts: drafts().deps })
    await expect(runner.status()).resolves.toBeNull()
  })
})

describe('what the invoices page reads (c2)', () => {
  const invoice = {
    contractId: 'c-1',
    contractNumber: '12/25',
    contractSignedOn: '2026-09-01',
    borrowerTin: '300000002',
    borrowerName: 'BETA TRADE MCHJ',
    lineName: 'Foiz',
    amount: '552328.77',
  }

  /** A real journal and a real skip store on disk: these wrappers exist to put the two together. */
  async function withStores() {
    const { mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { createJournal } = await import('./journal.js')
    const { createSkipStore } = await import('./skips.js')
    const dir = await mkdtemp(join(tmpdir(), 'didox-flags-'))
    const journal = createJournal({ dir, nowMs: () => Date.parse('2026-10-13T09:00:00.000Z'), randomHex: () => 'a1b2' })
    const skips = createSkipStore({ file: join(dir, 'skips.json') })
    const drafts = {
      api: { listInvoices: vi.fn(), markDraft: vi.fn() } as never,
      journal,
      skips,
    }
    return { journal, skips, drafts }
  }

  const flagged = async (journal: Awaited<ReturnType<typeof withStores>>['journal']) => {
    const run = await journal.start({
      month: '2026-09',
      trigger: 'manual',
      firms: [{ tin: TIN, name: 'ALFA', invoices: [invoice] }],
    })
    await run.setInvoice(TIN, 'c-1', { state: 'saving', savingAt: '2026-10-13T08:00:00.000Z' })
    await run.setInvoice(TIN, 'c-1', { state: 'needs_check', code: 'SAVED_ID_UNKNOWN', message: 'topilmadi' })
    await run.finish('done')
    return run.runId
  }

  it('shows why an invoice needs attention and which invoices are being skipped, in one answer', async () => {
    const { journal, drafts } = await withStores()
    await flagged(journal)
    const { runner } = setup({ drafts })
    await runner.skipInvoice({ month: '2026-09', contractId: 'c-2', skip: true })

    const flags = await runner.invoiceFlags('2026-09')

    // The web reads `needsCheck` nested (apps/web/src/lib/desktop.ts DidoxInvoiceFlags); returned flat, the
    // "e'tibor kerak" badge and its actions never showed in the real app.
    expect(flags['c-1']).toEqual({ needsCheck: expect.objectContaining({ code: 'SAVED_ID_UNKNOWN', message: 'topilmadi' }) })
    expect(flags['c-2']).toEqual({ skipped: { at: expect.any(String) } })
  })

  it('keeps both when an invoice that needs attention is also skipped', async () => {
    const { journal, drafts } = await withStores()
    await flagged(journal)
    const { runner } = setup({ drafts })
    await runner.skipInvoice({ month: '2026-09', contractId: 'c-1', skip: true })

    expect(await runner.invoiceFlags('2026-09')).toEqual({
      'c-1': { needsCheck: expect.objectContaining({ code: 'SAVED_ID_UNKNOWN' }), skipped: { at: expect.any(String) } },
    })
  })

  it('takes the skip off again', async () => {
    const { drafts } = await withStores()
    const { runner } = setup({ drafts })
    await runner.skipInvoice({ month: '2026-09', contractId: 'c-2', skip: true })

    await runner.skipInvoice({ month: '2026-09', contractId: 'c-2', skip: false })

    expect(await runner.invoiceFlags('2026-09')).toEqual({})
  })

  it('drops the attention flag when the accountant has dealt with it, and keeps the run', async () => {
    const { journal, drafts } = await withStores()
    const runId = await flagged(journal)
    const { runner } = setup({ drafts })

    await runner.resolveNeedsCheck({ month: '2026-09', contractId: 'c-1' })

    expect(await runner.invoiceFlags('2026-09')).toEqual({})
    expect((await runner.getRun(runId))?.firms[0]?.invoices[0]).toMatchObject({ state: 'needs_check', resolved: true })
  })

  it('lists the month\'s runs for the history card', async () => {
    const { journal, drafts } = await withStores()
    await flagged(journal)
    const { runner } = setup({ drafts })

    const runs = await runner.listRuns({ month: '2026-09', limit: 5 })

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ month: '2026-09', status: 'done', counts: expect.objectContaining({ needsCheck: 1 }) })
  })

  it('answers with nothing in a build without the draft side', async () => {
    const { runner } = setup()
    expect(await runner.invoiceFlags('2026-09')).toEqual({})
    expect(await runner.listRuns({})).toEqual([])
    expect(await runner.getRun('2026-10-13T09-00-00.000Z-a1b2')).toBeNull()
  })
})
