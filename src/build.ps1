# build.ps1 — Compiles ZCode-RU-Setup.exe
$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptRoot
$binDir = Join-Path $repoRoot "bin"
if (-not (Test-Path $binDir)) { New-Item -Path $binDir -ItemType Directory -Force | Out-Null }

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
  $csc = (Get-Command csc.exe -ErrorAction SilentlyContinue).Source
}
if (-not $csc) { throw "C# compiler csc.exe not found." }

$sevenZip = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
if (-not $sevenZip) {
  foreach ($candidate in @('C:\Program Files\7-Zip\7z.exe', 'C:\Program Files (x86)\7-Zip\7z.exe')) {
    if (Test-Path -LiteralPath $candidate) { $sevenZip = $candidate; break }
  }
}
if (-not $sevenZip) { throw "7z.exe not found." }

# 1. Install dependencies if node_modules missing
Push-Location $repoRoot
try {
  if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
    Write-Host "Installing npm dependencies..."
    npm install --no-audit --no-fund
  }

  # 2. Package payload archive
  $payloadZip = Join-Path $scriptRoot "zcode-ru-payload.zip"
  if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }

  Write-Host "Creating payload zip..."
  $filesToPack = @("ru.json", "patch.mjs", "patch-zcode-language.ps1", "providers.config.example.json", "TRANSLATION_MAINTENANCE.md", "package.json", "package-lock.json", "node_modules")
  & $sevenZip a -tzip $payloadZip $filesToPack -r | Out-Null

  # 3. Compile C# GUI executable
  $csFile = Join-Path $scriptRoot "ZCodeRUSetup.cs"
  $manifest = Join-Path $scriptRoot "installer.manifest"
  $ico = Join-Path $scriptRoot "app.ico"
  $outFile = Join-Path $binDir "ZCode-RU-Setup.exe"

  Write-Host "Compiling $outFile..."
  & $csc /target:winexe /optimize+ `
    "/win32manifest:$manifest" `
    "/win32icon:$ico" `
    "/resource:$payloadZip,ZCodeRUSetup.zcode-ru-payload.zip" `
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Core.dll `
    "/out:$outFile" $csFile

  if ($LASTEXITCODE -ne 0) { throw "Compilation failed." }

  $portableZip = Join-Path $binDir "ZCode-RU-Portable.zip"
  if (Test-Path -LiteralPath $portableZip) { Remove-Item -LiteralPath $portableZip -Force }
  Write-Host "Creating $portableZip..."
  & $sevenZip a -tzip $portableZip (@("README.md", "LICENSE") + $filesToPack) -r | Out-Null

  # Cleanup temporary payload zip
  Remove-Item $payloadZip -Force -ErrorAction SilentlyContinue

  Write-Host "SUCCESS: $outFile built successfully ($(Get-Item $outFile | Select-Object -ExpandProperty Length) bytes)."
}
finally {
  Pop-Location
}
