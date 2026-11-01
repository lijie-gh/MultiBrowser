@echo off
rem Clear ELECTRON_RUN_AS_NODE so Electron starts as an app, not as Node.
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Electron runtime not found. Please reinstall dependencies.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0
