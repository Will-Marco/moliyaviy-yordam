import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import type { Contract } from './api'
import { ContractsPage } from './ContractsPage'
import { companyA, companyB, etalon } from './fixtures'
import type { PeriodReport } from './period-api'

const { rates: _omit, ...listItem } = etalon
/** E → C, signed later, smaller debt. */
const other: Contract = {
  ...listItem,
  id: '0192f000-0000-7000-8000-0000000000c2',
  number: '7',
  signedOn: '2026-03-01',
  lender: { id: 'e', name: 'E MCHJ', tin: '300000005' },
  borrower: { id: 'c', name: 'C MCHJ', tin: '300000003' },
  totals: { ...listItem.totals, interestDebt: '1000.00' },
}
const contractsApi = (body: Contract[] = [listItem, other]) => ({
  'GET /api/contracts': () => ({ status: 200, body }),
  'GET /api/companies': () => ({ status: 200, body: [companyA, companyB] }),
})
const numbers = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).queryByRole('link')?.textContent)
    .filter(Boolean)

describe('ContractsPage', () => {
  it('lists contracts with lender and borrower in their own columns, STIR under each name (FR-2.3, FR-11.4)', async () => {
    mockApi(contractsApi([listItem]))
    renderWithProviders(<ContractsPage />)
    const row = (await screen.findByRole('link', { name: '№ 1' })).closest('tr')!
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(expect.arrayContaining(['Beruvchi', 'Oluvchi']))
    const [, lender, borrower] = within(row).getAllByRole('cell')
    expect(lender).toHaveTextContent('A MCHJ300000001')
    expect(borrower).toHaveTextContent('B MCHJ300000002')
    expect(row).not.toHaveTextContent('STIR')
    expect(within(row).getByText('10 000 000 000,00')).toBeInTheDocument()
    expect(within(row).getByText('01.01.2026 – 31.07.2027')).toBeInTheDocument()
    expect(within(row).getByText('14 %')).toBeInTheDocument()
    expect(within(row).getByText('45 000 000,00')).toBeInTheDocument()
    expect(within(row).getByText('1 035 616,44')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '№ 1' })).toHaveAttribute('href', `/contracts/${etalon.id}`)
  })

  it('searches by number, name or STIR (FR-11.1)', async () => {
    mockApi(contractsApi())
    renderWithProviders(<ContractsPage />)
    await screen.findByRole('link', { name: '№ 7' })
    await userEvent.type(screen.getByRole('searchbox', { name: /Qidirish/ }), 'e mchj')
    expect(numbers()).toEqual(['№ 7'])
    await userEvent.clear(screen.getByRole('searchbox', { name: /Qidirish/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: /Qidirish/ }), '300000002')
    expect(numbers()).toEqual(['№ 1'])
    await userEvent.type(screen.getByRole('searchbox', { name: /Qidirish/ }), 'x')
    expect(screen.getByText("Filtr bo'yicha shartnoma topilmadi")).toBeInTheDocument()
  })

  it('filters by lender, borrower and signing date and clears the filters (FR-11.2)', async () => {
    mockApi(contractsApi())
    renderWithProviders(<ContractsPage />)
    await screen.findByRole('link', { name: '№ 7' })
    await userEvent.selectOptions(screen.getByLabelText('Beruvchi'), 'E MCHJ')
    expect(numbers()).toEqual(['№ 7'])
    await userEvent.selectOptions(screen.getByLabelText('Beruvchi'), 'Barchasi')
    await userEvent.selectOptions(screen.getByLabelText('Oluvchi'), 'B MCHJ')
    expect(numbers()).toEqual(['№ 1'])
    await userEvent.click(screen.getByRole('button', { name: 'Filtrlarni tozalash' }))
    fireEvent.change(screen.getByLabelText('Imzolangan: dan'), { target: { value: '2026-02-01' } })
    expect(numbers()).toEqual(['№ 7'])
    expect(screen.getByText('1 / 2 ta shartnoma')).toBeInTheDocument()
  })

  it('sorts by a column header, both ways (FR-11.3)', async () => {
    mockApi(contractsApi())
    renderWithProviders(<ContractsPage />)
    await screen.findByRole('link', { name: '№ 7' })
    expect(numbers()).toEqual(['№ 1', '№ 7']) // the API's order until a column is chosen
    await userEvent.click(screen.getByRole('button', { name: /Foiz qarzi/ }))
    expect(numbers()).toEqual(['№ 7', '№ 1'])
    expect(screen.getByRole('columnheader', { name: /Foiz qarzi/ })).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(screen.getByRole('button', { name: /Foiz qarzi/ }))
    expect(numbers()).toEqual(['№ 1', '№ 7'])
    await userEvent.click(screen.getByRole('button', { name: /Beruvchi/ }))
    expect(numbers()).toEqual(['№ 1', '№ 7'])
  })

  it('shows the chosen period, a total row and exports exactly the rows on screen (FR-12.1–12.3)', async () => {
    const period: PeriodReport = {
      from: '2026-01',
      to: '2026-02',
      asOf: '2026-10-11',
      rows: [
        {
          contractId: etalon.id,
          disbursed: '60000000.00',
          repaid: '15000000.00',
          interest: '1035616.44',
          interestPaid: '0.00',
          closingBalance: '45000000.00',
          interestDebt: '1035616.44',
        },
        {
          contractId: other.id,
          disbursed: '1000000.00',
          repaid: '0.00',
          interest: '0.01',
          interestPaid: '0.00',
          closingBalance: '1000000.00',
          interestDebt: '0.01',
        },
      ],
    }
    const api = mockApi({
      ...contractsApi(),
      'GET /api/reports/period?from=2026-01&to=2026-02': () => ({ status: 200, body: period }),
      'POST /api/reports/period.xlsx': () => ({ status: 200, body: {} }),
    })
    URL.createObjectURL = vi.fn(() => 'blob:period')
    URL.revokeObjectURL = vi.fn()
    renderWithProviders(<ContractsPage />)
    await screen.findByRole('link', { name: '№ 7' })
    fireEvent.change(screen.getByLabelText('Davr: dan'), { target: { value: '2026-01' } })
    fireEvent.change(screen.getByLabelText('Davr: gacha'), { target: { value: '2026-02' } })

    expect(await screen.findByRole('columnheader', { name: /Hisoblangan foiz/ })).toBeInTheDocument()
    const etalonRow = screen.getByRole('link', { name: '№ 1' }).closest('tr')!
    expect(etalonRow).toHaveTextContent('60 000 000,00')
    expect(etalonRow).toHaveTextContent('1 035 616,44')
    const total = screen.getByText('Jami').closest('tr')!
    expect(total).toHaveTextContent('61 000 000,00')
    expect(total).toHaveTextContent('1 035 616,45')

    await userEvent.type(screen.getByRole('searchbox', { name: /Qidirish/ }), 'e mchj')
    await userEvent.click(screen.getByRole('button', { name: /Excel/ }))
    await vi.waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true))
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ from: '2026-01', to: '2026-02', contractIds: [other.id] })
  })

  it('refuses a period whose start is after its end', async () => {
    mockApi(contractsApi())
    renderWithProviders(<ContractsPage />)
    await screen.findByRole('link', { name: '№ 7' })
    fireEvent.change(screen.getByLabelText('Davr: dan'), { target: { value: '2026-03' } })
    fireEvent.change(screen.getByLabelText('Davr: gacha'), { target: { value: '2026-02' } })
    expect(screen.getByText("Davr boshi oxiridan keyin bo'lishi mumkin emas")).toBeInTheDocument()
  })

  it('asks for companies first when fewer than two exist', async () => {
    mockApi({
      'GET /api/contracts': () => ({ status: 200, body: [] }),
      'GET /api/companies': () => ({ status: 200, body: [companyA] }),
    })
    renderWithProviders(<ContractsPage />)
    expect(await screen.findByText('Shartnoma ochish uchun kamida ikkita firma kerak')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Firmalarga o'tish" })).toHaveAttribute('href', '/companies')
    expect(screen.getByRole('button', { name: 'Shartnoma ochish' })).toBeDisabled()
  })

  it('opens the form from the empty state', async () => {
    mockApi({
      'GET /api/contracts': () => ({ status: 200, body: [] }),
      'GET /api/companies': () => ({ status: 200, body: [companyA, companyB] }),
    })
    renderWithProviders(<ContractsPage />)
    expect(await screen.findByText("Hali shartnoma yo'q")).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /Shartnoma ochish/ })[0])
    expect(await screen.findByRole('heading', { name: 'Yangi shartnoma' })).toBeInTheDocument()
  })
})
