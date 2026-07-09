@echo off
chcp 65001 >nul
title POS System Launcher
setlocal

call "%~dp0_paths.bat"
if errorlevel 1 goto :fail

echo ===========================================
echo   Restaurant POS - Starting all services
echo ===========================================
echo.

echo [1/3] Starting PostgreSQL database...
"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" status >nul 2>&1
if errorlevel 1 (
  "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%POS_ROOT%\pg-server.log" -w start
) else (
  echo     Already running.
)
echo.

echo [2/3] Starting Backend API on port 8080...
if not exist "%BACKEND%\pos-backend.exe" goto :nobackend
start "POS Backend - do not close" /D "%BACKEND%" "%BACKEND%\pos-backend.exe"
echo.

REM Pick node: PATH first, then the default install location.
set "NODE=C:\Program Files\nodejs\node.exe"
where node >nul 2>&1
if not errorlevel 1 set "NODE=node"

REM NOTE: never put an unescaped ( or ) inside an echo that sits within an
REM if/else block -- cmd counts those parens and the block breaks apart.
if exist "%FRONTEND%\dist\index.html" goto :serve_prod
goto :serve_dev

:serve_prod
echo [3/3] Starting Frontend - production build, port 3000...
start "POS Frontend - do not close" /D "%FRONTEND%" "%NODE%" "%FRONTEND%\node_modules\vite\bin\vite.js" preview --port 3000 --host 0.0.0.0
goto :warmup

:serve_dev
echo [3/3] Starting Frontend - dev server, port 3000...
echo     Tip: run build-frontend.bat once for a faster production build.
start "POS Frontend - do not close" /D "%FRONTEND%" "%NODE%" "%FRONTEND%\node_modules\vite\bin\vite.js" --port 3000 --host 0.0.0.0
goto :warmup

:warmup
echo.
echo Waiting for services to warm up...
REM ping, not timeout: `timeout` aborts when stdin is redirected (scheduled tasks).
ping -n 9 127.0.0.1 >nul 2>&1

REM Detect this machine's LAN IP: the adapter that has a default gateway.
REM Uses .Where() rather than a pipeline so no `|` needs batch-escaping.
set "LANIP="
set "PSLANIP=$a=Get-NetIPConfiguration; $b=$a.Where({$_.IPv4DefaultGateway -ne $null}, 'First'); if ($b) { $b[0].IPv4Address.IPAddress }"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "%PSLANIP%"`) do set "LANIP=%%i"

echo Opening the cashier in your browser...
start "" "http://localhost:3000"

echo.
echo ============================================
echo   DONE!
echo   On THIS computer:      http://localhost:3000
if defined LANIP echo   On other terminals:    http://%LANIP%:3000
echo ============================================
echo Two small windows opened - Backend and Frontend.
echo Keep them open while using the system.
echo To stop everything later, run stop-pos.bat
echo.
pause
endlocal
exit /b 0

:nobackend
echo.
echo   [!] pos-backend.exe was not found in:
echo       %BACKEND%
echo   Run scripts\windows\build-backend.bat first.
echo.
pause
endlocal
exit /b 1

:fail
pause
endlocal
exit /b 1
