@echo off
title Markloom Desktop
cd /d "%~dp0"

rem Usage: start-desktop.bat          - launch the packaged desktop app (builds it on first run)
rem        start-desktop.bat rebuild  - rebuild the desktop app from source, then launch it

set "EXE=release\win-unpacked\Markloom.exe"

if /i "%~1"=="rebuild" goto build
if exist "%EXE%" goto run

:build
echo Building Markloom desktop app (this takes a minute)...
if not exist node_modules call npm install
call npm run build || goto fail
rem Clear old output; a leftover or locked folder makes packaging fail with EPERM
tasklist /FI "IMAGENAME eq Markloom.exe" | find /I "Markloom.exe" >nul && (
  echo Markloom is still running - close it and try again.
  goto fail
)
if exist release\win-unpacked rmdir /s /q release\win-unpacked
if exist release\win-unpacked.tmp rmdir /s /q release\win-unpacked.tmp
call npx electron-builder --win --dir || goto fail

:run
start "" "%EXE%"
exit /b 0

:fail
echo.
echo Build failed - see the output above.
pause
exit /b 1
