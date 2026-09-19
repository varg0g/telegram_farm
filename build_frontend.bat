@echo off
chcp 65001 > nul
title Сборка фронтенда Telegram Farm CRM v2

echo ====================================================================
echo        Сборка React + Vite + Tailwind CSS фронтенда
echo ====================================================================
cd /d "%~dp0frontend"
set PATH=C:\Program Files\nodejs;%PATH%
call npm run build
if %errorlevel% equ 0 (
    echo.
    echo [УСПЕХ] Фронтенд успешно собран в папку frontend/dist!
) else (
    echo.
    echo [ОШИБКА] Ошибка сборки фронтенда.
)
pause
