@echo off
chcp 65001 >nul
echo Установка зависимостей виджета (требуется Node.js)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo Возникла ошибка при установке. Проверьте, установлен ли Node.js!
) else (
    echo.
    echo Зависимости успешно установлены!
)
pause
