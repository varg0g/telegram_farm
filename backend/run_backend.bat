@echo off
chcp 65001 > nul
echo ===================================================
echo   Запуск Telegram Farm CRM v2 - Backend
echo ===================================================
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
