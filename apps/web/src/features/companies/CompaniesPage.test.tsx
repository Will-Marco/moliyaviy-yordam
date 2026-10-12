import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { CompaniesPage } from './CompaniesPage'

const alfa = {
  id: '0192f000-0000-7000-8000-000000000001',
  name: '"ALFA SAVDO" MCHJ',
  address: 'Toshkent sh.',
  tin: '300000001',
  vatRegCode: null,
  bankAccount: '20208000100000000001',
  mfo: '01071',
}

describe('CompaniesPage', () => {
  it('lists companies with their codes', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
    renderWithProviders(<CompaniesPage />)
    const row = (await screen.findByText('"ALFA SAVDO" MCHJ')).closest('tr')!
    expect(within(row).getByText('300000001')).toBeInTheDocument()
    expect(within(row).getByText('20208000100000000001')).toBeInTheDocument()
    expect(within(row).getByText('01071')).toBeInTheDocument()
  })

  it('marks a company whose requisites are not filled in yet', async () => {
    const partial = { ...alfa, id: '0192f000-0000-7000-8000-000000000002', name: 'BEST FOR GOOD FUTURE', address: null, bankAccount: null, mfo: null }
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa, partial] }) })
    renderWithProviders(<CompaniesPage />)
    const row = (await screen.findByText('BEST FOR GOOD FUTURE')).closest('tr')!
    expect(within(row).getByText("Rekvizitlar to'liq emas")).toBeInTheDocument()
    expect(within(row).getAllByText('—')).toHaveLength(3)
    const full = screen.getByText('"ALFA SAVDO" MCHJ').closest('tr')!
    expect(within(full).queryByText("Rekvizitlar to'liq emas")).not.toBeInTheDocument()
  })

  it('has no ERI column in a plain browser', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
    renderWithProviders(<CompaniesPage />)
    await screen.findByText('"ALFA SAVDO" MCHJ')
    expect(screen.queryByRole('columnheader', { name: 'ERI kalit' })).not.toBeInTheDocument()
  })

  it("shows each firm's ERI key status in the desktop app", async () => {
    const beta = { ...alfa, id: '0192f000-0000-7000-8000-000000000002', name: 'BETA', tin: '300000002' }
    const gamma = { ...alfa, id: '0192f000-0000-7000-8000-000000000003', name: 'GAMMA', tin: '300000003' }
    const listKeys = vi.fn(async () => ({
      eimzo: 'ok',
      keys: {
        '300000001': { status: 'ok', org: 'alfa savdo mchj', title: 'direktor', validTo: '2028-01-21T12:04:52' },
        '300000002': { status: 'expired', org: 'beta', title: 'direktor', validTo: '2026-01-01T00:00:00' },
        '300000003': { status: 'missing' },
      },
    }))
    vi.stubGlobal('desktop', { platform: 'darwin', eri: { listKeys } })
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa, beta, gamma] }) })
    renderWithProviders(<CompaniesPage />)

    const row = async (name: string) => (await screen.findByText(name)).closest('tr')!
    expect(await within(await row('"ALFA SAVDO" MCHJ')).findByText('21.01.2028 gacha')).toBeInTheDocument()
    expect(within(await row('BETA')).getByText("Muddati o'tgan")).toBeInTheDocument()
    expect(within(await row('GAMMA')).getByText("Kalit yo'q")).toBeInTheDocument()
    expect(listKeys).toHaveBeenCalledWith(['300000001', '300000002', '300000003'])
  })

  it('says when E-IMZO is not running', async () => {
    vi.stubGlobal('desktop', {
      platform: 'darwin',
      eri: { listKeys: async () => ({ eimzo: 'not_running', message: 'E-IMZO ishga tushirilmagan' }) },
    })
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
    renderWithProviders(<CompaniesPage />)
    expect(await screen.findByText(/E-IMZO ishga tushirilmagan/)).toBeInTheDocument()
  })

  it('shows an empty state with a call to action', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [] }) })
    renderWithProviders(<CompaniesPage />)
    expect(await screen.findByText("Hali firma qo'shilmagan")).toBeInTheDocument()
  })

  it('shows a load error with retry', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 500 }) })
    renderWithProviders(<CompaniesPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Server bilan bog'lanishda xato")
    expect(screen.getByRole('button', { name: 'Qayta urinish' })).toBeInTheDocument()
  })

  it('redirects to login when the session has expired', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 401, body: { message: 'Unauthorized' } }) })
    renderWithProviders(<CompaniesPage />)
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
  })

  it('adds a company through the dialog and refreshes the list', async () => {
    let list = [alfa]
    const created = { ...alfa, id: '0192f000-0000-7000-8000-000000000002', name: 'BETA', tin: '300000002' }
    mockApi({
      'GET /api/companies': () => ({ status: 200, body: list }),
      'POST /api/companies': () => {
        list = [alfa, created]
        return { status: 201, body: created }
      },
    })
    renderWithProviders(<CompaniesPage />)
    await screen.findByText('"ALFA SAVDO" MCHJ')
    await userEvent.click(screen.getByRole('button', { name: "Firma qo'shish" }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/Nomi/), 'BETA')
    await userEvent.type(within(dialog).getByLabelText(/Manzil/), 'Toshkent')
    await userEvent.type(within(dialog).getByLabelText(/STIR/), '300000002')
    await userEvent.type(within(dialog).getByLabelText(/Hisob raqami/), '20208000100000000001')
    await userEvent.type(within(dialog).getByLabelText(/MFO/), '01071')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    expect(await screen.findByText('BETA')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the dialog prefilled for editing', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
    renderWithProviders(<CompaniesPage />)
    await userEvent.click(await screen.findByRole('button', { name: `Tahrirlash: ${alfa.name}` }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/STIR/)).toHaveValue('300000001')
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Firmani tahrirlash')
  })

  it('opens the Didox import dialog', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
    renderWithProviders(<CompaniesPage />)
    await userEvent.click(await screen.findByRole('button', { name: "Didox'dan import" }))
    expect(await screen.findByRole('heading', { name: "Didox fakturalaridan import" })).toBeInTheDocument()
  })
})
