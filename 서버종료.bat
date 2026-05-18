@echo off
chcp 65001 > nul
title 서버 종료

echo.
echo 3000 포트 사용 프로세스를 종료합니다...

set found=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    set found=1
)

if "%found%"=="1" (
    echo [완료] 서버가 종료되었습니다.
) else (
    echo [정보] 실행 중인 서버가 없습니다.
)

echo.
timeout /t 2 /nobreak >nul
exit /b 0
