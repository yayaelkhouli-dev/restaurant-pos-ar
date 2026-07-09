@echo off
chcp 65001 >nul
title POS System - Stop
setlocal

call "%~dp0_paths.bat" || (pause & exit /b 1)

echo Stopping POS services...
echo.

echo Stopping Backend...
taskkill /IM pos-backend.exe /F >nul 2>&1

echo Stopping Frontend (Vite)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo Stopping PostgreSQL...
"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" stop >nul 2>&1

echo.
echo All services stopped.
echo.
pause
endlocal
