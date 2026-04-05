const axios = require('axios');

class WgEasyService {
    constructor(baseUrl, password) {
        this.baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';
        this.password = password || '';
        this.isAuthenticated = false;
        this.cookie = null;
    }

    updateCredentials(baseUrl, password) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.password = password;
        this.isAuthenticated = false;
        this.cookie = null;
    }

    get hasCredentials() {
        return this.baseUrl && this.password;
    }

    async login() {
        if (!this.hasCredentials) throw new Error('WG-Easy URL или пароль не заданы.');

        try {
            const response = await axios.post(`${this.baseUrl}/api/session`, {
                password: this.password,
            });

            const cookies = response.headers['set-cookie'];
            if (cookies) {
                // Берем куку session, или просто все куки
                this.cookie = cookies;
            }

            this.isAuthenticated = true;
            console.log('Успешный вход в WG-Easy');
        } catch (error) {
            console.error('Ошибка входа в WG-Easy:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
            }
            throw error;
        }
    }

    async ensureAuth() {
        if (!this.isAuthenticated || !this.cookie) {
            await this.login();
        }
    }

    async request(method, url, data = null, options = {}) {
        await this.ensureAuth();

        const config = {
            method,
            url: `${this.baseUrl}${url}`,
            headers: {
                Cookie: this.cookie,
                ...options.headers
            },
            ...options
        };

        if (data) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            // Если 401, пробуем релогин
            if (error.response && error.response.status === 401) {
                console.log('Попытка ре-авторизации...');
                this.isAuthenticated = false;
                await this.login();

                // Обновляем куку в конфиге
                config.headers.Cookie = this.cookie;
                const response = await axios(config);
                return response.data;
            }
            throw error;
        }
    }

    async getClients() {
        try {
            return await this.request('get', '/api/wireguard/client');
        } catch (error) {
            console.error('Ошибка получения клиентов:', error.message);
            throw error;
        }
    }

    async createClient(name) {
        try {
            await this.request('post', '/api/wireguard/client', { name });

            // WG-Easy API может не возвращать объект созданного клиента, или возвращать без ID.
            // Поэтому делаем запрос списка и ищем по имени.
            const clients = await this.getClients();
            const client = clients.find(c => c.name === name);

            if (!client) {
                throw new Error('Клиент создан, но не найден в списке');
            }

            return client;
        } catch (error) {
            console.error('Ошибка создания клиента:', error.message);
            throw error;
        }
    }

    async deleteClient(id) {
        try {
            await this.request('delete', `/api/wireguard/client/${id}`);
            return true;
        } catch (error) {
            console.error('Ошибка удаления клиента:', error.message);
            throw error;
        }
    }

    async getConfig(id) {
        try {
            return await this.request('get', `/api/wireguard/client/${id}/configuration`, null, {
                responseType: 'text'
            });
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            console.error('Ошибка получения конфига:', error.message);
            throw error;
        }
    }
}

module.exports = WgEasyService;
