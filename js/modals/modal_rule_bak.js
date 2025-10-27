/**
 * =============================================================================
 * RULE MODAL v31.0 - WITH WORKFLOW STATUS MANAGER
 * =============================================================================
 * @version 31.0.0
 * @date 2025-10-24
 * 
 * НОВОЕ в v31.0:
 * ✅ Добавлен WorkflowStatusManager
 * ✅ UI для управления статусами правил
 * ✅ Валидация переходов статусов
 * ✅ Поддержка исполнителей и комментариев
 */

// =============================================================================
// WORKFLOW STATUS MANAGER CLASS
// =============================================================================

class WorkflowStatusManager {
    static STATUSES = {
        'not_started': {
            label: 'Не взято в работу',
            icon: 'fa-circle',
            color: '#6b7280',
            requires_comment: false,
            requires_assignee: false,
            next_statuses: ['info_required', 'in_progress']
        },
        'info_required': {
            label: 'Требуется информация',
            icon: 'fa-question-circle',
            color: '#f59e0b',
            requires_comment: true,
            requires_assignee: false,
            next_statuses: ['in_progress', 'not_started']
        },
        'in_progress': {
            label: 'В работе',
            icon: 'fa-spinner',
            color: '#3b82f6',
            requires_comment: false,
            requires_assignee: true,
            next_statuses: ['stopped', 'ready_for_testing']
        },
        'stopped': {
            label: 'Остановлено',
            icon: 'fa-stop-circle',
            color: '#ef4444',
            requires_comment: true,
            requires_assignee: false,
            next_statuses: ['in_progress', 'not_started']
        },
        'returned': {
            label: 'Возвращено',
            icon: 'fa-undo-alt',
            color: '#ec4899',
            requires_comment: true,
            requires_assignee: false,
            next_statuses: ['in_progress', 'info_required']
        },
        'ready_for_testing': {
            label: 'Готово к тестированию',
            icon: 'fa-check-circle',
            color: '#8b5cf6',
            requires_comment: false,
            requires_assignee: false,
            next_statuses: ['tested', 'returned', 'in_progress']
        },
        'tested': {
            label: 'Протестировано',
            icon: 'fa-vial',
            color: '#10b981',
            requires_comment: false,
            requires_assignee: false,
            next_statuses: ['deployed', 'returned']
        },
        'deployed': {
            label: 'Выгружено в Git',
            icon: 'fa-code-branch',
            color: '#0f766e',
            requires_comment: true,
            requires_assignee: false,
            next_statuses: []
        }
    };

    constructor(ruleId, apiBaseUrl) {
        this.ruleId = ruleId;
        this.apiBaseUrl = apiBaseUrl;
        this.currentStatus = null;
        this.availableUsers = [];
    }

