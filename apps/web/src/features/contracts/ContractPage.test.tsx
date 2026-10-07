import { screen } from '@testing-library/react'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ContractPage } from './ContractPage'
import { etalon } from './fixtures'

describe('ContractPage (FR-2.6)', () => {
  it('shows the contract terms, parties and rate history', async () => {
    mockApi({ [`GET /api/contracts/${etalon.id}`]: () => ({ status: 200, body: etalon }) })
    renderWithProviders(<ContractPage />, { route: `/contracts/${etalon.id}`, path: '/contracts/:id' })
    expect(await screen.findByRole('heading', { name: 'Shartnoma № 1' })).toBeInTheDocument()
    expect(screen.getByText('01.01.2026 dagi')).toBeInTheDocument()
    expect(screen.getByText('A MCHJ')).toBeInTheDocument()
    expect(screen.getByText('B MCHJ')).toBeInTheDocument()
    expect(screen.getByText('01.01.2026 – 31.07.2027')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tahrirlash' })).toBeInTheDocument()
  })

  it('reports a missing contract', async () => {
    mockApi({ [`GET /api/contracts/${etalon.id}`]: () => ({ status: 404, body: { message: 'Shartnoma topilmadi' } }) })
    renderWithProviders(<ContractPage />, { route: `/contracts/${etalon.id}`, path: '/contracts/:id' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Shartnoma topilmadi')
  })
})
