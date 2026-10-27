# Remove the Sanctuary Light service and shortcuts. Your settings, patch, looks and backups
# in %LOCALAPPDATA%\Sanctuary Light are KEPT unless you add -RemoveData.
# Stopping Sanctuary Light never sends anything to Eos; the lights stay as Eos has them.
param([switch]$RemoveData)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

Stop-SanctuaryServer
Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false -ErrorAction SilentlyContinue
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Startup'))) {
  $lnk = Join-Path $dir 'Sanctuary Light.lnk'
  if (Test-Path $lnk) { Remove-Item $lnk }
}
Write-Host 'Service and shortcuts removed.'
if ($RemoveData) {
  $answer = Read-Host "Also DELETE all settings, patch, looks and backups in $($script:DataDir)? Type DELETE to confirm"
  if ($answer -ceq 'DELETE') { Remove-Item -Recurse -Force $script:DataDir; Write-Host 'Data deleted.' }
  else { Write-Host 'Data kept.' }
} else {
  Write-Host "Data kept in $($script:DataDir)"
}
