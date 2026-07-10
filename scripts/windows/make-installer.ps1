# Builds RestaurantPOS-Setup-<version>.exe -- the single file a customer runs.
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\make-installer.ps1
#
# Keep this file pure ASCII. Windows PowerShell 5.1 reads a .ps1 with no
# byte-order mark as ANSI, so a UTF-8 em dash arrives as a smart quote and
# silently terminates the string it sits in.
#
# What ends up on the customer's machine:
#   %LOCALAPPDATA%\Programs\Restaurant POS\   the program (read-only in practice)
#   %ProgramData%\RestaurantPOS\              their database, backups, signing key
#
# Nothing else. No Go, no Node.js, no separate PostgreSQL: all of it is either
# compiled in or carried in the payload.

$ErrorActionPreference = 'Stop'

$repo    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$posRoot = Split-Path -Parent $repo
$inst    = Join-Path $repo 'installer'
$payload = Join-Path $posRoot 'dist\payload'
$outDir  = Join-Path $posRoot 'dist'
$srcPg   = Join-Path $posRoot 'pgsql'
$go      = Join-Path $posRoot 'goroot\go\bin\go.exe'
if (-not (Test-Path $go)) { $go = 'go' }

$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 not found. Install it from https://jrsoftware.org/isdl.php' }

if (-not (Test-Path (Join-Path $srcPg 'bin\pg_ctl.exe'))) { throw "Portable PostgreSQL not found at $srcPg" }
if (-not (Test-Path (Join-Path $inst 'MicrosoftEdgeWebview2Setup.exe'))) {
  throw "Missing $inst\MicrosoftEdgeWebview2Setup.exe - download it from https://go.microsoft.com/fwlink/p/?LinkId=2124703"
}

if (Test-Path $payload) { Remove-Item $payload -Recurse -Force }
New-Item -ItemType Directory -Force -Path $payload | Out-Null

# --- 1. the program ----------------------------------------------------------
Write-Host "[1/5] Building RestaurantPOS.exe..."
Push-Location (Join-Path $repo 'backend')
# -H windowsgui: no console window behind the app.
& $go build -trimpath -ldflags "-H windowsgui -s -w" -o (Join-Path $payload 'RestaurantPOS.exe') ./cmd/pos-desktop
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'build failed' }
Pop-Location

# --- 2. the web UI -----------------------------------------------------------
Write-Host "[2/5] Building the web UI..."
$frontend = Join-Path $repo 'frontend'
$viteJs   = Join-Path $frontend 'node_modules\vite\bin\vite.js'
if (-not (Test-Path $viteJs)) { throw "vite not installed. Run npm install in $frontend" }
Push-Location $frontend
$env:VITE_SOURCEMAP = 'false'   # never ship the TypeScript source to a customer
& node $viteJs build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'frontend build failed' }
Pop-Location
if (Get-ChildItem (Join-Path $frontend 'dist') -Recurse -Filter '*.map' -ErrorAction SilentlyContinue) {
  throw 'Refusing to package: source maps are present in frontend\dist'
}
Copy-Item (Join-Path $frontend 'dist') (Join-Path $payload 'web') -Recurse

# --- 3. PostgreSQL, trimmed and made self-sufficient -------------------------
Write-Host "[3/5] Copying PostgreSQL..."
foreach ($sub in 'bin', 'lib', 'share') {
  Copy-Item (Join-Path $srcPg $sub) (Join-Path $payload "pgsql\$sub") -Recurse
}

# PostgreSQL is built with MSVC and imports vcruntime140.dll. That DLL ships with
# the Visual C++ redistributable, which a clean Windows does NOT have. Without
# these files postgres.exe simply fails to start on the customer's machine and
# the program looks broken for a reason that has nothing to do with it.
# Microsoft permits shipping them beside the application.
$crtDirs = Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft Visual Studio" -Directory -ErrorAction SilentlyContinue |
           ForEach-Object { Get-ChildItem "$($_.FullName)\*\VC\Redist\MSVC\*\x64\Microsoft.VC*.CRT" -Directory -ErrorAction SilentlyContinue }
$crt = $crtDirs | Select-Object -Last 1
if (-not $crt) { throw 'Visual C++ redistributable DLLs not found. Install the VS Build Tools "C++ build tools" workload.' }

$needed = 'vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll','msvcp140_1.dll','msvcp140_2.dll','msvcp140_atomic_wait.dll','concrt140.dll'
foreach ($d in $needed) {
  $src = Join-Path $crt.FullName $d
  if (-not (Test-Path $src)) { throw "Missing runtime DLL: $src" }
  Copy-Item $src (Join-Path $payload "pgsql\bin\$d") -Force
}
Write-Host "      bundled $($needed.Count) C++ runtime DLLs from $($crt.FullName)"

# --- 4. schema + licence -----------------------------------------------------
# database\demo is deliberately NOT copied. The trial relaxes the forced password
# change; a real installation must not.
Write-Host "[4/5] Copying the database schema..."
Copy-Item (Join-Path $repo 'database\init') (Join-Path $payload 'database\init') -Recurse
Copy-Item (Join-Path $repo 'LICENSE')   (Join-Path $payload 'LICENSE')
Copy-Item (Join-Path $repo 'NOTICE.md') (Join-Path $payload 'NOTICE.md') -ErrorAction SilentlyContinue

# --- 5. checks, then compile the installer -----------------------------------
Write-Host "[5/5] Checking the payload, then compiling..."
$leaks = Get-ChildItem $payload -Recurse -File -Force |
         Where-Object { $_.Name -in @('jwt.key','db.pass','portable.marker','.env') -or $_.Extension -in @('.pem','.key','.map','.dump') }
if ($leaks) {
  $leaks | ForEach-Object { Write-Host "  LEAK: $($_.FullName)" -ForegroundColor Red }
  throw 'Refusing to package: secrets, source maps or customer data in the payload.'
}
if (Test-Path (Join-Path $payload 'pgdata')) { throw 'Refusing to package: pgdata is in the payload.' }
if (Test-Path (Join-Path $payload 'database\demo')) { throw 'Refusing to package: the demo seed would disable the forced password change.' }
foreach ($f in 'RestaurantPOS.exe','web\index.html','pgsql\bin\postgres.exe','pgsql\bin\vcruntime140.dll','database\init\01_schema.sql','LICENSE') {
  if (-not (Test-Path (Join-Path $payload $f))) { throw "Refusing to package: missing $f" }
}

& $iscc "/DPayloadDir=$payload" "/DOutputDir=$outDir" (Join-Path $inst 'pos.iss')
if ($LASTEXITCODE -ne 0) { throw 'ISCC failed' }

$setup = Get-ChildItem $outDir -Filter 'RestaurantPOS-Setup-*.exe' | Sort-Object LastWriteTime | Select-Object -Last 1
$payloadMB = [math]::Round((Get-ChildItem $payload -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host ""
Write-Host "Done."
Write-Host "  payload: $payload  ($payloadMB MB)"
Write-Host "  setup:   $($setup.FullName)  ($([math]::Round($setup.Length/1MB,1)) MB)"
