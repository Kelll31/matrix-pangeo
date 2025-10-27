/**
 * MITRE ATT&CK Matrix v10.1
 * Dashboard Page Module
 * Fixed: Works without /statistics/trends endpoint
 */

const Dashboard = {
    // Конфигурация
    config: {
        refreshInterval: 300000, // 5 минут
        activityLimit: 10,
        statisticsCache: null,
        autoRefresh: true
    },

    // Состояние
    state: {
        isLoading: false,
        lastUpdate: null,
        refreshTimer: null,
        charts: {},
        statistics: null
    },

    // Инициализация и загрузка дашборда
    async load() {
        console.log('📊 Loading Dashboard...');

        if (this.state.isLoading) {
            console.log('Dashboard is already loading');
            return;
        }

        try {
            this.state.isLoading = true;

            // Загружаем только доступные данные
            await Promise.all([
                this.loadStatistics(),
                this.loadActivityFeed()
                // Убрали loadTrendData() - этот endpoint не существует
            ]);

            // Обновляем timestamp
            this.state.lastUpdate = new Date();
            this.updateLastUpdateTime();

            // Запускаем автообновление
            if (this.config.autoRefresh) {
                this.startAutoRefresh();
            }

            console.log('✅ Dashboard loaded successfully');

        } catch (error) {
            console.error('Dashboard load error:', error);
            this.handleLoadError(error);
        } finally {
            this.state.isLoading = false;
        }
    },

    // Загрузка статистики
    async loadStatistics() {
        try {
            const response = await API.getStatistics();

            if (response.success) {
                this.state.statistics = response.data;
                this.renderStatistics(response.data.overview);

                // Рендерим дополнительные графики если данные есть
                if (response.data.coverage) {
                    this.renderCoverageChart(response.data.coverage);
                }
                if (response.data.tactics) {
                    this.renderTacticBreakdown(response.data.tactics);
                }
            } else {
                throw new Error(response.message || 'Failed to load statistics');
            }
        } catch (error) {
            console.error('Statistics load error:', error);
            throw error;
        }
    },

    // Отрисовка статистики
    renderStatistics(overview) {
        const stats = {
            techniques: overview.active_techniques || overview.total_techniques || 0,
            covered: overview.covered_techniques || overview.techniques_with_rules || 0,
            rules: overview.active_rules || overview.total_rules || 0,
            comments: overview.total_comments || 0
        };

        // Обновляем карточки статистики с анимацией
        Object.entries(stats).forEach(([key, value]) => {
            const element = document.getElementById(`stat${Utils.capitalize(key)}`);
            if (element) {
                const currentValue = parseInt(element.textContent) || 0;
                this.animateValue(element, currentValue, value, 1000);
            }
        });

        // Обновляем процент покрытия
        const coveragePercent = stats.techniques > 0
            ? Math.round((stats.covered / stats.techniques) * 100)
            : 0;

        this.updateCoverageIndicator(coveragePercent);
    },

    // Анимация значения счетчика
    animateValue(element, start, end, duration) {
        if (start === end) return;

        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;

        const timer = setInterval(() => {
            current += increment;

            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                current = end;
                clearInterval(timer);
            }

            element.textContent = Math.round(current);
        }, 16);
    },

    // Обновление индикатора покрытия
    updateCoverageIndicator(percent) {
        const indicators = document.querySelectorAll('.coverage-indicator');
        indicators.forEach(indicator => {
            indicator.textContent = `${percent}%`;

            // Цвет в зависимости от процента
            indicator.className = 'coverage-indicator';
            if (percent >= 80) {
                indicator.classList.add('excellent');
            } else if (percent >= 60) {
                indicator.classList.add('good');
            } else if (percent >= 40) {
                indicator.classList.add('medium');
            } else {
                indicator.classList.add('low');
            }
        });
    },

    // Загрузка ленты активности
    async loadActivityFeed() {
        const container = document.getElementById('dashboardActivity');
        if (!container) return;

        try {
            Utils.showLoading(container, 'Загрузка активности...');

            const response = await API.get('/audit/', {
                limit: this.config.activityLimit,
                sort: '-created_at'
            });

            if (response.success && response.data.logs) {
                this.renderActivityFeed(container, response.data.logs);
            } else {
                Utils.showEmptyState(container, {
                    icon: 'fas fa-history',
                    title: 'Нет активности',
                    message: 'История активности пока пуста'
                });
            }
        } catch (error) {
            console.error('Activity feed error:', error);
            Utils.showErrorState(container, error, {
                retry: { onclick: 'Dashboard.loadActivityFeed()', text: 'Повторить' }
            });
        }
    },

    // Отрисовка ленты активности
    renderActivityFeed(container, activities) {
        if (!activities || activities.length === 0) {
            Utils.showEmptyState(container, {
                icon: 'fas fa-history',
                title: 'Нет активности',
                message: 'История активности пока пуста'
            });
            return;
        }

        const activityHTML = activities.map(activity => `
            <div class="activity-item" data-id="${activity.id}">
                <div class="activity-icon ${this.getActivityTypeClass(activity.action)}">
                    <i class="${this.getActivityIcon(activity.action)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-header">
                        <span class="activity-user">${Utils.escapeHtml(activity.user_name || 'System')}</span>
                        <span class="activity-action">${this.formatActivityAction(activity.action)}</span>
                        ${activity.entity_type ? `
                            <span class="activity-entity">${Utils.escapeHtml(activity.entity_type)}</span>
                        ` : ''}
                    </div>
                    ${activity.description ? `
                        <div class="activity-description">
                            ${Utils.escapeHtml(activity.description)}
                        </div>
                    ` : ''}
                    <div class="activity-meta">
                        <span class="activity-time">
                            <i class="fas fa-clock"></i>
                            ${Utils.timeAgo(activity.created_at)}
                        </span>
                        ${activity.ip_address ? `
                            <span class="activity-ip">
                                <i class="fas fa-network-wired"></i>
                                ${Utils.escapeHtml(activity.ip_address)}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="activity-feed">
                ${activityHTML}
            </div>
            <div class="activity-footer">
                <a href="#audit" class="btn btn-link" onclick="App.navigateToSection('audit')">
                    Показать всю историю <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        `;
    },

    // Получение класса типа активности
    getActivityTypeClass(action) {
        const classMap = {
            'create': 'success',
            'update': 'info',
            'delete': 'danger',
            'login': 'primary',
            'logout': 'secondary'
        };
        return classMap[action] || 'default';
    },

    // Получение иконки активности
    getActivityIcon(action) {
        const iconMap = {
            'create': 'fas fa-plus',
            'update': 'fas fa-edit',
            'delete': 'fas fa-trash',
            'login': 'fas fa-sign-in-alt',
            'logout': 'fas fa-sign-out-alt',
            'view': 'fas fa-eye',
            'export': 'fas fa-download'
        };
        return iconMap[action] || 'fas fa-info-circle';
    },

    // Форматирование действия
    formatActivityAction(action) {
        const actionMap = {
            'create': 'создал(а)',
            'update': 'обновил(а)',
            'delete': 'удалил(а)',
            'login': 'вошел в систему',
            'logout': 'вышел из системы',
            'view': 'просмотрел(а)',
            'export': 'экспортировал(а)'
        };
        return actionMap[action] || action;
    },

    // Отрисовка графика покрытия
    renderCoverageChart(coverageData) {
        if (!coverageData) return;

        const container = document.querySelector('.coverage-chart-container');
        if (!container) return;

        const total = coverageData.total_techniques || 0;
        const covered = coverageData.covered_techniques || 0;
        const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;

        container.innerHTML = `
            <div class="coverage-chart">
                <div class="coverage-chart-circle">
                    <svg viewBox="0 0 100 100">
                        <circle class="coverage-bg" cx="50" cy="50" r="45" />
                        <circle class="coverage-progress" cx="50" cy="50" r="45" 
                                style="stroke-dasharray: ${percentage * 2.827}, 282.7" />
                    </svg>
                    <div class="coverage-value">
                        <span class="coverage-percent">${percentage}%</span>
                        <span class="coverage-label">Покрытие</span>
                    </div>
                </div>
                <div class="coverage-legend">
                    <div class="coverage-legend-item">
                        <span class="coverage-legend-color covered"></span>
                        <span class="coverage-legend-text">Покрыто: ${covered}</span>
                    </div>
                    <div class="coverage-legend-item">
                        <span class="coverage-legend-color uncovered"></span>
                        <span class="coverage-legend-text">Не покрыто: ${total - covered}</span>
                    </div>
                </div>
            </div>
        `;
    },

    // Отрисовка разбивки по тактикам
    renderTacticBreakdown(tactics) {
        if (!tactics || !Array.isArray(tactics)) return;

        const container = document.querySelector('.tactic-breakdown-container');
        if (!container) return;

        const maxCount = Math.max(...tactics.map(t => t.technique_count || 0));

        const tacticsHTML = tactics.map(tactic => {
            const count = tactic.technique_count || 0;
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const coveragePercent = tactic.coverage_percent || 0;

            return `
                <div class="tactic-item" data-tactic="${tactic.tactic_id}">
                    <div class="tactic-header">
                        <span class="tactic-name">${Utils.escapeHtml(tactic.tactic_name)}</span>
                        <span class="tactic-count">${count} техник</span>
                    </div>
                    <div class="tactic-progress">
                        <div class="tactic-progress-bar" 
                             style="width: ${percentage}%"
                             title="${coveragePercent}% покрыто">
                            <span class="tactic-progress-text">${coveragePercent}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="tactic-breakdown">
                <h3 class="tactic-breakdown-title">
                    <i class="fas fa-chart-bar"></i> Покрытие по тактикам
                </h3>
                <div class="tactic-list">
                    ${tacticsHTML}
                </div>
            </div>
        `;
    },

    // Обновление времени последнего обновления
    updateLastUpdateTime() {
        const elements = document.querySelectorAll('.last-update-time');
        elements.forEach(element => {
            if (this.state.lastUpdate) {
                element.textContent = `Обновлено: ${Utils.timeAgo(this.state.lastUpdate)}`;
            }
        });
    },

    // Обновление дашборда
    async refresh() {
        console.log('🔄 Refreshing Dashboard...');

        try {
            // Показываем индикатор
            if (window.Notifications) {
                Notifications.info('Обновление данных...', { duration: 2000 });
            }

            // Перезагружаем все данные
            await this.load();

            if (window.Notifications) {
                Notifications.success('Дашборд обновлен', { duration: 3000 });
            }

        } catch (error) {
            console.error('Dashboard refresh error:', error);
            if (window.Notifications) {
                Notifications.error('Ошибка обновления дашборда', { duration: 5000 });
            }
        }
    },

    // Обновление только активности
    async refreshActivity() {
        console.log('🔄 Refreshing Activity Feed...');
        await this.loadActivityFeed();
    },

    // Запуск автообновления
    startAutoRefresh() {
        // Очищаем предыдущий таймер
        this.stopAutoRefresh();

        // Устанавливаем новый
        this.state.refreshTimer = setInterval(() => {
            console.log('⏰ Auto-refresh triggered');

            // Обновляем только если страница активна
            if (!document.hidden && window.App && App.currentSection === 'dashboard') {
                this.refresh();
            }
        }, this.config.refreshInterval);

        console.log(`✅ Auto-refresh started (every ${this.config.refreshInterval / 1000}s)`);
    },

    // Остановка автообновления
    stopAutoRefresh() {
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
            this.state.refreshTimer = null;
            console.log('🛑 Auto-refresh stopped');
        }
    },

    // Переключение автообновления
    toggleAutoRefresh() {
        this.config.autoRefresh = !this.config.autoRefresh;

        if (this.config.autoRefresh) {
            this.startAutoRefresh();
            if (window.Notifications) {
                Notifications.success('Автообновление включено');
            }
        } else {
            this.stopAutoRefresh();
            if (window.Notifications) {
                Notifications.info('Автообновление выключено');
            }
        }

        // Сохраняем настройку
        if (window.Utils) {
            Utils.localStorage.set('dashboard_auto_refresh', this.config.autoRefresh);
        }
    },

    // Экспорт данных дашборда
    async exportDashboard(format = 'json') {
        try {
            if (window.Notifications) {
                Notifications.info('Подготовка экспорта...');
            }

            const exportData = {
                statistics: this.state.statistics,
                exported_at: new Date().toISOString(),
                format: format
            };

            if (format === 'json') {
                const blob = new Blob(
                    [JSON.stringify(exportData, null, 2)],
                    { type: 'application/json' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `dashboard-export-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                if (window.Notifications) {
                    Notifications.success('Экспорт завершен');
                }
            } else {
                await API.exportData(format, 'dashboard');
            }

        } catch (error) {
            console.error('Export error:', error);
            if (window.Notifications) {
                Notifications.error('Ошибка экспорта');
            }
        }
    },

    // Обработка ошибки загрузки
    handleLoadError(error) {
        const container = document.querySelector('#dashboard .content-body');
        if (!container) return;

        if (window.Utils) {
            Utils.showErrorState(container, error, {
                title: 'Ошибка загрузки дашборда',
                showDetails: true,
                retry: {
                    onclick: 'Dashboard.load()',
                    text: 'Повторить загрузку'
                }
            });
        }

        if (window.Notifications) {
            Notifications.error(`Ошибка загрузки: ${error.message}`, {
                duration: 0,
                persistent: true
            });
        }
    },

    // Очистка при уходе со страницы
    cleanup() {
        console.log('🧹 Cleaning up Dashboard...');
        this.stopAutoRefresh();

        // Очистка графиков если есть
        Object.values(this.state.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.state.charts = {};
    },

    // Получение статистики (для использования другими модулями)
    getStatistics() {
        return this.state.statistics;
    },

    // Проверка загруженности
    isLoaded() {
        return this.state.statistics !== null && !this.state.isLoading;
    }
};

// Экспорт модуля
window.Dashboard = Dashboard;

// Автоматическая загрузка настроек
document.addEventListener('DOMContentLoaded', () => {
    if (window.Utils) {
        const autoRefresh = Utils.localStorage.get('dashboard_auto_refresh', true);
        Dashboard.config.autoRefresh = autoRefresh;
    }

    console.log('Dashboard module initialized');
});

// Очистка при уходе со страницы
window.addEventListener('beforeunload', () => {
    Dashboard.cleanup();
});

// Обработка видимости страницы
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Dashboard.stopAutoRefresh();
    } else if (window.App && App.currentSection === 'dashboard' && Dashboard.config.autoRefresh) {
        Dashboard.startAutoRefresh();
    }
});
