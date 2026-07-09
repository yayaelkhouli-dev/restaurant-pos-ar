@echo off
chcp 65001 >nul
title POS - Build Backend
setlocal

call "%~dp0_paths.bat"
if errorlevel 1 goto :fail

echo ===========================================
echo   Building the backend API
echo ===========================================
echo.

REM Prefer a portable Go next to the repo, else fall back to Go on PATH.
set "GOEXE=%POS_ROOT%\goroot\go\bin\go.exe"
if exist "%GOEXE%" goto :havego
where go >nul 2>&1
if errorlevel 1 goto :nogo
set "GOEXE=go"

:havego
pushd "%BACKEND%"
echo Compiling with: %GOEXE%
REM Build to a temp name first so a running server is never half-overwritten.
"%GOEXE%" build -o pos-backend-new.exe .
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :buildfailed
taskkill /IM pos-backend.exe /F >nul 2>&1
ping -n 2 127.0.0.1 >nul 2>&1
move /Y pos-backend-new.exe pos-backend.exe >nul
popd
echo.
echo [OK] Backend built. Run start-pos.bat to launch it.
echo.
pause
endlocal
exit /b 0

:buildfailed
popd
echo.
echo [FAILED] Build failed. The previous pos-backend.exe was left untouched.
echo.
pause
endlocal
exit /b 1

:nogo
echo Go was not found. Install Go 1.21 or newer, or place a portable Go at:
echo   %POS_ROOT%\goroot\go
echo See SETUP.md.
echo.
pause
endlocal
exit /b 1

:fail
pause
endlocal
exit /b 1
