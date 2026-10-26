@echo off
title ngrok Setup - Pharmacy Ehsan
cd /d "%~dp0"

echo ============================================
echo    ngrok SETUP  -  ONE TIME ONLY
echo    This makes your pharmacy link FIXED forever.
echo ============================================
echo.
echo STEP 1: Free account   -  https://dashboard.ngrok.com/signup
echo STEP 2: Copy authtoken -  https://dashboard.ngrok.com/get-started/your-authtoken
echo STEP 3: Reserve domain -  https://dashboard.ngrok.com/domains
echo         (it looks like: xxxx.ngrok-free.app)
echo.
echo --------------------------------------------
echo To paste in this window: RIGHT-CLICK with the mouse.
echo.

set /p TOKEN=Paste your AUTHTOKEN here: 
if "%TOKEN%"=="" goto no_token

echo.
set /p DOMAIN=Paste your DOMAIN here (like xxxx.ngrok-free.app): 
if "%DOMAIN%"=="" goto no_domain

>"ngrok_token.txt" echo %TOKEN%
>"ngrok_domain.txt" echo %DOMAIN%

echo.
if not exist "ngrok.exe" echo NOTE: ngrok.exe is NOT next to this file. Put ngrok.exe in this same folder!
echo ============================================
echo    SAVED OK:
echo      ngrok_token.txt
echo      ngrok_domain.txt
echo.
echo    Now run start.bat
echo    Your FIXED link will appear and be copied.
echo ============================================
pause
exit /b 0

:no_token
echo.
echo You typed nothing. Run this file again and paste the authtoken.
pause
exit /b 1

:no_domain
echo.
echo You typed nothing. Nothing was saved.
echo Run this file again from the start and paste both values.
pause
exit /b 1
