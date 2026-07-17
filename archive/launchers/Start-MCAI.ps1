[CmdletBinding()]
param(
  [int]$MemoryGb = 4,
  [int]$ServerPort = 25565,
  [string]$ServerVersion = "1.21.11",
  [switch]$SkipOllama,
  [switch]$SkipInstall,
  [switch]$PullOllamaModels,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
if (-not $Root) {
  $Root = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$BotDir = Join-Path $Root "bot"
$ConfigPath = Join-Path $Root "config.json"
$EnvPath = Join-Path $BotDir ".env"
$EnvExamplePath = Join-Path $BotDir ".env.example"
$RuntimeDir = Join-Path $Root ".runtime"
$JavaExe = Join-Path $RuntimeDir "java\bin\java.exe"
$ServerScript = Join-Path $Root "scripts\Start-Server.ps1"
$InstallJavaScript = Join-Path $Root "scripts\Install-Java.ps1"
$InstallPaperScript = Join-Path $Root "scripts\Install-Paper.ps1"
$OllamaLog = Join-Path $RuntimeDir "ollama.log"
$OllamaErr = Join-Path $RuntimeDir "ollama.err.log"

function Write-Step {
  param([string]$Message)
  Write-Host "[MCAI] $Message"
}

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Name,
    [string]$Fallback
  )

  if (-not (Test-Path $Path)) {
    return $Fallback
  }

  $Line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -Last 1

  if (-not $Line) {
    return $Fallback
  }

  return ($Line -replace "^$([regex]::Escape($Name))=", "").Trim()
}

function Set-EnvValue {
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

  if (-not $DryRun) {
    Set-Content -LiteralPath $Path -Value $Lines -Encoding ASCII
  }
}

function Get-BotConfig {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    Write-Warning "Could not read config.json for model roles: $($_.Exception.Message)"
    return $null
  }
}

function Get-ConfiguredOllamaModels {
  param(
    [object]$Config,
    [string]$LegacyModel
  )

  $Models = New-Object System.Collections.Generic.List[string]
  if ($Config -and $Config.ollamaModel) {
    $Models.Add([string]$Config.ollamaModel)
  } elseif ($LegacyModel) {
    $Models.Add($LegacyModel)
  }

  if ($Config -and $Config.models) {
    $Config.models.PSObject.Properties | ForEach-Object {
      if ($_.Value) {
        $Models.Add([string]$_.Value)
      }
    }
  }

  return @($Models | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
}

function Get-OllamaModelsPath {
  param([string]$Path)

  $ConfiguredPath = Get-EnvValue -Path $Path -Name "OLLAMA_MODELS" -Fallback ""
  if ([string]::IsNullOrWhiteSpace($ConfiguredPath) -and -not [string]::IsNullOrWhiteSpace($env:OLLAMA_MODELS)) {
    $ConfiguredPath = $env:OLLAMA_MODELS
  }

  if ([string]::IsNullOrWhiteSpace($ConfiguredPath) -and (Test-Path -LiteralPath "E:\Ollama Models")) {
    $ConfiguredPath = "E:\Ollama Models"
  }

  return ([string]$ConfiguredPath).Trim()
}

function Get-OllamaManifestModels {
  param([string]$ModelDir)

  if ([string]::IsNullOrWhiteSpace($ModelDir)) {
    return @()
  }

  $LibraryPath = Join-Path $ModelDir "manifests\registry.ollama.ai\library"
  if (-not (Test-Path -LiteralPath $LibraryPath)) {
    return @()
  }

  $Models = New-Object System.Collections.Generic.List[string]
  Get-ChildItem -LiteralPath $LibraryPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $ModelName = $_.Name
    Get-ChildItem -LiteralPath $_.FullName -File -ErrorAction SilentlyContinue | ForEach-Object {
      $Models.Add("${ModelName}:$($_.Name)")
    }
  }

  return @($Models | Select-Object -Unique)
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 60
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $Deadline) {
    try {
      Invoke-RestMethod -Uri $Url -TimeoutSec 2 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port
  )

  try {
    $Client = [System.Net.Sockets.TcpClient]::new()
    $Async = $Client.BeginConnect($HostName, $Port, $null, $null)
    $Connected = $Async.AsyncWaitHandle.WaitOne(750)
    if ($Connected) {
      $Client.EndConnect($Async)
    }
    $Client.Close()
    return $Connected
  } catch {
    return $false
  }
}

