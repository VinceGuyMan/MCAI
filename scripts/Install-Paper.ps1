[CmdletBinding()]
param(
  [string]$Version = "1.21.11"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Project = "paper"
$BaseUrl = "https://api.papermc.io/v2/projects/$Project"

Write-Host "Looking up Paper $Version..."
$VersionInfo = Invoke-RestMethod -Uri "$BaseUrl/versions/$Version" -TimeoutSec 30
$Build = $VersionInfo.builds[-1]

if (-not $Build) {
  throw "Could not find a Paper build for version $Version"
}

$BuildInfo = Invoke-RestMethod -Uri "$BaseUrl/versions/$Version/builds/$Build" -TimeoutSec 30
$FileName = $BuildInfo.downloads.application.name
$DownloadUrl = "$BaseUrl/versions/$Version/builds/$Build/downloads/$FileName"
$Destination = Join-Path $Root $FileName

if (Test-Path $Destination) {
  Write-Host "$FileName already exists."
  exit 0
}

Write-Host "Downloading $FileName..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $Destination

Write-Host "Downloaded $Destination"
