import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { autotypePreflight, type SpawnLike, typeEimzoPassword } from './index.js'
import { EXIT, READY_MARKER, TYPING_MARKER } from './jxa.js'
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
  watching() {
    this.stdout.emit('data', Buffer.from(`${READY_MARKER}\n`))
  }
  complains(text: string) {
    this.stderr.emit('data', Buffer.from(text))
  }
  says(text: string) {
    this.stdout.emit('data', Buffer.from(`${text}\n`))
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

const typeOnWindows = (spawn: SpawnLike, signal = new AbortController().signal, onReady?: () => void) =>
  typeEimzoPassword(PASSWORD, { dialogTimeoutMs: 20_000, signal, onReady, platform: 'win32', spawn })

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

  /*
   * The script's own diagnostics travel on stdout, and a verdict the app understands must still let them through:
   * the first time the gate hit "a window was already open", the line naming the window was dropped on the floor.
   */
  it('logs what the script printed about a verdict it understands', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { children, spawn } = fakeSpawn()

    const typing = typeOnWindows(spawn)
    children[0]!.says("E-IMZO oynasi: javaw 'Otmena cherez 48 sekund'")
    children[0]!.complains('#< CLIXML\n<Objs Version="1.1.0.1"><Obj S="progress" RefId="0"></Obj></Objs>')
    children[0]!.exit(EXIT.DIALOG_ALREADY_OPEN)

    await expect(typing).resolves.toBe('dialog_already_open')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("javaw 'Otmena cherez 48 sekund'"))
    warn.mockRestore()
  })

  /* The app clicks "Кириш" on this signal; a typist that never says it is watching never gets a click from it. */
  it('tells the app once, when the script says it is watching', async () => {
    const { children, spawn } = fakeSpawn()
    const onReady = vi.fn()

    const typing = typeOnWindows(spawn, undefined, onReady)
    expect(onReady).not.toHaveBeenCalled()
    children[0]!.watching()
    children[0]!.watching()
    children[0]!.startedTyping()
    children[0]!.exit(EXIT.TYPED)

    await expect(typing).resolves.toBe('typed')
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('does not tell the app it is watching when the script stops before that', async () => {
    const { children, spawn } = fakeSpawn()
    const onReady = vi.fn()

    const typing = typeOnWindows(spawn, undefined, onReady)
    children[0]!.exit(EXIT.DIALOG_ALREADY_OPEN)

    await expect(typing).resolves.toBe('dialog_already_open')
    expect(onReady).not.toHaveBeenCalled()
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

  /* After the open-window check and the password, before the wait for the dialog: "Кириш" is clicked on it. */
  it('says it is watching between the open-window check and the wait for the dialog', () => {
    const ready = script.indexOf(`Write-Output '${READY_MARKER}'`)
    expect(ready).toBeGreaterThan(script.indexOf('exit $EXIT_DIALOG_ALREADY_OPEN'))
    expect(ready).toBeGreaterThan(script.indexOf('[Console]::In.ReadToEnd()'))
    expect(ready).toBeLessThan(script.indexOf('$deadline = '))
  })

  /*
   * powershell.exe is Windows PowerShell 5.1, which lacks the short type names PowerShell 7 added — measured on the
   * Windows gate VM. [ushort] killed the typist on its first character, after the TYPING marker, so every login
   * ended "interrupted" with nothing typed.
   */
  it('uses only type names Windows PowerShell 5.1 knows', () => {
    const unknownIn51 = /\[(ushort|uint|ulong|short|semver)\]/
    expect(script).not.toMatch(unknownIn51)
    expect(EIMZO_PREFLIGHT_PS).not.toMatch(unknownIn51)
  })

  /* Lost focus before the first character: nothing typed, so not an interruption that marks the password rejected. */
  it('says it has started only after the first focus check, right before the first character', () => {
    const check = script.indexOf('if (-not (Test-Foreground $dialog)) { if ($started) { exit $EXIT_FOCUS_LOST }; exit $EXIT_NOT_FOCUSED }')
    const marker = script.indexOf(`Write-Output '${TYPING_MARKER}'`)
    expect(check).toBeGreaterThan(0)
    expect(marker).toBeGreaterThan(check)
    expect(marker).toBeLessThan(script.indexOf('Send-Char $c'))
  })

  it('says it has started before any character goes in', () => {
    expect(script.indexOf(`Write-Output '${TYPING_MARKER}'`)).toBeLessThan(script.indexOf('Send-Char $c'))
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

  /*
   * Windows only lets the foreground process move the foreground window, and the typist is a child process, so
   * SetForegroundWindow on its own left E-IMZO's dialog behind the app's window — the gate's dialog appeared and
   * the password went nowhere. The input-queue attach is what borrows that right.
   */
  it('borrows the right to bring the dialog forward, and says who held the focus if it could not', () => {
    expect(script).toContain('AttachThreadInput')
    expect(script).toContain('Fokusda turgan oyna')
  })

  /* Typing still waits on the dialog being in front — the attach only tries to make that true. */
  it('types only once the dialog is really in front', () => {
    expect(script).toMatch(/if \(-not \(Set-Foreground \$dialog\)\) \{/)
    expect(script.indexOf('exit $EXIT_NOT_FOCUSED')).toBeLessThan(script.indexOf(`Write-Output '${TYPING_MARKER}'`))
  })

  it('presses Return once, and Escape only when the password was refused', () => {
    expect(script.split('Send-Key 0x0D')).toHaveLength(2)
    expect(script.split('Send-Key 0x1B')).toHaveLength(2)
  })
})
