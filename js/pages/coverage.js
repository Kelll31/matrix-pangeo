/**
 * ========================================
 * COVERAGE PAGE MODULE
 * MITRE ATT&CK Matrix Application v10.1
 * ========================================
 * 
 * Отображение покрытия техник правилами корреляции
 * Компактный дизайн с цветовой индикацией
 * 
 * @author Storm Labs
 * @version 10.1.2-COMPACT
 * @date 2025-10-15
 */

const Coverage = {
    // ========================================
    // CONFIGURATION
    // ========================================
    config: {
        refreshInterval: 300000, // 5 минут
        coverageThresholds: {
            excellent: 80,
            good: 60,
            medium: 40,
            low: 0
        }
    },

    // ========================================
    // STATE
    // ========================================
    state: {
        isLoading: false,
        lastUpdate: null,
        refreshTimer: null,
        coverageData: null,
        filters: {
            platform: '',
            status: 'all',
            search: '',
            tactic: ''
        }
    },

    // ========================================
    // INITIALIZATION
    // ========================================
    async load() {
        console.log('Loading Coverage page...');

        if (this.state.isLoading) {
            console.warn('Coverage page is already loading');
            return;
        }

        try {
            this.state.isLoading = true;
            this.showLoadingState();

            // Загружаем данные о покрытии
            await this.loadCoverageData();

            this.state.lastUpdate = new Date();

            // Рендерим страницу
            this.render();

            // Настраиваем обработчики событий
            this.setupEventHandlers();

            console.log('Coverage page loaded successfully');
        } catch (error) {
            console.error('Coverage page load error', error);
            this.handleLoadError(error);
        } finally {
            this.state.isLoading = false;
        }
    },

    // ========================================
    // UNLOAD
    // ========================================
    unload() {
        console.log('Unloading Coverage page...');

        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
            this.state.refreshTimer = null;
        }

        this.state.coverageData = null;
        this.state.lastUpdate = null;
    },

    // ========================================
    // DATA LOADING
    // ========================================
    async loadCoverageData() {
        try {
            const statsResponse = await API.get('/statistics/coverage', { include_partial: 'true' });

            if (!statsResponse || !statsResponse.success) {
                throw new Error(statsResponse?.message || 'Failed to load coverage data');
            }

            this.state.coverageData = statsResponse.data;

            console.log('Coverage data loaded:', this.state.coverageData);
        } catch (error) {
            console.error('Failed to load coverage data:', error);
            throw error;
        }
    },

    // ========================================
    // RENDERING
    // ========================================
    render() {
        const container = document.getElementById('coverage');
        if (!container) {
            console.error('Coverage container not found!');
            return;
        }

        if (!this.state.coverageData) {
            container.innerHTML = this.renderEmptyState();
            return;
        }

        container.innerHTML = `
            ${this.renderHeader()}
            ${this.renderTacticsList()}
        `;
    },

    // ========================================
    // HEADER
    // ========================================
    renderHeader() {
        return `
            <div class="content-header">
                <h1 class="content-title">
                    <i class="fas fa-shield-alt"></i> Покрытие техник
                </h1>
                <div class="content-actions">
                    <button class="btn btn-primary" id="coverageRefreshBtn">
                        <i class="fas fa-sync-alt"></i> Обновить
                    </button>
                </div>
            </div>
        `;
    },

    // ========================================
    // TACTICS LIST
    // ========================================
    renderTacticsList() {
        const tactics = this.state.coverageData.tactics || [];

        if (tactics.length === 0) {
            return '<div class="empty-state">Нет данных по тактикам</div>';
        }

        return `
            <div class="tactics-coverage-list">
                <h2 class="section-title" style="margin-bottom: var(--space-lg); color: var(--text-primary); font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold);">
                    <i class="fas fa-layer-group"></i> Покрытие по тактикам
                </h2>
                <div class="statistics-grid">
                    ${tactics.map(tactic => this.renderTacticCard(tactic)).join('')}
                </div>
            </div>
        `;
    },

    // ========================================
    // TACTIC CARD - COMPACT VERSION
    // ========================================
    renderTacticCard(tactic) {
        const coveragePercent = tactic.coverage_percent || 0;
        const borderColor = this.getCoverageBorderColor(coveragePercent);
        const bgGradient = this.getCoverageBackgroundGradient(coveragePercent);

        return `
            <div class="statistics-card tactic-card" 
                 data-tactic="${tactic.tactic_id}" 
                 data-coverage="${coveragePercent}"
                 style="border-left: 4px solid ${borderColor}; background: ${bgGradient}; position: relative; overflow: hidden;">
                
                <!-- Header with Icon and Percentage -->
                <div class="statistics-card-header" style="padding: var(--space-md); border-bottom: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; gap: var(--space-sm);">
                        <i class="fas fa-bullseye" style="color: ${borderColor}; font-size: var(--font-size-lg);"></i>
                        <h3 class="statistics-card-title" style="font-size: var(--font-size-base); margin: 0; flex: 1;">
                            ${tactic.tactic_name || tactic.tactic_id}
                        </h3>
                        <span style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); color: ${borderColor};">
                            ${coveragePercent.toFixed(0)}%
                        </span>
                    </div>
                </div>
                
                <!-- Progress Bar -->
                <div style="padding: 0; height: 6px; background: var(--bg-tertiary); overflow: hidden;">
                    <div style="width: ${coveragePercent}%; height: 100%; background: ${borderColor}; transition: width 0.3s ease;"></div>
                </div>
                
                <!-- Compact Stats -->
                <div class="statistics-card-body" style="padding: var(--space-md); display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-md);">
                    <!-- Total -->
                    <div>
                        <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: var(--space-xs);">Всего техник</div>
                        <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--text-primary);">${tactic.total || 0}</div>
                    </div>
                    
                    <!-- Covered -->
                    <div>
                        <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: var(--space-xs);">Покрыто</div>
                        <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-success);">${tactic.covered || 0}</div>
                    </div>
                    
                    ${tactic.partial > 0 ? `
                    <!-- Partial -->
                    <div>
                        <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: var(--space-xs);">Частично</div>
                        <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-warning);">${tactic.partial}</div>
                    </div>
                    ` : ''}
                    
                    <!-- Uncovered -->
                    <div>
                        <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: var(--space-xs);">Не покрыто</div>
                        <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-error);">${tactic.uncovered || 0}</div>
                    </div>
                </div>
            </div>
        `;
    },

    // ========================================
    // LOADING STATE
    // ========================================
    showLoadingState() {
        const container = document.getElementById('coverage');
        if (container) {
            container.innerHTML = `
                <div class="loading-spinner large">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>Загрузка данных о покрытии...</span>
                </div>
            `;
        }
    },

    // ========================================
    // EMPTY STATE
    // ========================================
    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div class="empty-state-title">Нет данных по покрытию</div>
                <div class="empty-state-description">
                    Данные о покрытии техник правилами корреляции будут отображаться здесь
                </div>
                <button class="btn btn-primary" onclick="Coverage.load()">
                    <i class="fas fa-sync-alt"></i> Повторить попытку
                </button>
            </div>
        `;
    },

    // ========================================
    // ERROR HANDLING
    // ========================================
    handleLoadError(error) {
        const container = document.getElementById('coverage');
        if (container) {
            container.innerHTML = `
                <div class="empty-state error-state">
                    <div class="empty-state-icon" style="color: var(--color-error);">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="empty-state-title">Ошибка загрузки</div>
                    <div class="empty-state-description">${error.message || error}</div>
                    <button class="btn btn-primary" onclick="Coverage.load()">
                        <i class="fas fa-redo"></i> Повторить
                    </button>
                </div>
            `;
        }
    },

    // ========================================
    // EVENT HANDLERS
    // ========================================
    setupEventHandlers() {
        // Кнопка обновления
        const refreshBtn = document.getElementById('coverageRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.load());
        }
    },

    // ========================================
    // COLOR UTILITIES
    // ========================================
    getCoverageBorderColor(percent) {
        if (percent >= this.config.coverageThresholds.excellent) {
            return '#10b981'; // green - success
        } else if (percent >= this.config.coverageThresholds.medium) {
            return '#f59e0b'; // orange - warning
        } else if (percent > 0) {
            return '#ef4444'; // red - error
        } else {
            return '#6b7280'; // gray - muted
        }
    },

    getCoverageBackgroundGradient(percent) {
        if (percent >= this.config.coverageThresholds.excellent) {
            return 'linear-gradient(135deg, var(--bg-card) 0%, rgba(16, 185, 129, 0.05) 100%)';
        } else if (percent >= this.config.coverageThresholds.medium) {
            return 'linear-gradient(135deg, var(--bg-card) 0%, rgba(245, 158, 11, 0.05) 100%)';
        } else if (percent > 0) {
            return 'linear-gradient(135deg, var(--bg-card) 0%, rgba(239, 68, 68, 0.05) 100%)';
        } else {
            return 'var(--bg-card)';
        }
    }
};

// ========================================
// EXPORT
// ========================================
window.Coverage = Coverage;

// Автозагрузка при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Coverage module initialized');
    });
} else {
    console.log('Coverage module initialized');
}
