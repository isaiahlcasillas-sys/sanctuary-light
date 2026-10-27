# Install Sanctuary Light on the sanctuary Windows 11 PC (the same PC that runs Eos/ETCnomad).
#
#   powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1            # localhost only (recommended)
#   ... install.ps1 -Lan          # also allow tablets on the lighting network
#   ... install.ps1 -Kiosk        # the launcher opens a full-screen Edge window
#   ... install.ps1 -OpenAtLogin  # also open the interface automatically after login
#   ... install.ps1 -DryRun       # check everything and show the plan, change nothing (used by CI)
#
# Runs as the normal Windows user (no administrator needed). Safe to re-run.
# It never touches lighting, Eos, the show file, the Gadget II or any DMX device: the app
# always starts in Offline Simulation and Live control must be armed by an operator.
param(
  [int]$Port = 4700,
  [switch]$Lan,
  [switch]$Kiosk,
  [switch]$OpenAtLogin,
  [switch]$KeepDisplayOn,
  [switch]$SkipTests,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
function Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Warn([string]$msg) { Write-Host "WARNING: $msg" -ForegroundColor Yellow }

Write-Host 'Sanctuary Light installer' -ForegroundColor Cyan
Write-Host '  It WILL: download the app''s parts, build it, run its tests (simulation only), add a'
Write-Host '          background task for this Windows user, and add desktop/Start menu icons.'
Write-Host '  It will NOT: stop or change Eos/ETCnomad, its USB license key, the show file, the'
Write-Host '          Gadget II, wireless DMX, SceneStation, drivers, or any light. No administrator'
Write-Host '          rights and no restart are needed.'
Write-Host ''

if ($env:OS -ne 'Windows_NT') { Fail 'This installer is for Windows.' }
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 22000) { Warn "This is Windows build $build. Sanctuary Light targets Windows 11 (build 22000+); Windows 10 should work but is not tested." }

$repo = $script:RepoRoot
Write-Host "Sanctuary Light folder: $repo"
if (Test-UnderOneDrive $repo) {
  Fail "The folder is inside OneDrive. OneDrive can lock or remove files while the app runs. Move it to C:\SanctuaryLight and run this again."
}
if ($repo -match '\\(Desktop|Downloads)(\\|$)') { Warn 'The folder is on the Desktop or in Downloads, where it is easy to delete by accident. C:\SanctuaryLight is recommended.' }

# Disk space for node_modules and the build.
$drive = Get-PSDrive -Name ($repo.Substring(0, 1)) -ErrorAction SilentlyContinue
if ($drive -and $drive.Free -lt 1GB) { Fail "Only $([int]($drive.Free / 1MB)) MB free on drive $($drive.Name):. Sanctuary Light needs about 1 GB. Free some space and run this again." }

