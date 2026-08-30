# zcode-watcher.ps1 — Real-time file system watcher for ZCode app.asar updates
$ErrorActionPreference = 'SilentlyContinue'
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$autopatch = Join-Path $scriptDir 'zcode-autopatch.ps1'

$resourcesDir = "C:\Program Files\ZCode\resources"
if (-not (Test-Path $resourcesDir)) {
  $resourcesDir = Join-Path $env:LOCALAPPDATA 'Programs\ZCode\resources'
}
if (-not (Test-Path $resourcesDir)) {
  Write-Host "ZCode resources directory not found."
  exit 1
}

Write-Host "Watching $resourcesDir for app.asar updates..."

$fsw = New-Object IO.FileSystemWatcher $resourcesDir
$fsw.Filter = "*app*.asar*"
$fsw.NotifyFilter = [IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::LastWrite -bor [IO.NotifyFilters]::Size
$fsw.EnableRaisingEvents = $true

$action = {
  $path = $Event.SourceEventArgs.FullPath
  $changeType = $Event.SourceEventArgs.ChangeType
  if ($path -like "*app.asar" -and $path -notlike "*app.asar.original*" -and $path -notlike "*_asar_work*") {
    Start-Sleep -Seconds 3
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Administrator\.zcode\zcode-ru\zcode-autopatch.ps1" -Silent
  }
}

Register-ObjectEvent $fsw 'Created' -Action $action | Out-Null
Register-ObjectEvent $fsw 'Changed' -Action $action | Out-Null
Register-ObjectEvent $fsw 'Renamed' -Action $action | Out-Null

# Initial check on launch
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $autopatch -Silent

while ($true) {
  Start-Sleep -Seconds 60
}
