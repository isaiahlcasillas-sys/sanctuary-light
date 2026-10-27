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
  # node.exe processes running this repository's server: the supervised one
  # (...\server\src\index.ts) or one started by hand with `npm start` (tsx ... src/index.ts).
  $root = $script:RepoRoot
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match 'index\.ts' }
}

function Get-RepoHelperProcesses {
  # esbuild.exe started by tsx from this repository's node_modules. It holds files open, so
  # npm ci can't replace node_modules until it has exited.
  $root = $script:RepoRoot
  Get-CimInstance Win32_Process -Filter "Name = 'esbuild.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) }
}

function Stop-SanctuaryServer([int]$Port = 0) {
  # Stops the supervisor task and the server, then waits until its files and port are free.
  # Stopping never sends anything to Eos: the lights simply stay as Eos has them.
  if ($Port -le 0) { $Port = [int](Get-ServiceSettings).Port }
  try { Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue } catch { }
  @(Get-SanctuaryServerProcesses) + @(Get-RepoHelperProcesses) | Where-Object { $_ } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  for ($i = 0; $i -lt 30; $i++) {
    $busy = @(Get-SanctuaryServerProcesses).Count + @(Get-RepoHelperProcesses).Count +
      @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count
    if ($busy -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "WARNING: something is still using port $Port or the app's files. Close other copies of Sanctuary Light." -ForegroundColor Yellow
}

function Test-UnderOneDrive([string]$Path) {
  foreach ($od in @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer)) {
    if ($od -and $Path.StartsWith($od, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}
