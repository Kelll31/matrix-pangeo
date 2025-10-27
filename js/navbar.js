/**
 * =============================================================================
 * NAVBAR CONTROLLER v1.2
 * =============================================================================
 * Управление навигационной панелью: поиск, статистика, действия, меню пользователя
 * 
 * @version 1.2.0
 * @date 2025-10-24
 */

const NavbarController = {
    // ========================================
    // КОНФИГУРАЦИЯ
    // ========================================

    config: {
        searchMinLength: 2,
        searchDebounceDelay: 300,
        animationDuration: 200,
        logoutApiUrl: 'http://172.30.250.199:5000/api/users/logout',
        checkAuthApiUrl: 'http://172.30.250.199:5000/api/users/check-auth',
        loginPageUrl: '/login.html'
    },

    // ========================================
    // СОСТОЯНИЕ
    // ========================================

    state: {
        sidebarOpen: true,
        userMenuOpen: false,
        searchActive: false,
        searchQuery: '',
        searchResults: [],
        searchDebounceTimer: null,
        initialized: false,
        currentUser: null
    },

    // ========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ========================================

    /**
     * Инициализация контроллера
     */
    async init() {
        // Предотвращаем повторную инициализацию
        if (this.state.initialized) {
            console.log('⚠️ Navbar Controller already initialized');
            return;
        }

        console.log('🎯 Initializing Navbar Controller...');

        this.cacheElements();
        this.bindEvents();
        this.initializeSidebar();

        // Загружаем информацию о пользователе
        await this.loadUserInfo();

        this.updateStats();

        this.state.initialized = true;
        console.log('✅ Navbar Controller initialized');
    },

    /**
     * Кэширование DOM элементов
     */
    cacheElements() {
        this.elements = {
            // Sidebar toggle
            sidebarToggle: document.getElementById('sidebarToggle'),
            sidebar: document.querySelector('.sidebar'),
            mainContent: document.querySelector('.main-content'),

            // Search
            searchContainer: document.querySelector('.search-container'),
            searchInput: document.getElementById('globalSearch'),
            searchBtn: document.querySelector('.search-btn'),

            // Stats
            totalTechniques: document.getElementById('navTotalTechniques'),
            totalRules: document.getElementById('navTotalRules'),

            // Actions
            downloadBtn: document.getElementById('downloadBtn'),
            refreshBtn: document.getElementById('refreshBtn'),

            // User menu
            userMenuBtn: document.getElementById('userMenuBtn'),
            userDropdown: document.getElementById('userDropdown'),
            userNameElement: document.querySelector('.navbar-user-name'),
            logoutLinks: document.querySelectorAll('.dropdown-item')
        };
    },

    /**
     * Привязка событий
     */
    bindEvents() {
        // Sidebar toggle
        if (this.elements.sidebarToggle) {
            this.elements.sidebarToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleSidebar();
            }, false);
        }

        // Search
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => this.handleSearchInput(e), false);
            this.elements.searchInput.addEventListener('focus', () => this.handleSearchFocus(), false);
            this.elements.searchInput.addEventListener('blur', () => this.handleSearchBlur(), false);
            this.elements.searchInput.addEventListener('keydown', (e) => this.handleSearchKeydown(e), false);
        }

        if (this.elements.searchBtn) {
            this.elements.searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleSearch();
            }, false);
        }

        // Actions
        if (this.elements.downloadBtn) {
            this.elements.downloadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleDownload();
            }, false);
        }

        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleRefresh();
            }, false);
        }

        // User menu
        if (this.elements.userMenuBtn) {
            this.elements.userMenuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleUserMenu(e);
            }, false);
        }

        // Logout button
        this.bindLogoutEvent();

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => this.handleOutsideClick(e), false);

        // Keyboard shortcuts - используем capture phase для избежания конфликтов
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e), true);

        // Window resize
        window.addEventListener('resize', () => this.handleResize(), false);
    },

    /**
     * Привязка события logout к кнопке выхода
     */
    bindLogoutEvent() {
        if (this.elements.logoutLinks) {
            this.elements.logoutLinks.forEach(link => {
                const linkText = link.querySelector('span');
                if (linkText && linkText.textContent.trim() === 'Выход') {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleLogout();
                    }, false);
                }
            });
        }
    },

    /**
     * Инициализация sidebar из localStorage
     */
    initializeSidebar() {
        const savedState = localStorage.getItem('sidebarOpen');
        if (savedState !== null) {
            this.state.sidebarOpen = savedState === 'true';
            this.applySidebarState();
        }
    },

    // ========================================
    // ПОЛЬЗОВАТЕЛЬ
    // ========================================

    /**
     * Загрузка информации о пользователе из API
     */
    async loadUserInfo() {
        const token = localStorage.getItem('authToken');

        if (!token) {
            console.warn('⚠️ No auth token found');
            return;
        }

        try {
            const response = await fetch(this.config.checkAuthApiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok && data.success && data.data.authenticated) {
                const user = data.data.user;
                this.state.currentUser = user;

                // Сохраняем данные пользователя в localStorage
                localStorage.setItem('user', JSON.stringify(user));
                localStorage.setItem('username', user.username);
                localStorage.setItem('email', user.email);
                localStorage.setItem('role', user.role);

                // Отображаем имя пользователя
                this.displayUserName(user);

                console.log('👤 User loaded:', user);
            } else {
                console.warn('⚠️ User not authenticated');
            }

        } catch (error) {
            console.error('❌ Error loading user info:', error);
        }
    },

    /**
     * Отображение имени пользователя в navbar
     */
    displayUserName(user) {
        if (!this.elements.userNameElement) {
            console.warn('⚠️ User name element not found');
            return;
        }

        // Приоритет: full_name > username
        const displayName = user.full_name || user.username || 'Пользователь';

        this.elements.userNameElement.textContent = displayName;

        console.log(`✅ User name displayed: ${displayName}`);
    },

    // ========================================
    // SIDEBAR УПРАВЛЕНИЕ
    // ========================================

    /**
     * Переключение sidebar
     */
    toggleSidebar() {
        this.state.sidebarOpen = !this.state.sidebarOpen;
        this.applySidebarState();
        this.saveSidebarState();

        console.log(`📂 Sidebar ${this.state.sidebarOpen ? 'opened' : 'closed'}`);
    },

    /**
     * Применение состояния sidebar
     */
    applySidebarState() {
        const body = document.body;

        if (this.state.sidebarOpen) {
            body.classList.remove('sidebar-collapsed');
        } else {
            body.classList.add('sidebar-collapsed');
        }

        // Trigger resize event для адаптации контента
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    },

    /**
     * Сохранение состояния sidebar
     */
    saveSidebarState() {
        localStorage.setItem('sidebarOpen', this.state.sidebarOpen);
    },

    // ========================================
    // ПОИСК
    // ========================================

    /**
     * Обработка ввода в поиск
     */
    handleSearchInput(e) {
        const query = e.target.value.trim();
        this.state.searchQuery = query;

        // Debounce search
        clearTimeout(this.state.searchDebounceTimer);

        if (query.length >= this.config.searchMinLength) {
            this.state.searchDebounceTimer = setTimeout(() => {
                this.performSearch(query);
            }, this.config.searchDebounceDelay);
        } else {
            this.clearSearchResults();
        }
    },

    /**
     * Фокус на поиске
     */
    handleSearchFocus() {
        this.state.searchActive = true;
        if (this.elements.searchContainer) {
            this.elements.searchContainer.classList.add('search-active');
        }
    },

    /**
     * Потеря фокуса
     */
    handleSearchBlur() {
        setTimeout(() => {
            this.state.searchActive = false;
            if (this.elements.searchContainer) {
                this.elements.searchContainer.classList.remove('search-active');
            }
        }, 200);
    },

    /**
     * Обработка клавиш в поиске
     */
    handleSearchKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.performSearch(this.state.searchQuery);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.clearSearch();
        }
    },

    /**
     * Переключение поиска
     */
    toggleSearch() {
        if (this.elements.searchInput) {
            this.elements.searchInput.focus();
        }
    },

    /**
     * Выполнение поиска
     */
    async performSearch(query) {
        console.log(`🔍 Searching for: "${query}"`);

        try {
            // TODO: Implement actual search API call
            // const results = await API.search(query);

            // Mock search results
            const results = await this.mockSearch(query);

            this.state.searchResults = results;
            this.displaySearchResults(results);

        } catch (error) {
            console.error('❌ Search error:', error);
            if (window.Notifications) {
                Notifications.show('Ошибка поиска', 'error');
            }
        }
    },

    /**
     * Mock search (временная заглушка)
     */
    async mockSearch(query) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    { type: 'technique', id: 'T1078', name: 'Valid Accounts' },
                    { type: 'tactic', id: 'TA0001', name: 'Initial Access' },
                    { type: 'rule', id: 'R001', name: 'Suspicious Login' }
                ]);
            }, 300);
        });
    },

    /**
     * Отображение результатов поиска
     */
    displaySearchResults(results) {
        // TODO: Implement search results dropdown
        console.log('📋 Search results:', results);

        // Можно использовать ModalEngine для отображения результатов
        if (window.ModalEngine && results.length > 0) {
            const content = this.renderSearchResults(results);
            // Показываем результаты в дропдауне или модалке
        }
    },

    /**
     * Рендеринг результатов поиска
     */
    renderSearchResults(results) {
        return results.map(result => `
            <div class="search-result-item" data-type="${result.type}" data-id="${result.id}">
                <div class="result-icon">
                    ${this.getResultIcon(result.type)}
                </div>
                <div class="result-info">
                    <div class="result-id">${result.id}</div>
                    <div class="result-name">${result.name}</div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Получить иконку для типа результата
     */
    getResultIcon(type) {
        const icons = {
            technique: '🎯',
            tactic: '📋',
            rule: '🛡️'
        };
        return icons[type] || '📄';
    },

    /**
     * Очистка результатов поиска
     */
    clearSearchResults() {
        this.state.searchResults = [];
        // TODO: Hide search results dropdown
    },

    /**
     * Очистка поиска
     */
    clearSearch() {
        if (this.elements.searchInput) {
            this.elements.searchInput.value = '';
            this.state.searchQuery = '';
            this.clearSearchResults();
            this.elements.searchInput.blur();
        }
    },

    // ========================================
    // СТАТИСТИКА
    // ========================================

    /**
     * Обновление статистики
     */
    async updateStats() {
        try {
            // Получаем статистику из MatrixServices
            if (window.MatrixServices) {
                const matrixData = await MatrixServices.fetchMatrix();
                const stats = matrixData.statistics;

                if (stats) {
                    this.displayStats(stats);
                }
            }
        } catch (error) {
            console.error('❌ Error updating stats:', error);
        }
    },

    /**
     * Отображение статистики
     */
    displayStats(stats) {
        const covered = stats?.overview?.coveredtechniques || stats?.coveredtechniques || 0;
        const total = stats?.overview?.totaltechniques || stats?.totaltechniques || 0;
        const rules = stats?.overview?.totalrules || stats?.totalrules || 0;

        if (this.elements.totalTechniques) {
            this.elements.totalTechniques.textContent = `${covered}/${total}`;
        }

        if (this.elements.totalRules) {
            this.elements.totalRules.textContent = rules;
        }

        console.log('📊 Stats updated:', { covered, total, rules });
    },

    // ========================================
    // ДЕЙСТВИЯ
    // ========================================

    /**
     * Обработка скачивания
     */
    handleDownload() {
        console.log('📥 Download requested');

        if (window.Notifications) {
            Notifications.show('Подготовка экспорта...', 'info');
        }

        // TODO: Implement export functionality
        setTimeout(() => {
            if (window.Notifications) {
                Notifications.show('Функция экспорта в разработке', 'warning');
            }
        }, 500);
    },

    /**
     * Обработка обновления
     */
    async handleRefresh() {
        console.log('🔄 Refresh requested');

        const btn = this.elements.refreshBtn;
        if (btn) {
            btn.classList.add('rotating');
        }

        try {
            // Обновляем данные матрицы
            if (window.MatrixApp && window.MatrixApp.loadMatrix) {
                await window.MatrixApp.loadMatrix();
            }

            // Обновляем статистику
            await this.updateStats();

            if (window.Notifications) {
                Notifications.show('✅ Данные обновлены', 'success');
            }

        } catch (error) {
            console.error('❌ Refresh error:', error);
            if (window.Notifications) {
                Notifications.show('Ошибка обновления', 'error');
            }
        } finally {
            if (btn) {
                setTimeout(() => btn.classList.remove('rotating'), 500);
            }
        }
    },

    // ========================================
    // МЕНЮ ПОЛЬЗОВАТЕЛЯ
    // ========================================

    /**
     * Переключение меню пользователя
     */
    toggleUserMenu(e) {
        this.state.userMenuOpen = !this.state.userMenuOpen;

        if (this.elements.userDropdown) {
            if (this.state.userMenuOpen) {
                this.elements.userDropdown.classList.add('show');
            } else {
                this.elements.userDropdown.classList.remove('show');
            }
        }

        console.log(`👤 User menu ${this.state.userMenuOpen ? 'opened' : 'closed'}`);
    },

    /**
     * Закрытие меню при клике вне его
     */
    handleOutsideClick(e) {
        if (this.state.userMenuOpen) {
            const userMenu = this.elements.userMenuBtn?.closest('.navbar-user');
            if (userMenu && !userMenu.contains(e.target)) {
                this.state.userMenuOpen = false;
                if (this.elements.userDropdown) {
                    this.elements.userDropdown.classList.remove('show');
                }
            }
        }
    },

    // ========================================
    // LOGOUT
    // ========================================

    /**
     * Обработка logout пользователя
     */
    async handleLogout() {
        console.log('🚪 Logout requested');

        const token = localStorage.getItem('authToken');

        try {
            // Отправляем запрос на сервер для деактивации сессии
            const response = await fetch(this.config.logoutApiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                console.log('✅ Logout successful:', data.data.message);

                if (window.Notifications) {
                    Notifications.show('Вы успешно вышли из системы', 'success');
                }
            } else {
                console.warn('⚠️ Logout API warning:', data.error);
            }

        } catch (error) {
            console.error('❌ Logout request failed:', error);

            if (window.Notifications) {
                Notifications.show('Ошибка выхода, но сессия будет очищена', 'warning');
            }
        } finally {
            // Всегда очищаем клиентские данные, даже при ошибке
            this.clearUserSession();

            // Перенаправляем на страницу входа
            setTimeout(() => {
                window.location.href = this.config.loginPageUrl;
            }, 500);
        }
    },

    /**
     * Очистка сессии пользователя на клиенте
     */
    clearUserSession() {
        console.log('🧹 Clearing user session...');

        // Удаляем токен и данные пользователя
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        localStorage.removeItem('username');
        localStorage.removeItem('email');
        localStorage.removeItem('role');

        // Опционально: полная очистка localStorage
        // localStorage.clear();

        // Очистка sessionStorage
        sessionStorage.clear();

        // Очистка состояния
        this.state.currentUser = null;

        console.log('✅ User session cleared');
    },

    // ========================================
    // KEYBOARD SHORTCUTS
    // ========================================

    /**
     * Обработка горячих клавиш
     */
    handleKeyboardShortcuts(e) {
        // Игнорируем, если фокус в input/textarea
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            return;
        }

        // Ctrl/Cmd + K - открыть поиск
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            e.stopPropagation();
            this.toggleSearch();
            return;
        }

        // Ctrl/Cmd + B - переключить sidebar
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            e.stopPropagation();
            this.toggleSidebar();
            return;
        }

        // Ctrl/Cmd + R - обновить (только если не нативное обновление)
        if ((e.ctrlKey || e.metaKey) && e.key === 'r' && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            this.handleRefresh();
            return;
        }
    },

    // ========================================
    // RESPONSIVE
    // ========================================

    /**
     * Обработка изменения размера окна
     */
    handleResize() {
        const width = window.innerWidth;

        // Автоматически скрывать sidebar на мобильных
        if (width < 768 && this.state.sidebarOpen) {
            this.state.sidebarOpen = false;
            this.applySidebarState();
        }
    },

    // ========================================
    // PUBLIC API
    // ========================================

    /**
     * Показать уведомление в navbar
     */
    showNotification(message, type = 'info') {
        if (window.Notifications) {
            Notifications.show(message, type);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    },

    /**
     * Установить имя пользователя вручную
     */
    setUserName(name) {
        if (this.elements.userNameElement) {
            this.elements.userNameElement.textContent = name;
        }
    },

    /**
     * Получить текущего пользователя
     */
    getCurrentUser() {
        return this.state.currentUser;
    },

    /**
     * Обновить счётчики
     */
    async refreshStats() {
        await this.updateStats();
    },

    /**
     * Перезагрузить информацию о пользователе
     */
    async reloadUserInfo() {
        await this.loadUserInfo();
    },

    /**
     * Выполнить logout (публичный метод)
     */
    async logout() {
        await this.handleLogout();
    }
};

// ========================================
// AUTO INITIALIZATION
// ========================================

// Отложенная инициализация - ждём полной загрузки DOM и других модулей
function initNavbarController() {
    // Проверяем, что все необходимые модули загружены
    const checkDependencies = () => {
        // Базовые зависимости всегда доступны
        return true;
    };

    if (checkDependencies()) {
        // Небольшая задержка, чтобы MatrixRenderer успел инициализировать scroll sync
        setTimeout(() => {
            NavbarController.init();
        }, 100);
    } else {
        console.warn('⚠️ Navbar Controller dependencies not ready, retrying...');
        setTimeout(initNavbarController, 200);
    }
}

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbarController);
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
    // DOM уже загружен
    initNavbarController();
}

// Экспорт для глобального доступа
window.NavbarController = NavbarController;

console.log('✅ Navbar Controller v1.2 loaded');
