# Creates a desktop shortcut to the single MCAI AIO launcher (MCAI.cmd / Node).
# One-time optional helper. Norton may prompt for PowerShell once — that is OK for this script only.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Root) { $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }

$target = Join-Path $Root 'MCAI.cmd'
if (-not (Test-Path -LiteralPath $target)) {
  throw "Missing $target — expected the unified AIO launcher."
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'MCAI.lnk'
$w = New-Object -ComObject WScript.Shell
$sc = $w.CreateShortcut($lnkPath)
$sc.TargetPath = $target
$sc.WorkingDirectory = $Root
$sc.WindowStyle = 1
$sc.Description = 'MCAI All-In-One (Paper + bot + LLM setup)'
$sc.Save()
Write-Host "Desktop shortcut created: $lnkPath"
Write-Host "Target: $target"
