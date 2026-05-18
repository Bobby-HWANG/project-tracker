@echo off
chcp 65001 > nul
title 바탕화면 바로가기 만들기

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$root = '%~dp0';" ^
  "$root = $root.TrimEnd('\\');" ^
  "" ^
  "$s1 = $ws.CreateShortcut(\"$desktop\\업무현황 서버시작.lnk\");" ^
  "$s1.TargetPath = \"$root\\서버시작.bat\";" ^
  "$s1.WorkingDirectory = $root;" ^
  "$s1.IconLocation = 'C:\\Windows\\System32\\shell32.dll, 13';" ^
  "$s1.Description = 'INTOPS 업무현황 서버를 시작하고 브라우저를 엽니다';" ^
  "$s1.Save();" ^
  "" ^
  "$s2 = $ws.CreateShortcut(\"$desktop\\업무현황 열기.lnk\");" ^
  "$s2.TargetPath = 'http://localhost:3000';" ^
  "$s2.IconLocation = 'C:\\Windows\\System32\\shell32.dll, 14';" ^
  "$s2.Description = 'INTOPS 업무현황 페이지 열기 (서버 실행 중일 때)';" ^
  "$s2.Save();" ^
  "" ^
  "$s3 = $ws.CreateShortcut(\"$desktop\\업무현황 서버종료.lnk\");" ^
  "$s3.TargetPath = \"$root\\서버종료.bat\";" ^
  "$s3.WorkingDirectory = $root;" ^
  "$s3.IconLocation = 'C:\\Windows\\System32\\shell32.dll, 27';" ^
  "$s3.Description = '실행 중인 업무현황 서버 종료';" ^
  "$s3.Save();" ^
  "" ^
  "Write-Host '바탕화면에 3개 바로가기가 생성되었습니다:' -ForegroundColor Green;" ^
  "Write-Host '  - 업무현황 서버시작.lnk';" ^
  "Write-Host '  - 업무현황 열기.lnk';" ^
  "Write-Host '  - 업무현황 서버종료.lnk';"

echo.
pause
