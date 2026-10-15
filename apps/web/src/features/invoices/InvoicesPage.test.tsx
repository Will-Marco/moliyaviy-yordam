import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { companyA, companyB } from '@/features/contracts/fixtures'
import type {
  DidoxInvoiceFlags,
  DidoxProgress,
  DidoxRun,
  DidoxRunInvoice,
  DidoxRunSummary,
  DidoxStartResult,
} from '@/lib/desktop'
import { mockApi, renderWithProviders } from '@/test/utils'
import type { Invoice, InvoiceList } from './api'
import { InvoicesPage } from './InvoicesPage'

const LINE = 'Берилган молиявий ёрдамнинг фоиз куринишидаги даромади за сентябрь 2026 г.'
const party = (c: typeof companyA) => ({ id: c.id, name: c.name, tin: c.tin })

const ready: Invoice = {
  contractId: '0192f000-0000-7000-8000-0000000000c1',
  lender: party(companyA),
  borrower: party(companyB),
  contract: { number: '1', signedOn: '2025-12-28' },
  lineName: LINE,
  amount: '552328.77',
  draft: null,
}
const other: Invoice = {
  ...ready,
  contractId: '0192f000-0000-7000-8000-0000000000c2',
  lender: party(companyB),
  borrower: party(companyA),
  contract: { number: '7', signedOn: '2026-02-01' },
  amount: '1000.00',
}
const list = (rows: Invoice[], month = '2026-09'): InvoiceList => ({
  month,
  months: ['2026-09', '2026-08'],
  lenders: [party(companyA), party(companyB)],
  rows,
})
const draftUrl = `PUT /api/invoices/2026-09/${ready.contractId}/draft`

