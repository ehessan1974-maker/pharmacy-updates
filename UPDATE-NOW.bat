@echo off
title Pharmacy Ehsan - Updater
cd /d "%~dp0"
chcp 65001 >nul

echo ==========================================
echo    Pharmacy Ehsan - One-Click Updater
echo    (one time only - after this, updates
echo     arrive automatically inside the app)
echo ==========================================
echo.

where python >nul 2>&1
if errorlevel 1 goto no_python

python updater_once.py

echo.
echo ==========================================
echo    Done. If you see success above,
echo    run start.bat as usual.
echo ==========================================
pause
exit /b 0

:no_python
echo.
echo    PROBLEM: Python is not installed / not in PATH.
echo    FIX: run start.bat once - it will tell you what to install.
echo.
pause
exit /b 1
