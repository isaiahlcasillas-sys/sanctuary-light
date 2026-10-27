# Supervisor for the Sanctuary Light server, started at login by the "Sanctuary Light"
# scheduled task (install.ps1). It:
#   - keeps the PC awake while it runs (SetThreadExecutionState; Windows drops the request
#     automatically if this script stops, so a crash cannot leave the PC awake forever)
#   - restarts the server after a crash (non-zero exit), waiting 10 s between attempts
#   - stops on a clean exit (code 0: quit, or another copy is already using the port)
#   - appends output to %LOCALAPPDATA%\Sanctuary Light\logs\server.log (rotated at 5 MB)
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
$log = Join-Path $script:LogDir 'server.log'
function Write-Log([string]$msg) { Add-Content -Path $log -Value ("{0}  [supervisor] {1}" -f (Get-Date -Format s), $msg) }

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
  if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) { Move-Item -Force $log "$log.1" }
  Write-Log "starting server (port $Port)"
  # One node.exe process (tsx loaded with --import, not tsx's CLI, which adds a child process
  # that could outlive a crashed parent and hold the port). cmd.exe does the redirection so
  # Node's stderr is logged as plain text. Working directory is the repo, where tsx resolves.
  & cmd.exe /d /c "`"`"$Node`" --import tsx `"$entry`" >> `"$log`" 2>&1`""
  $code = $LASTEXITCODE
  if ($code -eq 0) { Write-Log 'server exited cleanly; supervisor stopping'; break }
  Write-Log "server exited with code $code; restarting in $RestartDelaySeconds s"
  Start-Sleep -Seconds $RestartDelaySeconds
}
[void][SanctuaryLight.Power]::SetThreadExecutionState($ES_CONTINUOUS)
