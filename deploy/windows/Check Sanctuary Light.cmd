@echo off
rem Double-click for a read-only health check of this PC and Sanctuary Light. Changes nothing.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-windows.ps1" %*
echo.
pause
