import { CLOSE_WAIT_MS, EXIT, TYPING_MARKER } from './jxa.js'

/*
 * The Windows typist (M8d, plan "Autotype adapterlari"). Same contract as the macOS one: the password arrives on
 * stdin, never on argv or in the environment; the exit code says what happened; the TYPING marker on stdout is the
 * line after which the password may be on screen and a silent death means "interrupted", not "nothing happened".
 *
 * Keys go in with SendInput and KEYEVENTF_UNICODE, which carries the character itself rather than a key position —
 * so, unlike macOS, the keyboard layout cannot turn the password into something else and there is no layout check.
 *
 * Nothing here reads the password back, prints it, or keeps it: it lives in one string until the last character is
 * sent. Windows has no Accessibility permission to ask for; what can still go wrong is the dialog not appearing,
 * the focus moving, or E-IMZO refusing the password — each has its own exit code.
 */

/*
 * How the password dialog is recognised. Measured on a real Windows machine (2026-10-14, Windows gate W0):
 *
 *   - while E-IMZO sits in the tray it has **no visible window at all**;
 *   - when it asks for the key password, a window of its `javaw` process appears — but it is *not* that process's
 *     main window (`MainWindowHandle` is 0 and the process is missing from `Get-Process` main-window listings),
 *     and its title is a countdown ("Отмена через 55 секунд") that changes every second.
 *
 * So the dialog cannot be found by title or by main window. It is found the way macOS finds it: E-IMZO owns no
 * window until it asks for something, so *a visible window of E-IMZO* is the dialog.
 *
 * The password may only ever be typed into a window owned by E-IMZO's own binary, so the owning process must be
 * one of these names *and* live in an E-IMZO directory. A process whose path cannot be read is not E-IMZO as far
 * as this script is concerned: it is left alone, and the run stops rather than typing somewhere unknown.
 */
const EIMZO_PROCESS_NAMES = ['javaw', 'java']
const EIMZO_PATH_PATTERNS = ['*E-IMZO*', '*EIMZO*']

/** Win32 bindings and the E-IMZO window lookup, shared by the typist and the preflight. Reads only. */
const COMMON_PS = String.raw`
$ErrorActionPreference = 'Stop'
# Redirected, PowerShell writes what it says about itself in the console's own code page; the app reads UTF-8.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$EIMZO_NAMES = @(${EIMZO_PROCESS_NAMES.map((n) => `'${n}'`).join(', ')})
$EIMZO_PATHS = @(${EIMZO_PATH_PATTERNS.map((p) => `'${p}'`).join(', ')})

Add-Type -Namespace Win -Name Api -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
[StructLayout(LayoutKind.Explicit, Size = 40)]
public struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT ki; }
[DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint command);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
// SendInput's cbSize, worked out here: PowerShell picks Marshal.SizeOf(object) for a type literal and then fails
// on it ("cannot marshal System.RuntimeType"), which is what stopped the Windows gate. C# has no such doubt.
public static int InputSize() { return Marshal.SizeOf(typeof(INPUT)); }
'@

# The windows are walked with GetTopWindow + GetWindow rather than EnumWindows: EnumWindows needs a callback, and a
# callback means handing PowerShell a delegate for unmanaged code to call back into — one more thing that can fail
# for its own reasons in a script whose job is to type a password. This loop asks the same question with nothing
# but function calls.
$GW_HWNDNEXT = 2
$script:eimzoOwners = @{}
$script:eimzoWindows = New-Object System.Collections.ArrayList

# Is this java process E-IMZO? Its own binary is the first answer; a machine where E-IMZO runs on a system-wide
# Java has that binary outside E-IMZO's folder, and then the command line is what names it. Neither readable means
# "not E-IMZO": nothing is typed into a window whose owner could not be identified.
function Test-EimzoProcess($proc) {
  $path = $null
  try { $path = $proc.Path } catch { $path = $null }
  if ($path) {
    foreach ($pattern in $EIMZO_PATHS) {
      if ($path -like $pattern) { return $true }
    }
  }
  $cmd = $null
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction Stop).CommandLine
  } catch { $cmd = $null }
  if ($cmd) {
    foreach ($pattern in $EIMZO_PATHS) {
      if ($cmd -like $pattern) { return $true }
    }
  }
  return $false
}

# Fills $script:eimzoWindows with E-IMZO's visible windows. Returns nothing: the two helpers below read the list,
# so no pipeline unrolling can turn it into its elements.
function Find-EimzoWindows {
  $script:eimzoOwners = @{}
  foreach ($proc in Get-Process -Name $EIMZO_NAMES -ErrorAction SilentlyContinue) {
    if (Test-EimzoProcess $proc) { $script:eimzoOwners[$proc.Id] = $true }
  }
  $script:eimzoWindows.Clear()
  if ($script:eimzoOwners.Count -eq 0) { return }
  $hWnd = [Win.Api]::GetTopWindow([IntPtr]::Zero)
  while ($hWnd -ne [IntPtr]::Zero) {
    if ([Win.Api]::IsWindowVisible($hWnd)) {
      $owner = 0
      [void][Win.Api]::GetWindowThreadProcessId($hWnd, [ref]$owner)
      if ($script:eimzoOwners.ContainsKey($owner)) { [void]$script:eimzoWindows.Add($hWnd) }
    }
    $hWnd = [Win.Api]::GetWindow($hWnd, $GW_HWNDNEXT)
  }
}

function Get-EimzoWindowCount {
  Find-EimzoWindows
  return $script:eimzoWindows.Count
}

# The dialog's own handle, or IntPtr.Zero.
function Get-EimzoWindowHandle {
  Find-EimzoWindows
  if ($script:eimzoWindows.Count -eq 0) { return [IntPtr]::Zero }
  return [IntPtr]$script:eimzoWindows[0]
}

function Test-Foreground([IntPtr]$hWnd) {
  if ($hWnd -eq [IntPtr]::Zero) { return $false }
  return ([Win.Api]::GetForegroundWindow()) -eq $hWnd
}
`

