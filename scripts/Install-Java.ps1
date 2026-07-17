[CmdletBinding()]
param(
  [string]$Version = "25",
  [string]$RuntimeDir = ".runtime\java"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root $RuntimeDir
$JavaExe = Join-Path $Target "bin\java.exe"

if (Test-Path $JavaExe) {
  Write-Host "Java runtime already installed at $Target"
  & $JavaExe -version
  exit 0
}

$TempZip = Join-Path $env:TEMP "temurin-jre-$Version-windows-x64.zip"
$ExtractDir = Join-Path $Root ".runtime\java-extract"
$DownloadUrl = "https://api.adoptium.net/v3/binary/latest/$Version/ga/windows/x64/jre/hotspot/normal/eclipse"

New-Item -ItemType Directory -Force (Join-Path $Root ".runtime") | Out-Null
if (Test-Path $ExtractDir) {
  Remove-Item -LiteralPath $ExtractDir -Recurse -Force
}

Write-Host "Downloading Eclipse Temurin Java $Version runtime..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempZip

Write-Host "Extracting Java runtime..."
Expand-Archive -LiteralPath $TempZip -DestinationPath $ExtractDir -Force

$ExtractedHome = Get-ChildItem -LiteralPath $ExtractDir -Directory | Select-Object -First 1
if (-not $ExtractedHome) {
  throw "Could not find a Java home inside $TempZip"
}

if (Test-Path $Target) {
  Remove-Item -LiteralPath $Target -Recurse -Force
}

Move-Item -LiteralPath $ExtractedHome.FullName -Destination $Target
Remove-Item -LiteralPath $ExtractDir -Recurse -Force
Remove-Item -LiteralPath $TempZip -Force

Write-Host "Java installed at $Target"
& $JavaExe -version
