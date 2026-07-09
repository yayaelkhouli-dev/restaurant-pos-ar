@echo off
REM ============================================================
REM  Back up the POS database to <POS_ROOT>\backups\pos_<stamp>.dump
REM  Run it daily, or attach it to a Windows Scheduled Task.
REM
REM  Your data (orders, sales, stock) is NOT on GitHub.
REM  These dumps are the only copy. Keep one off this machine.
REM
REM  This file is deliberately pure ASCII. cmd.exe re-reads a .bat while it
REM  runs; `chcp 65001` plus non-ASCII text shifts the read offset and
REM  silently corrupts later lines. Arabic docs live in SETUP.md.
REM ============================================================
setlocal

call "%~dp0_paths.bat"
if errorlevel 1 goto :fail
set "PGPASSWORD=%POS_DB_PASSWORD%"

if not exist "%BACKUPDIR%" mkdir "%BACKUPDIR%"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
set "OUTFILE=%BACKUPDIR%\pos_%TS%.dump"

echo Backing up database "%DB%" ...
"%PGBIN%\pg_dump.exe" -h 127.0.0.1 -U postgres -d %DB% -F c -f "%OUTFILE%"
if errorlevel 1 goto :dumpfailed

echo.
echo [OK] Backup written to:
echo      %OUTFILE%

REM Delete dumps older than 30 days.
set "PSPRUNE=Get-ChildItem '%BACKUPDIR%\pos_*.dump' -ErrorAction SilentlyContinue ^| Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } ^| Remove-Item -Force"
powershell -NoProfile -Command "%PSPRUNE%" >nul 2>&1

endlocal
exit /b 0

:dumpfailed
echo.
echo [FAILED] Backup failed. Is the database running? Try start-pos.bat first.
endlocal
exit /b 1

:fail
endlocal
exit /b 1
