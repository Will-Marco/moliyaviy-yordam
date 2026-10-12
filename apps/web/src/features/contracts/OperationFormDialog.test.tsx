import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { etalon, etalonOperations } from './fixtures'
import { OperationFormDialog } from './OperationFormDialog'

const ops = `/api/contracts/${etalon.id}/operations`

async function fill({ date = '2026-01-05', type = 'Berildi', amount = '60 000 000', note = '' } = {}) {
  const dialog = screen.getByRole('dialog')
  const dateInput = within(dialog).getByLabelText(/Sana/)
  await userEvent.clear(dateInput)
  await userEvent.type(dateInput, date)
  await userEvent.click(within(dialog).getByRole('radio', { name: type }))
  await userEvent.type(within(dialog).getByLabelText(/Summa/), amount)
  if (note) await userEvent.type(within(dialog).getByLabelText(/Izoh/), note)
}

describe('OperationFormDialog', () => {
  it('refuses a date outside 2000–2100 before sending (FR-10.2)', async () => {
    const { calls } = mockApi({})
    renderWithProviders(<OperationFormDialog contract={etalon} open onOpenChange={() => {}} />)
    await fill({ date: '1926-01-05' })
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    expect(await screen.findByText("Yil 2000–2100 oralig'ida bo'lishi kerak")).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('records a disbursement (FR-3.1)', async () => {
    const { calls } = mockApi({
      [`POST ${ops}`]: () => ({ status: 201, body: { operation: etalonOperations[0], warnings: [] } }),
    })
    const onOpenChange = vi.fn()
    renderWithProviders(<OperationFormDialog contract={etalon} open onOpenChange={onOpenChange} />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls[0].body).toEqual({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000', note: null })
  })

  it('shows warnings and saves only after "Baribir saqlash" (FR-3.3)', async () => {
    let attempt = 0
    const { calls } = mockApi({
      [`POST ${ops}`]: () =>
        ++attempt === 1
          ? {
              status: 409,
              body: {
                code: 'CONFIRMATION_REQUIRED',
                message: "Ogohlantirishlarni ko'rib chiqing",
                warnings: [{ code: 'LIMIT_EXCEEDED', message: "Jami berilgan summa limitdan 1,00 so'mga oshadi" }],
              },
            }
          : { status: 201, body: { operation: etalonOperations[0], warnings: [] } },
    })
    const onOpenChange = vi.fn()
    renderWithProviders(<OperationFormDialog contract={etalon} open onOpenChange={onOpenChange} />)
    await fill({ amount: '10 000 000 001' })
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))

    expect(await screen.findByText("Jami berilgan summa limitdan 1,00 so'mga oshadi")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Baribir saqlash' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls[1].body).toMatchObject({ amount: '10000000001', confirmWarnings: true })
  })

  it('shows which drafted invoice the change would alter, among other warnings (FR-3.7)', async () => {
    mockApi({
      [`POST ${ops}`]: () => ({
        status: 409,
        body: {
          code: 'CONFIRMATION_REQUIRED',
          message: "Ogohlantirishlarni ko'rib chiqing",
          warnings: [
            { code: 'FUTURE_DATE', message: 'Sana kelajakda (05.01.2027)' },
            {
              code: 'DRAFTED_INVOICE_CHANGES',
              message: "Yanvar 2026 fakturasi Didox'da qoralama qilingan (552 328,77 so'm) — foiz 555 013,70 so'm bo'ladi",
            },
          ],
        },
      }),
    })
    renderWithProviders(<OperationFormDialog contract={etalon} open onOpenChange={vi.fn()} />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    expect(await screen.findByText(/Yanvar 2026 fakturasi Didox'da qoralama qilingan/)).toBeInTheDocument()
    expect(screen.getByText(/Sana kelajakda/)).toBeInTheDocument()
  })

  it('goes back to the form from the warnings', async () => {
    mockApi({
      [`POST ${ops}`]: () => ({
        status: 409,
        body: {
          code: 'CONFIRMATION_REQUIRED',
          message: "Ogohlantirishlarni ko'rib chiqing",
          warnings: [{ code: 'BEFORE_START', message: 'Operatsiya sanasi shartnoma boshlanishidan (01.01.2026) oldin' }],
        },
      }),
    })
    renderWithProviders(<OperationFormDialog contract={etalon} open onOpenChange={() => {}} />)
    await fill({ date: '2025-12-31' })
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await userEvent.click(await screen.findByRole('button', { name: "O'zgartirish" }))
    expect(screen.queryByText(/boshlanishidan/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Summa/)).toHaveValue('60\u00a0000\u00a0000')
  })

  it('validates the amount before sending', async () => {
    const { calls } = mockApi({})
    renderWithProviders(<OperationFormDialog contract={etalon} open onOpenChange={() => {}} />)
    await fill({ amount: '0' })
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    expect(await screen.findByText("Summa 0 dan katta bo'lishi kerak")).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('edits an existing operation', async () => {
    const op = etalonOperations[1]
    const { calls } = mockApi({
      [`PATCH ${ops}/${op.id}`]: () => ({ status: 200, body: { operation: op, warnings: [] } }),
    })
    const onOpenChange = vi.fn()
    renderWithProviders(<OperationFormDialog contract={etalon} operation={op} open onOpenChange={onOpenChange} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: 'Qaytarildi' })).toBeChecked()
    expect(within(dialog).getByLabelText(/Summa/)).toHaveValue('15 000 000,00')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls[0].body).toEqual({
      date: '2026-01-20',
      type: 'PRINCIPAL_REPAYMENT',
      amount: '15000000.00',
      note: 'Asosiy qarzdan',
    })
  })
})
