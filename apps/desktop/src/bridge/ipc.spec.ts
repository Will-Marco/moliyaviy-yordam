import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyStatus } from '../eimzo/match.js'

type Handler = (event: unknown, arg?: unknown) => Promise<unknown>
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) },
  shell: { openPath: async () => '' },
}))

const { registerIpc } = await import('./ipc.js')

const ORIGIN = 'https://moliya.example.uz'
const APP_ID = 7
const fromApp = { sender: { id: APP_ID }, senderFrame: { url: `${ORIGIN}/companies` } }
const tins = (n: number) => Array.from({ length: n }, (_, i) => String(300000001 + i))

const key: KeyStatus = {
  status: 'ok',
  key: { tin: '300000001', org: 'ALFA SAVDO MCHJ', title: 'direktor', serial: 'a1', validFrom: '2025-01-01T00:00:00', validTo: '2028-01-21T12:04:52' },
}

describe('eri:list-keys (security review L3)', () => {
  beforeEach(() => {
    handlers.clear()
    registerIpc({
      getAppWindow: () => ({ webContents: { id: APP_ID } }) as never,
      origin: ORIGIN,
      diagnosticsDir: '/tmp',
      eri: { status: async () => 'set' },
      readKeys: async (asked) => new Map(asked.map((tin) => [tin, tin === '300000001' ? key : { status: 'missing' as const }])),
      requests: {} as never,
      openPasswordWindow: async () => ({ saved: false }),
      install: { id: 'i', name: 'PC', label: 'PC (i)' },
    })
  })
  const listKeys = (arg: unknown) => handlers.get('eri:list-keys')!(fromApp, arg)

  it("gives the page the key's firm and dates, not the holder's job title", async () => {
    expect(await listKeys(['300000001', '300000002'])).toEqual({
      eimzo: 'ok',
      keys: { '300000001': { status: 'ok', org: 'ALFA SAVDO MCHJ', validTo: '2028-01-21T12:04:52' }, '300000002': { status: 'missing' } },
      passwords: { '300000001': 'set', '300000002': 'set' },
    })
  })

  it('answers at most 200 STIRs at a time', async () => {
    await expect(listKeys(tins(200))).resolves.toMatchObject({ eimzo: 'ok' })
    await expect(listKeys(tins(201))).rejects.toThrow('Invalid STIR list')
  })
})
