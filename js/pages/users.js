/**
 * ============================================================================
 * USERS MANAGEMENT PAGE - MITRE ATT&CK Matrix Platform
 * ============================================================================
 * ✅ Использование API клиента вместо fetch
 * ✅ Проверка аутентификации через API.isAuthenticated()
 * ✅ Детальное логирование с токеном для отладки
 * ✅ Интеграция с modal_users.js и Notifications
 * 
 * @version 3.0.0-AUTH-FIXED
 * @date 2025-10-22
 */

(function () {
    'use strict';

    // =============================================================================
    // CONFIGURATION
    // =============================================================================

    const USERS_API_BASE = window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api';

    // =============================================================================
    // STATE
    // =============================================================================

    let currentPage = 1;
    let currentFilters = {
        role: 'all',
        active: 'all',
        search: ''
    };
    let usersData = [];
    let usersStatistics = null;
    let isInitialized = false;

    // =============================================================================
    // INITIALIZATION
    // =============================================================================

    document.addEventListener('DOMContentLoaded', () => {
        console.log('👥 Users management initializing...');

        const usersSection = document.getElementById('users');
        if (!usersSection) {
            console.warn('⚠️ Users section not found');
            return;
        }

        setupEventListeners();

        // Load data when section becomes visible
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (usersSection.classList.contains('active') && !isInitialized) {
                    console.log('📍 Users section activated');

                    // ✅ ПРОВЕРКА АУТЕНТИФИКАЦИИ
                    if (!API.isAuthenticated()) {
                        console.error('❌ Not authenticated');
                        showAuthError();
                        return;
                    }

                    isInitialized = true;
                    loadAllData();
                    observer.disconnect();
                }
            });
        });

        observer.observe(usersSection, {
            attributes: true,
            attributeFilter: ['class']
        });

        // Initial load if already visible
        if (usersSection.classList.contains('active')) {
            if (API.isAuthenticated()) {
                isInitialized = true;
                loadAllData();
            } else {
                showAuthError();
            }
        }

        console.log('✅ Users management initialized');
    });

    // =============================================================================
    // EVENT LISTENERS
    // =============================================================================

    function setupEventListeners() {
        // Search
        const searchInput = document.getElementById('users-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    currentFilters.search = e.target.value.trim();
                    currentPage = 1;
                    loadUsers();
                }, 500);
            });
        }

        // Role filter
        const roleFilter = document.getElementById('users-role-filter');
        if (roleFilter) {
            roleFilter.addEventListener('change', (e) => {
                currentFilters.role = e.target.value;
                currentPage = 1;
                loadUsers();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('users-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                currentFilters.active = e.target.value;
                currentPage = 1;
                loadUsers();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('users-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                console.log('🔄 Refreshing users data...');
                loadAllData();
                notify('Данные обновлены', 'success');
            });
        }

        // Add user button
        const addBtn = document.getElementById('users-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (window.ModalUsers) {
                    window.ModalUsers.showUserForm('create');
                } else {
                    console.error('❌ ModalUsers not loaded');
                    notify('Модальное окно не загружено', 'error');
                }
            });
        }

        // Clear filters
        const clearBtn = document.getElementById('users-clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearFilters);
        }
    }

    // =============================================================================
    // DATA LOADING
    // =============================================================================

    async function loadAllData() {
        console.log('📥 Loading all users data...');

        try {
            await Promise.all([
                loadUsers(),
                loadStatistics()
            ]);
            console.log('✅ All users data loaded');
        } catch (error) {
            console.error('❌ Error loading all data:', error);
        }
    }

    async function loadUsers() {
        const container = document.getElementById('users-list-container');
        if (!container) {
            console.warn('⚠️ Users list container not found');
            return;
        }

        try {
            // ✅ ПРОВЕРКА АУТЕНТИФИКАЦИИ
            if (!API.isAuthenticated()) {
                console.error('❌ Not authenticated for users list');
                showAuthError();
                return;
            }

            // ✅ ЛОГИРОВАНИЕ ТОКЕНА
            const token = localStorage.getItem('authToken');
            console.log(`🔐 Auth token: ${token ? 'FOUND ✅' : 'MISSING ❌'}`);
            if (token) {
                console.log(`🔑 Token preview: ${token.substring(0, 20)}...`);
            }

            // Show loading
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка пользователей...</div>';

            // Build params
            const params = {
                page: currentPage,
                limit: 20
            };

            if (currentFilters.search) {
                params.q = currentFilters.search;
            }
            if (currentFilters.role !== 'all') {
                params.role = currentFilters.role;
            }
            if (currentFilters.active !== 'all') {
                params.active = currentFilters.active;
            }

            console.log('📤 Request params:', params);

            // ✅ ИСПОЛЬЗУЕМ API КЛИЕНТ
            const response = await API.get('/users', params);

            if (!response || !response.success) {
                throw new Error(response?.message || 'Ошибка загрузки пользователей');
            }

            console.log('✅ Users loaded:', response.data);

            usersData = response.data.users || [];
            renderUsers(usersData);
            renderPagination(response.data.pagination);

        } catch (error) {
            console.error('❌ Users load error:', error);
            console.error('Error details:', {
                message: error.message,
                status: error.status,
                code: error.code
            });

            container.innerHTML = `
                <div class="error-message" style="padding:20px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;text-align:center;">
                    <i class="fas fa-exclamation-triangle" style="font-size:2rem;color:#dc2626;margin-bottom:10px;"></i>
                    <h3 style="color:#dc2626;margin:0 0 10px;">Ошибка загрузки</h3>
                    <p style="color:#7f1d1d;margin:0;">${escapeHtml(error.message)}</p>
                </div>
            `;

            notify('Ошибка загрузки: ' + error.message, 'error');
        }
    }

    async function loadStatistics() {
        const container = document.getElementById('users-stats-container');
        if (!container) {
            console.warn('⚠️ Stats container not found');
            return;
        }

        try {
            // ✅ ПРОВЕРКА АУТЕНТИФИКАЦИИ
            if (!API.isAuthenticated()) {
                console.warn('⚠️ Not authenticated for statistics');
                return;
            }

            const token = localStorage.getItem('authToken');
            console.log(`🔐 [Stats] Auth token: ${token ? 'FOUND ✅' : 'MISSING ❌'}`);

            console.log('📤 Loading statistics...');

            // ✅ ИСПОЛЬЗУЕМ API КЛИЕНТ
            const response = await API.get('/users/statistics');

            if (!response || !response.success) {
                console.warn('⚠️ Failed to load statistics');
                return;
            }

            console.log('✅ Statistics loaded:', response.data);

            usersStatistics = response.data.user_stats || response.data;
            renderStatistics(usersStatistics);

        } catch (error) {
            console.error('❌ Statistics error:', error);
            console.error('Error details:', {
                message: error.message,
                status: error.status
            });
        }
    }

    // =============================================================================
    // RENDERING
    // =============================================================================

    function renderUsers(users) {
        const container = document.getElementById('users-list-container');
        if (!container) return;

        if (!users || users.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align:center;padding:60px 20px;color:var(--text-muted);">
                    <i class="fas fa-users" style="font-size:4rem;margin-bottom:20px;opacity:0.5;"></i>
                    <h3 style="margin:0 0 10px;color:var(--text-primary);">Нет пользователей</h3>
                    <p style="margin:0;">Добавьте нового пользователя для начала работы</p>
                </div>
            `;
            return;
        }

        const html = users.map(user => `
            <div class="user-card" data-user-id="${user.id}">
                <div class="user-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="user-info">
                    <div class="user-header">
                        <h3 class="user-name">${escapeHtml(user.full_name || user.username)}</h3>
                        <span class="badge badge-role-${user.role}">${user.role}</span>
                        <span class="badge badge-status-${user.is_active ? 'active' : 'inactive'}">
                            ${user.is_active ? 'Активен' : 'Неактивен'}
                        </span>
                    </div>
                    <div class="user-details">
                        <span><i class="fas fa-user"></i> ${escapeHtml(user.username)}</span>
                        <span><i class="fas fa-envelope"></i> ${escapeHtml(user.email || 'N/A')}</span>
                        <span><i class="fas fa-clock"></i> ${formatDateTime(user.created_at)}</span>
                    </div>
                    ${user.last_login ? `
                    <div class="user-meta">
                        <span><i class="fas fa-sign-in-alt"></i> Последний вход: ${formatDateTime(user.last_login)}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="user-actions">
                    <button class="btn btn-sm btn-primary" onclick="window.UsersManager.viewDetails('${user.id}')" title="Просмотр">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="window.UsersManager.edit('${user.id}')" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="window.UsersManager.toggleStatus('${user.id}', ${!user.is_active})" 
                            title="${user.is_active ? 'Деактивировать' : 'Активировать'}">
                        <i class="fas fa-${user.is_active ? 'ban' : 'check'}"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="window.UsersManager.changePassword('${user.id}')" title="Сменить пароль">
                        <i class="fas fa-key"></i>
                    </button>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    function renderStatistics(stats) {
        const container = document.getElementById('users-stats-container');
        if (!container) return;

        if (!stats) {
            container.innerHTML = '';
            return;
        }

        const html = `
            <div class="stats-grid">
                <div class="stat-card">
                    <i class="fas fa-users stat-icon"></i>
                    <div class="stat-content">
                        <span class="stat-value">${stats.total_users || stats.total || 0}</span>
                        <span class="stat-label">Всего пользователей</span>
                    </div>
                </div>
                <div class="stat-card active">
                    <i class="fas fa-user-check stat-icon"></i>
                    <div class="stat-content">
                        <span class="stat-value">${stats.active_users || stats.active || 0}</span>
                        <span class="stat-label">Активных</span>
                    </div>
                </div>
                <div class="stat-card admin">
                    <i class="fas fa-user-shield stat-icon"></i>
                    <div class="stat-content">
                        <span class="stat-value">${stats.admin_users || stats.admins || 0}</span>
                        <span class="stat-label">Администраторов</span>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-user-friends stat-icon"></i>
                    <div class="stat-content">
                        <span class="stat-value">${stats.active_last_30days || 0}</span>
                        <span class="stat-label">Активны (30 дней)</span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    function renderPagination(pagination) {
        const container = document.getElementById('users-pagination');
        if (!container) return;

        if (!pagination || pagination.total_pages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '<div class="pagination">';

        html += `<button class="btn-page" ${!pagination.has_prev ? 'disabled' : ''} 
                 onclick="window.UsersManager.changePage(${pagination.page - 1})">
                 <i class="fas fa-chevron-left"></i></button>`;

        const startPage = Math.max(1, pagination.page - 2);
        const endPage = Math.min(pagination.total_pages, pagination.page + 2);

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn-page ${i === pagination.page ? 'active' : ''}" 
                     onclick="window.UsersManager.changePage(${i})">${i}</button>`;
        }

        html += `<button class="btn-page" ${!pagination.has_next ? 'disabled' : ''} 
                 onclick="window.UsersManager.changePage(${pagination.page + 1})">
                 <i class="fas fa-chevron-right"></i></button>`;

        html += '</div>';
        container.innerHTML = html;
    }

    // =============================================================================
    // USER ACTIONS
    // =============================================================================

    function changePage(page) {
        if (page < 1) return;
        currentPage = page;
        loadUsers();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function clearFilters() {
        currentFilters = { role: 'all', active: 'all', search: '' };

        const roleFilter = document.getElementById('users-role-filter');
        if (roleFilter) roleFilter.value = 'all';

        const statusFilter = document.getElementById('users-status-filter');
        if (statusFilter) statusFilter.value = 'all';

        const searchInput = document.getElementById('users-search');
        if (searchInput) searchInput.value = '';

        currentPage = 1;
        loadUsers();
        notify('Фильтры очищены', 'success');
    }

    async function viewDetails(userId) {
        try {
            if (!API.isAuthenticated()) {
                notify('Требуется аутентификация', 'error');
                return;
            }

            console.log(`📥 Loading details for user ${userId}`);

            // ✅ ИСПОЛЬЗУЕМ API КЛИЕНТ
            const response = await API.get(`/users/${userId}`);

            if (!response || !response.success) {
                throw new Error(response?.message || 'Ошибка загрузки данных');
            }

            console.log('✅ User details loaded:', response.data);

            if (window.ModalUsers) {
                window.ModalUsers.showUserDetails(response.data.user);
            } else {
                console.error('❌ ModalUsers not loaded');
                notify('Модальное окно не загружено', 'error');
            }

        } catch (error) {
            console.error('❌ Details error:', error);
            notify('Ошибка загрузки данных: ' + error.message, 'error');
        }
    }

    function edit(userId) {
        const user = usersData.find(u => u.id === parseInt(userId));
        if (!user) {
            notify('Пользователь не найден', 'error');
            return;
        }

        if (window.ModalUsers) {
            window.ModalUsers.showUserForm('edit', user);
        } else {
            console.error('❌ ModalUsers not loaded');
            notify('Модальное окно не загружено', 'error');
        }
    }

    function changePassword(userId) {
        if (window.ModalUsers) {
            window.ModalUsers.showPasswordModal(userId);
        } else {
            console.error('❌ ModalUsers not loaded');
            notify('Модальное окно не загружено', 'error');
        }
    }

    // =============================================================================
    // API ACTIONS
    // =============================================================================

    async function submitCreate(userId, payload) {
        try {
            if (!payload.username || !payload.email || !payload.full_name || !payload.password) {
                notify('Заполните все обязательные поля', 'warning');
                return;
            }

            if (!API.isAuthenticated()) {
                notify('Требуется аутентификация', 'error');
                return;
            }

            console.log('📤 Creating user...', payload);

            // ✅ ИСПОЛЬЗУЕМ API КЛИЕНТ
            const response = await API.post('/users', {
                username: payload.username,
                email: payload.email,
                full_name: payload.full_name,
                password: payload.password,
                role: payload.role,
                active: payload.is_active
            });

            if (!response || !response.success) {
                throw new Error(response?.message || 'Ошибка создания пользователя');
            }

            console.log('✅ User created successfully');
            notify('Пользователь создан успешно', 'success');
            loadAllData();

        } catch (error) {
            console.error('❌ Create error:', error);
            notify('Ошибка создания: ' + error.message, 'error');
        }
    }

    async function submitEdit(userId, payload) {
        try {
            if (!payload.username || !payload.email || !payload.full_name) {
                notify('Заполните все обязательные поля', 'warning');
                return;
            }

            if (!API.isAuthenticated()) {
                notify('Требуется аутентификация', 'error');
                return;
            }

            console.log(`📤 Updating user ${userId}...`, payload);

            // ✅ ИСПОЛЬЗУЕМ API КЛИЕНТ
            const response = await API.put(`/users/${userId}`, {
                username: payload.username,
                email: payload.email,
                full_name: payload.full_name,
                role: payload.role,
                is_active: payload.is_active
            });

            if (!response || !response.success) {
                throw new Error(response?.message || 'Ошибка обновления');
            }

            console.log('✅ User updated successfully');
            notify('Пользователь обновлён успешно', 'success');
            loadAllData();

        } catch (error) {
            console.error('❌ Update error:', error);
            notify('Ошибка обновления: ' + error.message, 'error');
        }
    }

    async function submitPassword(userId, newPassword) {
        try {
            if (!newPassword || newPassword.length < 8) {
                notify('Пароль должен быть не менее 8 символов', 'warning');
                return;
            }

            if (!API.isAuthenticated()) {
                notify('Требуется аутентификация', 'error');
                return;
            }

            console.log(`📤 Changing password for user ${userId}`);

            // ✅ ИСПОЛЬЗУЕМ API КЛИЕНТ
            const response = await API.post(`/users/${userId}/password`, {
                new_password: newPassword
            });

            if (!response || !response.success) {
                throw new Error(response?.message || 'Ошибка изменения пароля');
            }

            console.log('✅ Password changed successfully');
            notify('Пароль изменён успешно', 'success');

        } catch (error) {
            console.error('❌ Password change error:', error);
            notify('Ошибка изменения пароля: ' + error.message, 'error');
        }
    }

    async function toggleStatus(userId, active) {
        if (!confirm(`Вы уверены, что хотите ${active ? 'активировать' : 'деактивировать'} пользователя?`)) {
            return;
        }

        try {
            if (!API.isAuthenticated()) {
                notify('Требуется аутентификация', 'error');
                return;
            }

            console.log(`📤 Toggling user ${userId} status to ${active}`);

            // ✅ ИСПОЛЬЗУЕМ API КЛИЕНТ
            const response = await API.post(`/users/${userId}/toggle`, { active });

            if (!response || !response.success) {
                throw new Error(response?.message || 'Ошибка изменения статуса');
            }

            console.log('✅ Status toggled successfully');
            notify(`Пользователь ${active ? 'активирован' : 'деактивирован'}`, 'success');
            loadAllData();

        } catch (error) {
            console.error('❌ Toggle error:', error);
            notify('Ошибка изменения статуса: ' + error.message, 'error');
        }
    }

    // =============================================================================
    // UTILITIES
    // =============================================================================

    function showAuthError() {
        const container = document.getElementById('users-list-container');
        if (container) {
            container.innerHTML = `
                <div class="error-container" style="padding:40px;background:rgba(239,68,68,0.1);border:2px solid #dc2626;border-radius:12px;text-align:center;">
                    <i class="fas fa-lock" style="font-size:3rem;color:#dc2626;margin-bottom:15px;"></i>
                    <h3 style="color:#dc2626;margin:0 0 10px;">Требуется аутентификация</h3>
                    <p style="color:#7f1d1d;margin:0 0 20px;">Пожалуйста, перезагрузите страницу или войдите заново</p>
                    <button onclick="window.location.reload()" class="btn btn-primary">
                        <i class="fas fa-sync"></i> Перезагрузить
                    </button>
                </div>
            `;
        }
    }

    function notify(message, type = 'info') {
        if (window.Notifications && typeof window.Notifications.show === 'function') {
            window.Notifications.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    function formatDateTime(isoString) {
        if (!isoString) return 'N/A';
        try {
            const date = new Date(isoString);
            return date.toLocaleString('ru-RU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Invalid date';
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =============================================================================
    // GLOBAL EXPORTS
    // =============================================================================

    window.UsersManager = {
        changePage,
        viewDetails,
        edit,
        toggleStatus,
        changePassword,
        submitCreate,
        submitEdit,
        submitPassword,
        refresh: loadAllData
    };

    console.log('✅ users.js loaded successfully');

})();
