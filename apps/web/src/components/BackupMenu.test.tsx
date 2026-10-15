import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import { BackupMenu } from './BackupMenu'

describe('BackupMenu', () => {
  it('is absent in a plain browser', () => {
    renderWithProviders(<BackupMenu />)
    expect(screen.queryByRole('button', { name: /Zaxira/ })).not.toBeInTheDocument()
  })

  it('is absent in a desktop app on the shared server, which has no local backups (M13)', () => {
    vi.stubGlobal('desktop', { platform: 'darwin', eri: { listKeys: vi.fn() } })
    renderWithProviders(<BackupMenu />)
    expect(screen.queryByRole('button', { name: /Zaxira/ })).not.toBeInTheDocument()
  })

  it('shows when the last backup was made and opens the backups folder (desktop with a local database)', async () => {
    const openFolder = vi.fn(async () => {})
    vi.stubGlobal('desktop', {
      platform: 'darwin',
      eri: { listKeys: vi.fn() },
      backups: { status: async () => ({ last: '2026-10-12T06:05:00.000Z' }), openFolder },
    })
    renderWithProviders(<BackupMenu />)

    await userEvent.click(screen.getByRole('button', { name: /Zaxira/ }))
    expect(await screen.findByText('Oxirgi zaxira: 12.10.2026 11:05')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Zaxira papkasini ochish' }))
    expect(openFolder).toHaveBeenCalledOnce()
  })

  it('says so when no backup exists yet', async () => {
    vi.stubGlobal('desktop', {
      platform: 'darwin',
      eri: { listKeys: vi.fn() },
      backups: { status: async () => ({ last: null }), openFolder: vi.fn() },
    })
    renderWithProviders(<BackupMenu />)
    await userEvent.click(screen.getByRole('button', { name: /Zaxira/ }))
    expect(await screen.findByText('Hali zaxira olinmagan')).toBeInTheDocument()
  })
})
