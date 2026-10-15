import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type InvoiceApiRow, type InvoiceList, type MarkDraftResult, type ServerInvoiceFlags } from '../api/client.js'
import { EimzoError } from '../eimzo/client.js'
import type { KeyStatus } from '../eimzo/match.js'
import { EriStoreError } from '../secrets/eri-store.js'
import { StepError } from './contract.js'
import { type CreateDraftsDeps, planRun, runPlan } from './create-drafts.js'
import type { RunContext } from './engine.js'
import { createJournal, type RunJournal } from './journal.js'
import * as L from './locators.js'
import type { DidoxWindow } from './run.js'
import { FakePage } from './testing/fake-page.js'

/* The form work has its own tests (steps/create-draft.spec.ts); here it is a stub whose answer each test chooses. */
const createDraftMock = vi.hoisted(() => vi.fn())
vi.mock('./steps/create-draft.js', () => ({ createDraft: createDraftMock }))
const DRAFT_ID = '032704ECC6E911F1AD74FA163EA3FD69'

/*
 * The orchestration on a real journal (a temp directory) and a fake Didox: what matters here is which firm is
 * attempted, what the record says afterwards, and that one firm's bad day never costs the others theirs (FR-8.8).
 * The page work itself is stubbed — `steps/create-draft.spec.ts` is where the form is tested.
 */

const MONTH = '2026-09'
const LENDER_A = { id: 'a', tin: '300000001', name: 'ALFA SAVDO MCHJ' }
const LENDER_B = { id: 'b', tin: '300000011', name: 'DELTA MCHJ' }
const BORROWER = { id: 'z', tin: '300000002', name: 'BETA TRADE MCHJ' }

const apiRow = (over: Partial<InvoiceApiRow> & { lender?: typeof LENDER_A } = {}): InvoiceApiRow => ({
  contractId: over.contractId ?? 'c-1',
  lender: over.lender ?? LENDER_A,
  borrower: BORROWER,
  contract: { number: '12/25', signedOn: '2026-09-01' },
  lineName: 'Foiz',
  amount: over.amount ?? '552328.77',
  draft: over.draft ?? null,
})

const list = (rows: InvoiceApiRow[]): InvoiceList => ({ month: MONTH, months: [MONTH], lenders: [LENDER_A], rows })

const okKey = (tin: string): [string, KeyStatus] => [
  tin,
  { status: 'ok', key: { tin, serial: `serial-${tin}`, validTo: '2028-01-21T12:04:52', org: 'ALFA', title: null } } as KeyStatus,
]

let dir: string
let clockMs = Date.parse('2026-10-13T09:00:00.000Z')
let hex = 'a1b2'
beforeEach(async () => {
  clockMs = Date.parse('2026-10-13T09:00:00.000Z')
  hex = 'a1b2'
  dir = await mkdtemp(join(tmpdir(), 'didox-run-'))
  createDraftMock.mockReset()
  createDraftMock.mockResolvedValue({ kind: 'marked', didoxId: DRAFT_ID })
})

interface Harness {
  deps: CreateDraftsDeps
  page: FakePage
  closed: () => number
  reset: () => number
  draftCalls: () => number
}

function harness(over: Partial<CreateDraftsDeps> & { draft?: () => Promise<unknown>; rows?: InvoiceApiRow[] } = {}): Harness {
  const page = new FakePage()
  let closed = 0
  let reset = 0
  const win: DidoxWindow = {
    page,
    resetSession: async () => void reset++,
    close: () => void closed++,
  }
  const deps: CreateDraftsDeps = {
    api: {
      listInvoices: vi.fn(async () => list(over.rows ?? [apiRow()])),
      markDraft: vi.fn(async (): Promise<MarkDraftResult> => ({ ok: true, row: apiRow() })),
      listFlags: vi.fn(async (): Promise<Record<string, ServerInvoiceFlags>> => ({})),
    },
    journal: createJournal({ dir, nowMs: () => clockMs, randomHex: () => hex }),
    listKeys: vi.fn(async (tins: string[]) => new Map(tins.map(okKey))),
    eri: { withPassword: vi.fn(async (_tin, use) => use('parol')), markRejected: vi.fn(async () => undefined) },
    preflight: vi.fn(async () => 'ok' as const),
    openWindow: () => win,
    loginFirm: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    onProgress: () => undefined,
    nowMs: () => Date.parse('2026-10-13T09:32:00.000Z'),
    ...over,
  }
  return { deps, page, closed: () => closed, reset: () => reset, draftCalls: () => 0 }
}

