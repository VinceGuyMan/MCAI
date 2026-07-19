[CmdletBinding()]
param(
  [int]$MemoryGb = 4,
  [int]$Port = 25565,
  [string]$PaperVersion = "1.21.11",
  [string]$LevelName = "world-1.21.11",
  [switch]$InstallJava,
  [switch]$AcceptEula
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LocalJava = Join-Path $Root ".runtime\java\bin\java.exe"

if ($InstallJava) {
  & (Join-Path $PSScriptRoot "Install-Java.ps1") -Version "25"
}

if (Test-Path $LocalJava) {
  $JavaExe = $LocalJava
} else {
  $JavaCommand = Get-Command java -ErrorAction SilentlyContinue
  if (-not $JavaCommand) {
    throw "Java is not installed on PATH. Run '.\scripts\Start-Server.ps1 -InstallJava' once, or install Java 25 and run again."
  }
  $JavaExe = $JavaCommand.Source
}

$Jar = Get-ChildItem -LiteralPath $Root -Filter "paper-$PaperVersion-*.jar" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $Jar) {
  throw "No Paper $PaperVersion jar found in $Root. Run '.\scripts\Install-Paper.ps1 -Version $PaperVersion' first."
}

$EulaPath = Join-Path $Root "eula.txt"
$EulaAccepted = (Test-Path $EulaPath) -and ((Get-Content -LiteralPath $EulaPath -Raw) -match '(?im)^\s*eula\s*=\s*true\s*$')
if (-not $EulaAccepted) {
  if (-not $AcceptEula) {
    throw "Review https://aka.ms/MinecraftEULA, then re-run with -AcceptEula to record explicit acceptance."
  }
  Set-Content -LiteralPath $EulaPath -Value @(
    "# By changing the setting below to TRUE you are indicating your agreement to the Minecraft EULA."
    "# https://aka.ms/MinecraftEULA"
    "eula=true"
  ) -Encoding ASCII
}

$PropertiesPath = Join-Path $Root "server.properties"
if (-not (Test-Path $PropertiesPath)) {
  New-Item -ItemType File -Path $PropertiesPath | Out-Null
}

function Set-PropertyValue {
  param(
    [string]$Path,
    [string]$Name,
    [string]$Value
  )

  $Lines = if (Test-Path $Path) { Get-Content -LiteralPath $Path } else { @() }
  $Pattern = "^$([regex]::Escape($Name))="
  $Updated = $false

  $Lines = $Lines | ForEach-Object {
    if ($_ -match $Pattern) {
      $Updated = $true
      "$Name=$Value"
    } else {
      $_
    }
  }

  if (-not $Updated) {
    $Lines += "$Name=$Value"
  }

  Set-Content -LiteralPath $Path -Value $Lines -Encoding ASCII
}

$Defaults = @{
  "server-ip" = "127.0.0.1"
  "server-port" = "$Port"
  "motd" = "Local Ollama AI Minecraft Server"
  "level-name" = "$LevelName"
  "online-mode" = "false"
  "enforce-secure-profile" = "false"
  "white-list" = "false"
  "spawn-protection" = "0"
  "gamemode" = "survival"
  "difficulty" = "easy"
  "allow-flight" = "true"
  "view-distance" = "10"
  "simulation-distance" = "6"
  "enable-query" = "false"
  "enable-rcon" = "false"
}

foreach ($Key in $Defaults.Keys) {
  Set-PropertyValue -Path $PropertiesPath -Name $Key -Value $Defaults[$Key]
}

Write-Host "Starting $($Jar.Name) on 127.0.0.1:$Port with world '$LevelName' and Java:"
& $JavaExe -version

Push-Location $Root
try {
  & $JavaExe "-Xms1G" "-Xmx$($MemoryGb)G" "-jar" $Jar.FullName "nogui"
} finally {
  Pop-Location
}
