# Restore a Sanctuary Light configuration file when Settings -> Backup -> Restore can't be used.
# Nothing is sent to Eos; the app restarts in Offline Simulation.
#   powershell -ExecutionPolicy Bypass -File deploy\windows\restore-backup.ps1 "$env:LOCALAPPDATA\Sanctuary Light\backups\daily-2026-11-01.json"
param([string]$Backup)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$backups = Join-Path $script:DataDir 'backups'
if (-not $Backup -or -not (Test-Path $Backup)) {
  Write-Host 'Usage: restore-backup.ps1 <backup.json>'
  Write-Host 'Available backups (newest first):'
  Get-ChildItem $backups -Filter *.json -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 20 | ForEach-Object { "  $($_.FullName)" }
  exit 1
}
$tmp = Join-Path $script:DataDir 'restore.tmp'
# Accept either a raw config.json copy or a "Download backup" file ({ config: ... }).
# Node does the check and copy so the JSON is passed through unchanged. (The script avoids
# double quotes: Windows PowerShell 5.1 strips them from native-command arguments.)
$node = (Get-ServiceSettings).Node
if (-not $node) { $node = 'node.exe' }
& $node -e @'
const fs = require(`fs`); const j = JSON.parse(fs.readFileSync(process.argv[1], `utf8`));
const c = j.config ?? j;
if (!c.settings || !Array.isArray(c.fixtures)) { console.error(`Not a Sanctuary Light configuration.`); process.exit(1); }
fs.writeFileSync(process.argv[2], JSON.stringify(c, null, 2));
'@ $Backup $tmp
if ($LASTEXITCODE -ne 0) { exit 1 }
$answer = Read-Host "Replace the current configuration with $(Split-Path $Backup -Leaf)? [y/N]"
if ($answer -ne 'y' -and $answer -ne 'Y') { Remove-Item $tmp; Write-Host 'Cancelled.'; exit 0 }

Stop-SanctuaryServer
$config = Join-Path $script:DataDir 'config.json'
if (Test-Path $config) {
  New-Item -ItemType Directory -Force -Path $backups | Out-Null
  Copy-Item $config (Join-Path $backups ("pre-restore-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
}
Move-Item -Force $tmp $config
Start-ScheduledTask -TaskName $script:TaskName
Write-Host 'Restored. The app restarted in Offline Simulation; older formats are upgraded automatically.'