const TYPIST_PS = String.raw`${COMMON_PS}
$timeoutMs = [int]'__TIMEOUT_MS__'
$EXIT_TYPED = ${EXIT.TYPED}
$EXIT_NO_DIALOG = ${EXIT.NO_DIALOG}
$EXIT_NOT_FOCUSED = ${EXIT.NOT_FOCUSED}
$EXIT_REJECTED = ${EXIT.REJECTED}
$EXIT_FOCUS_LOST = ${EXIT.FOCUS_LOST}
$EXIT_DIALOG_ALREADY_OPEN = ${EXIT.DIALOG_ALREADY_OPEN}
$EXIT_FAILED = ${EXIT.FAILED}

# PowerShell hands out a *copy* of a struct-typed field, so writing through one (an INPUT's .ki.wScan) lands on the
# copy and is lost. The nested struct is therefore built on its own and assigned whole.
$INPUT_SIZE = [Win.Api]::InputSize()

function New-KeyInput([ushort]$vk, [ushort]$scan, [uint32]$flags) {
  $ki = New-Object Win.Api+KEYBDINPUT
  $ki.wVk = $vk
  $ki.wScan = $scan
  $ki.dwFlags = $flags
  $ki.time = 0
  $ki.dwExtraInfo = [IntPtr]::Zero
  $one = New-Object Win.Api+INPUT
  $one.type = 1                        # INPUT_KEYBOARD
  $one.ki = $ki
  return $one
}

function Send-Pair($down, $up) {
  $pair = [Win.Api+INPUT[]]::new(2)
  $pair[0] = $down
  $pair[1] = $up
  return [Win.Api]::SendInput(2, $pair, $INPUT_SIZE)
}

function Send-Char([char]$c) {
  $UNICODE = 0x0004
  $KEYUP = 0x0002
  # KEYEVENTF_UNICODE carries the character in wScan, so the keyboard layout cannot change the password.
  $down = New-KeyInput 0 ([ushort]$c) $UNICODE
  $up = New-KeyInput 0 ([ushort]$c) ($UNICODE -bor $KEYUP)
  if ((Send-Pair $down $up) -ne 2) { exit $EXIT_FAILED }
}

function Send-Key([ushort]$vk) {
  $down = New-KeyInput $vk 0 0
  $up = New-KeyInput $vk 0 0x0002      # KEYUP
  [void](Send-Pair $down $up)
}

# A window that was already open is not ours to type into: the app never types into a dialog it did not expect.
if ((Get-EimzoWindowCount) -gt 0) { exit $EXIT_DIALOG_ALREADY_OPEN }

$password = [Console]::In.ReadToEnd()
if ([string]::IsNullOrEmpty($password)) { exit $EXIT_FAILED }

$deadline = (Get-Date).AddMilliseconds($timeoutMs)
$dialog = [IntPtr]::Zero
while ((Get-Date) -lt $deadline) {
  $dialog = Get-EimzoWindowHandle
  if ($dialog -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 250
}
if ($dialog -eq [IntPtr]::Zero) { exit $EXIT_NO_DIALOG }

[void][Win.Api]::SetForegroundWindow($dialog)
Start-Sleep -Milliseconds 300
if (-not (Test-Foreground $dialog)) { exit $EXIT_NOT_FOCUSED }

# From here the password may reach the screen: the marker tells the app that a silent death is "interrupted".
Write-Output '${TYPING_MARKER}'
foreach ($c in $password.ToCharArray()) {
  if (-not (Test-Foreground $dialog)) { exit $EXIT_FOCUS_LOST }
  Send-Char $c
  Start-Sleep -Milliseconds 40
}
if (-not (Test-Foreground $dialog)) { exit $EXIT_FOCUS_LOST }
Send-Key 0x0D                          # VK_RETURN

# E-IMZO closes its window when the password was right; a window still there means it was refused.
$closeBy = (Get-Date).AddMilliseconds(${CLOSE_WAIT_MS})
while ((Get-Date) -lt $closeBy) {
  if ((Get-EimzoWindowCount) -eq 0) { exit $EXIT_TYPED }
  Start-Sleep -Milliseconds 250
}
if (Test-Foreground $dialog) { Send-Key 0x1B }   # VK_ESCAPE, once
exit $EXIT_REJECTED
`

/**
 * The preflight: everything that can be known before the Didox window opens. Windows asks for no permission to send
 * input and the unicode keystrokes ignore the layout, so only a dialog that is already open can stop a run here.
 */
export const EIMZO_PREFLIGHT_PS = String.raw`${COMMON_PS}
if ((Get-EimzoWindowCount) -gt 0) { exit ${EXIT.DIALOG_ALREADY_OPEN} }
exit ${EXIT.OK}
`

/**
 * PowerShell's `-Command` has no argv of its own, so the one number the typist needs is written into the script.
 * The password never is: it comes on stdin.
 */
export const typistScript = (dialogTimeoutMs: number): string =>
  TYPIST_PS.replace('__TIMEOUT_MS__', String(Math.trunc(dialogTimeoutMs)))