describe('InvoicesPage (Module 7)', () => {
  it('lists last month’s invoices with the §9.1 fields (FR-7.1)', async () => {
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([ready]) }) })
    renderWithProviders(<InvoicesPage />)
    const row = (await screen.findByText('№ 1')).closest('tr')!
    expect(row).toHaveTextContent('A MCHJ')
    expect(row).toHaveTextContent('B MCHJ')
    expect(row).toHaveTextContent('300000002')
    expect(row).toHaveTextContent('28.12.2025')
    expect(row).toHaveTextContent(LINE)
    expect(within(row).getByText('552 328,77')).toBeInTheDocument()
    expect(within(row).getByText('Tayyor')).toBeInTheDocument()
    expect(screen.getByLabelText('Oy')).toHaveValue('2026-09')
  })

  it('loads another month when it is picked', async () => {
    const api = mockApi({
      'GET /api/invoices': () => ({ status: 200, body: list([ready]) }),
      'GET /api/invoices?month=2026-08': () => ({ status: 200, body: list([], '2026-08') }),
    })
    renderWithProviders(<InvoicesPage />)
    await screen.findByText('№ 1')
    await userEvent.selectOptions(screen.getByLabelText('Oy'), '2026-08')
    expect(await screen.findByText("Bu oy uchun faktura yo'q")).toBeInTheDocument()
    // The month's Didox flags are read next to its invoices; the invoices asked for are the picked month's.
    expect(api.calls.filter((c) => c.path.startsWith('/api/invoices')).at(-1)?.path).toBe('/api/invoices?month=2026-08')
  })

  it('filters by lender (FR-7.5)', async () => {
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([ready, other]) }) })
    renderWithProviders(<InvoicesPage />)
    await screen.findByText('№ 7')
    await userEvent.selectOptions(screen.getByLabelText('Beruvchi'), companyB.id)
    expect(screen.queryByText('№ 1')).not.toBeInTheDocument()
    expect(screen.getByText('№ 7')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Beruvchi'), '')
    expect(screen.getByText('№ 1')).toBeInTheDocument()
  })

  it('keeps the lender filter usable in a month where that lender has no invoice', async () => {
    mockApi({
      'GET /api/invoices': () => ({ status: 200, body: list([ready]) }),
      'GET /api/invoices?month=2026-08': () => ({ status: 200, body: list([ready], '2026-08') }),
    })
    renderWithProviders(<InvoicesPage />)
    await screen.findByText('№ 1')
    await userEvent.selectOptions(screen.getByLabelText('Beruvchi'), companyB.id)
    await userEvent.selectOptions(screen.getByLabelText('Oy'), '2026-08')
    expect(await screen.findByText("Tanlangan beruvchi uchun bu oyda faktura yo'q")).toBeInTheDocument()
    expect(screen.getByLabelText('Beruvchi')).toHaveValue(companyB.id)
    await userEvent.selectOptions(screen.getByLabelText('Beruvchi'), '')
    expect(screen.getByText('№ 1')).toBeInTheDocument()
  })

  it('offers last month when the month in the address cannot be shown', async () => {
    mockApi({
      'GET /api/invoices?month=2026-10': () => ({ status: 400, body: { message: 'Faktura faqat tugagan oy uchun tuziladi' } }),
      'GET /api/invoices': () => ({ status: 200, body: list([ready]) }),
    })
    renderWithProviders(<InvoicesPage />, { route: '/invoices?month=2026-10' })
    expect(await screen.findByText('Faktura faqat tugagan oy uchun tuziladi')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: "Oxirgi tugagan oyga o'tish" }))
    expect(await screen.findByText('№ 1')).toBeInTheDocument()
  })

  it('copies each field in one click; the amount without spaces (FR-7.5)', async () => {
    const user = userEvent.setup()
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([ready]) }) })
    renderWithProviders(<InvoicesPage />)
    await screen.findByText('№ 1')
    await user.click(screen.getByRole('button', { name: 'Nusxalash: summa 552\u00a0328,77' }))
    expect(await navigator.clipboard.readText()).toBe('552328.77')
    await user.click(screen.getByRole('button', { name: 'Nusxalash: oluvchi STIR 300000002' }))
    expect(await navigator.clipboard.readText()).toBe('300000002')
    await user.click(screen.getByRole('button', { name: /Nusxalash: qator nomi/ }))
    expect(await navigator.clipboard.readText()).toBe(LINE)
    await user.click(screen.getByRole('button', { name: 'Nusxalash: shartnoma raqami 1' }))
    expect(await navigator.clipboard.readText()).toBe('1')
    await user.click(screen.getByRole('button', { name: 'Nusxalash: shartnoma sanasi 28.12.2025' }))
    expect(await navigator.clipboard.readText()).toBe('28.12.2025')
  })

  it('tells a draft the app created in Didox apart from a hand mark (M8)', async () => {
    const byApp = { ...ready, draft: { amount: ready.amount, didoxDocumentId: '36B734EEC5FE11F1BEFEFA163EA3FD69', draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: false, source: 'didox' as const } }
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([byApp]) }) })
    renderWithProviders(<InvoicesPage />)
    expect(await screen.findByText('Qoralama yaratildi (Didox)')).toBeInTheDocument()
  })

  it('marks an invoice as drafted with an optional Didox ID (FR-7.4)', async () => {
    const drafted = { ...ready, draft: { amount: ready.amount, didoxDocumentId: 'D-1', draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: false, source: 'manual' as const } }
    let current = list([ready])
    const api = mockApi({
      'GET /api/invoices': () => ({ status: 200, body: current }),
      [draftUrl]: () => {
        current = list([drafted])
        return { status: 200, body: drafted }
      },
    })
    renderWithProviders(<InvoicesPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Qoralama deb belgilash: № 1' }))
    await userEvent.type(screen.getByLabelText(/Didox hujjat ID/), 'D-1')
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toEqual({ didoxDocumentId: 'D-1' })
    const row = (await screen.findByText('Qoralama yaratildi')).closest('tr')!
    expect(row).toHaveTextContent('01.10.2026')
    expect(row).toHaveTextContent('D-1')
  })

  it('asks before marking an already drafted invoice again (FR-7.4)', async () => {
    const api = mockApi({
      'GET /api/invoices': () => ({ status: 200, body: list([ready]) }),
      [draftUrl]: (init) =>
        JSON.parse(String(init?.body)).confirmWarnings
          ? { status: 200, body: ready }
          : {
              status: 409,
              body: {
                code: 'CONFIRMATION_REQUIRED',
                message: "Ogohlantirishlarni ko'rib chiqing",
                warnings: [{ code: 'ALREADY_DRAFTED', message: 'Qoralama allaqachon yaratilgan (01.10.2026)' }],
              },
            },
    })
    renderWithProviders(<InvoicesPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Qoralama deb belgilash: № 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    expect(await screen.findByText('Qoralama allaqachon yaratilgan (01.10.2026)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Baribir saqlash' }))
    expect(api.calls.filter((c) => c.method === 'PUT').at(-1)?.body).toEqual({ confirmWarnings: true })
  })

  it('shows when a drafted amount no longer matches and lets the mark be removed', async () => {
    const stale = { ...ready, draft: { amount: '500000.00', didoxDocumentId: null, draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: true, source: 'manual' as const } }
    const api = mockApi({
      'GET /api/invoices': () => ({ status: 200, body: list([stale]) }),
      [`DELETE /api/invoices/2026-09/${ready.contractId}/draft`]: () => ({ status: 204 }),
    })
    renderWithProviders(<InvoicesPage />)
    expect(await screen.findByText(/Qoralamada 500 000,00/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Qayta belgilash: № 1' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Belgini olib tashlash: № 1' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Olib tashlash' }))
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('keeps the Didox ID when an invoice is marked again', async () => {
    const drafted = { ...ready, draft: { amount: ready.amount, didoxDocumentId: 'D-1', draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: false, source: 'manual' as const } }
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([drafted]) }) })
    renderWithProviders(<InvoicesPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Qayta belgilash: № 1' }))
    expect(screen.getByLabelText(/Didox hujjat ID/)).toHaveValue('D-1')
  })

  it('only lets a draft be removed once the month has no interest left', async () => {
    const zero = { ...ready, amount: '0.00', draft: { amount: '100.00', didoxDocumentId: null, draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: true, source: 'manual' as const } }
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([zero]) }) })
    renderWithProviders(<InvoicesPage />)
    expect(await screen.findByRole('button', { name: 'Belgini olib tashlash: № 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Qayta belgilash: № 1' })).not.toBeInTheDocument()
  })

  describe('Didox draft run (M8c, desktop)', () => {
    const START = "Didox'da qoralama yaratish"
    const withDraft = (i: Invoice): Invoice => ({
      ...i,
      draft: {
        amount: i.amount,
        didoxDocumentId: 'D-1',
        draftedAt: '2026-10-01T04:00:00.000Z',
        amountChanged: false,
        source: 'didox',
      },
    })
    const runInvoice = (over: Partial<DidoxRunInvoice> = {}): DidoxRunInvoice => ({
      contractId: ready.contractId,
      contractNumber: '1',
      borrowerName: companyB.name,
      amount: ready.amount,
      state: 'pending',
      ...over,
    })
    const runOf = (over: Partial<DidoxRun> = {}): DidoxRun => ({
      runId: 'r1',
      month: '2026-09',
      startedAt: '2026-10-01T04:00:00.000Z',
      status: 'running',
      firms: [{ tin: companyA.tin, name: companyA.name, status: 'running', invoices: [runInvoice()] }],
      ...over,
    })

    /** Desktop bridge whose run the test settles (`finish`), feeds journals to (`setRun`) and pushes events into (`emit`). */
    const desktopWithDidox = (rows: Invoice[] = [ready, other]) => {
      let settle!: (r: DidoxStartResult) => void
      let listener: ((p: DidoxProgress) => void) | null = null
      let journal: DidoxRun | null = null
      const didox = {
        checkLogin: vi.fn(),
        createDrafts: vi.fn(() => new Promise<DidoxStartResult>((ok) => (settle = ok))),
        status: vi.fn(async () => journal),
        cancel: vi.fn(async () => undefined),
        onProgress: vi.fn((cb: (p: DidoxProgress) => void) => {
          listener = cb
          return () => (listener = null)
        }),
      }
      vi.stubGlobal('desktop', { platform: 'darwin', eri: {}, didox })
      const api = mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list(rows) }) })
      const setRun = (run: DidoxRun) => (journal = run)
      const finish = (r: DidoxStartResult) => act(() => settle(r))
      const emit = (p: Partial<DidoxProgress> & Pick<DidoxProgress, 'step' | 'status'>) =>
        act(() => listener?.({ runId: 'r1', firmTin: companyA.tin, ...p }))
      return { api, didox, setRun, finish, emit }
    }
    const openRun = async () => {
      await userEvent.click(await screen.findByRole('button', { name: START }))
      return screen.findByRole('dialog')
    }
    /** Nothing is driven before the accountant confirms (spec §7) — the app is about to use this keyboard. */
    const confirmRun = async () => {
      const dialog = await openRun()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Boshlash' }))
      return dialog
    }

    it('asks before it takes over the keyboard, and starts nothing until then', async () => {
      const { didox } = desktopWithDidox()
      renderWithProviders(<InvoicesPage />)

      const dialog = await openRun()

      expect(within(dialog).getByText(/klaviatura va sichqonchaga tegmang/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/imzolanmaydi va yuborilmaydi/i)).toBeInTheDocument()
      expect(didox.createDrafts).not.toHaveBeenCalled()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Boshlash' }))

      expect(didox.createDrafts).toHaveBeenCalledWith({ month: '2026-09', lenderIds: 'all' })
    })

    it('is not offered in a plain browser', async () => {
      mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([ready]) }) })
      renderWithProviders(<InvoicesPage />)
      await screen.findByText('№ 1')
      expect(screen.queryByRole('button', { name: START })).not.toBeInTheDocument()
    })

    it('is not offered by desktop builds older than M8c', async () => {
      vi.stubGlobal('desktop', {
        platform: 'darwin',
        eri: {},
        didox: { checkLogin: vi.fn(), cancel: vi.fn(), onProgress: vi.fn() },
      })
      mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([ready]) }) })
      renderWithProviders(<InvoicesPage />)
      await screen.findByText('№ 1')
      expect(screen.queryByRole('button', { name: START })).not.toBeInTheDocument()
    })

    it('says why it is disabled when nothing in the month needs a draft', async () => {
      desktopWithDidox([withDraft(ready), withDraft(other)])
      renderWithProviders(<InvoicesPage />)
      const button = await screen.findByRole('button', { name: START })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', "Bu oyda qoralama kutayotgan faktura yo'q")
    })

    it('starts the run, shows the live log and can be cancelled', async () => {
      const { didox, setRun, finish, emit } = desktopWithDidox()
      renderWithProviders(<InvoicesPage />)
      const dialog = await confirmRun()
      expect(didox.createDrafts).toHaveBeenCalledWith({ month: '2026-09', lenderIds: 'all' })
      expect(within(dialog).getByText(/Hech narsa imzolanmaydi/)).toBeInTheDocument()

      setRun(runOf())
      await finish({ ok: true, runId: 'r1' })
      await emit({ step: 'awaitLogin', status: 'running' })
      expect(await within(dialog).findByText(/A MCHJ · Didox'ga kirish/)).toBeInTheDocument()

      await emit({ contractId: ready.contractId, invoiceIndex: 1, invoiceCount: 2, step: 'save', status: 'running' })
      const steps = within(dialog).getByRole('list', { name: 'Jarayon' })
      expect(within(steps).getAllByRole('listitem')).toHaveLength(2)
      expect(within(steps).getByText(/1\/2 · № 1 · Qoralamani saqlash/)).toBeInTheDocument()
      await emit({ contractId: ready.contractId, invoiceIndex: 1, invoiceCount: 2, step: 'mark', status: 'done' })
      expect(within(steps).getAllByRole('listitem')).toHaveLength(2) // one line per invoice, newest step
      expect(within(steps).getByText(/1\/2 · № 1 · Ilovada belgilash/)).toBeInTheDocument()

      await userEvent.keyboard('{Escape}') // cannot be dismissed while Didox is being driven
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Yopish' })).not.toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Bekor qilish' }))
      expect(didox.cancel).toHaveBeenCalledOnce()
    })

    it('says when the run could not be started and lets the dialog be closed', async () => {
      const { didox, finish } = desktopWithDidox()
      renderWithProviders(<InvoicesPage />)
      const dialog = await confirmRun()
      await finish({ ok: false, code: 'RUN_IN_PROGRESS', message: 'Boshqa jarayon tugashini kuting' })
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Boshqa jarayon tugashini kuting')
      expect(didox.status).not.toHaveBeenCalled()
      await userEvent.click(within(dialog).getAllByRole('button', { name: 'Yopish' })[0]!)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('sums up a finished run and refreshes the invoices', async () => {
      const { api, setRun, finish } = desktopWithDidox()
      renderWithProviders(<InvoicesPage />)
      const dialog = await confirmRun()
      setRun(
        runOf({
          status: 'done',
          finishedAt: '2026-10-01T05:00:00.000Z',
          firms: [
            {
              tin: companyA.tin,
              name: companyA.name,
              status: 'done',
              invoices: [
                runInvoice({ state: 'marked', didoxId: 'A'.repeat(32) }),
                runInvoice({
                  contractId: other.contractId,
                  contractNumber: '7',
                  state: 'needs_check',
                  code: 'SAVED_ID_UNKNOWN',
                  didoxId: 'B'.repeat(32),
                  message: "Didox'da qoralama bo'lishi mumkin — uni tekshiring",
                }),
              ],
            },
          ],
        }),
      )
      const before = api.calls.length
      await finish({ ok: true, runId: 'r1' })

      const summary = await within(dialog).findByRole('status')
      expect(summary).toHaveTextContent('Yakunlandi: 1 ta yaratildi')
      expect(summary).toHaveTextContent("1 ta e'tibor kerak")
      expect(summary).toHaveTextContent("№ 7 — Didox'da qoralama bo'lishi mumkin — uni tekshiring")
      expect(summary).toHaveTextContent(`Didox ID ${'B'.repeat(32)}`)
      await waitFor(() => expect(api.calls.length).toBeGreaterThan(before)) // the rows pick up their new badge
      expect(within(dialog).getAllByRole('button', { name: 'Yopish' })[0]).toBeInTheDocument()
    })
  })

  describe('Didox row flags (M13: on the server) and run history (desktop)', () => {
    const THIS_PC = 'BUXGALTER-PC (3f9a1c2e)'
    const needsCheck = {
      runId: 'r1',
      code: 'SAVED_ID_UNKNOWN',
      message: "Didox'da qoralama bo'lishi mumkin — uni tekshiring",
      didoxId: 'B'.repeat(32),
      at: '2026-10-01T05:00:00.000Z',
      createdByInstall: THIS_PC,
    }
    const runSummary = (over: Partial<DidoxRunSummary> = {}): DidoxRunSummary => ({
      runId: 'r1',
      month: '2026-09',
      startedAt: '2026-10-01T04:00:00.000Z',
      finishedAt: '2026-10-01T05:00:00.000Z',
      status: 'done',
      counts: { marked: 3, skipped: 0, needsCheck: 1, error: 0, pending: 0 },
      ...over,
    })
    const flagsUrl = 'GET /api/didox-flags?month=2026-09'
    const skipUrl = `/api/didox-flags/2026-09/${ready.contractId}/skip`
    const resolveUrl = `POST /api/didox-flags/2026-09/${ready.contractId}/needs-check/resolve`

    /** The server's invoices and flags; the skip and resolve endpoints answer as the API does unless overridden. */
    const serverWithFlags = (flags: Record<string, DidoxInvoiceFlags> = {}, routes: Parameters<typeof mockApi>[0] = {}) =>
      mockApi({
        'GET /api/invoices': () => ({ status: 200, body: list([ready]) }),
        [flagsUrl]: () => ({ status: 200, body: flags }),
        [`PUT ${skipUrl}`]: () => ({ status: 200, body: { skipped: { at: '2026-10-15T10:00:00.000Z' } } }),
        [`DELETE ${skipUrl}`]: () => ({ status: 204 }),
        [resolveUrl]: () => ({ status: 204 }),
        ...routes,
      })

    /** The desktop half: this computer's install and run history, each spied on. Flags never go through it. */
    const desktopWithFlags = (
      flags: Record<string, DidoxInvoiceFlags> = {},
      over: Record<string, unknown> = {},
      routes: Parameters<typeof mockApi>[0] = {},
    ) => {
      const didox = {
        checkLogin: vi.fn(),
        createDrafts: vi.fn(),
        status: vi.fn(async () => null),
        cancel: vi.fn(),
        onProgress: vi.fn(() => () => undefined),
        listRuns: vi.fn(async () => [] as DidoxRunSummary[]),
        getRun: vi.fn(async () => null as DidoxRun | null),
        openDiagnostics: vi.fn(async () => undefined),
        ...over,
      }
      const install = vi.fn(async () => ({ id: '3f9a1c2e-0000', name: 'BUXGALTER-PC', label: THIS_PC }))
      vi.stubGlobal('desktop', { platform: 'darwin', install, eri: {}, didox })
      const api = serverWithFlags(flags, routes)
      return { api, didox }
    }

    it('shows why the run left an invoice for a person, with its Didox ID (spec §7)', async () => {
      const user = userEvent.setup()
      desktopWithFlags({ [ready.contractId]: { needsCheck } })
      renderWithProviders(<InvoicesPage />)

      const badge = await screen.findByText("E'tibor kerak (Didox)")
      const row = badge.closest('tr')!
      expect(row).toHaveTextContent("Didox'da qoralama bo'lishi mumkin — uni tekshiring")
      expect(within(row).getByText('B'.repeat(32))).toBeInTheDocument()
      // Recorded by this very computer: nobody else has to be named.
      expect(row).not.toHaveTextContent('dagi buxgalter tekshirishi kerak')
      await user.click(within(row).getByRole('button', { name: `Nusxalash: Didox hujjat ID ${'B'.repeat(32)}` }))
      expect(await navigator.clipboard.readText()).toBe('B'.repeat(32))
    })

    it("names the computer that has to look into another computer's flag", async () => {
      desktopWithFlags({ [ready.contractId]: { needsCheck: { ...needsCheck, createdByInstall: 'SIR-NOUTBUK (1a2b3c4d)' } } })
      renderWithProviders(<InvoicesPage />)

      expect(await screen.findByText('SIR-NOUTBUK (1a2b3c4d) dagi buxgalter tekshirishi kerak')).toBeInTheDocument()
    })

    it('shows the flags in a plain browser too — they come from the server', async () => {
      serverWithFlags({ [ready.contractId]: { needsCheck } })
      renderWithProviders(<InvoicesPage />)

      expect(await screen.findByText("E'tibor kerak (Didox)")).toBeInTheDocument()
      expect(screen.getByText(`${THIS_PC} dagi buxgalter tekshirishi kerak`)).toBeInTheDocument()
    })

    it('opens the mark dialog with the Didox ID the run found', async () => {
      desktopWithFlags({ [ready.contractId]: { needsCheck } })
      renderWithProviders(<InvoicesPage />)
      await screen.findByText("E'tibor kerak (Didox)")
      await userEvent.click(screen.getByRole('button', { name: 'Qoralama deb belgilash: № 1' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText(/Didox hujjat ID/)).toHaveValue('B'.repeat(32))
    })

    it('"Hal qilindi" resolves the flag on the server, leaves the invoice alone, and re-reads the flags', async () => {
      const { api } = desktopWithFlags({ [ready.contractId]: { needsCheck } })
      renderWithProviders(<InvoicesPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'Hal qilindi: № 1' }))

      await waitFor(() => expect(api.calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([resolveUrl.slice(5)]))
      expect(api.calls.some((c) => c.path.includes('/draft'))).toBe(false)
      await waitFor(() => expect(api.calls.filter((c) => `GET ${c.path}` === flagsUrl)).toHaveLength(2))
    })

    it('"O\'tkazib yuborish" puts the skip on the server, signed with this computer', async () => {
      const { api } = desktopWithFlags({ [ready.contractId]: { needsCheck } })
      renderWithProviders(<InvoicesPage />)
      await screen.findByText("E'tibor kerak (Didox)")
      await userEvent.click(screen.getByRole('button', { name: "O'tkazib yuborish: № 1" }))

      await waitFor(() => expect(api.calls.find((c) => c.method === 'PUT')).toEqual({ method: 'PUT', path: skipUrl, body: { createdByInstall: THIS_PC } }))
    })

    it('offers the skip on a plain ready row in a plain browser too, and says so when it fails', async () => {
      const error = vi.spyOn(toast, 'error')
      const api = serverWithFlags({}, { [`PUT ${skipUrl}`]: () => ({ status: 400, body: { message: "Belgini saqlab bo'lmadi" } }) })
      renderWithProviders(<InvoicesPage />)
      await userEvent.click(await screen.findByRole('button', { name: "O'tkazib yuborish: № 1" }))

      await waitFor(() => expect(error).toHaveBeenCalledWith("Belgini saqlab bo'lmadi"))
      expect(api.calls.find((c) => c.method === 'PUT')?.body).toEqual({ createdByInstall: 'Brauzer' })
    })

    it('shows a skipped invoice and takes the mark back on the server', async () => {
      const { api } = desktopWithFlags({ [ready.contractId]: { skipped: { at: '2026-10-01T05:00:00.000Z' } } })
      renderWithProviders(<InvoicesPage />)
      expect(await screen.findByText("O'tkazib yuboriladi (Didox)")).toBeInTheDocument()
      // Nothing of the month waits for a draft once its only invoice is skipped.
      expect(screen.getByRole('button', { name: "Didox'da qoralama yaratish" })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: "O'tkazib yuborishni bekor qilish: № 1" }))

      await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE' && c.path === skipUrl)).toBe(true))
    })

    it('lists the last runs of the month and opens one', async () => {
      const { didox } = desktopWithFlags(
        {},
        {
          listRuns: vi.fn(async () => [runSummary()]),
          getRun: vi.fn(
            async (): Promise<DidoxRun> => ({
              runId: 'r1',
              month: '2026-09',
              startedAt: '2026-10-01T04:00:00.000Z',
              finishedAt: '2026-10-01T05:00:00.000Z',
              status: 'done',
              firms: [
                {
                  tin: companyA.tin,
                  name: companyA.name,
                  status: 'done',
                  invoices: [
                    {
                      contractId: ready.contractId,
                      contractNumber: '1',
                      borrowerName: companyB.name,
                      amount: ready.amount,
                      state: 'needs_check',
                      code: 'SAVED_ID_UNKNOWN',
                      didoxId: 'B'.repeat(32),
                      message: "Didox'da qoralama bo'lishi mumkin — uni tekshiring",
                    },
                  ],
                },
              ],
            }),
          ),
        },
      )
      renderWithProviders(<InvoicesPage />)

      const runs = await screen.findByRole('list', { name: 'Didox jarayonlari' })
      expect(didox.listRuns).toHaveBeenCalledWith({ month: '2026-09', limit: 5 })
      const run = within(runs).getByRole('button', { name: 'Jarayon tafsiloti: 01.10.2026 09:00' })
      expect(run).toHaveTextContent('Yakunlandi')
      expect(run).toHaveTextContent("3 yaratildi · 1 e'tibor kerak")

      await userEvent.click(run)
      const dialog = await screen.findByRole('dialog')
      expect(didox.getRun).toHaveBeenCalledWith('r1')
      expect(await within(dialog).findByText(/A MCHJ/)).toBeInTheDocument()
      expect(dialog).toHaveTextContent("e'tibor kerak")
      expect(dialog).toHaveTextContent("Didox'da qoralama bo'lishi mumkin — uni tekshiring")
      expect(dialog).toHaveTextContent(`Didox ID ${'B'.repeat(32)}`)
    })

    it('opens the diagnostics folder', async () => {
      const { didox } = desktopWithFlags({}, { listRuns: vi.fn(async () => [runSummary()]) })
      renderWithProviders(<InvoicesPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'Diagnostika papkasi' }))
      expect(didox.openDiagnostics).toHaveBeenCalledOnce()
    })

    it('has no run history card in a plain browser', async () => {
      mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([ready]) }) })
      renderWithProviders(<InvoicesPage />)
      await screen.findByText('№ 1')
      expect(screen.queryByText('Didox jarayonlari')).not.toBeInTheDocument()
    })
  })

  it('explains an empty list before any contract exists', async () => {
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: { month: null, months: [], lenders: [], rows: [] } }) })
    renderWithProviders(<InvoicesPage />)
    expect(await screen.findByText("Hali tugagan oy yo'q")).toBeInTheDocument()
  })
})