function Wait-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutSeconds = 120
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $Deadline) {
    if (Test-TcpPort -HostName $HostName -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 2
  }

  return $false
}

function Get-MinecraftServerVersion {
  param(
    [string]$HostName,
    [int]$Port
  )

  if (-not (Test-Path (Join-Path $BotDir "node_modules"))) {
    return ""
  }

  $PingScript = @"
const mc = require('minecraft-protocol');
mc.ping({ host: process.argv[1], port: Number(process.argv[2]), closeTimeout: 2500 }, (err, result) => {
  if (err) {
    process.exit(2);
  }
  console.log(result?.version?.name || '');
});
"@

  Push-Location $BotDir
  try {
    $Output = & node -e $PingScript $HostName $Port 2>$null
    if ($LASTEXITCODE -ne 0) {
      return ""
    }

    return ($Output -join "`n").Trim()
  } finally {
    Pop-Location
  }
}

function Normalize-MinecraftServerVersion {
  param([string]$VersionName)

  $Text = [string]$VersionName
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $Match = [regex]::Match($Text, "\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9_.-]+)?")
  if ($Match.Success) {
    return $Match.Value
  }

  return $Text.Trim()
}

function Start-PowerShellWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $EscapedTitle = $Title.Replace("'", "''")
  $FullCommand = "`$Host.UI.RawUI.WindowTitle = '$EscapedTitle'; $Command"
  $EncodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($FullCommand))

  if ($DryRun) {
    Write-Step "Dry run: would start '$Title' in $WorkingDirectory"
    Write-Host $Command
    return
  }

  Start-Process -FilePath "powershell.exe" `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Normal `
    -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $EncodedCommand)
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

if (-not (Test-Path $EnvPath)) {
  if (-not (Test-Path $EnvExamplePath)) {
    throw "Missing bot .env and .env.example in $BotDir"
  }

  Write-Step "Creating bot\.env from bot\.env.example"
  if (-not $DryRun) {
    Copy-Item -LiteralPath $EnvExamplePath -Destination $EnvPath
  }
}

$BotConfig = Get-BotConfig -Path $ConfigPath
$OllamaBaseUrl = (($BotConfig.ollamaUrl) -as [string])
if ([string]::IsNullOrWhiteSpace($OllamaBaseUrl)) {
  $OllamaBaseUrl = Get-EnvValue -Path $EnvPath -Name "OLLAMA_BASE_URL" -Fallback "http://127.0.0.1:11434"
}
$OllamaBaseUrl = $OllamaBaseUrl.TrimEnd("/")
$OllamaModel = (($BotConfig.ollamaModel) -as [string])
if ([string]::IsNullOrWhiteSpace($OllamaModel)) {
  $OllamaModel = Get-EnvValue -Path $EnvPath -Name "OLLAMA_MODEL" -Fallback "qwen3:14b"
}
$OllamaModelsToCheck = Get-ConfiguredOllamaModels -Config $BotConfig -LegacyModel $OllamaModel
$AutoPullOllamaModels = $PullOllamaModels -or ((Get-EnvValue -Path $EnvPath -Name "OLLAMA_AUTO_PULL_MODELS" -Fallback "false") -match "^(1|true|yes)$")
$OllamaModelsDir = Get-OllamaModelsPath -Path $EnvPath
if (-not [string]::IsNullOrWhiteSpace($OllamaModelsDir)) {
  Set-EnvValue -Path $EnvPath -Name "OLLAMA_MODELS" -Value $OllamaModelsDir
  $env:OLLAMA_MODELS = $OllamaModelsDir
}
$OllamaMaxLoadedModels = Get-EnvValue -Path $EnvPath -Name "OLLAMA_MAX_LOADED_MODELS" -Fallback "1"
$OllamaNumParallel = Get-EnvValue -Path $EnvPath -Name "OLLAMA_NUM_PARALLEL" -Fallback "1"
Set-EnvValue -Path $EnvPath -Name "OLLAMA_MAX_LOADED_MODELS" -Value $OllamaMaxLoadedModels
Set-EnvValue -Path $EnvPath -Name "OLLAMA_NUM_PARALLEL" -Value $OllamaNumParallel
$env:OLLAMA_MAX_LOADED_MODELS = $OllamaMaxLoadedModels
$env:OLLAMA_NUM_PARALLEL = $OllamaNumParallel
$McHost = Get-EnvValue -Path $EnvPath -Name "MC_HOST" -Fallback "127.0.0.1"
$McPort = [int](Get-EnvValue -Path $EnvPath -Name "MC_PORT" -Fallback "$ServerPort")

