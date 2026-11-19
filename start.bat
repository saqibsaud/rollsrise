@echo off
title Rolls Rise Ordering
cd /d "%~dp0"

where node >/dev/null 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed on this computer.
  echo Please install the LTS version from https://nodejs.org and then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing the ordering system. This needs internet once and takes a minute...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Installation failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

if "%PORT%"=="" set PORT=3000
start "" "http://localhost:%PORT%/admin"
node --no-warnings=ExperimentalWarning server\index.js
echo.
echo The ordering system has stopped.
pause
