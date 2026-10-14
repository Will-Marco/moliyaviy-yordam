# Lists every visible top-level window with a title: process, title, window class.
#
# Why it exists: the Windows typist finds E-IMZO's password dialog by window title, and on Windows we have not yet
# seen what E-IMZO actually shows — whether the dialog is the java process's main window or a second one, and what
# its title is. Run this twice during the Windows gate (E-IMZO idle, then with the password dialog open) and the
# titles the app must match are no longer a guess.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File apps\desktop\scripts\list-windows.ps1
#
# Reads only: it opens nothing, closes nothing and types nothing.

$ErrorActionPreference = 'Stop'

Add-Type -Namespace Win -Name Enum -MemberDefinition @'
public delegate bool Proc(IntPtr hWnd, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool EnumWindows(Proc callback, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
'@

$rows = New-Object System.Collections.ArrayList

# $pid is PowerShell's own (read-only) variable, so the window's owner is kept in $owner.
$collect = [Win.Enum+Proc] {
  param($hWnd, $lParam)
  if ([Win.Enum]::IsWindowVisible($hWnd)) {
    $title = New-Object System.Text.StringBuilder 512
    [void][Win.Enum]::GetWindowTextW($hWnd, $title, 512)
    if ($title.Length -gt 0) {
      $class = New-Object System.Text.StringBuilder 256
      [void][Win.Enum]::GetClassNameW($hWnd, $class, 256)
      $owner = 0
      [void][Win.Enum]::GetWindowThreadProcessId($hWnd, [ref]$owner)
      $name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
      [void]$rows.Add([pscustomobject]@{
        Process = $name
        Pid     = $owner
        Title   = $title.ToString()
        Class   = $class.ToString()
      })
    }
  }
  return $true
}

[void][Win.Enum]::EnumWindows($collect, [IntPtr]::Zero)

Write-Output '--- Barcha ko-rinadigan oynalar ---'
$rows | Sort-Object Process | Format-Table -AutoSize

Write-Output '--- Jarayonning asosiy oynasi (ilova hozir shunga qaraydi) ---'
Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object Id, ProcessName, MainWindowTitle |
  Format-Table -AutoSize
