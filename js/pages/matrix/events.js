/**
 * ========================================
 * MATRIX EVENTS v11.1 - С СОХРАНЕНИЕМ СКРОЛЛА
 * ========================================
 * Обработка всех событий UI матрицы
 *
 * @version 11.1.0-SCROLL-PRESERVE
 * @date 2025-10-17
 */

const MatrixEvents = {
    elements: {
        filtersContainer: null,
        matrixContainer: null,
        statisticsContainer: null,
        searchInput: null,
        platformFilter: null,
        coverageFilter: null,
        tacticFilter: null
    },

    eventHandlers: new Map(),

    /**
     * Инициализация обработчиков событий
     * @param {Object} state - Состояние матрицы
     * @param {Function} updateCallback - Колбэк для обновления
     */
    init(state, updateCallback) {
        console.log('🎯 Initializing matrix events...');

        this.state = state;
        this.updateCallback = updateCallback;

        // Получаем элементы
        this.elements = {
            filtersContainer: Utils.$('#matrix-filters-container'),
            matrixContainer: Utils.$('#matrix-container'),
            statisticsContainer: Utils.$('#matrix-statistics-container'),
            searchInput: null,
            platformFilter: null,
            coverageFilter: null,
            tacticFilter: null
        };

        // Инициализируем обработчики
        this.initFilterHandlers();
        this.initMatrixHandlers();
        this.initKeyboardHandlers();
        this.initScrollSyncHandlers();

        console.log('✅ Matrix events initialized');
    },

    /**
     * Инициализация обработчиков фильтров
     */
    initFilterHandlers() {
        const platformFilter = Utils.$('#platformFilter');
        const coverageFilter = Utils.$('#coverageFilter');
        const tacticFilter = Utils.$('#tacticFilter');
        const searchFilter = Utils.$('#searchFilter');

        if (!platformFilter || !coverageFilter || !tacticFilter || !searchFilter) {
            console.warn('⚠️ Filter elements not found, retrying...');
            setTimeout(() => this.initFilterHandlers(), 100);
            return;
        }

        // Фильтр платформ
        this.addEventHandler('platformFilter', 'change', (event) => {
            console.log('Platform filter changed:', event.target.value);
            this.state.filters.platform = event.target.value === 'all' ? null : event.target.value;
            this.updateCallback();
        });

        // Фильтр покрытия
        this.addEventHandler('coverageFilter', 'change', (event) => {
            console.log('Coverage filter changed:', event.target.value);
            this.state.filters.coverage = event.target.value;
            this.updateCallback();
        });

        // Фильтр тактики
        this.addEventHandler('tacticFilter', 'change', (event) => {
            console.log('Tactic filter changed:', event.target.value);
            this.state.filters.tactic = event.target.value === 'all' ? null : event.target.value;
            this.updateCallback();
        });

        // Поиск с debounce
        this.addEventHandler('searchFilter', 'input', Utils.debounce((event) => {
            console.log('Search filter changed:', event.target.value);
            this.state.filters.search = event.target.value.trim();
            this.updateCallback();
        }, 300));

        // Кнопка очистки поиска
        this.addEventHandler('clearSearch', 'click', () => {
            const searchInput = Utils.$('#searchFilter');
            if (searchInput) {
                searchInput.value = '';
                this.state.filters.search = '';
                this.updateCallback();
            }
        });
    },

    /**
     * Инициализация обработчиков матрицы
     */
    initMatrixHandlers() {
        // Клик на технику - открываем быстрое окно
        this.addDelegatedHandler('matrixContainer', 'click', '[data-action="show-details"]', (event, element) => {
            event.preventDefault();
            event.stopPropagation();

            const techniqueId = element.dataset.techniqueId;
            if (techniqueId) {
                this.handleTechniqueClick(techniqueId);
            }
        });

        // Раскрытие/скрытие подтехник
        this.addDelegatedHandler('matrixContainer', 'click', '[data-action="toggle-expand"]', (event, element) => {
            event.preventDefault();
            event.stopPropagation();

            const techniqueId = element.dataset.techniqueId;
            if (techniqueId) {
                this.handleExpandToggle(techniqueId);
            }
        });

        // Hover эффекты
        this.addDelegatedHandler('matrixContainer', 'mouseenter', '.matrix-cell[data-technique-id]', (event, element) => {
            element.classList.add('cell-hover');
        });

        this.addDelegatedHandler('matrixContainer', 'mouseleave', '.matrix-cell[data-technique-id]', (event, element) => {
            element.classList.remove('cell-hover');
        });
    },

    /**
     * Инициализация обработчиков клавиатуры
     */
    initKeyboardHandlers() {
        const keyboardHandler = (event) => {
            // Игнорируем, если фокус в input
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (event.key) {
                case '/':
                    event.preventDefault();
                    const searchInput = Utils.$('#searchFilter');
                    if (searchInput) {
                        searchInput.focus();
                    }
                    break;

                case 'Escape':
                case 'Esc':
                    const activeSearch = Utils.$('#searchFilter');
                    if (activeSearch && activeSearch === document.activeElement) {
                        activeSearch.blur();
                        if (activeSearch.value) {
                            activeSearch.value = '';
                            this.state.filters.search = '';
                            this.updateCallback();
                        }
                    }
                    break;

                case 'r':
                case 'R':
                    if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        this.resetFilters();
                    }
                    break;
            }
        };

        document.addEventListener('keydown', keyboardHandler);
        this.eventHandlers.set('globalKeyboard', keyboardHandler);
    },

    /**
     * Инициализация синхронизации прокрутки
     */
    initScrollSyncHandlers() {
        const matrixScroll = Utils.$('.matrix-scroll-container');
        if (!matrixScroll) return;

        let isScrolling = false;

        const scrollHandler = Utils.throttle(() => {
            if (!isScrolling) {
                isScrolling = true;
                requestAnimationFrame(() => {
                    isScrolling = false;
                });
            }
        }, 16); // 60 FPS

        matrixScroll.addEventListener('scroll', scrollHandler);
        this.eventHandlers.set('matrixScroll', scrollHandler);
    },

    /**
     * Обработчик клика на технику
     * @param {string} techniqueId - ID техники
     */
    async handleTechniqueClick(techniqueId) {
        console.log('🎯 Technique clicked:', techniqueId);

        try {
            // Используем матричное модальное окно
            if (window.MatrixServices && MatrixServices.showMatrixQuickView) {
                await MatrixServices.showMatrixQuickView(techniqueId);
            } else {
                // Fallback
                console.warn('⚠️ MatrixServices.showMatrixQuickView not available, using fallback');
                const loadingModalId = ModalEngine.loading(`Загрузка ${techniqueId}...`);
                const fullData = await MatrixServices.fetchTechniqueFullData(techniqueId);
                ModalEngine.close(loadingModalId);

                if (!fullData.technique) {
                    throw new Error(`Техника ${techniqueId} не найдена`);
                }

                if (window.TechniqueModal) {
                    TechniqueModal.view(fullData.technique);
                } else {
                    ModalEngine.alert('Модальные окна не загружены', 'Ошибка');
                }
            }
        } catch (error) {
            console.error('❌ Error loading technique:', techniqueId, error);

            try {
                ModalEngine.closeAll();
            } catch (e) {
                // Игнорируем ошибки закрытия
            }

            if (window.Notifications) {
                Notifications.show(
                    `Ошибка загрузки техники ${techniqueId}: ${error.message}`,
                    'error',
                    { duration: 5000 }
                );
            }
        }
    },

    /**
     * 🔧 ИСПРАВЛЕНО: Обработчик раскрытия/скрытия подтехник
     * Сохраняет позицию скролла при обновлении
     * @param {string} techniqueId - ID техники
     */
    handleExpandToggle(techniqueId) {
        console.log('🔄 Toggle expand:', techniqueId);

        // 🔧 СОХРАНЯЕМ ПОЗИЦИЮ СКРОЛЛА
        const scrollContainer = document.querySelector('.matrix-scroll-container');
        const topScrollbar = document.querySelector('.matrix-top-scrollbar-wrapper');

        const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
        const savedScrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;

        console.log('💾 Saving scroll position:', { top: savedScrollTop, left: savedScrollLeft });

        // Переключаем состояние
        const isExpanded = this.state.expandedTechniques.has(techniqueId);

        if (isExpanded) {
            this.state.expandedTechniques.delete(techniqueId);
        } else {
            this.state.expandedTechniques.add(techniqueId);
        }

        // Обновляем матрицу
        this.updateCallback();

        // 🔧 ВОССТАНАВЛИВАЕМ ПОЗИЦИЮ СКРОЛЛА ПОСЛЕ РЕНДЕРА
        requestAnimationFrame(() => {
            if (scrollContainer) {
                scrollContainer.scrollTop = savedScrollTop;
                scrollContainer.scrollLeft = savedScrollLeft;
                console.log('✅ Restored scroll position:', { top: savedScrollTop, left: savedScrollLeft });
            }

            if (topScrollbar) {
                topScrollbar.scrollLeft = savedScrollLeft;
            }
        });
    },

    /**
     * Сброс всех фильтров
     */
    resetFilters() {
        console.log('Resetting all filters');

        // Сбрасываем состояние
        this.state.filters = {
            platform: null,
            coverage: 'all',
            tactic: null,
            search: ''
        };

        // Обновляем UI фильтров
        const platformFilter = Utils.$('#platformFilter');
        const coverageFilter = Utils.$('#coverageFilter');
        const tacticFilter = Utils.$('#tacticFilter');
        const searchFilter = Utils.$('#searchFilter');

        if (platformFilter) platformFilter.value = 'all';
        if (coverageFilter) coverageFilter.value = 'all';
        if (tacticFilter) tacticFilter.value = 'all';
        if (searchFilter) searchFilter.value = '';

        // Обновляем матрицу
        this.updateCallback();

        // Показываем уведомление
        if (window.Notifications) {
            Notifications.show('Фильтры сброшены', 'info', { duration: 2000 });
        }
    },

    /**
     * Экспорт матрицы
     * @param {string} format - Формат экспорта
     */
    async exportMatrix(format = 'json') {
        console.log('Exporting matrix:', format);

        try {
            if (window.Notifications) {
                Notifications.show(`Экспорт в ${format.toUpperCase()}...`, 'info');
            }

            await MatrixServices.exportMatrix(format);

            if (window.Notifications) {
                Notifications.show(`Матрица экспортирована в ${format.toUpperCase()}`, 'success', { duration: 3000 });
            }
        } catch (error) {
            console.error('Export error:', error);

            if (window.Notifications) {
                Notifications.show(`Ошибка экспорта: ${error.message}`, 'error', { duration: 5000 });
            }
        }
    },

    /**
     * Добавление обработчика события
     */
    addEventHandler(elementId, eventType, handler) {
        const attachHandler = () => {
            const element = Utils.$(`#${elementId}`);
            if (element) {
                element.addEventListener(eventType, handler);
                const key = `${elementId}:${eventType}`;
                this.eventHandlers.set(key, {
                    element: element,
                    eventType: eventType,
                    handler: handler
                });
                return true;
            }
            return false;
        };

        if (!attachHandler()) {
            setTimeout(attachHandler, 100);
        }
    },

    /**
     * Добавление делегированного обработчика
     */
    addDelegatedHandler(containerId, eventType, selector, handler) {
        const container = this.elements[containerId] || Utils.$(`#${containerId}`);
        if (!container) {
            console.warn('Container not found:', containerId);
            return;
        }

        const delegatedHandler = (event) => {
            const targetElement = event.target.closest(selector);
            if (targetElement) {
                handler(event, targetElement);
            }
        };

        container.addEventListener(eventType, delegatedHandler);
        const key = `${containerId}:${eventType}:${selector}`;
        this.eventHandlers.set(key, {
            element: container,
            eventType: eventType,
            handler: delegatedHandler
        });
    },

    /**
     * Очистка всех обработчиков
     */
    cleanup() {
        console.log('🧹 Cleaning up matrix events...');

        this.eventHandlers.forEach((handlerInfo, key) => {
            if (handlerInfo.element && handlerInfo.handler) {
                handlerInfo.element.removeEventListener(handlerInfo.eventType, handlerInfo.handler);
            }
        });

        this.eventHandlers.clear();
        console.log('✅ Matrix events cleaned up');
    }
};

// Экспорт
window.MatrixEvents = MatrixEvents;
console.log('✅ Matrix Events v11.1 (with scroll preservation) loaded');