const context = (signal = new AbortController().signal): RunContext => ({
  signal,
  beat: () => undefined,
  enterCritical: () => undefined,
  exitCritical: () => undefined,
  onForceStop: () => undefined,
})

/** Runs the plan with `createDraft` stubbed, and hands back the journal as it ended up. */
async function run(h: Harness, options: { signal?: AbortSignal } = {}): Promise<{ journal: RunJournal; outcome: unknown }> {
  const plan = await planRun(h.deps, { month: MONTH, lenderIds: 'all' })
  if (!plan) throw new Error('reja bo‘sh')
  const handle = await h.deps.journal.start({ month: MONTH, trigger: 'manual', firms: plan.firms })
  const outcome = await runPlan(h.deps, handle, plan, context(options.signal))
  const journal = await h.deps.journal.read(handle.runId)
  if (!journal) throw new Error('run yozuvi yo‘q')
  return { journal, outcome }
}

const invoiceStates = (journal: RunJournal) => journal.firms.flatMap((f) => f.invoices.map((i) => i.state))

describe('planRun', () => {
  it('takes the invoices of the month that have no draft yet', async () => {
    const h = harness({
      rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', draft: { amount: '1.00', didoxDocumentId: null, draftedAt: 'x', amountChanged: false, source: 'manual' } })],
    })

    const plan = await planRun(h.deps, { month: MONTH, lenderIds: 'all' })

    expect(plan?.firms).toHaveLength(1)
    expect(plan?.firms[0]?.invoices.map((i) => i.contractId)).toEqual(['c-1'])
  })

  it('groups the invoices under the firm that issues them', async () => {
    const h = harness({ rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })] })

    const plan = await planRun(h.deps, { month: MONTH, lenderIds: 'all' })

    expect(plan?.firms.map((f) => f.tin)).toEqual([LENDER_A.tin, LENDER_B.tin])
  })

  it('leaves out the firms the accountant did not pick', async () => {
    const h = harness({ rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })] })

    const plan = await planRun(h.deps, { month: MONTH, lenderIds: [LENDER_B.id] })

    expect(plan?.firms.map((f) => f.tin)).toEqual([LENDER_B.tin])
  })

  it('leaves out an invoice an accountant has told it to skip — read from the server', async () => {
    const h = harness({ rows: [apiRow({ contractId: 'c-1' })] })
    h.deps.api.listFlags = vi.fn(async () => ({ 'c-1': { skipped: { at: 'x' } } }))

    expect(await planRun(h.deps, { month: MONTH, lenderIds: 'all' })).toBeNull()
    expect(h.deps.api.listFlags).toHaveBeenCalledWith(MONTH)
  })

  it('still plans an invoice that only needs checking, and remembers the flag for recovery', async () => {
    const h = harness({ rows: [apiRow({ contractId: 'c-1' })] })
    h.deps.api.listFlags = vi.fn(async () => ({
      'c-1': { needsCheck: { code: 'SAVE_FAILED', message: 'x', at: 'x', createdByInstall: 'PC (1)' } },
    }))

    const plan = await planRun(h.deps, { month: MONTH, lenderIds: 'all' })

    expect(plan?.firms[0]?.invoices.map((i) => i.contractId)).toEqual(['c-1'])
    expect([...(plan?.flagged ?? [])]).toEqual(['c-1'])
  })

  it('does not plan at all when the server flags cannot be read', async () => {
    const h = harness()
    h.deps.api.listFlags = vi.fn(async () => Promise.reject(new ApiError(0, 'NETWORK', 'Server javob bermadi')))

    await expect(planRun(h.deps, { month: MONTH, lenderIds: 'all' })).rejects.toBeInstanceOf(ApiError)
  })

  /* c1 runs with DIDOX_MAX_INVOICES=1: one invoice goes end to end before many are let loose. */
  it('stops at the cap it was given', async () => {
    const h = harness({ rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2' })], maxInvoices: 1 })

    const plan = await planRun(h.deps, { month: MONTH, lenderIds: 'all' })

    expect(plan?.firms[0]?.invoices).toHaveLength(1)
  })

  it('says there is nothing to do rather than starting an empty run', async () => {
    const h = harness({ rows: [] })
    expect(await planRun(h.deps, { month: MONTH, lenderIds: 'all' })).toBeNull()
  })
})

