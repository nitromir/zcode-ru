# zcode-autopatch.ps1 — Automatic checker & patcher for ZCode Russian localization
[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$Silent
)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

$logDir = "C:\Users\Administrator\.zcode\v2\logs"
if (-not (Test-Path $logDir)) { New-Item -Path $logDir -ItemType Directory -Force | Out-Null }
$logFile = Join-Path $logDir "autopatch.log"

function Write-Log([string]$msg) {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "[$ts] $msg"
  if (-not $Silent) { Write-Host $line }
  Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

# 1. Locate ZCode
$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\ZCode'),
  (Join-Path ${env:ProgramFiles} 'ZCode'),
  (Join-Path ${env:ProgramFiles(x86)} 'ZCode')
)

$installDir = $null
foreach ($c in $candidates) {
  if (Test-Path (Join-Path $c 'ZCode.exe')) {
    $installDir = $c
    break
  }
}

if (-not $installDir) {
  Write-Log "WARN: ZCode installation not found in standard paths."
  return
}

$asar = Join-Path $installDir 'resources\app.asar'
if (-not (Test-Path $asar)) {
  Write-Log "WARN: app.asar not found at $asar"
  return
}

# 2. Check if patch is needed
$patchMjs = Join-Path $scriptDir 'patch.mjs'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Log "ERROR: Node.js not found in PATH."
  return
}

if (-not $Force) {
  & $node $patchMjs $installDir --check 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    # Already patched
    return
  }
}

Write-Log "Update detected or unpatched app.asar found ($installDir). Applying Russian localization..."

# Wait if ZCode is writing to app.asar (e.g. during update)
$retries = 5
while ($retries -gt 0) {
  try {
    $stream = [IO.File]::Open($asar, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $stream.Close()
    break
  } catch {
    Write-Log "app.asar is locked, waiting 2 seconds... ($retries retries left)"
    Start-Sleep -Seconds 2
    $retries--
  }
}

# Run patch.mjs
$out = & $node $patchMjs $installDir 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Log "SUCCESS: ZCode successfully patched to Russian (en-US base)."
} else {
  Write-Log "ERROR: Patch failed with exit code $LASTEXITCODE. Details: $($out -join "`n")"
}
