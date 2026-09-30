@echo off
title HP Gas CDCMS Blocker - GitHub Auto Updater
color 0b
echo ========================================================
echo   HP Gas CDCMS Blocker - Automatic System Updater
echo ========================================================
echo.

cd /d "%~dp0"

where git >nul 2>nul
if %ERRORLEVEL% equ 0 (
    if exist ".git" (
        echo [*] Pulling latest software updates from GitHub...
        git fetch origin main
        git reset --hard origin/main
        goto finished
    )
)

echo [*] Downloading latest release package from GitHub...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/rahulmaithili/cdcms-cancle-tool/archive/refs/heads/main.zip' -OutFile 'update_temp.zip'"

if not exist "update_temp.zip" (
    echo [ERROR] Failed to download update. Please check your internet connection.
    pause
    exit /b 1
)

echo [*] Extracting files and applying updates...
powershell -Command "Expand-Archive -Path 'update_temp.zip' -DestinationPath 'update_temp_dir' -Force; Copy-Item -Path 'update_temp_dir\cdcms-cancle-tool-main\*' -Destination '.' -Recurse -Force; Remove-Item -Path 'update_temp_dir' -Recurse -Force; Remove-Item -Path 'update_temp.zip' -Force"

:finished
echo.
echo ========================================================
echo   [SUCCESS] Latest Version Successfully Installed!
echo.
echo   Agla Step (Final Step):
echo   1. Chrome me naya tab khol kar type karein: chrome://extensions
echo   2. "HP Gas CDCMS Automation Tool" ke Reload (circle arrow) par click karein.
echo   3. CDCMS portal refresh (F5) karein.
echo ========================================================
echo.
pause
