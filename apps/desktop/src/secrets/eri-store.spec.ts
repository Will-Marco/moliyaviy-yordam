import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEriStore, EriStoreError, type SafeStorageLike } from './eri-store.js'

/** Reversible stand-in for Electron's safeStorage: the "cipher" never contains the plain password. */
const fakeSafeStorage = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
  decryptString: (b) => {
    const text = b.toString()
    if (!text.startsWith('enc:')) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
    return Buffer.from(text.slice(4), 'hex').toString()
  },
})

let dir: string
let file: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'eri-store-'))
  file = join(dir, 'eri-secrets.json')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const TIN = '300000001'
const SERIAL = '7a1b2c3d'

describe('ERI password store', () => {
  it('reports a firm without a saved password as missing', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    expect(await store.status(TIN, SERIAL)).toBe('missing')
  })

  it('keeps the password encrypted on disk, readable only by its owner', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    await store.set(TIN, 'Maxfiy-Parol-1', SERIAL)

    const raw = await readFile(file, 'utf8')
    expect(raw).not.toContain('Maxfiy-Parol-1')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await store.status(TIN, SERIAL)).toBe('set')
  })

  it('hands the password only to the callback and returns what the callback returns', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    await store.set(TIN, 'Maxfiy-Parol-1', SERIAL)

    const seen: string[] = []
    const result = await store.withPassword(TIN, async (password) => {
      seen.push(password)
      return 'typed'
    })
    expect(result).toBe('typed')
    expect(seen).toEqual(['Maxfiy-Parol-1'])
  })

  it('survives a restart', async () => {
    await createEriStore({ file, safeStorage: fakeSafeStorage() }).set(TIN, 'Maxfiy-Parol-1', SERIAL)
    const again = createEriStore({ file, safeStorage: fakeSafeStorage() })
    expect(await again.status(TIN, SERIAL)).toBe('set')
  })

  it('asks for the password again once the firm gets a new key', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    await store.set(TIN, 'Maxfiy-Parol-1', SERIAL)
    expect(await store.status(TIN, 'ffff0000')).toBe('key_changed')
    await expect(store.withPassword(TIN, async () => 'x', 'ffff0000')).rejects.toMatchObject({ code: 'KEY_CHANGED' })
  })

  it('stops using a password E-IMZO rejected until the accountant enters it again', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    await store.set(TIN, 'Eski-Parol', SERIAL)
    await store.markRejected(TIN)

    expect(await store.status(TIN, SERIAL)).toBe('rejected')
    await expect(store.withPassword(TIN, async () => 'x')).rejects.toMatchObject({ code: 'PASSWORD_REJECTED' })

    await store.set(TIN, 'Yangi-Parol', SERIAL)
    expect(await store.status(TIN, SERIAL)).toBe('set')
  })

  it('forgets a removed password', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    await store.set(TIN, 'Maxfiy-Parol-1', SERIAL)
    await store.set('300000002', 'Boshqa', SERIAL)
    await store.remove(TIN)

    expect(await store.status(TIN, SERIAL)).toBe('missing')
    expect(await store.status('300000002', SERIAL)).toBe('set')
    await expect(store.withPassword(TIN, async () => 'x')).rejects.toMatchObject({ code: 'PASSWORD_MISSING' })
  })

  it('refuses to save when the OS cannot encrypt (no plain-text fallback)', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage(false) })
    await expect(store.set(TIN, 'Maxfiy-Parol-1', SERIAL)).rejects.toBeInstanceOf(EriStoreError)
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('treats a password the OS can no longer decrypt as missing', async () => {
    await writeFile(file, JSON.stringify({ [TIN]: { cipher: Buffer.from('garbage').toString('base64'), serial: SERIAL, updatedAt: 'x' } }))
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    await expect(store.withPassword(TIN, async () => 'x')).rejects.toMatchObject({ code: 'PASSWORD_UNREADABLE' })
  })

  it('starts empty instead of failing when the file is damaged', async () => {
    await writeFile(file, '{not json')
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    expect(await store.status(TIN, SERIAL)).toBe('missing')
    await store.set(TIN, 'Maxfiy-Parol-1', SERIAL)
    expect(await store.status(TIN, SERIAL)).toBe('set')
  })

  it('does not lose a write when two saves run at once', async () => {
    const store = createEriStore({ file, safeStorage: fakeSafeStorage() })
    await Promise.all([store.set(TIN, 'A', SERIAL), store.set('300000002', 'B', SERIAL)])
    const again = createEriStore({ file, safeStorage: fakeSafeStorage() })
    expect(await again.status(TIN, SERIAL)).toBe('set')
    expect(await again.status('300000002', SERIAL)).toBe('set')
  })
})
