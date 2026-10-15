import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SafeStorageLike } from '../secrets/eri-store.js'
import { createRobotTokenStore } from './token-store.js'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXNrdG9wIn0.c2lnbmF0dXJl'
const ORIGIN = 'https://moliya.example.uz'

/** Reversible, and obviously not plain text on disk. */
const fakeSafeStorage = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
  decryptString: (cipher) => {
    const text = cipher.toString()
    if (!text.startsWith('enc:')) throw new Error('bad cipher')
    return [...text.slice(4)].reverse().join('')
  },
})

describe('createRobotTokenStore (M13 P6b)', () => {
  let file: string
  let now = Date.parse('2026-10-15T10:00:00.000Z')
  beforeEach(async () => {
    file = join(await mkdtemp(join(tmpdir(), 'robot-token-')), 'robot-token.json')
    now = Date.parse('2026-10-15T10:00:00.000Z')
  })
  const store = (safeStorage = fakeSafeStorage(), origin = ORIGIN) => createRobotTokenStore({ file, origin, safeStorage, nowMs: () => now })

  it('has nothing before a token was saved', async () => {
    expect(await store().get()).toBeNull()
  })

  it('keeps the token encrypted on disk and gives it back', async () => {
    await store().set(TOKEN, '2027-04-13T10:00:00.000Z')

    expect(await readFile(file, 'utf8')).not.toContain(TOKEN)
    expect(await store().get()).toEqual({ token: TOKEN, expiresAt: '2027-04-13T10:00:00.000Z' })
  })

  it('does not hand out an expired token', async () => {
    await store().set(TOKEN, '2026-10-15T10:00:01.000Z')
    now += 2_000
    expect(await store().get()).toBeNull()
  })

  it('forgets the token when told to', async () => {
    const s = store()
    await s.set(TOKEN, '2027-04-13T10:00:00.000Z')
    await s.clear()
    expect(await s.get()).toBeNull()
  })

  it('refuses to save without OS encryption rather than write the token in the clear', async () => {
    await expect(store(fakeSafeStorage(false)).set(TOKEN, '2027-04-13T10:00:00.000Z')).rejects.toThrow(/shifr/)
  })

  it("keeps the server's origin with the token and hands it to no other server (security review L5)", async () => {
    await store().set(TOKEN, '2027-04-13T10:00:00.000Z')

    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ origin: ORIGIN })
    expect(await store(fakeSafeStorage(), 'https://other.example.uz').get()).toBeNull()
  })

  it('treats a token saved without its origin as no token', async () => {
    await store().set(TOKEN, '2027-04-13T10:00:00.000Z')
    const { origin: _origin, ...withoutOrigin } = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    await writeFile(file, JSON.stringify(withoutOrigin))

    expect(await store().get()).toBeNull()
  })

  it('treats an unreadable file as no token', async () => {
    await store().set(TOKEN, '2027-04-13T10:00:00.000Z')
    const broken: SafeStorageLike = { ...fakeSafeStorage(), decryptString: () => { throw new Error('keychain locked') } }
    expect(await store(broken).get()).toBeNull()
  })
})