# The interface port must be free, or used by an earlier copy of Sanctuary Light (re-install).
$busy = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if ($busy.Count -gt 0 -and -not (Get-Health $Port) -and -not @(Get-SanctuaryServerProcesses).Count) {
  $owner = (Get-Process -Id $busy[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
  Fail "Port $Port is already used by another program ($owner). Run the installer with a different port, e.g.:  install.ps1 -Port 4710"
}
foreach ($eosPort in 3032, 3037) {
  if ($eosPort -eq $Port) { Fail "Port $Port is an Eos OSC port. Choose another port for Sanctuary Light (default 4700)." }
}

# Eos/ETCnomad on this PC: observed only, never stopped.
$eosListening = @(Get-NetTCPConnection -State Listen -LocalPort 3032, 3037 -ErrorAction SilentlyContinue)
if ($eosListening.Count -gt 0) { Write-Host "Eos OSC port(s) $(($eosListening | ForEach-Object { $_.LocalPort } | Select-Object -Unique) -join ', ') are open on this PC. The installer leaves Eos running and doesn't connect to it." }

# Node.js
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Fail "Node.js was not found. Install Node.js 22 LTS (x64) from nodejs.org, or run:  winget install OpenJS.NodeJS.LTS   then open a NEW PowerShell window and run this again."
}
$node = $nodeCmd.Source
$nodeVer = (& $node -p 'process.versions.node').Trim()
$parts = $nodeVer.Split('.') | ForEach-Object { [int]$_ }
if ($parts[0] -lt 20 -or ($parts[0] -eq 20 -and $parts[1] -lt 19)) { Fail "Node $nodeVer is too old (needs 20.19 or newer). Install Node.js 22 LTS." }
Write-Host "Using $node (Node $nodeVer, $(& $node -p 'process.arch'))"
if ($node -match '\\(nvm|volta|fnm|scoop)\\') { Warn "Node comes from a version manager ($node). The service breaks if that version is removed. For the sanctuary PC, install Node 22 LTS from nodejs.org." }
$npm = Join-Path (Split-Path $node) 'npm.cmd'
if (-not (Test-Path $npm)) { $npm = 'npm.cmd' }

# The scheduled task that starts the supervisor at login.
$supervisor = Join-Path $PSScriptRoot 'run-server.ps1'
$argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$supervisor`"", '-Node', "`"$node`"", '-Port', "$Port")
if ($Lan) { $argList += '-Lan' }
if ($KeepDisplayOn) { $argList += '-KeepDisplayOn' }
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ($argList -join ' ') -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
# No time limit; if the supervisor itself ever dies with an error, Task Scheduler starts it again.
$taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Write-Host ''
Write-Host 'Plan:'
Write-Host "  Scheduled task '$($script:TaskName)' at login of $user (hidden, restarts after a crash)"
Write-Host "    powershell.exe $($argList -join ' ')"
Write-Host "  Data folder:   $($script:DataDir)"
Write-Host "  Interface:     http://127.0.0.1:$Port $(if ($Lan) { '(also reachable from the lighting network)' } else { '(this PC only)' })"
Write-Host "  Shortcuts:     Desktop and Start menu 'Sanctuary Light'$(if ($OpenAtLogin) { ', plus Startup folder' })"

if ($DryRun) { Write-Host ''; Write-Host 'Dry run OK: nothing was changed.'; exit 0 }

Set-Location $repo
# A running copy (re-install) holds files in node_modules open; Windows won't let npm replace them.
Stop-SanctuaryServer $Port
Write-Host ''; Write-Host 'Installing dependencies...'
& $npm ci; if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed (internet connection?). Sanctuary Light is stopped until this installer finishes; Eos is not affected. Run it again.' }
Write-Host 'Building the interface...'
& $npm run build; if ($LASTEXITCODE -ne 0) { Fail 'Build failed.' }
if (-not $SkipTests) {
  Write-Host 'Running the test suite (simulation only, nothing is sent to Eos)...'
  & $npm test; if ($LASTEXITCODE -ne 0) { Fail 'Tests failed. Nothing was installed.' }
}

New-Item -ItemType Directory -Force -Path $script:DataDir, $script:LogDir | Out-Null
[pscustomobject]@{ Port = $Port; Lan = [bool]$Lan; Kiosk = [bool]$Kiosk; Node = $node } | ConvertTo-Json | Set-Content -Path $script:SettingsFile -Encoding UTF8

# Replace any previous installation's task.
Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $script:TaskName -Description 'Sanctuary Light lighting interface (starts in Offline Simulation).' `
  -Action $action -Trigger $trigger -Settings $taskSettings -Principal $principal | Out-Null

# Shortcuts.
$launcher = Join-Path $PSScriptRoot 'open-sanctuary-light.ps1'
$icon = Join-Path $PSScriptRoot 'sanctuary-light.ico'
$shell = New-Object -ComObject WScript.Shell
function New-Shortcut([string]$path) {
  $s = $shell.CreateShortcut($path)
  $s.TargetPath = 'powershell.exe'
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
  $s.WorkingDirectory = $repo
  $s.WindowStyle = 7
  $s.Description = 'Open Sanctuary Light'
  if (Test-Path $icon) { $s.IconLocation = "$icon,0" }
  $s.Save()
}
New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Sanctuary Light.lnk')
New-Shortcut (Join-Path ([Environment]::GetFolderPath('Programs')) 'Sanctuary Light.lnk')
$startupLnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Sanctuary Light.lnk'
if ($OpenAtLogin) { New-Shortcut $startupLnk } elseif (Test-Path $startupLnk) { Remove-Item $startupLnk }

Start-ScheduledTask -TaskName $script:TaskName
$up = $null
for ($i = 0; $i -lt 30 -and -not $up; $i++) { Start-Sleep -Seconds 1; $up = Get-Health $Port }

Write-Host ''
if ($up) { Write-Host "Installed and running (mode: $($up.mode)). Sanctuary Light starts at every login and restarts if it crashes." -ForegroundColor Green }
else { Warn "Installed, but the server did not answer yet. Check $($script:LogDir)\supervisor.log and server-errors.log" }
Write-Host "  Open:  the 'Sanctuary Light' icon on the desktop (or http://127.0.0.1:$Port)"
Write-Host "  Data:  $($script:DataDir)"
Write-Host "  Logs:  $($script:LogDir) (server.log, server-errors.log, supervisor.log)"
Write-Host "  Check: double-click deploy\windows\Check Sanctuary Light.cmd (changes nothing)"
Write-Host ''
Write-Host 'No restart is needed. Please do NOT restart this PC now: on the shared PC that also closes Eos.'
Write-Host 'Sanctuary Light is in Offline Simulation: it sends nothing to Eos until you connect it yourself.'
if ($Lan) {
  Write-Host ''
  Warn "LAN access needs a Windows Firewall rule. An administrator can add one with:"
  Write-Host "  New-NetFirewallRule -DisplayName 'Sanctuary Light' -Direction Inbound -Protocol TCP -LocalPort $Port -Profile Private,Domain -Action Allow"
}
