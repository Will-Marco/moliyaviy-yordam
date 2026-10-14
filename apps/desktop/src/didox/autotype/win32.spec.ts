import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { autotypePreflight, type SpawnLike, typeEimzoPassword } from './index.js'
import { EXIT, TYPING_MARKER } from './jxa.js'
import { EIMZO_PREFLIGHT_PS, typistScript } from './powershell.js'
import { encodeCommand } from './win32.js'

/*
 * The Windows typist is driven on a fake child: what matters here is the contract it is spoken to with — the
 * password only on stdin, the timeout inside the script, and the same exit codes meaning the same things as on
 * macOS. Whether PowerShell itself does the right thing is for the Windows gate on a real machine.
 */

const PASSWORD = 'Maxfiy-1'

class FakeChild extends EventEmitter {
  written: string[] = []
  killed = false
  stdin = {
    write: (chunk: string) => void this.written.push(chunk),
    end: () => undefined,
    on: () => undefined,
  }
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill(): boolean {
    this.killed = true
    return true
  }
  startedTyping() {
    this.stdout.emit('data', Buffer.from(`${TYPING_MARKER}\n`))
  }
  complains(text: string) {
    this.stderr.emit('data', Buffer.from(text))
  }
  exit(code: number | null) {
    this.emit('close', code, null)
  }
}

function fakeSpawn() {
  const calls: { command: string; args: readonly string[] }[] = []
  const children: FakeChild[] = []
  const spawn: SpawnLike = (command, args) => {
    calls.push({ command, args })
    const child = new FakeChild()
    children.push(child)
    return child as unknown as ReturnType<SpawnLike>
  }
  return { calls, children, spawn }
}

const typeOnWindows = (spawn: SpawnLike, signal = new AbortController().signal) =>
  typeEimzoPassword(PASSWORD, { dialogTimeoutMs: 20_000, signal, platform: 'win32', spawn })

describe('the Windows typist', () => {
  it('runs PowerShell with the script, and never the password on the command line', async () => {
    const { calls, children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.startedTyping()
    children[0]!.exit(EXIT.TYPED)
    await typing

    expect(calls[0]?.command).toBe('powershell.exe')
    expect(calls[0]?.args.join(' ')).not.toContain(PASSWORD)
    expect(calls[0]?.args).toContain('-NonInteractive')
    // The script travels encoded, so PowerShell has no raw command line to re-parse (and no quotes to lose).
    expect(calls[0]?.args.at(-1)).toBe(encodeCommand(typistScript(20_000)))
  })

  it('passes the password on stdin, once', async () => {
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.startedTyping()
    children[0]!.exit(EXIT.TYPED)
    await typing

    expect(children[0]?.written).toEqual([PASSWORD])
  })

  it.each([
    [EXIT.NO_DIALOG, 'no_dialog'],
    [EXIT.NOT_FOCUSED, 'not_focused'],
    [EXIT.DIALOG_ALREADY_OPEN, 'dialog_already_open'],
  ] as const)('reports what the script says before it types (%i)', async (code, result) => {
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.exit(code)

    await expect(typing).resolves.toBe(result)
  })

  it.each([
    [EXIT.TYPED, 'typed'],
    [EXIT.REJECTED, 'rejected'],
  ] as const)('reports what it says after typing started (%i)', async (code, result) => {
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.startedTyping()
    children[0]!.exit(code)

    await expect(typing).resolves.toBe(result)
  })

  /* Once the password may be on screen, an unexplained end is never "nothing happened". */
  it('calls an unexplained end after typing an interruption', async () => {
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.startedTyping()
    children[0]!.exit(EXIT.FOCUS_LOST)

    await expect(typing).resolves.toBe('interrupted')
  })

  /*
   * PowerShell ends with its own exit code 1 when something in the script fails, and the Windows gate met exactly
   * that: a number with no story. What it printed about itself is part of the message now.
   */
  it('says what the script complained about when it died on its own terms', async () => {
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.complains("Add-Type : Cannot add type.\nAt line:6 char:1")
    children[0]!.exit(1)

    await expect(typing).rejects.toThrow(/Cannot add type/)
  })

  /*
   * What PowerShell says about itself arrives wrapped in CLIXML when stderr is redirected (the Windows gate's
   * first readable failure came out of exactly this envelope). The message has to survive the unwrapping.
   */
  it('reads the message out of PowerShell\'s CLIXML envelope', async () => {
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.complains(
      '#< CLIXML\n<Objs Version="1.1.0.1"><Obj S="progress" RefId="0"><TN RefId="0"><T>PSCustomObject</T></TN></Obj>' +
        '<S S="Error">Isklyuchenie pri vyzove &quot;SizeOf&quot;_x000D__x000A_</S>' +
        '<S S="Error">stroka:99 znak:1_x000D__x000A_</S></Objs>',
    )
    children[0]!.exit(1)

    await expect(typing).rejects.toThrow(/Isklyuchenie pri vyzove "SizeOf" stroka:99/)
  })

  /* Once the password may be on screen, the only thing reported is that a person must look — not a stray message. */
  it('keeps a complaint out of the way once typing has started', async () => {
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.startedTyping()
    children[0]!.complains('nimadir')
    children[0]!.exit(1)

    await expect(typing).resolves.toBe('interrupted')
  })

  it('kills the typist when the run is cancelled before it types', async () => {
    const controller = new AbortController()
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn, controller.signal)
    controller.abort()

    await expect(typing).rejects.toMatchObject({ name: 'AutotypeCancelledError' })
    expect(children[0]?.killed).toBe(true)
  })

  it('lets a cancel pass once the password is going in', async () => {
    const controller = new AbortController()
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn, controller.signal)
    children[0]!.startedTyping()
    controller.abort()
    children[0]!.exit(EXIT.TYPED)

    await expect(typing).resolves.toBe('typed')
  })
})

