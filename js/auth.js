/**
 * =============================================================================
 * AUTH SYSTEM v6.0 - JWT TOKEN SUPPORT + AUTO LOGIN MODAL
 * =============================================================================
 * 
 * ✅ Поддержка JWT токенов (authToken)
 * ✅ Автоматический показ формы логина при отсутствии токена
 * ✅ Перезагрузка страницы после успешного логина
 * ✅ Блокировка контента до авторизации
 * ✅ Проверка валидности токена через /api/auth/me
 * 
 * @version 6.0.0
 * @date 2025-10-22
 */

const AuthSystem = {
    config: {
        apiBaseUrl: window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api',
        tokenKey: 'authToken',           // ← Session токен
        userKey: 'user',                 // ← Данные пользователя
        checkInterval: 30000,            // Проверка каждые 30 сек
        reloadAfterLogin: true
    },

    state: {
        isAuthenticated: false,
        currentUser: null,
        loginModalId: null,
        authCheckInterval: null,
        isLoggingIn: false,
        loginModalShown: false           // ← Флаг для предотвращения дублирования
    },

    /**
     * Инициализация системы авторизации
     */
    init() {
        console.log('🔐 Auth System v6.0 initializing...');

        window.AuthSystem = this;

        // Проверяем сохраненную авторизацию
        this.checkSavedAuthentication();

        // Привязываем события
        this.bindEvents();

        // Запускаем периодическую проверку
        this.startAuthCheck();

        console.log('✅ Auth System initialized');
    },

    /**
     * Проверить сохраненную авторизацию
     */
    async checkSavedAuthentication() {
        const token = this.getToken();
        const savedUser = this.getSavedUser();

        if (token && savedUser) {
            console.log('🔍 Verifying saved session...');

            const isValid = await this.verifyToken();

            if (isValid) {
                this.state.isAuthenticated = true;
                this.state.currentUser = savedUser;
                this.unlockContent();
                this.updateUI(savedUser);
                console.log('✅ Authenticated:', savedUser.username);
            } else {
                console.warn('⚠️ Invalid token - clearing auth');
                this.clearAuth();
                this.showLoginModal();
            }
        } else {
            console.log('🔓 No saved token - showing login');
            this.showLoginModal();
        }
    },

    /**
     * Проверить валидность токена через API
     */
    async verifyToken() {
        try {
            const token = this.getToken();
            if (!token) return false;

            const response = await fetch(`${this.config.apiBaseUrl}/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`Token verification failed: ${response.status}`);
                return false;
            }

            const data = await response.json();

            if (data.success && data.data) {
                // Обновляем данные пользователя
                this.state.currentUser = data.data.user || data.data;
                this.saveUser(this.state.currentUser);
                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ Token verification error:', error);
            return false;
        }
    },

    /**
     * Привязка событий
     */
    bindEvents() {
        // Обработка выхода
        document.addEventListener('click', (e) => {
            const logoutLink = e.target.closest('a[href="#"]');
            if (logoutLink && (logoutLink.textContent.includes('Выход') || logoutLink.textContent.includes('Logout'))) {
                e.preventDefault();
                this.logout();
            }
        });
    },

    /**
     * Запуск периодической проверки авторизации
     */
    startAuthCheck() {
        this.state.authCheckInterval = setInterval(async () => {
            if (this.state.isAuthenticated) {
                const isValid = await this.verifyToken();
                if (!isValid) {
                    this.handleSessionExpired();
                }
            }
        }, this.config.checkInterval);
    },

    /**
     * Обработка истекшей сессии
     */
    handleSessionExpired() {
        console.warn('⚠️ Session expired');

        this.state.isAuthenticated = false;
        this.state.currentUser = null;
        this.clearAuth();

        if (window.Notifications) {
            Notifications.show('⚠️ Сессия истекла', 'warning');
        }

        setTimeout(() => window.location.reload(), 1000);
    },

    /**
     * Блокировать контент до авторизации
     */
    blockContent() {
        const body = document.body;
        body.classList.add('auth-required');
        body.style.overflow = 'hidden';

        const mainContent = document.querySelector('.main-content');
        const sidebar = document.querySelector('.sidebar');

        if (mainContent) {
            mainContent.style.pointerEvents = 'none';
            mainContent.style.filter = 'blur(5px)';
            mainContent.style.userSelect = 'none';
        }

        if (sidebar) {
            sidebar.style.pointerEvents = 'none';
            sidebar.style.filter = 'blur(5px)';
        }

        console.log('🔒 Content blocked');
    },

    /**
     * Разблокировать контент
     */
    unlockContent() {
        const body = document.body;
        body.classList.remove('auth-required');
        body.style.overflow = '';

        const mainContent = document.querySelector('.main-content');
        const sidebar = document.querySelector('.sidebar');

        if (mainContent) {
            mainContent.style.pointerEvents = '';
            mainContent.style.filter = '';
            mainContent.style.userSelect = '';
        }

        if (sidebar) {
            sidebar.style.pointerEvents = '';
            sidebar.style.filter = '';
        }

        console.log('🔓 Content unlocked');
    },

    /**
     * Показать модальное окно логина
     */
    showLoginModal() {
        if (this.state.loginModalShown || this.state.loginModalId) {
            console.log('⚠️ Login modal already shown');
            return;
        }

        this.state.loginModalShown = true;
        console.log('🔓 Showing login modal...');
        this.blockContent();

        const content = this.renderLoginForm();

        this.state.loginModalId = ModalEngine.open({
            title: '🔐 Вход в систему',
            content: content,
            size: 'sm',
            showFooter: false,
            closeOnEscape: false,
            closeOnBackdrop: false,
            showCloseButton: false
        });

        setTimeout(() => this.bindLoginFormEvents(), 300);
    },

    /**
     * Отрендерить форму логина
     */
    renderLoginForm() {
        return `
            <div class="auth-form">
                <div class="auth-form-header">
                    <div class="auth-logo">
                        <i class="fas fa-shield-alt"></i>
                    </div>
                    <h3>MITRE ATT&CK Matrix</h3>
                    <p class="auth-subtitle">Войдите для доступа к системе</p>
                </div>

                <form id="auth-login-form" class="auth-form-body" onsubmit="return false;">
                    <div class="form-group">
                        <label for="auth-username">
                            <i class="fas fa-user"></i> Имя пользователя
                        </label>
                        <input 
                            type="text" 
                            id="auth-username" 
                            class="form-control" 
                            placeholder="admin"
                            autocomplete="username"
                            value="admin"
                        />
                    </div>

                    <div class="form-group">
                        <label for="auth-password">
                            <i class="fas fa-lock"></i> Пароль
                        </label>
                        <div class="password-input-wrapper">
                            <input 
                                type="password" 
                                id="auth-password" 
                                class="form-control" 
                                placeholder="admin"
                                autocomplete="current-password"
                                value="admin"
                            />
                            <button type="button" class="password-toggle" id="togglePassword">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>

                    <div class="form-group form-check">
                        <input 
                            type="checkbox" 
                            id="auth-remember" 
                            class="form-check-input"
                            checked
                        />
                        <label for="auth-remember" class="form-check-label">
                            Запомнить меня
                        </label>
                    </div>

                    <div id="auth-error" class="auth-error" style="display: none;"></div>

                    <div class="form-group" style="margin-top: 20px;">
                        <button 
                            type="button" 
                            id="auth-login-btn" 
                            class="btn btn-primary btn-block" 
                            onclick="window.AuthSystem.handleLogin()"
                            style="width: 100%; padding: 12px; font-size: 16px;">
                            🔑 Войти
                        </button>
                    </div>
                </form>

                <div class="auth-form-footer">
                    <p class="auth-hint">
                        <i class="fas fa-info-circle"></i> 
                        Поля заполнены автоматически
                    </p>
                </div>
            </div>
        `;
    },

    /**
     * Привязать события формы логина
     */
    bindLoginFormEvents() {
        const form = document.getElementById('auth-login-form');
        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        const togglePassword = document.getElementById('togglePassword');
        const loginBtn = document.getElementById('auth-login-btn');

        // Submit формы
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Enter на полях
        [usernameInput, passwordInput].forEach(input => {
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.handleLogin();
                    }
                });
            }
        });

        // Клик на кнопку
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handleLogin());
        }

        // Переключение видимости пароля
        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const type = passwordInput.type === 'password' ? 'text' : 'password';
                passwordInput.type = type;

                const icon = togglePassword.querySelector('i');
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            });
        }

        // Фокус на первое поле
        if (usernameInput) {
            usernameInput.focus();
        }
    },

    /**
     * Обработка логина
     */
    async handleLogin() {
        if (this.state.isLoggingIn) {
            console.warn('⚠️ Already logging in');
            return;
        }

        console.log('🔑 Login started');

        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        const rememberCheckbox = document.getElementById('auth-remember');
        const errorDiv = document.getElementById('auth-error');
        const loginBtn = document.getElementById('auth-login-btn');

        if (!usernameInput || !passwordInput) {
            console.error('❌ Inputs not found');
            return;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const remember = rememberCheckbox ? rememberCheckbox.checked : false;

        if (!username || !password) {
            this.showLoginError('Заполните все поля');
            return;
        }

        if (errorDiv) errorDiv.style.display = 'none';

        // Блокируем кнопку
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
        }

        this.state.isLoggingIn = true;
        let loadingId = null;

        try {
            loadingId = ModalEngine.loading('🔐 Проверка...');

            console.log('📡 POST /login');

            const response = await fetch(`${this.config.apiBaseUrl}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, remember })
            });

            console.log('📡 Response:', response.status);

            if (loadingId) ModalEngine.close(loadingId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('📦 Data:', data);

            if (data.success) {
                console.log('✅ Login successful');

                // ✅ СОХРАНЯЕМ JWT ТОКЕН
                const token = data.data.token || data.token;
                const user = data.data.user || data.data;

                if (!token) {
                    throw new Error('Token not received from server');
                }

                this.saveToken(token);
                this.saveUser(user);

                this.state.isAuthenticated = true;
                this.state.currentUser = user;

                if (this.state.loginModalId) {
                    ModalEngine.close(this.state.loginModalId);
                    this.state.loginModalId = null;
                }

                if (window.Notifications) {
                    Notifications.show(`✅ Добро пожаловать, ${user.username}!`, 'success');
                }

                console.log('🔄 Reloading page...');

                // Перезагрузка через 500ms
                setTimeout(() => window.location.reload(), 500);

            } else {
                console.error('❌ Login failed:', data.message);
                this.showLoginError(data.message || 'Неверный логин или пароль');

                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = '🔑 Войти';
                }
            }

        } catch (error) {
            console.error('❌ Exception:', error);

            if (loadingId) ModalEngine.close(loadingId);

            this.showLoginError('Ошибка: ' + error.message);

            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '🔑 Войти';
            }
        } finally {
            this.state.isLoggingIn = false;
        }
    },

    /**
     * Показать ошибку логина
     */
    showLoginError(message) {
        const errorDiv = document.getElementById('auth-error');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    },

    /**
     * Выход из системы
     */
    async logout() {
        console.log('🚪 Logging out...');

        const confirmed = await ModalEngine.confirm('🚪 Выход', 'Вы уверены?');
        if (!confirmed) return;

        try {
            const token = this.getToken();

            if (token) {
                await fetch(`${this.config.apiBaseUrl}/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }

            this.clearAuth();

            if (window.Notifications) {
                Notifications.show('👋 До свидания!', 'info');
            }

            setTimeout(() => window.location.reload(), 500);

        } catch (error) {
            console.error('❌ Logout error:', error);
            this.clearAuth();
            window.location.reload();
        }
    },

    /**
     * Обновить UI после авторизации
     */
    updateUI(user) {
        const userNameElement = document.querySelector('.navbar-user-name');
        if (userNameElement) {
            userNameElement.textContent = user.username;
        }

        if (window.NavbarController && typeof window.NavbarController.setUserName === 'function') {
            NavbarController.setUserName(user.username);
        }
    },

    /**
     * ========================================
     * МЕТОДЫ РАБОТЫ С ТОКЕНОМ И ПОЛЬЗОВАТЕЛЕМ
     * ========================================
     */

    getToken() {
        return localStorage.getItem(this.config.tokenKey);
    },

    saveToken(token) {
        try {
            localStorage.setItem(this.config.tokenKey, token);
            console.log('✅ Token saved');
        } catch (e) {
            console.error('❌ Save token error:', e);
        }
    },

    clearToken() {
        try {
            localStorage.removeItem(this.config.tokenKey);
        } catch (e) { }
    },

    getSavedUser() {
        try {
            const saved = localStorage.getItem(this.config.userKey);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    },

    saveUser(user) {
        try {
            localStorage.setItem(this.config.userKey, JSON.stringify(user));
            console.log('✅ User saved');
        } catch (e) {
            console.error('❌ Save user error:', e);
        }
    },

    clearUser() {
        try {
            localStorage.removeItem(this.config.userKey);
        } catch (e) { }
    },

    clearAuth() {
        this.clearToken();
        this.clearUser();
        this.state.isAuthenticated = false;
        this.state.currentUser = null;
        this.state.loginModalShown = false;
        console.log('🧹 Auth data cleared');
    },

    /**
     * Получить текущего пользователя
     */
    getCurrentUser() {
        return this.state.currentUser || this.getSavedUser();
    },

    /**
     * Проверить, авторизован ли пользователь
     */
    isAuthenticated() {
        return this.state.isAuthenticated && !!this.getToken();
    }
};

// ========================================
// AUTO INIT
// ========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuthSystem.init());
} else {
    AuthSystem.init();
}

window.AuthSystem = AuthSystem;

console.log('✅ Auth System v6.0 loaded');
