@echo off
REM Shuts down the trial copy: the POS server first, then the database.
setlocal

pushd "%~dp0"
set "ROOT=%CD%"
popd
set "PGBIN=%ROOT%\pgsql\bin"
set "PGDATA=%ROOT%\pgdata"

echo Stopping the POS...
taskkill /IM pos-backend.exe /F >nul 2>&1

echo Stopping the database...
if exist "%PGBIN%\pg_ctl.exe" "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -m fast stop >nul 2>&1

echo.
echo Everything is stopped. Your data stays in the pgdata folder.
echo.
pause
endlocal
exit /b 0
