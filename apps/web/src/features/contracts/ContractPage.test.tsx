import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ContractPage } from './ContractPage'
import { etalon, etalonOperations, etalonReport } from './fixtures'

describe('ContractPage (FR-2.6)', () => {
  const opsPath = `/api/contracts/${etalon.id}/operations`
  const reportPath = `/api/contracts/${etalon.id}/report`
  const report = () => ({ status: 200, body: etalonReport })

  it('shows the contract terms, parties and rate history', async () => {
    mockApi({
      [`GET /api/contracts/${etalon.id}`]: () => ({ status: 200, body: etalon }),
      [`GET ${opsPath}`]: () => ({ status: 200, body: [] }),
      [`GET ${reportPath}`]: report,
    })
    renderWithProviders(<ContractPage />, { route: `/contracts/${etalon.id}`, path: '/contracts/:id' })
    expect(await screen.findByRole('heading', { name: 'Shartnoma № 1' })).toBeInTheDocument()
    expect(screen.getByText('01.01.2026 dagi')).toBeInTheDocument()
    expect(screen.getByText('A MCHJ')).toBeInTheDocument()
    expect(screen.getByText('B MCHJ')).toBeInTheDocument()
    expect(screen.getByText('01.01.2026 – 31.07.2027')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tahrirlash' })).toBeInTheDocument()
  })

  it('shows operations with running balance and totals (FR-3.4, FR-3.5)', async () => {
    mockApi({
      [`GET /api/contracts/${etalon.id}`]: () => ({ status: 200, body: etalon }),
      [`GET ${opsPath}`]: () => ({ status: 200, body: [...etalonOperations, { ...etalonOperations[0], id: 'future', date: '2026-04-01', scheduled: true }] }),
      [`GET ${reportPath}`]: report,
    })
    renderWithProviders(<ContractPage />, { route: `/contracts/${etalon.id}`, path: '/contracts/:id' })
    const table = await screen.findByRole('table', { name: 'Operatsiyalar' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('05.01.2026')
    expect(rows[0]).toHaveTextContent('60 000 000,00')
    expect(rows[1]).toHaveTextContent('15 000 000,00')
    expect(rows[1]).toHaveTextContent('45 000 000,00')
    expect(rows[1]).toHaveTextContent('Asosiy qarzdan')
    expect(screen.getByText('Jami berilgan').nextSibling).toHaveTextContent('60 000 000,00')
    expect(screen.getByText("Asosiy qarz qoldig'i").nextSibling).toHaveTextContent('45 000 000,00')
    const debtTerm = screen.getAllByText('Foiz qarzi').find((el) => el.tagName === 'DT')!
    expect(debtTerm.nextSibling).toHaveTextContent('1 035 616,44')
    expect(rows[2]).toHaveTextContent('Rejalashtirilgan')
  })

  it('deletes an operation after confirmation (FR-3.2)', async () => {
    const op = etalonOperations[1]
    const { calls } = mockApi({
      [`GET /api/contracts/${etalon.id}`]: () => ({ status: 200, body: etalon }),
      [`GET ${opsPath}`]: () => ({ status: 200, body: etalonOperations }),
      [`DELETE ${opsPath}/${op.id}`]: () => ({ status: 204 }),
      [`GET ${reportPath}`]: report,
    })
    renderWithProviders(<ContractPage />, { route: `/contracts/${etalon.id}`, path: '/contracts/:id' })
    await userEvent.click(await screen.findByRole('button', { name: /^O'chirish: 20\.01\.2026, 15\s000\s000,00$/ }))
    const confirm = await screen.findByRole('alertdialog')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await userEvent.click(within(confirm).getByRole('button', { name: "O'chirish" }))
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
  })

  it('reports a missing contract', async () => {
    mockApi({
      [`GET /api/contracts/${etalon.id}`]: () => ({ status: 404, body: { message: 'Shartnoma topilmadi' } }),
      [`GET ${opsPath}`]: () => ({ status: 404, body: { message: 'Shartnoma topilmadi' } }),
      [`GET ${reportPath}`]: () => ({ status: 404, body: { message: 'Shartnoma topilmadi' } }),
    })
    renderWithProviders(<ContractPage />, { route: `/contracts/${etalon.id}`, path: '/contracts/:id' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Shartnoma topilmadi')
  })
})
