@echo off
REM Compatibility alias — use MCAI.cmd as the main launcher.
cd /d "%~dp0"
call "%~dp0MCAI.cmd" %*
