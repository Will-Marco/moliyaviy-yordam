import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AutotypePreflightResult, AutotypeResult } from '../contract.js'
import type { ChildLike, SpawnLike } from './darwin.js'
import { AutotypeCancelledError, autotypePreflight, typeEimzoPassword } from './index.js'
import { EIMZO_PREFLIGHT_JXA, EIMZO_TYPIST_JXA, EXIT, READY_MARKER, TYPING_MARKER } from './jxa.js'

const PASSWORD = 'Sir-parol 123'

/** A fake osascript child; `exit` ends it the way the real process would, `typing` prints the marker. */
class FakeChild extends EventEmitter implements ChildLike {
  readonly writes: string[] = []
  ended = 0
  killed: NodeJS.Signals | undefined
  readonly stdin = Object.assign(new EventEmitter(), {
    write: (chunk: string) => this.writes.push(chunk),
    end: () => this.ended++,
  })
  readonly stdout = new EventEmitter()
  kill(signal?: NodeJS.Signals) {
    this.killed = signal
    return true
  }
  typing() {
    this.stdout.emit('data', Buffer.from(`${TYPING_MARKER}\n`))
  }
  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.emit('close', code, signal)
  }
}

function fakeSpawn() {
  const child = new FakeChild()
  const calls: { command: string; args: readonly string[]; options: unknown }[] = []
  const spawn: SpawnLike = (command, args, options) => {
    calls.push({ command, args, options })
    return child
  }
  return { child, calls, spawn }
}

function start(opts: { dialogTimeoutMs?: number; signal?: AbortSignal } = {}) {
  const fake = fakeSpawn()
  const pending = typeEimzoPassword(PASSWORD, {
    dialogTimeoutMs: opts.dialogTimeoutMs ?? 20_000,
    signal: opts.signal ?? new AbortController().signal,
    platform: 'darwin',
    spawn: fake.spawn,
  })
  return { ...fake, pending }
}

async function runWithExit(code: number | null, { typed = false, signal = null as NodeJS.Signals | null } = {}) {
  const { child, pending } = start()
  if (typed) child.typing()
  child.exit(code, signal)
  return pending
}

afterEach(() => {
  vi.useRealTimers()
})

