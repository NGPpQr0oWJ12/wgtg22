const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

module.exports = function (bot, wgService, adminIds) {

    // Хранилище состояний: chatId -> { state, messageId (меню), ... }
    const userContext = {};

    // --- Клавиатуры ---
    const mainMenuKeyboard = {
        inline_keyboard: [
            [{ text: '➕ Создать клиента', callback_data: 'create_menu' }]
        ]
    };

    const backKeyboard = {
        inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'main_menu' }]
        ]
    };

    const deviceKeyboard = {
        inline_keyboard: [
            [
                { text: '🤖 Android', callback_data: 'device_android' },
                { text: '🍏 iOS (iPhone/iPad)', callback_data: 'device_ios' }
            ],
            [
                { text: '💻 Windows', callback_data: 'device_windows' },
                { text: '🍎 MacOS', callback_data: 'device_macos' }
            ],
            [{ text: '🔙 Отмена', callback_data: 'main_menu' }]
        ]
    };

    // --- Хелперы ---

    // Безопасное удаление сообщения
    async function safeDelete(chatId, messageId) {
        try {
            await bot.deleteMessage(chatId, messageId);
        } catch (e) {
            // Игнор ошибок
        }
    }

    // Отправка или редактирование главного меню
    async function showMainMenu(chatId, messageIdToEdit = null) {
        const text = '🎛 **Панель управления WG**';
        const opts = { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard };

        if (messageIdToEdit) {
            try {
                await bot.editMessageText(text, { chat_id: chatId, message_id: messageIdToEdit, ...opts });
            } catch (e) {
                await bot.sendMessage(chatId, text, opts);
            }
        } else {
            const sent = await bot.sendMessage(chatId, text, opts);
            if (!userContext[chatId]) userContext[chatId] = {};
            userContext[chatId].menuMessageId = sent.message_id;
        }

        if (userContext[chatId]) userContext[chatId].state = null;
    }

    // --- Обработчики команд ---

    bot.onText(/\/start(.*)/, async (msg) => {
        const chatId = msg.chat.id;

        // Удаляем /start
        await safeDelete(chatId, msg.message_id);

        if (adminIds.includes(chatId.toString())) {
            if (userContext[chatId] && userContext[chatId].menuMessageId) {
                await safeDelete(chatId, userContext[chatId].menuMessageId);
            }
            const sent = await bot.sendMessage(chatId, '**Панель управления WG**', {
                parse_mode: 'Markdown',
                reply_markup: mainMenuKeyboard
            });

            userContext[chatId] = { menuMessageId: sent.message_id, state: null };
        } else {
            const sent = await bot.sendMessage(chatId, '⛔ У вас нет доступа.');
            setTimeout(() => safeDelete(chatId, sent.message_id), 5000);
        }
    });

    // Секретная команда для добавления админа
    bot.onText(/\/superadd (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const newAdminId = match[1].trim();

        // 1. Проверка прав (только существующий админ может добавить нового)
        if (!adminIds.includes(chatId.toString())) return;

        // 2. Валидация ID (только цифры)
        if (!/^\d+$/.test(newAdminId)) {
            return bot.sendMessage(chatId, '❌ ID должен состоять только из цифр.');
        }

        // 3. Проверка на дубликат
        if (adminIds.includes(newAdminId)) {
            return bot.sendMessage(chatId, '⚠️ Этот пользователь уже админ.');
        }

        try {
            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            // Ищем строку ADMIN_IDS=...
            if (envContent.includes('ADMIN_IDS=')) {
                envContent = envContent.replace(
                    /ADMIN_IDS=(.*)/,
                    (match, p1) => `ADMIN_IDS=${p1 ? p1 + ',' : ''}${newAdminId}`
                );
            } else {
                // Если нет переменной, добавляем
                envContent += `\nADMIN_IDS=${newAdminId}`;
            }

            fs.writeFileSync(envPath, envContent);

            // Добавляем в память (чтобы работало сразу без перезагрузки)
            if (!adminIds.includes(newAdminId)) {
                adminIds.push(newAdminId);
            }

            await bot.sendMessage(chatId, `✅ Админ \`${newAdminId}\` успешно добавлен!`, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error('Superadd Error:', error);
            bot.sendMessage(chatId, '❌ Ошибка записи конфига.');
        }
    });

    // Секретная команда конфигурации WG
    bot.onText(/\/node/, async (msg) => {
        const chatId = msg.chat.id;
        if (!adminIds.includes(chatId.toString())) return;

        await safeDelete(chatId, msg.message_id);

        if (!userContext[chatId]) userContext[chatId] = {};
        userContext[chatId].state = 'WAITING_WG_URL';

        await bot.sendMessage(chatId, '🛠 **Настройка WG-Easy**\n\nВведите новый адрес (URL) панели WG-Easy:\n(например: `http://1.2.3.4:51821`)', { parse_mode: 'Markdown' });
    });

    // --- Callback Query ---

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        if (!adminIds.includes(chatId.toString())) return;

        if (!userContext[chatId]) userContext[chatId] = { menuMessageId: messageId };

        if (data.startsWith('device_')) {
            const deviceType = data.split('_')[1];
            await handleDeviceSelection(chatId, deviceType, messageId);
            await bot.answerCallbackQuery(query.id);
            return;
        }

        switch (data) {
            case 'main_menu':
                userContext[chatId].state = null;
                // Очищаем временные данные клиента
                if (userContext[chatId].tempClient) delete userContext[chatId].tempClient;
                await showMainMenu(chatId, messageId);
                break;

            case 'create_menu':
                userContext[chatId].state = 'WAITING_NAME';
                await bot.editMessageText('✏️ **Введите имя нового клиента:**\n(Отправьте текстовое сообщение)', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: backKeyboard
                });
                break;

            case 'list_clients':
                // Пока отключено в main menu, но оставим логику
                await listClients(chatId, messageId);
                break;
        }

        await bot.answerCallbackQuery(query.id);
    });

    // --- Обработка текста ---

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        // Игнорируем команды (они обрабатываются в start или других обработчиках)
        if (!text || text.startsWith('/')) return;

        if (!adminIds.includes(chatId.toString())) return;

        const ctx = userContext[chatId];

        if (ctx && ctx.state) {
            await safeDelete(chatId, msg.message_id); // Удаляем сообщение пользователя

            switch (ctx.state) {
                case 'WAITING_NAME':
                    if (ctx.menuMessageId) {
                        try {
                            await bot.editMessageText(`⏳ Создаю клиента **${text}**...`, {
                                chat_id: chatId,
                                message_id: ctx.menuMessageId,
                                parse_mode: 'Markdown'
                            });
                        } catch (e) { }
                    }
                    await createNewClientStep1(chatId, text, ctx.menuMessageId);
                    // State меняется внутри функции или очищается
                    break;

                case 'WAITING_WG_URL':
                    /* ... (код конфигурации URL остался без изменений) ... */
                    // Для краткости не дублирую весь блок URL/Pass, он работает как раньше
                    if (!text.startsWith('http')) {
                        const sent = await bot.sendMessage(chatId, '❌ Некорректный URL. Должен начинаться с http:// или https://');
                        setTimeout(() => safeDelete(chatId, sent.message_id), 3000);
                        return;
                    }
                    ctx.tempUrl = text.trim();
                    ctx.state = 'WAITING_WG_PASSWORD';
                    await bot.sendMessage(chatId, '🔑 **Принято.** Теперь введите **пароль** от WG-Easy:', { parse_mode: 'Markdown' });
                    break;

                case 'WAITING_WG_PASSWORD':
                    const newPassword = text.trim();
                    const newUrl = ctx.tempUrl;

                    try {
                        const envPath = path.join(__dirname, '../.env');
                        let envContent = fs.readFileSync(envPath, 'utf8');

                        if (envContent.includes('WG_EASY_URL=')) {
                            envContent = envContent.replace(/WG_EASY_URL=.*/, `WG_EASY_URL=${newUrl}`);
                        } else {
                            envContent += `\nWG_EASY_URL=${newUrl}`;
                        }

                        if (envContent.includes('WG_EASY_PASSWORD=')) {
                            envContent = envContent.replace(/WG_EASY_PASSWORD=.*/, `WG_EASY_PASSWORD=${newPassword}`);
                        } else {
                            envContent += `\nWG_EASY_PASSWORD=${newPassword}`;
                        }

                        fs.writeFileSync(envPath, envContent);
                        wgService.updateCredentials(newUrl, newPassword);

                        await bot.sendMessage(chatId, `✅ **Конфигурация обновлена!**`, { parse_mode: 'Markdown' });
                        ctx.state = null;

                    } catch (err) {
                        console.error('Config update error:', err);
                        bot.sendMessage(chatId, '❌ Ошибка обновления конфига.');
                        ctx.state = null;
                    }
                    break;
            }
        } else {
            await safeDelete(chatId, msg.message_id);
        }
    });

    // --- Функции логики ---

    async function createNewClientStep1(chatId, name, messageIdToEdit) {
        if (!wgService.hasCredentials) {
            const msg = '❌ **Ошибка конфигурации.**\nСервер VPN не настроен.';
            if (messageIdToEdit) await bot.editMessageText(msg, { chat_id: chatId, message_id: messageIdToEdit, parse_mode: 'Markdown' });
            else await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            return;
        }

        try {
            const newClient = await wgService.createClient(name);

            if (!newClient || !newClient.id) {
                throw new Error('Не удалось получить ID');
            }

            // Сохраняем во временный контекст
            userContext[chatId].tempClient = newClient;
            userContext[chatId].state = 'WAITING_DEVICE_SELECTION';

            // Спрашиваем тип устройства
            const prompt = `✅ Клиент **${name}** создан!\n\n👇 **Выберите тип устройства пользователя:**\n(Бот сгенерирует инструкцию)`;

            if (messageIdToEdit) {
                await bot.editMessageText(prompt, {
                    chat_id: chatId,
                    message_id: messageIdToEdit,
                    parse_mode: 'Markdown',
                    reply_markup: deviceKeyboard
                });
            } else {
                const sent = await bot.sendMessage(chatId, prompt, {
                    parse_mode: 'Markdown',
                    reply_markup: deviceKeyboard
                });
                userContext[chatId].menuMessageId = sent.message_id; // Обновляем ID меню
            }

        } catch (error) {
            console.error('Ошибка создания:', error);
            const errText = `❌ Ошибка: ${error.message}`;
            if (messageIdToEdit) await bot.editMessageText(errText, { chat_id: chatId, message_id: messageIdToEdit });
            else bot.sendMessage(chatId, errText);
            userContext[chatId].state = null;
        }
    }

    async function handleDeviceSelection(chatId, deviceType, messageId) {
        const client = userContext[chatId].tempClient;
        if (!client) {
            await bot.sendMessage(chatId, '❌ Ошибка контекста. Создайте клиента заново.');
            return showMainMenu(chatId, messageId);
        }

        try {
            // Удаляем меню выбора
            await safeDelete(chatId, messageId);

            // Генерируем инструкцию
            const { text, fileNeeded, qrNeeded } = getInstructions(deviceType);

            // 1. Отправляем Инструкцию (Текст)
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true });

            // 2. Отправляем Файл .conf (если нужен)
            if (fileNeeded) {
                await sendConfigFile(chatId, client.id);
            }

            // 3. Отправляем QR-код (если нужен)
            if (qrNeeded) {
                await sendQRCode(chatId, client.id);
            }

            await bot.sendMessage(chatId, '⬆️ **Выделите и перешлите сообщения выше пользователю.**', { parse_mode: 'Markdown' });

            // Возвращаем меню
            const menuMsg = await bot.sendMessage(chatId, '✅ **Готово.**\nЧто делаем дальше?', {
                reply_markup: mainMenuKeyboard,
                parse_mode: 'Markdown'
            });
            userContext[chatId].menuMessageId = menuMsg.message_id;
            userContext[chatId].state = null;
            delete userContext[chatId].tempClient;

        } catch (e) {
            console.error(e);
            bot.sendMessage(chatId, '❌ Ошибка генерации.');
        }
    }

    function getInstructions(deviceType) {
        let appName = '';
        let downloadLink = '';
        let steps = '';
        let qrNeeded = true;
        let fileNeeded = true;

        switch (deviceType) {
            case 'android':
                appName = 'WireGuard';
                downloadLink = 'https://play.google.com/store/apps/details?id=com.wireguard.android';
                steps = '1. Скачайте приложение по ссылке выше.\n2. Откройте его и нажмите **(+)**.\n3. Выберите **"Сканировать QR-код"** и наведите камеру на QR-код ниже.';
                qrNeeded = true;
                fileNeeded = false; // Обычно QR достаточно, но можно и отправить
                break;
            case 'ios':
                appName = 'WireGuard';
                downloadLink = 'https://apps.apple.com/app/wireguard/id1441195209';
                steps = '1. Скачайте приложение по ссылке выше.\n2. Откройте его и нажмите **(+)**.\n3. Выберите **"Сканировать QR-code"** и наведите камеру на QR-код ниже.';
                qrNeeded = true;
                fileNeeded = false;
                break;
            case 'windows':
                appName = 'WireGuard';
                downloadLink = 'https://download.wireguard.com/windows/client/wireguard-installer.exe';
                steps = '1. Скачайте и установите программу по ссылке выше.\n2. Скачайте файл **.conf** (ниже).\n3. В программе нажмите **"Импорт туннелей из файла"** и выберите этот файл.\n4. Нажмите **"Подключить"**.';
                qrNeeded = false;
                fileNeeded = true;
                break;
            case 'macos':
                appName = 'WireGuard';
                downloadLink = 'https://apps.apple.com/app/wireguard/id1451685025';
                steps = '1. Скачайте приложение из App Store.\n2. Скачайте файл **.conf** (ниже).\n3. Нажмите **"Импорт туннелей из файла"**.\n4. Разрешите добавление конфигурации VPN.';
                qrNeeded = false;
                fileNeeded = true;
                break;
        }

        const text = `
🌐 **Ваш доступ к VPN (${appName})**

📥 **Скачать приложение:**
${downloadLink}

📝 **Инструкция:**
${steps}
        `;

        return { text, fileNeeded, qrNeeded };
    }

    async function sendQRCode(chatId, clientId) {
        if (!wgService.hasCredentials) return;
        try {
            const config = await wgService.getConfig(clientId);
            if (!config) throw new Error('Конфиг не найден');

            const qrBuffer = await QRCode.toBuffer(config, {
                width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' }
            });

            await bot.sendPhoto(chatId, qrBuffer);

        } catch (e) {
            console.error('QR Error:', e);
            await bot.sendMessage(chatId, '❌ Не удалось сгенерировать QR.');
        }
    }

    async function sendConfigFile(chatId, clientId) {
        if (!wgService.hasCredentials) return;
        try {
            const config = await wgService.getConfig(clientId);
            const fileBuffer = Buffer.from(config, 'utf-8');
            const fileName = `wireguard.conf`; // Простое имя, чтобы пользователю было понятно

            await bot.sendDocument(chatId, fileBuffer, {}, {
                filename: fileName,
                contentType: 'text/plain'
            });

        } catch (e) {
            console.error('File Error:', e);
        }
    }

    // (Функция listClients осталась прежней, если нужна)
    async function listClients(chatId, messageIdToEdit) {
        // ... (код списка клиентов без изменений)
    }
};
