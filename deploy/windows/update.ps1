# Update Sanctuary Light on the sanctuary PC. Never run during a service.
#   powershell -ExecutionPolicy Bypass -File deploy\windows\update.ps1
# Refuses unless the app is in Offline Simulation. Backs up the configuration first and
# rolls the code back if installing, building or testing fails. Never touches Eos.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
function Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

$s = Get-ServiceSettings
$port = [int]$s.Port
Set-Location $script:RepoRoot
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { Fail 'Git is not installed (winget install Git.Git). Updates need the folder to be a git clone.' }
if (-not (Test-Path (Join-Path $script:RepoRoot '.git'))) { Fail 'This folder is not a git clone, so it cannot be updated automatically. See docs/INSTALL_WINDOWS.md.' }

$health = Get-Health $port
if (-not $health -and (Get-SanctuaryServerProcesses)) { Fail "The server is running but not answering on port $port, so its mode can't be confirmed. Not updating." }
if ($health -and $health.mode -ne 'offline') { Fail 'Sanctuary Light is connected to Eos (Monitor or Live). Switch to SIM first, outside a service.' }

$config = Join-Path $script:DataDir 'config.json'
if (Test-Path $config) {
  $backups = Join-Path $script:DataDir 'backups'
  New-Item -ItemType Directory -Force -Path $backups | Out-Null
  Copy-Item $config (Join-Path $backups ("pre-update-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
  Write-Host 'Configuration backed up.'
}

$prev = (git rev-parse HEAD).Trim()
Write-Host "Current version: $(git log -1 --format='%h %s')"
git pull --ff-only
if ($LASTEXITCODE -ne 0) { Fail 'git pull failed (local changes?). Nothing was changed.' }
if ((git rev-parse HEAD).Trim() -eq $prev) { Write-Host 'Already up to date.'; exit 0 }

function Invoke-Rollback {
  Write-Host "Update failed - returning to the previous version ($prev)." -ForegroundColor Red
  git reset -q --hard $prev
  npm.cmd ci; npm.cmd run build
  Write-Host 'Rolled back. The app was not restarted, so it keeps running the old version.'
  exit 1
}
npm.cmd ci;          if ($LASTEXITCODE -ne 0) { Invoke-Rollback }
npm.cmd run build;   if ($LASTEXITCODE -ne 0) { Invoke-Rollback }
npm.cmd test;        if ($LASTEXITCODE -ne 0) { Invoke-Rollback }

Stop-SanctuaryServer
Start-ScheduledTask -TaskName $script:TaskName
Write-Host "Updated to $(git log -1 --format='%h %s'). The app restarted in Offline Simulation."
