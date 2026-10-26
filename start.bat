@echo off
title Pharmacy Server - Ehsan
cd /d "%~dp0"

echo [1/4] Checking Python ...
where python >nul 2>&1
if errorlevel 1 goto no_python

echo [2/4] Checking libraries - flask ...
python -m pip show flask >nul 2>&1
if errorlevel 1 goto install_libs
echo     Libraries OK.
goto check_tunnel

:install_libs
echo     Installing Flask, qrcode, pillow - needs internet, one time ...
python -m pip install -r requirements.txt
if errorlevel 1 goto pip_fail
echo     Libraries installed.

:check_tunnel
echo [3/4] Checking cloudflared ...
if exist "cloudflared.exe" goto tunnel_on
echo     Local mode only - no cloudflared.exe next to this file.
goto start_py

:tunnel_on
set ENABLE_TUNNEL=1
echo     Internet link will be enabled.

:start_py
echo [4/4] Starting server ...
echo.
echo    KEEP THIS WINDOW OPEN while you work.
echo    The Cloudflare link will be printed and copied to clipboard.
echo    To stop: close this window.
echo.
python server.py
echo.
echo ============================================
echo    The server stopped.
echo    Take a photo of this window and send it.
echo ============================================
pause
exit /b 0

:no_python
echo.
echo ============================================
echo    PROBLEM: Python is NOT installed or not in PATH.
echo.
echo    FIX: Install from https://www.python.org/downloads/
echo    and CHECK the box [Add Python to PATH] during install.
echo ============================================
pause
exit /b 1

:pip_fail
echo.
echo ============================================
echo    PROBLEM: Library installation failed.
echo.
echo    FIX: Check your internet connection, close this window
echo    and run start.bat again.
echo ============================================
pause
exit /b 1
