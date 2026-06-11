@echo off
chcp 65001 >nul
echo Настройка автозапуска (создание ярлыка в папке автозагрузки Windows)...
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File install-autostart.ps1
echo Готово!
pause
