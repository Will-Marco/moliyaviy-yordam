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

/** E-IMZO runs on the JRE, so its window belongs to a java process; the title is the stable part. */
const EIMZO_WINDOW_TITLES = ['E-IMZO', 'Kalit parolini kiriting', 'Введите пароль ключа']

const TYPIST_PS = String.raw`
$ErrorActionPreference = 'Stop'
$timeoutMs = [int]'__TIMEOUT_MS__'
$titles = @(${EIMZO_WINDOW_TITLES.map((t) => `'${t}'`).join(', ')})
$EXIT_TYPED = ${EXIT.TYPED}
$EXIT_NO_DIALOG = ${EXIT.NO_DIALOG}
$EXIT_NOT_FOCUSED = ${EXIT.NOT_FOCUSED}
$EXIT_REJECTED = ${EXIT.REJECTED}
$EXIT_FOCUS_LOST = ${EXIT.FOCUS_LOST}
$EXIT_DIALOG_ALREADY_OPEN = ${EXIT.DIALOG_ALREADY_OPEN}
$EXIT_FAILED = ${EXIT.FAILED}

Add-Type -Namespace Win -Name Api -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
[StructLayout(LayoutKind.Explicit, Size = 40)]
public struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT ki; }
[DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder text, int count);
'@

function Get-EimzoWindow {
  foreach ($p in Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }) {
    foreach ($t in $titles) {
      if ($p.MainWindowTitle -and $p.MainWindowTitle.Contains($t)) { return $p }
    }
  }
  return $null
}

function Test-Foreground($proc) {
  if (-not $proc) { return $false }
  return ([Win.Api]::GetForegroundWindow()) -eq $proc.MainWindowHandle
}

function Send-Char([char]$c) {
  $down = New-Object Win.Api+INPUT
  $down.type = 1
  $down.ki.wScan = [ushort]$c
  $down.ki.dwFlags = 0x0004            # KEYEVENTF_UNICODE
  $up = New-Object Win.Api+INPUT
  $up.type = 1
  $up.ki.wScan = [ushort]$c
  $up.ki.dwFlags = 0x0004 -bor 0x0002  # UNICODE | KEYUP
  $sent = [Win.Api]::SendInput(2, @($down, $up), [System.Runtime.InteropServices.Marshal]::SizeOf($down))
  if ($sent -ne 2) { exit $EXIT_FAILED }
}

function Send-Key([ushort]$vk) {
  $down = New-Object Win.Api+INPUT
  $down.type = 1
  $down.ki.wVk = $vk
  $up = New-Object Win.Api+INPUT
  $up.type = 1
  $up.ki.wVk = $vk
  $up.ki.dwFlags = 0x0002              # KEYUP
  [void][Win.Api]::SendInput(2, @($down, $up), [System.Runtime.InteropServices.Marshal]::SizeOf($down))
}

# A window that was already open is not ours to type into: the app never types into a dialog it did not expect.
if (Get-EimzoWindow) { exit $EXIT_DIALOG_ALREADY_OPEN }

$password = [Console]::In.ReadToEnd()
if ([string]::IsNullOrEmpty($password)) { exit $EXIT_FAILED }

$deadline = (Get-Date).AddMilliseconds($timeoutMs)
$proc = $null
while ((Get-Date) -lt $deadline) {
  $proc = Get-EimzoWindow
  if ($proc) { break }
  Start-Sleep -Milliseconds 250
}
if (-not $proc) { exit $EXIT_NO_DIALOG }

[void][Win.Api]::SetForegroundWindow($proc.MainWindowHandle)
Start-Sleep -Milliseconds 300
if (-not (Test-Foreground $proc)) { exit $EXIT_NOT_FOCUSED }

# From here the password may reach the screen: the marker tells the app that a silent death is "interrupted".
Write-Output '${TYPING_MARKER}'
foreach ($c in $password.ToCharArray()) {
  if (-not (Test-Foreground $proc)) { exit $EXIT_FOCUS_LOST }
  Send-Char $c
  Start-Sleep -Milliseconds 40
}
if (-not (Test-Foreground $proc)) { exit $EXIT_FOCUS_LOST }
Send-Key 0x0D                          # VK_RETURN

# E-IMZO closes its window when the password was right; a window still there means it was refused.
Start-Sleep -Milliseconds ${CLOSE_WAIT_MS}
$still = Get-EimzoWindow
if (-not $still) { exit $EXIT_TYPED }
if (Test-Foreground $still) { Send-Key 0x1B }   # VK_ESCAPE, once
exit $EXIT_REJECTED
`

/**
 * The preflight: everything that can be known before the Didox window opens. Windows asks for no permission to send
 * input and the unicode keystrokes ignore the layout, so only a dialog that is already open can stop a run here.
 */
export const EIMZO_PREFLIGHT_PS = String.raw`
$ErrorActionPreference = 'Stop'
$titles = @(${EIMZO_WINDOW_TITLES.map((t) => `'${t}'`).join(', ')})
foreach ($p in Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }) {
  foreach ($t in $titles) {
    if ($p.MainWindowTitle -and $p.MainWindowTitle.Contains($t)) { exit ${EXIT.DIALOG_ALREADY_OPEN} }
  }
}
exit ${EXIT.OK}
`

/**
 * PowerShell's `-Command` has no argv of its own, so the one number the typist needs is written into the script.
 * The password never is: it comes on stdin.
 */
export const typistScript = (dialogTimeoutMs: number): string =>
  TYPIST_PS.replace('__TIMEOUT_MS__', String(Math.trunc(dialogTimeoutMs)))
