@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title INTOPS FMS - 서버 재시작
cd /d "%~dp0"

echo.
echo ========================================
echo   서버 재시작 중...
echo ========================================
echo.

:: 기존 node 프로세스 강제 종료
echo [1/3] 기존 서버 종료 중...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: 3000 포트 혹시 남아있으면 추가 정리
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo    완료

:: Node.js 경로 확인
set "NODE_EXE=node"
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    ) else (
        echo [오류] Node.js를 찾을 수 없습니다.
        pause
        exit /b 1
    )
)

:: 접속 주소 표시
echo.
echo [2/3] 서버 시작 중...
echo.
echo ========================================
echo   접속 주소
echo   이 컴퓨터: http://localhost:3000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set ip=%%a
    set ip=!ip: =!
    echo   다른 기기:  http://!ip!:3000
)
echo ========================================
echo.
echo [3/3] 브라우저 자동 열림 (3초 후)...
echo       서버 중지: Ctrl+C
echo.

:: 3초 후 브라우저 자동 실행
start "" /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: 서버 실행
"%NODE_EXE%" server.js

pause
