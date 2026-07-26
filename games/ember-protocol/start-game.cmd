@echo off
pushd "%~dp0..\.."
start "Ember Local Server" /min cmd.exe /c "npx vinext dev --host 0.0.0.0"
ping 127.0.0.1 -n 4 >nul
start "" "http://localhost:3000"
popd
