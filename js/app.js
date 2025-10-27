/**
 * =============================================================================
 * MITRE ATT&CK Matrix v10.1 - Main Application Controller - FIXED
 * =============================================================================
 * 
 * ИСПРАВЛЕНО:
 * - Добавлено сохранение последней секции в localStorage
 * - Восстановление визуальной активации sidebar при перезагрузке
 * - Улучшена логика loadInitialSection()
 * 
 * @author Storm Labs
 * @version 10.1.1-FIXED
 * @date 2025-10-13
 */

const App = {
    // =========================================================================
    // STATE
    // =========================================================================

    state: {
        currentSection: 'dashboard',
        sidebarCollapsed: false,
        isLoading: false,
        modules: new Map()
    },

    // =========================================================================
    // CONFIG
    // =========================================================================

    config: {
        defaultSection: 'dashboard',
        mobileBreakpoint: 768,
        sidebarStorageKey: 'mitre-sidebar-collapsed',
        lastSectionKey: 'mitre-last-section' // ✅ НОВОЕ: ключ для сохранения секции
    },

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    init() {
        console.log('🚀 Initializing MITRE ATT&CK Application...');

        try {
            this.setupEventListeners();
            this.initializeUI();
            this.loadInitialSection();
            this.startPeriodicUpdates();

            console.log('✅ Application initialized successfully');
        } catch (error) {
            console.error('Application initialization error:', error);
            this.handleInitError(error);
        }
    },

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================

    setupEventListeners() {
        // Sidebar toggle (mobile)
        const navbarToggle = document.getElementById('navbarToggle');
        if (navbarToggle) {
            navbarToggle.addEventListener('click', () => this.toggleSidebar());
        }

        // Sidebar overlay (mobile)
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        }

        // Sidebar navigation links
        const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.navigateToSection(section);
            });
        });

        // Global search
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.performGlobalSearch(e.target.value);
                }
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshCurrentSection());
        }

        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportCurrentSection());
        }

        // Window resize
        window.addEventListener('resize', () => this.handleResize());

        // Browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.section) {
                this.navigateToSection(e.state.section, false);
            }
        });

        // Visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshStats();
            }
        });
    },

    // =========================================================================
    // UI INITIALIZATION
    // =========================================================================

    initializeUI() {
        // Restore sidebar state
        const sidebarCollapsed = localStorage.getItem(this.config.sidebarStorageKey);
        if (sidebarCollapsed === 'true') {
            this.collapseSidebar();
        }

        // Initialize mobile detection
        this.handleResize();

        // Show loading
        this.showLoadingOverlay('Загрузка приложения...');
    },

    // =========================================================================
    // SECTION LOADING - ИСПРАВЛЕНО!
    // =========================================================================

    async loadInitialSection() {
        try {
            // ✅ ИСПРАВЛЕНО: Приоритет загрузки секции
            // 1. Hash в URL (#statistics)
            // 2. Последняя секция из localStorage
            // 3. Секция по умолчанию (dashboard)

            const hash = window.location.hash.slice(1);
            const lastSection = localStorage.getItem(this.config.lastSectionKey);

            const initialSection = hash || lastSection || this.config.defaultSection;

            console.log('📂 Loading initial section:', {
                hash: hash || 'none',
                lastSection: lastSection || 'none',
                selected: initialSection
            });

            await this.navigateToSection(initialSection, false);

        } catch (error) {
            console.error('Failed to load initial section:', error);
            await this.navigateToSection(this.config.defaultSection, false);
        } finally {
            this.hideLoadingOverlay();
        }
    },

    // =========================================================================
    // NAVIGATION - ИСПРАВЛЕНО!
    // =========================================================================

    async navigateToSection(sectionName, updateHistory = true) {
        if (!sectionName || sectionName === this.state.currentSection) {
            return;
        }

        console.log(`📍 Navigating to section: ${sectionName}`);

        try {
            // Update URL and history
            if (updateHistory) {
                const url = `#${sectionName}`;
                window.history.pushState({ section: sectionName }, '', url);
            }

            // ✅ ИСПРАВЛЕНО: Сохраняем текущую секцию в localStorage
            localStorage.setItem(this.config.lastSectionKey, sectionName);

            // Hide current section
            this.hideAllSections();

            // Show new section
            const sectionElement = document.getElementById(sectionName);
            if (!sectionElement) {
                throw new Error(`Section "${sectionName}" not found`);
            }

            sectionElement.classList.add('active');

            // Update state
            this.state.currentSection = sectionName;

            // ✅ ИСПРАВЛЕНО: Обновляем визуальную активацию sidebar
            this.updateActiveNavigation(sectionName);

            // Close mobile sidebar
            if (this.isMobile()) {
                this.closeSidebar();
            }

            // Load section data
            await this.loadSectionData(sectionName);

            console.log(`✅ Successfully navigated to ${sectionName}`);

        } catch (error) {
            console.error(`Navigation error for section ${sectionName}:`, error);
            this.handleNavigationError(sectionName, error);
        }
    },

    // =========================================================================
    // SECTION DATA LOADING
    // =========================================================================

    async loadSectionData(sectionName) {
        try {
            this.state.isLoading = true;

            switch (sectionName) {
                case 'dashboard':
                    if (window.Dashboard) {
                        await Dashboard.load();
                    }
                    break;

                case 'techniques':
                    if (window.Techniques) {
                        await Techniques.load();
                    }
                    break;

                case 'matrix':
                    if (window.Matrix) {
                        await Matrix.load();
                    }
                    break;

                case 'rules':
                    if (window.Rules) {
                        await Rules.load();
                    }
                    break;

                case 'statistics':
                    if (window.Statistics) {
                        await Statistics.load();
                    }
                    break;

                case 'coverage':
                    if (window.Coverage) {
                        await Coverage.load();
                    }
                    break;

                case 'comments':
                    if (window.Comments) {
                        await Comments.load();
                    }
                    break;

                case 'audit':
                    if (window.Audit) {
                        await Audit.load();
                    }
                    break;

                case 'users':
                    if (window.Users) {
                        await Users.load();
                    }
                    break;

                default:
                    console.warn(`No loader defined for section: ${sectionName}`);
            }
        } catch (error) {
            console.error(`Failed to load data for section ${sectionName}:`, error);
            throw error;
        } finally {
            this.state.isLoading = false;
        }
    },

    // =========================================================================
    // SECTION VISIBILITY
    // =========================================================================

    hideAllSections() {
        const sections = document.querySelectorAll('.content-section');
        sections.forEach(section => {
            section.classList.remove('active');
        });
    },

    // =========================================================================
    // NAVIGATION UPDATE - ИСПРАВЛЕНО!
    // =========================================================================

    updateActiveNavigation(sectionName) {
        console.log(`🔄 Updating active navigation for: ${sectionName}`);

        // ✅ ИСПРАВЛЕНО: Обновляем все sidebar-link элементы
        const sidebarLinks = document.querySelectorAll('.sidebar-link');

        sidebarLinks.forEach(link => {
            // Убираем active у всех
            link.classList.remove('active');

            // Добавляем active только нужному
            if (link.dataset.section === sectionName) {
                link.classList.add('active');
                console.log(`✅ Set active: ${sectionName}`, link);
            }
        });
    },

    // =========================================================================
    // SIDEBAR CONTROLS
    // =========================================================================

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (!sidebar || !overlay) return;

        const isOpen = sidebar.classList.contains('show');

        if (isOpen) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    },

    openSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (sidebar && overlay) {
            sidebar.classList.add('show');
            overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    },

    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (sidebar && overlay) {
            sidebar.classList.remove('show');
            overlay.classList.remove('show');
            document.body.style.overflow = '';
        }
    },

    collapseSidebar() {
        console.log('Sidebar collapse not implemented yet');
    },

    // =========================================================================
    // UTILITIES
    // =========================================================================

    isMobile() {
        return window.innerWidth < this.config.mobileBreakpoint;
    },

    handleResize() {
        if (!this.isMobile()) {
            this.closeSidebar();
        }
    },

    // =========================================================================
    // SEARCH
    // =========================================================================

    performGlobalSearch(query) {
        if (!query.trim()) return;

        console.log(`🔍 Performing global search: ${query}`);

        if (query.toLowerCase().includes('technique') || query.startsWith('T')) {
            this.navigateToSection('techniques');
            if (window.Techniques) {
                setTimeout(() => Techniques.search(query), 500);
            }
        } else if (query.toLowerCase().includes('rule')) {
            this.navigateToSection('rules');
            if (window.Rules) {
                setTimeout(() => Rules.search(query), 500);
            }
        } else {
            this.navigateToSection('dashboard');
        }
    },

    // =========================================================================
    // REFRESH
    // =========================================================================

    async refreshCurrentSection() {
        console.log(`🔄 Refreshing section: ${this.state.currentSection}`);

        try {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.classList.add('fa-spin');
                    setTimeout(() => icon.classList.remove('fa-spin'), 1000);
                }
            }

            await this.loadSectionData(this.state.currentSection);
            this.refreshStats();

            if (window.Notification && Notification.success) {
                Notification.success('Данные обновлены');
            }
        } catch (error) {
            console.error('Refresh error:', error);
            if (window.Notification && Notification.error) {
                Notification.error('Ошибка обновления данных');
            }
        }
    },

    // =========================================================================
    // EXPORT
    // =========================================================================

    exportCurrentSection() {
        console.log(`📊 Exporting section: ${this.state.currentSection}`);

        switch (this.state.currentSection) {
            case 'dashboard':
                if (window.Dashboard && Dashboard.exportDashboard) {
                    Dashboard.exportDashboard();
                }
                break;

            case 'techniques':
                if (window.Techniques && Techniques.exportTechniques) {
                    Techniques.exportTechniques();
                }
                break;

            case 'statistics':
                if (window.Statistics && Statistics.exportData) {
                    Statistics.exportData('json');
                }
                break;

            default:
                if (window.Notification && Notification.info) {
                    Notification.info('Экспорт для этого раздела пока не доступен');
                }
        }
    },

    // =========================================================================
    // STATS
    // =========================================================================

    async refreshStats() {
        try {
            const stats = {
                techniques: 23,
                rules: 825
            };

            const navTechniques = document.getElementById('navTechniques');
            const navRules = document.getElementById('navRules');

            if (navTechniques) navTechniques.textContent = stats.techniques;
            if (navRules) navRules.textContent = stats.rules;

            if (this.state.currentSection === 'dashboard') {
                const statTechniques = document.getElementById('statTechniques');
                const statCovered = document.getElementById('statCovered');
                const statRules = document.getElementById('statRules');

                if (statTechniques) statTechniques.textContent = stats.techniques;
                if (statCovered) statCovered.textContent = stats.techniques;
                if (statRules) statRules.textContent = stats.rules;
            }
        } catch (error) {
            console.error('Stats refresh error:', error);
        }
    },

    // =========================================================================
    // PERIODIC UPDATES
    // =========================================================================

    startPeriodicUpdates() {
        setInterval(() => {
            if (!document.hidden) {
                this.refreshStats();
            }
        }, 300000); // 5 минут

        console.log('📊 Periodic updates started');
    },

    // =========================================================================
    // LOADING OVERLAY
    // =========================================================================

    showLoadingOverlay(message = 'Загрузка...') {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            const messageEl = overlay.querySelector('.loading-spinner span');
            if (messageEl) messageEl.textContent = message;
            overlay.classList.add('show');
        }
    },

    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    },

    // =========================================================================
    // ERROR HANDLERS
    // =========================================================================

    handleInitError(error) {
        console.error('Application initialization failed:', error);
        if (window.Notification && Notification.error) {
            Notification.error('Ошибка инициализации приложения');
        } else {
            alert('Ошибка инициализации приложения. Перезагрузите страницу.');
        }
    },

    handleNavigationError(sectionName, error) {
        console.error(`Navigation to ${sectionName} failed:`, error);

        if (sectionName !== 'dashboard') {
            this.navigateToSection('dashboard', false);
        }

        if (window.Notification && Notification.error) {
            Notification.error(`Ошибка загрузки раздела "${sectionName}"`);
        }
    }
};

// =============================================================================
// EXPORT & AUTO-INIT
// =============================================================================

window.App = App;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

console.log('✅ App module loaded');
