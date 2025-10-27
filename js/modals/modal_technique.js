/**
 * ========================================
 * TECHNIQUE MODAL v19.0 - STYLED VERSION
 * MITRE ATT&CK Matrix Application
 * ========================================
 * 
 * ОБНОВЛЕНО v19.0:
 * ✅ Использование существующих CSS-классов из components.css, matrix_styles.css
 * ✅ Адаптивные карточки .technique-card, .info-card, .stat-card
 * ✅ Встроенный виджет комментариев CommentsWidget
 * ✅ Табы: Информация | Правила | Комментарии | Подтехники
 * ✅ Редактирование техник
 * ✅ Полная совместимость с design system
 * 
 * @version 19.0.0-styled
 * @date 2025-10-21
 */

const TechniqueModal = {
    config: {
        apiBaseUrl: window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api',
        platforms: ['Windows', 'Linux', 'macOS', 'Android', 'iOS', 'AWS', 'GCP', 'Azure', 'Office 365', 'SaaS', 'Network', 'Containers']
    },

    currentState: {
        currentTechnique: null,
        currentModalId: null,
        commentsWidget: null,
        activeTab: 'info',
        isEditMode: false
    },

    // ============================================
    // VIEW TECHNIQUE
    // ============================================
    async view(techniqueInput, options = {}) {
        const { onEdit = null } = options;

        try {
            let techniqueId = typeof techniqueInput === 'string'
                ? techniqueInput
                : (techniqueInput?.id || techniqueInput?.attack_id || techniqueInput?.techniqueId);

            console.log(`📖 Loading technique: ${techniqueId}`);

            // 🔧 ИСПРАВЛЕНИЕ: Полная очистка предыдущего состояния
            this.cleanup();

            const technique = await this.loadTechniqueDetails(techniqueId);
            if (!technique) throw new Error('Техника не найдена');

            this.currentState.currentTechnique = technique;
            this.currentState.isEditMode = false;

            // 🔧 ИСПРАВЛЕНИЕ: Загружаем количество комментариев ДО рендера
            const commentsCount = await this.loadCommentsCount(techniqueId);
            technique.comments_count = commentsCount;

            const content = this.renderTabbedView(technique);

            const buttons = [
                { text: 'Закрыть', class: 'btn btn-secondary', handler: () => this.close() }
            ];

            if (onEdit) {
                buttons.unshift({
                    text: '✏️ Редактировать',
                    class: 'btn btn-primary',
                    handler: () => {
                        this.close();
                        onEdit(technique);
                    }
                });
            }

            const modalId = ModalEngine.open({
                title: `${technique.attack_id} - ${technique.name_ru || technique.name}`,
                content,
                size: 'xl',
                buttons,
                onClose: () => this.cleanup()
            });

            this.currentState.currentModalId = modalId;

            setTimeout(() => {
                this.attachTabHandlers();
            }, 100);

            return modalId;

        } catch (error) {
            console.error('Error viewing technique:', error);
            this.showError(`Ошибка загрузки: ${error.message}`);
        }
    },

    // ============================================
    // НОВАЯ ФУНКЦИЯ: Загрузка количества комментариев
    // ============================================
    async loadCommentsCount(techniqueId) {
        try {
            const token = localStorage.getItem('authToken') || '';
            const response = await fetch(
                `${this.config.apiBaseUrl}/comments?entity_type=technique&entity_id=${encodeURIComponent(techniqueId)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                console.warn('Failed to load comments count:', response.status);
                return 0;
            }

            const result = await response.json();
            let comments = [];

            if (Array.isArray(result.data)) {
                comments = result.data;
            } else if (result.data && Array.isArray(result.data.comments)) {
                comments = result.data.comments;
            } else if (Array.isArray(result.comments)) {
                comments = result.comments;
            }

            return comments.length;

        } catch (error) {
            console.warn('Failed to load comments count:', error);
            return 0;
        }
    },

    // ============================================
    // EDIT TECHNIQUE
    // ============================================
    async edit(techniqueInput, options = {}) {
        const { onSave = null, onCancel = null } = options;

        try {
            let techniqueId = typeof techniqueInput === 'string'
                ? techniqueInput
                : (techniqueInput?.id || techniqueInput?.attack_id);

            const technique = await this.loadTechniqueDetails(techniqueId);
            if (!technique) throw new Error('Техника не найдена');

            this.currentState.currentTechnique = technique;
            this.currentState.isEditMode = true;

            const content = this.renderEditForm(technique);

            const modalId = ModalEngine.open({
                title: `✏️ Редактирование: ${technique.attack_id}`,
                content,
                size: 'xl',
                buttons: [
                    {
                        text: 'Отмена',
                        class: 'btn btn-secondary',
                        handler: () => {
                            this.close();
                            if (onCancel) onCancel();
                        }
                    },
                    {
                        text: '💾 Сохранить',
                        class: 'btn btn-success',
                        handler: async () => {
                            if (await this.handleSave()) {
                                this.close();
                                if (onSave) onSave(this.currentState.currentTechnique);
                            }
                        }
                    }
                ],
                onClose: () => this.cleanup()
            });

            this.currentState.currentModalId = modalId;
            return modalId;

        } catch (error) {
            console.error('Error editing technique:', error);
            this.showError(`Ошибка редактирования: ${error.message}`);
        }
    },

    // ============================================
    // RENDER TABBED VIEW
    // ============================================
    renderTabbedView(technique) {
        const hasSubtechniques = technique.subtechniques && technique.subtechniques.length > 0;
        const commentsCount = technique.comments_count || 0;
        const rulesCount = technique.rules?.length || technique.coverage?.total_rules || 0;

        return `
            <div class="technique-modal-content">
                <!-- Навигация табов -->
                <ul class="nav nav-tabs technique-tabs" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" data-tab="info" role="tab">
                            <i class="fas fa-info-circle"></i> Информация
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="rules" role="tab">
                            <i class="fas fa-shield-alt"></i> Правила
                            <span class="badge badge-primary">${rulesCount}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="comments" role="tab">
                            <i class="fas fa-comments"></i> Комментарии
                            <span class="badge badge-primary">${commentsCount}</span>
                        </button>
                    </li>
                    ${hasSubtechniques ? `
                        <li class="nav-item">
                            <button class="nav-link" data-tab="subtechniques" role="tab">
                                <i class="fas fa-sitemap"></i> Подтехники
                                <span class="badge badge-primary">${technique.subtechniques.length}</span>
                            </button>
                        </li>
                    ` : ''}
                </ul>

                <!-- Контент табов -->
                <div class="tab-content">
                    <div class="tab-pane active" data-tab-content="info">
                        ${this.renderInfoTab(technique)}
                    </div>
                    <div class="tab-pane" data-tab-content="rules" style="display:none">
                        ${this.renderRulesTab(technique)}
                    </div>
                    <div class="tab-pane" data-tab-content="comments" style="display:none">
                        <div id="technique-comments-widget-container"></div>
                    </div>
                    ${hasSubtechniques ? `
                        <div class="tab-pane" data-tab-content="subtechniques" style="display:none">
                            ${this.renderSubtechniquesTab(technique)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // ============================================
    // RENDER INFO TAB
    // ============================================
    renderInfoTab(technique) {
        return `
            <div class="technique-info-content">
                <!-- Статистика -->
                ${this.renderStatsSection(technique)}
                
                <!-- Описание -->
                ${this.renderDescriptionSection(technique)}
                
                <!-- Тактики -->
                ${this.renderTacticsSection(technique)}
                
                <!-- Технические детали -->
                ${this.renderTechnicalDetails(technique)}
            </div>
        `;
    },

    // ============================================
    // RENDER STATS SECTION
    // ============================================
    renderStatsSection(technique) {
        const status = this.getTechniqueStatus(technique);
        const coverage = this.getCoverageInfo(technique);

        return `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-fingerprint"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">ID техники</div>
                        <div class="stat-value">${this.escapeHtml(technique.attack_id || '-')}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon ${status.iconClass}">
                        <i class="${status.icon}"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Статус</div>
                        <div class="stat-value">
                            <span class="badge ${status.badgeClass}">${status.label}</span>
                        </div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon ${coverage.iconClass}">
                        <i class="${coverage.icon}"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Покрытие</div>
                        <div class="stat-value">
                            <span class="badge ${coverage.badgeClass}">${coverage.label}</span>
                        </div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-code-branch"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Версия</div>
                        <div class="stat-value">${technique.version || '1.0'}</div>
                    </div>
                </div>
            </div>
        `;
    },

    // ============================================
    // RENDER DESCRIPTION SECTION
    // ============================================
    renderDescriptionSection(technique) {
        const desc = technique.description_ru || technique.description || 'Описание отсутствует';
        return `
            <div class="info-card">
                <div class="card-header">
                    <h3><i class="fas fa-file-alt"></i> Описание</h3>
                </div>
                <div class="card-body">
                    <p class="description-text">${this.escapeHtml(desc)}</p>
                </div>
            </div>
        `;
    },

    // ============================================
    // RENDER TACTICS SECTION
    // ============================================
    renderTacticsSection(technique) {
        const tactics = technique.tactics || technique.kill_chain_phases || [];
        if (tactics.length === 0) return '';

        return `
            <div class="info-card">
                <div class="card-header">
                    <h3><i class="fas fa-crosshairs"></i> Тактики</h3>
                </div>
                <div class="card-body">
                    <div class="tags-container">
                        ${tactics.map(tactic => {
            const name = tactic.name_ru || tactic.name || tactic.x_mitre_shortname || tactic.phase_name;
            return `<span class="tag tag-tactic">${this.escapeHtml(name)}</span>`;
        }).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    // ============================================
    // RENDER TECHNICAL DETAILS
    // ============================================
    renderTechnicalDetails(technique) {
        return `
            <div class="technical-details-grid">
                ${this.renderPlatforms(technique)}
                ${this.renderDataSources(technique)}
                ${this.renderPermissions(technique)}
            </div>
        `;
    },

    renderPlatforms(technique) {
        if (!technique.platforms || technique.platforms.length === 0) return '';
        return `
            <div class="info-card">
                <div class="card-header">
                    <h4><i class="fas fa-server"></i> Платформы</h4>
                </div>
                <div class="card-body">
                    <div class="tags-container">
                        ${technique.platforms.map(p =>
            `<span class="tag tag-platform">${this.escapeHtml(p)}</span>`
        ).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    renderDataSources(technique) {
        if (!technique.data_sources || technique.data_sources.length === 0) return '';
        return `
            <div class="info-card">
                <div class="card-header">
                    <h4><i class="fas fa-database"></i> Источники данных</h4>
                </div>
                <div class="card-body">
                    <ul class="data-sources-list">
                        ${technique.data_sources.map(ds =>
            `<li><i class="fas fa-chevron-right"></i> ${this.escapeHtml(ds)}</li>`
        ).join('')}
                    </ul>
                </div>
            </div>
        `;
    },

    renderPermissions(technique) {
        if (!technique.permissions_required || technique.permissions_required.length === 0) return '';
        return `
            <div class="info-card">
                <div class="card-header">
                    <h4><i class="fas fa-key"></i> Требуемые привилегии</h4>
                </div>
                <div class="card-body">
                    <div class="tags-container">
                        ${technique.permissions_required.map(perm =>
            `<span class="tag tag-permission">${this.escapeHtml(perm)}</span>`
        ).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    // ============================================
    // RENDER RULES TAB
    // ============================================
    renderRulesTab(technique) {
        const rules = technique.rules || [];

        if (rules.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-shield-alt fa-4x"></i>
                    <h3>Правил не найдено</h3>
                    <p>Для этой техники пока не создано ни одного правила корреляции</p>
                </div>
            `;
        }

        return `
            <div class="rules-list">
                ${rules.map(rule => this.renderRuleCard(rule)).join('')}
            </div>
        `;
    },

    renderRuleCard(rule) {
        const isActive = rule.active === true || rule.active === 1;
        const statusClass = isActive ? 'badge-success' : 'badge-secondary';
        const statusLabel = isActive ? 'Активно' : 'Неактивно';

        return `
            <div class="rule-card" onclick="TechniqueModal.openRule('${rule.id}')">
                <div class="rule-header">
                    <div class="rule-title">
                        <h4>${this.escapeHtml(rule.name_ru || rule.name || 'Без названия')}</h4>
                    </div>
                    <div class="rule-badges">
                        <span class="badge ${statusClass}">${statusLabel}</span>
                    </div>
                </div>
                ${rule.description ? `
                    <div class="rule-description">
                        <p>${this.escapeHtml(this.truncate(rule.description_ru || rule.description, 200))}</p>
                    </div>
                ` : ''}
                <div class="rule-footer">
                    <span class="rule-meta">
                        <i class="fas fa-calendar"></i>
                        ${this.formatDate(rule.created_at)}
                    </span>
                </div>
            </div>
        `;
    },

    // ============================================
    // RENDER SUBTECHNIQUES TAB
    // ============================================
    renderSubtechniquesTab(technique) {
        const subs = technique.subtechniques || [];
        return `
            <div class="subtechniques-grid">
                ${subs.map(sub => this.renderSubtechniqueCard(sub)).join('')}
            </div>
        `;
    },

    renderSubtechniqueCard(sub) {
        const hasRules = sub.coverage?.active_rules > 0;
        const rulesCount = sub.coverage?.active_rules || 0;
        const totalRules = sub.coverage?.total_rules || 0;
        const badgeClass = hasRules ? 'badge-success' : 'badge-secondary';

        return `
            <div class="technique-card" onclick="TechniqueModal.view('${sub.attack_id}')">
                <div class="technique-card-header">
                    <strong>${this.escapeHtml(sub.attack_id)}</strong>
                    <span class="badge ${badgeClass}">${rulesCount}/${totalRules}</span>
                </div>
                <div class="technique-card-body">
                    <p>${this.escapeHtml(sub.name_ru || sub.name)}</p>
                </div>
            </div>
        `;
    },

    // ============================================
    // RENDER EDIT FORM
    // ============================================
    renderEditForm(technique) {
        return `
            <div class="technique-edit-form">
                <form id="technique-edit-form">
                    <div class="form-section">
                        <h3><i class="fas fa-edit"></i> Основная информация</h3>
                        
                        <div class="form-group">
                            <label>ID техники</label>
                            <input type="text" id="edit-attack-id" class="form-control" 
                                   value="${this.escapeHtml(technique.attack_id || '')}" readonly>
                        </div>

                        <div class="form-group">
                            <label>Название (English)</label>
                            <input type="text" id="edit-name" class="form-control" 
                                   value="${this.escapeHtml(technique.name || '')}" required>
                        </div>

                        <div class="form-group">
                            <label>Название (Русский)</label>
                            <input type="text" id="edit-name-ru" class="form-control" 
                                   value="${this.escapeHtml(technique.name_ru || '')}">
                        </div>

                        <div class="form-group">
                            <label>Описание (English)</label>
                            <textarea id="edit-description" class="form-control" rows="4">${this.escapeHtml(technique.description || '')}</textarea>
                        </div>

                        <div class="form-group">
                            <label>Описание (Русский)</label>
                            <textarea id="edit-description-ru" class="form-control" rows="4">${this.escapeHtml(technique.description_ru || '')}</textarea>
                        </div>

                        <div class="form-group">
                            <div class="checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="edit-deprecated" ${technique.deprecated ? 'checked' : ''}>
                                    <span>Устарело (Deprecated)</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="edit-revoked" ${technique.revoked ? 'checked' : ''}>
                                    <span>Отозвано (Revoked)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        `;
    },

    // ============================================
    // TAB HANDLERS
    // ============================================
    attachTabHandlers() {
        const tabButtons = document.querySelectorAll('.technique-tabs .nav-link');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(button.dataset.tab);
            });
        });
    },

    async switchTab(tabName) {
        console.log(`📑 Switching to tab: ${tabName}`);

        // Update active button
        const tabButtons = document.querySelectorAll('.technique-tabs .nav-link');
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update visible pane
        const tabPanes = document.querySelectorAll('.tab-pane');
        tabPanes.forEach(pane => {
            if (pane.dataset.tabContent === tabName) {
                pane.style.display = 'block';
                pane.classList.add('active');
            } else {
                pane.style.display = 'none';
                pane.classList.remove('active');
            }
        });

        if (tabName === 'comments') {
            await this.initCommentsWidget();
        }

        this.currentState.activeTab = tabName;
    },

    // ============================================
    // COMMENTS WIDGET
    // ============================================
    async initCommentsWidget() {
        console.log('🎨 Initializing comments widget...');

        if (typeof CommentsWidget === 'undefined') {
            console.error('❌ CommentsWidget not found!');
            const container = document.getElementById('technique-comments-widget-container');
            if (container) {
                container.innerHTML = '<div class="alert alert-danger">Модуль комментариев не загружен. Подключите comments_widget.js</div>';
            }
            return;
        }

        try {
            const container = document.getElementById('technique-comments-widget-container');
            if (!container) {
                console.error('❌ Container technique-comments-widget-container not found!');
                return;
            }

            // 🔧 ИСПРАВЛЕНИЕ: Всегда уничтожаем предыдущий виджет
            if (this.currentState.commentsWidget) {
                console.log('🗑️ Destroying previous comments widget...');
                try {
                    this.currentState.commentsWidget.destroy();
                } catch (e) {
                    console.warn('Failed to destroy previous widget:', e);
                }
                this.currentState.commentsWidget = null;
            }

            // Очищаем контейнер
            container.innerHTML = '';

            const technique = this.currentState.currentTechnique;
            if (!technique) {
                console.error('❌ No current technique!');
                return;
            }

            const techniqueId = technique.attack_id || technique.id;
            if (!techniqueId) {
                console.error('❌ No technique ID!');
                return;
            }

            console.log(`💬 Creating comments widget for technique: ${techniqueId}`);

            // 🔧 ИСПРАВЛЕНИЕ: Создаём новый виджет с уникальным контейнером
            this.currentState.commentsWidget = CommentsWidget.create({
                containerId: 'technique-comments-widget-container',
                entityType: 'technique',
                entityId: techniqueId,
                showSearch: true,
                showFilters: true,
                allowAdd: true,
                allowEdit: true,
                allowDelete: true,
                pageSize: 10,
                autoRefresh: 0,
                onUpdate: (comments) => {
                    console.log(`📊 Comments updated: ${comments.length}`);
                    this.updateCommentsCount(comments.length);
                },
                onError: (error) => {
                    console.error('❌ Comments widget error:', error);
                }
            });

            await this.currentState.commentsWidget.init();
            console.log('✅ Comments widget initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize comments widget:', error);
            const container = document.getElementById('technique-comments-widget-container');
            if (container) {
                container.innerHTML = `<div class="alert alert-danger">Ошибка загрузки комментариев: ${this.escapeHtml(error.message)}</div>`;
            }
        }
    },

    updateCommentsCount(count) {
        console.log(`🔢 Updating comments count to: ${count}`);

        const badge = document.querySelector('[data-tab="comments"] .badge');
        if (badge) {
            badge.textContent = count;
            console.log('✅ Comments badge updated');
        } else {
            console.warn('⚠️ Comments badge not found');
        }

        // Обновляем также в текущей технике
        if (this.currentState.currentTechnique) {
            this.currentState.currentTechnique.comments_count = count;
        }
    },


    // ============================================
    // API
    // ============================================
    async loadTechniqueDetails(techniqueId) {
        try {
            const token = localStorage.getItem('authToken') || '';
            const response = await fetch(
                `${this.config.apiBaseUrl}/techniques/${encodeURIComponent(techniqueId)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (result.success && result.data && result.data.technique) {
                return result.data.technique;
            }

            throw new Error('Техника не найдена');

        } catch (error) {
            console.error('Error loading technique:', error);
            throw error;
        }
    },

    async handleSave() {
        try {
            const updatedData = {
                name: document.getElementById('edit-name')?.value || '',
                name_ru: document.getElementById('edit-name-ru')?.value || '',
                description: document.getElementById('edit-description')?.value || '',
                description_ru: document.getElementById('edit-description-ru')?.value || '',
                deprecated: document.getElementById('edit-deprecated')?.checked || false,
                revoked: document.getElementById('edit-revoked')?.checked || false
            };

            if (!updatedData.name) {
                this.showError('Название техники обязательно');
                return false;
            }

            const techniqueId = this.currentState.currentTechnique.id ||
                this.currentState.currentTechnique.attack_id;
            const token = localStorage.getItem('authToken') || '';

            const response = await fetch(
                `${this.config.apiBaseUrl}/techniques/${encodeURIComponent(techniqueId)}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedData)
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (!result.success) throw new Error(result.error?.message || 'Не удалось сохранить');

            this.showSuccess('Техника успешно сохранена');
            this.currentState.currentTechnique = { ...this.currentState.currentTechnique, ...updatedData };
            return true;

        } catch (error) {
            console.error('Save error:', error);
            this.showError(`Ошибка сохранения: ${error.message}`);
            return false;
        }
    },

    async openRule(ruleId) {
        if (typeof RuleModal !== 'undefined' && RuleModal.view) {
            await RuleModal.view(ruleId);
        }
    },

    // ============================================
    // HELPERS
    // ============================================
    getTechniqueStatus(technique) {
        if (technique.revoked) {
            return {
                label: 'Отозвано',
                icon: 'fas fa-ban',
                iconClass: 'text-danger',
                badgeClass: 'badge-danger'
            };
        }
        if (technique.deprecated) {
            return {
                label: 'Устарело',
                icon: 'fas fa-exclamation-triangle',
                iconClass: 'text-warning',
                badgeClass: 'badge-warning'
            };
        }
        return {
            label: 'Активно',
            icon: 'fas fa-check-circle',
            iconClass: 'text-success',
            badgeClass: 'badge-success'
        };
    },

    getCoverageInfo(technique) {
        const active = technique.active_rules_count || 0;
        const total = technique.rules_count || 0;

        if (active > 0) {
            return {
                label: `${active} активных`,
                icon: 'fas fa-shield-alt',
                iconClass: 'text-success',
                badgeClass: 'badge-success'
            };
        }
        if (total > 0) {
            return {
                label: `${total} неактивных`,
                icon: 'fas fa-shield-alt',
                iconClass: 'text-warning',
                badgeClass: 'badge-warning'
            };
        }
        return {
            label: 'Нет покрытия',
            icon: 'fas fa-shield-alt',
            iconClass: 'text-muted',
            badgeClass: 'badge-secondary'
        };
    },

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    truncate(text, max) {
        if (!text || text.length <= max) return text || '';
        return text.substring(0, max) + '...';
    },

    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    },

    showError(msg) {
        if (typeof Utils !== 'undefined' && Utils.showNotification) {
            Utils.showNotification(msg, 'error');
        } else {
            alert(msg);
        }
    },

    showSuccess(msg) {
        if (typeof Utils !== 'undefined' && Utils.showNotification) {
            Utils.showNotification(msg, 'success');
        }
    },

    // ============================================
    // LIFECYCLE
    // ============================================
    cleanup() {
        console.log('🧹 Cleaning up TechniqueModal...');

        // 🔧 ИСПРАВЛЕНИЕ: Гарантированное уничтожение виджета комментариев
        if (this.currentState.commentsWidget) {
            try {
                console.log('🗑️ Destroying comments widget...');
                this.currentState.commentsWidget.destroy();
            } catch (e) {
                console.warn('Failed to destroy comments widget:', e);
            }
            this.currentState.commentsWidget = null;
        }

        // Очищаем состояние
        this.currentState = {
            currentTechnique: null,
            currentModalId: null,
            commentsWidget: null,
            activeTab: 'info',
            isEditMode: false
        };

        console.log('✅ TechniqueModal cleaned up');
    },

    close() {
        if (this.currentState.currentModalId && typeof ModalEngine !== 'undefined') {
            ModalEngine.close(this.currentState.currentModalId);
        }
        this.cleanup();
    }
};

window.TechniqueModal = TechniqueModal;
console.log('✅ TechniqueModal v19.0 (Styled) loaded');
