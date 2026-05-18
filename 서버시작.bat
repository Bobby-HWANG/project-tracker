@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title INTOPS FMS 품질팀 업무현황 서버
cd /d "%~dp0"

echo.
echo ========================================
echo   INTOPS FMS 품질팀 업무현황 서버 시작
echo ========================================
echo.

:: Node.js 확인 (PATH 또는 표준 경로)
set "NODE_EXE=node"
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    ) else (
        echo [오류] Node.js가 설치되어 있지 않습니다.
        echo  https://nodejs.org 에서 LTS 버전을 설치 후 다시 실행하세요.
        echo.
        pause
        exit /b 1
    )
)

:: 패키지 설치 확인
if not exist "node_modules" (
    echo [설치] 필요한 패키지를 설치합니다...
    call npm install
    echo.
)

:: 기존 3000 포트 사용 프로세스 정리
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: 접속 주소 표시
echo [접속 주소]
echo   이 컴퓨터: http://localhost:3000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set ip=%%a
    set ip=!ip: =!
    echo   다른 기기: http://!ip!:3000
)

echo.
echo [관리자 계정] admin@intops.com / admin1234
echo.
echo 브라우저가 곧 자동으로 열립니다...
echo 서버를 중지하려면 Ctrl+C 를 누르세요.
echo.

:: 2초 대기 후 브라우저 자동 실행 (백그라운드)
start "" /B cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 서버 실행 (이 창에 로그 출력)
"%NODE_EXE%" server.js

pause
