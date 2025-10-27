/**
 * =============================================================================
 * STATISTICS PAGE MODULE - ULTIMATE VERSION WITH EXISTING STYLES
 * MITRE ATT&CK Matrix Application v10.1
 * =============================================================================
 * 
 * Использует СУЩЕСТВУЮЩИЕ CSS-классы из:
 * - components.css: .stat-card, .empty-state, .loading-spinner
 * - pages.css: .statistics-grid, .statistics-card
 * - layout.css: .content-section, .content-header
 * 
 * @author Storm Labs
 * @version 10.1.3-ULTIMATE
 * @date 2025-10-13
 */

const Statistics = {
    // =========================================================================
    // КОНФИГУРАЦИЯ
    // =========================================================================

    config: {
        refreshInterval: 300000, // 5 минут
        coverageThresholds: {
            excellent: 80,
            good: 60,
            medium: 40,
            low: 0
        }
    },

    // =========================================================================
    // СОСТОЯНИЕ
    // =========================================================================

    state: {
        isLoading: false,
        lastUpdate: null,
        refreshTimer: null,
        statistics: null
    },

    // =========================================================================
    // ИНИЦИАЛИЗАЦИЯ
    // =========================================================================

    /**
     * Загрузка страницы статистики
     */
    async load() {
        console.log('📊 Loading Statistics page...');

        if (this.state.isLoading) {
            console.warn('⚠️ Statistics page is already loading');
            return;
        }

        try {
            this.state.isLoading = true;

            // Показываем индикатор загрузки
            this.showLoadingState();

            // Загружаем основную статистику
            await this.loadStatistics();

            // Обновляем метку времени
            this.state.lastUpdate = new Date();

            console.log('✅ Statistics page loaded successfully');
        } catch (error) {
            console.error('❌ Statistics page load error:', error);
            this.handleLoadError(error);
        } finally {
            this.state.isLoading = false;
        }
    },

    /**
     * Выгрузка страницы
     */
    unload() {
        console.log('📊 Unloading Statistics page...');

        // Останавливаем автообновление
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
            this.state.refreshTimer = null;
        }

        // Очищаем состояние
        this.state.statistics = null;
        this.state.lastUpdate = null;

        console.log('✅ Statistics page unloaded');
    },

    // =========================================================================
    // ЗАГРУЗКА ДАННЫХ
    // =========================================================================

    /**
     * Загрузка статистики
     */
    async loadStatistics() {
        try {
            console.log('📊 Fetching statistics data from API...');

            // Получаем данные от API
            const response = await API.getStatistics();

            if (!response || !response.success) {
                throw new Error(response?.message || 'Failed to load statistics');
            }

            console.log('✅ Statistics data received:', response.data);

            // Сохраняем данные
            this.state.statistics = response.data;

            // Отрисовываем статистику
            this.renderStatistics(response.data);

        } catch (error) {
            console.error('❌ Failed to load statistics:', error);
            throw error;
        }
    },

    // =========================================================================
    // ОТРИСОВКА (ИСПОЛЬЗУЕТ СУЩЕСТВУЮЩИЕ CSS-КЛАССЫ!)
    // =========================================================================

    /**
     * Отрисовка статистики
     */
    renderStatistics(data) {
        console.log('🎨 Rendering statistics with existing CSS classes...');

        // Проверяем контейнер
        const container = document.getElementById('statisticsContent');
        if (!container) {
            console.error('❌ Statistics container not found!');
            return;
        }

        // Проверяем наличие данных
        if (!data || !data.overview) {
            console.warn('⚠️ No overview data available');
            container.innerHTML = this.renderEmptyState();
            return;
        }

        const overview = data.overview;

        // Создаём полный HTML используя СУЩЕСТВУЮЩИЕ классы
        container.innerHTML = `
            <!-- Stats Grid - использует .stats-grid из components.css -->
            <div class="stats-grid">
                ${this.renderStatsCards(overview)}
            </div>

            <!-- Statistics Cards Grid - использует .statistics-grid из pages.css -->
            <div class="statistics-grid" style="margin-top: 2rem;">
                ${this.renderCoverageCard(overview)}
                ${this.renderDetailsCard(overview)}
            </div>
        `;

        console.log('✅ Statistics rendered with existing styles');
    },

    /**
     * Отрисовка карточек статистики (ИСПОЛЬЗУЕТ .stat-card из components.css!)
     */
    renderStatsCards(overview) {
        const cards = [
            {
                icon: 'fa-shield-alt',
                value: overview.total_techniques || overview.active_techniques || 0,
                label: 'Всего техник',
                color: 'blue' // .stat-card-blue
            },
            {
                icon: 'fa-check-circle',
                value: overview.covered_techniques || 0,
                label: 'Покрыто правилами',
                color: 'green' // .stat-card-green
            },
            {
                icon: 'fa-exclamation-triangle',
                value: overview.partially_covered || 0,
                label: 'Частично покрыто',
                color: 'orange' // .stat-card-orange
            },
            {
                icon: 'fa-times-circle',
                value: overview.uncovered_techniques || 0,
                label: 'Не покрыто',
                color: 'red' // .stat-card-red
            },
            {
                icon: 'fa-code-branch',
                value: overview.total_rules || overview.active_rules || 0,
                label: 'Правил корреляции',
                color: 'blue' // .stat-card-blue
            },
            {
                icon: 'fa-layer-group',
                value: overview.total_tactics || 0,
                label: 'Активных тактик',
                color: 'blue' // .stat-card-blue
            }
        ];

        // Используем СУЩЕСТВУЮЩИЕ классы: .stat-card, .stat-card-icon, .stat-card-content, .stat-card-value, .stat-card-label
        return cards.map(card => `
            <div class="stat-card stat-card-${card.color}">
                <div class="stat-card-icon">
                    <i class="fas ${card.icon}"></i>
                </div>
                <div class="stat-card-content">
                    <div class="stat-card-value">${card.value}</div>
                    <div class="stat-card-label">${card.label}</div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Отрисовка карточки покрытия (ИСПОЛЬЗУЕТ .statistics-card из pages.css!)
     */
    renderCoverageCard(overview) {
        const coveragePercent = Math.round(overview.coverage_percentage || 0);
        const coverageClass = this.getCoverageLevelClass(coveragePercent);

        // Используем СУЩЕСТВУЮЩИЕ классы: .statistics-card, .statistics-card-header, .statistics-card-title
        return `
            <div class="statistics-card">
                <div class="statistics-card-header">
                    <h3 class="statistics-card-title">
                        <i class="fas fa-chart-pie"></i>
                        Покрытие MITRE ATT&CK
                    </h3>
                    <span class="rule-status ${coverageClass}" style="font-size: 0.875rem;">
                        ${coveragePercent}%
                    </span>
                </div>

                <div class="statistics-card-body" style="height: auto; display: block; background: transparent; padding: 1rem;">
                    <!-- Progress Bar -->
                    <div style="margin: 1rem 0; height: 40px; background: var(--bg-tertiary); border-radius: 20px; overflow: hidden;">
                        <div class="coverage-bar ${coverageClass}" 
                             style="width: ${coveragePercent}%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; transition: width 0.5s ease;">
                            ${coveragePercent}%
                        </div>
                    </div>

                    <!-- Legend -->
                    <div style="display: flex; gap: 2rem; margin-top: 1rem; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--color-success);"></span>
                            <span style="font-size: 0.875rem; color: var(--text-secondary);">
                                Покрыто: ${overview.covered_techniques || 0}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--color-warning);"></span>
                            <span style="font-size: 0.875rem; color: var(--text-secondary);">
                                Частично: ${overview.partially_covered || 0}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--color-error);"></span>
                            <span style="font-size: 0.875rem; color: var(--text-secondary);">
                                Не покрыто: ${overview.uncovered_techniques || 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Отрисовка карточки деталей (ИСПОЛЬЗУЕТ .statistics-card из pages.css!)
     */
    renderDetailsCard(overview) {
        const details = [
            {
                label: 'Всего техник',
                value: overview.total_techniques || 0,
                icon: 'fa-shield-alt'
            },
            {
                label: 'Активных техник',
                value: overview.active_techniques || 0,
                icon: 'fa-check'
            },
            {
                label: 'Покрыто правилами',
                value: overview.covered_techniques || 0,
                icon: 'fa-check-circle',
                color: 'var(--color-success)'
            },
            {
                label: 'Частично покрыто',
                value: overview.partially_covered || 0,
                icon: 'fa-exclamation-triangle',
                color: 'var(--color-warning)'
            },
            {
                label: 'Не покрыто',
                value: overview.uncovered_techniques || 0,
                icon: 'fa-times-circle',
                color: 'var(--color-error)'
            },
            {
                label: 'Всего правил',
                value: overview.total_rules || 0,
                icon: 'fa-code-branch'
            },
            {
                label: 'Активных правил',
                value: overview.active_rules || 0,
                icon: 'fa-toggle-on'
            },
            {
                label: 'Всего тактик',
                value: overview.total_tactics || 0,
                icon: 'fa-layer-group'
            }
        ];

        // Используем СУЩЕСТВУЮЩИЕ классы: .statistics-card
        return `
            <div class="statistics-card">
                <div class="statistics-card-header">
                    <h3 class="statistics-card-title">
                        <i class="fas fa-list-ul"></i>
                        Детальная статистика
                    </h3>
                </div>

                <div class="statistics-card-body" style="height: auto; display: block; background: transparent; padding: 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tbody>
                            ${details.map(detail => `
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                                        <i class="fas ${detail.icon}" style="width: 20px; text-align: center; color: ${detail.color || 'var(--text-muted)'};"></i>
                                        <span style="color: var(--text-secondary);">${detail.label}</span>
                                    </td>
                                    <td style="padding: 1rem; text-align: right; font-weight: bold; color: var(--text-primary);">
                                        ${detail.value}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    /**
     * Отрисовка пустого состояния (ИСПОЛЬЗУЕТ .empty-state из components.css!)
     */
    renderEmptyState() {
        // Используем СУЩЕСТВУЮЩИЕ классы: .empty-state, .empty-state-icon, .empty-state-title, .empty-state-description
        return `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-chart-bar"></i>
                </div>
                <h3 class="empty-state-title">Нет данных статистики</h3>
                <p class="empty-state-description">Статистика будет доступна после загрузки данных</p>
                <button class="btn btn-primary" onclick="Statistics.refresh()">
                    <i class="fas fa-sync-alt"></i>
                    Обновить
                </button>
            </div>
        `;
    },

    // =========================================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // =========================================================================

    /**
     * Показать состояние загрузки (ИСПОЛЬЗУЕТ .loading-spinner из components.css!)
     */
    showLoadingState() {
        const container = document.getElementById('statisticsContent');

        if (container) {
            // Используем СУЩЕСТВУЮЩИЙ класс: .loading-spinner
            container.innerHTML = `
                <div class="loading-spinner large">
                    <i class="fas fa-spinner"></i>
                    <p>Загрузка статистики...</p>
                </div>
            `;
        }
    },

    /**
     * Обработка ошибки загрузки
     */
    handleLoadError(error) {
        console.error('❌ Statistics load error:', error);

        const container = document.getElementById('statisticsContent');

        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon" style="color: var(--color-error);">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3 class="empty-state-title">Ошибка загрузки статистики</h3>
                    <p class="empty-state-description">${error.message || 'Не удалось загрузить данные'}</p>
                    <button class="btn btn-primary" onclick="Statistics.load()">
                        <i class="fas fa-redo"></i>
                        Повторить попытку
                    </button>
                </div>
            `;
        }
    },

    /**
     * Получить класс уровня покрытия
     */
    getCoverageLevelClass(percent) {
        if (percent >= this.config.coverageThresholds.excellent) {
            return 'active'; // зелёный - использует .rule-status.active
        } else if (percent >= this.config.coverageThresholds.good) {
            return 'active'; // зелёный
        } else if (percent >= this.config.coverageThresholds.medium) {
            return 'warning'; // жёлтый - нужен кастомный стиль
        } else {
            return 'inactive'; // красный - использует .rule-status.inactive
        }
    },

    /**
     * Обновить статистику
     */
    async refresh() {
        console.log('🔄 Refreshing statistics...');

        try {
            await this.load();

            // Показываем уведомление
            if (typeof Notification !== 'undefined' && Notification.success) {
                Notification.success('Статистика обновлена');
            }
        } catch (error) {
            console.error('❌ Refresh error:', error);

            if (typeof Notification !== 'undefined' && Notification.error) {
                Notification.error('Ошибка обновления статистики');
            }
        }
    },

    /**
     * Экспорт статистики
     */
    async exportData(format = 'json') {
        console.log(`📥 Exporting statistics as ${format}...`);

        if (!this.state.statistics) {
            console.warn('⚠️ No statistics data to export');
            return;
        }

        try {
            if (format === 'json') {
                const data = JSON.stringify(this.state.statistics, null, 2);
                this.downloadFile(data, `statistics_${Date.now()}.json`, 'application/json');
            } else if (format === 'csv') {
                const overview = this.state.statistics.overview || {};
                const csv = this.convertToCSV(overview);
                this.downloadFile(csv, `statistics_${Date.now()}.csv`, 'text/csv');
            }

            console.log('✅ Export completed');

            // Показываем уведомление
            if (typeof Notification !== 'undefined' && Notification.success) {
                Notification.success(`Экспорт в ${format.toUpperCase()} завершён`);
            }
        } catch (error) {
            console.error('❌ Export error:', error);

            if (typeof Notification !== 'undefined' && Notification.error) {
                Notification.error('Ошибка экспорта');
            }
        }
    },

    /**
     * Конвертировать в CSV
     */
    convertToCSV(data) {
        const rows = [];
        rows.push('Параметр,Значение');

        for (const [key, value] of Object.entries(data)) {
            rows.push(`"${key}","${value}"`);
        }

        return rows.join('\n');
    },

    /**
     * Скачать файл
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }
};

// =============================================================================
// ЭКСПОРТ
// =============================================================================

window.Statistics = Statistics;

console.log('✅ Statistics module loaded');