describe('runPlan', () => {
  it('never opens a window when E-IMZO is not running', async () => {
    const h = harness({
      listKeys: async () => {
        throw new EimzoError('EIMZO_NOT_RUNNING', 'E-IMZO ishga tushirilmagan')
      },
    })

    const { outcome } = await run(h)

    expect(outcome).toMatchObject({ status: 'failed', failure: { code: 'EIMZO_NOT_RUNNING' } })
    expect(h.closed()).toBe(0)
  })

  it('never opens a window when the typist cannot work here', async () => {
    const h = harness({ preflight: async () => 'no_permission' })

    const { outcome } = await run(h)

    expect(outcome).toMatchObject({ status: 'failed', failure: { code: 'ACCESSIBILITY_DENIED' } })
    expect(h.closed()).toBe(0)
  })

  it('skips a firm whose key is missing and says so on its invoices', async () => {
    const h = harness({ listKeys: async () => new Map() })

    const { journal } = await run(h)

    expect(journal.firms[0]?.status).toBe('skipped')
    expect(journal.firms[0]?.code).toBe('KEY_MISSING')
    expect(invoiceStates(journal)).toEqual(['skipped'])
    expect(h.closed()).toBe(0)
  })

  it('skips a firm whose password is not saved', async () => {
    const h = harness({
      eri: {
        withPassword: async () => {
          throw new EriStoreError('PASSWORD_MISSING', 'Parol saqlanmagan')
        },
        markRejected: vi.fn(async () => undefined),
      },
    })

    const { journal } = await run(h)

    expect(journal.firms[0]).toMatchObject({ status: 'skipped', code: 'PASSWORD_MISSING' })
  })

  describe('with Didox open', () => {
    it('logs in, clears the session first and logs out afterwards', async () => {
      const h = harness()

      const { journal } = await run(h)

      expect(h.deps.loginFirm).toHaveBeenCalledTimes(1)
      expect(h.deps.logout).toHaveBeenCalledTimes(1)
      expect(h.reset()).toBeGreaterThanOrEqual(2) // before the firm and after the run
      expect(h.closed()).toBe(1)
      expect(journal.firms[0]?.status).toBe('done')
    })

    it('carries on with the next firm when one cannot log in', async () => {
      const h = harness({ rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })] })
      h.deps.loginFirm = vi.fn(async (_win, firm) => {
        if (firm.tin === LENDER_A.tin) throw new StepError('WRONG_PASSWORD', 'E-IMZO parolni qabul qilmadi')
      })

      const { journal } = await run(h)

      expect(journal.firms[0]).toMatchObject({ status: 'failed', code: 'WRONG_PASSWORD' })
      expect(journal.firms[1]?.status).toBe('done')
      expect(h.deps.eri.markRejected).toHaveBeenCalledWith(LENDER_A.tin)
    })

    it('marks the invoices of a firm that failed to log in as skipped, with the reason', async () => {
      const h = harness({ loginFirm: async () => {
        throw new StepError('LOGIN_FAILED', "Didox'ga kirilmadi")
      } })

      const { journal } = await run(h)

      expect(journal.firms[0]?.invoices[0]).toMatchObject({ state: 'skipped', code: 'LOGIN_FAILED' })
    })

    it('leaves an invoice the accountant marked by hand meanwhile alone', async () => {
      const h = harness()
      h.deps.api.listInvoices = vi
        .fn()
        .mockResolvedValueOnce(list([apiRow()]))
        .mockResolvedValueOnce(
          list([apiRow({ draft: { amount: '552328.77', didoxDocumentId: null, draftedAt: 'x', amountChanged: false, source: 'manual' } })]),
        )

      const { journal } = await run(h)

      expect(journal.firms[0]?.invoices[0]).toMatchObject({ state: 'skipped', code: 'ALREADY_DRAFTED' })
    })

    it('stops the firm but not the run when the page is not what it expected', async () => {
      const h = harness({ rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })] })
      // The first firm's form work throws; the second firm's does not.
      let firstFirm = true
      createDraftMock.mockImplementation(async () => {
        if (firstFirm) {
          firstFirm = false
          throw new StepError('FORM_UNEXPECTED_VALUE', 'Didox formasi kutilganidek emas', 'verifyType', '/diag/x.png')
        }
        return { kind: 'marked', didoxId: DRAFT_ID }
      })

      const { journal, outcome } = await run(h)

      expect(outcome).toMatchObject({ status: 'done' })
      expect(journal.firms[0]).toMatchObject({ status: 'failed', code: 'FORM_UNEXPECTED_VALUE', screenshot: '/diag/x.png' })
      expect(journal.firms[1]?.status).toBe('done')
    })

    it('stops the whole run when the app\'s own API refuses it', async () => {
      const h = harness()
      createDraftMock.mockResolvedValue({
        kind: 'run_failed',
        code: 'API_UNAVAILABLE',
        message: "Ilova o'z API'siga kira olmadi",
      })

      const { outcome } = await run(h)

      expect(outcome).toMatchObject({ status: 'failed', failure: { code: 'API_UNAVAILABLE' } })
    })

    it('stops the firm, not the run, when the invoice list cannot be read again', async () => {
      const h = harness({ rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })] })
      h.deps.api.listInvoices = vi
        .fn()
        .mockResolvedValueOnce(list([apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })]))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(list([apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })]))

      const { journal, outcome } = await run(h)

      expect(outcome).toMatchObject({ status: 'done' })
      expect(createDraftMock).toHaveBeenCalledTimes(1)
      expect(journal.firms[0]).toMatchObject({ status: 'failed', code: 'API_UNAVAILABLE' })
      expect(journal.firms[0]?.invoices[0]).toMatchObject({ state: 'skipped', code: 'API_UNAVAILABLE' })
      expect(journal.firms[1]?.status).toBe('done')
    })

    /*
     * A refused session is not this firm's problem: every firm after it would sign in to Didox, have its ERI password
     * typed, and be refused the same way. It stops the run, as a refused mark already does.
     */
    it('stops the whole run when the server refuses the robot key on the re-read', async () => {
      const h = harness({ rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })] })
      h.deps.api.listInvoices = vi
        .fn()
        .mockResolvedValueOnce(list([apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2', lender: LENDER_B })]))
        .mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Sessiya tugagan'))

      const { outcome } = await run(h)

      expect(outcome).toMatchObject({ status: 'failed', failure: { code: 'ROBOT_TOKEN_MISSING', message: expect.stringContaining('qayta kiring') } })
      expect(h.deps.loginFirm).toHaveBeenCalledTimes(1)
      expect(createDraftMock).not.toHaveBeenCalled()
    })

    it('stops the firm when the server flags cannot be read again', async () => {
      const h = harness()
      h.deps.api.listFlags = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'Server javob bermadi'))

      const { journal } = await run(h)

      expect(createDraftMock).not.toHaveBeenCalled()
      expect(journal.firms[0]).toMatchObject({ status: 'failed', code: 'API_UNAVAILABLE' })
    })

    it('does not create an invoice an accountant skipped (on any computer) after the plan was made', async () => {
      const h = harness()
      h.deps.api.listFlags = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ 'c-1': { skipped: { at: 'x' } } })

      const { journal } = await run(h)

      expect(createDraftMock).not.toHaveBeenCalled()
      expect(journal.firms[0]?.invoices[0]).toMatchObject({ state: 'skipped', code: 'SKIPPED_BY_USER' })
    })

    it('stops the firm after a saved draft that could not be marked, keeping its ID for later', async () => {
      const h = harness({
        rows: [apiRow({ contractId: 'c-1' }), apiRow({ contractId: 'c-2' }), apiRow({ contractId: 'c-3', lender: LENDER_B })],
      })
      createDraftMock.mockImplementation(async (opts: { item: { contractId: string }; journal: { setInvoice(p: object): Promise<unknown> } }) => {
        if (opts.item.contractId !== 'c-1') return { kind: 'marked', didoxId: DRAFT_ID }
        // What the real step leaves behind when the API stayed silent twice: the ID on disk, not yet in the API.
        await opts.journal.setInvoice({ state: 'saving', savingAt: '2026-10-13T09:31:00.000Z' })
        await opts.journal.setInvoice({ state: 'id_found', didoxId: DRAFT_ID })
        return { kind: 'id_found', didoxId: DRAFT_ID }
      })

      const { journal, outcome } = await run(h)

      expect(outcome).toMatchObject({ status: 'done' })
      expect(createDraftMock.mock.calls.map(([opts]) => opts.item.contractId)).toEqual(['c-1', 'c-3'])
      expect(journal.firms[0]).toMatchObject({ status: 'failed', code: 'API_UNAVAILABLE' })
      expect(journal.firms[0]?.invoices).toMatchObject([
        { contractId: 'c-1', state: 'id_found', didoxId: DRAFT_ID },
        { contractId: 'c-2', state: 'skipped', code: 'API_UNAVAILABLE' },
      ])
      expect(journal.firms[1]?.status).toBe('done')
    })

    it('writes the amount it actually used when the accountant changed it meanwhile', async () => {
      const h = harness()
      h.deps.api.listInvoices = vi
        .fn()
        .mockResolvedValueOnce(list([apiRow({ amount: '552328.77' })]))
        .mockResolvedValueOnce(list([apiRow({ amount: '600000.00' })]))
      const seen: string[] = []
      createDraftMock.mockImplementation(async (opts: { item: { amount: string } }) => {
        seen.push(opts.item.amount)
        return { kind: 'marked', didoxId: DRAFT_ID }
      })

      await run(h)

      expect(seen).toEqual(['600000.00'])
    })

    it('closes the window and clears the session even when a firm blows up', async () => {
      const h = harness({ loginFirm: async () => {
        throw new Error('kutilmagan')
      } })

      await run(h)

      expect(h.closed()).toBe(1)
      expect(h.reset()).toBeGreaterThanOrEqual(1)
    })

    it('reports a cancelled run as cancelled', async () => {
      const controller = new AbortController()
      const h = harness({ loginFirm: async () => void controller.abort() })

      const { outcome } = await run(h, { signal: controller.signal })

      expect(outcome).toMatchObject({ status: 'cancelled' })
    })
  })
})

