@echo off
chcp 65001 > nul
title INTOPS FMS 업무현황 바로가기 생성

echo.
echo  ================================================
echo   INTOPS FMS 품질팀 업무현황 바로가기 생성 중...
echo  ================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$url = 'https://intops-fms-tracker-production.up.railway.app/';" ^
  "" ^
  "$date = Get-Date -Format 'yyyy.MM.dd HH:mm';" ^
  "$s = $ws.CreateShortcut(\"$desktop\\INTOPS 업무현황.lnk\");" ^
  "$s.TargetPath = $url;" ^
  "$s.IconLocation = 'C:\\Windows\\System32\\shell32.dll, 14';" ^
  "$s.Description = \"INTOPS FMS 품질팀 업무현황 | 바로가기 생성: $date\";" ^
  "$s.Save();" ^
  "" ^
  "Write-Host '  바탕화면에 바로가기가 생성되었습니다!' -ForegroundColor Green;" ^
  "Write-Host '  아이콘: INTOPS 업무현황.lnk' -ForegroundColor Cyan;"

echo.
echo  ================================================
echo   완료! 바탕화면의 아이콘을 더블클릭하세요.
echo  ================================================
echo.
pause
