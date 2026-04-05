#!/bin/bash

# Stop on error
set -e

echo "🔄 Начинаем обновление WG-TG-Bot..."

# Сброс локальных изменений (забыли что-то поменять) и скачивание свежего кода с Github
echo "📦 Загрузка нового кода с GitHub..."
git reset --hard HEAD
git pull

# Установка новых зависимостей (если появились)
echo "📦 Обновление библиотек (npm install)..."
npm install

# Перезапуск бота
echo "♻️ Перезапуск приложения..."
pm2 restart ecosystem.config.js
pm2 save

echo ""
echo "✅ Обновление успешно завершено!"
echo "Для просмотра логов введите: pm2 logs wgtg22"
