@echo off
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
chcp 65001 > nul
title Telegram Farm CRM v2

echo ====================================================================
echo        Telegram Farm CRM v2 - High Performance Edition
echo ====================================================================
echo.
echo [1/3] Checking Python environment...
python --version > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

echo [2/3] Checking and freeing port 8000...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a > nul 2>&1
)

echo [3/3] Opening browser at http://127.0.0.1:8000 ...
start "" "http://127.0.0.1:8000"

echo Starting server FastAPI + Telethon...
cd /d "%~dp0backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

pause
