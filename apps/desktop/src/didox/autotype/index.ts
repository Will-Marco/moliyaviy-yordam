import { spawn as nodeSpawn } from 'node:child_process'
import type { AutotypePreflightResult, AutotypeResult } from '../contract.js'
import { preflightOnDarwin, typeOnDarwin } from './darwin.js'
import type { SpawnLike } from './typist.js'
import { preflightOnWindows, typeOnWindows } from './win32.js'

export { AutotypeCancelledError, type SpawnLike } from './typist.js'

/**
 * Types the firm's ERI password into E-IMZO's password dialog, once (plan B3). The app never signs: this only
 * unlocks the key for the login the accountant's own Didox session asked for.
 * Aborting `signal` before typing started kills the typist and rejects with AutotypeCancelledError; after that it
 * runs to the end. Failures before typing throw; after typing started they resolve `interrupted`.
 */
export async function typeEimzoPassword(
  password: string,
  opts: { dialogTimeoutMs: number; signal: AbortSignal; platform?: NodeJS.Platform; spawn?: SpawnLike },
): Promise<AutotypeResult> {
  const platform = opts.platform ?? process.platform
  const spawn: SpawnLike = opts.spawn ?? nodeSpawn
  if (platform === 'darwin') {
    return typeOnDarwin(password, { dialogTimeoutMs: opts.dialogTimeoutMs, signal: opts.signal, spawn })
  }
  if (platform === 'win32') {
    return typeOnWindows(password, { dialogTimeoutMs: opts.dialogTimeoutMs, signal: opts.signal, spawn })
  }
  throw new Error(`E-IMZO parolini avtomatik yozish bu tizimda hali yo'q (${platform})`)
}

/** Run before the Didox window opens; reads only. Anything but macOS and Windows is `unsupported`. */
export async function autotypePreflight(
  opts: { platform?: NodeJS.Platform; spawn?: SpawnLike } = {},
): Promise<AutotypePreflightResult> {
  const platform = opts.platform ?? process.platform
  const spawn = opts.spawn ?? nodeSpawn
  if (platform === 'darwin') return preflightOnDarwin({ spawn })
  if (platform === 'win32') return preflightOnWindows({ spawn })
  return 'unsupported'
}
