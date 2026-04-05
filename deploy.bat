@echo off
chcp 65001 >nul
echo 🚀 Начинаем деплой приложения на сервер без создания ZIP архивов...

:: НАСТРОЙКИ СЕРВЕРА (Измените IP на нужный)
set SERVER=root@IP_ВАШЕГО_СЕРВЕРА
set DEST=/root/wgtg_temp/wgtg_temp

echo 📦 Копирование файлов на лету (игнорируем .env и node_modules)...
:: Используем встроенный в Windows инструмент tar для передачи потока прямо в SSH без создания файла
tar -c -f - --exclude=node_modules --exclude=.env --exclude=.git --exclude=logs --exclude=.vscode * | ssh %SERVER% "mkdir -p %DEST% && cd %DEST% && tar -xf -"

if %errorlevel% neq 0 (
    echo ❌ Ошибка при копировании файлов. Проверьте соединение с сервером!
    pause
    exit /b %errorlevel%
)

echo 🔄 Перезапуск PM2...
ssh %SERVER% "cd %DEST% && npm install && pm2 restart ecosystem.config.js"

echo ✅ Деплой успешно завершен!
pause
