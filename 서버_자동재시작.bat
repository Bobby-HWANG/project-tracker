@echo off
title INTOPS Tracker Watchdog
cd /d "%~dp0"

:LOOP
echo Starting server...
"C:\Program Files\nodejs\node.exe" server.js
echo Server stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto LOOP