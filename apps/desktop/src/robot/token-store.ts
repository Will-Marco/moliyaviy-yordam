import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SafeStorageLike } from '../secrets/eri-store.js'

/** The robot's own session token for the shared server, as the server issued it (M13 P6b). */
export interface StoredRobotToken {
  token: string
  /** ISO time the server put in the token; past it the server refuses it anyway. */
  expiresAt: string
}

interface FileShape {
  /** base64 of the OS-encrypted token. */
  cipher: string
  expiresAt: string
}

/**
 * Keeps the robot token the way the ERI store keeps passwords: only OS-encrypted ciphertext on disk (`safeStorage`).
 * The token is a 180-day key to the shared server's data, so a copied userData folder must not carry it in the clear.
 */
export function createRobotTokenStore({ file, safeStorage, nowMs = Date.now }: { file: string; safeStorage: SafeStorageLike; nowMs?: () => number }) {
  return {
    /** The token, or null when there is none, it has expired, or it cannot be decrypted on this account. */
    async get(): Promise<StoredRobotToken | null> {
      let stored: Partial<FileShape>
      try {
        stored = JSON.parse(await readFile(file, 'utf8')) as Partial<FileShape>
      } catch {
        return null
      }
      if (typeof stored.cipher !== 'string' || typeof stored.expiresAt !== 'string') return null
      const expires = Date.parse(stored.expiresAt)
      if (!Number.isFinite(expires) || expires <= nowMs()) return null
      try {
        return { token: safeStorage.decryptString(Buffer.from(stored.cipher, 'base64')), expiresAt: stored.expiresAt }
      } catch {
        return null // another OS account, a reset keychain: the next person login fetches a new one
      }
    },

    async set(token: string, expiresAt: string): Promise<void> {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Bu kompyuterda robot kalitini shifrlab saqlab bo'lmaydi")
      const content: FileShape = { cipher: safeStorage.encryptString(token).toString('base64'), expiresAt }
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      await writeFile(tmp, JSON.stringify(content, null, 2), { mode: 0o600 })
      await rename(tmp, file)
    },

    async clear(): Promise<void> {
      await rm(file, { force: true })
    },
  }
}

export type RobotTokenStore = ReturnType<typeof createRobotTokenStore>
