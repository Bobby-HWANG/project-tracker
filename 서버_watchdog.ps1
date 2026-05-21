$ErrorActionPreference = "Continue"
$node = "C:\Program Files\nodejs\node.exe"
$work = "C:\황_DOWNLOAD\project-tracker"
Set-Location $work
while ($true) {
  $p = Start-Process $node -ArgumentList "server.js" -WorkingDirectory $work -PassThru -NoNewWindow -Wait
  Start-Sleep -Seconds 3
}
