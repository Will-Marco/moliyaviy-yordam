import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DidoxCheckResult, DidoxProgress } from '@/lib/desktop'
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

  it('explains when the desktop app could not read the ERI keys at all', async () => {
    vi.stubGlobal('desktop', {
      platform: 'darwin',
      eri: { listKeys: async () => Promise.reject(new Error('IPC failed')) },
    })
    mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
    renderWithProviders(<CompaniesPage />)
    expect(await screen.findByText(/ERI kalitlarini o'qib bo'lmadi/)).toBeInTheDocument()
  })

  describe('ERI password (desktop)', () => {
    const okKey = { status: 'ok', org: 'alfa', title: 'direktor', validTo: '2028-01-21T12:04:52' }
    const desktopWith = (passwords: Record<string, string>, extra: Record<string, unknown> = {}) => {
      const eri = {
        listKeys: vi.fn(async () => ({ eimzo: 'ok', keys: { '300000001': okKey }, passwords })),
        openPasswordWindow: vi.fn(async () => ({ saved: true })),
        removePassword: vi.fn(async () => undefined),
        ...extra,
      }
      vi.stubGlobal('desktop', { platform: 'darwin', eri })
      mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
      return eri
    }
    const alfaRow = async () => (await screen.findByText('"ALFA SAVDO" MCHJ')).closest('tr')!

    it('shows whether a password is saved, rejected or must be entered again', async () => {
      const beta = { ...alfa, id: '0192f000-0000-7000-8000-000000000002', name: 'BETA', tin: '300000002' }
      const gamma = { ...alfa, id: '0192f000-0000-7000-8000-000000000003', name: 'GAMMA', tin: '300000003' }
      const delta = { ...alfa, id: '0192f000-0000-7000-8000-000000000004', name: 'DELTA', tin: '300000004' }
      vi.stubGlobal('desktop', {
        platform: 'darwin',
        eri: {
          listKeys: async () => ({
            eimzo: 'ok',
            keys: {},
            passwords: { '300000001': 'set', '300000002': 'missing', '300000003': 'rejected', '300000004': 'key_changed' },
          }),
        },
      })
      mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa, beta, gamma, delta] }) })
      renderWithProviders(<CompaniesPage />)

      const row = async (name: string) => (await screen.findByText(name)).closest('tr')!
      expect(await within(await row('"ALFA SAVDO" MCHJ')).findByText('Parol bor')).toBeInTheDocument()
      expect(within(await row('BETA')).getByText("Parol yo'q")).toBeInTheDocument()
      expect(within(await row('GAMMA')).getByText("E'tibor kerak: parol rad etilgan")).toBeInTheDocument()
      expect(within(await row('DELTA')).getByText('Kalit yangilangan')).toBeInTheDocument()
    })

    it("has the password typed in the app's own window — the page never sees it (M13)", async () => {
      const eri = desktopWith({ '300000001': 'missing' })
      renderWithProviders(<CompaniesPage />)
      await userEvent.click(await within(await alfaRow()).findByRole('button', { name: `ERI paroli: ${alfa.name}` }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByLabelText('ERI kaliti paroli')).not.toBeInTheDocument()
      expect(dialog.querySelector('input[type="password"]')).toBeNull()
      expect(within(dialog).getByText(/serverga yuborilmaydi/)).toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Parolni kiritish' }))

      expect(eri.openPasswordWindow).toHaveBeenCalledWith('300000001')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(eri.listKeys).toHaveBeenCalledTimes(2) // the status is read again once the window is closed
    })

    it('stays open, and still re-reads the status, when the window is closed without saving', async () => {
      const eri = desktopWith({ '300000001': 'missing' }, { openPasswordWindow: vi.fn(async () => ({ saved: false })) })
      renderWithProviders(<CompaniesPage />)
      await userEvent.click(await within(await alfaRow()).findByRole('button', { name: `ERI paroli: ${alfa.name}` }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Parolni kiritish' }))

      await waitFor(() => expect(eri.listKeys).toHaveBeenCalledTimes(2))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('offers to replace a saved password', async () => {
      const eri = desktopWith({ '300000001': 'rejected' })
      renderWithProviders(<CompaniesPage />)
      await userEvent.click(await within(await alfaRow()).findByRole('button', { name: `ERI paroli: ${alfa.name}` }))
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Parolni yangilash' }))
      expect(eri.openPasswordWindow).toHaveBeenCalledWith('300000001')
    })

    it('says why the password window could not be opened', async () => {
      desktopWith({ '300000001': 'missing' }, { openPasswordWindow: async () => Promise.reject(new Error('Untrusted IPC sender')) })
      renderWithProviders(<CompaniesPage />)
      await userEvent.click(await within(await alfaRow()).findByRole('button', { name: `ERI paroli: ${alfa.name}` }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Parolni kiritish' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Untrusted IPC sender')
    })

    it('removes a saved password', async () => {
      const eri = desktopWith({ '300000001': 'set' })
      renderWithProviders(<CompaniesPage />)
      await userEvent.click(await within(await alfaRow()).findByRole('button', { name: `ERI paroli: ${alfa.name}` }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: "Parolni o'chirish" }))
      expect(eri.removePassword).toHaveBeenCalledWith('300000001')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('keeps the password and the dialog when removal is not confirmed in the desktop app', async () => {
      const eri = desktopWith(
        { '300000001': 'set' },
        { removePassword: vi.fn(async () => ({ ok: false, code: 'CANCELLED', message: 'Bekor qilindi — ilova oynasida tasdiqlanmadi' })) },
      )
      renderWithProviders(<CompaniesPage />)
      await userEvent.click(await within(await alfaRow()).findByRole('button', { name: `ERI paroli: ${alfa.name}` }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: "Parolni o'chirish" }))
      await waitFor(() => expect(eri.removePassword).toHaveBeenCalledWith('300000001'))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText("ERI paroli o'chirildi")).not.toBeInTheDocument()
    })
  })

  describe('Didox login check (desktop)', () => {
    const okKey = { status: 'ok', org: 'alfa', title: 'direktor', validTo: '2028-01-21T12:04:52' }
    const beta = { ...alfa, id: '0192f000-0000-7000-8000-000000000002', name: 'BETA', tin: '300000002' }
    const gamma = { ...alfa, id: '0192f000-0000-7000-8000-000000000003', name: 'GAMMA', tin: '300000003' }

    /** Desktop bridge with a Didox runner whose result the test settles; progress is pushed with `emit`. */
    const desktopWithDidox = () => {
      let settle!: (r: DidoxCheckResult) => void
      let listener: ((p: DidoxProgress) => void) | null = null
      const eri = {
        listKeys: vi.fn(async () => ({
          eimzo: 'ok',
          keys: { '300000001': okKey, '300000002': okKey, '300000003': { ...okKey, status: 'expired' } },
          passwords: { '300000001': 'set', '300000002': 'missing', '300000003': 'set' },
        })),
      }
      const didox = {
        checkLogin: vi.fn(() => new Promise<DidoxCheckResult>((ok) => (settle = ok))),
        cancel: vi.fn(async () => undefined),
        onProgress: vi.fn((cb: (p: DidoxProgress) => void) => {
          listener = cb
          return () => (listener = null)
        }),
      }
      vi.stubGlobal('desktop', { platform: 'darwin', eri, didox })
      mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa, beta, gamma] }) })
      const emit = (p: Omit<DidoxProgress, 'firmTin'>, firmTin = '300000001') => act(() => listener?.({ firmTin, ...p }))
      const finish = (r: DidoxCheckResult) => act(() => settle(r))
      return { eri, didox, emit, finish }
    }
    const checkButton = (name: string) => screen.findByRole('button', { name: `Kirishni tekshirish: ${name}` })
    const openCheck = async () => {
      await waitFor(async () => expect(await checkButton(alfa.name)).toBeEnabled())
      await userEvent.click(await checkButton(alfa.name))
      return screen.findByRole('dialog')
    }

    it('is not offered by desktop builds without the Didox bridge', async () => {
      vi.stubGlobal('desktop', { platform: 'darwin', eri: { listKeys: async () => ({ eimzo: 'ok', keys: {}, passwords: {} }) } })
      mockApi({ 'GET /api/companies': () => ({ status: 200, body: [alfa] }) })
      renderWithProviders(<CompaniesPage />)
      await screen.findByText('"ALFA SAVDO" MCHJ')
      expect(screen.queryByRole('button', { name: /Kirishni tekshirish/ })).not.toBeInTheDocument()
    })

    it('is enabled only with a valid key and a saved password', async () => {
      desktopWithDidox()
      renderWithProviders(<CompaniesPage />)
      await waitFor(async () => expect(await checkButton(alfa.name)).toBeEnabled())
      expect(await checkButton('BETA')).toBeDisabled() // no password
      expect(await checkButton('GAMMA')).toBeDisabled() // expired key
    })

    /* The app can type the ERI password on macOS and on Windows (apps/desktop/src/didox/autotype). */
    it('is offered on Windows as well', async () => {
      desktopWithDidox()
      vi.stubGlobal('desktop', { ...window.desktop!, platform: 'win32' })
      renderWithProviders(<CompaniesPage />)
      const button = await checkButton(alfa.name)
      expect(await within(button.closest('tr')!).findByText('Parol bor')).toBeInTheDocument()
      expect(button).toBeEnabled()
    })

    it('is disabled where it cannot type at all, saying why', async () => {
      desktopWithDidox()
      vi.stubGlobal('desktop', { ...window.desktop!, platform: 'linux' })
      renderWithProviders(<CompaniesPage />)
      const button = await checkButton(alfa.name)
      expect(await within(button.closest('tr')!).findByText('Parol bor')).toBeInTheDocument()
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Bu tizimda ishlamaydi (macOS yoki Windows kerak)')
    })

    it('tells what to do about a wrong keyboard layout', async () => {
      const { eri, finish } = desktopWithDidox()
      renderWithProviders(<CompaniesPage />)
      const dialog = await openCheck()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Boshlash' }))
      await finish({ ok: false, code: 'KEYBOARD_LAYOUT', message: "Klaviaturani ABC/US (lotin) tartibiga o'tkazing" })
      const alert = await within(dialog).findByRole('alert')
      expect(alert).toHaveTextContent(/ABC yoki US/)
      expect(alert).not.toHaveTextContent(/qayta urinmaydi/)
      expect(eri.listKeys).toHaveBeenCalled()
    })

    it('treats an interrupted typing like a rejected password', async () => {
      const { finish } = desktopWithDidox()
      renderWithProviders(<CompaniesPage />)
      const dialog = await openCheck()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Boshlash' }))
      await finish({ ok: false, code: 'AUTOTYPE_INTERRUPTED', message: 'Parolni yozish tasdiqlanmadi' })
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/qayta urinmaydi/)
    })

    it('shows the steps as they run and the success, then refreshes the password status', async () => {
      const { eri, didox, emit, finish } = desktopWithDidox()
      renderWithProviders(<CompaniesPage />)
      const dialog = await openCheck()
      expect(within(dialog).getByText(/Hech narsa imzolanmaydi/)).toBeInTheDocument()
      expect(didox.checkLogin).not.toHaveBeenCalled() // nothing starts before the accountant confirms

      await userEvent.click(within(dialog).getByRole('button', { name: 'Boshlash' }))
      expect(didox.checkLogin).toHaveBeenCalledWith('300000001')
      expect(within(dialog).queryByRole('button', { name: 'Yopish' })).not.toBeInTheDocument()

      await emit({ step: 'eimzo', status: 'done' })
      await emit({ step: 'pickKey', status: 'running' })
      await emit({ step: 'pickKey', status: 'running' }, '300000002') // another firm's event is ignored
      const steps = within(dialog).getByRole('list', { name: 'Qadamlar' })
      expect(within(steps).getAllByRole('listitem')).toHaveLength(2)
      expect(within(steps).getByText('Kalitni tanlash')).toBeInTheDocument()
      await emit({ step: 'pickKey', status: 'done' })
      expect(within(steps).getAllByRole('listitem')).toHaveLength(2) // updated in place

      const before = eri.listKeys.mock.calls.length
      await finish({ ok: true })
      expect(await within(dialog).findByText(/Kirish ishladi/)).toBeInTheDocument()
      await waitFor(() => expect(eri.listKeys.mock.calls.length).toBeGreaterThan(before))
      await userEvent.click(within(dialog).getAllByRole('button', { name: 'Yopish' })[0]!)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('explains a rejected password in Uzbek', async () => {
      const { eri, finish } = desktopWithDidox()
      renderWithProviders(<CompaniesPage />)
      const dialog = await openCheck()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Boshlash' }))
      const before = eri.listKeys.mock.calls.length
      await finish({ ok: false, code: 'WRONG_PASSWORD', message: 'E-IMZO parolni qabul qilmadi', screenshot: '/diag/a.png' })
      const alert = await within(dialog).findByRole('alert')
      expect(alert).toHaveTextContent('E-IMZO parolni qabul qilmadi')
      expect(alert).toHaveTextContent(/qayta urinmaydi/)
      expect(alert).toHaveTextContent('/diag/a.png')
      await waitFor(() => expect(eri.listKeys.mock.calls.length).toBeGreaterThan(before)) // now shows "rad etilgan"
    })

    it('cancels a running check', async () => {
      const { didox, finish } = desktopWithDidox()
      renderWithProviders(<CompaniesPage />)
      const dialog = await openCheck()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Boshlash' }))
      await userEvent.keyboard('{Escape}') // cannot be dismissed while Didox is being driven
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Bekor qilish' }))
      expect(didox.cancel).toHaveBeenCalledOnce()
      await finish({ ok: false, code: 'CANCELLED', message: 'Bekor qilindi' })
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bekor qilindi')
    })
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
