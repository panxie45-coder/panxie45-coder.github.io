@echo off
pushd "%~dp0"
start "Ember Local Server" /min cmd.exe /c "npx vinext dev"
ping 127.0.0.1 -n 5 >nul
type nul > ".ssh-tunnel.out.log"
type nul > ".ssh-tunnel.err.log"
start "Ember Public Tunnel" /min cmd.exe /c "C:\Windows\System32\OpenSSH\ssh.exe -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run > .ssh-tunnel.out.log 2> .ssh-tunnel.err.log"
ping 127.0.0.1 -n 12 >nul
for /f "tokens=6" %%U in ('findstr /c:"tunneled with tls termination" ".ssh-tunnel.out.log"') do start "" "%%U"
popd