    async initializeWorkflowUI(container) {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/rules/${this.ruleId}/workflow-info`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${this.getAuthToken()}` }
                }
            );

            if (!response.ok) {
                console.warn('Failed to load workflow info');
                return;
            }

            const data = await response.json();
            if (!data.success) return;

            this.currentStatus = data.data.workflow_status;
            this.renderWorkflowSection(container, data.data);
        } catch (error) {
            console.error('Ошибка инициализации workflow:', error);
        }
    }

    renderWorkflowSection(container, workflowData) {
        const statusConfig = WorkflowStatusManager.STATUSES[this.currentStatus] ||
            WorkflowStatusManager.STATUSES['not_started'];
        const nextStatuses = workflowData.available_next_statuses || [];

        const workflowHTML = `
            <div class="workflow-section">
                <div class="workflow-header">
                    <h3 class="workflow-title">
                        <i class="fas fa-tasks"></i> Управление статусом
                    </h3>
                </div>

                <div class="workflow-current-status">
                    <div class="status-badge" style="background: ${statusConfig.color}20; border: 2px solid ${statusConfig.color}">
                        <i class="fas ${statusConfig.icon}" style="color: ${statusConfig.color}"></i>
                        <span style="color: ${statusConfig.color}; font-weight: 600;">
                            ${statusConfig.label}
                        </span>
                    </div>
                </div>

                <div class="workflow-info-grid">
                    ${workflowData.assignee ? `
                        <div class="info-item">
                            <label>Исполнитель:</label>
                            <span><i class="fas fa-user"></i> ${this.escapeHtml(workflowData.assignee.username)}</span>
                        </div>
                    ` : ''}

                    ${workflowData.stopped_reason ? `
                        <div class="info-item">
                            <label>Причина остановки:</label>
                            <span>${this.escapeHtml(workflowData.stopped_reason)}</span>
                        </div>
                    ` : ''}

                    ${workflowData.deployment_mr_url ? `
                        <div class="info-item">
                            <label>MR URL:</label>
                            <a href="${this.escapeHtml(workflowData.deployment_mr_url)}" target="_blank">
                                <i class="fas fa-external-link-alt"></i> ${this.escapeHtml(workflowData.deployment_mr_url)}
                            </a>
                        </div>
                    ` : ''}

                    ${workflowData.tested_by ? `
                        <div class="info-item">
                            <label>Тестировал:</label>
                            <span><i class="fas fa-user-check"></i> ${this.escapeHtml(workflowData.tested_by.username)}</span>
                        </div>
                    ` : ''}
                </div>

                ${nextStatuses.length > 0 ? `
                    <div class="workflow-transitions">
                        <label class="transitions-label">Изменить статус на:</label>
                        <div class="transitions-buttons">
                            ${nextStatuses.map(status => {
            const statusConfig = WorkflowStatusManager.STATUSES[status];
            return `
                                    <button class="btn btn-workflow" 
                                            onclick="window.workflowManager.changeStatus('${status}')"
                                            title="${statusConfig.label}">
                                        <i class="fas ${statusConfig.icon}"></i>
                                        ${statusConfig.label}
                                    </button>
                                `;
        }).join('')}
                        </div>
                    </div>
                ` : '<p style="color: var(--text-muted); margin-top: 12px;">Нет доступных переходов</p>'}
            </div>
        `;

        const workflowContainer = document.createElement('div');
        workflowContainer.innerHTML = workflowHTML;
        container.appendChild(workflowContainer);

        window.workflowManager = this;
    }

    async changeStatus(newStatus, ruleId) {
        try {
            console.log(`📝 changeStatus called with ruleId: ${ruleId}, newStatus: ${newStatus}`);

            const statusConfig = WorkflowStatusManager.STATUSES[newStatus];
            if (!statusConfig) {
                console.error(`❌ Invalid status: ${newStatus}`);
                alert('Недопустимый статус');
                return;
            }

            // Загружаем пользователей если нужны
            if (statusConfig.requires_assignee) {
                await this.loadUsers();
            }

            const modalId = `workflow-modal-${Date.now()}`;
            const assigneeSelect = statusConfig.requires_assignee ? this.getAssigneeSelectHTML() : '';

            const modalHTML = `
            <div class="workflow-status-modal" id="${modalId}" data-rule-id="${ruleId}">
                <div class="workflow-modal-overlay" onclick="document.getElementById('${modalId}').remove()"></div>
                <div class="workflow-modal-content">
                    <div class="workflow-modal-header">
                        <h4>
                            <i class="fas ${statusConfig.icon}"></i> 
                            Изменить статус на "${statusConfig.label}"
                        </h4>
                        <button class="workflow-modal-close" type="button" onclick="document.getElementById('${modalId}').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="workflow-modal-body">
                        ${statusConfig.requires_assignee ? `
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-user"></i> Исполнитель 
                                    <span class="required">*</span>
                                </label>
                                ${assigneeSelect}
                            </div>
                        ` : ''}

                        ${statusConfig.requires_comment ? `
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-comment"></i>
                                    ${this.getCommentLabel(newStatus)}
                                    <span class="required">*</span>
                                </label>
                                <textarea 
                                    id="comment-textarea-${modalId}"
                                    class="form-control" 
                                    rows="4" 
                                    placeholder="${this.getCommentPlaceholder(newStatus)}..."
                                ></textarea>
                            </div>
                        ` : ''}
                    </div>

                    <div class="workflow-modal-footer">
                        <button 
                            class="btn btn-primary" 
                            type="button"
                            onclick="window.workflowManager.submitStatusChange('${newStatus}', '${modalId}')"
                        >
                            <i class="fas fa-check"></i> Применить
                        </button>
                        <button 
                            class="btn btn-secondary" 
                            type="button"
                            onclick="document.getElementById('${modalId}').remove()"
                        >
                            <i class="fas fa-times"></i> Отмена
                        </button>
                    </div>
                </div>
            </div>
        `;

            document.body.insertAdjacentHTML('beforeend', modalHTML);

        } catch (error) {
            console.error('❌ Error in changeStatus:', error.message);
            alert(`Ошибка: ${error.message}`);
        }
    }


    // ✅ НОВЫЙ метод - генерирует HTML селекта исполнителей
    getAssigneeSelectHTML() {
        if (!this.cachedUsers || this.cachedUsers.length === 0) {
            return `
            <select class="form-control" disabled>
                <option>Загрузка пользователей...</option>
            </select>
            <small class="text-danger">Не удалось загрузить список пользователей</small>
        `;
        }

        const currentAssigneeId = this.currentRule?.assignee_id || '';

        return `
        <select id="assignee-select" class="form-control assignee-select" required>
            <option value="">-- Не назначен --</option>
            ${this.cachedUsers.map(user => `
                <option value="${user.id}" ${user.id == currentAssigneeId ? 'selected' : ''}>
                    ${user.username} (${user.email})
                </option>
            `).join('')}
        </select>
    `;
    }

    // ✅ НОВЫЙ метод - возвращает правильный label для комментария
    getCommentLabel(status) {
        const labels = {
            'stopped': '🛑 Причина остановки',
            'deployed': '🚀 URL Merge Request',
            'info_required': '📋 Требуемая информация',
            'returned': '↩️ Причина возврата',
        };
        return labels[status] || '💬 Комментарий';
    }

    // ✅ НОВЫЙ метод - возвращает placeholder для комментария
    getCommentPlaceholder(status) {
        const placeholders = {
            'stopped': 'Введите причину остановки работы...',
            'deployed': 'Введите URL merge request (https://...)',
            'info_required': 'Опишите требуемую информацию...',
            'returned': 'Введите причину возврата на доработку...',
        };
        return placeholders[status] || 'Введите комментарий...';
    }

    async loadUsers() {
        try {
            console.log('🔄 Loading users...');

            const response = await fetch('/api/users/list', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const responseData = await response.json();
            console.log('✅ Users response:', responseData);

            // ✅ ИСПРАВЛЕНО: API возвращает {success, data: {users: [...]}}
            let users = [];

            if (Array.isArray(responseData)) {
                // Если ответ - массив
                users = responseData;
            } else if (responseData.data?.users && Array.isArray(responseData.data.users)) {
                // ✅ Если ответ: {success: true, data: {users: [...], count: 10}}
                users = responseData.data.users;
            } else if (responseData.data && Array.isArray(responseData.data)) {
                // Если ответ: {success: true, data: [...]}
                users = responseData.data;
            } else if (responseData.users && Array.isArray(responseData.users)) {
                // Если ответ: {users: [...]}
                users = responseData.users;
            } else {
                console.warn('⚠️ Unexpected API response structure:', responseData);
                users = [];
            }

            console.log(`✅ Loaded ${users.length} users`);

            // Фильтруем активных пользователей
            this.cachedUsers = users.filter(u => u.is_active !== false);

            console.log(`✅ Filtered ${this.cachedUsers.length} active users`);

            return this.cachedUsers;

        } catch (error) {
            console.error('❌ Error loading users:', error.message);
            this.cachedUsers = [];
            return [];
        }
    }


    async submitStatusChange(newStatus, modalId) {
        try {
            const modal = document.getElementById(modalId);
            if (!modal) {
                console.error(`❌ Modal not found: ${modalId}`);
                alert('Ошибка: модальное окно не найдено');
                return;
            }

            // ✅ ВАЖНО: получаем ruleId из атрибута модали
            const ruleId = modal.dataset.ruleId;
            console.log(`📝 Rule ID from modal: ${ruleId}`);

            if (!ruleId) {
                console.error('❌ Rule ID not found in modal data');
                alert('Ошибка: ID правила не найден');
                return;
            }

            console.log(`📤 Submitting status change to: ${newStatus}`);
            console.log(`📤 Payload will use Rule ID: ${ruleId}`);

            let payload = {
                workflow_status: newStatus
            };

            // Получаем исполнителя
            const assigneeSelect = modal.querySelector('#assignee-select');
            if (assigneeSelect && assigneeSelect.value) {
                payload.assignee_id = parseInt(assigneeSelect.value);
            }

            // Получаем комментарий
            const commentTextarea = modal.querySelector('textarea[id^="comment-textarea"]');
            if (commentTextarea && commentTextarea.value.trim()) {
                const comment = commentTextarea.value.trim();
                if (newStatus === 'stopped') {
                    payload.stopped_reason = comment;
                } else if (newStatus === 'deployed') {
                    payload.deployment_mr_url = comment;
                } else {
                    payload.comment_text = comment;
                }
            }

            console.log('📤 Final Payload:', payload);

            // ✅ Используем ruleId из модали
            const url = `/api/rules/${ruleId}/workflow-status`;
            console.log(`📋 Request URL: ${url}`);

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log(`📋 Response status: ${response.status}`);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('❌ Server error:', errorData);
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Status changed successfully:', result);

            // Закрываем модаль
            modal.remove();

            // Показываем сообщение об успехе
            alert(`✅ Статус успешно изменён`);

            // Обновляем представление если нужно
            if (this.onStatusChanged) {
                this.onStatusChanged(result.data);
            }

        } catch (error) {
            console.error('❌ Error submitting status:', error.message);
            alert(`❌ Ошибка: ${error.message}`);
        }
    }

    getAuthToken() {
        return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// =============================================================================
// RULE MODAL MAIN CLASS
// =============================================================================

const RuleModal = {
    config: {
        apiBaseUrl: window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api',
        pangeoRadarBaseUrl: 'https://172.30.250.162/v4/347ace01-f831-c379-7c40-e6a4580fc2ee/correlation-rules',
        editableFields: ['name', 'nameru', 'description', 'descriptionru', 'status', 'severity', 'tags'],
        severityLevels: ['low', 'medium', 'high', 'critical'],
        statuses: ['active', 'disabled']
    },

    currentState: {
        currentRule: null,
        currentModalId: null,
        commentsWidget: null,
        activeTab: 'info',
        editingFields: new Set(),
        workflowManager: null
    },

    async view(ruleInput, options = {}) {
        try {
            let ruleId = typeof ruleInput === 'string' ? ruleInput : (ruleInput?.id || ruleInput?.rule_id);

            console.log('📖 Loading rule:', ruleId);

            this.cleanup();

            const rule = await this.loadRuleDetails(ruleId);
            if (!rule) {
                throw new Error('Правило не найдено');
            }

            this.currentState.currentRule = rule;

            const commentsCount = await this.loadCommentsCount(ruleId);
            rule.comments_count = commentsCount;

            const content = this.renderTabbedView(rule);
            const title = `🛡️ ${rule.name_ru || rule.name}`;

            const pangeoUrl = `${this.config.pangeoRadarBaseUrl}/${rule.id}`;

            const modalId = ModalEngine.open({
                title: title,
                content,
                size: 'xl',
                buttons: [],
                onClose: () => this.cleanup()
            });

            this.currentState.currentModalId = modalId;

            setTimeout(async () => {
                this.attachTabHandlers();
                this.addPangeoRadarLink(pangeoUrl);

                // НОВОЕ: Инициализируем workflow manager
                await this.initializeWorkflowManager(ruleId);
            }, 200);

            setTimeout(() => {
                this.addPangeoRadarLink(pangeoUrl);
            }, 500);

            return modalId;

        } catch (error) {
            console.error('❌ Error viewing rule:', error);
            this.showError(`Ошибка загрузки правила: ${error.message}`);
            throw error;
        }
    },

    // НОВЫЙ МЕТОД: Инициализация workflow manager
    async initializeWorkflowManager(ruleId) {
        try {
            const infoTabContent = document.querySelector('[data-tab-content="info"]');
            if (!infoTabContent) return;

            this.currentState.workflowManager = new WorkflowStatusManager(
                ruleId,
                this.config.apiBaseUrl
            );

            await this.currentState.workflowManager.initializeWorkflowUI(infoTabContent);

            console.log('✅ Workflow manager initialized');
        } catch (error) {
            console.error('Failed to initialize workflow manager:', error);
        }
    },

    addPangeoRadarLink(url) {
        const existingLink = document.querySelector('.pangeo-radar-link');
        if (existingLink) {
            console.log('✅ Pangeo Radar link already exists');
            return;
        }

        let modalFooter = document.querySelector('.modal-footer');

        if (!modalFooter) {
            console.warn('⚠️ Modal footer not found, searching in modal...');

            const modal = document.querySelector('.modal.show');
            if (modal) {
                const modalContent = modal.querySelector('.modal-content');
                if (modalContent) {
                    const modalBody = modalContent.querySelector('.modal-body');

                    modalFooter = modalContent.querySelector('.modal-footer');

                    if (!modalFooter && modalBody) {
                        modalFooter = document.createElement('div');
                        modalFooter.className = 'modal-footer';
                        modalBody.after(modalFooter);
                        console.log('✅ Created modal footer');
                    }
                }
            }
        }

        if (!modalFooter) {
            console.error('❌ Could not find or create modal footer');
            return;
        }

        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'btn btn-info pangeo-radar-link';
        link.innerHTML = '<i class="fas fa-external-link-alt"></i> Открыть в Pangeo Radar';

        modalFooter.appendChild(link);
        console.log('✅ Pangeo Radar link added to footer');
    },

    async reloadRuleData() {
        try {
            const ruleId = this.currentState.currentRule.id;
            console.log('🔄 Reloading rule data...');

            const rule = await this.loadRuleDetails(ruleId);
            if (!rule) {
                throw new Error('Правило не найдено');
            }

            this.currentState.currentRule = rule;

            const modalTitle = document.querySelector('.modal-title');
            if (modalTitle) {
                modalTitle.textContent = `🛡️ ${rule.name_ru || rule.name}`;
            }

            const infoTabContent = document.querySelector('[data-tab-content="info"]');
            if (infoTabContent && this.currentState.activeTab === 'info') {
                infoTabContent.innerHTML = this.renderInfoTabContent(rule);

                // Переинициализируем workflow manager
                await this.initializeWorkflowManager(ruleId);
            }

            console.log('✅ Rule data reloaded');

        } catch (error) {
            console.error('❌ Failed to reload rule data:', error);
            this.showError('Не удалось обновить данные правила');
        }
    },

    renderInfoTabContent(rule) {
        return `
            ${this.renderStatsSection(rule)}
            ${this.renderEditableFields(rule)}
            ${this.renderTechnicalInfo(rule)}
            ${this.renderMetadata(rule)}
        `;
    },

    // ... (остальные методы из вашего файла paste.txt остаются без изменений)
    // Скопируйте все методы начиная с startEditField до конца

    startEditField(fieldName) {
        this.currentState.editingFields.add(fieldName);
        const container = document.getElementById(`field-${fieldName}`);
        if (!container) return;

        const rule = this.currentState.currentRule;

        container.innerHTML = this.renderEditableField(fieldName, rule);

        const input = container.querySelector('input, textarea, select');
        if (input) input.focus();
    },

    async saveField(fieldName) {
        const input = document.getElementById(`edit-${fieldName}`);
        if (!input) return;

        const newValue = input.value;

        if (newValue.trim() === '' && fieldName !== 'tags') {
            this.showError('Значение не может быть пустым');
            return;
        }

        try {
            const ruleId = this.currentState.currentRule.id;
            const token = localStorage.getItem('authToken');

            const updateData = {};

            const fieldMap = {
                'name': 'name',
                'name_ru': 'nameru',
                'description': 'description',
                'description_ru': 'descriptionru',
                'status': 'status',
                'severity': 'severity',
                'tags': 'tags'
            };

            const apiFieldName = fieldMap[fieldName] || fieldName;

            if (!apiFieldName || !this.config.editableFields.includes(apiFieldName)) {
                this.showError(`Поле "${fieldName}" не может быть отредактировано`);
                return;
            }

            updateData[apiFieldName] = newValue;

            console.log('📤 Sending update:', updateData);

            const response = await fetch(`${this.config.apiBaseUrl}/rules/${encodeURIComponent(ruleId)}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Ошибка сохранения');
            }

            this.showSuccess('✅ Поле успешно обновлено');

            this.currentState.editingFields.delete(fieldName);

            await this.reloadRuleData();

        } catch (error) {
            console.error('❌ Save error:', error);
            this.showError(`Ошибка сохранения: ${error.message}`);
        }
    },

    cancelEditField(fieldName) {
        this.currentState.editingFields.delete(fieldName);
        const container = document.getElementById(`field-${fieldName}`);
        if (!container) return;

        const rule = this.currentState.currentRule;
        container.innerHTML = this.renderFieldDisplay(fieldName, rule);
    },

    renderEditableField(fieldName, rule) {
        const fieldConfig = this.getFieldConfig(fieldName);
        const value = rule[fieldName] || '';

        let inputHtml = '';

        if (fieldConfig.type === 'textarea') {
            inputHtml = `<textarea id="edit-${fieldName}" class="form-control" rows="3">${this.escapeHtml(value)}</textarea>`;
        } else if (fieldConfig.type === 'select') {
            inputHtml = `
                <select id="edit-${fieldName}" class="form-control">
                    ${fieldConfig.options.map(opt => `
                        <option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>
                    `).join('')}
                </select>
            `;
        } else {
            inputHtml = `<input type="text" id="edit-${fieldName}" class="form-control" value="${this.escapeHtml(value)}">`;
        }

        return `
            ${inputHtml}
            <div style="margin-top: 8px; display: flex; gap: 8px;">
                <button class="btn btn-success btn-sm" onclick="RuleModal.saveField('${fieldName}')">
                    <i class="fas fa-check"></i> Сохранить
                </button>
                <button class="btn btn-secondary btn-sm" onclick="RuleModal.cancelEditField('${fieldName}')">
                    <i class="fas fa-times"></i> Отмена
                </button>
            </div>
        `;
    },

    renderFieldDisplay(fieldName, rule) {
        const fieldConfig = this.getFieldConfig(fieldName);
        let value = rule[fieldName];

        if (fieldConfig.type === 'select' && fieldConfig.options) {
            const option = fieldConfig.options.find(opt => opt.value === value);
            value = option ? option.label : value;
        }

        const isEditable = this.config.editableFields.includes(this.getApiFieldName(fieldName));
        const editButton = isEditable
            ? `<button class="btn-icon-edit" onclick="RuleModal.startEditField('${fieldName}')" title="Редактировать"><i class="fas fa-pencil-alt"></i></button>`
            : '';

        const displayValue = value ? this.escapeHtml(value) : '<em style="color: var(--text-muted);">Не указано</em>';

        return `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">${this.nl2br(displayValue)}</div>
                ${editButton}
            </div>
        `;
    },

    getApiFieldName(fieldName) {
        const map = {
            'name': 'name',
            'name_ru': 'nameru',
            'description': 'description',
            'description_ru': 'descriptionru',
            'status': 'status',
            'severity': 'severity',
            'tags': 'tags'
        };
        return map[fieldName] || fieldName;
    },

    /**
 * Получить конфигурацию поля для редактирования
 * Синхронизировано с RULE_STATUS_WORKFLOW из rules.py
 */
    getFieldConfig(fieldName) {
        const configs = {
            // =====================================================================
            // ОСНОВНЫЕ ПОЛЯ (РЕДАКТИРУЕМЫЕ)
            // =====================================================================
            'name': {
                type: 'text',
                label: 'Название (English)',
                editable: true,
                placeholder: 'Rule name in English'
            },
            'name_ru': {
                type: 'text',
                label: 'Название (Русский)',
                editable: true,
                placeholder: 'Название правила на русском'
            },
            'description': {
                type: 'textarea',
                label: 'Описание (English)',
                editable: true,
                placeholder: 'Detailed description in English'
            },
            'description_ru': {
                type: 'textarea',
                label: 'Описание (Русский)',
                editable: true,
                placeholder: 'Подробное описание на русском'
            },

            // =====================================================================
            // СТАТУС ПРАВИЛА (из БД: draft, testing, active, deprecated, disabled)
            // =====================================================================
            'status': {
                type: 'select',
                label: 'Статус активности',
                editable: true,
                options: [
                    { value: 'draft', label: '📝 Черновик' },
                    { value: 'testing', label: '🧪 Тестирование' },
                    { value: 'active', label: '✅ Активно' },
                    { value: 'deprecated', label: '⚠️ Устарело' },
                    { value: 'disabled', label: '❌ Отключено' }
                ]
            },

            // =====================================================================
            // WORKFLOW STATUS (управляется через WorkflowStatusManager)
            // Точная копия из RULE_STATUS_WORKFLOW в rules.py
            // =====================================================================
            'workflow_status': {
                type: 'select',
                label: 'Workflow статус',
                editable: false, // Редактируется только через WorkflowStatusManager
                options: [
                    {
                        value: 'not_started',
                        label: '⚪ Не взято в работу',
                        icon: 'fa-circle',
                        color: '#6b7280',
                        requires_comment: false,
                        requires_assignee: false
                    },
                    {
                        value: 'info_required',
                        label: '❓ Требуется информация',
                        icon: 'fa-question-circle',
                        color: '#f59e0b',
                        requires_comment: true, // Обязателен комментарий
                        requires_assignee: false
                    },
                    {
                        value: 'in_progress',
                        label: '🔵 В работе',
                        icon: 'fa-spinner',
                        color: '#3b82f6',
                        requires_comment: false,
                        requires_assignee: true // Обязателен исполнитель
                    },
                    {
                        value: 'stopped',
                        label: '🔴 Остановлено',
                        icon: 'fa-stop-circle',
                        color: '#ef4444',
                        requires_comment: true, // Обязателен комментарий с причиной
                        requires_assignee: false
                    },
                    {
                        value: 'returned',
                        label: '🔙 Возвращено',
                        icon: 'fa-undo-alt',
                        color: '#ec4899',
                        requires_comment: true, // Обязателен комментарий с причиной возврата
                        requires_assignee: false
                    },
                    {
                        value: 'ready_for_testing',
                        label: '🟣 Готово к тестированию',
                        icon: 'fa-check-circle',
                        color: '#8b5cf6',
                        requires_comment: false,
                        requires_assignee: false
                    },
                    {
                        value: 'tested',
                        label: '🟢 Протестировано',
                        icon: 'fa-vial',
                        color: '#10b981',
                        requires_comment: false,
                        requires_assignee: false
                    },
                    {
                        value: 'deployed',
                        label: '🚀 Выгружено в Git',
                        icon: 'fa-code-branch',
                        color: '#0f766e',
                        requires_comment: true, // Обязателен комментарий с URL MR
                        requires_assignee: false
                    }
                ]
            },

            // =====================================================================
            // УРОВЕНЬ РИСКА (Severity)
            // =====================================================================
            'severity': {
                type: 'select',
                label: 'Уровень риска',
                editable: true,
                options: [
                    { value: 'low', label: '🔵 Низкий', color: '#3b82f6' },
                    { value: 'medium', label: '🟡 Средний', color: '#f59e0b' },
                    { value: 'high', label: '🟠 Высокий', color: '#f97316' },
                    { value: 'critical', label: '🔴 Критический', color: '#ef4444' }
                ]
            },

            // =====================================================================
            // УВЕРЕННОСТЬ (Confidence)
            // =====================================================================
            'confidence': {
                type: 'select',
                label: 'Уверенность',
                editable: false, // Обычно задаётся автоматически
                options: [
                    { value: 'low', label: 'Низкая' },
                    { value: 'medium', label: 'Средняя' },
                    { value: 'high', label: 'Высокая' }
                ]
            },

            // =====================================================================
            // ТИП ЛОГИКИ
            // =====================================================================
            'logic_type': {
                type: 'select',
                label: 'Тип логики',
                editable: true,
                options: [
                    { value: 'sigma', label: 'Sigma' },
                    { value: 'kql', label: 'KQL (Kusto Query Language)' },
                    { value: 'spl', label: 'SPL (Splunk)' },
                    { value: 'sql', label: 'SQL' },
                    { value: 'other', label: 'Другое' }
                ]
            },

            // =====================================================================
            // СИСТЕМНЫЕ ПОЛЯ (НЕ РЕДАКТИРУЕМЫЕ)
            // =====================================================================
            'author': {
                type: 'text',
                label: 'Автор',
                editable: false
            },
            'technique_id': {
                type: 'text',
                label: 'Техника MITRE ATT&CK',
                editable: false
            },
            'created_at': {
                type: 'datetime',
                label: 'Дата создания',
                editable: false
            },
            'updated_at': {
                type: 'datetime',
                label: 'Дата обновления',
                editable: false
            },
            'created_by': {
                type: 'text',
                label: 'Создатель',
                editable: false
            },

            // =====================================================================
            // ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ (РЕДАКТИРУЕМЫЕ)
            // =====================================================================
            'folder': {
                type: 'text',
                label: 'Папка',
                editable: true,
                placeholder: 'Папка для организации правил'
            },
            'tags': {
                type: 'text',
                label: 'Теги',
                editable: true,
                placeholder: 'Теги через запятую (malware, persistence, evasion)'
            },
            'false_positives': {
                type: 'textarea',
                label: 'Ложные срабатывания',
                editable: true,
                placeholder: 'Опишите возможные ложные срабатывания'
            },
            'references': {
                type: 'textarea',
                label: 'Ссылки',
                editable: true,
                placeholder: 'Ссылки на источники (по одной на строку)'
            },

            // =====================================================================
            // WORKFLOW ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ (НЕ РЕДАКТИРУЕМЫЕ НАПРЯМУЮ)
            // =====================================================================
            'assignee_id': {
                type: 'text',
                label: 'Исполнитель',
                editable: false // Задаётся через WorkflowStatusManager
            },
            'stopped_reason': {
                type: 'textarea',
                label: 'Причина остановки',
                editable: false
            },
            'deployment_mr_url': {
                type: 'text',
                label: 'URL Merge Request',
                editable: false
            },
            'tested_by_id': {
                type: 'text',
                label: 'Тестировал',
                editable: false
            },
            'workflow_updated_at': {
                type: 'datetime',
                label: 'Workflow обновлён',
                editable: false
            }
        };

        return configs[fieldName] || {
            type: 'text',
            label: this.formatFieldLabel(fieldName),
            editable: false
        };
    },

    /**
     * Форматирует имя поля для отображения
     */
    formatFieldLabel(fieldName) {
        return fieldName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    },

    async loadCommentsCount(ruleId) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${this.config.apiBaseUrl}/comments?entity_type=rule&entity_id=${encodeURIComponent(ruleId)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) return 0;

            const result = await response.json();

            let comments;
            if (Array.isArray(result.data)) {
                comments = result.data;
            } else if (result.data && Array.isArray(result.data.comments)) {
                comments = result.data.comments;
            } else if (Array.isArray(result.comments)) {
                comments = result.comments;
            } else {
                return 0;
            }

            return comments.length;

        } catch (error) {
            console.warn('Failed to load comments count:', error);
            return 0;
        }
    },

    renderTabbedView(rule) {
        const commentsCount = rule.comments_count || 0;
        const hasTestData = rule.logic?.test_data && rule.logic.test_data.length > 0;
        const hasLuaCode = rule.logic?.lua;

        return `
            <style>
                .btn-icon-edit {
                    background: transparent;
                    border: none;
                    color: var(--brand-primary);
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                    font-size: 14px;
                }
                .btn-icon-edit:hover {
                    background: rgba(99, 102, 241, 0.1);
                    color: #5558e3;
                }
                .editable-field-container {
                    margin-bottom: 16px;
                }
                .field-label {
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 8px;
                }
                .field-info-badge {
                    display: inline-block;
                    font-size: 10px;
                    color: var(--text-muted);
                    margin-left: 8px;
                    font-style: italic;
                }

                /* Workflow Styles */
                .workflow-section {
                    margin: 20px 0;
                    padding: 16px;
                    background: rgba(59, 130, 246, 0.05);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 8px;
                }

                .workflow-header {
                    margin-bottom: 12px;
                }

                .workflow-title {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .workflow-current-status {
                    margin-bottom: 16px;
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-weight: 500;
                }

                .workflow-info-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .workflow-info-grid .info-item {
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 4px;
                }

                .workflow-info-grid .info-item label {
                    display: block;
                    font-size: 11px;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    margin-bottom: 4px;
                }

                .workflow-info-grid .info-item span,
                .workflow-info-grid .info-item a {
                    display: block;
                    font-size: 13px;
                    color: var(--text-primary);
                }

                .workflow-transitions {
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .transitions-label {
                    display: block;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    margin-bottom: 8px;
                }

                .transitions-buttons {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .btn-workflow {
                    padding: 6px 12px;
                    font-size: 12px;
                    border-radius: 4px;
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    color: #3b82f6;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-workflow:hover {
                    background: rgba(59, 130, 246, 0.2);
                    border-color: #3b82f6;
                }

                /* Workflow Modal Styles */
                .workflow-status-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .workflow-modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                }

                .workflow-modal-content {
                    position: relative;
                    background: var(--card-bg);
                    border-radius: 8px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                    z-index: 1;
                }

                .workflow-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                    border-bottom: 1px solid var(--border-color);
                }

                .workflow-modal-header h4 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                }

                .workflow-modal-close {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    font-size: 20px;
                    padding: 0;
                }

                .workflow-modal-close:hover {
                    color: var(--text-primary);
                }

                .workflow-modal-body {
                    padding: 16px;
                }

                .workflow-modal-footer {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                    padding: 16px;
                    border-top: 1px solid var(--border-color);
                }

                .required {
                    color: #ef4444;
                }

                .form-group {
                    margin-bottom: 16px;
                }

                .form-label {
                    display: block;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 8px;
                }

                .form-control {
                    width: 100%;
                    padding: 8px 12px;
                    font-size: 14px;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    background: var(--input-bg);
                    color: var(--text-primary);
                }

                .form-control:focus {
                    outline: none;
                    border-color: var(--brand-primary);
                }
            </style>
            <div class="rule-modal-content">
                <ul class="nav nav-tabs rule-tabs" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" data-tab="info" role="tab">
                            <i class="fas fa-info-circle"></i> Информация
                        </button>
                    </li>
                    ${hasLuaCode ? `
                    <li class="nav-item">
                        <button class="nav-link" data-tab="logic" role="tab">
                            <i class="fas fa-code"></i> Логика правила
                        </button>
                    </li>
                    ` : ''}
                    ${hasTestData ? `
                    <li class="nav-item">
                        <button class="nav-link" data-tab="tests" role="tab">
                            <i class="fas fa-flask"></i> Тестовые данные
                            <span class="badge badge-primary">${rule.logic.test_data.length}</span>
                        </button>
                    </li>
                    ` : ''}
                    <li class="nav-item">
                        <button class="nav-link" data-tab="comments" role="tab">
                            <i class="fas fa-comments"></i> Комментарии
                            <span class="badge badge-primary">${commentsCount}</span>
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane active" data-tab-content="info">
                        ${this.renderInfoTabContent(rule)}
                    </div>
                    ${hasLuaCode ? `
                    <div class="tab-pane" data-tab-content="logic" style="display:none">
                        ${this.renderLogicTab(rule)}
                    </div>
                    ` : ''}
                    ${hasTestData ? `
                    <div class="tab-pane" data-tab-content="tests" style="display:none">
                        ${this.renderTestsTab(rule)}
                    </div>
                    ` : ''}
                    <div class="tab-pane" data-tab-content="comments" style="display:none">
                        <div id="rule-comments-widget-container"></div>
                    </div>
                </div>
            </div>
        `;
    },

    renderEditableFields(rule) {
        return `
            <div class="info-card">
                <div class="card-header">
                    <h3><i class="fas fa-edit"></i> Основная информация</h3>
                </div>
                <div class="card-body">
                    <div class="editable-field-container">
                        <div class="field-label">Название (English)</div>
                        <div id="field-name">${this.renderFieldDisplay('name', rule)}</div>
                    </div>

                    <div class="editable-field-container">
                        <div class="field-label">Название (Русский)</div>
                        <div id="field-name_ru">${this.renderFieldDisplay('name_ru', rule)}</div>
                    </div>

                    <div class="editable-field-container">
                        <div class="field-label">Описание (English)</div>
                        <div id="field-description">${this.renderFieldDisplay('description', rule)}</div>
                    </div>

                    <div class="editable-field-container">
                        <div class="field-label">Описание (Русский)</div>
                        <div id="field-description_ru">${this.renderFieldDisplay('description_ru', rule)}</div>
                    </div>

                    <div class="editable-field-container">
                        <div class="field-label">
                            Автор
                            <span class="field-info-badge">(Системное поле)</span>
                        </div>
                        <div id="field-author">${this.renderFieldDisplay('author', rule)}</div>
                    </div>

                    <div class="editable-field-container">
                        <div class="field-label">
                            Техника MITRE ATT&CK
                            <span class="field-info-badge">(Системное поле)</span>
                        </div>
                        <div id="field-technique_id">${this.renderFieldDisplay('technique_id', rule)}</div>
                    </div>
                </div>
            </div>
        `;
    },

    renderStatsSection(rule) {
        const status = this.getRuleStatus(rule);
        const severity = this.getSeverityInfo(rule);
        const shortId = this.shortenId(rule.id);
        const pangeoUrl = `${this.config.pangeoRadarBaseUrl}/${rule.id}`;

        return `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-fingerprint"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-label">ID Правила</div>
                    <div class="stat-value" title="${this.escapeHtml(rule.id)}">${this.escapeHtml(shortId)}</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon ${status.iconClass}">
                    <i class="${status.icon}"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-label">
                        Статус
                        ${!this.currentState.editingFields.has('status') ? `
                        <button class="btn-icon-edit" onclick="RuleModal.startEditField('status')" title="Изменить статус" style="margin-left: 8px;">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        ` : ''}
                    </div>
                    <div id="field-status">
                        ${this.currentState.editingFields.has('status')
                ? this.renderEditableField('status', rule)
                : `<span class="badge ${status.badgeClass}">${status.label}</span>`
            }
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon ${severity.iconClass}">
                    <i class="${severity.icon}"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-label">
                        Уровень риска
                        ${!this.currentState.editingFields.has('severity') ? `
                        <button class="btn-icon-edit" onclick="RuleModal.startEditField('severity')" title="Изменить уровень риска" style="margin-left: 8px;">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        ` : ''}
                    </div>
                    <div id="field-severity">
                        ${this.currentState.editingFields.has('severity')
                ? this.renderEditableField('severity', rule)
                : `<span class="badge ${severity.badgeClass}">${severity.label}</span>`
            }
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-user"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Автор</div>
                    <div class="stat-value">${this.escapeHtml(rule.author || 'System')}</div>
                </div>
            </div>

            ${rule.technique_id ? `
            <div class="stat-card" onclick="RuleModal.openTechnique('${rule.technique_id}')" style="cursor:pointer">
                <div class="stat-icon">
                    <i class="fas fa-bullseye"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Техника MITRE</div>
                    <div class="stat-value">
                        <strong>${this.escapeHtml(rule.technique_id)}</strong>
                        ${rule.technique_name_ru ? `<br><small>${this.escapeHtml(rule.technique_name_ru)}</small>` : ''}
                    </div>
                </div>
            </div>
            ` : ''}

            ${rule.confidence ? `
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Уверенность</div>
                    <div class="stat-value">${this.getConfidenceLabel(rule.confidence)}</div>
                </div>
            </div>
            ` : ''}

            <div class="stat-card" onclick="window.open('${pangeoUrl}', '_blank')" style="cursor:pointer; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);">
                <div class="stat-icon" style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white;">
                    <i class="fas fa-external-link-alt"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Открыть</div>
                    <div class="stat-value" style="color: #6366f1; font-weight: 600;">
                        в Pangeo Radar
                        <i class="fas fa-arrow-right" style="font-size: 12px; margin-left: 4px;"></i>
                    </div>
                </div>
            </div>
        </div>
    `;
    },

    renderTechnicalInfo(rule) {
        const settings = rule.custom_fields?.settings;
        if (!settings) return '';

        return `
            <div class="info-card">
                <div class="card-header">
                    <h3><i class="fas fa-cog"></i> Настройки правила</h3>
                </div>
                <div class="card-body">
                    <div class="technical-details-grid">
                        <div class="info-card">
                            <div class="card-header">
                                <h4><i class="fas fa-bell"></i> Алерты</h4>
                            </div>
                            <div class="card-body">
                                <ul class="metadata-list">
                                    ${settings.max_alerts ? `<li><i class="fas fa-hashtag"></i> <strong>Макс. алертов:</strong> ${settings.max_alerts}</li>` : ''}
                                    ${settings.max_alerts_interval ? `<li><i class="fas fa-clock"></i> <strong>Интервал:</strong> ${settings.max_alerts_interval} мин</li>` : ''}
                                    <li><i class="fas ${settings.is_auto_finding ? 'fa-check-circle text-success' : 'fa-times-circle text-muted'}"></i> <strong>Авто-находка:</strong> ${settings.is_auto_finding ? 'Да' : 'Нет'}</li>
                                    <li><i class="fas ${settings.is_constructor ? 'fa-check-circle text-success' : 'fa-times-circle text-muted'}"></i> <strong>Конструктор:</strong> ${settings.is_constructor ? 'Да' : 'Нет'}</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderMetadata(rule) {
        return `
            <div class="technical-details-grid">
                ${this.renderReferences(rule)}
                ${this.renderTimestamps(rule)}
                ${this.renderCustomFields(rule)}
            </div>
        `;
    },

    renderReferences(rule) {
        if (!rule.references || rule.references.length === 0) return '';

        return `
            <div class="info-card">
                <div class="card-header">
                    <h4><i class="fas fa-link"></i> Ссылки</h4>
                </div>
                <div class="card-body">
                    <ul class="metadata-list">
                        ${rule.references.map(ref => `
                            <li><i class="fas fa-external-link-alt"></i> <a href="${this.escapeHtml(ref)}" target="_blank">${this.escapeHtml(ref)}</a></li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;
    },

    renderTimestamps(rule) {
        return `
            <div class="info-card">
                <div class="card-header">
                    <h4><i class="fas fa-clock"></i> Временные метки</h4>
                </div>
                <div class="card-body">
                    <ul class="metadata-list">
                        <li><i class="fas fa-plus-circle"></i> <strong>Создано:</strong> ${this.formatDate(rule.created_at)}</li>
                        <li><i class="fas fa-edit"></i> <strong>Обновлено:</strong> ${this.formatDate(rule.updated_at)}</li>
                    </ul>
                </div>
            </div>
        `;
    },

    renderCustomFields(rule) {
        const cf = rule.custom_fields;
        if (!cf) return '';

        return `
            <div class="info-card">
                <div class="card-header">
                    <h4><i class="fas fa-info-circle"></i> Дополнительно</h4>
                </div>
                <div class="card-body">
                    <ul class="metadata-list">
                        ${cf.result_count !== undefined ? `<li><i class="fas fa-list-ol"></i> <strong>Результатов:</strong> ${cf.result_count}</li>` : ''}
                        ${cf.error_count !== undefined ? `<li><i class="fas ${cf.error_count > 0 ? 'fa-exclamation-triangle text-warning' : 'fa-check-circle text-success'}"></i> <strong>Ошибок:</strong> ${cf.error_count}</li>` : ''}
                    </ul>
                </div>
            </div>
        `;
    },

    renderLogicTab(rule) {
        const lua = rule.logic?.lua;
        if (!lua) return '<div class="empty-state"><p>Логика правила отсутствует</p></div>';

        return `
            <div class="info-card">
                <div class="card-header">
                    <h3><i class="fas fa-code"></i> Lua код правила</h3>
                </div>
                <div class="card-body">
                    <pre class="code-block"><code>${this.escapeHtml(lua)}</code></pre>
                </div>
            </div>
        `;
    },

    renderTestsTab(rule) {
        const testData = rule.logic?.test_data;
        if (!testData || testData.length === 0) {
            return '<div class="empty-state"><p>Тестовые данные отсутствуют</p></div>';
        }

        return `
            <div class="tests-container">
                ${testData.map((test, index) => `
                    <div class="info-card">
                        <div class="card-header">
                            <h4><i class="fas fa-vial"></i> Тестовый случай #${index + 1}</h4>
                        </div>
                        <div class="card-body">
                            <pre class="code-block"><code>${this.escapeHtml(test)}</code></pre>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    attachTabHandlers() {
        const tabButtons = document.querySelectorAll('.rule-tabs .nav-link');

        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(button.dataset.tab);
            });
        });
    },

    async switchTab(tabName) {
        console.log('Switching to tab:', tabName);

        const tabButtons = document.querySelectorAll('.rule-tabs .nav-link');
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

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

    async initCommentsWidget() {
        if (typeof CommentsWidget === 'undefined') {
            const container = document.getElementById('rule-comments-widget-container');
            if (container) {
                container.innerHTML = `<div class="alert alert-danger">Модуль комментариев не загружен</div>`;
            }
            return;
        }

        try {
            const container = document.getElementById('rule-comments-widget-container');
            if (!container) return;

            if (this.currentState.commentsWidget) {
                try {
                    this.currentState.commentsWidget.destroy();
                } catch (e) {
                    console.warn('Failed to destroy previous widget:', e);
                }
                this.currentState.commentsWidget = null;
            }

            container.innerHTML = '';

            const rule = this.currentState.currentRule;
            if (!rule) return;

            const ruleId = rule.id || rule.rule_id;
            if (!ruleId) return;

            this.currentState.commentsWidget = CommentsWidget.create({
                containerId: 'rule-comments-widget-container',
                entityType: 'rule',
                entityId: String(ruleId),
                showSearch: true,
                showFilters: true,
                allowAdd: true,
                allowEdit: true,
                allowDelete: true,
                pageSize: 10,
                autoRefresh: 0,
                onUpdate: (comments) => {
                    this.updateCommentsCount(comments.length);
                },
                onError: (error) => {
                    console.error('Comments widget error:', error);
                }
            });

            await this.currentState.commentsWidget.init();

        } catch (error) {
            console.error('❌ Failed to initialize comments widget:', error);
            const container = document.getElementById('rule-comments-widget-container');
            if (container) {
                container.innerHTML = `<div class="alert alert-danger">Ошибка загрузки комментариев</div>`;
            }
        }
    },

    updateCommentsCount(count) {
        const badge = document.querySelector('[data-tab="comments"] .badge');
        if (badge) {
            badge.textContent = count;
        }

        if (this.currentState.currentRule) {
            this.currentState.currentRule.comments_count = count;
        }
    },

    async loadRuleDetails(ruleId) {
        try {
            const token = localStorage.getItem('authToken');

            const response = await fetch(`${this.config.apiBaseUrl}/rules/${encodeURIComponent(ruleId)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.data) {
                return result.data;
            }

            throw new Error('Неверный формат ответа API');

        } catch (error) {
            console.error('❌ Error loading rule:', error);
            throw error;
        }
    },

    async openTechnique(techniqueId) {
        if (typeof TechniqueModal !== 'undefined' && TechniqueModal.view) {
            await TechniqueModal.view(techniqueId);
        }
    },

    shortenId(id) {
        if (!id) return '—';
        if (id.length <= 12) return id;
        return id.substring(0, 8) + '...';
    },

    getConfidenceLabel(confidence) {
        const map = {
            'low': 'Низкая',
            'medium': 'Средняя',
            'high': 'Высокая'
        };
        return map[confidence] || confidence;
    },

    getRuleStatus(rule) {
        const active = rule.active === 1 || rule.status === 'active';
        const status = rule.status || (active ? 'active' : 'disabled');

        const statusMap = {
            'active': {
                label: 'Активно',
                icon: 'fas fa-check-circle',
                iconClass: 'text-success',
                badgeClass: 'badge-success'
            },
            'disabled': {
                label: 'Отключено',
                icon: 'fas fa-times-circle',
                iconClass: 'text-secondary',
                badgeClass: 'badge-secondary'
            }
        };

        return statusMap[status] || statusMap['disabled'];
    },

    getSeverityInfo(rule) {
        const severity = rule.severity || 'medium';

        const severityMap = {
            'low': {
                label: 'Низкий',
                icon: 'fas fa-info-circle',
                iconClass: 'text-info',
                badgeClass: 'badge-info'
            },
            'medium': {
                label: 'Средний',
                icon: 'fas fa-exclamation-circle',
                iconClass: 'text-warning',
                badgeClass: 'badge-warning'
            },
            'high': {
                label: 'Высокий',
                icon: 'fas fa-exclamation-triangle',
                iconClass: 'text-orange',
                badgeClass: 'badge-orange'
            },
            'critical': {
                label: 'Критический',
                icon: 'fas fa-skull-crossbones',
                iconClass: 'text-danger',
                badgeClass: 'badge-danger'
            }
        };

        return severityMap[severity] || severityMap['medium'];
    },

    capitalize(text) {
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1);
    },

    formatDate(dateString) {
        if (!dateString) return '—';

        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    nl2br(text) {
        if (!text) return '';
        return text.replace(/\n/g, '<br>');
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
        return String(text).replace(/[&<>"']/g, (m) => map[m]);
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

    cleanup() {
        console.log('🧹 Cleaning up RuleModal...');

        if (this.currentState.commentsWidget) {
            try {
                this.currentState.commentsWidget.destroy();
            } catch (e) {
                console.warn('Failed to destroy comments widget:', e);
            }
        }

        this.currentState = {
            currentRule: null,
            currentModalId: null,
            commentsWidget: null,
            activeTab: 'info',
            editingFields: new Set(),
            workflowManager: null
        };

        console.log('✅ RuleModal cleaned up');
    },

    close() {
        if (this.currentState.currentModalId && typeof ModalEngine !== 'undefined') {
            ModalEngine.close(this.currentState.currentModalId);
        }
        this.cleanup();
    }
};

window.RuleModal = RuleModal;

console.log('✅ RuleModal v31.0 with Workflow Status Manager loaded');
