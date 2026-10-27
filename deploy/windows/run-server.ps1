# Supervisor for the Sanctuary Light server, started at login by the "Sanctuary Light"
# scheduled task (install.ps1). It:
#   - keeps the PC awake while it runs (SetThreadExecutionState; Windows drops the request
#     automatically if this script stops, so a crash cannot leave the PC awake forever)
#   - restarts the server after a crash (non-zero exit), waiting 10 s between attempts
#   - stops on a clean exit (code 0: quit, or another copy is already using the port)
#   - logs to %LOCALAPPDATA%\Sanctuary Light\logs: server.log / server-errors.log for the
#     current run (the previous run's are kept as *.prev.log) and supervisor.log
# The server always starts in Offline Simulation; nothing here can arm Live control, and
# stopping or restarting never sends anything to Eos.
param(
  [Parameter(Mandatory = $true)][string]$Node,
  [int]$Port = 4700,
  [switch]$Lan,
  [switch]$KeepDisplayOn,
  [int]$RestartDelaySeconds = 10
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
$log = Join-Path $script:LogDir 'server.log'           # server output (this run)
$errLog = Join-Path $script:LogDir 'server-errors.log' # server errors (this run)
$supLog = Join-Path $script:LogDir 'supervisor.log'    # starts, exits and restarts
function Write-Log([string]$msg) {
  if ((Test-Path $supLog) -and ((Get-Item $supLog).Length -gt 1MB)) { Move-Item -Force $supLog "$supLog.1" }
  Add-Content -Path $supLog -Value ("{0}  {1}" -f (Get-Date -Format s), $msg)
}

Add-Type -Namespace SanctuaryLight -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES_CONTINUOUS = [uint32]2147483648; $ES_SYSTEM_REQUIRED = [uint32]1; $ES_DISPLAY_REQUIRED = [uint32]2
$flags = $ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED
if ($KeepDisplayOn) { $flags = $flags -bor $ES_DISPLAY_REQUIRED }
[void][SanctuaryLight.Power]::SetThreadExecutionState($flags)

$env:NODE_ENV = 'production'
$env:SANCTUARY_DATA_DIR = $script:DataDir
$env:PORT = "$Port"
$env:SANCTUARY_PREVENT_SLEEP = 'system'
if ($Lan) { $env:HOST = '0.0.0.0' } else { Remove-Item Env:HOST -ErrorAction SilentlyContinue }
$entry = Join-Path $script:RepoRoot 'server\src\index.ts'
Set-Location $script:RepoRoot

while ($true) {
  # Keep the previous run's output (the reason for a crash) next to this run's.
  foreach ($f in $log, $errLog) { if (Test-Path $f) { Move-Item -Force $f ($f -replace '\.log$', '.prev.log') } }
  Write-Log "starting server (port $Port)"
  # One node.exe process: tsx is loaded with --import (tsx's CLI would add a child process that
  # could outlive a crashed parent and hold the port). It resolves from the repo folder.
  $p = Start-Process -FilePath $Node -ArgumentList @('--import', 'tsx', "`"$entry`"") -WorkingDirectory $script:RepoRoot `
    -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError $errLog
  $null = $p.Handle   # keeps ExitCode readable after the process ends (Windows PowerShell quirk)
  $p.WaitForExit()
  $code = $p.ExitCode
  if ($code -eq 0) { Write-Log 'server exited cleanly; supervisor stopping'; break }
  $last = if (Test-Path $errLog) { (Get-Content $errLog -Tail 3) -join ' | ' } else { '' }
  Write-Log "server exited with code $code; restarting in $RestartDelaySeconds s. $last"
  Start-Sleep -Seconds $RestartDelaySeconds
}
[void][SanctuaryLight.Power]::SetThreadExecutionState($ES_CONTINUOUS)
