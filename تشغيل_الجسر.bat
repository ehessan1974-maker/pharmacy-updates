@echo off
title جسر قاعدة البيانات - فاتورة مشتريات
cd /d "%~dp0"
chcp 65001 >nul

echo ==========================================================
echo    جسر قاعدة البيانات — فاتورة مشتريات (أكسس بدون تحويل)
echo    يشغل قاعدة MDB_be.accdb نفسها للقراءة والكتابة
echo ==========================================================
echo.

where python >nul 2>&1
if errorlevel 1 goto no_python

python -c "import pyodbc" >nul 2>&1
if errorlevel 1 (
    echo تثبيت pyodbc مرة واحدة فقط...
    python -m pip install pyodbc --quiet
)

echo تشغيل الجسر...
python "جسر_أكسس.py"
pause
exit /b 0

:no_python
echo.
echo    مشكلة: بايثون غير مثبت أو غير موجود في PATH.
echo    الحل: شغّل start.bat مرة واحدة — سيخبرك بما يجب تثبيته.
echo.
pause
exit /b 1
