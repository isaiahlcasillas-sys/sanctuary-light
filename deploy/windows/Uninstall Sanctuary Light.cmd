@echo off
rem Double-click to remove Sanctuary Light (asks first). Keeps your settings. Never touches Eos.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
echo.
pause
