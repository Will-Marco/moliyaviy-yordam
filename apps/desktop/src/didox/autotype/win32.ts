import type { AutotypePreflightResult, AutotypeResult } from '../contract.js'
import { EIMZO_PREFLIGHT_PS, typistScript } from './powershell.js'
import { runPreflight, runTypist, type SpawnLike } from './typist.js'

/*
 * The Windows typist (M8d). Same promises as the macOS one, kept by different machinery: PowerShell sends the
 * characters with SendInput and KEYEVENTF_UNICODE, which carries the character rather than a key position — so
 * the keyboard layout cannot change the password and, unlike macOS, there is nothing to check about it and no
 * Accessibility permission to be granted.
 *
 * The password reaches the script on stdin only. Nothing about it is ever on the command line, where another user
 * of the machine could read it out of the process list.
 */

const POWERSHELL = 'powershell.exe'
/** No profile, no prompts, and the machine's execution policy does not decide whether the accountant can log in. */
const PS_FLAGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'] as const

/**
 * `-EncodedCommand` takes the script as base64 UTF-16LE. The scripts hold double quotes (the C# that declares
 * SendInput) and newlines, and `-Command` would hand those to PowerShell's own re-parsing of the raw command
 * line — encoding leaves nothing to re-parse and nothing to quote.
 */
export const encodeCommand = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')

export function typeOnWindows(
  password: string,
  { dialogTimeoutMs, signal, spawn, onReady }: { dialogTimeoutMs: number; signal: AbortSignal; spawn: SpawnLike; onReady?: () => void },
): Promise<AutotypeResult> {
  return runTypist(password, {
    dialogTimeoutMs,
    signal,
    spawn,
    onReady,
    typist: { command: POWERSHELL, args: [...PS_FLAGS, encodeCommand(typistScript(dialogTimeoutMs))] },
  })
}

/** Reads only: whether an E-IMZO window is already open. Types nothing and carries no password. */
export function preflightOnWindows({ spawn }: { spawn: SpawnLike }): Promise<AutotypePreflightResult> {
  return runPreflight({ spawn, typist: { command: POWERSHELL, args: [...PS_FLAGS, encodeCommand(EIMZO_PREFLIGHT_PS)] } })
}
