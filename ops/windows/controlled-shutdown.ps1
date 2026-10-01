param(
  [ValidateSet('Schedule','Status','Cancel','Execute')][string]$Mode,
  [string]$Time,
  [string]$Distro,
  [string]$LinuxUser,
  [string]$ControlScript
)
$ErrorActionPreference = 'Stop'
$taskName = 'AterumControlledShutdown'
$logDir = Join-Path $env:LOCALAPPDATA 'Aterum'
$logPath = Join-Path $logDir 'controlled-shutdown.log'
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
function Write-Result($value) { $value | ConvertTo-Json -Compress -Depth 5 }
if ($Mode -eq 'Status') {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (!$task) { Write-Result @{scheduled=$false}; exit 0 }
  $info = Get-ScheduledTaskInfo -TaskName $taskName
  $future = $info.NextRunTime -gt (Get-Date)
  Write-Result @{scheduled=$future; nextRunTime=$(if ($future) { $info.NextRunTime.ToString('o') } else { $null }); state=[string]$task.State; lastRunTime=$info.LastRunTime.ToString('o'); lastTaskResult=$info.LastTaskResult}
  exit 0
}
if ($Mode -eq 'Cancel') {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  Write-Result @{scheduled=$false; cancelled=[bool]$task}
  exit 0
}
if ($Mode -eq 'Schedule') {
  if ($Time -notmatch '^([01][0-9]|2[0-3]):[0-5][0-9]$') { throw 'INVALID_TIME' }
  if ($Distro -notmatch '^[A-Za-z0-9._-]+$' -or $LinuxUser -notmatch '^[a-z_][a-z0-9_-]*$' -or
      $ControlScript -notmatch '^/home/[a-z_][a-z0-9_-]*/projects/aterum/aterum_gui/scripts/aterum-control\.js$') { throw 'INVALID_HOST_CONFIG' }
  $parts = $Time.Split(':')
  $at = [DateTime]::Today.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
  $now = Get-Date
  if ($at -le $now.AddMinutes(2) -and $at -ge $now.AddMinutes(-2)) { throw 'TIME_TOO_SOON: choose a time at least 3 minutes from now' }
  if ($at -lt $now) { $at = $at.AddDays(1) }
  $day = if ($at.Date -gt $now.Date) { 'tomorrow' } else { 'today' }
  $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Mode Execute -Distro ' + $Distro + ' -LinuxUser ' + $LinuxUser + ' -ControlScript ' + $ControlScript
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -Once -At $at
  $settings = New-ScheduledTaskSettingsSet -WakeToRun:$false -StartWhenAvailable:$false
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Result @{scheduled=$true; nextRunTime=$at.ToString('o'); day=$day; localTime=$at.ToString('HH:mm')}
  exit 0
}
if ($Mode -eq 'Execute') {
  $stamp = (Get-Date).ToString('o')
  Add-Content -Path $logPath -Value "$stamp starting controlled migration"
  try {
    & wsl.exe -d $Distro -u $LinuxUser -- /usr/bin/node $ControlScript migrate 2>&1 | Out-File -FilePath $logPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'MIGRATION_FAILED' }
    $raw = & wsl.exe -d $Distro -u $LinuxUser -- /usr/bin/node $ControlScript status
    if ($LASTEXITCODE -ne 0) { throw 'STATUS_UNAVAILABLE' }
    $state = $raw | ConvertFrom-Json
    if ($state.mode -ne 'RETIRED' -or !$state.inhibited -or !$state.migrationReady -or
        @($state.containers | Where-Object { $_.running -or $_.paused -or $_.restarting }).Count -gt 0) { throw 'MIGRATION_NOT_CERTIFIED' }
    Add-Content -Path $logPath -Value "$(Get-Date -Format o) migration certified; requesting Windows shutdown"
    & shutdown.exe /s /t 60 /c 'Aterum migrated; Windows shutdown in 60 seconds'
    if ($LASTEXITCODE -ne 0) { throw 'WINDOWS_SHUTDOWN_REQUEST_FAILED' }
  } catch {
    Add-Content -Path $logPath -Value "$(Get-Date -Format o) controlled shutdown failed: $($_.Exception.Message)"
    exit 1
  }
}
