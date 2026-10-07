import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { companyA, companyB } from '@/features/contracts/fixtures'
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
    expect(api.calls.at(-1)?.path).toBe('/api/invoices?month=2026-08')
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

  it('marks an invoice as drafted with an optional Didox ID (FR-7.4)', async () => {
    const drafted = { ...ready, draft: { amount: ready.amount, didoxDocumentId: 'D-1', draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: false } }
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
    const stale = { ...ready, draft: { amount: '500000.00', didoxDocumentId: null, draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: true } }
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
    const drafted = { ...ready, draft: { amount: ready.amount, didoxDocumentId: 'D-1', draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: false } }
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([drafted]) }) })
    renderWithProviders(<InvoicesPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Qayta belgilash: № 1' }))
    expect(screen.getByLabelText(/Didox hujjat ID/)).toHaveValue('D-1')
  })

  it('only lets a draft be removed once the month has no interest left', async () => {
    const zero = { ...ready, amount: '0.00', draft: { amount: '100.00', didoxDocumentId: null, draftedAt: '2026-10-01T04:00:00.000Z', amountChanged: true } }
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: list([zero]) }) })
    renderWithProviders(<InvoicesPage />)
    expect(await screen.findByRole('button', { name: 'Belgini olib tashlash: № 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Qayta belgilash: № 1' })).not.toBeInTheDocument()
  })

  it('explains an empty list before any contract exists', async () => {
    mockApi({ 'GET /api/invoices': () => ({ status: 200, body: { month: null, months: [], lenders: [], rows: [] } }) })
    renderWithProviders(<InvoicesPage />)
    expect(await screen.findByText("Hali tugagan oy yo'q")).toBeInTheDocument()
  })
})
