# Creates a Desktop shortcut: "MCAI All-In-One"
[CmdletBinding()]
param(
  [string]$Name = "MCAI All-In-One"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root "MCAI-AIO-Silent.vbs"
if (-not (Test-Path $Target)) {
  $Target = Join-Path $Root "MCAI-AIO.cmd"
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "$Name.lnk"

$Wsh = New-Object -ComObject WScript.Shell
$Sc = $Wsh.CreateShortcut($ShortcutPath)
$Sc.TargetPath = $Target
$Sc.WorkingDirectory = $Root
$Sc.WindowStyle = 1
$Sc.Description = "MCAI: start Paper + AI bot + open Setup GUI"
# Use powershell icon as a stand-in (no custom .ico required)
$Sc.IconLocation = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe,0"
$Sc.Save()

Write-Host "Created: $ShortcutPath"
Write-Host "Double-click it anytime to open the MCAI AIO window."
