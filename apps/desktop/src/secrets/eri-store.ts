import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** The part of Electron's `safeStorage` the store needs (Keychain on macOS, DPAPI on Windows). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(cipher: Buffer): string
}

/** `key_changed`: the firm's E-IMZO key was replaced since the password was saved, so it is asked again. */
export type PasswordStatus = 'set' | 'missing' | 'rejected' | 'key_changed'

export type EriStoreErrorCode =
  | 'ENCRYPTION_UNAVAILABLE'
  | 'PASSWORD_MISSING'
  | 'PASSWORD_REJECTED'
  | 'PASSWORD_UNREADABLE'
  | 'KEY_CHANGED'

export class EriStoreError extends Error {
  constructor(
    readonly code: EriStoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EriStoreError'
  }
}

interface Entry {
  /** base64 of the OS-encrypted password. */
  cipher: string
  /** Serial of the key the password belongs to. */
  serial: string | null
  updatedAt: string
  rejectedAt?: string
}

type Secrets = Record<string, Entry>

/**
 * ERI passwords per firm STIR (FR-8.2). Only ciphertext touches the disk; the plain password exists only inside
 * `withPassword`'s callback and is never returned to the renderer, logged or sent anywhere.
 */
export function createEriStore({ file, safeStorage }: { file: string; safeStorage: SafeStorageLike }) {
  // Writes are serialized so two saves cannot read the same old file and drop each other's entry.
  let queue: Promise<unknown> = Promise.resolve()
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function load(): Promise<Secrets> {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Secrets) : {}
    } catch {
      return {} // missing or damaged: the accountant re-enters the passwords
    }
  }

  async function save(secrets: Secrets): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify(secrets, null, 2), { mode: 0o600 })
    await rename(tmp, file)
  }

  const update = (change: (secrets: Secrets) => void) =>
    serially(async () => {
      const secrets = await load()
      change(secrets)
      await save(secrets)
    })

  return {
    async set(tin: string, password: string, serial: string | null): Promise<void> {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new EriStoreError('ENCRYPTION_UNAVAILABLE', "Bu kompyuterda parolni shifrlab saqlab bo'lmaydi")
      }
      const cipher = safeStorage.encryptString(password).toString('base64')
      await update((s) => {
        s[tin] = { cipher, serial, updatedAt: new Date().toISOString() }
      })
    },

    async remove(tin: string): Promise<void> {
      await update((s) => {
        delete s[tin]
      })
    },

    /** After E-IMZO refused the password (or the login did not go through): no more attempts until it is re-entered. */
    async markRejected(tin: string): Promise<void> {
      await update((s) => {
        const entry = s[tin]
        if (entry) entry.rejectedAt = new Date().toISOString()
      })
    },

    async status(tin: string, currentSerial: string | null): Promise<PasswordStatus> {
      await queue
      const entry = (await load())[tin]
      if (!entry) return 'missing'
      if (entry.rejectedAt) return 'rejected'
      if (currentSerial && entry.serial && currentSerial !== entry.serial) return 'key_changed'
      return 'set'
    },

    /** Decrypts the password just for `use`; pass `currentSerial` to refuse a password saved for a replaced key. */
    async withPassword<T>(tin: string, use: (password: string) => Promise<T>, currentSerial?: string | null): Promise<T> {
      await queue
      const entry = (await load())[tin]
      if (!entry) throw new EriStoreError('PASSWORD_MISSING', 'ERI paroli kiritilmagan')
      if (entry.rejectedAt) throw new EriStoreError('PASSWORD_REJECTED', 'ERI paroli rad etilgan — qayta kiriting')
      if (currentSerial && entry.serial && currentSerial !== entry.serial) {
        throw new EriStoreError('KEY_CHANGED', 'Kalit yangilangan — parolni qayta kiriting')
      }
      let password: string
      try {
        password = safeStorage.decryptString(Buffer.from(entry.cipher, 'base64'))
      } catch {
        throw new EriStoreError('PASSWORD_UNREADABLE', "Saqlangan parolni o'qib bo'lmadi — qayta kiriting")
      }
      return use(password)
    },
  }
}

export type EriStore = ReturnType<typeof createEriStore>