describe('recovering a draft an earlier run could not name (§5)', () => {
  /* The id Didox gave the c1 gate's draft; it carries 2026-10-13T12:07:19Z, moments after the save below. */
  const LOST_DRAFT = 'A374C0AAC6FE11F19862FA163EA3FD69'
  const SAVED_AT = '2026-10-13T12:07:00.000Z'

  /** A finished run that saved a draft for c-1 and never identified it; today's run is about c-2. */
  async function earlierRun(h: Harness) {
    const handle = await h.deps.journal.start({
      month: MONTH,
      trigger: 'manual',
      firms: [
        {
          tin: LENDER_A.tin,
          name: LENDER_A.name,
          invoices: [
            {
              contractId: 'c-1',
              contractNumber: '12/25',
              contractSignedOn: '2026-09-01',
              borrowerTin: BORROWER.tin,
              borrowerName: BORROWER.name,
              lineName: 'Foiz',
              amount: '552328.77',
            },
          ],
        },
      ],
    })
    await handle.setInvoice(LENDER_A.tin, 'c-1', { state: 'saving', savingAt: SAVED_AT })
    await handle.setInvoice(LENDER_A.tin, 'c-1', {
      state: 'needs_check',
      code: 'SAVED_ID_UNKNOWN',
      message: "Saqlangan qoralama ro'yxatda topilmadi",
    })
    await handle.finish('done')
    clockMs += 60_000
    hex = 'b2c3'
    return handle.runId
  }

  const listRow = (over: { id?: string; amount?: string } = {}) => ({
    href: `/documents/${over.id ?? LOST_DRAFT}/1`,
    statusClass: 'doc-status doc-status--white',
    counterparty: `"BETA TRADE" MCHJ${BORROWER.tin}`,
    contract: '12/25 01.09.2026',
    amount: over.amount ?? '552 328.77',
  })

  /** Today's run has its own invoice to do, so recovery is extra work on the side, as it is in a real month. */
  const today = () => harness({ rows: [apiRow({ contractId: 'c-2' })] })

  it('writes down the draft it recognises and tells the API about it', async () => {
    const h = today()
    const earlier = await earlierRun(h)
    h.page.on(L.listReady.js, true).on(L.listRows.js, [listRow()])

    await run(h)

    expect((await h.deps.journal.read(earlier))?.firms[0]?.invoices[0]).toMatchObject({
      state: 'marked',
      didoxId: LOST_DRAFT,
      flagSync: 'clear', // the server's needs-check for it is resolved by the next push
    })
  })

  it('leaves the invoice flagged, with a fresher reason, when nothing fits', async () => {
    const h = today()
    await earlierRun(h)
    h.page.on(L.listReady.js, true).on(L.listRows.js, [])

    await run(h)

    expect((await h.deps.journal.findNeedsCheck(MONTH))[0]?.invoice).toMatchObject({
      contractId: 'c-1',
      code: 'SAVED_ID_UNKNOWN',
      message: expect.stringContaining('topilmadi'),
    })
  })

  it('never claims a draft whose amount is not this invoice\'s', async () => {
    const h = today()
    await earlierRun(h)
    h.page.on(L.listReady.js, true).on(L.listRows.js, [listRow({ amount: '1 000 000.00' })])

    await run(h)

    expect((await h.deps.journal.findNeedsCheck(MONTH)).map((e) => e.invoice.contractId)).toEqual(['c-1'])
  })

  /** The earlier run's flag as the server has it: sent, and still unresolved there (or not). */
  const sent = async (h: Harness) => {
    await h.deps.journal.pushFlags({ recordNeedsCheck: async () => ({ ok: true }), resolveNeedsCheck: async () => ({ ok: true }) })
  }

  it('still recovers an invoice the server keeps flagged', async () => {
    const h = today()
    const earlier = await earlierRun(h)
    await sent(h)
    h.deps.api.listFlags = vi.fn(async () => ({
      'c-1': { needsCheck: { code: 'SAVED_ID_UNKNOWN', message: 'x', at: 'x', createdByInstall: 'PC (1)' } },
    }))
    h.page.on(L.listReady.js, true).on(L.listRows.js, [listRow()])

    await run(h)

    expect((await h.deps.journal.read(earlier))?.firms[0]?.invoices[0]).toMatchObject({ state: 'marked', didoxId: LOST_DRAFT })
  })

  it('leaves alone what an accountant resolved on the server, and stops looking for it', async () => {
    const h = today()
    const earlier = await earlierRun(h)
    await sent(h)
    h.page.on(L.listReady.js, true).on(L.listRows.js, [listRow()])

    await run(h)

    expect((await h.deps.journal.read(earlier))?.firms[0]?.invoices[0]).toMatchObject({ state: 'needs_check', resolved: true })
    expect(await h.deps.journal.findNeedsCheck(MONTH)).toEqual([])
  })
})
