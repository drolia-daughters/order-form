@echo off
title Sentire Main Page - Local Test
cd /d "%~dp0"
set PY=
python --version >nul 2>&1 && set PY=python
if not defined PY py --version >nul 2>&1 && set PY=py
if not defined PY (
    echo Python is not installed. Opening the Microsoft Store - click "Get", then run this file again.
    start ms-windows-store://pdp/?productid=9NCVDN91XZQP
    pause
    exit /b
)
echo Sentire Main Page is running at http://localhost:8000
echo.
echo  KEEP THIS WINDOW OPEN while you use it. Close it to stop.
echo.
start "" http://localhost:8000
%PY% -m http.server 8000
