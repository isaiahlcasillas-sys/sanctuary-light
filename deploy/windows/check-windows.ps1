# Read-only health check for the sanctuary Windows PC. Changes NOTHING and sends nothing to Eos.
#   powershell -ExecutionPolicy Bypass -File deploy\windows\check-windows.ps1
# [ OK ] = good   [WARN] = needs a decision   [FAIL] = fix before relying on the PC unattended
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'common.ps1')
$script:Fails = 0; $script:Warns = 0
function Ok([string]$m)   { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow; $script:Warns++ }
function Bad([string]$m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red; $script:Fails++ }
function Info([string]$m) { Write-Host "         $m" }
function Section([string]$m) { Write-Host ''; Write-Host "-- $m --" -ForegroundColor Cyan }
function Get-PowerValue([string]$sub, [string]$setting) {
  # Current AC value of a power setting from `powercfg /query` (works on any Windows language
  # because it parses the hex value, not the label text). $null if unavailable.
  $out = powercfg /query SCHEME_CURRENT $sub $setting 2>$null
  $hex = $out | Select-String -Pattern '0x[0-9a-fA-F]{8}' -AllMatches | ForEach-Object { $_.Matches } | Select-Object -Last 2 | Select-Object -First 1
  if ($hex) { return [Convert]::ToInt64($hex.Value, 16) } else { return $null }
}

$s = Get-ServiceSettings
$port = [int]$s.Port

Section 'This PC'
$os = Get-CimInstance Win32_OperatingSystem
Info "$($os.Caption) (build $($os.BuildNumber)) - $env:COMPUTERNAME - $env:PROCESSOR_ARCHITECTURE"
if ([int]$os.BuildNumber -ge 22000) { Ok 'Windows 11' } else { Warn 'Not Windows 11 (Windows 10 should work but is not tested)' }

Section 'Node.js'
$nodeCmd = Get-Command node.exe
if (-not $nodeCmd) { Bad 'Node.js not found. Install Node.js 22 LTS (x64) from nodejs.org.' } else {
  $v = (& $nodeCmd.Source -p 'process.versions.node').Trim()
  Info "$($nodeCmd.Source) - Node $v"
  $p = $v.Split('.') | ForEach-Object { [int]$_ }
  if ($p[0] -gt 20 -or ($p[0] -eq 20 -and $p[1] -ge 19)) { Ok 'Node version OK' } else { Bad 'Node is too old (needs 20.19+)' }
}

Section 'App folder'
Info $script:RepoRoot
if (Test-UnderOneDrive $script:RepoRoot) { Bad 'Folder is inside OneDrive. Move it to C:\SanctuaryLight and reinstall.' } else { Ok 'Not inside OneDrive' }
if (Test-Path (Join-Path $script:RepoRoot 'web\dist\index.html')) { Ok 'Interface is built' } else { Bad 'Interface not built (run install.ps1 or update.ps1)' }

Section 'Background service (starts at login)'
$task = Get-ScheduledTask -TaskName $script:TaskName
if (-not $task) { Bad "Not installed. Double-click deploy\windows\Install Sanctuary Light.cmd" } else {
  Ok "Scheduled task '$($script:TaskName)' is installed"
  if ($s.Node -and -not (Test-Path $s.Node)) { Bad "The Node path used by the service is missing ($($s.Node)). Re-run install.ps1." }
  $procs = @(Get-SanctuaryServerProcesses)
  if ($procs.Count -gt 0) { Ok "Server is running (process $($procs[0].ProcessId))" } else { Bad 'Server is not running. Open Sanctuary Light from the desktop icon, or check the log.' }
}

Section 'Network exposure'
$listen = @(Get-NetTCPConnection -State Listen -LocalPort $port | Select-Object -ExpandProperty LocalAddress -Unique)
if ($listen.Count -eq 0) { Warn "Nothing is listening on port $port (is the server running?)" }
elseif (($listen | Where-Object { $_ -ne '127.0.0.1' -and $_ -ne '::1' }).Count -eq 0) { Ok "Only this PC can open Sanctuary Light ($($listen -join ', '))" }
else { Warn "Other devices on the network can open Sanctuary Light ($($listen -join ', ')). Use only on an isolated lighting network." }
$up = @(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' })
if ($up.Count -gt 0) { Ok "Network adapters up: $(($up | ForEach-Object { $_.Name }) -join ', ')" }
else { Warn 'No network adapter is connected. ETC documents that same-PC (127.0.0.1) OSC needs Windows to see a network card; keep the lighting network adapter connected.' }

Section 'App responds'
$h = Get-Health $port
if (-not $h) { Bad "No answer on http://127.0.0.1:$port" } else {
  Info ($h | ConvertTo-Json -Compress)
  switch ($h.mode) {
    'offline'     { Ok 'Mode: Offline Simulation (nothing is being sent to Eos)' }
    'eos-monitor' { Ok 'Mode: Eos Monitor (read-only)' }
    'eos-live'    { Warn 'Mode: LIVE - commands go to Eos' }
  }
}
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ }
if ($edge) { Ok 'Microsoft Edge present (the launcher opens an app window)' } else { Warn 'Microsoft Edge not found; the launcher will use the default browser' }
if (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Sanctuary Light.lnk')) { Ok 'Desktop shortcut present' } else { Warn 'Desktop shortcut missing (re-run install.ps1)' }

Section 'Eos / ETCnomad on this PC (observed only)'
$eos = @(Get-Process | Where-Object { $_.ProcessName -match '^(Eos|ETCnomad)' })
if ($eos.Count -gt 0) { Ok "Eos is running ($(($eos | ForEach-Object { $_.ProcessName }) -join ', '))" } else { Warn 'No process named Eos or ETCnomad was found (a name-based guess; expected if Eos runs on another console or is closed)' }
foreach ($p in 3032, 3037, 3038) {
  $l = @(Get-NetTCPConnection -State Listen -LocalPort $p)
  if ($l.Count -gt 0) {
    $owner = (Get-Process -Id $l[0].OwningProcess).ProcessName
    Info "Port $p is listening ($owner on $(($l | ForEach-Object { $_.LocalAddress } | Select-Object -Unique) -join ', '))"
  }
}
$gadget = @(Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match 'Gadget' })
if ($gadget.Count -gt 0) { Info "USB device seen: $(($gadget | ForEach-Object { $_.FriendlyName }) -join ', ')" } else { Info 'No device named "Gadget" seen (check Eos > Displays > Output for the Gadget II status)' }
Info 'Sanctuary Light never sends DMX itself; Eos drives the Gadget II and everything after it.'

