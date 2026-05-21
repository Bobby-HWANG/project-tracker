@echo off
chcp 65001 >nul
title 방화벽 3000 포트 허용 (관리자 권한 필요)

REM 관리자 권한 확인
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo 관리자 권한이 필요합니다. UAC 창에서 "예"를 눌러주세요.
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================
echo   INTOPS FMS 트래커 - 방화벽 포트 3000 허용
echo ============================================
echo.

REM 기존 규칙 삭제 (중복 방지)
netsh advfirewall firewall delete rule name="INTOPS-FMS-Tracker (Port 3000)" >nul 2>&1

REM 인바운드 TCP 3000 허용 규칙 추가
netsh advfirewall firewall add rule ^
  name="INTOPS-FMS-Tracker (Port 3000)" ^
  dir=in action=allow ^
  protocol=TCP localport=3000 ^
  profile=any

if %errorlevel% equ 0 (
  echo.
  echo ✅ 방화벽 규칙 추가 완료
  echo.
  echo 이제 같은 네트워크의 다른 PC/모바일에서 접속 가능합니다.
) else (
  echo ❌ 방화벽 규칙 추가 실패
)

echo.
pause
