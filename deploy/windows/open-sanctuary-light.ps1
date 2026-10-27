# What the "Sanctuary Light" desktop / Start menu shortcut runs: make sure the server is
# up, then open the interface in a Microsoft Edge app window. Never starts lighting output.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'common.ps1')
$s = Get-ServiceSettings
$port = [int]$s.Port
$url = "http://127.0.0.1:$port"

if (-not (Get-Health $port)) {
  Start-ScheduledTask -TaskName $script:TaskName
  for ($i = 0; $i -lt 30 -and -not (Get-Health $port); $i++) { Start-Sleep -Seconds 1 }
}
if (-not (Get-Health $port)) {
  Add-Type -AssemblyName PresentationFramework
  [void][System.Windows.MessageBox]::Show(
    "Sanctuary Light did not start.`n`nEos keeps working normally - use Eos directly if needed.`nAsk the lighting lead, or check:`n$($script:LogDir)\server.log",
    'Sanctuary Light', 'OK', 'Error')
  exit 1
}

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge -and $s.Kiosk) { Start-Process $edge -ArgumentList "--kiosk $url --edge-kiosk-type=fullscreen --no-first-run" }
elseif ($edge) { Start-Process $edge -ArgumentList "--app=$url" }
else { Start-Process $url }
