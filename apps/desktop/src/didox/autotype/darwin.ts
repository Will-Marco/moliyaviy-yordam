import type { AutotypePreflightResult, AutotypeResult } from '../contract.js'
import { EIMZO_PREFLIGHT_JXA, EIMZO_TYPIST_JXA } from './jxa.js'
import { runPreflight, runTypist, type SpawnLike } from './typist.js'

/**
 * Types the ERI password into E-IMZO's own dialog via System Events (JXA). The password goes only to the child's
 * stdin — never argv or env. The script's own complaints (osascript's stderr) are read, but only while nothing has
 * been typed yet: from the TYPING marker on, the one thing reported is that a person must look.
 */
export function typeOnDarwin(
  password: string,
  { dialogTimeoutMs, signal, spawn }: { dialogTimeoutMs: number; signal: AbortSignal; spawn: SpawnLike },
): Promise<AutotypeResult> {
  return runTypist(password, {
    dialogTimeoutMs,
    signal,
    spawn,
    typist: { command: 'osascript', args: ['-l', 'JavaScript', '-e', EIMZO_TYPIST_JXA, String(dialogTimeoutMs)] },
  })
}

/** Checks layout, Accessibility/Automation and that no E-IMZO window is open. No password, types nothing. */
export function preflightOnDarwin({ spawn }: { spawn: SpawnLike }): Promise<AutotypePreflightResult> {
  return runPreflight({
    spawn,
    typist: { command: 'osascript', args: ['-l', 'JavaScript', '-e', EIMZO_PREFLIGHT_JXA] },
  })
}
