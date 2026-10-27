# Remove Sanctuary Light's background task and shortcuts. Your settings, patch, looks and
# backups in %LOCALAPPDATA%\Sanctuary Light are KEPT unless you add -RemoveData.
#
#   uninstall.ps1             # asks before removing anything
#   uninstall.ps1 -Yes        # no question (used by CI)
#   uninstall.ps1 -DryRun     # show what would be removed, change nothing
#
# It only removes what the installer added. It never touches Eos/ETCnomad, its USB license key,
# the show file, the Gadget II, wireless DMX or SceneStation. Stopping Sanctuary Light never
# sends anything to Eos: the lights stay exactly as Eos has them.
param([switch]$RemoveData, [switch]$Yes, [switch]$DryRun)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

$shortcuts = foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Startup'))) {
  $lnk = Join-Path $dir 'Sanctuary Light.lnk'
  if (Test-Path $lnk) { $lnk }
}
$task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue

Write-Host 'This removes:'
Write-Host "  - the background task '$($script:TaskName)'$(if (-not $task) { ' (not installed)' })"
foreach ($l in $shortcuts) { Write-Host "  - $l" }
Write-Host "  - running Sanctuary Light server processes from $($script:RepoRoot)"
Write-Host 'It does NOT touch Eos/ETCnomad, its USB key, show files, the Gadget II, wireless DMX or SceneStation.'
Write-Host "Your settings and backups stay in $($script:DataDir)$(if ($RemoveData) { ' (you will be asked about deleting them)' })."
Write-Host "The program folder $($script:RepoRoot) is left in place; delete it yourself afterwards if you like."

if ($DryRun) { Write-Host ''; Write-Host 'Dry run: nothing was changed.'; exit 0 }
if (-not $Yes) {
  $answer = Read-Host 'Remove Sanctuary Light now? Type YES to continue'
  if ($answer -cne 'YES') { Write-Host 'Nothing was changed.'; exit 0 }
}

Stop-SanctuaryServer
Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false -ErrorAction SilentlyContinue
foreach ($l in $shortcuts) { Remove-Item $l -ErrorAction SilentlyContinue }
Write-Host 'Sanctuary Light was removed. Eos was not touched.'
if ($RemoveData) {
  $answer = Read-Host "Also DELETE all settings, patch, looks and backups in $($script:DataDir)? Type DELETE to confirm"
  if ($answer -ceq 'DELETE') { Remove-Item -Recurse -Force $script:DataDir; Write-Host 'Data deleted.' }
  else { Write-Host 'Data kept.' }
} else {
  Write-Host "Data kept in $($script:DataDir)"
}
