param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = "Continue"
$tunnelDir = Join-Path $ProjectRoot ".tunnel"
$keyPath = Join-Path $tunnelDir "localhost_run"
$publicLinkFile = Join-Path $ProjectRoot "public-game-link.txt"
$tunnelOut = Join-Path $tunnelDir "public.out.log"
$tunnelErr = Join-Path $tunnelDir "public.err.log"
$tunnelPidFile = Join-Path $tunnelDir "tunnel.pid"
$sshPath = Join-Path $env:WINDIR "System32\OpenSSH\ssh.exe"

while ($true) {
  Clear-Content -LiteralPath $tunnelOut -ErrorAction SilentlyContinue
  Clear-Content -LiteralPath $tunnelErr -ErrorAction SilentlyContinue

  $tunnel = Start-Process -FilePath $sshPath `
    -ArgumentList "-i", $keyPath, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-R", "80:127.0.0.1:3000", "localhost.run" `
    -RedirectStandardOutput $tunnelOut `
    -RedirectStandardError $tunnelErr `
    -WindowStyle Hidden `
    -PassThru
  Set-Content -LiteralPath $tunnelPidFile -Value $tunnel.Id -Encoding ASCII

  $lastUrl = ""
  $failedHealthChecks = 0
  $nextHealthCheck = Get-Date
  while (-not $tunnel.HasExited) {
    $match = Select-String -Path $tunnelOut -Pattern "https://[a-z0-9]+\.lhr\.life" -AllMatches -ErrorAction SilentlyContinue |
      Select-Object -Last 1
    if ($match) {
      $currentUrl = $match.Matches[0].Value
      if ($currentUrl -ne $lastUrl) {
        Set-Content -LiteralPath $publicLinkFile -Value $currentUrl -Encoding ASCII
        Set-Clipboard -Value $currentUrl
        $lastUrl = $currentUrl
      }
    }
    if ($lastUrl -and (Get-Date) -ge $nextHealthCheck) {
      $httpStatus = & curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" --max-time 6 $lastUrl 2>$null
      if ($LASTEXITCODE -eq 0 -and $httpStatus -eq "200") {
        $failedHealthChecks = 0
      } else {
        $failedHealthChecks++
      }
      $nextHealthCheck = (Get-Date).AddSeconds(20)
      if ($failedHealthChecks -ge 3) {
        Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
        break
      }
    }
    Start-Sleep -Seconds 2
    $tunnel.Refresh()
  }

  Start-Sleep -Seconds 2
}
