$port = 5199
$killed = 0
Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -gt 0 } |
  ForEach-Object {
    $ownerPid = $_.OwningProcess
    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    Write-Host "Killed PID $ownerPid"
    $killed++
  } | Out-Null
if ($killed -eq 0) {
  Write-Host "Port $port is free."
} else {
  Write-Host "Stopped $killed process(es) on port $port."
}
