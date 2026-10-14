import type { AutotypePreflightResult, AutotypeResult } from '../contract.js'
import { CLOSE_WAIT_MS, EXIT, TYPING_MARKER } from './jxa.js'

/*
 * Running one typist, whatever writes it. macOS drives System Events through JXA and Windows drives SendInput
 * through PowerShell, but the contract they answer on is the same — password on stdin, meaning in the exit code,
 * and a marker on stdout after which the password may already be on screen — so the part that is easy to get
 * subtly wrong lives here once.
 */

/** The part of a child process the scripts use; node's ChildProcess fits it. */
export interface ChildLike {
  stdin: { write(chunk: string): unknown; end(): unknown; on(event: 'error', listener: (err: Error) => void): unknown } | null
  stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

/** `child_process.spawn`, narrowed so tests can pass a fake. */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: { stdio: ['pipe' | 'ignore', 'pipe' | 'ignore', 'ignore'] },
) => ChildLike

/** The run was cancelled before typing started: nothing was typed and the typist was killed. */
export class AutotypeCancelledError extends Error {
  constructor() {
    super('Bekor qilindi')
    this.name = 'AutotypeCancelledError'
  }
}

/** Results the typist reports before it types anything. */
const BEFORE_TYPING: Readonly<Record<number, AutotypeResult>> = {
  [EXIT.NO_DIALOG]: 'no_dialog',
  [EXIT.NOT_FOCUSED]: 'not_focused',
  [EXIT.LAYOUT]: 'layout',
  [EXIT.NO_PERMISSION]: 'no_permission',
  [EXIT.DIALOG_ALREADY_OPEN]: 'dialog_already_open',
}

/** Once typing started only these are confirmed; anything else is `interrupted`. */
const AFTER_TYPING: Readonly<Record<number, AutotypeResult>> = {
  [EXIT.TYPED]: 'typed',
  [EXIT.REJECTED]: 'rejected',
}

const PREFLIGHT: Readonly<Record<number, AutotypePreflightResult>> = {
  [EXIT.OK]: 'ok',
  [EXIT.LAYOUT]: 'layout',
  [EXIT.NO_PERMISSION]: 'no_permission',
  [EXIT.DIALOG_ALREADY_OPEN]: 'dialog_already_open',
}

/** Slack on top of the script's own waits before the child is considered stuck and killed. */
const KILL_MARGIN_MS = 30_000
/** Per character the typist re-checks the focus; generous so a long password is not cut off by the kill timer. */
const PER_CHAR_MS = 1_000
const MAX_PASSWORD_CHARS = 256
const PREFLIGHT_TIMEOUT_MS = 15_000

export interface TypistCommand {
  command: string
  args: readonly string[]
}

/**
 * Types `password` with the given typist. Aborting `signal` before typing started kills it and rejects with
 * AutotypeCancelledError; after that the child runs to the end, because a half-typed password must be reported.
 */
export function runTypist(
  password: string,
  {
    dialogTimeoutMs,
    signal,
    spawn,
    typist,
  }: { dialogTimeoutMs: number; signal: AbortSignal; spawn: SpawnLike; typist: TypistCommand },
): Promise<AutotypeResult> {
  if (!password) return Promise.reject(new Error("ERI paroli bo'sh"))
  if (password.length > MAX_PASSWORD_CHARS) return Promise.reject(new Error('ERI paroli juda uzun'))
  if (!Number.isInteger(dialogTimeoutMs) || dialogTimeoutMs <= 0) {
    return Promise.reject(new Error("E-IMZO oynasini kutish vaqti noto'g'ri"))
  }
  if (signal.aborted) return Promise.reject(new AutotypeCancelledError())

  return new Promise((ok, fail) => {
    let typing = false
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const onAbort = () => {
      if (typing) return // already typing: let it run to the end
      child.kill('SIGKILL')
      settle(() => fail(new AutotypeCancelledError()))
    }
    const settle = (outcome: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      outcome()
    }
    /** Before typing: an Error with `message`. After: `interrupted`, the login must be looked at by a person. */
    const unconfirmed = (message: string) =>
      settle(() => (typing ? ok('interrupted') : fail(new Error(message))))

    let child: ChildLike
    try {
      child = spawn(typist.command, typist.args, { stdio: ['pipe', 'pipe', 'ignore'] })
    } catch {
      return fail(new Error("E-IMZO parol yozuvchisini ishga tushirib bo'lmadi"))
    }

    timer = setTimeout(
      () => {
        child.kill('SIGKILL')
        unconfirmed('E-IMZO parol yozuvchisi javob bermadi')
      },
      dialogTimeoutMs + password.length * PER_CHAR_MS + CLOSE_WAIT_MS + KILL_MARGIN_MS,
    )
    signal.addEventListener('abort', onAbort, { once: true })

    let out = ''
    child.stdout?.on('data', (chunk) => {
      out += String(chunk)
      if (out.includes(TYPING_MARKER)) typing = true
    })
    child.on('error', () => unconfirmed("E-IMZO parol yozuvchisini ishga tushirib bo'lmadi"))
    child.on('close', (code, exitSignal) => {
      const result = code === null ? undefined : (typing ? AFTER_TYPING : BEFORE_TYPING)[code]
      if (result) return settle(() => ok(result))
      unconfirmed(`E-IMZO parol yozuvchisi kutilmagan holatda tugadi (${exitSignal ?? `kod ${code}`})`)
    })

    // An early exit (e.g. a dialog that was already open) closes the pipe; EPIPE is then expected and ignored.
    child.stdin?.on('error', () => undefined)
    if (!child.stdin) {
      child.kill('SIGKILL')
      return settle(() => fail(new Error("E-IMZO parol yozuvchisiga ulanib bo'lmadi")))
    }
    child.stdin.write(password)
    child.stdin.end()
  })
}

/** Runs a preflight script: reads only, types nothing, and answers with one of the preflight verdicts. */
export function runPreflight({ spawn, typist }: { spawn: SpawnLike; typist: TypistCommand }): Promise<AutotypePreflightResult> {
  return new Promise((ok, fail) => {
    let settled = false
    const settle = (outcome: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      outcome()
    }
    let child: ChildLike
    try {
      child = spawn(typist.command, typist.args, { stdio: ['ignore', 'ignore', 'ignore'] })
    } catch {
      return fail(new Error("E-IMZO tekshiruvini ishga tushirib bo'lmadi"))
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      settle(() => fail(new Error('E-IMZO tekshiruvi javob bermadi')))
    }, PREFLIGHT_TIMEOUT_MS)
    child.on('error', () => settle(() => fail(new Error("E-IMZO tekshiruvini ishga tushirib bo'lmadi"))))
    child.on('close', (code, exitSignal) => {
      const result = code === null ? undefined : PREFLIGHT[code]
      if (result) return settle(() => ok(result))
      settle(() => fail(new Error(`E-IMZO tekshiruvi kutilmagan holatda tugadi (${exitSignal ?? `kod ${code}`})`)))
    })
  })
}
