import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ContractFormDialog } from './ContractFormDialog'
import { companyA, companyB, etalon } from './fixtures'

const companies = () => ({ status: 200, body: [companyA, companyB] })

async function pick(label: RegExp, search: string, option: RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.type(await screen.findByPlaceholderText('Nomi yoki STIR'), search)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function fillEtalon() {
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText(/Shartnoma raqami/), '1')
  await userEvent.type(within(dialog).getByLabelText(/Shartnoma sanasi/), '2026-01-01')
  await pick(/Beruvchi/, '300000001', /A MCHJ/)
  await pick(/Oluvchi/, 'B MCHJ', /B MCHJ/)
  await userEvent.type(within(dialog).getByLabelText(/Summa \(limit\)/), '10 000 000 000')
  await userEvent.type(within(dialog).getByLabelText(/Boshlanish/), '2026-01-01')
  await userEvent.type(within(dialog).getByLabelText(/Tugash/), '2027-07-31')
  await userEvent.type(within(dialog).getByLabelText(/Yillik stavka/), '14')
}

describe('ContractFormDialog', () => {
  it('creates the etalon contract with exact string amounts', async () => {
    const { calls } = mockApi({
      'GET /api/companies': companies,
      'POST /api/contracts': () => ({ status: 201, body: etalon }),
    })
    const onOpenChange = vi.fn()
    renderWithProviders(<ContractFormDialog open onOpenChange={onOpenChange} />)
    await fillEtalon()
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      number: '1',
      signedOn: '2026-01-01',
      lenderId: companyA.id,
      borrowerId: companyB.id,
      limitAmount: '10000000000',
      startDate: '2026-01-01',
      endDate: '2027-07-31',
      ratePercent: '14',
    })
  })

  it('checks parties, dates, amount and rate before sending', async () => {
    const { calls } = mockApi({ 'GET /api/companies': companies })
    renderWithProviders(<ContractFormDialog open onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await pick(/Beruvchi/, 'A', /A MCHJ/)
    await pick(/Oluvchi/, 'A', /A MCHJ/)
    await userEvent.type(within(dialog).getByLabelText(/Summa \(limit\)/), '0abc')
    await userEvent.type(within(dialog).getByLabelText(/Boshlanish/), '2026-05-01')
    await userEvent.type(within(dialog).getByLabelText(/Tugash/), '2026-04-01')
    await userEvent.type(within(dialog).getByLabelText(/Yillik stavka/), '120')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    expect(await within(dialog).findByText("Beruvchi va oluvchi bir xil firma bo'lishi mumkin emas")).toBeInTheDocument()
    expect(within(dialog).getByText("Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak")).toBeInTheDocument()
    // Letters never reach the field (FR-10.1); a zero amount is still refused.
    expect(within(dialog).getByLabelText(/Summa \(limit\)/)).toHaveValue('0')
    expect(within(dialog).getByText("Summa 0 dan katta bo'lishi kerak")).toBeInTheDocument()
    expect(within(dialog).getByText("Stavka 0 dan katta va 100 dan oshmasligi kerak")).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('refuses dates outside 2000–2100 on each field (FR-10.2)', async () => {
    const { calls } = mockApi({ 'GET /api/companies': companies })
    renderWithProviders(<ContractFormDialog open onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/Shartnoma sanasi/), '1999-12-31')
    await userEvent.type(within(dialog).getByLabelText(/Boshlanish/), '2101-01-01')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    expect(await within(dialog).findAllByText("Yil 2000–2100 oralig'ida bo'lishi kerak")).toHaveLength(2)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('shows a duplicate number on the number field', async () => {
    mockApi({
      'GET /api/companies': companies,
      'POST /api/contracts': () => ({
        status: 409,
        body: {
          message: "Bu tomonlar o'rtasida shu raqamli shartnoma allaqachon mavjud",
          errors: { number: ["Bu tomonlar o'rtasida shu raqamli shartnoma allaqachon mavjud"] },
        },
      }),
    })
    renderWithProviders(<ContractFormDialog open onOpenChange={() => {}} />)
    await fillEtalon()
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    expect(await screen.findByText("Bu tomonlar o'rtasida shu raqamli shartnoma allaqachon mavjud")).toBeInTheDocument()
    expect(screen.getByLabelText(/Shartnoma raqami/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('edits without touching the rate', async () => {
    const { calls } = mockApi({
      'GET /api/companies': companies,
      [`PATCH /api/contracts/${etalon.id}`]: () => ({ status: 200, body: etalon }),
    })
    renderWithProviders(<ContractFormDialog open onOpenChange={() => {}} contract={etalon} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/Summa \(limit\)/)).toHaveValue('10 000 000 000,00')
    expect(within(dialog).queryByLabelText(/Yillik stavka/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/Stavka bu yerda o'zgartirilmaydi/)).toBeInTheDocument()
    const number = within(dialog).getByLabelText(/Shartnoma raqami/)
    await userEvent.clear(number)
    await userEvent.type(number, '1/A')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    const body = calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>
    expect(body).toMatchObject({ number: '1/A', limitAmount: '10000000000.00', lenderId: companyA.id })
    expect(body).not.toHaveProperty('ratePercent')
  })
})
