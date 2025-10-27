/**
 * ========================================
 * MATRIX PAGE LOADER - Главный загрузчик
 * MITRE ATT&CK Matrix Application v10.1
 * ========================================
 * 
 * Этот файл должен быть в js/pages/matrix.js
 * Он динамически загружает все модули из папки js/pages/matrix/
 * 
 * @author Storm Labs
 * @version 10.1.0
 * @date 2025-10-17
 */

(function () {
    'use strict';

    console.log('🚀 Matrix Page Loader starting...');

    // ========================================
    // КОНФИГУРАЦИЯ
    // ========================================

    const MATRIX_CONFIG = {
        basePath: '/js/pages/matrix/',
        modules: [
            'services.js',      // API взаимодействие
            'organizer.js',     // Логика данных
            'renderer.js',      // Рендеринг
            'events.js',        // События UI
            'index.js'          // Главный модуль
        ],
        dependencies: [
            'API',              // Глобальный API клиент
            'Utils',            // Утилиты
            'ModalEngine',      // Модальные окна
            'Notifications'     // Уведомления
        ],
        timeout: 30000,         // Таймаут загрузки (30 сек)
        retries: 3,             // Количество попыток
        retryDelay: 1000        // Задержка между попытками (мс)
    };

    // ========================================
    // СОСТОЯНИЕ ЗАГРУЗЧИКА
    // ========================================

    const LoaderState = {
        loadedModules: new Set(),
        loadingPromises: new Map(),
        startTime: Date.now(),
        errors: []
    };

    // ========================================
    // УТИЛИТЫ ЗАГРУЗКИ
    // ========================================

    /**
     * Загрузка одного скрипта
     * @param {string} src - Путь к скрипту
     * @param {number} attempt - Номер попытки
     */
    function loadScript(src, attempt = 1) {
        // Проверяем кэш промисов
        if (LoaderState.loadingPromises.has(src)) {
            return LoaderState.loadingPromises.get(src);
        }

        const promise = new Promise((resolve, reject) => {
            // Проверяем, не загружен ли уже скрипт
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript && LoaderState.loadedModules.has(src)) {
                console.log(`✅ Script already loaded: ${src}`);
                resolve(src);
                return;
            }

            console.log(`📥 Loading script (attempt ${attempt}): ${src}`);

            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = src;
            script.async = false; // Важно: синхронная загрузка для соблюдения порядка

            // Таймаут загрузки
            const timeoutId = setTimeout(() => {
                script.onerror();
            }, MATRIX_CONFIG.timeout);

            script.onload = () => {
                clearTimeout(timeoutId);
                LoaderState.loadedModules.add(src);
                console.log(`✅ Script loaded successfully: ${src}`);
                resolve(src);
            };

            script.onerror = async () => {
                clearTimeout(timeoutId);

                // Удаляем неудачный скрипт
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }

                // Повторная попытка
                if (attempt < MATRIX_CONFIG.retries) {
                    console.warn(`⚠️ Retrying script load (${attempt + 1}/${MATRIX_CONFIG.retries}): ${src}`);

                    // Задержка перед повтором
                    await new Promise(r => setTimeout(r, MATRIX_CONFIG.retryDelay * attempt));

                    try {
                        const result = await loadScript(src, attempt + 1);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    const error = new Error(`Failed to load script after ${MATRIX_CONFIG.retries} attempts: ${src}`);
                    LoaderState.errors.push({ src, error: error.message });
                    console.error(`❌ ${error.message}`);
                    reject(error);
                }
            };

            // Добавляем скрипт в DOM
            document.head.appendChild(script);
        });

        LoaderState.loadingPromises.set(src, promise);
        return promise;
    }

    /**
     * Загрузка всех модулей последовательно
     */
    async function loadModules() {
        console.log(`📦 Loading ${MATRIX_CONFIG.modules.length} matrix modules...`);

        const results = [];

        for (const module of MATRIX_CONFIG.modules) {
            try {
                const fullPath = MATRIX_CONFIG.basePath + module;
                const result = await loadScript(fullPath);
                results.push({ module, success: true, path: fullPath });
            } catch (error) {
                console.error(`❌ Failed to load module: ${module}`, error);
                results.push({ module, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * Проверка зависимостей
     */
    function checkDependencies() {
        console.log('🔍 Checking dependencies...');

        const missing = [];

        for (const dep of MATRIX_CONFIG.dependencies) {
            if (!window[dep]) {
                missing.push(dep);
                console.error(`❌ Missing dependency: ${dep}`);
            } else {
                console.log(`✅ Dependency available: ${dep}`);
            }
        }

        if (missing.length > 0) {
            throw new Error(`Missing required dependencies: ${missing.join(', ')}`);
        }

        console.log('✅ All dependencies available');
        return true;
    }

    /**
     * Проверка загрузки модулей
     */
    function checkModulesLoaded() {
        console.log('🔍 Checking matrix modules...');

        const requiredModules = [
            'MatrixServices',
            'MatrixOrganizer',
            'MatrixRenderer',
            'MatrixEvents',
            'MatrixPage'
        ];

        const missing = [];

        for (const moduleName of requiredModules) {
            if (!window[moduleName]) {
                missing.push(moduleName);
                console.error(`❌ Module not loaded: ${moduleName}`);
            } else {
                console.log(`✅ Module loaded: ${moduleName}`);
            }
        }

        if (missing.length > 0) {
            throw new Error(`Matrix modules not loaded: ${missing.join(', ')}`);
        }

        console.log('✅ All matrix modules loaded');
        return true;
    }

    /**
     * Отображение статуса загрузки
     */
    function showLoadingStatus(message, type = 'info') {
        const statusColors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#F44336'
        };

        console.log(`%c[Matrix Loader] ${message}`,
            `color: ${statusColors[type]}; font-weight: bold;`);
    }

    /**
     * Генерация отчета о загрузке
     */
    function generateLoadReport(results) {
        const loadTime = Date.now() - LoaderState.startTime;
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        const report = {
            totalModules: results.length,
            successful,
            failed,
            loadTime,
            errors: LoaderState.errors,
            modules: results
        };

        console.group('📊 Matrix Loader Report');
        console.log(`Total modules: ${report.totalModules}`);
        console.log(`✅ Successful: ${report.successful}`);
        console.log(`❌ Failed: ${report.failed}`);
        console.log(`⏱️ Load time: ${report.loadTime}ms`);

        if (report.errors.length > 0) {
            console.group('❌ Errors:');
            report.errors.forEach(error => {
                console.error(`- ${error.src}: ${error.error}`);
            });
            console.groupEnd();
        }

        console.groupEnd();

        return report;
    }

    // ========================================
    // ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ
    // ========================================

    /**
     * Инициализация страницы матрицы
     */
    async function initializeMatrixPage() {
        try {
            showLoadingStatus('Starting Matrix Page initialization...', 'info');

            // 1. Проверяем зависимости
            checkDependencies();

            // 2. Загружаем модули
            const results = await loadModules();

            // 3. Генерируем отчет
            const report = generateLoadReport(results);

            // 4. Проверяем успешность загрузки
            if (report.failed > 0) {
                throw new Error(`Failed to load ${report.failed} module(s)`);
            }

            // 5. Проверяем загрузку модулей
            checkModulesLoaded();

            // 6. Инициализируем MatrixPage
            if (window.MatrixPage && typeof window.MatrixPage.init === 'function') {
                showLoadingStatus('Initializing MatrixPage...', 'info');
                // MatrixPage сам инициализируется при загрузке модуля index.js
                showLoadingStatus('MatrixPage initialized successfully', 'success');
            } else {
                throw new Error('MatrixPage module not found or init method missing');
            }

            showLoadingStatus(`Matrix Page loaded successfully in ${report.loadTime}ms`, 'success');

            // Сохраняем информацию о загрузке в глобальном объекте
            window.MatrixPageLoader = {
                version: '10.1.0',
                loadTime: report.loadTime,
                modules: report.modules,
                loaded: true
            };

            return true;

        } catch (error) {
            showLoadingStatus(`Matrix Page initialization failed: ${error.message}`, 'error');
            console.error('❌ Matrix Page Loader Error:', error);

            // Показываем ошибку пользователю
            if (window.Notifications) {
                Notifications.show(
                    `Ошибка загрузки страницы матрицы: ${error.message}`,
                    'error',
                    { duration: 10000, persistent: true }
                );
            }

            throw error;
        }
    }

    // ========================================
    // АВТОЗАПУСК
    // ========================================

    /**
     * Запускаем инициализацию при загрузке DOM
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeMatrixPage().catch(error => {
                console.error('Failed to initialize Matrix Page:', error);
            });
        });
    } else {
        // DOM уже загружен
        initializeMatrixPage().catch(error => {
            console.error('Failed to initialize Matrix Page:', error);
        });
    }

    // ========================================
    // ЭКСПОРТ ДЛЯ ОТЛАДКИ
    // ========================================

    window.MatrixLoader = {
        loadScript,
        loadModules,
        checkDependencies,
        checkModulesLoaded,
        getState: () => ({ ...LoaderState }),
        reinitialize: initializeMatrixPage
    };

    console.log('✅ Matrix Page Loader module ready');

})();