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
        echo [*] Pulling latest software updates...
        git pull origin main
        goto finished
    )
)

echo [*] Downloading latest release package...
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
echo   [SUCCESS] Updated to the latest version successfully!
echo   Next Step: Open chrome://extensions/ in Chrome and
echo   click the reload (circle arrow) icon on this tool.
echo ========================================================
echo.
pause
