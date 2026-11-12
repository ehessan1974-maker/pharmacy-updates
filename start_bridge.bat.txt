@echo off
title Access DB Bridge - Apotheca
cd /d "%~dp0"
setlocal

echo ==========================================================
echo    Access Database Bridge - Apotheca (HTML app)
echo    Opens the original .accdb database for read and write
echo ==========================================================
echo.

rem --- locate the bridge python file (Arabic filename safe) ---
set "PYF="
if exist "access_bridge.py" set "PYF=access_bridge.py"
if not defined PYF for %%f in (*.py) do set "PYF=%%f"
if not defined PYF (
    echo [X] Bridge file not found - put access_bridge.py next to this .bat
    pause
    exit /b 1
)

rem --- find python (python or py launcher) ---
set "PYCMD="
where python >nul 2>&1 && set "PYCMD=python"
if not defined PYCMD where py >nul 2>&1 && set "PYCMD=py"
if not defined PYCMD (
    echo [X] Python is not installed or not in PATH.
    echo     Download it from https://www.python.org/downloads/
    echo     IMPORTANT: tick "Add python.exe to PATH" during setup.
    pause
    exit /b 1
)

rem --- pyodbc once ---
%PYCMD% -c "import pyodbc" >nul 2>&1
if errorlevel 1 (
    echo Installing pyodbc - one time only...
    %PYCMD% -m pip install pyodbc --quiet
)

echo Starting bridge with %PYCMD% "%PYF%" ...
%PYCMD% "%PYF%"
echo.
echo Bridge stopped.
pause
exit /b 0
