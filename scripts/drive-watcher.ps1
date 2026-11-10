# OG-BOT drive watcher
# Runs hidden from your Windows Startup folder (installed by install-autostart.bat).
# Every 5 seconds it looks for a drive containing "OFFLINE AI\OG-BOT\launch-hub.bat".
# When that drive is plugged in (or is already in at sign-in) it runs the launcher once.
# Unplug and plug in again to relaunch. Nothing here uses the internet.

$ErrorActionPreference = 'SilentlyContinue'
$relative = 'OFFLINE AI\OG-BOT\launch-hub.bat'

# Only one watcher at a time.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\OG-BOT-Drive-Watcher', [ref]$created)
if (-not $created) { exit }

$seen = @{}
while ($true) {
  $present = @{}
  foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
    if (-not $d.IsReady) { continue }
    $launcher = Join-Path $d.RootDirectory.FullName $relative
    if (Test-Path -LiteralPath $launcher) {
      $present[$d.Name] = $true
      if (-not $seen.ContainsKey($d.Name)) {
        Start-Process -FilePath $launcher -ArgumentList 'auto' -WorkingDirectory (Split-Path $launcher) -WindowStyle Minimized
      }
    }
  }
  $seen = $present
  Start-Sleep -Seconds 5
}
