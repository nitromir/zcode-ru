# patch-zcode-language.ps1 — ручной русификатор ZCode
# Не меняет пользовательские настройки и не создаёт фоновых задач.
[CmdletBinding()]
param(
  [switch]$Revert,
  [switch]$Check,
  [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) { $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }

function Find-ZCode {
  param([string]$Hint)
  if ($Hint) { return (Resolve-Path -LiteralPath $Hint).Path }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\ZCode'),
    (Join-Path ${env:ProgramFiles} 'ZCode'),
    (Join-Path ${env:ProgramFiles(x86)} 'ZCode')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'ZCode.exe')) { return $candidate }
  }
  throw 'ZCode installation not found. Pass -InstallDir explicitly.'
}

$dir = Find-ZCode $InstallDir
$asar = Join-Path $dir 'resources\app.asar'
$node = Get-Command node -ErrorAction SilentlyContinue
$patchMjs = Join-Path $scriptRoot 'patch.mjs'

if (-not (Test-Path -LiteralPath $asar)) { throw "app.asar not found at $asar" }
if (-not $node) { throw 'Node.js is required but was not found in PATH.' }

if ($Check) {
  & $node.Source $patchMjs $dir --check
  exit $LASTEXITCODE
}

if ($Revert) {
  & $node.Source $patchMjs $dir --revert
  exit $LASTEXITCODE
}

$running = Get-Process ZCode -ErrorAction SilentlyContinue
if ($running) {
  throw 'Close ZCode completely before applying the patch. No processes were terminated.'
}

Push-Location $scriptRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $scriptRoot 'node_modules\@electron\asar'))) {
    Write-Host 'Installing @electron/asar...'
    npm install --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
  }

  Write-Host 'Applying Russian localization (en-US base)...'
  & $node.Source $patchMjs $dir (Join-Path $scriptRoot 'ru.json')
  if ($LASTEXITCODE -ne 0) { throw 'patch.mjs failed' }

  Write-Host ''
  Write-Host 'SUCCESS: Russian localization installed.'
  Write-Host 'Open ZCode Settings -> Language and select English (the label is Russian).'
  Write-Host 'After a ZCode update, close it and run this script again.'
}
finally {
  Pop-Location
}
