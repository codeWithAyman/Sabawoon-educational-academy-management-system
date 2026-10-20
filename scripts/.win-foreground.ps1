# Restores + foregrounds a window by PID so Chromium marks the page visible.
param([int]$ProcId)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAct {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$p = Get-Process -Id $ProcId -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq 0) { Write-Output "NO-HANDLE"; exit 1 }

$r = New-Object WinAct+RECT
[WinAct]::GetWindowRect($h, [ref]$r) | Out-Null
Write-Output ("rect: " + $r.Left + "," + $r.Top + " -> " + $r.Right + "," + $r.Bottom + " iconic=" + [WinAct]::IsIconic($h))

# SW_RESTORE = 9 (also un-minimizes)
[WinAct]::ShowWindow($h, 9) | Out-Null

# Foreground-lock bypass: attach our input queue to the current foreground window's thread.
$fg = [WinAct]::GetForegroundWindow()
$fgThread = [WinAct]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
$myThread = [WinAct]::GetCurrentThreadId()
if ($fgThread -ne $myThread) { [WinAct]::AttachThreadInput($myThread, $fgThread, $true) | Out-Null }
[WinAct]::BringWindowToTop($h) | Out-Null
$ok = [WinAct]::SetForegroundWindow($h)
if ($fgThread -ne $myThread) { [WinAct]::AttachThreadInput($myThread, $fgThread, $false) | Out-Null }

Write-Output ("SetForegroundWindow=" + $ok + " fg=" + [WinAct]::GetForegroundWindow())
