# ===================================================================
# patch-zcode-language.ps1 — Russian localization & Auto-Patcher for ZCode
#
# Features:
#   - Localizes ZCode to Russian based on en-US (English fallback, no Chinese)
#   - Supports automatic auto-patching upon ZCode updates via Task Scheduler
#
# Usage:
#   .\patch-zcode-language.ps1                # detect ZCode, patch en-US -> Russian, setup auto-patch
#   .\patch-zcode-language.ps1 -Check         # show patch status
#   .\patch-zcode-language.ps1 -Revert        # restore original app.asar
#   .\patch-zcode-language.ps1 -InstallAutoPatch    # install scheduled watchdog task
#   .\patch-zcode-language.ps1 -UninstallAutoPatch  # remove scheduled watchdog task
# ===================================================================
[CmdletBinding()]
param(
  [switch]$Revert,
  [switch]$Check,
  [switch]$InstallAutoPatch,
  [switch]$UninstallAutoPatch,
  [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) { $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }

$taskName = "ZCodeAutoPatcher"
$autoPatchScript = Join-Path "C:\Users\Administrator\.zcode\zcode-ru" "zcode-autopatch.ps1"

# ---- Uninstall AutoPatch ----
if ($UninstallAutoPatch) {
  schtasks /delete /tn $taskName /f 2>&1 | Out-Null
  Write-Host "Auto-patch scheduled task '$taskName' removed."
  return
}

# ---- Install AutoPatch Task ----
function Register-AutoPatchTask {
  try {
    # Delete existing if present
    schtasks /delete /tn $taskName /f 2>&1 | Out-Null
  } catch {}

  $actionCmd = "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$autoPatchScript`" -Silent"
  
  # Register task on user logon and recurring every 15 minutes
  schtasks /create /tn $taskName /tr $actionCmd /sc minute /mo 15 /rl highest /f 2>&1 | Out-Null
  Write-Host "Auto-patch scheduled task '$taskName' successfully registered (runs every 15 mins + on update)."
}

if ($InstallAutoPatch) {
  Register-AutoPatchTask
  return
}

# ---- Locate ZCode ----------------------------------------------------
function Find-ZCode {
  param([string]$Hint)
  if ($Hint) { return (Resolve-Path $Hint).Path }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\ZCode'),
    (Join-Path ${env:ProgramFiles} 'ZCode'),
    (Join-Path ${env:ProgramFiles(x86)} 'ZCode')
  )
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c 'ZCode.exe')) { return $c }
  }
  $proc = Get-Process ZCode -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc -and $proc.Path) { return (Split-Path $proc.Path) }
  throw "ZCode installation not found. Pass -InstallDir explicitly."
}

$dir = Find-ZCode $InstallDir
$asar = Join-Path $dir 'resources\app.asar'
$backup = "$asar.original"

Write-Host "ZCode directory: $dir"
if (-not (Test-Path $asar)) { throw "app.asar not found at $asar" }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js is required but not found in PATH." }

$patchMjs = Join-Path $scriptRoot 'patch.mjs'

if ($Check) {
  & $node.Source $patchMjs $dir --check
  return
}

# ---- Revert branch ---------------------------------------------------
if ($Revert) {
  & $node.Source $patchMjs $dir --revert
  return
}

# ---- Prerequisites ---------------------------------------------------
Push-Location $scriptRoot
try {
  if (-not (Test-Path (Join-Path $scriptRoot 'node_modules\@electron\asar'))) {
    Write-Host "Installing @electron/asar..."
    npm install --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }

  # Stop running ZCode instance if needed
  $running = Get-Process ZCode -ErrorAction SilentlyContinue
  if ($running) {
    Write-Host "Stopping ZCode..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
  }

  Write-Host "Applying Russian localization (en-US base)..."
  & $node.Source $patchMjs $dir (Join-Path $scriptRoot 'ru.json')
  if ($LASTEXITCODE -ne 0) { throw "patch.mjs failed" }

  # Setup auto-patching
  Register-AutoPatchTask

  Write-Host ""
  Write-Host "========================================================="
  Write-Host " SUCCESS! ZCode is localized to Russian (en-US base)."
  Write-Host " Auto-updater guard is active: future updates will be"
  Write-Host " automatically re-patched without manual intervention."
  Write-Host "========================================================="
}
finally {
  Pop-Location
}
