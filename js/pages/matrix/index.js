/**
 * ========================================
 * MATRIX PAGE v11.0 - ПОЛНОСТЬЮ ИСПРАВЛЕН
 * MITRE ATT&CK Matrix Application
 * ========================================
 * 
 * Основная точка входа для страницы матрицы
 * Исправлен вызов методов MatrixOrganizer
 * 
 * @author Storm Labs
 * @version 11.0.0-FIXED
 * @date 2025-10-17
 */

const MatrixPage = {
    // ========================================
    // КОНФИГУРАЦИЯ
    // ========================================
    config: {
        version: '11.0.0',
        refreshInterval: 5 * 60 * 1000, // 5 минут
        autoRefresh: false,
        maxRetries: 3,
        retryDelay: 1000
    },

    // ========================================
    // СОСТОЯНИЕ ПРИЛОЖЕНИЯ
    // ========================================
    state: {
        // Данные
        matrixData: null,
        organizedData: null,

        // Фильтры
        filters: {
            platform: null,
            coverage: 'all',
            tactic: null,
            search: ''
        },

        // UI состояние
        expandedTechniques: new Set(),
        loading: false,
        error: null,

        // Метаданные
        lastUpdate: null,
        initialized: false
    },

    // Таймер для автообновления
    refreshTimer: null,

    // ========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ========================================

    /**
     * Главная функция инициализации
     */
    async init() {
        console.log(`🚀 Initializing Matrix Page v${this.config.version}...`);

        try {
            // Проверяем зависимости
            this.checkDependencies();

            // Инициализируем уведомления
            if (window.Notifications && !Notifications.container) {
                Notifications.init();
            }

            // Показываем состояние загрузки
            this.showLoading();

            // Загружаем данные матрицы
            await this.loadMatrixData();

            // 🔧 ИСПРАВЛЕНО: Организуем данные сразу после загрузки
            this.organizeMatrixData();

            // Инициализируем UI
            this.initializeUI();

            // Инициализируем обработчики событий
            this.initializeEvents();

            // Первый рендер
            this.render();

            // Запускаем автообновление если включено
            if (this.config.autoRefresh) {
                this.startAutoRefresh();
            }

            // Отмечаем как инициализированное
            this.state.initialized = true;
            this.state.lastUpdate = new Date();

            console.log('✅ Matrix Page initialized successfully');

            // Уведомление об успешной загрузке
            if (window.Notifications) {
                Notifications.show(
                    'Матрица MITRE ATT&CK загружена успешно',
                    'success',
                    { duration: 3000 }
                );
            }

        } catch (error) {
            console.error('❌ Matrix Page initialization failed:', error);
            this.handleError(error);
        }
    },

    /**
     * Проверка зависимостей
     */
    checkDependencies() {
        const requiredModules = [
            'API', 'Utils', 'ModalEngine',
            'MatrixServices', 'MatrixOrganizer',
            'MatrixRenderer', 'MatrixEvents'
        ];

        const missingModules = requiredModules.filter(module => !window[module]);

        if (missingModules.length > 0) {
            throw new Error(`Missing required modules: ${missingModules.join(', ')}`);
        }

        console.log('✅ All dependencies available');
    },

    // ========================================
    // ЗАГРУЗКА ДАННЫХ
    // ========================================

    /**
     * Загрузка данных матрицы
     */
    async loadMatrixData() {
        console.log('📡 Loading matrix data...');
        this.state.loading = true;
        this.state.error = null;

        let retryCount = 0;

        while (retryCount < this.config.maxRetries) {
            try {
                this.state.matrixData = await MatrixServices.fetchMatrix();

                console.log('✅ Matrix data loaded:', {
                    tactics: this.state.matrixData.tactics?.length || 0,
                    techniques: this.state.matrixData.techniques?.length || 0,
                    parent_techniques: this.state.matrixData.parent_techniques?.length || 0,
                    statistics: this.state.matrixData.statistics ? 'available' : 'unavailable'
                });

                this.state.loading = false;
                return;

            } catch (error) {
                retryCount++;
                console.warn(`❌ Load attempt ${retryCount} failed:`, error.message);

                if (retryCount >= this.config.maxRetries) {
                    throw error;
                }

                // Ждем перед повтором
                await Utils.sleep(this.config.retryDelay * retryCount);
            }
        }
    },

    /**
     * 🔧 ИСПРАВЛЕНО: Организация данных матрицы
     */
    organizeMatrixData() {
        if (!this.state.matrixData) {
            throw new Error('No matrix data to organize');
        }

        console.log('🗂️ Organizing matrix data...');

        // 🔧 ИСПРАВЛЕНО: Используем правильный метод organizeMatrix
        this.state.organizedData = MatrixOrganizer.organizeMatrix(
            this.state.matrixData,
            this.state.filters
        );

        console.log('✅ Matrix data organized:', {
            rows: this.state.organizedData.rows?.length || 0,
            tactics: this.state.organizedData.tactics?.length || 0,
            filteredCount: this.state.organizedData.filteredCount || 0
        });
    },

    // ========================================
    // ИНИЦИАЛИЗАЦИЯ UI
    // ========================================

    /**
     * Инициализация пользовательского интерфейса
     */
    initializeUI() {
        console.log('🎨 Initializing UI...');

        // Получаем контейнеры
        const filtersContainer = Utils.$('#matrix-filters-container') || this.createFiltersContainer();
        const matrixContainer = Utils.$('#matrix-container') || this.createMatrixContainer();
        const statisticsContainer = Utils.$('#matrix-statistics-container') || this.createStatisticsContainer();

        // Проверяем наличие контейнеров
        if (!filtersContainer || !matrixContainer) {
            throw new Error('Required UI containers not found');
        }

        // Рендерим фильтры
        MatrixRenderer.renderFilters(
            filtersContainer,
            this.state.organizedData.tactics,
            this.state.filters
        );

        // Рендерим статистику (если есть контейнер и данные)
        if (statisticsContainer && this.state.matrixData.statistics) {
            MatrixRenderer.renderStatistics(
                statisticsContainer,
                this.state.matrixData.statistics
            );
        }

        console.log('✅ UI initialized');
    },

    /**
     * Создание контейнера фильтров (если не существует)
     */
    createFiltersContainer() {
        const container = Utils.createElement('div', 'matrix-filters-wrapper');
        container.id = 'matrix-filters-container';
        const pageContent = Utils.$('.page-content') || Utils.$('main') || document.body;
        pageContent.insertBefore(container, pageContent.firstChild);
        return container;
    },

    /**
     * Создание основного контейнера матрицы (если не существует)
     */
    createMatrixContainer() {
        const container = Utils.createElement('div', 'matrix-main-container');
        container.id = 'matrix-container';
        const pageContent = Utils.$('.page-content') || Utils.$('main') || document.body;
        pageContent.appendChild(container);
        return container;
    },

    /**
     * Создание контейнера статистики (если не существует)
     */
    createStatisticsContainer() {
        const container = Utils.createElement('div', 'matrix-statistics-wrapper');
        container.id = 'matrix-statistics-container';
        const filtersContainer = Utils.$('#matrix-filters-container');

        if (filtersContainer && filtersContainer.parentNode) {
            filtersContainer.parentNode.insertBefore(container, filtersContainer.nextSibling);
        }

        return container;
    },

    /**
     * Инициализация обработчиков событий
     */
    initializeEvents() {
        console.log('🎮 Initializing events...');
        MatrixEvents.init(this.state, () => this.render());
        console.log('✅ Events initialized');
    },

    // ========================================
    // РЕНДЕРИНГ
    // ========================================

    /**
     * Показ состояния загрузки
     */
    showLoading() {
        const matrixContainer = Utils.$('#matrix-container');
        if (matrixContainer) {
            MatrixRenderer.renderLoading(matrixContainer);
        }
    },

    /**
     * 🔧 ИСПРАВЛЕНО: Основная функция рендеринга
     */
    render() {
        if (!this.state.organizedData) {
            console.warn('⚠️ No organized data available for rendering');
            return;
        }

        console.log('🎨 Rendering matrix...');

        try {
            // 🔧 ИСПРАВЛЕНО: Реорганизуем данные с текущими фильтрами
            const organizedData = MatrixOrganizer.organizeMatrix(
                this.state.matrixData,
                this.state.filters
            );

            // Обновляем состояние
            this.state.organizedData = organizedData;

            // Рендерим матрицу
            const matrixContainer = Utils.$('#matrix-container');
            if (matrixContainer) {
                MatrixRenderer.renderMatrix(
                    matrixContainer,
                    organizedData,
                    this.state.expandedTechniques
                );
            }

            // Обновляем статистику фильтров
            this.updateFilterStatistics(organizedData.filteredCount, organizedData.totalCount);

            console.log(`✅ Matrix rendered: ${organizedData.rows.length} rows, ${organizedData.filteredCount} techniques`);

        } catch (error) {
            console.error('❌ Render error:', error);
            this.handleError(error);
        }
    },

    /**
     * Обновление статистики фильтров
     * @param {number} filteredCount - Количество отфильтрованных техник
     * @param {number} totalCount - Общее количество техник
     */
    updateFilterStatistics(filteredCount, totalCount) {
        // Обновляем индикатор в UI (если есть)
        let filterStats = Utils.$('.filter-stats');

        if (filterStats) {
            filterStats.textContent = `Показано: ${filteredCount} из ${totalCount} техник`;
        } else if (filteredCount !== totalCount) {
            // Добавляем индикатор если его нет
            const filtersContainer = Utils.$('#matrix-filters-container');
            if (filtersContainer) {
                filterStats = Utils.createElement('div', 'filter-stats',
                    `Показано: ${filteredCount} из ${totalCount} техник`
                );
                filtersContainer.appendChild(filterStats);
            }
        }
    },

    // ========================================
    // ОБРАБОТКА ОШИБОК
    // ========================================

    /**
     * Обработка ошибок
     * @param {Error} error - Ошибка
     */
    handleError(error) {
        console.error('❌ Matrix Page Error:', error);
        this.state.error = error;
        this.state.loading = false;

        // Показываем ошибку в UI
        const matrixContainer = Utils.$('#matrix-container');
        if (matrixContainer) {
            MatrixRenderer.renderError(matrixContainer, error.message);
        }

        // Показываем уведомление об ошибке
        if (window.Notifications) {
            Notifications.show(
                `Ошибка матрицы: ${error.message}`,
                'error',
                { duration: 10000, persistent: false }
            );
        }
    },

    // ========================================
    // АВТООБНОВЛЕНИЕ
    // ========================================

    /**
     * Запуск автообновления
     */
    startAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        this.refreshTimer = setInterval(() => {
            this.refresh();
        }, this.config.refreshInterval);

        console.log(`🔄 Auto-refresh started (${this.config.refreshInterval / 1000}s interval)`);
    },

    /**
     * Остановка автообновления
     */
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            console.log('⏹️ Auto-refresh stopped');
        }
    },

    /**
     * Обновление данных матрицы
     */
    async refresh() {
        console.log('🔄 Refreshing matrix data...');

        try {
            await this.loadMatrixData();
            this.organizeMatrixData();
            this.render();
            this.state.lastUpdate = new Date();

            console.log('✅ Matrix data refreshed');

            if (window.Notifications) {
                Notifications.show(
                    'Данные матрицы обновлены',
                    'info',
                    { duration: 2000 }
                );
            }

        } catch (error) {
            console.error('❌ Refresh failed:', error);

            if (window.Notifications) {
                Notifications.show(
                    'Не удалось обновить данные матрицы',
                    'warning',
                    { duration: 5000 }
                );
            }
        }
    },

    // ========================================
    // УПРАВЛЕНИЕ ЖИЗНЕННЫМ ЦИКЛОМ
    // ========================================

    /**
     * Очистка и освобождение ресурсов
     */
    cleanup() {
        console.log('🧹 Cleaning up Matrix Page...');

        // Останавливаем автообновление
        this.stopAutoRefresh();

        // Очищаем обработчики событий
        if (window.MatrixEvents) {
            MatrixEvents.cleanup();
        }

        // Сбрасываем состояние
        this.state = {
            matrixData: null,
            organizedData: null,
            filters: {
                platform: null,
                coverage: 'all',
                tactic: null,
                search: ''
            },
            expandedTechniques: new Set(),
            loading: false,
            error: null,
            lastUpdate: null,
            initialized: false
        };

        console.log('✅ Matrix Page cleaned up');
    },

    // ========================================
    // ПУБЛИЧНЫЕ МЕТОДЫ
    // ========================================

    /**
     * Получение текущего состояния
     */
    getState() {
        return { ...this.state };
    },

    /**
     * Проверка готовности
     */
    isReady() {
        return this.state.initialized && !this.state.loading && !this.state.error;
    },

    /**
     * Экспорт матрицы
     * @param {string} format - Формат экспорта
     */
    async exportMatrix(format = 'json') {
        if (window.MatrixEvents) {
            return MatrixEvents.exportMatrix(format);
        }

        throw new Error('MatrixEvents not available');
    }
};

// ========================================
// АВТОЗАПУСК
// ========================================

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        MatrixPage.init();
    });
} else {
    // DOM уже загружен
    MatrixPage.init();
}

// Экспорт в глобальную область видимости
window.MatrixPage = MatrixPage;

// Экспорт модуля для совместимости
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MatrixPage;
}

console.log('✅ Matrix Page v11.0 module loaded');
