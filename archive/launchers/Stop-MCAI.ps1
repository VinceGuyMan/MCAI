[CmdletBinding()]
param(
  [switch]$StopOllama,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
if (-not $Root) {
  $Root = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$BotEntry = Join-Path $Root "bot\bot.js"

function Write-Step {
  param([string]$Message)
  Write-Host "[MCAI] $Message"
}

function Stop-MatchingProcess {
  param(
    [string]$Label,
    [scriptblock]$Predicate
  )

  $Matches = Get-CimInstance Win32_Process | Where-Object $Predicate
  if (-not $Matches) {
    Write-Step "No $Label processes found"
    return
  }

  foreach ($Process in $Matches) {
    Write-Step "Stopping $Label process $($Process.ProcessId)"
    if (-not $DryRun) {
      Stop-Process -Id $Process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

Stop-MatchingProcess -Label "AI bot" -Predicate {
    $_.Name -eq "node.exe" -and (
      $_.CommandLine -like "*$BotEntry*" -or
      $_.CommandLine -like "*bot.js*"
    )
}

Stop-MatchingProcess -Label "Paper server" -Predicate {
  $_.Name -eq "java.exe" -and
  $_.CommandLine -like "*$Root*" -and
  $_.CommandLine -like "*paper-*.jar*"
}

if ($StopOllama) {
  Stop-MatchingProcess -Label "Ollama" -Predicate {
    $_.Name -eq "ollama.exe"
  }
}

Write-Step "Stop command complete"