describe('the Windows preflight', () => {
  it('asks PowerShell only whether a dialog is already open', async () => {
    const { calls, children, spawn } = fakeSpawn()

    const check = autotypePreflight({ platform: 'win32', spawn })
    children[0]!.exit(EXIT.OK)

    await expect(check).resolves.toBe('ok')
    expect(calls[0]?.args.at(-1)).toBe(encodeCommand(EIMZO_PREFLIGHT_PS))
  })

  it('looks for the dialog exactly the way the typist does', () => {
    expect(EIMZO_PREFLIGHT_PS).toContain('Find-EimzoWindows')
    expect(EIMZO_PREFLIGHT_PS).toContain('Get-EimzoWindowCount')
    expect(typistScript(20_000)).toContain('Find-EimzoWindows')
  })

  it('refuses to start while an E-IMZO window is open', async () => {
    const { children, spawn } = fakeSpawn()

    const check = autotypePreflight({ platform: 'win32', spawn })
    children[0]!.exit(EXIT.DIALOG_ALREADY_OPEN)

    await expect(check).resolves.toBe('dialog_already_open')
  })

  /* Windows needs no Accessibility grant and its unicode keystrokes ignore the layout (plan, "Autotype adapterlari"). */
  it('never answers with the macOS-only verdicts', async () => {
    expect(EIMZO_PREFLIGHT_PS).not.toContain('layout')
    expect(EIMZO_PREFLIGHT_PS).not.toContain('Accessibility')
  })
})

describe('the PowerShell script', () => {
  const script = typistScript(20_000)

  it('takes the password from stdin and nothing else', () => {
    expect(script).toContain('[Console]::In.ReadToEnd()')
    expect(script).not.toContain('$args')
  })

  it('carries the timeout it was built with', () => {
    expect(script).toContain('20000')
    expect(typistScript(5_000)).toContain('5000')
  })

  it('types the character itself, so the keyboard layout cannot change the password', () => {
    expect(script).toContain('0x0004') // KEYEVENTF_UNICODE
    expect(script).toContain('SendInput')
  })

  it('says it has started before any character goes in', () => {
    expect(script.indexOf(TYPING_MARKER)).toBeLessThan(script.indexOf('Send-Char $c'))
  })

  it('embeds the exit codes it is read by', () => {
    for (const code of [EXIT.NO_DIALOG, EXIT.NOT_FOCUSED, EXIT.REJECTED, EXIT.FOCUS_LOST, EXIT.DIALOG_ALREADY_OPEN]) {
      expect(script).toContain(String(code))
    }
  })

  /*
   * PowerShell returns a copy of a struct-typed field, so `$input.ki.wScan = x` writes to the copy: SendInput would
   * then send a keystroke carrying no character at all, and the password would never reach E-IMZO.
   */
  it('never writes through a struct field, because PowerShell would lose it', () => {
    expect(script).not.toMatch(/\$\w+\.ki\.\w+\s*=/)
    expect(script).toContain('$one.ki = $ki')
  })

  /*
   * Measured on a real Windows machine (gate W0, 2026-10-14): E-IMZO has no visible window until it asks for the
   * key password, the dialog is not its process's main window, and its title counts seconds down
   * ("Отмена через 55 секунд"). So neither the title nor the main window can find it.
   */
  it('finds the dialog by E-IMZO having a visible window at all', () => {
    expect(script).not.toContain('MainWindowTitle')
    expect(script).not.toContain('MainWindowHandle')
    expect(script).toContain('GetTopWindow')
    expect(script).toContain('IsWindowVisible')
  })

  /*
   * E-IMZO keeps visible windows of its own with no title (a Java app's tray-icon frame among them). Counting
   * those as the password dialog made every run refuse to start — "E-IMZO'da ochiq oyna bor" — so a window only
   * counts once it has a title, which is what the W0 measurement actually showed.
   */
  it('counts only a window that has a title', () => {
    expect(script).toContain('GetWindowTextLengthW')
    expect(script).toMatch(/IsWindowVisible\(\$hWnd\) -and/)
  })

  /* The password goes into a window of E-IMZO's own process, or nowhere: an unidentified owner stops the run. */
  it('types only into a window it could tie to E-IMZO', () => {
    expect(script).toContain('Test-EimzoProcess')
    expect(script).toContain('E-IMZO')
  })

  it('presses Return once, and Escape only when the password was refused', () => {
    expect(script.split('Send-Key 0x0D')).toHaveLength(2)
    expect(script.split('Send-Key 0x1B')).toHaveLength(2)
  })
})
