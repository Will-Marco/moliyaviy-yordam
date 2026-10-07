import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { etalon, etalonReport } from './fixtures'
import { ReportCard } from './ReportCard'

const reportPath = `/api/contracts/${etalon.id}/report`

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

  it('offers the report as an Excel download (FR-6.1)', async () => {
    mockApi({ [`GET ${reportPath}`]: () => ({ status: 200, body: etalonReport }) })
    renderWithProviders(<ReportCard contractId={etalon.id} />)
    const link = await screen.findByRole('link', { name: 'Excel yuklab olish' })
    expect(link).toHaveAttribute('href', `/api/contracts/${etalon.id}/report.xlsx`)
    expect(link).toHaveAttribute('download')
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
