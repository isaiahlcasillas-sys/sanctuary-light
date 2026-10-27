# Shared helpers for the Sanctuary Light Windows scripts (dot-sourced). PowerShell 5.1 compatible.
# Nothing here sends anything to Eos.

$script:TaskName   = 'Sanctuary Light'
$script:RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:DataDir    = Join-Path $env:LOCALAPPDATA 'Sanctuary Light'
$script:LogDir     = Join-Path $script:DataDir 'logs'
$script:SettingsFile = Join-Path $script:DataDir 'service.json'

function Get-ServiceSettings {
  # Port and options chosen at install time (written by install.ps1).
  if (Test-Path $script:SettingsFile) { return Get-Content $script:SettingsFile -Raw | ConvertFrom-Json }
  return [pscustomobject]@{ Port = 4700; Lan = $false; Kiosk = $false; Node = $null }
}

function Get-Health([int]$Port) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri ("http://127.0.0.1:{0}/api/health" -f $Port)
    $j = $r.Content | ConvertFrom-Json
    if ($j.app -eq 'sanctuary-light') { return $j }
  } catch { }
  return $null
}

function Get-SanctuaryServerProcesses {
  # node.exe processes running this repository's server.
  $entry = Join-Path $script:RepoRoot 'server\src\index.ts'
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($entry) }
}

function Stop-SanctuaryServer {
  # Stops the supervisor task and the server. Stopping never sends anything to Eos:
  # the lights simply stay as Eos has them.
  try { Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue } catch { }
  Get-SanctuaryServerProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}

function Test-UnderOneDrive([string]$Path) {
  foreach ($od in @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer)) {
    if ($od -and $Path.StartsWith($od, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}
