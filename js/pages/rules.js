/**
 * ============================================================================
 * RULES MANAGEMENT PAGE v4.0 - ENHANCED VERSION
 * ============================================================================
 * Управление правилами корреляции SIEM с продвинутыми возможностями
 * @version 4.0.0 - Enhanced filtering, comments counter, real-time updates
 * @date 2025-10-24
 */

(function () {
    'use strict';

    // =============================================================================
    // CONFIGURATION
    // =============================================================================

    const RULES_API_BASE = window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api';

    // =============================================================================
    // STATE
    // =============================================================================

    let state = {
        rules: [],
        filteredRules: [],
        currentPage: 1,
        perPage: 20,
        totalPages: 0,
        totalRules: 0,
        isLoading: false,
        currentFilter: {
            search: '',
            technique: null,
            severity: 'all',
            status: 'all',
            active: 'all',
            author: 'all',
            dateRange: 'all',
            hasComments: 'all',
            hasTests: 'all',
            sortBy: 'updated_at',
            sortOrder: 'desc'
        },
        searchTimeout: null,
        refreshInterval: null,
        commentsCache: new Map(),
        lastUpdate: null
    };

    // DOM Elements
    let elements = {
        container: null,
        searchInput: null,
        severityFilter: null,
        statusFilter: null,
        activeFilter: null,
        authorFilter: null,
        dateRangeFilter: null,
        commentsFilter: null,
        testsFilter: null,
        sortFilter: null,
        statsContainer: null
    };

    // =============================================================================
    // INITIALIZATION
    // =============================================================================

    document.addEventListener('DOMContentLoaded', () => {
        console.log('🔀 Rules management v4.0 initializing...');

        elements.container = document.getElementById('rules');
        if (!elements.container) {
            console.warn('⚠️ Rules section not found');
            return;
        }

        setupEventListeners();
        setupAutoRefresh();

        // Load data when visible
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (elements.container.classList.contains('active')) {
                    loadAllData();
                    observer.disconnect();
                }
            });
        });

        observer.observe(elements.container, {
            attributes: true,
            attributeFilter: ['class']
        });

        if (elements.container.classList.contains('active')) {
            loadAllData();
        }

        console.log('✅ Rules management v4.0 initialized');
    });

    // =============================================================================
    // AUTO REFRESH & REAL-TIME UPDATES
    // =============================================================================

    function setupAutoRefresh() {
        // Проверяем обновления каждые 30 секунд
        state.refreshInterval = setInterval(async () => {
            if (!elements.container.classList.contains('active')) return;

            try {
                await checkForUpdates();
            } catch (error) {
                console.warn('Auto refresh failed:', error);
            }
        }, 30000);

        // Очистка при закрытии страницы
        window.addEventListener('beforeunload', () => {
            if (state.refreshInterval) {
                clearInterval(state.refreshInterval);
            }
        });
    }

    async function checkForUpdates() {
        try {
            // Получаем только обновленные правила
            const params = new URLSearchParams({
                limit: 1000,
                updated_since: state.lastUpdate || new Date(Date.now() - 3600000).toISOString()
            });

            const response = await fetch(`${RULES_API_BASE}/rules?${params}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });

            if (!response.ok) return;

            const json = await response.json();
            if (!json.success || !json.data?.rules?.length) return;

            const updatedRules = json.data.rules;
            console.log(`🔄 Found ${updatedRules.length} updated rules`);

            // Обновляем правила в state
            updatedRules.forEach(updatedRule => {
                const index = state.rules.findIndex(r => r.id === updatedRule.id);
                if (index !== -1) {
                    state.rules[index] = updatedRule;
                } else {
                    state.rules.unshift(updatedRule); // Новые правила в начало
                }
            });

            state.lastUpdate = new Date().toISOString();

            // Обновляем счетчики комментариев для изменившихся правил
            await loadCommentsForRules(updatedRules.map(r => r.id));

            applyFilters();
            showUpdateNotification(updatedRules.length);

        } catch (error) {
            console.warn('Failed to check for updates:', error);
        }
    }

    function showUpdateNotification(count) {
        if (count === 0) return;

        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <i class="fas fa-sync-alt"></i>
            Обновлено правил: ${count}
            <button onclick="this.parentElement.remove()">×</button>
        `;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    // =============================================================================
    // EVENT LISTENERS
    // =============================================================================

    function setupEventListeners() {
        // Search
        const searchInput = document.getElementById('rulesSearchInput');
        if (searchInput) {
            elements.searchInput = searchInput;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(state.searchTimeout);
                state.searchTimeout = setTimeout(() => {
                    state.currentFilter.search = e.target.value.trim();
                    state.currentPage = 1;
                    applyFilters();
                }, 300);
            });
        }

        // Enhanced filters
        setupFilter('rulesSeverityFilter', 'severityFilter', 'severity');
        setupFilter('rulesStatusFilter', 'statusFilter', 'status');
        setupFilter('rulesActiveFilter', 'activeFilter', 'active');
        setupFilter('rulesAuthorFilter', 'authorFilter', 'author');
        setupFilter('rulesDateRangeFilter', 'dateRangeFilter', 'dateRange');
        setupFilter('rulesCommentsFilter', 'commentsFilter', 'hasComments');
        setupFilter('rulesTestsFilter', 'testsFilter', 'hasTests');
        setupFilter('rulesSortFilter', 'sortFilter', 'sortBy');

        // Sort order toggle
        const sortOrderBtn = document.getElementById('rulesSortOrderBtn');
        if (sortOrderBtn) {
            sortOrderBtn.addEventListener('click', () => {
                state.currentFilter.sortOrder = state.currentFilter.sortOrder === 'desc' ? 'asc' : 'desc';
                sortOrderBtn.innerHTML = state.currentFilter.sortOrder === 'desc'
                    ? '<i class="fas fa-sort-amount-down"></i>'
                    : '<i class="fas fa-sort-amount-up"></i>';
                applyFilters();
            });
        }

        // Reset filters
        const resetBtn = document.getElementById('rulesResetFilters');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetFilters);
        }

        // Refresh button
        const refreshBtn = document.getElementById('rules-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadAllData();
                notify('Данные обновлены', 'success');
            });
        }

        // Add rule button
        const addBtn = document.getElementById('rules-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (window.RuleModal) {
                    window.RuleModal.create({
                        onSuccess: () => {
                            loadAllData();
                            notify('Правило создано', 'success');
                        }
                    });
                } else {
                    console.error('RuleModal not loaded');
                }
            });
        }

        // Advanced search toggle
        const advancedSearchBtn = document.getElementById('rules-advanced-search-btn');
        if (advancedSearchBtn) {
            advancedSearchBtn.addEventListener('click', toggleAdvancedSearch);
        }

        // Export button
        const exportBtn = document.getElementById('rules-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportRules);
        }
    }

    function setupFilter(elementId, stateKey, filterKey) {
        const element = document.getElementById(elementId);
        if (element) {
            elements[stateKey] = element;
            element.addEventListener('change', (e) => {
                state.currentFilter[filterKey] = e.target.value;
                state.currentPage = 1;
                applyFilters();
            });
        }
    }

    // =============================================================================
    // DATA LOADING
    // =============================================================================

    async function loadAllData() {
        state.isLoading = true;
        showLoadingState();

        try {
            await Promise.all([
                loadRules(),
                loadStatistics(),
                loadAuthors()
            ]);

            await loadCommentsForRules(state.rules.map(r => r.id));
            applyFilters();
            renderStatistics();

        } catch (error) {
            console.error('❌ Rules load error:', error);
            showErrorState(error.message);
        } finally {
            state.isLoading = false;
        }
    }

    async function loadRules() {
        try {
            const params = { limit: 10000 };
            const response = await fetch(`${RULES_API_BASE}/rules?${new URLSearchParams(params)}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const json = await response.json();

            if (!json.success) {
                throw new Error(json.error?.message || 'Load failed');
            }

            state.rules = json.data.rules || json.data || [];
            state.filteredRules = [...state.rules];
            state.lastUpdate = new Date().toISOString();

            console.log(`🔀 Loaded ${state.rules.length} rules`);

        } catch (error) {
            console.error('Failed to load rules:', error);
            throw error;
        }
    }

    async function loadStatistics() {
        try {
            const response = await fetch(`${RULES_API_BASE}/rules/statistics`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });

            if (!response.ok) return;

            const json = await response.json();
            if (json.success && json.data) {
                state.statistics = json.data;
            }
        } catch (error) {
            console.warn('Failed to load statistics:', error);
        }
    }

    async function loadAuthors() {
        try {
            // Получаем уникальных авторов из загруженных правил
            const authors = [...new Set(state.rules.map(r => r.author).filter(Boolean))];
            populateAuthorFilter(authors);
        } catch (error) {
            console.warn('Failed to load authors:', error);
        }
    }

    async function loadCommentsForRules(ruleIds) {
        try {
            const batchSize = 50;
            const batches = [];

            for (let i = 0; i < ruleIds.length; i += batchSize) {
                batches.push(ruleIds.slice(i, i + batchSize));
            }

            for (const batch of batches) {
                await Promise.all(batch.map(async (ruleId) => {
                    try {
                        const response = await fetch(`${RULES_API_BASE}/comments?entity_type=rule&entity_id=${ruleId}`, {
                            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                        });

                        if (response.ok) {
                            const json = await response.json();
                            const comments = json.data || [];
                            const count = Array.isArray(comments) ? comments.length : 0;
                            state.commentsCache.set(ruleId, count);
                        }
                    } catch (error) {
                        // Игнорируем ошибки для отдельных правил
                    }
                }));
            }
        } catch (error) {
            console.warn('Failed to load comments:', error);
        }
    }

    // =============================================================================
    // FILTERING & SORTING
    // =============================================================================

    function applyFilters() {
        let filtered = [...state.rules];

        // Search filter
        if (state.currentFilter.search) {
            const searchLower = state.currentFilter.search.toLowerCase();
            filtered = filtered.filter(rule =>
                (rule.name && rule.name.toLowerCase().includes(searchLower)) ||
                (rule.name_ru && rule.name_ru.toLowerCase().includes(searchLower)) ||
                (rule.description && rule.description.toLowerCase().includes(searchLower)) ||
                (rule.description_ru && rule.description_ru.toLowerCase().includes(searchLower)) ||
                (rule.technique_id && rule.technique_id.toLowerCase().includes(searchLower)) ||
                (rule.technique_name && rule.technique_name.toLowerCase().includes(searchLower)) ||
                (rule.author && rule.author.toLowerCase().includes(searchLower)) ||
                (rule.id && rule.id.toLowerCase().includes(searchLower))
            );
        }

        // Technique filter
        if (state.currentFilter.technique) {
            filtered = filtered.filter(rule =>
                rule.technique_id === state.currentFilter.technique
            );
        }

        // Severity filter
        if (state.currentFilter.severity !== 'all') {
            filtered = filtered.filter(rule => {
                const ruleSeverity = rule.severity ? rule.severity.toLowerCase() : '';
                return ruleSeverity === state.currentFilter.severity.toLowerCase();
            });
        }

        // Status filter
        if (state.currentFilter.status !== 'all') {
            filtered = filtered.filter(rule => {
                const ruleStatus = rule.status ? rule.status.toLowerCase() : '';
                return ruleStatus === state.currentFilter.status.toLowerCase();
            });
        }

        // Active filter
        if (state.currentFilter.active !== 'all') {
            const shouldBeActive = state.currentFilter.active === 'active';
            filtered = filtered.filter(rule => {
                const isActive = rule.active === true || rule.status === 'active';
                return shouldBeActive ? isActive : !isActive;
            });
        }

        // Author filter
        if (state.currentFilter.author !== 'all') {
            filtered = filtered.filter(rule => rule.author === state.currentFilter.author);
        }

        // Date range filter
        if (state.currentFilter.dateRange !== 'all') {
            const now = new Date();
            let cutoffDate;

            switch (state.currentFilter.dateRange) {
                case 'today':
                    cutoffDate = new Date(now.setHours(0, 0, 0, 0));
                    break;
                case 'week':
                    cutoffDate = new Date(now.setDate(now.getDate() - 7));
                    break;
                case 'month':
                    cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
                    break;
                case 'quarter':
                    cutoffDate = new Date(now.setMonth(now.getMonth() - 3));
                    break;
            }

            if (cutoffDate) {
                filtered = filtered.filter(rule => {
                    const ruleDate = new Date(rule.updated_at || rule.created_at);
                    return ruleDate >= cutoffDate;
                });
            }
        }

        // Comments filter
        if (state.currentFilter.hasComments !== 'all') {
            const shouldHaveComments = state.currentFilter.hasComments === 'yes';
            filtered = filtered.filter(rule => {
                const commentsCount = state.commentsCache.get(rule.id) || 0;
                return shouldHaveComments ? commentsCount > 0 : commentsCount === 0;
            });
        }

        // Tests filter
        if (state.currentFilter.hasTests !== 'all') {
            const shouldHaveTests = state.currentFilter.hasTests === 'yes';
            filtered = filtered.filter(rule => {
                const hasTests = rule.logic?.test_data && rule.logic.test_data.length > 0;
                return shouldHaveTests ? hasTests : !hasTests;
            });
        }

        // Sorting
        filtered.sort((a, b) => {
            let aValue, bValue;

            switch (state.currentFilter.sortBy) {
                case 'name':
                    aValue = (a.name_ru || a.name || '').toLowerCase();
                    bValue = (b.name_ru || b.name || '').toLowerCase();
                    break;
                case 'severity':
                    const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
                    aValue = severityOrder[a.severity] || 0;
                    bValue = severityOrder[b.severity] || 0;
                    break;
                case 'author':
                    aValue = (a.author || '').toLowerCase();
                    bValue = (b.author || '').toLowerCase();
                    break;
                case 'comments':
                    aValue = state.commentsCache.get(a.id) || 0;
                    bValue = state.commentsCache.get(b.id) || 0;
                    break;
                case 'created_at':
                    aValue = new Date(a.created_at);
                    bValue = new Date(b.created_at);
                    break;
                default: // updated_at
                    aValue = new Date(a.updated_at || a.created_at);
                    bValue = new Date(b.updated_at || b.created_at);
            }

            const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            return state.currentFilter.sortOrder === 'desc' ? -comparison : comparison;
        });

        console.log(`Filtered: ${state.rules.length} → ${filtered.length} rules`);

        state.filteredRules = filtered;
        state.currentPage = 1;
        updatePagination();
        renderRules();
        updateFilterSummary();
    }

    function resetFilters() {
        state.currentFilter = {
            search: '',
            technique: null,
            severity: 'all',
            status: 'all',
            active: 'all',
            author: 'all',
            dateRange: 'all',
            hasComments: 'all',
            hasTests: 'all',
            sortBy: 'updated_at',
            sortOrder: 'desc'
        };

        // Reset UI elements
        Object.entries(elements).forEach(([key, element]) => {
            if (element && element.value !== undefined) {
                if (key === 'searchInput') {
                    element.value = '';
                } else {
                    element.value = 'all';
                }
            }
        });

        const sortOrderBtn = document.getElementById('rulesSortOrderBtn');
        if (sortOrderBtn) {
            sortOrderBtn.innerHTML = '<i class="fas fa-sort-amount-down"></i>';
        }

        applyFilters();
        notify('Фильтры сброшены', 'info');
    }

    // =============================================================================
    // RENDERING
    // =============================================================================

    function renderRules() {
        const listContainer = document.getElementById('rules-list-container');
        if (!listContainer) return;

        const startIdx = (state.currentPage - 1) * state.perPage;
        const endIdx = startIdx + state.perPage;
        const rulesPage = state.filteredRules.slice(startIdx, endIdx);

        if (rulesPage.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shield-alt"></i>
                    <p>Нет правил, соответствующих фильтрам</p>
                    <button class="btn btn-secondary" onclick="window.RulesManager.resetFilters()">
                        Сбросить фильтры
                    </button>
                </div>
            `;
            return;
        }

        const html = rulesPage.map(rule => `
            <div class="rule-card" data-rule-id="${rule.id}" data-updated="${rule.updated_at}">
                <div class="rule-header">
                    <div class="rule-main-info">
                        <h3 class="rule-name">
                            ${escapeHtml(rule.name_ru || rule.name)}
                            ${rule.name_ru && rule.name ? `<small>${escapeHtml(rule.name)}</small>` : ''}
                        </h3>
                        <div class="rule-badges">
                            ${renderSeverityBadge(rule.severity)}
                            ${renderStatusBadge(rule.status)}
                            ${rule.technique_id ? `<span class="badge badge-technique" onclick="window.RulesManager.filterByTechnique('${rule.technique_id}')" style="cursor:pointer">${escapeHtml(rule.technique_id)}</span>` : ''}
                            ${renderTestsBadge(rule)}
                        </div>
                    </div>
                    <div class="rule-actions">
                        <button class="btn btn-sm btn-primary" onclick="window.RulesManager.viewRule('${rule.id}')" title="Просмотр">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${renderCommentsBadge(rule.id)}
                        <button class="btn btn-sm btn-danger" onclick="window.RulesManager.deleteRule('${rule.id}')" title="Удалить">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${(rule.description_ru || rule.description) ? `<p class="rule-description">${escapeHtml(rule.description_ru || rule.description)}</p>` : ''}
                <div class="rule-meta">
                    <span><i class="fas fa-user"></i> ${escapeHtml(rule.author || 'System')}</span>
                    <span><i class="fas fa-clock"></i> ${formatDateTime(rule.updated_at || rule.created_at)}</span>
                    ${rule.trigger_count ? `<span><i class="fas fa-bell"></i> Срабатываний: ${rule.trigger_count}</span>` : ''}
                    <span class="rule-id" title="${rule.id}"><i class="fas fa-fingerprint"></i> ${rule.id.substring(0, 8)}...</span>
                </div>
            </div>
        `).join('');

        listContainer.innerHTML = html;
        renderPagination();
    }

    function renderSeverityBadge(severity) {
        const severityMap = {
            'low': { text: 'Низкий', class: 'badge-severity-low', icon: 'fa-info-circle' },
            'medium': { text: 'Средний', class: 'badge-severity-medium', icon: 'fa-exclamation-circle' },
            'high': { text: 'Высокий', class: 'badge-severity-high', icon: 'fa-exclamation-triangle' },
            'critical': { text: 'Критический', class: 'badge-severity-critical', icon: 'fa-skull-crossbones' }
        };
        const sev = severityMap[severity] || { text: severity, class: '', icon: 'fa-question' };
        return `<span class="badge ${sev.class}"><i class="fas ${sev.icon}"></i> ${sev.text}</span>`;
    }

    function renderStatusBadge(status) {
        const statusMap = {
            'active': { text: 'Активно', class: 'badge-status-active', icon: 'fa-check-circle' },
            'disabled': { text: 'Отключено', class: 'badge-status-disabled', icon: 'fa-times-circle' },
            'draft': { text: 'Черновик', class: 'badge-status-draft', icon: 'fa-edit' },
            'archived': { text: 'Архив', class: 'badge-status-archived', icon: 'fa-archive' }
        };
        const st = statusMap[status] || { text: status, class: '', icon: 'fa-question' };
        return `<span class="badge ${st.class}"><i class="fas ${st.icon}"></i> ${st.text}</span>`;
    }

    function renderTestsBadge(rule) {
        const hasTests = rule.logic?.test_data && rule.logic.test_data.length > 0;
        if (!hasTests) return '';

        return `<span class="badge badge-tests" title="Тестовых случаев: ${rule.logic.test_data.length}">
            <i class="fas fa-flask"></i> ${rule.logic.test_data.length}
        </span>`;
    }

    function renderCommentsBadge(ruleId) {
        const commentsCount = state.commentsCache.get(ruleId) || 0;
        const badgeClass = commentsCount > 0 ? 'btn-info' : 'btn-outline-secondary';
        const icon = commentsCount > 0 ? 'fas' : 'far';

        return `
            <button class="btn btn-sm ${badgeClass}" 
                    onclick="window.RulesManager.showComments('${ruleId}')" 
                    title="Комментарии: ${commentsCount}">
                <i class="${icon} fa-comments"></i>
                ${commentsCount > 0 ? `<span class="badge badge-light">${commentsCount}</span>` : ''}
            </button>
        `;
    }

    function renderStatistics() {
        const statsContainer = document.getElementById('rules-statistics');
        if (!statsContainer || !state.statistics) return;

        const stats = state.statistics;
        statsContainer.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${stats.totalrules || state.rules.length}</div>
                    <div class="stat-label">Всего правил</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.activerules || 0}</div>
                    <div class="stat-label">Активных</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.criticalrules || 0}</div>
                    <div class="stat-label">Критических</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.uniquetechniques || 0}</div>
                    <div class="stat-label">MITRE техник</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${state.filteredRules.length}</div>
                    <div class="stat-label">Отфильтровано</div>
                </div>
            </div>
        `;
    }

    function updateFilterSummary() {
        const summaryContainer = document.getElementById('filter-summary');
        if (!summaryContainer) return;

        const activeFilters = [];

        if (state.currentFilter.search) {
            activeFilters.push(`Поиск: "${state.currentFilter.search}"`);
        }
        if (state.currentFilter.severity !== 'all') {
            activeFilters.push(`Уровень: ${state.currentFilter.severity}`);
        }
        if (state.currentFilter.status !== 'all') {
            activeFilters.push(`Статус: ${state.currentFilter.status}`);
        }
        if (state.currentFilter.author !== 'all') {
            activeFilters.push(`Автор: ${state.currentFilter.author}`);
        }

        if (activeFilters.length > 0) {
            summaryContainer.innerHTML = `
                <div class="filter-summary-content">
                    <span>Активные фильтры: ${activeFilters.join(', ')}</span>
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.RulesManager.resetFilters()">
                        <i class="fas fa-times"></i> Очистить
                    </button>
                </div>
            `;
            summaryContainer.style.display = 'block';
        } else {
            summaryContainer.style.display = 'none';
        }
    }

    function populateAuthorFilter(authors) {
        const authorFilter = elements.authorFilter;
        if (!authorFilter) return;

        const currentValue = authorFilter.value;
        authorFilter.innerHTML = '<option value="all">Все авторы</option>';

        authors.sort().forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            if (author === currentValue) {
                option.selected = true;
            }
            authorFilter.appendChild(option);
        });
    }

    function updatePagination() {
        state.totalRules = state.filteredRules.length;
        state.totalPages = Math.ceil(state.totalRules / state.perPage);

        if (state.currentPage > state.totalPages && state.totalPages > 0) {
            state.currentPage = state.totalPages;
        } else if (state.currentPage < 1) {
            state.currentPage = 1;
        }
    }

    function renderPagination() {
        const container = document.getElementById('rules-pagination');
        if (!container) return;

        if (state.totalPages <= 1) {
            container.innerHTML = `
                <div class="pagination-info">
                    Показано: ${state.filteredRules.length} из ${state.rules.length}
                </div>
            `;
            return;
        }

        const startItem = (state.currentPage - 1) * state.perPage + 1;
        const endItem = Math.min(state.currentPage * state.perPage, state.totalRules);

        let html = `
            <div class="pagination-info">
                ${startItem}-${endItem} из ${state.totalRules}
            </div>
            <div class="pagination">
        `;

        html += `<button class="btn-page" ${state.currentPage === 1 ? 'disabled' : ''} 
                 onclick="window.RulesManager.changePage(${state.currentPage - 1})">
                 <i class="fas fa-chevron-left"></i></button>`;

        const startPage = Math.max(1, state.currentPage - 2);
        const endPage = Math.min(state.totalPages, state.currentPage + 2);

        if (startPage > 1) {
            html += `<button class="btn-page" onclick="window.RulesManager.changePage(1)">1</button>`;
            if (startPage > 2) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn-page ${i === state.currentPage ? 'active' : ''}" 
                     onclick="window.RulesManager.changePage(${i})">${i}</button>`;
        }

        if (endPage < state.totalPages) {
            if (endPage < state.totalPages - 1) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
            html += `<button class="btn-page" onclick="window.RulesManager.changePage(${state.totalPages})">${state.totalPages}</button>`;
        }

        html += `<button class="btn-page" ${state.currentPage === state.totalPages ? 'disabled' : ''} 
                 onclick="window.RulesManager.changePage(${state.currentPage + 1})">
                 <i class="fas fa-chevron-right"></i></button>`;

        html += '</div>';
        container.innerHTML = html;
    }

    function showLoadingState() {
        const listContainer = document.getElementById('rules-list-container');
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="loading">
                    <i class="fas fa-spinner fa-spin"></i> 
                    Загрузка правил...
                </div>
            `;
        }
    }

    function showErrorState(message) {
        const listContainer = document.getElementById('rules-list-container');
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    Ошибка: ${escapeHtml(message)}
                    <button class="btn btn-primary" onclick="window.RulesManager.loadAllData()">
                        Попробовать снова
                    </button>
                </div>
            `;
        }
    }

    // =============================================================================
    // ADVANCED FEATURES
    // =============================================================================

    function toggleAdvancedSearch() {
        const advancedPanel = document.getElementById('rules-advanced-filters');
        if (advancedPanel) {
            advancedPanel.style.display = advancedPanel.style.display === 'none' ? 'block' : 'none';
        }
    }

    async function exportRules() {
        try {
            const dataToExport = state.filteredRules.map(rule => ({
                id: rule.id,
                name: rule.name,
                name_ru: rule.name_ru,
                description: rule.description,
                description_ru: rule.description_ru,
                severity: rule.severity,
                status: rule.status,
                author: rule.author,
                technique_id: rule.technique_id,
                created_at: rule.created_at,
                updated_at: rule.updated_at,
                comments_count: state.commentsCache.get(rule.id) || 0
            }));

            const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rules-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            notify('Экспорт завершен', 'success');
        } catch (error) {
            console.error('Export failed:', error);
            notify('Ошибка экспорта', 'error');
        }
    }

    // =============================================================================
    // UTILITY FUNCTIONS
    // =============================================================================

    function findRuleById(ruleId) {
        const id = String(ruleId);
        return state.rules.find(r => String(r.id) === id);
    }

    function filterByTechnique(techniqueId) {
        console.log(`🔍 Filtering rules by technique: ${techniqueId}`);
        state.currentFilter.technique = techniqueId;

        // Обновляем UI если есть соответствующий фильтр
        const techniqueSelect = document.getElementById('rulesTechniqueFilter');
        if (techniqueSelect) {
            techniqueSelect.value = techniqueId;
        }

        applyFilters();

        if (elements.container) {
            elements.container.scrollIntoView({ behavior: 'smooth' });
        }

        notify(`Отфильтровано по технике ${techniqueId}`, 'info');
    }

    // =============================================================================
    // RULE ACTIONS
    // =============================================================================

    function changePage(page) {
        if (page < 1 || page > state.totalPages) return;
        state.currentPage = page;
        renderRules();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function viewRule(ruleId) {
        const rule = findRuleById(ruleId);
        if (!rule) {
            console.error('Rule not found:', ruleId);
            notify('Правило не найдено', 'error');
            return;
        }

        if (window.RuleModal) {
            window.RuleModal.view(rule, {
                onEdit: (r) => editRule(r.id),
                onShowComments: (r) => showComments(r.id),
                onShowTechniques: (r) => showTechniques(r.id)
            });
        } else {
            console.error('RuleModal not loaded');
        }
    }

    async function editRule(ruleId) {
        const rule = findRuleById(ruleId);
        if (!rule) {
            console.error('Rule not found:', ruleId);
            notify('Правило не найдено', 'error');
            return;
        }

        if (window.RuleModal) {
            window.RuleModal.edit(rule, {
                onSuccess: () => {
                    loadAllData();
                    notify('Правило обновлено', 'success');
                },
                onError: (error) => {
                    notify('Ошибка обновления: ' + error.message, 'error');
                }
            });
        } else {
            console.error('RuleModal not loaded');
        }
    }

    async function deleteRule(ruleId) {
        const rule = findRuleById(ruleId);
        if (!rule) {
            console.error('Rule not found:', ruleId);
            notify('Правило не найдено', 'error');
            return;
        }

        if (!confirm(`Удалить правило "${rule.name_ru || rule.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${RULES_API_BASE}/rules/${ruleId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            if (result.success) {
                // Удаляем из локального state
                state.rules = state.rules.filter(r => r.id !== ruleId);
                state.commentsCache.delete(ruleId);

                applyFilters();
                notify('Правило удалено', 'success');
            } else {
                throw new Error(result.error || 'Deletion failed');
            }
        } catch (error) {
            console.error('Delete failed:', error);
            notify('Ошибка удаления: ' + error.message, 'error');
        }
    }

    function showComments(ruleId) {
        if (window.RuleModal) {
            const rule = findRuleById(ruleId);
            if (rule) {
                window.RuleModal.view(rule);
                // Переключаемся на вкладку комментариев после открытия
                setTimeout(() => {
                    const commentsTab = document.querySelector('[data-tab="comments"]');
                    if (commentsTab) {
                        commentsTab.click();
                    }
                }, 500);
            }
        } else if (window.CommentModal && typeof window.CommentModal.listForEntity === 'function') {
            window.CommentModal.listForEntity('rule', ruleId);
        } else {
            console.warn('CommentModal not available');
            notify('Модуль комментариев не загружен', 'warning');
        }
    }

    function showTechniques(ruleId) {
        const rule = findRuleById(ruleId);
        if (rule && rule.techniques) {
            console.log('Rule techniques:', rule.techniques);

            if (window.RuleModal && typeof window.RuleModal.showLinkedTechniquesModal === 'function') {
                window.RuleModal.showLinkedTechniquesModal(rule);
            } else {
                notify(`Связано техник: ${rule.techniques.length}`, 'info');
            }
        } else {
            notify('У правила нет связанных техник', 'info');
        }
    }

    // =============================================================================
    // UTILITIES
    // =============================================================================

    function getAuthToken() {
        return localStorage.getItem('authToken') || '';
    }

    function notify(message, type = 'info') {
        if (window.Notifications && typeof window.Notifications.show === 'function') {
            window.Notifications.show(message, type);
        } else if (window.Utils && typeof window.Utils.showNotification === 'function') {
            window.Utils.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    function formatDateTime(isoString) {
        if (!isoString) return 'N/A';
        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'только что';
            if (diffMins < 60) return `${diffMins} мин назад`;
            if (diffHours < 24) return `${diffHours} ч назад`;
            if (diffDays < 7) return `${diffDays} дн назад`;

            return date.toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
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
    // CLEANUP
    // =============================================================================

    window.addEventListener('beforeunload', () => {
        if (state.refreshInterval) {
            clearInterval(state.refreshInterval);
        }
    });

    // =============================================================================
    // GLOBAL EXPORTS
    // =============================================================================

    window.RulesManager = {
        changePage,
        viewRule,
        editRule,
        deleteRule,
        showComments,
        filterByTechnique,
        loadAllData,
        resetFilters,
        exportRules,
        toggleAdvancedSearch,

        // Для отладки
        getState: () => state,
        getElements: () => elements
    };

    console.log('✅ rules.js v4.0 loaded successfully');

})();
