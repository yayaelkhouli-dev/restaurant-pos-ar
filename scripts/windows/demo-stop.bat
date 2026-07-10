@echo off
REM Shuts down the trial copy: the POS server first, then the database.
setlocal

pushd "%~dp0"
set "ROOT=%CD%"
popd
set "PGBIN=%ROOT%\pgsql\bin"
set "PGDATA=%ROOT%\pgdata"
set "APP=%ROOT%\app"

echo Stopping the POS...
REM Kill only the server that runs from THIS folder. A plain
REM `taskkill /IM pos-backend.exe` would also kill a POS installed elsewhere on
REM the same machine -- for example the developer's own live system.
set "PSKILL=Get-Process pos-backend -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '%APP%\pos-backend.exe' } | Stop-Process -Force"
powershell -NoProfile -Command "%PSKILL%" >nul 2>&1

echo Stopping the database...
if exist "%PGBIN%\pg_ctl.exe" "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -m fast stop >nul 2>&1

echo.
echo Everything is stopped. Your data stays in the pgdata folder.
echo.
pause
endlocal
exit /b 0