Section 'Security'
$auth = Join-Path $script:DataDir 'auth.json'
if (Test-Path $auth) {
  if ((Get-Content $auth -Raw) -match '"isDefault":\s*true') { Bad 'A default PIN (1234 / 0000) is still in use - change it in Settings > Safety & Security' } else { Ok 'Default PINs have been replaced' }
} else { Warn "No PIN file yet in $($script:DataDir) (the app has not run from the service yet)" }

Section 'Unattended recovery (after a power cut or Windows Update)'
$wl = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
if ($wl.AutoAdminLogon -eq '1') { Ok "Automatic login: $($wl.DefaultUserName)" } else { Warn 'Automatic login is off: after a restart nothing starts until someone signs in' }
$sleepAc = Get-PowerValue 'SUB_SLEEP' 'STANDBYIDLE'
if ($sleepAc -eq 0) { Ok 'Sleep on AC power: never' } elseif ($null -ne $sleepAc) { Warn "PC sleeps after $([int]($sleepAc / 60)) min on AC power when the service is not running (Settings > System > Power)" }
$usbSuspend = Get-PowerValue '2a737441-1930-4402-8d77-b2bebba308a3' '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
if ($usbSuspend -eq 1) { Warn 'USB selective suspend is ON. It can power down the ETCnomad key or Gadget II; consider turning it off (Control Panel > Power Options > Advanced).' }
elseif ($usbSuspend -eq 0) { Ok 'USB selective suspend is off' }
$fast = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power').HiberbootEnabled
if ($fast -eq 1) { Info 'Fast Startup is on (fine; a "Restart" still does a full restart)' }
$wu = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
if ($null -ne $wu.ActiveHoursStart) { Info "Windows Update active hours: $($wu.ActiveHoursStart):00 to $($wu.ActiveHoursEnd):00 (updates won't restart the PC in this window)" }
Info 'Power-on after a power cut is a BIOS/UEFI setting ("Restore on AC power loss"); it cannot be checked from Windows.'

Section 'Backups and logs'
$latest = Get-ChildItem (Join-Path $script:DataDir 'backups') -Filter 'daily-*' | Sort-Object Name | Select-Object -Last 1
if ($latest) { Ok "Latest daily backup: $($latest.Name)" } else { Warn 'No daily backup yet' }
$log = Join-Path $script:LogDir 'server.log'
$sup = Join-Path $script:LogDir 'supervisor.log'
if (Test-Path $sup) {
  $restarts = @(Select-String -Path $sup -Pattern 'restarting in' | Where-Object { $_.Line -match '^(\S+)' -and ([datetime]$Matches[1]) -gt (Get-Date).AddDays(-7) })
  if ($restarts.Count -gt 0) { Warn "The server crashed and was restarted $($restarts.Count) time(s) in the last 7 days - see $sup and server-errors.prev.log" } else { Ok 'No crashes in the last 7 days' }
}
if (Test-Path $log) {
  Info "Log: $log ($([int]((Get-Item $log).Length / 1KB)) KB)"
  if ((Get-Item $log).Length -gt 50MB) { Warn 'The log is over 50 MB. It starts fresh when Sanctuary Light restarts (Task Scheduler > Sanctuary Light > End, then open it from the desktop icon). Don't restart the PC or sign out for this: that also closes Eos.' }
  if (Get-Content $log -Tail 50 | Select-String -Pattern 'error|EADDRINUSE' -Quiet) { Warn "Recent errors in the log - open $log" }
}

Write-Host ''
Write-Host "Summary: $($script:Fails) to fix, $($script:Warns) to review.  (This check changed nothing.)"
exit 0