describe('typeEimzoPassword on macOS', () => {
  it('writes the password to stdin exactly once and closes it', async () => {
    const { child, pending } = start()
    child.typing()
    child.exit(EXIT.TYPED)

    await expect(pending).resolves.toBe('typed')
    expect(child.writes).toEqual([PASSWORD])
    expect(child.ended).toBe(1)
  })

  it('runs the JXA typist with only the timeout on argv — never the password', async () => {
    const { child, calls, pending } = start({ dialogTimeoutMs: 45_000 })
    child.typing()
    child.exit(EXIT.TYPED)
    await pending

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.command).toBe('osascript')
    expect(call.args).toEqual(['-l', 'JavaScript', '-e', EIMZO_TYPIST_JXA, '45000'])
    expect(call.args.some((a) => a.includes(PASSWORD))).toBe(false)
    expect(JSON.stringify(call.options)).not.toContain(PASSWORD)
    // stderr is read so a script that dies on its own terms can say why; it is dropped once typing has started.
    expect(call.options).toEqual({ stdio: ['pipe', 'pipe', 'pipe'] })
  })

  it.each<[number, AutotypeResult]>([
    [10, 'no_dialog'],
    [11, 'not_focused'],
    [13, 'layout'],
    [14, 'no_permission'],
    [16, 'dialog_already_open'],
  ])('before typing maps exit code %i to %s', async (code, result) => {
    await expect(runWithExit(code)).resolves.toBe(result)
  })

  it.each<[number, AutotypeResult]>([
    [0, 'typed'],
    [12, 'rejected'],
    // The script exits with NO_PERMISSION after the marker only when macOS refused the very first keystroke: nothing
    // reached the dialog, so the password is not to be marked rejected (2026-10-16: a refused keystroke did exactly that).
    [14, 'no_permission'],
    [15, 'interrupted'],
    [20, 'interrupted'],
    [1, 'interrupted'],
    [11, 'interrupted'],
    [99, 'interrupted'],
  ])('after the TYPING marker maps exit code %i to %s', async (code, result) => {
    await expect(runWithExit(code, { typed: true })).resolves.toBe(result)
  })

  it('a marker split across stdout chunks still counts', async () => {
    const { child, pending } = start()
    child.stdout.emit('data', 'TYP')
    child.stdout.emit('data', 'ING\n')
    child.exit(EXIT.FAILED)
    await expect(pending).resolves.toBe('interrupted')
  })

  it('after the marker a signal death is interrupted, not an error', async () => {
    await expect(runWithExit(null, { typed: true, signal: 'SIGTERM' })).resolves.toBe('interrupted')
  })

  it.each([
    [0, 'kod 0'],
    [12, 'kod 12'],
    [1, 'kod 1'],
    [20, 'kod 20'],
    [99, 'kod 99'],
  ])('before the marker exit code %i throws without the password in the message', async (code, fragment) => {
    const error = await runWithExit(code).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(fragment)
    expect((error as Error).message).not.toContain(PASSWORD)
  })

  it('before the marker a signal death throws', async () => {
    await expect(runWithExit(null, { signal: 'SIGTERM' })).rejects.toThrow('SIGTERM')
  })

  it('throws on a spawn error, and the message does not carry the password', async () => {
    const { child, pending } = start()
    child.emit('error', new Error(`spawn osascript ENOENT ${PASSWORD}`))

    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain(PASSWORD)
  })

  it('throws when spawn itself throws, without the password', async () => {
    const spawn: SpawnLike = () => {
      throw new Error(`bad ${PASSWORD}`)
    }
    const error = await typeEimzoPassword(PASSWORD, {
      dialogTimeoutMs: 20_000,
      signal: new AbortController().signal,
      platform: 'darwin',
      spawn,
    }).catch((e: unknown) => e)
    expect((error as Error).message).not.toContain(PASSWORD)
  })

  it('survives EPIPE when the script exits before reading stdin', async () => {
    const { child, pending } = start()
    child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
    child.exit(EXIT.LAYOUT)

    await expect(pending).resolves.toBe('layout')
  })

  it('kills a stuck typist and throws when typing had not started', async () => {
    vi.useFakeTimers()
    const { child, pending } = start({ dialogTimeoutMs: 1_000 })
    const settled = pending.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(child.killed).toBe('SIGKILL')
    expect(await settled).toBeInstanceOf(Error)
  })

  it('kills a typist stuck after the marker and reports interrupted', async () => {
    vi.useFakeTimers()
    const { child, pending } = start({ dialogTimeoutMs: 1_000 })
    child.typing()
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(child.killed).toBe('SIGKILL')
    await expect(pending).resolves.toBe('interrupted')
  })

  it('an already aborted signal never spawns', async () => {
    const controller = new AbortController()
    controller.abort()
    const { calls, spawn } = fakeSpawn()
    await expect(
      typeEimzoPassword(PASSWORD, { dialogTimeoutMs: 20_000, signal: controller.signal, platform: 'darwin', spawn }),
    ).rejects.toBeInstanceOf(AutotypeCancelledError)
    expect(calls).toHaveLength(0)
  })

  it('aborting before the marker kills the typist and rejects as cancelled', async () => {
    const controller = new AbortController()
    const { child, pending } = start({ signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(AutotypeCancelledError)
    expect(child.killed).toBe('SIGKILL')
  })

  it('aborting after the marker lets the typist finish', async () => {
    const controller = new AbortController()
    const { child, pending } = start({ signal: controller.signal })
    child.typing()
    controller.abort()
    expect(child.killed).toBeUndefined()
    child.exit(EXIT.TYPED)

    await expect(pending).resolves.toBe('typed')
  })

  it('refuses an empty password or a bad timeout without spawning', async () => {
    const { calls, spawn } = fakeSpawn()
    const signal = new AbortController().signal
    await expect(typeEimzoPassword('', { dialogTimeoutMs: 20_000, signal, platform: 'darwin', spawn })).rejects.toThrow()
    await expect(typeEimzoPassword(PASSWORD, { dialogTimeoutMs: 0, signal, platform: 'darwin', spawn })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('typeEimzoPassword elsewhere', () => {
  it('throws on a platform with no typist, without spawning anything', async () => {
    const { calls, spawn } = fakeSpawn()
    const signal = new AbortController().signal
    await expect(
      typeEimzoPassword(PASSWORD, { dialogTimeoutMs: 20_000, signal, platform: 'linux', spawn }),
    ).rejects.toThrow('linux')
    expect(calls).toHaveLength(0)
  })
})

describe('autotypePreflight', () => {
  it.each<[number, AutotypePreflightResult]>([
    [0, 'ok'],
    [13, 'layout'],
    [14, 'no_permission'],
    [16, 'dialog_already_open'],
  ])('maps exit code %i to %s', async (code, result) => {
    const { child, calls, spawn } = fakeSpawn()
    const pending = autotypePreflight({ platform: 'darwin', spawn })
    child.exit(code)

    await expect(pending).resolves.toBe(result)
    expect(calls[0]!.args).toEqual(['-l', 'JavaScript', '-e', EIMZO_PREFLIGHT_JXA])
    expect(calls[0]!.options).toEqual({ stdio: ['ignore', 'ignore', 'pipe'] })
  })

  it('throws on an unknown exit or a spawn error', async () => {
    const a = fakeSpawn()
    const first = autotypePreflight({ platform: 'darwin', spawn: a.spawn })
    a.child.exit(20)
    await expect(first).rejects.toThrow('kod 20')

    const b = fakeSpawn()
    const second = autotypePreflight({ platform: 'darwin', spawn: b.spawn })
    b.child.emit('error', new Error('ENOENT'))
    await expect(second).rejects.toThrow()
  })

  it('is unsupported on a platform with no typist, without spawning', async () => {
    const { calls, spawn } = fakeSpawn()
    await expect(autotypePreflight({ platform: 'linux', spawn })).resolves.toBe('unsupported')
    expect(calls).toHaveLength(0)
  })
})

describe('JXA scripts', () => {
  const count = (script: string, s: string) => script.split(s).length - 1

  it('typist reads the password from stdin and embeds the exit codes it is mapped by', () => {
    expect(EIMZO_TYPIST_JXA).toContain('fileHandleWithStandardInput.readDataToEndOfFile')
    expect(EIMZO_TYPIST_JXA).toContain(JSON.stringify(EXIT))
  })

  it('typist refuses a window that was open before arming and waits for a new one', () => {
    expect(EIMZO_TYPIST_JXA).toContain('if (baseline > 0) return EXIT.DIALOG_ALREADY_OPEN')
    expect(EIMZO_TYPIST_JXA).toContain('windowCount(se) > baseline')
    expect(EIMZO_TYPIST_JXA).toContain('windowCount(se) <= baseline')
  })

  /* "Кириш" is clicked on this line: it must come after the open-window check and before the wait for a new one. */
  it('typist says it is watching between the open-window check and the wait for the dialog', () => {
    const ready = EIMZO_TYPIST_JXA.indexOf(`writeStdout('${READY_MARKER}\\n')`)
    expect(ready).toBeGreaterThan(EIMZO_TYPIST_JXA.indexOf('if (baseline > 0) return EXIT.DIALOG_ALREADY_OPEN'))
    expect(ready).toBeLessThan(EIMZO_TYPIST_JXA.indexOf('windowCount(se) > baseline'))
  })

  it('typist prints the marker, then types char by char with a focus check before each and before Return', () => {
    const script = EIMZO_TYPIST_JXA
    expect(count(script, 'se.keystroke(')).toBe(1)
    expect(count(script, 'se.keyCode(36)')).toBe(1)
    expect(count(script, 'se.keyCode(53)')).toBe(1) // only inside escapeOnce
    expect(script).toContain('if (escaped || frontmostName(se) !== PROCESS) return')
    const marker = script.indexOf(`writeStdout('${TYPING_MARKER}\\n')`)
    const loop = script.indexOf('se.keystroke(chars[i])')
    expect(marker).toBeGreaterThan(0)
    expect(loop).toBeGreaterThan(marker)
    expect(script.indexOf('se.keyCode(36)')).toBeGreaterThan(script.lastIndexOf('return focusLost(se)'))
  })

  /*
   * The marker means "the password may be on screen". Printed before the first focus check, a focus or permission
   * failure before any key was sent read as an interrupted typing, and the app marked a correct password rejected.
   */
  it('typist prints the marker only once the first focus check passed, right before the first keystroke', () => {
    const script = EIMZO_TYPIST_JXA
    const loopCheck = script.indexOf('if (!focusedOnPassword(se, proc)) return typing ? focusLost(se) : EXIT.NOT_FOCUSED')
    const marker = script.indexOf(`writeStdout('${TYPING_MARKER}\\n')`)
    expect(loopCheck).toBeGreaterThan(0)
    expect(marker).toBeGreaterThan(loopCheck)
    expect(marker).toBeLessThan(script.indexOf('se.keystroke(chars[i])'))
  })

  it('typist reports a refused first keystroke as missing permission, not as an interruption', () => {
    expect(EIMZO_TYPIST_JXA).toContain('if (sent === 0 && isPermissionError(e)) code = EXIT.NO_PERMISSION')
  })

  it('preflight types nothing and reads no stdin', () => {
    expect(EIMZO_PREFLIGHT_JXA).not.toMatch(/keystroke\(|keyCode\(|StandardInput/)
  })
})
