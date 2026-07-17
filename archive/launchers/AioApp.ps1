# MCAI All-In-One launcher + first-run setup wizard (WinForms)
# ASCII only + UTF-8 BOM. Double-click MCAI-AIO.cmd
[CmdletBinding()]
param(
  [switch]$HeadlessStart,
  [switch]$SkipOllama,
  [switch]$ForceWizard
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "config.json"))) {
  throw "Could not find MCAI root (config.json missing)."
}

$ConfigPath = Join-Path $Root "config.json"
$StartScript = Join-Path $Root "Start-MCAI.ps1"
$StopScript = Join-Path $Root "Stop-MCAI.ps1"
$InstallJavaScript = Join-Path $Root "scripts\Install-Java.ps1"
$InstallPaperScript = Join-Path $Root "scripts\Install-Paper.ps1"
$RuntimeDir = Join-Path $Root ".runtime"
$SetupStatePath = Join-Path $RuntimeDir "setup-state.json"
$LogPath = Join-Path $RuntimeDir "aio-launcher.log"
$BotDir = Join-Path $Root "bot"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Write-AioLog([string]$Message) {
  $Line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $LogPath -Value $Line -Encoding UTF8
}

function Get-ConfigObject {
  try { return Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json }
  catch { return $null }
}

function Save-ConfigPatch {
  param(
    [string]$Provider,
    [string]$BaseUrl,
    [string]$Model
  )
  $Obj = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $Obj.llmProvider = $Provider
  $Obj.ollamaUrl = $BaseUrl
  $Obj.ollamaModel = $Model
  if (-not $Obj.models) {
    $Obj | Add-Member -NotePropertyName models -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  foreach ($Role in @("default", "commandRouter", "planner", "dialogue", "codingStructured", "codingHeavy", "fastFallback", "legacyFallback")) {
    if ($Obj.models.PSObject.Properties.Name -contains $Role) {
      $Obj.models.$Role = $Model
    } else {
      $Obj.models | Add-Member -NotePropertyName $Role -NotePropertyValue $Model -Force
    }
  }
  $Json = $Obj | ConvertTo-Json -Depth 30
  $Tmp = "$ConfigPath.tmp-aio"
  [System.IO.File]::WriteAllText($Tmp, $Json + "`n")
  Move-Item -LiteralPath $Tmp -Destination $ConfigPath -Force
}

function Get-SetupState {
  if (-not (Test-Path $SetupStatePath)) {
    return [pscustomobject]@{ completed = $false; step = 0; version = 1 }
  }
  try {
    return Get-Content -LiteralPath $SetupStatePath -Raw | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{ completed = $false; step = 0; version = 1 }
  }
}

function Save-SetupState {
  param($State)
  ($State | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $SetupStatePath -Encoding UTF8
}

function Test-TcpFast {
  param([string]$HostName = "127.0.0.1", [int]$Port, [int]$TimeoutMs = 250)
  $Client = $null
  try {
    $Client = New-Object System.Net.Sockets.TcpClient
    $Async = $Client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $Async.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
    $Client.EndConnect($Async)
    return $true
  } catch { return $false }
  finally { if ($Client) { try { $Client.Close() } catch { } } }
}

function Get-ProviderPresets {
  return @(
    [pscustomobject]@{ Id = "ollama"; Label = "Ollama"; Url = "http://127.0.0.1:11434"; Hint = "Install Ollama, then run it (tray icon). Models: ollama pull <name>" }
    [pscustomobject]@{ Id = "lmstudio"; Label = "LM Studio"; Url = "http://127.0.0.1:1234"; Hint = "In LM Studio: load a model, then start Local Server (Developer / Server tab)." }
    [pscustomobject]@{ Id = "openai_compatible"; Label = "Other OpenAI-compatible"; Url = "http://127.0.0.1:8000"; Hint = "Any local server that speaks /v1/models and /v1/chat/completions." }
  )
}

function Get-LlmListUrl {
  param([string]$Provider, [string]$BaseUrl)
  $Base = $BaseUrl.TrimEnd("/")
  if ($Provider -eq "ollama") { return "$Base/api/tags" }
  return "$Base/v1/models"
}

function Get-RemoteModels {
  param([string]$Provider, [string]$BaseUrl)
  $Url = Get-LlmListUrl -Provider $Provider -BaseUrl $BaseUrl
  try {
    $Resp = Invoke-RestMethod -Uri $Url -TimeoutSec 3
    if ($Provider -eq "ollama") {
      return @($Resp.models | ForEach-Object { $_.name } | Where-Object { $_ })
    }
    return @($Resp.data | ForEach-Object { $_.id } | Where-Object { $_ })
  } catch {
    return @()
  }
}

function Test-LlmReachable {
  param([string]$Provider, [string]$BaseUrl)
  try {
    $Url = Get-LlmListUrl -Provider $Provider -BaseUrl $BaseUrl
    Invoke-RestMethod -Uri $Url -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Get-PrereqChecks {
  $Config = Get-ConfigObject
  $Version = if ($Config.minecraftVersion) { [string]$Config.minecraftVersion } else { "1.21.11" }
  $Items = New-Object System.Collections.Generic.List[object]

  $NodeOk = [bool](Get-Command node -ErrorAction SilentlyContinue)
  $Items.Add([pscustomobject]@{
      Id = "node"; Label = "Node.js installed"
      Ok = $NodeOk
      Detail = if ($NodeOk) { (node -v) } else { "Not on PATH" }
      Fix = "Install Node LTS from https://nodejs.org then re-open this launcher."
    })

  $JavaLocal = Join-Path $Root ".runtime\java\bin\java.exe"
  $JavaOk = (Test-Path $JavaLocal) -or [bool](Get-Command java -ErrorAction SilentlyContinue)
  $Items.Add([pscustomobject]@{
      Id = "java"; Label = "Java for Paper server"
      Ok = $JavaOk
      Detail = if (Test-Path $JavaLocal) { "portable runtime present" } elseif ($JavaOk) { "java on PATH" } else { "missing" }
      Fix = "Click Install Java (portable) below."
    })

  $Paper = Get-ChildItem -LiteralPath $Root -Filter "paper-$Version-*.jar" -ErrorAction SilentlyContinue | Select-Object -First 1
  $Items.Add([pscustomobject]@{
      Id = "paper"; Label = "Paper server jar ($Version)"
      Ok = [bool]$Paper
      Detail = if ($Paper) { $Paper.Name } else { "no paper-$Version-*.jar" }
      Fix = "Click Install Paper below."
    })

  $Nm = Join-Path $BotDir "node_modules"
  $Items.Add([pscustomobject]@{
      Id = "npm"; Label = "Bot dependencies (npm)"
      Ok = (Test-Path $Nm)
      Detail = if (Test-Path $Nm) { "bot\node_modules ready" } else { "run npm install in bot\" }
      Fix = "Click Install bot packages below."
    })

  $EulaPath = Join-Path $Root "eula.txt"
  $EulaOk = $false
  if (Test-Path $EulaPath) {
    $EulaOk = [bool]((Get-Content $EulaPath -Raw) -match "eula\s*=\s*true")
  }
  $Items.Add([pscustomobject]@{
      Id = "eula"; Label = "Minecraft EULA accepted"
      Ok = $EulaOk
      Detail = if ($EulaOk) { "eula=true" } else { "will be set when server starts" }
      Fix = "Start All will write eula=true for local offline play."
    })

  return $Items
}

function Start-AioStack {
  param([switch]$NoOllama)
  Write-AioLog "Start All"
  $Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $StartScript)
  if ($NoOllama) { $Args += "-SkipOllama" }
  Start-Process -FilePath "powershell.exe" -ArgumentList $Args -WorkingDirectory $Root
}

function Stop-AioStack {
  Write-AioLog "Stop All"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $StopScript) `
    -WorkingDirectory $Root -WindowStyle Minimized
}

function Open-Browser([string]$Url) {
  try { Start-Process $Url } catch { Write-AioLog "browser: $($_.Exception.Message)" }
}

# ---------- UI helpers ----------
[System.Windows.Forms.Application]::EnableVisualStyles()

$Ui = @{
  Bg      = [System.Drawing.Color]::FromArgb(16, 20, 24)
  Panel   = [System.Drawing.Color]::FromArgb(23, 29, 35)
  Text    = [System.Drawing.Color]::FromArgb(233, 238, 244)
  Muted   = [System.Drawing.Color]::FromArgb(154, 168, 181)
  Accent  = [System.Drawing.Color]::FromArgb(118, 211, 155)
  Danger  = [System.Drawing.Color]::FromArgb(240, 95, 99)
  Line    = [System.Drawing.Color]::FromArgb(42, 53, 64)
  Button  = [System.Drawing.Color]::FromArgb(29, 37, 45)
}

$Form = New-Object System.Windows.Forms.Form
$Form.Text = "MCAI Setup"
$Form.Size = New-Object System.Drawing.Size(640, 560)
$Form.StartPosition = "CenterScreen"
$Form.FormBorderStyle = "FixedSingle"
$Form.MaximizeBox = $false
$Form.BackColor = $Ui.Bg
$Form.ForeColor = $Ui.Text
$Form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

function New-UiLabel([string]$Text, [int]$X, [int]$Y, [int]$W = 580, [int]$H = 22, [switch]$Muted, [switch]$Title) {
  $L = New-Object System.Windows.Forms.Label
  $L.Text = $Text
  $L.Location = New-Object System.Drawing.Point($X, $Y)
  $L.Size = New-Object System.Drawing.Size($W, $H)
  $L.ForeColor = if ($Muted) { $Ui.Muted } else { $Ui.Text }
  if ($Title) { $L.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold) }
  return $L
}

function New-UiButton([string]$Text, [int]$X, [int]$Y, [int]$W = 120, [int]$H = 34, [switch]$Primary) {
  $B = New-Object System.Windows.Forms.Button
  $B.Text = $Text
  $B.Location = New-Object System.Drawing.Point($X, $Y)
  $B.Size = New-Object System.Drawing.Size($W, $H)
  $B.FlatStyle = "Flat"
  $B.FlatAppearance.BorderColor = $Ui.Line
  if ($Primary) {
    $B.BackColor = [System.Drawing.Color]::FromArgb(27, 58, 42)
    $B.ForeColor = [System.Drawing.Color]::FromArgb(223, 247, 232)
  } else {
    $B.BackColor = $Ui.Button
    $B.ForeColor = $Ui.Text
  }
  return $B
}

function New-Panel {
  $P = New-Object System.Windows.Forms.Panel
  $P.Location = New-Object System.Drawing.Point(0, 0)
  $P.Size = New-Object System.Drawing.Size(640, 560)
  $P.BackColor = $Ui.Bg
  $P.Visible = $false
  return $P
}

# Shared wizard state
$script:WizardStep = 0
$script:AvailableModels = @()
$script:ProviderId = "ollama"
$script:ProviderUrl = "http://127.0.0.1:11434"
$script:SelectedModel = ""
$Cfg0 = Get-ConfigObject
if ($Cfg0) {
  if ($Cfg0.llmProvider) { $script:ProviderId = [string]$Cfg0.llmProvider }
  if ($Cfg0.ollamaUrl) { $script:ProviderUrl = [string]$Cfg0.ollamaUrl }
  if ($Cfg0.models -and $Cfg0.models.default) { $script:SelectedModel = [string]$Cfg0.models.default }
  elseif ($Cfg0.ollamaModel) { $script:SelectedModel = [string]$Cfg0.ollamaModel }
}

# ========== PANELS ==========
$PanelWelcome = New-Panel
$PanelLlm = New-Panel
$PanelModel = New-Panel
$PanelPrereq = New-Panel
$PanelMc = New-Panel
$PanelLaunch = New-Panel
$PanelMain = New-Panel

$Form.Controls.AddRange(@($PanelWelcome, $PanelLlm, $PanelModel, $PanelPrereq, $PanelMc, $PanelLaunch, $PanelMain))

function Show-Panel {
  param([System.Windows.Forms.Panel]$Panel)
  foreach ($P in @($PanelWelcome, $PanelLlm, $PanelModel, $PanelPrereq, $PanelMc, $PanelLaunch, $PanelMain)) {
    $P.Visible = $false
  }
  $Panel.Visible = $true
  $Panel.BringToFront()
}

# ---- Step 0 Welcome ----
$PanelWelcome.Controls.Add((New-UiLabel "Welcome to MCAI" 30 30 560 30 -Title))
$PanelWelcome.Controls.Add((New-UiLabel "This wizard sets up your local Minecraft AI companion (tj)." 30 70 560 24 -Muted))
$WBody = New-UiLabel "" 30 110 560 220 -Muted
$WBody.Height = 220
$WBody.Text = "You will:`r`n  1. Point MCAI at your LLM app (Ollama, LM Studio, or similar)`r`n  2. Pick which model to use`r`n  3. Install anything missing (Java, Paper, bot packages)`r`n  4. Learn how to join Minecraft and talk to the bot`r`n  5. Start everything and verify it is healthy`r`n`r`nTakes a few minutes the first time. After that, use Start All."
$PanelWelcome.Controls.Add($WBody)
$BtnWNext = New-UiButton "Get started" 30 400 140 40 -Primary
$BtnWSkip = New-UiButton "Skip to control panel" 190 400 180 40
$PanelWelcome.Controls.AddRange(@($BtnWNext, $BtnWSkip))

# ---- Step 1 LLM ----
$PanelLlm.Controls.Add((New-UiLabel "Step 1 of 5 - LLM program" 30 24 560 28 -Title))
$PanelLlm.Controls.Add((New-UiLabel "Where are your local models running?" 30 60 560 22 -Muted))

$CboProvider = New-Object System.Windows.Forms.ComboBox
$CboProvider.DropDownStyle = "DropDownList"
$CboProvider.Location = New-Object System.Drawing.Point(30, 100)
$CboProvider.Size = New-Object System.Drawing.Size(280, 28)
foreach ($P in Get-ProviderPresets) { [void]$CboProvider.Items.Add($P.Label) }
$Idx = 0
$Presets = @(Get-ProviderPresets)
for ($i = 0; $i -lt $Presets.Count; $i++) {
  if ($Presets[$i].Id -eq $script:ProviderId) { $Idx = $i }
}
$CboProvider.SelectedIndex = $Idx
$PanelLlm.Controls.Add($CboProvider)

$LblHint = New-UiLabel $Presets[$Idx].Hint 30 140 560 48 -Muted
$LblHint.Height = 48
$PanelLlm.Controls.Add($LblHint)

$PanelLlm.Controls.Add((New-UiLabel "Base URL" 30 200 200 20 -Muted))
$TxtUrl = New-Object System.Windows.Forms.TextBox
$TxtUrl.Location = New-Object System.Drawing.Point(30, 224)
$TxtUrl.Size = New-Object System.Drawing.Size(400, 28)
$TxtUrl.Text = $script:ProviderUrl
$TxtUrl.BackColor = $Ui.Panel
$TxtUrl.ForeColor = $Ui.Text
$TxtUrl.BorderStyle = "FixedSingle"
$PanelLlm.Controls.Add($TxtUrl)

$BtnTestLlm = New-UiButton "Test connection" 30 270 140 34
$LblLlmStatus = New-UiLabel "Not tested yet." 190 276 380 24 -Muted
$PanelLlm.Controls.AddRange(@($BtnTestLlm, $LblLlmStatus))

$HelpBox = New-UiLabel "" 30 320 560 80 -Muted
$HelpBox.Height = 80
$PanelLlm.Controls.Add($HelpBox)

$BtnLlmBack = New-UiButton "Back" 30 430 100 34
$BtnLlmNext = New-UiButton "Next: pick model" 150 430 160 34 -Primary
$PanelLlm.Controls.AddRange(@($BtnLlmBack, $BtnLlmNext))

function Sync-ProviderUi {
  $P = $Presets[$CboProvider.SelectedIndex]
  $script:ProviderId = $P.Id
  if (-not $TxtUrl.Modified) {
    $TxtUrl.Text = $P.Url
  }
  $LblHint.Text = $P.Hint
  if ($P.Id -eq "ollama") {
    $HelpBox.Text = "If Test fails: install Ollama from ollama.com, open it, wait for the tray icon, then Test again."
  } elseif ($P.Id -eq "lmstudio") {
    $HelpBox.Text = "If Test fails: open LM Studio, load a GGUF model, enable Local Server (port 1234), then Test again. Check Skip Ollama later when starting."
  } else {
    $HelpBox.Text = "If Test fails: confirm your server is listening and the URL matches (often ends without /v1)."
  }
}
$CboProvider.Add_SelectedIndexChanged({ $TxtUrl.Modified = $false; Sync-ProviderUi })
Sync-ProviderUi

$BtnTestLlm.Add_Click({
  $LblLlmStatus.ForeColor = $Ui.Muted
  $LblLlmStatus.Text = "Testing..."
  [System.Windows.Forms.Application]::DoEvents()
  $script:ProviderUrl = $TxtUrl.Text.Trim()
  $script:ProviderId = $Presets[$CboProvider.SelectedIndex].Id
  if (Test-LlmReachable -Provider $script:ProviderId -BaseUrl $script:ProviderUrl) {
    $Models = Get-RemoteModels -Provider $script:ProviderId -BaseUrl $script:ProviderUrl
    $script:AvailableModels = $Models
    $LblLlmStatus.ForeColor = $Ui.Accent
    $LblLlmStatus.Text = "Connected. Found $($Models.Count) model(s)."
  } else {
    $LblLlmStatus.ForeColor = $Ui.Danger
    $LblLlmStatus.Text = "Cannot reach LLM. Follow the tip below, then Test again."
  }
})

# ---- Step 2 Model ----
$PanelModel.Controls.Add((New-UiLabel "Step 2 of 5 - Choose model" 30 24 560 28 -Title))
$PanelModel.Controls.Add((New-UiLabel "Pick the model MCAI should use for chat and commands." 30 60 560 22 -Muted))

$CboModel = New-Object System.Windows.Forms.ComboBox
$CboModel.DropDownStyle = "DropDown"  # allow typing if list empty
$CboModel.Location = New-Object System.Drawing.Point(30, 110)
$CboModel.Size = New-Object System.Drawing.Size(400, 28)
$PanelModel.Controls.Add($CboModel)

$BtnRefreshModels = New-UiButton "Refresh list" 450 108 120 30
$PanelModel.Controls.Add($BtnRefreshModels)

$LblModelHelp = New-UiLabel "" 30 160 560 120 -Muted
$LblModelHelp.Height = 120
$LblModelHelp.Text = "Tips:`r`n- Ollama: ollama pull qwen2.5:7b   (or any model you like)`r`n- LM Studio: load a model in the UI first, then refresh this list`r`n- Smaller models (7B-14B) are usually better for a helper bot on one PC"
$PanelModel.Controls.Add($LblModelHelp)

$LblModelStatus = New-UiLabel "" 30 300 560 24 -Muted
$PanelModel.Controls.Add($LblModelStatus)

$BtnModelBack = New-UiButton "Back" 30 430 100 34
$BtnModelNext = New-UiButton "Next: install pieces" 150 430 180 34 -Primary
$PanelModel.Controls.AddRange(@($BtnModelBack, $BtnModelNext))

function Refresh-ModelList {
  $CboModel.Items.Clear()
  $script:ProviderUrl = $TxtUrl.Text.Trim()
  $script:ProviderId = $Presets[$CboProvider.SelectedIndex].Id
  $Models = Get-RemoteModels -Provider $script:ProviderId -BaseUrl $script:ProviderUrl
  $script:AvailableModels = $Models
  foreach ($M in $Models) { [void]$CboModel.Items.Add($M) }
  if ($script:SelectedModel -and $CboModel.Items.Contains($script:SelectedModel)) {
    $CboModel.Text = $script:SelectedModel
  } elseif ($Models.Count -gt 0) {
    $CboModel.SelectedIndex = 0
  } elseif ($script:SelectedModel) {
    $CboModel.Text = $script:SelectedModel
  }
  $LblModelStatus.Text = if ($Models.Count) { "$($Models.Count) models available" } else { "No models listed. Type a model name or fix LLM connection." }
}

$BtnRefreshModels.Add_Click({ Refresh-ModelList })

# ---- Step 3 Prerequisites ----
$PanelPrereq.Controls.Add((New-UiLabel "Step 3 of 5 - Server pieces" 30 24 560 28 -Title))
$PanelPrereq.Controls.Add((New-UiLabel "MCAI checks what is installed. Fix anything red before launching." 30 60 560 22 -Muted))

$LstPrereq = New-Object System.Windows.Forms.ListBox
$LstPrereq.Location = New-Object System.Drawing.Point(30, 100)
$LstPrereq.Size = New-Object System.Drawing.Size(560, 180)
$LstPrereq.BackColor = $Ui.Panel
$LstPrereq.ForeColor = $Ui.Text
$LstPrereq.BorderStyle = "FixedSingle"
$PanelPrereq.Controls.Add($LstPrereq)

$LblPrereqFix = New-UiLabel "" 30 290 560 40 -Muted
$LblPrereqFix.Height = 40
$PanelPrereq.Controls.Add($LblPrereqFix)

$BtnInstallJava = New-UiButton "Install Java" 30 340 120 32
$BtnInstallPaper = New-UiButton "Install Paper" 160 340 120 32
$BtnInstallNpm = New-UiButton "Install bot packages" 290 340 160 32
$BtnRecheck = New-UiButton "Re-check" 460 340 100 32
$PanelPrereq.Controls.AddRange(@($BtnInstallJava, $BtnInstallPaper, $BtnInstallNpm, $BtnRecheck))

$BtnPrereqBack = New-UiButton "Back" 30 430 100 34
$BtnPrereqNext = New-UiButton "Next: Minecraft" 150 430 150 34 -Primary
$PanelPrereq.Controls.AddRange(@($BtnPrereqBack, $BtnPrereqNext))

function Refresh-PrereqList {
  $LstPrereq.Items.Clear()
  $Items = Get-PrereqChecks
  $script:LastPrereq = $Items
  foreach ($I in $Items) {
    $Mark = if ($I.Ok) { "[OK]" } else { "[!!]" }
    [void]$LstPrereq.Items.Add("$Mark  $($I.Label)  -  $($I.Detail)")
  }
  $Bad = @($Items | Where-Object { -not $_.Ok })
  if ($Bad.Count -eq 0) {
    $LblPrereqFix.ForeColor = $Ui.Accent
    $LblPrereqFix.Text = "All required pieces look good."
    $BtnPrereqNext.Enabled = $true
  } else {
    $LblPrereqFix.ForeColor = $Ui.Danger
    $LblPrereqFix.Text = "Fix: $($Bad[0].Fix)"
    # Allow next anyway but warn - Node is hard required
    $NodeMissing = [bool]($Bad | Where-Object { $_.Id -eq "node" })
    $BtnPrereqNext.Enabled = -not $NodeMissing
  }
}

$LstPrereq.Add_SelectedIndexChanged({
  if ($LstPrereq.SelectedIndex -ge 0 -and $script:LastPrereq) {
    $I = $script:LastPrereq[$LstPrereq.SelectedIndex]
    $LblPrereqFix.Text = if ($I.Ok) { "OK: $($I.Detail)" } else { "Fix: $($I.Fix)" }
  }
})

$BtnRecheck.Add_Click({ Refresh-PrereqList })
$BtnInstallJava.Add_Click({
  if (Test-Path $InstallJavaScript) {
    Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-File", $InstallJavaScript) -WorkingDirectory $Root
    [System.Windows.Forms.MessageBox]::Show("Java install window opened. When it finishes, click Re-check.", "MCAI") | Out-Null
  }
})
$BtnInstallPaper.Add_Click({
  $Config = Get-ConfigObject
  $Ver = if ($Config.minecraftVersion) { [string]$Config.minecraftVersion } else { "1.21.11" }
  if (Test-Path $InstallPaperScript) {
    Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-File", $InstallPaperScript, "-Version", $Ver) -WorkingDirectory $Root
    [System.Windows.Forms.MessageBox]::Show("Paper install window opened. When it finishes, click Re-check.", "MCAI") | Out-Null
  }
})
$BtnInstallNpm.Add_Click({
  Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "Set-Location '$BotDir'; npm install") -WorkingDirectory $BotDir
  [System.Windows.Forms.MessageBox]::Show("npm install started. When it finishes, click Re-check.", "MCAI") | Out-Null
})

# ---- Step 4 Minecraft guide ----
$PanelMc.Controls.Add((New-UiLabel "Step 4 of 5 - Minecraft" 30 24 560 28 -Title))
$McText = New-UiLabel @"
You need Minecraft: Java Edition (not Bedrock/phone/console).

1. Install Java Edition via the official Minecraft Launcher.
2. In Installations, use version matching config (see below).
3. After Start All, create/join a multiplayer server:
      Address:  127.0.0.1:25565
4. Offline local server - use username matching the owner in config
      (default owner: ModVinny).
5. In chat, talk to the bot (default name: tj), e.g.:
      tj help
      tj status
      tj come here

Firewall: keep this server local only (127.0.0.1). Do not port-forward.
"@ 30 60 560 320 -Muted
$McText.Height = 320
$PanelMc.Controls.Add($McText)

$BtnMcBack = New-UiButton "Back" 30 430 100 34
$BtnMcNext = New-UiButton "Next: launch" 150 430 140 34 -Primary
$PanelMc.Controls.AddRange(@($BtnMcBack, $BtnMcNext))

# ---- Step 5 Launch ----
$PanelLaunch.Controls.Add((New-UiLabel "Step 5 of 5 - Launch" 30 24 560 28 -Title))
$PanelLaunch.Controls.Add((New-UiLabel "Save your LLM settings, start the stack, then verify." 30 60 560 22 -Muted))

$ChkSkipOllamaW = New-Object System.Windows.Forms.CheckBox
$ChkSkipOllamaW.Text = "Do not start Ollama (use if LM Studio / already running)"
$ChkSkipOllamaW.Location = New-Object System.Drawing.Point(30, 100)
$ChkSkipOllamaW.Size = New-Object System.Drawing.Size(500, 24)
$ChkSkipOllamaW.ForeColor = $Ui.Muted
$PanelLaunch.Controls.Add($ChkSkipOllamaW)

$LblLaunchStatus = New-UiLabel "Ready when you are." 30 140 560 80 -Muted
$LblLaunchStatus.Height = 80
$PanelLaunch.Controls.Add($LblLaunchStatus)

$BtnSaveStart = New-UiButton "Save settings and Start All" 30 240 220 40 -Primary
$BtnOpenSetupWeb = New-UiButton "Open web Setup checklist" 270 240 200 40
$BtnLaunchBack = New-UiButton "Back" 30 430 100 34
$BtnFinish = New-UiButton "Finish - control panel" 150 430 200 34 -Primary
$BtnFinish.Enabled = $false
$PanelLaunch.Controls.AddRange(@($BtnSaveStart, $BtnOpenSetupWeb, $BtnLaunchBack, $BtnFinish))

function Save-WizardLlmSettings {
  $Model = $CboModel.Text.Trim()
  if (-not $Model) { throw "Pick or type a model name first." }
  $script:SelectedModel = $Model
  $script:ProviderId = $Presets[$CboProvider.SelectedIndex].Id
  $script:ProviderUrl = $TxtUrl.Text.Trim()
  Save-ConfigPatch -Provider $script:ProviderId -BaseUrl $script:ProviderUrl -Model $Model
  Write-AioLog "Saved LLM provider=$($script:ProviderId) url=$($script:ProviderUrl) model=$Model"
}

$BtnSaveStart.Add_Click({
  try {
    $LblLaunchStatus.ForeColor = $Ui.Muted
    $LblLaunchStatus.Text = "Saving settings..."
    [System.Windows.Forms.Application]::DoEvents()
    Save-WizardLlmSettings
    if ($script:ProviderId -match "lmstudio|openai") { $ChkSkipOllamaW.Checked = $true }
    $LblLaunchStatus.Text = "Starting Paper + bot... windows will open."
    [System.Windows.Forms.Application]::DoEvents()
    Start-AioStack -NoOllama:$ChkSkipOllamaW.Checked
    $LblLaunchStatus.ForeColor = $Ui.Accent
    $LblLaunchStatus.Text = @"
Start launched.
1. Wait for Minecraft server window to finish loading
2. Wait for bot window to say it is online
3. Click Open web Setup checklist (token default: change-me-local-token)
4. Join 127.0.0.1:25565 in Minecraft Java
5. Click Finish when you are happy
"@
    $BtnFinish.Enabled = $true
  } catch {
    $LblLaunchStatus.ForeColor = $Ui.Danger
    $LblLaunchStatus.Text = $_.Exception.Message
  }
})

$BtnOpenSetupWeb.Add_Click({
  $Config = Get-ConfigObject
  $HostName = if ($Config.dashboardHost) { $Config.dashboardHost } else { "127.0.0.1" }
  $Port = if ($Config.dashboardPort) { $Config.dashboardPort } else { 8787 }
  Open-Browser "http://${HostName}:${Port}/setup.html"
})

# ---- Main control panel ----
$PanelMain.Controls.Add((New-UiLabel "MCAI Control" 30 24 560 28 -Title))
$LblMainPrefs = New-UiLabel "" 30 70 560 90 -Muted
$LblMainPrefs.Height = 90
$PanelMain.Controls.Add($LblMainPrefs)
$LblMainStatus = New-UiLabel "Status will refresh automatically." 30 170 560 80 -Muted
$LblMainStatus.Height = 80
$PanelMain.Controls.Add($LblMainStatus)

$ChkSkipOllamaM = New-Object System.Windows.Forms.CheckBox
$ChkSkipOllamaM.Text = "Skip starting Ollama (LM Studio / already running)"
$ChkSkipOllamaM.Location = New-Object System.Drawing.Point(30, 260)
$ChkSkipOllamaM.Size = New-Object System.Drawing.Size(500, 24)
$ChkSkipOllamaM.ForeColor = $Ui.Muted
$PanelMain.Controls.Add($ChkSkipOllamaM)

$BtnMainStart = New-UiButton "Start All" 30 310 120 40 -Primary
$BtnMainStop = New-UiButton "Stop All" 160 310 120 40
$BtnMainSetup = New-UiButton "Setup wizard" 290 310 130 40
$BtnMainWeb = New-UiButton "Web Setup" 430 310 120 40
$BtnMainDash = New-UiButton "Dashboard" 30 370 120 40
$PanelMain.Controls.AddRange(@($BtnMainStart, $BtnMainStop, $BtnMainSetup, $BtnMainWeb, $BtnMainDash))

$PanelMain.Controls.Add((New-UiLabel "Join Minecraft at 127.0.0.1:25565  |  Chat: tj help" 30 430 560 24 -Muted))

function Refresh-MainPanel {
  $C = Get-ConfigObject
  $Provider = if ($C.llmProvider) { $C.llmProvider } else { "ollama" }
  $Model = if ($C.models.default) { $C.models.default } else { $C.ollamaModel }
  $LblMainPrefs.Text = @"
Owner: $($C.ownerUsername)   Bot: $($C.botUsername)   MC: $($C.minecraftVersion)
LLM: $Provider   Model: $Model
URL: $($C.ollamaUrl)
"@
  if ($Provider -match "lmstudio|openai") { $ChkSkipOllamaM.Checked = $true }

  $Mc = Test-TcpFast -HostName $(if ($C.host) { $C.host } else { "127.0.0.1" }) -Port $(if ($C.port) { [int]$C.port } else { 25565 })
  $Dash = Test-TcpFast -HostName $(if ($C.dashboardHost) { $C.dashboardHost } else { "127.0.0.1" }) -Port $(if ($C.dashboardPort) { [int]$C.dashboardPort } else { 8787 })
  $LlmPort = 11434
  try { $LlmPort = ([Uri]$C.ollamaUrl).Port } catch { }
  $Llm = Test-TcpFast -HostName "127.0.0.1" -Port $LlmPort
  $Bot = $false
  try { $Bot = [bool](Get-Process -Name "node" -ErrorAction SilentlyContinue | Select-Object -First 1) } catch { }
  $On = { param($x) if ($x) { "[ON]" } else { "[--]" } }
  $LblMainStatus.Text = "$(& $On $Llm) LLM    $(& $On $Mc) Server    $(& $On $Bot) Bot    $(& $On $Dash) Dashboard"
}

$MainTimer = New-Object System.Windows.Forms.Timer
$MainTimer.Interval = 2000
$MainTimer.Add_Tick({
  if ($PanelMain.Visible) {
    try { Refresh-MainPanel } catch { }
  }
})

# ---- Navigation ----
function Go-Wizard([int]$Step) {
  $script:WizardStep = $Step
  switch ($Step) {
    0 { Show-Panel $PanelWelcome; $Form.Text = "MCAI Setup - Welcome" }
    1 { Show-Panel $PanelLlm; $Form.Text = "MCAI Setup - LLM"; Sync-ProviderUi }
    2 {
      Show-Panel $PanelModel
      $Form.Text = "MCAI Setup - Model"
      Refresh-ModelList
    }
    3 {
      Show-Panel $PanelPrereq
      $Form.Text = "MCAI Setup - Install"
      Refresh-PrereqList
    }
    4 {
      Show-Panel $PanelMc
      $Form.Text = "MCAI Setup - Minecraft"
      $C = Get-ConfigObject
      $Ver = if ($C.minecraftVersion) { $C.minecraftVersion } else { "1.21.11" }
      $Own = if ($C.ownerUsername) { $C.ownerUsername } else { "ModVinny" }
      $Bot = if ($C.botUsername) { $C.botUsername } else { "tj" }
      $McText.Text = @"
You need Minecraft: Java Edition (not Bedrock/phone/console).

1. Install Java Edition via the official Minecraft Launcher.
2. Use version: $Ver  (must match the Paper server).
3. After Start All, Multiplayer -> Direct Connection:
      127.0.0.1:25565
4. Local offline server - join as: $Own
5. In chat try:
      $Bot help
      $Bot status
      $Bot come here

Keep the server on 127.0.0.1 only. Do not port-forward.
"@
    }
    5 {
      Show-Panel $PanelLaunch
      $Form.Text = "MCAI Setup - Launch"
      if ($script:ProviderId -match "lmstudio|openai") { $ChkSkipOllamaW.Checked = $true }
    }
    6 {
      Show-Panel $PanelMain
      $Form.Text = "MCAI Control"
      Refresh-MainPanel
      $MainTimer.Start()
    }
  }
}

$BtnWNext.Add_Click({ Go-Wizard 1 })
$BtnWSkip.Add_Click({
  Save-SetupState ([pscustomobject]@{ completed = $true; step = 6; version = 1; skipped = $true })
  Go-Wizard 6
})
$BtnLlmBack.Add_Click({ Go-Wizard 0 })
$BtnLlmNext.Add_Click({
  $script:ProviderUrl = $TxtUrl.Text.Trim()
  $script:ProviderId = $Presets[$CboProvider.SelectedIndex].Id
  if (-not (Test-LlmReachable -Provider $script:ProviderId -BaseUrl $script:ProviderUrl)) {
    $R = [System.Windows.Forms.MessageBox]::Show(
      "LLM is not reachable yet. Continue anyway? (you can fix models next)",
      "MCAI", "YesNo", "Warning")
    if ($R -ne "Yes") { return }
  } else {
    $script:AvailableModels = Get-RemoteModels -Provider $script:ProviderId -BaseUrl $script:ProviderUrl
  }
  Go-Wizard 2
})
$BtnModelBack.Add_Click({ Go-Wizard 1 })
$BtnModelNext.Add_Click({
  if (-not $CboModel.Text.Trim()) {
    [System.Windows.Forms.MessageBox]::Show("Select or type a model name.", "MCAI") | Out-Null
    return
  }
  $script:SelectedModel = $CboModel.Text.Trim()
  try {
    Save-WizardLlmSettings
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "MCAI") | Out-Null
    return
  }
  Go-Wizard 3
})
$BtnPrereqBack.Add_Click({ Go-Wizard 2 })
$BtnPrereqNext.Add_Click({ Go-Wizard 4 })
$BtnMcBack.Add_Click({ Go-Wizard 3 })
$BtnMcNext.Add_Click({ Go-Wizard 5 })
$BtnLaunchBack.Add_Click({ Go-Wizard 4 })
$BtnFinish.Add_Click({
  Save-SetupState ([pscustomobject]@{
      completed = $true
      step      = 6
      version   = 1
      provider  = $script:ProviderId
      model     = $script:SelectedModel
      at        = (Get-Date).ToString("o")
    })
  Go-Wizard 6
})

$BtnMainStart.Add_Click({
  Start-AioStack -NoOllama:$ChkSkipOllamaM.Checked
  [System.Windows.Forms.MessageBox]::Show("Start launched. Watch the server and bot windows.", "MCAI") | Out-Null
})
$BtnMainStop.Add_Click({ Stop-AioStack })
$BtnMainSetup.Add_Click({ Go-Wizard 0 })
$BtnMainWeb.Add_Click({
  $C = Get-ConfigObject
  $H = if ($C.dashboardHost) { $C.dashboardHost } else { "127.0.0.1" }
  $P = if ($C.dashboardPort) { $C.dashboardPort } else { 8787 }
  Open-Browser "http://${H}:${P}/setup.html"
})
$BtnMainDash.Add_Click({
  $C = Get-ConfigObject
  $H = if ($C.dashboardHost) { $C.dashboardHost } else { "127.0.0.1" }
  $P = if ($C.dashboardPort) { $C.dashboardPort } else { 8787 }
  Open-Browser "http://${H}:${P}/"
})

$Form.Add_FormClosed({ $MainTimer.Stop() })

# Entry
$State = Get-SetupState
if ($ForceWizard -or -not $State.completed) {
  Go-Wizard 0
} else {
  Go-Wizard 6
}

Write-AioLog "AIO opened wizard=$([bool](-not $State.completed -or $ForceWizard))"
[System.Windows.Forms.Application]::Run($Form)
