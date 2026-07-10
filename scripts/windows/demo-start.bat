@echo off
REM ============================================================
REM  Restaurant POS - trial copy launcher.
REM
REM  Everything the program needs lives inside this folder. Nothing is
REM  installed into Windows, no registry keys, no services.
REM
REM  First run creates the database (about a minute). Later runs are instant.
REM
REM  Pure ASCII on purpose: cmd.exe re-reads a .bat while it runs, and
REM  non-ASCII text shifts the read offset and corrupts later lines.
REM  Arabic instructions are in READ-ME-FIRST.txt.
REM ============================================================
setlocal

pushd "%~dp0"
set "ROOT=%CD%"
popd

set "PGBIN=%ROOT%\pgsql\bin"
set "PGDATA=%ROOT%\pgdata"
set "APP=%ROOT%\app"
set "INITDIR=%ROOT%\database\init"
set "DEMODIR=%ROOT%\database\demo"

REM Port 5433, not the standard 5432, so this never collides with a PostgreSQL
REM the tester may already have installed.
set "PGPORT=5433"
set "PGCLIENTENCODING=UTF8"

REM "column already exists, skipping" notices are expected and harmless; they
REM only frighten the person running this.
set "PGOPTIONS=-c client_min_messages=warning"

title Restaurant POS - Trial

if not exist "%PGBIN%\pg_ctl.exe" goto :broken
if not exist "%APP%\pos-backend.exe" goto :broken

echo ===========================================
echo   Restaurant POS - Trial
echo ===========================================
echo.

if exist "%PGDATA%\PG_VERSION" goto :startdb

echo [1/3] First run - creating the database. Please wait about a minute...
"%PGBIN%\initdb.exe" -D "%PGDATA%" -U postgres -A trust -E UTF8 --locale=C >nul 2>&1
if errorlevel 1 goto :initfail

REM Redirection FIRST: `echo port = 5433>> file` would make cmd read the 3 as a
REM file handle. Putting >>"file" in front avoids that entirely.
>>"%PGDATA%\postgresql.conf" echo port = %PGPORT%
>>"%PGDATA%\postgresql.conf" echo listen_addresses = '127.0.0.1'

"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%ROOT%\pg-server.log" -w start >nul
if errorlevel 1 goto :startfail

"%PGBIN%\createdb.exe" -h 127.0.0.1 -p %PGPORT% -U postgres pos_system
if errorlevel 1 goto :startfail

echo       Loading the menu and sample data...
for /f "delims=" %%f in ('dir /b /o:n "%INITDIR%\*.sql"') do (
  "%PGBIN%\psql.exe" -h 127.0.0.1 -p %PGPORT% -U postgres -d pos_system -v ON_ERROR_STOP=1 -q -f "%INITDIR%\%%f"
  if errorlevel 1 goto :loadfail
)
"%PGBIN%\psql.exe" -h 127.0.0.1 -p %PGPORT% -U postgres -d pos_system -v ON_ERROR_STOP=1 -q -f "%DEMODIR%\demo_accounts.sql"
if errorlevel 1 goto :loadfail
echo       Done.
goto :startapp

:startdb
echo [1/3] Starting the database...
"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" status >nul 2>&1
if not errorlevel 1 goto :alreadyup
"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%ROOT%\pg-server.log" -w start >nul
if errorlevel 1 goto :startfail
goto :startapp

:alreadyup
echo       Already running.

:startapp
echo.
echo [2/3] Starting the POS...

REM 8080 is a popular port. If another program already owns it, the server dies
REM on startup, its window closes, and the browser shows whatever DOES own the
REM port -- usually a bare "404 page not found". Pick a free one up front.
REM PORT is read from the environment by the server and beats the .env file.
set "PORT="
set "PSPORT=foreach ($p in 8080,8081,8082,8090,8095) { if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { $p; break } }"
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "%PSPORT%"`) do set "PORT=%%p"
if not defined PORT goto :noport
echo       Using port %PORT%

start "POS Server - keep this window open" /D "%APP%" "%APP%\pos-backend.exe"

echo.
echo [3/3] Waiting for it to come up...

REM Never announce success we have not observed. curl ships with Windows 10 1803
REM and later; without it, fall back to waiting a fixed few seconds.
where curl >nul 2>&1
if errorlevel 1 goto :blindwait

set "TRIES=0"
:waitloop
REM ping, not timeout: `timeout` aborts when stdin is redirected.
ping -n 3 127.0.0.1 >nul 2>&1
curl -s -o nul -m 2 "http://localhost:%PORT%/health"
if not errorlevel 1 goto :serverup
set /a TRIES+=1
if %TRIES% LSS 10 goto :waitloop
goto :serverfail

:blindwait
ping -n 8 127.0.0.1 >nul 2>&1

:serverup
start "" "http://localhost:%PORT%"

echo.
echo ============================================
echo   Ready.
echo   On this computer:   http://localhost:%PORT%
echo.
echo   Sign in with:  admin  /  demo1234
echo   Other accounts are listed in ACCOUNTS.txt
echo ============================================
echo.
echo A small window named "POS Server" opened. Keep it open while you use
echo the program. To shut everything down, run STOP.bat
echo.
pause
endlocal
exit /b 0

:noport
echo.
echo   [!] Ports 8080, 8081, 8082, 8090 and 8095 are all in use on this PC.
echo       Close whatever is using them, or run STOP.bat and try again.
echo.
pause
endlocal
exit /b 1

:serverfail
echo.
echo   [!] The POS server did not answer on port %PORT%.
echo.
echo       - Check the window titled "POS Server" for the error message.
echo       - Your antivirus may have blocked app\pos-backend.exe
echo       - The database log is pg-server.log in this folder.
echo.
pause
endlocal
exit /b 1

:broken
echo.
echo   [!] This folder is incomplete. Copy the whole POS-Trial folder, not
echo       just some files inside it.
echo.
pause
endlocal
exit /b 1

:initfail
echo.
echo   [!] Could not create the database.
echo       Make sure this folder is NOT inside OneDrive or a network drive,
echo       and that antivirus is not blocking pgsql\bin\initdb.exe
echo.
pause
endlocal
exit /b 1

:startfail
echo.
echo   [!] The database did not start. See pg-server.log in this folder.
echo.
pause
endlocal
exit /b 1

:loadfail
echo.
echo   [!] Loading the sample data failed. Delete the pgdata folder and run
echo       this file again.
echo.
pause
endlocal
exit /b 1
