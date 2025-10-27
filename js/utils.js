/**
 * MITRE ATT&CK Matrix v10.1
 * Utility Functions and Helpers
 */

const Utils = {

    // ============================================
    // DOM UTILITIES
    // ============================================

    // Безопасное получение элемента
    $(selector) {
        return document.querySelector(selector);
    },

    // Получение всех элементов
    $$(selector) {
        return Array.from(document.querySelectorAll(selector));
    },

    // Создание элемента
    createElement(tag, className = '', content = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (content) element.innerHTML = content;
        return element;
    },

    // Очистка содержимого элемента
    clearElement(element) {
        if (element) {
            element.innerHTML = '';
        }
    },

    // Показать/скрыть элемент
    show(element) {
        if (element) {
            element.style.display = '';
            element.removeAttribute('hidden');
        }
    },

    hide(element) {
        if (element) {
            element.style.display = 'none';
            element.setAttribute('hidden', '');
        }
    },

    toggle(element) {
        if (element) {
            const isHidden = element.style.display === 'none' || element.hasAttribute('hidden');
            if (isHidden) {
                this.show(element);
            } else {
                this.hide(element);
            }
        }
    },

    // Добавление/удаление классов
    addClass(element, className) {
        if (element && className) {
            element.classList.add(...className.split(' '));
        }
    },

    removeClass(element, className) {
        if (element && className) {
            element.classList.remove(...className.split(' '));
        }
    },

    toggleClass(element, className) {
        if (element && className) {
            element.classList.toggle(className);
        }
    },

    hasClass(element, className) {
        return element && element.classList.contains(className);
    },

    // ============================================
    // STRING UTILITIES
    // ============================================

    // Экранирование HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Убрать HTML теги
    stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    },

    // Усечение строки
    truncate(text, length = 100, suffix = '...') {
        if (!text || text.length <= length) return text;
        return text.substring(0, length).trim() + suffix;
    },

    // Capitalize first letter
    capitalize(text) {
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    },

    // Title case
    titleCase(text) {
        if (!text) return '';
        return text.split(' ')
            .map(word => this.capitalize(word))
            .join(' ');
    },

    // Slug from string
    slugify(text) {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    },

    // Generate random string
    randomString(length = 8, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    },

    // ============================================
    // ARRAY UTILITIES
    // ============================================

    // Уникальные значения
    unique(array) {
        return [...new Set(array)];
    },

    // Группировка по ключу
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const group = typeof key === 'function' ? key(item) : item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    },

    // Сортировка по ключу
    sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            const aValue = typeof key === 'function' ? key(a) : a[key];
            const bValue = typeof key === 'function' ? key(b) : b[key];

            if (direction === 'desc') {
                return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
            }
            return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        });
    },

    // Разбиение на чанки
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    // ============================================
    // OBJECT UTILITIES
    // ============================================

    // Deep clone
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));

        const cloned = {};
        Object.keys(obj).forEach(key => {
            cloned[key] = this.deepClone(obj[key]);
        });
        return cloned;
    },

    // Deep merge
    deepMerge(target, source) {
        const result = { ...target };

        Object.keys(source).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        });

        return result;
    },

    // Get nested property safely
    get(obj, path, defaultValue = undefined) {
        const keys = path.split('.');
        let result = obj;

        for (const key of keys) {
            if (result === null || result === undefined) {
                return defaultValue;
            }
            result = result[key];
        }

        return result !== undefined ? result : defaultValue;
    },

    // Set nested property
    set(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = obj;

        for (const key of keys) {
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        current[lastKey] = value;
        return obj;
    },

    // ============================================
    // DATE UTILITIES
    // ============================================

    // Форматирование даты
    formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
        if (!date) return '';

        const d = new Date(date);
        if (isNaN(d.getTime())) return 'Invalid Date';

        const pad = (n) => String(n).padStart(2, '0');

        const replacements = {
            'YYYY': d.getFullYear(),
            'MM': pad(d.getMonth() + 1),
            'DD': pad(d.getDate()),
            'HH': pad(d.getHours()),
            'mm': pad(d.getMinutes()),
            'ss': pad(d.getSeconds())
        };

        let result = format;
        Object.entries(replacements).forEach(([key, value]) => {
            result = result.replace(key, value);
        });

        return result;
    },

    // Относительное время
    timeAgo(date) {
        const now = new Date();
        const diff = now - new Date(date);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (years > 0) return `${years} г. назад`;
        if (months > 0) return `${months} мес. назад`;
        if (weeks > 0) return `${weeks} нед. назад`;
        if (days > 0) return `${days} д. назад`;
        if (hours > 0) return `${hours} ч. назад`;
        if (minutes > 0) return `${minutes} мин. назад`;
        return 'только что';
    },

    // ============================================
    // NUMBER UTILITIES
    // ============================================

    // Форматирование чисел
    formatNumber(number, decimals = 0) {
        return new Intl.NumberFormat('ru-RU', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    },

    // Форматирование размера файла
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    },

    // Генерация случайного числа
    random(min = 0, max = 100) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // ============================================
    // VALIDATION UTILITIES
    // ============================================

    // Email validation
    isEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    // URL validation
    isURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    // Empty check
    isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    },

    // ============================================
    // STORAGE UTILITIES
    // ============================================

    // Local storage with JSON support
    localStorage: {
        set: function (key, value) {
            try {
                window.localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.error('localStorage.set error:', e);
                return false;
            }
        },

        get: function (key, defaultValue = null) {
            try {
                const item = window.localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                console.error('localStorage.get error:', e);
                return defaultValue;
            }
        },

        remove: function (key) {
            try {
                window.localStorage.removeItem(key);
                return true;
            } catch (e) {
                console.error('localStorage.remove error:', e);
                return false;
            }
        },

        clear: function () {
            try {
                window.localStorage.clear();
                return true;
            } catch (e) {
                console.error('localStorage.clear error:', e);
                return false;
            }
        }
    },

    // Session storage with JSON support
    sessionStorage: {
        set: function (key, value) {
            try {
                window.sessionStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.error('sessionStorage.set error:', e);
                return false;
            }
        },

        get: function (key, defaultValue = null) {
            try {
                const item = window.sessionStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                console.error('sessionStorage.get error:', e);
                return defaultValue;
            }
        },

        remove: function (key) {
            try {
                window.sessionStorage.removeItem(key);
                return true;
            } catch (e) {
                console.error('sessionStorage.remove error:', e);
                return false;
            }
        },

        clear: function () {
            try {
                window.sessionStorage.clear();
                return true;
            } catch (e) {
                console.error('sessionStorage.clear error:', e);
                return false;
            }
        }
    },

    // ============================================
    // ASYNC UTILITIES
    // ============================================

    // Delay/sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Debounce
    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },

    // Throttle
    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Retry with exponential backoff
    async retry(fn, maxAttempts = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) throw error;

                console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
                await this.sleep(delay);
                delay *= 2; // Exponential backoff
            }
        }
    },

    // ============================================
    // LOADING INDICATORS
    // ============================================

    // Show loading in element
    showLoading(element, text = 'Загрузка...') {
        if (!element) return;

        element.innerHTML = `
            <div class="loading-indicator">
                <div class="loading-spinner"></div>
                <span>${this.escapeHtml(text)}</span>
            </div>
        `;
    },

    // Show empty state
    showEmptyState(element, options = {}) {
        if (!element) return;

        const defaults = {
            icon: 'fas fa-inbox',
            title: 'Нет данных',
            message: 'Данные отсутствуют или не найдены',
            action: null
        };

        const config = { ...defaults, ...options };

        let actionHtml = '';
        if (config.action) {
            actionHtml = `
                <button class="btn btn-primary" onclick="${config.action.onclick}">
                    ${config.action.text}
                </button>
            `;
        }

        element.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="${config.icon}"></i>
                </div>
                <div class="empty-state-title">${this.escapeHtml(config.title)}</div>
                <div class="empty-state-description">${this.escapeHtml(config.message)}</div>
                ${actionHtml}
            </div>
        `;
    },

    // Show error state
    showErrorState(element, error, options = {}) {
        if (!element) return;

        const defaults = {
            title: 'Произошла ошибка',
            showDetails: false,
            retry: null
        };

        const config = { ...defaults, ...options };

        let detailsHtml = '';
        if (config.showDetails && error) {
            detailsHtml = `<small>${this.escapeHtml(error.toString())}</small>`;
        }

        let retryHtml = '';
        if (config.retry) {
            retryHtml = `
                <button class="btn btn-primary" onclick="${config.retry.onclick}">
                    <i class="fas fa-redo"></i> ${config.retry.text || 'Повторить'}
                </button>
            `;
        }

        element.innerHTML = `
            <div class="empty-state error-state">
                <div class="empty-state-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="empty-state-title">${this.escapeHtml(config.title)}</div>
                <div class="empty-state-description">
                    ${detailsHtml}
                </div>
                ${retryHtml}
            </div>
        `;
    },

    // ============================================
    // URL & QUERY STRING UTILITIES
    // ============================================

    // Parse query string
    parseQueryString(queryString = window.location.search) {
        const params = new URLSearchParams(queryString);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },

    // Build query string
    buildQueryString(params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                searchParams.set(key, value);
            }
        });
        return searchParams.toString();
    },

    // Update URL without reload
    updateURL(params, replace = false) {
        const url = new URL(window.location);
        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, value);
            }
        });

        if (replace) {
            window.history.replaceState({}, '', url);
        } else {
            window.history.pushState({}, '', url);
        }
    },

    // ============================================
    // DEVICE & BROWSER DETECTION
    // ============================================

    // Check if mobile
    isMobile() {
        return window.innerWidth <= 768;
    },

    // Check if tablet
    isTablet() {
        return window.innerWidth > 768 && window.innerWidth <= 1024;
    },

    // Check if desktop
    isDesktop() {
        return window.innerWidth > 1024;
    },

    // Get device type
    getDeviceType() {
        if (this.isMobile()) return 'mobile';
        if (this.isTablet()) return 'tablet';
        return 'desktop';
    },

    // Check if touch device
    isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
};

// Export Utils
window.Utils = Utils;
