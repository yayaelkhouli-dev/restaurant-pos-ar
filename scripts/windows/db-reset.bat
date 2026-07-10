@echo off
REM ============================================================
REM  Reset the POS database to a clean install.
REM  Loads every database\init\*.sql in numeric filename order.
REM
REM  *** THIS ERASES ALL DATA: orders, sales, stock, shifts. ***
REM  A pre-reset dump is taken first, into <POS_ROOT>\backups\.
REM
REM  Set POS_DB_NAME to target a throwaway database instead of pos_system.
REM
REM  Pure ASCII on purpose: cmd.exe re-reads a .bat while it runs, and
REM  `chcp 65001` plus non-ASCII text corrupts later lines. See SETUP.md.
REM ============================================================
setlocal enabledelayedexpansion

call "%~dp0_paths.bat"
if errorlevel 1 goto :fail
set "PGPASSWORD=%POS_DB_PASSWORD%"

echo ===========================================
echo   DATABASE RESET  --  "%DB%"
echo ===========================================
echo.
echo This ERASES every order, sale, shift and stock movement,
echo and rebuilds the database from scratch.
echo.
set "CONFIRM="
set /p CONFIRM=Type YES to continue, anything else to abort:
if /I not "%CONFIRM%"=="YES" goto :aborted

if not exist "%BACKUPDIR%" mkdir "%BACKUPDIR%"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set "TS=%%i"
set "PRERESET=%BACKUPDIR%\pre_reset_%TS%.dump"

echo.
echo [1/4] Dumping the current database first...

REM Ask three separate questions, because the answers need different messages.
REM Do NOT use `for /f ... in (`"quoted\path.exe" ...`)` here: cmd mangles the
REM quoting, the probe silently fails, and the script then wipes a database it
REM believes does not exist. Exit codes only.
"%PGBIN%\pg_isready.exe" -h 127.0.0.1 -p 5432 -q
if errorlevel 1 goto :nopg

"%PGBIN%\psql.exe" -h 127.0.0.1 -U postgres -d postgres -c "SELECT 1" >nul 2>&1
if errorlevel 1 goto :noauth

REM A fresh install has no database to dump, and that is fine. Anything else
REM means a failed dump must ABORT the reset.
"%PGBIN%\psql.exe" -h 127.0.0.1 -U postgres -d %DB% -c "SELECT 1" >nul 2>&1
if errorlevel 1 goto :nodb

"%PGBIN%\pg_dump.exe" -h 127.0.0.1 -U postgres -d %DB% -F c -f "%PRERESET%"
if errorlevel 1 goto :dumpfailed
REM `if exist` is not proof: pg_dump leaves a 0-byte file behind when it fails,
REM and pg_restore -l is the only thing that proves the archive is readable.
if not exist "%PRERESET%" goto :dumpfailed
for %%A in ("%PRERESET%") do if %%~zA EQU 0 goto :dumpempty
"%PGBIN%\pg_restore.exe" -l "%PRERESET%" >nul 2>&1
if errorlevel 1 goto :dumpcorrupt
echo       Verified: %PRERESET%
goto :closeconns

:nodb
echo       Database "%DB%" does not exist yet - nothing to dump.

:closeconns
echo.
echo [2/4] Closing open connections...
"%PGBIN%\psql.exe" -h 127.0.0.1 -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='%DB%' AND pid <> pg_backend_pid();" >nul 2>&1

echo.
echo [3/4] Dropping and recreating "%DB%"...
"%PGBIN%\psql.exe" -h 127.0.0.1 -U postgres -d postgres -c "DROP DATABASE IF EXISTS %DB%;"
if errorlevel 1 goto :dropfailed
"%PGBIN%\psql.exe" -h 127.0.0.1 -U postgres -d postgres -c "CREATE DATABASE %DB%;"
if errorlevel 1 goto :createfailed

echo.
echo [4/4] Loading migrations in order...
for /f "delims=" %%f in ('dir /b /o:n "%INITDIR%\*.sql"') do (
  echo       - %%f
  "%PGBIN%\psql.exe" -h 127.0.0.1 -U postgres -d %DB% -v ON_ERROR_STOP=1 -q -f "%INITDIR%\%%f"
  if errorlevel 1 goto :loadfailed
)

echo.
echo ===========================================
echo   [OK] Reset complete.
echo ===========================================
echo   Default accounts must change their password at first login.
echo   Pre-reset dump: %PRERESET%
echo.
pause
endlocal
exit /b 0

:aborted
echo Aborted. Nothing was changed.
echo.
pause
endlocal
exit /b 0

:nopg
echo.
echo   [ABORTED] PostgreSQL is not answering on 127.0.0.1:5432 - nothing was erased.
echo             Run start-pos.bat first.
pause
endlocal
exit /b 1

:noauth
echo.
echo   [ABORTED] PostgreSQL refused the connection - nothing was erased.
echo             Check the password in POS_DB_PASSWORD.
pause
endlocal
exit /b 1

:dumpfailed
echo.
echo   [ABORTED] The pre-reset backup FAILED, so nothing was erased.
echo             Is PostgreSQL running? Try start-pos.bat first.
pause
endlocal
exit /b 1

:dumpempty
echo.
echo   [ABORTED] The pre-reset backup came out EMPTY, so nothing was erased.
echo             Check free disk space on this drive.
pause
endlocal
exit /b 1

:dumpcorrupt
echo.
echo   [ABORTED] The pre-reset backup cannot be read back, so nothing was erased.
echo             File: %PRERESET%
pause
endlocal
exit /b 1

:dropfailed
echo       Could not drop the database. Stop the system first: stop-pos.bat
pause
endlocal
exit /b 1

:createfailed
echo       Could not create the database.
pause
endlocal
exit /b 1

:loadfailed
echo       Migration failed. The database is incomplete.
pause
endlocal
exit /b 1
