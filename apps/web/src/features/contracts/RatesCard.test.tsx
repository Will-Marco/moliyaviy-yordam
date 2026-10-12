import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import type { Contract } from './api'
import { etalon } from './fixtures'
import { RatesCard } from './RatesCard'

const rates = `/api/contracts/${etalon.id}/rates`
const change = { id: '0192f000-0000-7000-8000-0000000000r2', initial: false, ratePercent: '16', changedOn: '2026-03-15', effectiveFrom: '2026-04-01' }
const withChange: Contract = { ...etalon, rates: [...etalon.rates!, change] }

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: "Stavkani o'zgartirish" }))
  return screen.findByRole('dialog')
}

describe('RatesCard (Module 5)', () => {
  it('lists the history; only changes can be deleted, only the initial rate corrected', () => {
    mockApi({})
    renderWithProviders(<RatesCard contract={withChange} />)
    const rows = within(screen.getByRole('table', { name: 'Stavkalar tarixi' })).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent("01.01.2026 dan")
    expect(rows[0]).toHaveTextContent("Boshlang'ich")
    expect(rows[1]).toHaveTextContent('01.04.2026 dan')
    expect(rows[1]).toHaveTextContent('15.03.2026')
    expect(rows[1]).toHaveTextContent('16 %')
    expect(within(rows[0]).getByRole('button', { name: "Boshlang'ich stavkani tuzatish" })).toBeInTheDocument()
    expect(within(rows[0]).queryByRole('button', { name: /O'chirish/ })).not.toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: "O'chirish: 16 %, 01.04.2026 dan" })).toBeInTheDocument()
  })

  it('shows when a new rate takes effect while typing the date (FR-5.1)', async () => {
    const { calls } = mockApi({
      [`POST ${rates}`]: () => ({ status: 201, body: { contract: withChange, warnings: [] } }),
    })
    renderWithProviders(<RatesCard contract={etalon} />)
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText(/Yangi stavka/), '16')
    const date = within(dialog).getByLabelText(/O'zgartirish sanasi/)
    await userEvent.clear(date)
    await userEvent.type(date, '2026-03-15')
    expect(within(dialog).getByText('01.04.2026 dan amal qiladi')).toBeInTheDocument()
    await userEvent.clear(date)
    await userEvent.type(date, '2026-04-01')
    expect(within(dialog).getByText('01.04.2026 dan amal qiladi')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls[0].body).toEqual({ ratePercent: '16', changedOn: '2026-04-01' })
  })

  it('asks before recalculating completed months (FR-5.5)', async () => {
    let attempt = 0
    const { calls } = mockApi({
      [`POST ${rates}`]: () =>
        ++attempt === 1
          ? {
              status: 409,
              body: {
                code: 'CONFIRMATION_REQUIRED',
                message: "Ogohlantirishlarni ko'rib chiqing",
                warnings: [{ code: 'RETROACTIVE', message: 'Tugagan oylar qayta hisoblanadi: Aprel 2026' }],
              },
            }
          : { status: 201, body: { contract: withChange, warnings: [] } },
    })
    renderWithProviders(<RatesCard contract={etalon} />)
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText(/Yangi stavka/), '16,5')
    const date = within(dialog).getByLabelText(/O'zgartirish sanasi/)
    await userEvent.clear(date)
    await userEvent.type(date, '2026-03-15')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    expect(await screen.findByText('Tugagan oylar qayta hisoblanadi: Aprel 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Baribir saqlash' }))
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].body).toEqual({ ratePercent: '16.5', changedOn: '2026-03-15', confirmWarnings: true })
  })

  it('corrects the initial rate value (FR-5.4)', async () => {
    const initial = etalon.rates![0]
    const { calls } = mockApi({
      [`PATCH ${rates}/${initial.id}`]: () => ({ status: 200, body: { contract: etalon, warnings: [] } }),
    })
    renderWithProviders(<RatesCard contract={etalon} />)
    await userEvent.click(screen.getByRole('button', { name: "Boshlang'ich stavkani tuzatish" }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText(/O'zgartirish sanasi/)).not.toBeInTheDocument()
    const input = within(dialog).getByLabelText(/Boshlang'ich stavka/)
    expect(input).toHaveValue('14')
    await userEvent.clear(input)
    await userEvent.type(input, '15')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { ratePercent: '15' } })
  })

  it('deletes a change after confirmation (FR-5.3)', async () => {
    const { calls } = mockApi({ [`DELETE ${rates}/${change.id}`]: () => ({ status: 204 }) })
    renderWithProviders(<RatesCard contract={withChange} />)
    await userEvent.click(screen.getByRole('button', { name: "O'chirish: 16 %, 01.04.2026 dan" }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: "O'chirish" }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
  })

  it('shows which completed months a deletion recalculates and deletes only when confirmed (FR-5.3, FR-5.5)', async () => {
    const { calls } = mockApi({
      [`DELETE ${rates}/${change.id}`]: () => ({
        status: 409,
        body: {
          code: 'CONFIRMATION_REQUIRED',
          message: "Ogohlantirishlarni ko'rib chiqing",
          warnings: [{ code: 'RETROACTIVE', message: 'Tugagan oylar qayta hisoblanadi: Aprel 2026' }],
        },
      }),
      [`DELETE ${rates}/${change.id}?confirmWarnings=true`]: () => ({ status: 204 }),
    })
    renderWithProviders(<RatesCard contract={withChange} />)
    await userEvent.click(screen.getByRole('button', { name: "O'chirish: 16 %, 01.04.2026 dan" }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: "O'chirish" }))

    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText('Tugagan oylar qayta hisoblanadi: Aprel 2026')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: "Baribir o'chirish" }))
    await vi.waitFor(() => expect(calls.map((c) => c.path).at(-1)).toContain('?confirmWarnings=true'))
  })
})
