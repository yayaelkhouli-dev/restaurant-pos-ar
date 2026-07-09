@echo off
chcp 65001 >nul
title POS - Build Frontend (production)
setlocal

call "%~dp0_paths.bat" || (pause & exit /b 1)

echo ===========================================
echo   Building the frontend (production)
echo   Run this once after any UI change, then
echo   use start-pos.bat as usual.
echo ===========================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Install Node.js 18 or newer. See SETUP.md.
  pause
  exit /b 1
)

pushd "%FRONTEND%"
REM No unescaped parens inside a block - cmd counts them and the block breaks.
if not exist "node_modules" (
  echo Installing dependencies, first run only...
  call npm install
)
echo Building... please wait, this may take a minute...
call npm run build
set "RC=%ERRORLEVEL%"
popd

echo.
if "%RC%"=="0" (
  echo [OK] Build complete. start-pos.bat will now serve the production build.
) else (
  echo [FAILED] Build failed. The system will keep using the dev server.
)
echo.
pause
endlocal
