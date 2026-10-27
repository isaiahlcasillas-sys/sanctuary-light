# Restart test: stops ONLY Sanctuary Light's own server process and checks that its supervisor
# brings it back by itself, in Offline Simulation.
#
#   restart-test.ps1              # only while Sanctuary Light is in SIM (Offline Simulation)
#   restart-test.ps1 -AnyMode     # SceneStation audit only (worksheet D1): also in Monitor/Live, asks first
#
# The process is identified by its command line: node.exe running THIS folder's
# server\src\index.ts. Eos/ETCnomad and every other program, including other node.exe
# processes, are never touched. Stopping Sanctuary Light never sends anything to Eos.
param([int]$Port = 0, [switch]$AnyMode)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
function Fail([string]$m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
if ($Port -le 0) { $Port = [int](Get-ServiceSettings).Port }

$h = Get-Health $Port
if (-not $h) { Fail "Sanctuary Light is not answering on port $Port. Open it from the desktop icon first. Nothing was stopped." }
if ($h.mode -ne 'offline') {
  if (-not $AnyMode) { Fail "Sanctuary Light is in $($h.mode) mode. Switch it to SIM first; this test runs only in Offline Simulation. Nothing was stopped." }
  $answer = Read-Host "Sanctuary Light is in $($h.mode) mode. Stop its server for the audit test? Type STOP to continue"
  if ($answer -cne 'STOP') { Write-Host 'Nothing was stopped.'; exit 0 }
}

$procs = @(Get-SanctuaryServerProcesses)
if ($procs.Count -ne 1) { Fail "Expected exactly one Sanctuary Light server process (node.exe running $($script:RepoRoot)\server\src\index.ts), found $($procs.Count). Nothing was stopped." }
$p = $procs[0]
Write-Host "Stopping only Sanctuary Light's server: node.exe, process id $($p.ProcessId)"
Write-Host "  $($p.CommandLine)"
Stop-Process -Id $p.ProcessId -Force
Write-Host 'Waiting for it to come back by itself (about 10 seconds)...'

$back = $null
for ($i = 0; $i -lt 60 -and -not $back; $i++) {
  Start-Sleep -Seconds 1
  $now = @(Get-SanctuaryServerProcesses)
  if ($now.Count -gt 0 -and $now[0].ProcessId -ne $p.ProcessId) { $back = Get-Health $Port }
}
if (-not $back) { Fail "It did not come back within 60 seconds. Use Eos as normal, then open Sanctuary Light from the desktop icon and look at the logs in $($script:LogDir)." }
if ($back.mode -ne 'offline') { Fail "It came back in $($back.mode) mode; it should always come back in offline mode. Report this." }
Write-Host "PASS: Sanctuary Light restarted by itself in Offline Simulation. No other program was stopped." -ForegroundColor Green
exit 0
