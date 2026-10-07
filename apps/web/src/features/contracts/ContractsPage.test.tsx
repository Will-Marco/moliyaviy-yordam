import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ContractsPage } from './ContractsPage'
import { companyA, companyB, etalon } from './fixtures'

describe('ContractsPage', () => {
  it('lists contracts with formatted terms (FR-2.3)', async () => {
    const { rates: _omit, ...listItem } = etalon
    mockApi({
      'GET /api/contracts': () => ({ status: 200, body: [listItem] }),
      'GET /api/companies': () => ({ status: 200, body: [companyA, companyB] }),
    })
    renderWithProviders(<ContractsPage />)
    const row = (await screen.findByRole('link', { name: '№ 1' })).closest('tr')!
    expect(row).toHaveTextContent('A MCHJ')
    expect(row).toHaveTextContent('B MCHJ')
    expect(within(row).getByText('10 000 000 000,00')).toBeInTheDocument()
    expect(within(row).getByText('01.01.2026 – 31.07.2027')).toBeInTheDocument()
    expect(within(row).getByText('14 %')).toBeInTheDocument()
    expect(within(row).getByText('60 000 000,00')).toBeInTheDocument()
    expect(within(row).getByText('45 000 000,00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '№ 1' })).toHaveAttribute('href', `/contracts/${etalon.id}`)
  })

  it('asks for companies first when fewer than two exist', async () => {
    mockApi({
      'GET /api/contracts': () => ({ status: 200, body: [] }),
      'GET /api/companies': () => ({ status: 200, body: [companyA] }),
    })
    renderWithProviders(<ContractsPage />)
    expect(await screen.findByText("Shartnoma ochish uchun kamida ikkita firma kerak")).toBeInTheDocument()
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
