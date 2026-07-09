@echo off
REM ============================================================
REM  Shared path resolution for every Windows launcher.
REM  Called (not run) by the other scripts in this folder.
REM
REM  Expected layout on disk:
REM
REM    <POS_ROOT>\
REM      pgsql\          portable PostgreSQL   (not in git - see SETUP.md)
REM      pgdata\         your live database    (not in git - back it up!)
REM      backups\        pg_dump output        (not in git)
REM      poinf\          <-- THIS GIT REPO
REM        backend\  frontend\  database\init\  scripts\windows\
REM ============================================================

REM This file lives in <REPO>\scripts\windows\.
REM Each pushd/set/popd must be on its own line: cmd expands %CD% when it parses
REM the whole line, so a one-liner would capture the directory BEFORE pushd ran.
pushd "%~dp0..\.."
set "REPO=%CD%"
popd
pushd "%REPO%\.."
set "POS_ROOT=%CD%"
popd

set "PGBIN=%POS_ROOT%\pgsql\bin"
set "PGDATA=%POS_ROOT%\pgdata"
set "BACKUPDIR=%POS_ROOT%\backups"
set "BACKEND=%REPO%\backend"
set "FRONTEND=%REPO%\frontend"
set "INITDIR=%REPO%\database\init"

REM Let a machine override credentials / db name without editing any script.
if not defined POS_DB_PASSWORD set "POS_DB_PASSWORD=postgres123"
if not defined POS_DB_NAME     set "POS_DB_NAME=pos_system"
set "DB=%POS_DB_NAME%"

if not exist "%PGBIN%\pg_ctl.exe" (
  echo.
  echo   [!] PostgreSQL was not found at:
  echo       %PGBIN%
  echo.
  echo   Put the portable PostgreSQL folder next to this repo, so that
  echo   "%POS_ROOT%\pgsql\bin\pg_ctl.exe" exists.
  echo   See SETUP.md in the repo root.
  echo.
  exit /b 1
)
exit /b 0