if ((Get-EnvValue -Path $EnvPath -Name "MC_VERSION" -Fallback "auto") -ne $ServerVersion) {
  Write-Step "Setting bot Minecraft version to $ServerVersion"
  Set-EnvValue -Path $EnvPath -Name "MC_VERSION" -Value $ServerVersion
}

if (-not $SkipInstall) {
  if (-not (Test-Path $JavaExe)) {
    Write-Step "Installing portable Java runtime"
    if (-not $DryRun) {
      & $InstallJavaScript
    }
  } else {
    Write-Step "Portable Java is already installed"
  }

  if (-not (Test-Path (Join-Path $BotDir "node_modules"))) {
    Write-Step "Installing bot npm dependencies"
    if (-not $DryRun) {
      Push-Location $BotDir
      try {
        npm install
      } finally {
        Pop-Location
      }
    }
  } else {
    Write-Step "Bot npm dependencies are already installed"
  }

  if (-not (Get-ChildItem -LiteralPath $Root -Filter "paper-$ServerVersion-*.jar" -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Step "Installing compatible Paper server $ServerVersion"
    if (-not $DryRun) {
      & $InstallPaperScript -Version $ServerVersion
    }
  } else {
    Write-Step "Compatible Paper server $ServerVersion is already installed"
  }
}

if (-not $SkipOllama) {
  $OllamaTagsUrl = "$OllamaBaseUrl/api/tags"
  if (-not [string]::IsNullOrWhiteSpace($OllamaModelsDir)) {
    if (Test-Path -LiteralPath $OllamaModelsDir) {
      Write-Step "Using Ollama model store: $OllamaModelsDir"
      Write-Step "Using Ollama runtime limits: OLLAMA_MAX_LOADED_MODELS=$OllamaMaxLoadedModels, OLLAMA_NUM_PARALLEL=$OllamaNumParallel"
    } else {
      Write-Warning "Configured OLLAMA_MODELS path does not exist: $OllamaModelsDir"
    }
  }

  if (Wait-HttpOk -Url $OllamaTagsUrl -TimeoutSeconds 3) {
    Write-Step "Ollama is already running at $OllamaBaseUrl"
  } else {
    $OllamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
    if (-not $OllamaCommand) {
      throw "Ollama is not on PATH. Start Ollama manually, or install Ollama, then run this again."
    }

    Write-Step "Starting Ollama in the background"
    if (-not $DryRun) {
      Start-Process -FilePath $OllamaCommand.Source `
        -ArgumentList @("serve") `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $OllamaLog `
        -RedirectStandardError $OllamaErr
    }

    if (-not (Wait-HttpOk -Url $OllamaTagsUrl -TimeoutSeconds 60)) {
      throw "Ollama did not become reachable at $OllamaBaseUrl. Check $OllamaLog and $OllamaErr."
    }
  }

  try {
    $Tags = Invoke-RestMethod -Uri $OllamaTagsUrl -TimeoutSec 5
    $Models = @($Tags.models | ForEach-Object { $_.name })
    $MissingModels = @($OllamaModelsToCheck | Where-Object { $Models -notcontains $_ })
    if ($MissingModels.Count -gt 0) {
      $ManifestModels = Get-OllamaManifestModels -ModelDir $OllamaModelsDir
      $PresentInConfiguredStore = @($MissingModels | Where-Object { $ManifestModels -contains $_ })
      if ($AutoPullOllamaModels) {
        foreach ($MissingModel in $MissingModels) {
          Write-Step "Role model '$MissingModel' is not installed. Pulling it because auto-pull was enabled."
          if (-not $DryRun) {
            ollama pull $MissingModel
          }
        }
      } else {
        if ($PresentInConfiguredStore.Count -gt 0) {
          Write-Warning "Configured model store contains $($PresentInConfiguredStore -join ', '), but the running Ollama server is not reporting them. Stop/restart Ollama so it starts with OLLAMA_MODELS=$OllamaModelsDir."
        }

        $ActuallyMissing = @($MissingModels | Where-Object { $PresentInConfiguredStore -notcontains $_ })
        if ($ActuallyMissing.Count -gt 0) {
          Write-Warning "Missing Ollama role model(s): $($ActuallyMissing -join ', '). Install them with 'ollama pull <model>' or run Start-MCAI.ps1 -PullOllamaModels."
        }
      }
    } else {
      Write-Step "All configured Ollama role models are installed: $($OllamaModelsToCheck -join ', ')"
    }
  } catch {
    Write-Warning "Could not confirm installed Ollama models: $($_.Exception.Message)"
  }
}

if (Test-TcpPort -HostName $McHost -Port $McPort) {
  $RunningVersion = Get-MinecraftServerVersion -HostName $McHost -Port $McPort
  $RunningMinecraftVersion = Normalize-MinecraftServerVersion $RunningVersion
  if ($RunningMinecraftVersion -and $RunningMinecraftVersion -ne $ServerVersion) {
    throw "A Minecraft server is already running on ${McHost}:${McPort}, but it reports version '$RunningVersion'. Stop that server window, then run Start-MCAI.cmd again so Paper $ServerVersion can start."
  }

  if ($RunningVersion) {
    Write-Step "Minecraft server already appears to be listening on ${McHost}:${McPort} ($RunningVersion)"
  } else {
    Write-Step "Minecraft server already appears to be listening on ${McHost}:${McPort}"
  }
} else {
  Write-Step "Starting Minecraft server window"
  $LevelName = "world-$ServerVersion"
  $ServerCommand = "& '$ServerScript' -MemoryGb $MemoryGb -Port $ServerPort -PaperVersion '$ServerVersion' -LevelName '$LevelName'"
  Start-PowerShellWindow -Title "MCAI Minecraft Server" -WorkingDirectory $Root -Command $ServerCommand

  if (-not $DryRun) {
    Write-Step "Waiting for Minecraft server on ${McHost}:${McPort}"
    if (-not (Wait-TcpPort -HostName $McHost -Port $McPort -TimeoutSeconds 180)) {
      throw "Minecraft server did not open ${McHost}:${McPort} in time. Check the server window."
    }
  }
}

Write-Step "Starting AI bot window"
$BotEntry = Join-Path $BotDir "bot.js"
$BotCommand = "node '$BotEntry'"
Start-PowerShellWindow -Title "MCAI AI Bot" -WorkingDirectory $BotDir -Command $BotCommand

Write-Step "Done. Join Minecraft at ${McHost}:${McPort} and chat with tj."
Write-Step "To stop later: type 'stop' in the server window, close the bot window, and stop Ollama from the tray or Task Manager if you want it off."
