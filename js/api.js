/**
 * ====================================================================
 * API Client for MITRE ATT&CK Matrix Application
 * ====================================================================
 * Version: 5.1 PRODUCTION - Session Token Support + Smart 401 Handling
 * Date: 2025-10-22
 * 
 * ✅ Поддержка session tokens (не JWT!)
 * ✅ Умная обработка 401 (не автоматический редирект)
 * ✅ НЕ удаляет токен при сетевых ошибках
 * ====================================================================
 */

class APIError extends Error {
    constructor(message, status = 0, code = 'UNKNOWN', details = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

const API = {
    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    baseURL: (window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api'),
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    cache: new Map(),
    cacheExpiry: 5 * 60 * 1000, // 5 минут
    last401Time: 0,  // ← Трекируем время последнего 401

    // =========================================================================
    // AUTHENTICATION
    // =========================================================================

    getAuthToken() {
        const token = localStorage.getItem('authToken');
        if (token && token.trim().length > 0) {
            return token;
        }
        return null;
    },

    isAuthenticated() {
        const token = this.getAuthToken();
        if (!token) {
            return false;
        }
        // Session tokens обычно длиннее 20 символов
        return token.length >= 20;
    },

    clearAuth() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        this.cache.clear();
        console.log('🧹 Authentication cleared');
    },

    // =========================================================================
    // URL BUILDING
    // =========================================================================

    buildURL(endpoint, params = null) {
        const url = new URL(`${this.baseURL}${endpoint}`);

        if (params && typeof params === 'object') {
            Object.keys(params).forEach(key => {
                if (params[key] !== null && params[key] !== undefined) {
                    url.searchParams.append(key, params[key]);
                }
            });
        }

        // Добавляем timestamp для предотвращения кэширования
        url.searchParams.append('_t', Date.now());

        return url.toString();
    },

    // =========================================================================
    // HTTP REQUEST WITH TIMEOUT
    // =========================================================================

    async makeRequest(url, config) {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            config.requestTimeout || this.timeout
        );

        try {
            console.log(`📤 API Request: ${config.method} ${url}`);

            const response = await fetch(url, {
                method: config.method,
                headers: config.headers,
                body: config.body,
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            console.log(`📥 API Response: ${response.status} ${response.statusText}`);

            return response;

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                console.error('⏱️ Request timeout');
                throw new APIError('Request timeout', 408, 'TIMEOUT');
            }

            if (!navigator.onLine) {
                console.error('📡 No internet connection');
                throw new APIError('No internet connection', 0, 'NETWORK_ERROR');
            }

            console.error('❌ Network error:', error);
            throw new APIError('Network error', 0, 'NETWORK_ERROR', error);
        }
    },

    // =========================================================================
    // RESPONSE HANDLING
    // =========================================================================

    async handleResponse(response) {
        let data;

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (e) {
                console.error('Failed to parse JSON:', e);
                data = { success: false, error: 'Invalid JSON response' };
            }
        } else {
            const text = await response.text();
            data = { success: response.ok, data: text };
        }

        if (!response.ok) {
            const message = data.error?.message || data.error || data.message || `HTTP ${response.status}`;
            throw new APIError(message, response.status, 'HTTP_ERROR', data);
        }

        return data;
    },

    // =========================================================================
    // MAIN REQUEST METHOD
    // =========================================================================

    async request(method, endpoint, data = null, options = {}) {
        const token = this.getAuthToken();

        const config = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers
            },
            requestTimeout: options.timeout || this.timeout
        };

        // Добавляем токен если есть
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        // Для POST/PUT/PATCH добавляем body
        if (data && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
            config.body = JSON.stringify(data);
        }

        // Строим URL
        const url = this.buildURL(endpoint, config.method === 'GET' ? data : null);
        const cacheKey = `${config.method}:${url}`;

