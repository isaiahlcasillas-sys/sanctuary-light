@echo off
rem Double-click this file to install or update the Sanctuary Light service for this Windows user.
rem It never changes Eos, the show file, the Gadget II or any DMX device.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
