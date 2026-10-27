@echo off
rem Double-click: stops ONLY Sanctuary Light's own server and checks it comes back in Offline Simulation.
rem Never touches Eos or any other program. Runs only while Sanctuary Light is in SIM.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-test.ps1" %*
echo.
pause
