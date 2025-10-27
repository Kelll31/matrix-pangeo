/**
 * ========================================
 * TECHNIQUES PAGE
 * js/pages/techniques.js
 * MITRE ATT&CK Matrix Application v10.1
 * ========================================
 *
 * Страница управления техниками MITRE ATT&CK.
 * Использует модальные окна из js/modals:
 * - TechniqueModal (из modal_technique.js)
 *
 * @author Storm Labs
 * @version 1.1.0-FIXED
 * @date 2025-10-15
 */

const Techniques = {
    // STATE
    state: {
        techniques: [],
        filteredTechniques: [],
        currentPage: 1,
        perPage: 20,
        totalPages: 0,
        totalTechniques: 0,
        isLoading: false,
        currentFilter: {
            search: '',
            tactic: 'all',
            platform: 'all'
        },
        searchTimeout: null
    },

    // DOM ELEMENTS
    elements: {
        container: null,
        searchInput: null,
        tacticFilter: null,
        platformFilter: null
    },

    /**
     * Initialize techniques module
     */
    async load() {
        console.log('🛡️ Loading Techniques module v1.1-FIXED...');

        try {
            this.state.isLoading = true;

            // Get container
            this.elements.container = document.getElementById('techniques');
            if (!this.elements.container) {
                throw new Error('Techniques container not found');
            }

            this.showLoadingState();

            // Load techniques from API
            await this.loadTechniques();

            // Render techniques
            this.renderTechniques();

            console.log('✅ Techniques loaded successfully');

        } catch (error) {
            console.error('Techniques load error:', error);
            this.handleLoadError(error);
        } finally {
            this.state.isLoading = false;
        }
    },

    /**
     * Load techniques from API
     */
    async loadTechniques() {
        try {
            const params = {
                limit: 10000 // Get all techniques for client-side filtering
            };

            const response = await API.get('/techniques/', params);

            if (response && response.success && response.data) {
                this.state.techniques = response.data.techniques || response.data || [];
                this.state.filteredTechniques = [...this.state.techniques];
                this.updatePagination();

                console.log(`🛡️ Loaded ${this.state.techniques.length} techniques`);
            } else {
                throw new Error('Invalid techniques data received');
            }
        } catch (error) {
            console.error('Failed to load techniques:', error);
            throw error;
        }
    },

    /**
     * Apply all filters
     */
    applyFilters() {
        let filtered = [...this.state.techniques];

        console.log('Applying filters:', this.state.currentFilter);

        // Search filter
        if (this.state.currentFilter.search) {
            const searchLower = this.state.currentFilter.search.toLowerCase();
            filtered = filtered.filter(tech =>
                (tech.name && tech.name.toLowerCase().includes(searchLower)) ||
                (tech.attack_id && tech.attack_id.toLowerCase().includes(searchLower)) ||
                (tech.description && tech.description.toLowerCase().includes(searchLower))
            );
        }

        // Tactic filter
        if (this.state.currentFilter.tactic !== 'all') {
            filtered = filtered.filter(tech => {
                if (!tech.tactics) return false;
                const tactics = Array.isArray(tech.tactics) ? tech.tactics : [tech.tactics];
                return tactics.some(t => {
                    if (!t) return false;
                    const tacticLower = t.toLowerCase().replace(/\s+/g, '-');
                    const filterLower = this.state.currentFilter.tactic.toLowerCase();
                    return tacticLower === filterLower || t.toLowerCase().includes(filterLower);
                });
            });
        }

        // Platform filter
        if (this.state.currentFilter.platform !== 'all') {
            filtered = filtered.filter(tech => {
                if (!tech.platforms) return false;
                const platforms = Array.isArray(tech.platforms) ? tech.platforms : [tech.platforms];
                return platforms.some(p => p && p.toLowerCase() === this.state.currentFilter.platform.toLowerCase());
            });
        }

        console.log(`Filtered: ${this.state.techniques.length} → ${filtered.length} techniques`);

        this.state.filteredTechniques = filtered;
        this.state.currentPage = 1;
        this.updatePagination();
        this.renderTechniques();
    },

    /**
     * Setup search functionality
     */
    setupSearch() {
        const searchInput = document.getElementById('techniquesSearchInput');
        if (!searchInput) return;

        this.elements.searchInput = searchInput;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(this.state.searchTimeout);
            this.state.searchTimeout = setTimeout(() => {
                this.state.currentFilter.search = e.target.value;
                console.log('Search changed to:', this.state.currentFilter.search);
                this.applyFilters();
            }, 300);
        });
    },

    /**
     * Setup filter controls
     */
    setupFilters() {
        // Tactic filter
        const tacticFilter = document.getElementById('techniquesTacticFilter');
        if (tacticFilter) {
            this.elements.tacticFilter = tacticFilter;
            tacticFilter.value = this.state.currentFilter.tactic;
            tacticFilter.addEventListener('change', (e) => {
                this.state.currentFilter.tactic = e.target.value;
                console.log('Tactic filter changed to:', e.target.value);
                this.applyFilters();
            });
        }

        // Platform filter
        const platformFilter = document.getElementById('techniquesPlatformFilter');
        if (platformFilter) {
            this.elements.platformFilter = platformFilter;
            platformFilter.value = this.state.currentFilter.platform;
            platformFilter.addEventListener('change', (e) => {
                this.state.currentFilter.platform = e.target.value;
                console.log('Platform filter changed to:', e.target.value);
                this.applyFilters();
            });
        }

        // Reset filters button
        const resetBtn = document.getElementById('techniquesResetFilters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetFilters());
        }
    },

    /**
     * Reset all filters
     */
    resetFilters() {
        this.state.currentFilter = {
            search: '',
            tactic: 'all',
            platform: 'all'
        };

        if (this.elements.searchInput) this.elements.searchInput.value = '';
        if (this.elements.tacticFilter) this.elements.tacticFilter.value = 'all';
        if (this.elements.platformFilter) this.elements.platformFilter.value = 'all';

        this.applyFilters();

        if (window.Notifications) {
            Notifications.info('Фильтры сброшены');
        }
    },

    /**
     * Update pagination state
     */
    updatePagination() {
        this.state.totalTechniques = this.state.filteredTechniques.length;
        this.state.totalPages = Math.ceil(this.state.totalTechniques / this.state.perPage);

        if (this.state.currentPage > this.state.totalPages && this.state.totalPages > 0) {
            this.state.currentPage = this.state.totalPages;
        } else if (this.state.currentPage < 1) {
            this.state.currentPage = 1;
        }
    },

    /**
     * Render techniques list
     */
    renderTechniques() {
        const container = this.elements.container;
        if (!container) return;

        const startIdx = (this.state.currentPage - 1) * this.state.perPage;
        const endIdx = startIdx + this.state.perPage;
        const techniquesPage = this.state.filteredTechniques.slice(startIdx, endIdx);

        let html = `
      <div class="rules-wrapper">
        <!-- Filters Bar -->
        <div class="rules-filters">
          <div class="filter-group">
            <input type="text" id="techniquesSearchInput" class="form-input" 
                   placeholder="Поиск техник..." value="${Utils.escapeHtml(this.state.currentFilter.search)}">
          </div>

          <div class="filter-group">
            <select id="techniquesTacticFilter" class="form-select">
              <option value="all">Все тактики</option>
              <option value="initial-access">Initial Access</option>
              <option value="execution">Execution</option>
              <option value="persistence">Persistence</option>
              <option value="privilege-escalation">Privilege Escalation</option>
              <option value="defense-evasion">Defense Evasion</option>
              <option value="credential-access">Credential Access</option>
              <option value="discovery">Discovery</option>
              <option value="lateral-movement">Lateral Movement</option>
              <option value="collection">Collection</option>
              <option value="command-and-control">Command and Control</option>
              <option value="exfiltration">Exfiltration</option>
              <option value="impact">Impact</option>
            </select>
          </div>

          <div class="filter-group">
            <select id="techniquesPlatformFilter" class="form-select">
              <option value="all">Все платформы</option>
              <option value="windows">Windows</option>
              <option value="linux">Linux</option>
              <option value="macos">macOS</option>
              <option value="cloud">Cloud</option>
              <option value="network">Network</option>
            </select>
          </div>

          <button id="techniquesResetFilters" class="btn btn-secondary">
            <i class="fas fa-times"></i> Сбросить
          </button>
        </div>

        <!-- Techniques Stats -->
        <div class="rules-stats">
          <span>Показано ${startIdx + 1}-${Math.min(endIdx, this.state.totalTechniques)} из ${this.state.totalTechniques}</span>
        </div>

        <!-- Techniques List -->
        <div class="rules-list">
          ${techniquesPage.length > 0 ? techniquesPage.map(tech => this.renderTechniqueCard(tech)).join('') : this.renderEmptyState()}
        </div>

        <!-- Pagination -->
        ${this.state.totalPages > 1 ? this.renderPagination() : ''}
      </div>
    `;

        container.innerHTML = html;

        // ВАЖНО: Re-setup filters AFTER rendering
        this.setupSearch();
        this.setupFilters();
    },

    /**
     * Render single technique card
     */
    renderTechniqueCard(tech) {
        const attackId = tech.attack_id || tech.id || 'N/A';
        const tactics = Array.isArray(tech.tactics) ? tech.tactics : (tech.tactics ? [tech.tactics] : []);
        const platforms = Array.isArray(tech.platforms) ? tech.platforms : (tech.platforms ? [tech.platforms] : []);

        return `
      <div class="rule-card" data-technique-id="${Utils.escapeHtml(attackId)}">
        <div class="rule-card-header">
          <div class="rule-card-title">
            <h3>${Utils.escapeHtml(attackId)} - ${Utils.escapeHtml(tech.name || 'Unnamed')}</h3>
            <div class="rule-badges">
              ${tactics.slice(0, 2).map(t => `<span class="badge badge-info">${Utils.escapeHtml(t)}</span>`).join('')}
              ${platforms.slice(0, 2).map(p => `<span class="badge badge-secondary">${Utils.escapeHtml(p)}</span>`).join('')}
            </div>
          </div>
          <div class="rule-card-actions">
            <button class="btn btn-icon btn-view-tech" data-tech-id="${Utils.escapeHtml(attackId)}" title="Просмотр">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-icon btn-edit-tech" data-tech-id="${Utils.escapeHtml(attackId)}" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </div>

        <div class="rule-card-body">
          ${tech.description ? `
            <div class="technique-description">
              ${Utils.escapeHtml(tech.description.substring(0, 150))}${tech.description.length > 150 ? '...' : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
    },

    /**
     * Render pagination
     */
    renderPagination() {
        const { currentPage, totalPages } = this.state;
        let pages = [];

        pages.push(1);
        for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++) {
            pages.push(i);
        }
        if (totalPages > 1) {
            pages.push(totalPages);
        }

        pages = [...new Set(pages)].sort((a, b) => a - b);

        let html = '<div class="pagination">';
        html += `<button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" data-page="${currentPage - 1}"><i class="fas fa-chevron-left"></i></button>`;

        let lastPage = 0;
        pages.forEach(page => {
            if (page - lastPage > 1) {
                html += '<span class="pagination-ellipsis">...</span>';
            }
            html += `<button class="pagination-btn ${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`;
            lastPage = page;
        });

        html += `<button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}"><i class="fas fa-chevron-right"></i></button>`;
        html += '</div>';

        // Setup pagination click handlers using event delegation
        setTimeout(() => {
            const pagination = this.elements.container.querySelector('.pagination');
            if (pagination) {
                pagination.addEventListener('click', (e) => {
                    const btn = e.target.closest('.pagination-btn');
                    if (btn && !btn.classList.contains('disabled')) {
                        const page = parseInt(btn.dataset.page);
                        if (page) {
                            this.goToPage(page);
                        }
                    }
                });
            }
        }, 0);

        return html;
    },

    /**
     * Render empty state
     */
    renderEmptyState() {
        return `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i class="fas fa-shield-alt"></i>
        </div>
        <div class="empty-state-title">Техники не найдены</div>
        <div class="empty-state-description">
          Попробуйте изменить параметры фильтрации
        </div>
      </div>
    `;
    },

    /**
     * Go to specific page
     */
    goToPage(page) {
        if (page < 1 || page > this.state.totalPages) return;
        this.state.currentPage = page;
        this.renderTechniques();
        if (this.elements.container) {
            this.elements.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    /**
     * View technique details
     */
    async viewTechnique(techId) {
        console.log(`👁️ Viewing technique: ${techId}`);

        try {
            const response = await API.get(`/techniques/${techId}`);
            if (response && response.success && response.data) {
                const tech = response.data.technique || response.data;

                // ИСПРАВЛЕНО: Используем TechniqueModal из modal_technique.js
                if (typeof TechniqueModal !== 'undefined') {
                    TechniqueModal.view(tech, {
                        onEdit: (t) => this.editTechnique(t.attack_id || t.id)
                    });
                } else {
                    console.error('TechniqueModal not loaded');
                    if (window.Notifications) {
                        Notifications.error('Модуль TechniqueModal не загружен');
                    }
                }
            } else {
                throw new Error('Technique not found');
            }
        } catch (error) {
            console.error('Failed to load technique:', error);
            if (window.Notifications) {
                Notifications.error('Ошибка загрузки техники');
            }
        }
    },

    /**
     * Edit technique
     */
    async editTechnique(techId) {
        console.log(`✏️ Editing technique: ${techId}`);

        try {
            const response = await API.get(`/techniques/${techId}`);
            if (response && response.success && response.data) {
                const tech = response.data.technique || response.data;

                // ИСПРАВЛЕНО: Используем TechniqueModal из modal_technique.js
                if (typeof TechniqueModal !== 'undefined') {
                    TechniqueModal.edit(tech, {
                        onSuccess: () => this.load()
                    });
                } else {
                    console.error('TechniqueModal not loaded');
                    if (window.Notifications) {
                        Notifications.error('Модуль TechniqueModal не загружен');
                    }
                }
            } else {
                throw new Error('Technique not found');
            }
        } catch (error) {
            console.error('Failed to load technique:', error);
            if (window.Notifications) {
                Notifications.error('Ошибка загрузки техники');
            }
        }
    },

    /**
     * Refresh techniques
     */
    async refresh() {
        console.log('🔄 Refreshing techniques...');
        await this.load();
        if (window.Notifications) {
            Notifications.success('Техники обновлены');
        }
    },

    // UI STATE METHODS
    showLoadingState() {
        const container = this.elements.container;
        if (container) {
            container.innerHTML = `
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Загрузка техник...</span>
        </div>
      `;
        }
    },

    handleLoadError(error) {
        const container = this.elements.container;
        if (container) {
            container.innerHTML = `
        <div class="empty-state error-state">
          <div class="empty-state-icon">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div class="empty-state-title">Ошибка загрузки техник</div>
          <div class="empty-state-description">
            ${Utils.escapeHtml(error.message || 'Произошла ошибка при загрузке данных')}
          </div>
          <button class="btn btn-primary" onclick="Techniques.load()">
            <i class="fas fa-redo"></i> Попробовать снова
          </button>
        </div>
      `;
        }

        if (window.Notifications) {
            Notifications.error('Ошибка загрузки техник');
        }
    }
};

// ИСПРАВЛЕНО: Event delegation для кнопок просмотра/редактирования
document.addEventListener('click', (e) => {
    // View button
    if (e.target.closest('.btn-view-tech')) {
        const btn = e.target.closest('.btn-view-tech');
        const techId = btn.dataset.techId;
        if (techId) {
            Techniques.viewTechnique(techId);
        }
    }

    // Edit button
    if (e.target.closest('.btn-edit-tech')) {
        const btn = e.target.closest('.btn-edit-tech');
        const techId = btn.dataset.techId;
        if (techId) {
            Techniques.editTechnique(techId);
        }
    }
});

// Export to global scope
window.Techniques = Techniques;

console.log('🛡️ Techniques module v1.1-FIXED loaded');
