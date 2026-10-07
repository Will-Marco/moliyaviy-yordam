import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ImportCompaniesDialog } from './ImportCompaniesDialog'

const item = (over: Record<string, unknown>) => ({
  name: '"ALFA SAVDO" MCHJ',
  address: 'Toshkent',
  tin: '300000001',
  vatRegCode: null,
  bankAccount: '20208000100000000001',
  mfo: '01071',
  status: 'create',
  changes: [],
  errors: {},
  source: { file: '690.xls', invoiceNo: '690', invoiceDate: '2026-09-15' },
  ...over,
})

const preview = {
  items: [
    item({}),
    item({ name: 'BETA', tin: '300000002', status: 'update', changes: ['address', 'mfo'] }),
    item({ name: 'GAMMA', tin: '300000003', status: 'unchanged' }),
    item({ name: 'DELTA', tin: '30000', status: 'error', errors: { tin: ["STIR 9 ta raqamdan iborat bo'lishi kerak"] } }),
  ],
  fileErrors: [{ file: 'rasm.xls', message: 'Didox schyot-faktura fayli tanilmadi' }],
}

const invoiceFile = (name = '690.xls', content = '<html>faktura</html>') =>
  new File([content], name, { type: 'application/vnd.ms-excel' })

async function choose(files: File[]) {
  await userEvent.upload(screen.getByLabelText(/Faktura fayllarini tanlang/), files)
}

describe('ImportCompaniesDialog', () => {
  it('sends the chosen files for preview and explains every row', async () => {
    const { calls } = mockApi({ 'POST /api/companies/import/preview': () => ({ status: 200, body: preview }) })
    renderWithProviders(<ImportCompaniesDialog open onOpenChange={() => {}} />)
    await choose([invoiceFile(), invoiceFile('rasm.xls', 'xyz')])

    expect(calls[0].body).toEqual({
      files: [
        { name: '690.xls', content: '<html>faktura</html>' },
        { name: 'rasm.xls', content: 'xyz' },
      ],
    })
    const dialog = screen.getByRole('dialog')
    const row = (text: string) => within(dialog).getByText(text).closest('tr')!
    expect(await within(dialog).findByText('"ALFA SAVDO" MCHJ')).toBeInTheDocument()
    expect(within(row('"ALFA SAVDO" MCHJ')).getByText('Yangi')).toBeInTheDocument()
    expect(within(row('BETA')).getByText('Yangilanadi')).toBeInTheDocument()
    expect(within(row('BETA')).getByText('Manzil, MFO')).toBeInTheDocument()
    expect(within(row('GAMMA')).getByText("O'zgarishsiz")).toBeInTheDocument()
    expect(within(row('DELTA')).getByText("STIR 9 ta raqamdan iborat bo'lishi kerak")).toBeInTheDocument()
    expect(within(dialog).getByText(/rasm\.xls/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Import qilish (2)' })).toBeEnabled()
  })

  it('applies the same files and closes', async () => {
    const { calls } = mockApi({
      'POST /api/companies/import/preview': () => ({ status: 200, body: preview }),
      'POST /api/companies/import': () => ({
        status: 200,
        body: { ...preview, created: 1, updated: 1, unchanged: 1, skipped: 1 },
      }),
    })
    const onOpenChange = vi.fn()
    renderWithProviders(<ImportCompaniesDialog open onOpenChange={onOpenChange} />)
    await choose([invoiceFile()])
    await userEvent.click(await screen.findByRole('button', { name: 'Import qilish (2)' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls[1]).toMatchObject({
      path: '/api/companies/import',
      body: { files: [{ name: '690.xls', content: '<html>faktura</html>' }] },
    })
  })

  it('disables import when nothing would change', async () => {
    mockApi({
      'POST /api/companies/import/preview': () => ({
        status: 200,
        body: { items: [item({ status: 'unchanged' })], fileErrors: [] },
      }),
    })
    renderWithProviders(<ImportCompaniesDialog open onOpenChange={() => {}} />)
    await choose([invoiceFile()])
    expect(await screen.findByRole('button', { name: 'Import qilish (0)' })).toBeDisabled()
  })

  it('rejects oversized files before uploading', async () => {
    const { calls } = mockApi({})
    renderWithProviders(<ImportCompaniesDialog open onOpenChange={() => {}} />)
    await choose([invoiceFile('katta.xls', 'x'.repeat(1_000_001))])
    expect(await screen.findByRole('alert')).toHaveTextContent('katta.xls: fayl hajmi 1 MB dan oshmasligi kerak')
    expect(calls).toHaveLength(0)
  })

  it('rejects a selection larger than the upload limit in total', async () => {
    const { calls } = mockApi({})
    renderWithProviders(<ImportCompaniesDialog open onOpenChange={() => {}} />)
    const files = Array.from({ length: 12 }, (_, i) => invoiceFile(`${i}.xls`, 'x'.repeat(900_000)))
    await choose(files)
    expect(await screen.findByRole('alert')).toHaveTextContent("Fayllar jami hajmi 9 MB dan oshmasligi kerak")
    expect(calls).toHaveLength(0)
  })

  it('lets the accountant pick other files after a preview', async () => {
    mockApi({ 'POST /api/companies/import/preview': () => ({ status: 200, body: preview }) })
    renderWithProviders(<ImportCompaniesDialog open onOpenChange={() => {}} />)
    await choose([invoiceFile()])
    await userEvent.click(await screen.findByRole('button', { name: 'Boshqa fayllar' }))
    expect(screen.getByLabelText(/Faktura fayllarini tanlang/)).toBeInTheDocument()
  })
})
