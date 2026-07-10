# Assembles a self-contained trial copy of the POS that a tester can unzip and run.
#
# The output folder has no dependency on this machine: it carries its own
# PostgreSQL, its own database (created on first launch), and the web UI is
# served by the Go binary itself, so Node.js is not needed.
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\make-demo.ps1
#
# Produces:  <POS_ROOT>\dist\POS-Trial\   and   <POS_ROOT>\dist\POS-Trial.zip

$ErrorActionPreference = 'Stop'

$repo    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # scripts\windows -> scripts -> repo
$posRoot = Split-Path -Parent $repo
$out     = Join-Path $posRoot 'dist\POS-Trial'
$zip     = Join-Path $posRoot 'dist\POS-Trial.zip'
$srcPg   = Join-Path $posRoot 'pgsql'
$go      = Join-Path $posRoot 'goroot\go\bin\go.exe'
if (-not (Test-Path $go)) { $go = 'go' }

Write-Host "repo:    $repo"
Write-Host "output:  $out"

if (-not (Test-Path (Join-Path $srcPg 'bin\pg_ctl.exe'))) {
  throw "Portable PostgreSQL not found at $srcPg"
}

# --- clean output ------------------------------------------------------------
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null

# --- 1. backend --------------------------------------------------------------
Write-Host "`n[1/6] Building the backend..."
Push-Location (Join-Path $repo 'backend')
& $go build -trimpath -ldflags "-s -w" -o (Join-Path $out 'app\pos-backend.exe') .
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'backend build failed' }
Pop-Location

# --- 2. frontend -------------------------------------------------------------
Write-Host "[2/6] Building the web UI..."
$frontend = Join-Path $repo 'frontend'
$viteJs   = Join-Path $frontend 'node_modules\vite\bin\vite.js'
if (-not (Test-Path $viteJs)) { throw "vite not installed. Run: npm install  (in $frontend)" }

# Call vite.js through node directly. `npx` resolves its binary from the cwd it
# happens to inherit, which is not reliable when this script is invoked from
# elsewhere.
Push-Location $frontend
$env:VITE_SOURCEMAP = 'false'   # never ship the TypeScript source to a customer
& node $viteJs build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'frontend build failed' }
Pop-Location

$dist = Join-Path $frontend 'dist'
if (Get-ChildItem $dist -Recurse -Filter '*.map' -ErrorAction SilentlyContinue) {
  throw 'Refusing to package: source maps are present in frontend\dist'
}
Copy-Item $dist (Join-Path $out 'app\web') -Recurse

# --- 3. PostgreSQL (trimmed) -------------------------------------------------
# bin/lib/share are the server and its runtime files. doc, include, pgAdmin 4 and
# StackBuilder are ~680 MB of things a POS never touches.
Write-Host "[3/6] Copying PostgreSQL (bin, lib, share only)..."
foreach ($sub in 'bin', 'lib', 'share') {
  Copy-Item (Join-Path $srcPg $sub) (Join-Path $out "pgsql\$sub") -Recurse
}

# --- 4. schema + demo seed ---------------------------------------------------
Write-Host "[4/6] Copying the database schema..."
Copy-Item (Join-Path $repo 'database\init') (Join-Path $out 'database\init') -Recurse
Copy-Item (Join-Path $repo 'database\demo') (Join-Path $out 'database\demo') -Recurse

# --- 5. launchers + config ---------------------------------------------------
Write-Host "[5/6] Writing launchers and config..."
Copy-Item (Join-Path $PSScriptRoot 'demo-start.bat') (Join-Path $out 'START.bat')
Copy-Item (Join-Path $PSScriptRoot 'demo-stop.bat')  (Join-Path $out 'STOP.bat')
New-Item -ItemType Directory -Force -Path (Join-Path $out 'backups') | Out-Null

# Arabic docs live in .txt, never in a .bat: cmd re-reads a running batch file and
# non-ASCII bytes shift its read offset, silently corrupting later lines.
# UTF-8 with a BOM so Notepad opens it right-to-left correctly on any Windows.
$utf8bom = New-Object System.Text.UTF8Encoding $true
foreach ($doc in @{ 'demo-readme.txt' = 'READ-ME-FIRST.txt'; 'demo-accounts.txt' = 'ACCOUNTS.txt' }.GetEnumerator()) {
  $src = Join-Path $PSScriptRoot $doc.Key
  if (-not (Test-Path $src)) { throw "Missing doc: $src" }
  [System.IO.File]::WriteAllText((Join-Path $out $doc.Value), (Get-Content $src -Raw -Encoding UTF8), $utf8bom)
}

# DB_PORT matches the 5433 that START.bat writes into postgresql.conf.
# The JWT signing key is NOT shipped: the backend generates a fresh one per
# installation on first boot, so no two copies can forge each other's tokens.
@'
DB_HOST=127.0.0.1
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=postgres123
DB_NAME=pos_system
DB_SSLMODE=disable
PORT=8080
GIN_MODE=release
'@ | Set-Content -Path (Join-Path $out 'app\.env') -Encoding ascii

Copy-Item (Join-Path $repo 'LICENSE')   (Join-Path $out 'LICENSE')   -ErrorAction SilentlyContinue
Copy-Item (Join-Path $repo 'NOTICE.md') (Join-Path $out 'NOTICE.md') -ErrorAction SilentlyContinue

# --- 6. leak check + zip -----------------------------------------------------
Write-Host "[6/6] Checking the package, then zipping..."
$leaks = Get-ChildItem $out -Recurse -File -Force |
         Where-Object { $_.Name -in @('jwt.key') -or $_.Extension -in @('.pem', '.key') -or $_.Name -like '*.dump' }
if ($leaks) {
  $leaks | ForEach-Object { Write-Host "  LEAK: $($_.FullName)" -ForegroundColor Red }
  throw 'Refusing to package: secrets or customer data found in the output.'
}
if (Test-Path (Join-Path $out 'pgdata')) { throw 'Refusing to package: pgdata (live database) is in the output.' }

# A .bat with non-ASCII bytes corrupts itself as cmd re-reads it mid-run.
foreach ($b in 'START.bat', 'STOP.bat') {
  if ([System.IO.File]::ReadAllBytes((Join-Path $out $b)) | Where-Object { $_ -gt 127 }) {
    throw "Refusing to package: $b contains non-ASCII bytes."
  }
}

# START.bat points the tester at these. Shipping without them is how you get a
# launcher that tells someone to read a file that does not exist.
foreach ($f in 'READ-ME-FIRST.txt', 'ACCOUNTS.txt', 'LICENSE', 'app\.env', 'app\web\index.html', 'database\demo\demo_accounts.sql') {
  if (-not (Test-Path (Join-Path $out $f))) { throw "Refusing to package: missing $f" }
}

Compress-Archive -Path $out -DestinationPath $zip -CompressionLevel Optimal

$folderMB = [math]::Round((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
$zipMB    = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "`nDone."
Write-Host "  folder: $out  ($folderMB MB)"
Write-Host "  zip:    $zip  ($zipMB MB)"
