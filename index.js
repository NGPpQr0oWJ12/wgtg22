// Принудительно используем IPv4 для всех DNS-запросов (решает проблему AggregateError в Node.js 17+)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WgEasyService = require('./services/wgEasy');
const initHandlers = require('./bot/handlers');

// Проверка переменных
const token = process.env.TELEGRAM_BOT_TOKEN;
const wgUrl = process.env.WG_EASY_URL;
const wgPassword = process.env.WG_EASY_PASSWORD;
const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
// Инициализация
const bot = new TelegramBot(token, { 
    polling: true,
    request: {
        agentOptions: {
            family: 4 // Принудительно использовать IPv4
        }
    }
});

// Очистка вебхука перед запуском (решает проблему 409 Conflict при перезапусках)
bot.deleteWebHook().then(() => {
    console.log('🧹 Старые вебхуки удалены');
});
const wgService = new WgEasyService(wgUrl, wgPassword);

console.log('🚀 Бот запускается...');
console.log(`🌐 WG-Easy URL: ${wgUrl}`);
console.log(`👮 Админы: ${adminIds.join(', ')}`);

// Запуск логики бота
initHandlers(bot, wgService, adminIds);

console.log('✅ Бот готов к работе!');

// Обработка ошибок polling
bot.on('polling_error', (error) => {
    // В Node 22 AggregateError может скрывать детали. Выводим все доступные данные.
    const statusCode = error.response ? error.response.statusCode : 'N/A';
    console.error(`❌ Polling Error [HTTP ${statusCode}]:`, error.code, error.message);
    
    // Подробное логгирование массива ошибок внутри AggregateError
    if (error.code === 'EFATAL' && error.message.includes('AggregateError')) {
       console.error('🛠 Внутренние причины AggregateError (детально):', error.errors || error.cause);
       if (error.errors && Array.isArray(error.errors)) {
           error.errors.forEach((err, idx) => console.error(`   [${idx}]: ${err.code} - ${err.message}`));
       }
    }

    if (statusCode === 409) {
        console.warn('⚠️ Конфликт: Другой бот запущен с тем же токеном. Рекомендуется pm2 kill и проверка процессов.');
    }
});
