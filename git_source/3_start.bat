@echo off
chcp 65001 >nul
echo Запуск виджета Claude...
cd /d "%~dp0"
call npm start
