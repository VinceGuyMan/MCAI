@echo off
setlocal
cd /d "%~dp0"

REM ============================================================
REM  MCAI — single All-In-One launcher (Node only, no PowerShell)
REM  Double-click this file, or use MCAI.vbs for a quieter start.
REM ============================================================

where node >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
  ) else if exist "%LocalAppData%\Programs\nodejs\node.exe" (
    set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
  )
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js is required for MCAI.
  echo  Install LTS from https://nodejs.org then run MCAI.cmd again.
  echo.
  pause
  exit /b 1
)

REM Pass through flags: --start  --stop  --status  (default = interactive menu)
node "%~dp0launcher\aio-node.mjs" %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Launcher exited with code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
