import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { etalon, etalonReport } from './fixtures'
import { ReportCard } from './ReportCard'

const reportPath = `/api/contracts/${etalon.id}/report`

afterEach(() => vi.restoreAllMocks())

describe('ReportCard (FR-4.1, FR-4.2)', () => {
  it('shows one row per month with balances, interest and debt', async () => {
    mockApi({ [`GET ${reportPath}`]: () => ({ status: 200, body: etalonReport }) })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    const table = await screen.findByRole('table', { name: 'Oylik hisobot' })
    const [jan, feb, mar] = within(table).getAllByRole('row').filter((r) => r.getAttribute('data-month'))
    expect(jan).toHaveTextContent('Yanvar 2026')
    expect(jan).toHaveTextContent('14 %')
    expect(jan).toHaveTextContent('60 000 000,00')
    expect(jan).toHaveTextContent('552 328,77')
    expect(feb).toHaveTextContent('483 287,67')
    expect(feb).toHaveTextContent('1 035 616,44')
    expect(mar).toHaveTextContent('Mart 2026')
    expect(mar).toHaveTextContent('15.03 gacha')
  })

  it('filters the months by year, current year first (FR-10.3)', async () => {
    const december = { ...etalonReport.months[0], month: '2025-12', from: '2025-12-01', to: '2025-12-31' }
    const report = { ...etalonReport, months: [december, ...etalonReport.months] }
    mockApi({ [`GET ${reportPath}`]: () => ({ status: 200, body: report }) })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    const table = await screen.findByRole('table', { name: 'Oylik hisobot' })
    const months = () => within(table).getAllByRole('row').flatMap((r) => r.getAttribute('data-month') ?? [])
    expect(screen.getByLabelText('Yil')).toHaveValue('2026')
    expect(months()).toEqual(['2026-01', '2026-02', '2026-03'])
    await userEvent.selectOptions(screen.getByLabelText('Yil'), '2025')
    expect(months()).toEqual(['2025-12'])
    await userEvent.selectOptions(screen.getByLabelText('Yil'), 'Barcha yillar')
    expect(months()).toEqual(['2025-12', '2026-01', '2026-02', '2026-03'])
    expect(screen.queryByText(/butun shartnoma bo'yicha/)).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Yil'), '2025')
    expect(screen.getByText(/butun shartnoma bo'yicha/)).toBeInTheDocument()
  })

  it('has no year filter while the report covers a single year', async () => {
    mockApi({ [`GET ${reportPath}`]: () => ({ status: 200, body: etalonReport }) })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    await screen.findByRole('table', { name: 'Oylik hisobot' })
    expect(screen.queryByLabelText('Yil')).not.toBeInTheDocument()
  })

  const xlsxPath = `/api/contracts/${etalon.id}/report.xlsx`
  /** Records what the page hands to the browser as a file download. */
  function captureDownloads() {
    const saved: string[] = []
    URL.createObjectURL = vi.fn(() => 'blob:report')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    return saved
  }

  it('downloads the report as an Excel file named by the server (FR-6.1)', async () => {
    const saved = captureDownloads()
    mockApi({
      [`GET ${reportPath}`]: () => ({ status: 200, body: etalonReport }),
      [`GET ${xlsxPath}`]: () => ({
        status: 200,
        body: {},
        headers: { 'Content-Disposition': `attachment; filename="x.xlsx"; filename*=UTF-8''Shartnoma_1_ALFA_2026-10-07.xlsx` },
      }),
    })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Excel yuklab olish' }))
    await vi.waitFor(() => expect(saved).toEqual(['Shartnoma_1_ALFA_2026-10-07.xlsx']))
  })

  it('saves no file when the download fails, e.g. after the session expired (FR-6.1)', async () => {
    const saved = captureDownloads()
    const api = mockApi({
      [`GET ${reportPath}`]: () => ({ status: 200, body: etalonReport }),
      [`GET ${xlsxPath}`]: () => ({ status: 401, body: { message: 'Sessiya tugagan. Qaytadan kiring.' } }),
    })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Excel yuklab olish' }))
    await vi.waitFor(() => expect(api.calls.some((c) => c.path === xlsxPath)).toBe(true))
    expect(saved).toEqual([])
  })

  it('opens the segments behind a month', async () => {
    mockApi({ [`GET ${reportPath}`]: () => ({ status: 200, body: etalonReport }) })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    const toggle = await screen.findByRole('button', { name: "Yanvar 2026: bo'laklarni ko'rsatish" })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const segments = screen.getByRole('table', { name: "Yanvar 2026 bo'laklari" })
    const rows = within(segments).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4) // 3 segments + the month total
    expect(rows[1]).toHaveTextContent('05.01 – 19.01')
    expect(rows[1]).toHaveTextContent('15')
    expect(rows[1]).toHaveTextContent('345 205,479452')
    expect(within(segments).getByText(/552 328,767123/)).toBeInTheDocument()
  })

  it('sums up accrued interest, payments and both debts', async () => {
    mockApi({ [`GET ${reportPath}`]: () => ({ status: 200, body: etalonReport }) })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    expect((await screen.findByText('Bugungacha hisoblangan')).nextSibling).toHaveTextContent('1 294 520,55')
    expect(screen.getByText("Foiz qarzi (tugagan oylar)").nextSibling).toHaveTextContent('1 035 616,44')
  })

  it('explains an empty report before the start date', async () => {
    mockApi({
      [`GET ${reportPath}`]: () => ({
        status: 200,
        body: { asOf: '2025-12-01', months: [], totals: { interestAccrued: '0.00', interestPaid: '0.00', interestDebt: '0.00', interestDebtCompleted: '0.00' } },
      }),
    })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    expect(await screen.findByText("Shartnoma hali boshlanmagan — foiz hisoblanmagan.")).toBeInTheDocument()
  })
})
