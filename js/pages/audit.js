/**
 * ============================================================================
 * AUDIT LOG PAGE v3.0 - MITRE ATT&CK Matrix Platform
 * ============================================================================
 * Full-featured audit system with dashboard, filters, export & real-time updates
 * 
 * @version 3.0.0
 * @author Storm Labs Security Team
 * @date 2025-10-15
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_BASE_URL = window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api';

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

let currentPage = 1;
let currentFilters = {
    level: 'all',
    event_type: 'all',
    date_from: '',
    date_to: '',
    search: '',
    risk_min: 0,
    risk_max: 100
};

let dashboardData = null;
let statisticsData = null;
let autoRefreshInterval = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 Audit page v3.0 initializing...');

    const auditSection = document.getElementById('audit');
    if (!auditSection) {
        console.warn('⚠️ Audit section not found in DOM');
        return;
    }

    initializeAuditPage();
    setupEventListeners();
    setupAutoRefresh();

    // Load data when section becomes visible
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (auditSection.classList.contains('active')) {
                loadAllData();
                observer.disconnect();
            }
        });
    });

    observer.observe(auditSection, {
        attributes: true,
        attributeFilter: ['class']
    });

    // Load immediately if already active
    if (auditSection.classList.contains('active')) {
        loadAllData();
    }

    console.log('✅ Audit page v3.0 initialized successfully');
});

// =============================================================================
// INITIALIZATION FUNCTIONS
// =============================================================================

function initializeAuditPage() {
    // Set default date range
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    currentFilters.date_from = weekAgo;
    currentFilters.date_to = today;

    // Set date inputs if they exist
    const dateFromInput = document.getElementById('audit-date-from');
    const dateToInput = document.getElementById('audit-date-to');

    if (dateFromInput) dateFromInput.value = weekAgo;
    if (dateToInput) dateToInput.value = today;

    console.log('📅 Date range initialized:', { from: weekAgo, to: today });
}

function setupEventListeners() {
    // Level filter
    const levelFilter = document.getElementById('audit-level-filter');
    if (levelFilter) {
        levelFilter.addEventListener('change', (e) => {
            currentFilters.level = e.target.value;
            currentPage = 1;
            loadAuditLogs();
        });
    }

    // Event type filter
    const eventTypeFilter = document.getElementById('audit-event-type-filter');
    if (eventTypeFilter) {
        eventTypeFilter.addEventListener('change', (e) => {
            currentFilters.event_type = e.target.value;
            currentPage = 1;
            loadAuditLogs();
        });
    }

    // Date from
    const dateFrom = document.getElementById('audit-date-from');
    if (dateFrom) {
        dateFrom.addEventListener('change', (e) => {
            currentFilters.date_from = e.target.value;
            currentPage = 1;
            loadAllData();
        });
    }

    // Date to
    const dateTo = document.getElementById('audit-date-to');
    if (dateTo) {
        dateTo.addEventListener('change', (e) => {
            currentFilters.date_to = e.target.value;
            currentPage = 1;
            loadAllData();
        });
    }

    // Search input with debounce
    const searchInput = document.getElementById('audit-search');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentFilters.search = e.target.value.trim();
                currentPage = 1;
                loadAuditLogs();
            }, 500);
        });
    }

    // Risk min slider
    const riskMinSlider = document.getElementById('audit-risk-min');
    if (riskMinSlider) {
        riskMinSlider.addEventListener('change', (e) => {
            currentFilters.risk_min = parseInt(e.target.value, 10);
            currentPage = 1;
            loadAuditLogs();
            updateRiskLabel('min', e.target.value);
        });
    }

    // Risk max slider
    const riskMaxSlider = document.getElementById('audit-risk-max');
    if (riskMaxSlider) {
        riskMaxSlider.addEventListener('change', (e) => {
            currentFilters.risk_max = parseInt(e.target.value, 10);
            currentPage = 1;
            loadAuditLogs();
            updateRiskLabel('max', e.target.value);
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('audit-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadAllData();
            showNotification('Данные обновлены', 'success');
        });
    }

    // Export button
    const exportBtn = document.getElementById('audit-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportAuditLogs('csv'));
    }

    // Export JSON button
    const exportJsonBtn = document.getElementById('audit-export-json-btn');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => exportAuditLogs('json'));
    }

    // Clear filters button
    const clearBtn = document.getElementById('audit-clear-filters-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllFilters);
    }

    // Dashboard timeframe selector
    const timeframeSelect = document.getElementById('audit-timeframe-select');
    if (timeframeSelect) {
        timeframeSelect.addEventListener('change', (e) => {
            loadDashboard(e.target.value);
        });
    }

    // Auto-refresh toggle
    const autoRefreshToggle = document.getElementById('audit-auto-refresh');
    if (autoRefreshToggle) {
        autoRefreshToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        });
    }
}

function setupAutoRefresh() {
    const autoRefreshToggle = document.getElementById('audit-auto-refresh');
    if (autoRefreshToggle && autoRefreshToggle.checked) {
        startAutoRefresh();
    }
}

function startAutoRefresh() {
    if (autoRefreshInterval) return;

    autoRefreshInterval = setInterval(() => {
        console.log('🔄 Auto-refreshing audit data...');
        loadAllData();
    }, 30000); // 30 seconds

    console.log('✅ Auto-refresh enabled (30s interval)');
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log('⏸️ Auto-refresh disabled');
    }
}

// =============================================================================
// DATA LOADING FUNCTIONS
// =============================================================================

async function loadAllData() {
    await Promise.all([
        loadDashboard(),
        loadAuditLogs(),
        loadAuditStatistics()
    ]);
}

async function loadDashboard(timeframe = '24h') {
    const container = document.getElementById('audit-dashboard');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка dashboard...</div>';

        const response = await fetch(`${API_BASE_URL}/audit/dashboard?timeframe=${timeframe}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const json = await response.json();

        if (!json.success) {
            throw new Error(json.error?.message || 'Dashboard load failed');
        }

        dashboardData = json.data;
        renderDashboard(dashboardData);

    } catch (error) {
        console.error('❌ Dashboard error:', error);
        container.innerHTML = `<div class="error-message">Ошибка загрузки dashboard: ${error.message}</div>`;
    }
}

async function loadAuditLogs() {
    const container = document.getElementById('audit-logs-container');
    if (!container) {
        console.warn('⚠️ Audit logs container not found');
        return;
    }

    try {
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка логов...</div>';

        // Build query parameters
        const params = new URLSearchParams({
            page: currentPage,
            limit: 50
        });

        // Add filters (only non-default values)
        Object.keys(currentFilters).forEach(key => {
            const value = currentFilters[key];
            if (value && value !== 'all' && value !== 0 && value !== 100) {
                params.append(key, value);
            }
        });

        const response = await fetch(`${API_BASE_URL}/audit?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const json = await response.json();

        if (!json.success) {
            throw new Error(json.error?.message || 'Load failed');
        }

        renderAuditLogs(json.data.logs);
        renderPagination(json.data.pagination);

    } catch (error) {
        console.error('❌ Audit logs error:', error);
        container.innerHTML = `<div class="error-message">Ошибка загрузки: ${error.message}</div>`;
    }
}

async function loadAuditStatistics() {
    const container = document.getElementById('audit-stats-summary');
    if (!container) return;

    try {
        const params = new URLSearchParams({
            timeframe: '24h',
            include_trends: 'true'
        });

        const response = await fetch(`${API_BASE_URL}/audit/statistics?${params}`);

        if (!response.ok) return;

        const json = await response.json();

        if (json.success && json.data?.statistics) {
            statisticsData = json.data.statistics;
            renderStatisticsSummary(statisticsData);
        }

    } catch (error) {
        console.error('❌ Statistics error:', error);
    }
}

// =============================================================================
// RENDERING FUNCTIONS
// =============================================================================

function renderDashboard(data) {
    const container = document.getElementById('audit-dashboard');
    if (!container) return;

    const html = `
        <div class="dashboard-grid">
            <!-- Overview Cards -->
            <div class="dashboard-card overview-card">
                <h3><i class="fas fa-chart-line"></i> Обзор</h3>
                <div class="stats-grid">
                    <div class="stat">
                        <span class="stat-value">${data.overview?.total_events || 0}</span>
                        <span class="stat-label">Всего событий</span>
                    </div>
                    <div class="stat critical">
                        <span class="stat-value">${data.overview?.high_priority_events || 0}</span>
                        <span class="stat-label">Критические</span>
                    </div>
                    <div class="stat high-risk">
                        <span class="stat-value">${data.overview?.high_risk_events || 0}</span>
                        <span class="stat-label">Высокий риск</span>
                    </div>
                </div>
            </div>
            
            <!-- Risk Metrics -->
            <div class="dashboard-card risk-card">
                <h3><i class="fas fa-exclamation-triangle"></i> Метрики риска</h3>
                <div class="stats-grid">
                    <div class="stat">
                        <span class="stat-value">${data.risk_metrics?.average?.toFixed(1) || 0}</span>
                        <span class="stat-label">Средний риск</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${data.risk_metrics?.maximum || 0}</span>
                        <span class="stat-label">Макс. риск</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${data.risk_metrics?.std_deviation?.toFixed(1) || 0}</span>
                        <span class="stat-label">Отклонение</span>
                    </div>
                </div>
            </div>
            
            <!-- Top Users -->
            <div class="dashboard-card users-card">
                <h3><i class="fas fa-users"></i> Топ пользователей</h3>
                <div class="user-list">
                    ${renderTopUsers(data.top_users)}
                </div>
            </div>
            
            <!-- Top Event Types -->
            <div class="dashboard-card events-card">
                <h3><i class="fas fa-list"></i> Типы событий</h3>
                <div class="event-types-list">
                    ${renderTopEventTypes(data.top_event_types)}
                </div>
            </div>
            
            <!-- Security Alerts -->
            ${data.security_alerts?.length > 0 ? `
            <div class="dashboard-card alerts-card full-width">
                <h3><i class="fas fa-shield-alt"></i> Алерты безопасности</h3>
                <div class="alerts-list">
                    ${renderSecurityAlerts(data.security_alerts)}
                </div>
            </div>
            ` : ''}
            
            <!-- Recent Events -->
            <div class="dashboard-card recent-card full-width">
                <h3><i class="fas fa-clock"></i> Последние события</h3>
                <div class="recent-events-list">
                    ${renderRecentEvents(data.recent_events)}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderTopUsers(users) {
    if (!users || users.length === 0) {
        return '<div class="empty-state">Нет данных</div>';
    }

    return users.map((user, index) => `
        <div class="user-item">
            <span class="user-rank">#${index + 1}</span>
            <span class="user-name">${escapeHtml(user.username)}</span>
            <span class="user-count">${user.event_count} событий</span>
            <span class="user-risk badge badge-${getRiskClass(user.avg_risk_score)}">
                ${user.avg_risk_score?.toFixed(1) || 0}
            </span>
        </div>
    `).join('');
}

function renderTopEventTypes(types) {
    if (!types || types.length === 0) {
        return '<div class="empty-state">Нет данных</div>';
    }

    return types.map(type => `
        <div class="event-type-item">
            <span class="event-type-name">${escapeHtml(type.event_type)}</span>
            <span class="event-type-count">${type.count}</span>
        </div>
    `).join('');
}

function renderSecurityAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
        return '<div class="empty-state">Нет алертов</div>';
    }

    return alerts.map(alert => `
        <div class="alert-item risk-${getRiskClass(alert.risk_score)}">
            <div class="alert-header">
                <span class="badge badge-${alert.level?.toLowerCase() || 'critical'}">
                    ${alert.level || 'SECURITY'}
                </span>
                <span class="alert-type">${escapeHtml(alert.event_type)}</span>
                <span class="alert-risk">Риск: ${alert.risk_score}</span>
            </div>
            <div class="alert-body">${escapeHtml(alert.description)}</div>
            <div class="alert-footer">
                <span><i class="fas fa-clock"></i> ${formatDateTime(alert.created_at)}</span>
                <span><i class="fas fa-user"></i> ${escapeHtml(alert.username)}</span>
            </div>
        </div>
    `).join('');
}

function renderRecentEvents(events) {
    if (!events || events.length === 0) {
        return '<div class="empty-state">Нет событий</div>';
    }

    return events.slice(0, 10).map(event => `
        <div class="recent-event-item level-${event.level?.toLowerCase() || 'info'}">
            <span class="badge badge-${event.level?.toLowerCase() || 'info'}">${event.level}</span>
            <span class="event-time">${formatDateTime(event.created_at)}</span>
            <span class="event-type">${escapeHtml(event.event_type)}</span>
            <span class="event-desc">${escapeHtml(truncateText(event.description, 80))}</span>
        </div>
    `).join('');
}

function renderAuditLogs(logs) {
    const container = document.getElementById('audit-logs-container');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Нет записей аудита</p></div>';
        return;
    }

    const html = logs.map(log => `
        <div class="audit-log-item level-${log.level?.toLowerCase() || 'info'}" data-log-id="${log.id}">
            <div class="log-header">
                <span class="badge badge-${log.level?.toLowerCase() || 'info'}">${log.level}</span>
                <span class="log-type">${escapeHtml(log.event_type)}</span>
                <span class="log-time"><i class="fas fa-clock"></i> ${formatDateTime(log.created_at)}</span>
                <span class="log-risk badge-risk badge-risk-${getRiskClass(log.risk_score)}">
                    Риск: ${log.risk_score}
                </span>
            </div>
            <div class="log-body">
                <p class="log-description">${escapeHtml(log.description)}</p>
                <div class="log-meta">
                    ${log.username ? `<span class="log-user"><i class="fas fa-user"></i> ${escapeHtml(log.username)}</span>` : ''}
                    ${log.user_ip ? `<span class="log-ip"><i class="fas fa-network-wired"></i> ${log.user_ip}</span>` : ''}
                    ${log.entity_type ? `<span class="log-entity"><i class="fas fa-cube"></i> ${log.entity_type}</span>` : ''}
                </div>
            </div>
            <div class="log-footer">
                <button class="btn btn-sm btn-details" onclick="viewLogDetails('${log.id}')">
                    <i class="fas fa-info-circle"></i> Подробнее
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderPagination(pagination) {
    const container = document.getElementById('audit-pagination');
    if (!container) return;

    if (!pagination || pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';

    // Previous button
    html += `<button class="btn-page" ${!pagination.has_prev ? 'disabled' : ''} 
             onclick="changePage(${pagination.page - 1})">
             <i class="fas fa-chevron-left"></i>
             </button>`;

    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);

    if (startPage > 1) {
        html += `<button class="btn-page" onclick="changePage(1)">1</button>`;
        if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-page ${i === pagination.page ? 'active' : ''}" 
                 onclick="changePage(${i})">${i}</button>`;
    }

    if (endPage < pagination.pages) {
        if (endPage < pagination.pages - 1) html += '<span class="pagination-ellipsis">...</span>';
        html += `<button class="btn-page" onclick="changePage(${pagination.pages})">${pagination.pages}</button>`;
    }

    // Next button
    html += `<button class="btn-page" ${!pagination.has_next ? 'disabled' : ''} 
             onclick="changePage(${pagination.page + 1})">
             <i class="fas fa-chevron-right"></i>
             </button>`;

    html += '</div>';

    html += `<div class="pagination-info">
                Показано ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} 
                из ${pagination.total}
             </div>`;

    container.innerHTML = html;
}

function renderStatisticsSummary(stats) {
    const container = document.getElementById('audit-stats-summary');
    if (!container) return;

    const html = `
        <div class="stats-summary-grid">
            <div class="stat-card">
                <i class="fas fa-list stat-icon"></i>
                <div class="stat-content">
                    <span class="stat-value">${stats.total_events || 0}</span>
                    <span class="stat-label">Всего событий</span>
                </div>
            </div>
            <div class="stat-card critical">
                <i class="fas fa-exclamation-circle stat-icon"></i>
                <div class="stat-content">
                    <span class="stat-value">${stats.events_by_level?.critical || 0}</span>
                    <span class="stat-label">Критические</span>
                </div>
            </div>
            <div class="stat-card security">
                <i class="fas fa-shield-alt stat-icon"></i>
                <div class="stat-content">
                    <span class="stat-value">${stats.events_by_level?.security || 0}</span>
                    <span class="stat-label">Безопасность</span>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-chart-bar stat-icon"></i>
                <div class="stat-content">
                    <span class="stat-value">${stats.risk_metrics?.average?.toFixed(1) || 0}</span>
                    <span class="stat-label">Средний риск</span>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// =============================================================================
// ACTIONS
// =============================================================================

function changePage(page) {
    if (page < 1) return;
    currentPage = page;
    loadAuditLogs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearAllFilters() {
    currentFilters = {
        level: 'all',
        event_type: 'all',
        date_from: '',
        date_to: '',
        search: '',
        risk_min: 0,
        risk_max: 100
    };

    // Reset UI
    const levelFilter = document.getElementById('audit-level-filter');
    if (levelFilter) levelFilter.value = 'all';

    const eventTypeFilter = document.getElementById('audit-event-type-filter');
    if (eventTypeFilter) eventTypeFilter.value = 'all';

    const dateFrom = document.getElementById('audit-date-from');
    if (dateFrom) dateFrom.value = '';

    const dateTo = document.getElementById('audit-date-to');
    if (dateTo) dateTo.value = '';

    const searchInput = document.getElementById('audit-search');
    if (searchInput) searchInput.value = '';

    const riskMin = document.getElementById('audit-risk-min');
    if (riskMin) riskMin.value = 0;

    const riskMax = document.getElementById('audit-risk-max');
    if (riskMax) riskMax.value = 100;

    currentPage = 1;
    loadAuditLogs();
    showNotification('Фильтры очищены', 'success');
}

async function exportAuditLogs(format = 'csv') {
    try {
        showNotification(`Начинается экспорт в ${format.toUpperCase()}...`, 'info');

        const params = new URLSearchParams({
            format: format,
            ...currentFilters
        });

        const response = await fetch(`${API_BASE_URL}/audit/export?${params}`);

        if (!response.ok) {
            throw new Error('Export failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_log_${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Экспорт завершён успешно', 'success');

    } catch (error) {
        console.error('❌ Export error:', error);
        showNotification('Ошибка экспорта: ' + error.message, 'error');
    }
}

async function viewLogDetails(logId) {
    try {
        const response = await fetch(`${API_BASE_URL}/audit/${logId}`);

        if (!response.ok) {
            throw new Error('Failed to load details');
        }

        const json = await response.json();

        if (!json.success) {
            throw new Error(json.error?.message || 'Load failed');
        }

        showLogDetailsModal(json.data.audit_log);

    } catch (error) {
        console.error('❌ Details load error:', error);
        showNotification('Ошибка загрузки деталей', 'error');
    }
}

function showLogDetailsModal(log) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content audit-details-modal">
            <div class="modal-header">
                <h2><i class="fas fa-file-alt"></i> Детали лога #${log.id}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="detail-grid">
                    <div class="detail-row">
                        <span class="detail-label">Уровень:</span>
                        <span class="badge badge-${log.level?.toLowerCase() || 'info'}">${log.level}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Тип события:</span>
                        <span>${escapeHtml(log.event_type)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Описание:</span>
                        <span>${escapeHtml(log.description)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Пользователь:</span>
                        <span>${escapeHtml(log.username || 'N/A')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">IP адрес:</span>
                        <span>${log.user_ip || 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Риск:</span>
                        <span class="badge badge-risk-${getRiskClass(log.risk_score)}">${log.risk_score}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Время создания:</span>
                        <span>${formatDateTime(log.created_at)}</span>
                    </div>
                    ${log.entity_type ? `
                    <div class="detail-row">
                        <span class="detail-label">Сущность:</span>
                        <span>${escapeHtml(log.entity_type)} ${log.entity_id ? `(${log.entity_id})` : ''}</span>
                    </div>
                    ` : ''}
                    ${log.metadata && Object.keys(log.metadata).length > 0 ? `
                    <div class="detail-row full-width">
                        <span class="detail-label">Метаданные:</span>
                        <pre class="detail-json">${JSON.stringify(log.metadata, null, 2)}</pre>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function updateRiskLabel(type, value) {
    const label = document.getElementById(`audit-risk-${type}-label`);
    if (label) {
        label.textContent = value;
    }
}

function getRiskClass(riskScore) {
    if (riskScore >= 80) return 'critical';
    if (riskScore >= 60) return 'high';
    if (riskScore >= 40) return 'medium';
    if (riskScore >= 20) return 'low';
    return 'minimal';
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
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
            minute: '2-digit',
            second: '2-digit'
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

window.changePage = changePage;
window.viewLogDetails = viewLogDetails;
window.clearAllFilters = clearAllFilters;
window.exportAuditLogs = exportAuditLogs;

console.log('✅ audit.js v3.0 loaded successfully');
