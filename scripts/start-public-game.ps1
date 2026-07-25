$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$tunnelDir = Join-Path $projectRoot ".tunnel"
$keyPath = Join-Path $tunnelDir "localhost_run"
$watchdogPidFile = Join-Path $tunnelDir "watchdog.pid"
$publicLinkFile = Join-Path $projectRoot "public-game-link.txt"
$serverOut = Join-Path $tunnelDir "server.out.log"
$serverErr = Join-Path $tunnelDir "server.err.log"

New-Item -ItemType Directory -Force -Path $tunnelDir | Out-Null

function Show-GameMessage([string]$message, [int]$icon = 64) {
  $shell = New-Object -ComObject WScript.Shell
  $null = $shell.Popup($message, 12, "Ember Protocol", $icon)
}

function Test-GameServer {
  return $null -ne (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-GameServer)) {
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev -- --host 127.0.0.1 --port 3000" `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr `
    -WindowStyle Hidden | Out-Null

  for ($attempt = 0; $attempt -lt 45 -and -not (Test-GameServer); $attempt++) {
    Start-Sleep -Seconds 1
  }
}

if (-not (Test-GameServer)) {
  Show-GameMessage "The local game server could not start. Please send me .tunnel\server.err.log for diagnosis." 16
  exit 1
}

if (-not (Test-Path $keyPath)) {
  & ssh-keygen.exe -q -t ed25519 -N '""' -C "ember-protocol-tunnel" -f $keyPath
}

$watchdogRunning = $false
if (Test-Path $watchdogPidFile) {
  $watchdogPid = [int](Get-Content -Raw $watchdogPidFile)
  $watchdog = Get-Process -Id $watchdogPid -ErrorAction SilentlyContinue
  $watchdogRunning = $null -ne $watchdog -and $watchdog.ProcessName -eq "powershell"
}

if (-not $watchdogRunning) {
  Remove-Item -LiteralPath $publicLinkFile -Force -ErrorAction SilentlyContinue
  $watchdog = Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "tunnel-watchdog.ps1"), "-ProjectRoot", $projectRoot `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -PassThru
  Set-Content -LiteralPath $watchdogPidFile -Value $watchdog.Id -Encoding ASCII
}

$publicUrl = ""
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (Test-Path $publicLinkFile) {
    $candidateUrl = (Get-Content -Raw $publicLinkFile).Trim()
    $httpStatus = & curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" --max-time 6 $candidateUrl 2>$null
    if ($LASTEXITCODE -eq 0 -and $httpStatus -eq "200") {
      $publicUrl = $candidateUrl
      break
    }
  }
  Start-Sleep -Seconds 2
}

if (-not $publicUrl) {
  Show-GameMessage "The public link could not be created. Double-click start-public-game.cmd to retry." 16
  exit 1
}

Set-Clipboard -Value $publicUrl
Start-Process $publicUrl
Show-GameMessage "The public game link is open and copied. Choose Co-op, create a room, then send the room link to your friend. The public link stops when this PC is shut down."
