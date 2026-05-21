@echo off
title INTOPS Tracker Watchdog
cd /d "%~dp0"

:LOOP
"C:\Program Files\nodejs\node.exe" server.js
ping 127.0.0.1 -n 4 >nul 2>&1
goto LOOP