        // Проверяем кэш для GET запросов
        if (config.method === 'GET' && options.useCache !== false) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                console.log('💾 Returning cached data for:', endpoint);
                return cached;
            }
        }

        let lastError;

        // Retry logic
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await this.makeRequest(url, config);
                const result = await this.handleResponse(response);

                // Кэшируем успешные GET запросы
                if (config.method === 'GET' && result.success && options.useCache !== false) {
                    this.setCache(cacheKey, result);
                }

                console.log(`✅ Request successful:`, endpoint);
                return result;

            } catch (error) {
                lastError = error;

                // ✅ ИСПРАВЛЕННАЯ ОБРАБОТКА 401
                if (error.status === 401) {
                    const now = Date.now();
                    const timeSinceLast401 = now - this.last401Time;

                    // Логируем детали
                    console.log('❌ 401 Unauthorized');
                    console.log(`   Message: ${error.message}`);
                    console.log(`   Time since last 401: ${timeSinceLast401}ms`);

                    // ✅ УМНАЯ ЛОГИКА:
                    // Если это первый 401 или прошло менее 5 сек со последнего,
                    // то просто логируем ошибку и выбрасываем,
                    // но НЕ удаляем токен

                    if (timeSinceLast401 < 5000) {
                        console.warn('⚠️ Multiple 401 errors within 5 seconds. NOT clearing auth.');
                        this.last401Time = now;
                        break;
                    }

                    // Если это явно ошибка токена (не сегмента, истечение и т.д.)
                    // то очищаем только при явных признаках
                    const isTokenExpired =
                        error.message.includes('expired') ||
                        error.message.includes('revoked') ||
                        error.message.includes('invalid') && error.message.includes('token');

                    if (isTokenExpired) {
                        console.log('❌ Token expired/revoked - clearing auth');
                        this.clearAuth();
                    } else {
                        console.warn('⚠️ 401 but token may be valid - NOT clearing');
                    }

                    this.last401Time = now;
                    break;
                }

                // Для клиентских ошибок (4xx кроме 401) не делаем retry
                if (error.status >= 400 && error.status < 500) {
                    console.error(`❌ Client error ${error.status}:`, error.message);
                    break;
                }

                // Для серверных ошибок делаем retry
                if (attempt >= this.retryAttempts) {
                    console.error(`❌ Max retries reached (${this.retryAttempts})`);
                    break;
                }

                console.warn(`⚠️ Retry ${attempt}/${this.retryAttempts} for ${endpoint}`);
                await this.delay(this.retryDelay * attempt);
            }
        }

        console.error('❌ API Error:', {
            message: lastError.message,
            method: config.method,
            endpoint,
            status: lastError.status,
            code: lastError.code,
            timestamp: new Date().toISOString()
        });

        throw lastError;
    },

    // =========================================================================
    // UTILITIES
    // =========================================================================

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
            return cached.data;
        }
        if (cached) {
            this.cache.delete(key);
        }
        return null;
    },

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    },

    clearCache() {
        this.cache.clear();
        console.log('🧹 Cache cleared');
    },

    // =========================================================================
    // HTTP METHODS
    // =========================================================================

    async get(endpoint, params = null, options = {}) {
        return this.request('GET', endpoint, params, options);
    },

    async post(endpoint, data = null, options = {}) {
        return this.request('POST', endpoint, data, options);
    },

    async put(endpoint, data = null, options = {}) {
        return this.request('PUT', endpoint, data, options);
    },

    async patch(endpoint, data = null, options = {}) {
        return this.request('PATCH', endpoint, data, options);
    },

    async delete(endpoint, options = {}) {
        return this.request('DELETE', endpoint, null, options);
    },

    // =========================================================================
    // API ENDPOINTS
    // =========================================================================

    async getTechniques(params) {
        return this.get('/techniques', params);
    },

    async getTechnique(techniqueId) {
        return this.get(`/techniques/${techniqueId}`);
    },

    async updateTechnique(techniqueId, data) {
        return this.put(`/techniques/${techniqueId}`, data);
    },

    async getRules(params) {
        return this.get('/rules', params);
    },

    async getRule(ruleId) {
        return this.get(`/rules/${ruleId}`);
    },

    async createRule(data) {
        return this.post('/rules', data);
    },

    async updateRule(ruleId, data) {
        return this.put(`/rules/${ruleId}`, data);
    },

    async deleteRule(ruleId) {
        return this.delete(`/rules/${ruleId}`);
    },

    async getComments(params) {
        return this.get('/comments', params);
    },

    async getComment(commentId) {
        return this.get(`/comments/${commentId}`);
    },

    async createComment(data) {
        return this.post('/comments', data);
    },

    async updateComment(commentId, data) {
        return this.put(`/comments/${commentId}`, data);
    },

    async deleteComment(commentId) {
        return this.delete(`/comments/${commentId}`);
    },

    async getUsers(params) {
        return this.get('/users', params);
    },

    async getUser(userId) {
        return this.get(`/users/${userId}`);
    },

    async createUser(data) {
        return this.post('/users', data);
    },

    async updateUser(userId, data) {
        return this.put(`/users/${userId}`, data);
    },

    async deleteUser(userId) {
        return this.delete(`/users/${userId}`);
    },

    async getAuditLogs(params) {
        return this.get('/audit', params);
    },

    async getAnalytics(params) {
        return this.get('/analytics', params);
    },

    async getStatistics(params) {
        return this.get('/statistics', params);
    },

    async getMatrix() {
        return this.get('/matrix');
    }
};

// =========================================================================
// EXPORT
// =========================================================================

window.API = API;
console.log('✅ API Client v5.1 PRODUCTION initialized (SMART 401 HANDLING)');
