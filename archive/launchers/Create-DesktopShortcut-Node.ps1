# Desktop shortcut for Norton-safe Node launcher (no PowerShell at runtime)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root "MCAI-AIO-Node.cmd"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "MCAI All-In-One (Safe).lnk"

$Wsh = New-Object -ComObject WScript.Shell
$Sc = $Wsh.CreateShortcut($ShortcutPath)
$Sc.TargetPath = $Target
$Sc.WorkingDirectory = $Root
$Sc.Description = "MCAI launcher without PowerShell (Norton-friendly)"
$Sc.IconLocation = "$env:SystemRoot\System32\cmd.exe,0"
$Sc.Save()
Write-Host "Created: $ShortcutPath"
