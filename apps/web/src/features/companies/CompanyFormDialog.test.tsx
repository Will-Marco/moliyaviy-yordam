import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { CompanyFormDialog } from './CompanyFormDialog'

async function fillValid(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText(/Nomi/), 'ALFA')
  await userEvent.type(within(dialog).getByLabelText(/Manzil/), 'Toshkent')
  await userEvent.type(within(dialog).getByLabelText(/STIR/), '300000001')
  await userEvent.type(within(dialog).getByLabelText(/Hisob raqami/), '20208000100000000001')
  await userEvent.type(within(dialog).getByLabelText(/MFO/), '01071')
}

describe('CompanyFormDialog', () => {
  it('validates digit-only codes on the client', async () => {
    const { calls } = mockApi({})
    renderWithProviders(<CompanyFormDialog open onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/STIR/), '1234')
    await userEvent.type(within(dialog).getByLabelText(/QQS/), '12')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    expect(await within(dialog).findByText("STIR 9 ta raqamdan iborat bo'lishi kerak")).toBeInTheDocument()
    expect(within(dialog).getByText("QQS registratsiya kodi 12 ta raqamdan iborat bo'lishi kerak")).toBeInTheDocument()
    expect(within(dialog).getByText('Nomi kiritilmagan')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Nomi/)).toHaveFocus()
    expect(calls).toHaveLength(0)
  })

  it('sends an empty VAT code as null', async () => {
    const { calls } = mockApi({ 'POST /api/companies': () => ({ status: 201, body: {} }) })
    renderWithProviders(<CompanyFormDialog open onOpenChange={() => {}} />)
    await fillValid(screen.getByRole('dialog'))
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toMatchObject({ tin: '300000001', vatRegCode: null })
  })

  it('saves a company with only a name and STIR; empty requisites go as null (FR-1.2)', async () => {
    const { calls } = mockApi({ 'POST /api/companies': () => ({ status: 201, body: {} }) })
    renderWithProviders(<CompanyFormDialog open onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/Nomi/), 'BEST FOR GOOD FUTURE')
    await userEvent.type(within(dialog).getByLabelText(/STIR/), '307830275')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({
      name: 'BEST FOR GOOD FUTURE',
      address: null,
      tin: '307830275',
      vatRegCode: null,
      bankAccount: null,
      mfo: null,
    })
  })

  it('shows a duplicate STIR conflict next to the STIR field', async () => {
    mockApi({
      'POST /api/companies': () => ({ status: 409, body: { message: 'Bu STIR bilan firma allaqachon mavjud' } }),
    })
    renderWithProviders(<CompanyFormDialog open onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await fillValid(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    expect(await within(dialog).findByText('Bu STIR bilan firma allaqachon mavjud')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/STIR/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('leaves an expired session to the global handler instead of showing it in the form', async () => {
    mockApi({
      'POST /api/companies': () => ({ status: 401, body: { message: 'Sessiya tugagan. Qaytadan kiring.' } }),
    })
    renderWithProviders(<CompanyFormDialog open onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await fillValid(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: 'Saqlash' })).toBeEnabled())
    expect(within(dialog).queryByText('Sessiya tugagan. Qaytadan kiring.')).not.toBeInTheDocument()
  })

  it('maps server field errors onto the form', async () => {
    mockApi({
      'POST /api/companies': () => ({
        status: 400,
        body: { message: "Ma'lumotlar noto'g'ri", errors: { mfo: ["MFO 5 ta raqamdan iborat bo'lishi kerak"] } },
      }),
    })
    renderWithProviders(<CompanyFormDialog open onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await fillValid(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    expect(await within(dialog).findByText("MFO 5 ta raqamdan iborat bo'lishi kerak")).toBeInTheDocument()
  })

  it('updates only through PATCH when editing', async () => {
    const company = {
      id: '0192f000-0000-7000-8000-000000000001',
      name: 'ALFA',
      address: 'Toshkent',
      tin: '300000001',
      vatRegCode: '326020000001',
      bankAccount: '20208000100000000001',
      mfo: '01071',
    }
    const { calls } = mockApi({ [`PATCH /api/companies/${company.id}`]: () => ({ status: 200, body: company }) })
    const onOpenChange = vi.fn()
    renderWithProviders(<CompanyFormDialog open onOpenChange={onOpenChange} company={company} />)
    const name = within(screen.getByRole('dialog')).getByLabelText(/Nomi/)
    await userEvent.clear(name)
    await userEvent.type(name, 'ALFA PLUS')
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { name: 'ALFA PLUS', vatRegCode: '326020000001' } })
  })
})
