/**
 * =============================================================================
 * RULE MODAL v34.0 - ПОЛНАЯ СОВМЕСТИМАЯ РЕАЛИЗАЦИЯ
 * =============================================================================
 * @version 34.0.0
 * @date 2025-10-27
 * 
 * АРХИТЕКТУРА:
 * - window.RuleModal - глобальный ОБЪЕКТ (не класс!)
 * - Интеграция с ModalEngine.open()
 * - Workflow статусы с валидацией
 * - Табы: Info, Logic, Tests, Comments
 * - Inline редактирование полей
 * 
 * WORKFLOW СТАТУСЫ:
 * - not_started: Не взято в работу
 * - info_required: Требуется информация (+ обязательный комментарий)
 * - in_progress: В работе (+ обязательный исполнитель)
 * - stopped: Остановлено (+ обязательная причина)
 * - returned: Возвращено (+ обязательная причина возврата)
 * - ready_for_testing: Готово к тестированию
 * - tested: Протестировано
 * - deployed: Выгружено в Git (+ обязательная ссылка на MR)
 * =============================================================================
 */

// =============================================================================
// WORKFLOW STATUS MANAGER - УПРАВЛЕНИЕ СТАТУСАМИ
// =============================================================================

class WorkflowStatusManager {
    /**
     * Конфигурация всех workflow статусов
     */
    static STATUSES = {
        not_started: {
            key: 'not_started',
            label: 'Не взято в работу',
            icon: 'fa-clock',
            color: '#6c757d',
            bgColor: '#f8f9fa',
            description: 'Правило еще не взято в разработку',
            requiresComment: false,
            requiresAssignee: false,
            allowEdit: true,
            nextStatuses: ['info_required', 'in_progress']
        },
        info_required: {
            key: 'info_required',
            label: 'Требуется информация',
            icon: 'fa-question-circle',
            color: '#ffc107',
            bgColor: '#fff3cd',
            description: 'Необходима дополнительная информация',
            requiresComment: true,
            requiresAssignee: false,
            allowEdit: false,
            nextStatuses: ['in_progress', 'not_started']
        },
        in_progress: {
            key: 'in_progress',
            label: 'В работе',
            icon: 'fa-spinner',
            color: '#0dcaf0',
            bgColor: '#cff4fc',
            description: 'Правило находится в разработке',
            requiresComment: false,
            requiresAssignee: true,
            allowEdit: true,
            nextStatuses: ['stopped', 'ready_for_testing', 'returned']
        },
        stopped: {
            key: 'stopped',
            label: 'Остановлено',
            icon: 'fa-pause-circle',
            color: '#fd7e14',
            bgColor: '#ffe5d0',
            description: 'Работа временно остановлена',
            requiresComment: true,
            requiresAssignee: false,
            allowEdit: false,
            nextStatuses: ['in_progress', 'not_started']
        },
        returned: {
            key: 'returned',
            label: 'Возвращено',
            icon: 'fa-undo',
            color: '#dc3545',
            bgColor: '#f8d7da',
            description: 'Возвращено на доработку',
            requiresComment: true,
            requiresAssignee: false,
            allowEdit: true,
            nextStatuses: ['in_progress', 'info_required']
        },
        ready_for_testing: {
            key: 'ready_for_testing',
            label: 'Готово к тестированию',
            icon: 'fa-check-circle',
            color: '#8b5cf6',
            bgColor: '#e9d5ff',
            description: 'Правило готово для тестирования',
            requiresComment: false,
            requiresAssignee: false,
            allowEdit: false,
            nextStatuses: ['tested', 'returned']
        },
        tested: {
            key: 'tested',
            label: 'Протестировано',
            icon: 'fa-flask',
            color: '#10b981',
            bgColor: '#d1fae5',
            description: 'Правило успешно протестировано',
            requiresComment: false,
            requiresAssignee: false,
            allowEdit: false,
            nextStatuses: ['deployed', 'returned']
        },
        deployed: {
            key: 'deployed',
            label: 'Выгружено в Git',
            icon: 'fa-code-branch',
            color: '#198754',
            bgColor: '#d1e7dd',
            description: 'Правило выгружено в репозиторий',
            requiresComment: true, // Ссылка на MR обязательна
            requiresAssignee: false,
            allowEdit: false,
            nextStatuses: []
        }
    };

    constructor(ruleId) {
        this.ruleId = ruleId;
        this.currentStatus = 'not_started';
        this.rule = null;
        this.cachedUsers = [];
    }

    /**
     * Получить информацию о статусе
     */
    static getStatusInfo(statusKey) {
        return this.STATUSES[statusKey] || this.STATUSES.not_started;
    }

    /**
     * Установить текущее правило
     */
    setRule(rule) {
        this.rule = rule;
        this.currentStatus = rule.workflow_status || 'not_started';
    }

    /**
     * Валидация возможности перехода на новый статус
     */
    canTransitionTo(newStatus) {
        const currentInfo = WorkflowStatusManager.getStatusInfo(this.currentStatus);
        return currentInfo.nextStatuses.includes(newStatus);
    }

    /**
     * Рендер workflow панели
     */
    renderWorkflowPanel() {
        const statusInfo = WorkflowStatusManager.getStatusInfo(this.currentStatus);

        return `
            <div class="workflow-panel" style="
                background: linear-gradient(135deg, ${statusInfo.bgColor} 0%, ${statusInfo.bgColor} 100%);
                border-left: 4px solid ${statusInfo.color};
                padding: 20px;
                margin: 20px 0;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                <!-- Текущий статус -->
                <div class="workflow-current" style="margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <div style="
                            background: ${statusInfo.color};
                            width: 48px;
                            height: 48px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">
                            <i class="fas ${statusInfo.icon}" style="color: white; font-size: 20px;"></i>
                        </div>
                        <div>
                            <h4 style="margin: 0; font-size: 1.2em; color: ${statusInfo.color};">
                                ${statusInfo.label}
                            </h4>
                            <p style="margin: 0; font-size: 0.9em; color: #6c757d;">
                                ${statusInfo.description}
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Кнопки переходов -->
                <div style="margin-top: 20px;">
                    <h5 style="font-size: 0.95em; color: #495057; margin-bottom: 12px;">
                        <i class="fas fa-exchange-alt"></i> Доступные переходы:
                    </h5>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
                        ${this.renderStatusButtons()}
                    </div>
                </div>

                <!-- История изменений -->
                ${this.renderWorkflowHistory()}
            </div>
        `;
    }

    /**
     * Рендер кнопок смены статуса
     */
    renderStatusButtons() {
        const currentInfo = WorkflowStatusManager.getStatusInfo(this.currentStatus);
        const availableStatuses = currentInfo.nextStatuses;

        if (availableStatuses.length === 0) {
            return `<p style="color: #6c757d; font-style: italic;">Нет доступных переходов</p>`;
        }

        let buttons = '';

        for (const statusKey of availableStatuses) {
            const statusInfo = WorkflowStatusManager.getStatusInfo(statusKey);

            buttons += `
                <button 
                    class="btn-workflow-transition"
                    onclick="window.RuleModal.changeWorkflowStatus('${statusKey}')"
                    style="
                        background: white;
                        border: 2px solid ${statusInfo.color};
                        color: ${statusInfo.color};
                        padding: 10px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.3s;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        justify-content: center;
                        font-weight: 500;
                    "
                    onmouseover="this.style.background='${statusInfo.color}'; this.style.color='white';"
                    onmouseout="this.style.background='white'; this.style.color='${statusInfo.color}';"
                >
                    <i class="fas ${statusInfo.icon}"></i>
                    <span>${statusInfo.label}</span>
                </button>
            `;
        }

        return buttons;
    }

    /**
     * Рендер истории изменений
     */
    renderWorkflowHistory() {
        if (!this.rule || !this.rule.workflow_updated_at) {
            return '';
        }

        const updatedDate = new Date(this.rule.workflow_updated_at).toLocaleString('ru-RU');
        const updatedBy = this.rule.workflow_updated_by_name || 'Система';
        const assigneeName = this.rule.assignee_name || 'Не назначен';

        return `
            <div class="workflow-history" style="
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid rgba(0,0,0,0.1);
            ">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <!-- Исполнитель -->
                    <div>
                        <small style="color: #6c757d; display: block; margin-bottom: 4px;">
                            <i class="fas fa-user"></i> Исполнитель
                        </small>
                        <strong style="color: #212529;">${assigneeName}</strong>
                    </div>

                    <!-- Последнее изменение -->
                    <div>
                        <small style="color: #6c757d; display: block; margin-bottom: 4px;">
                            <i class="fas fa-clock"></i> Обновлено
                        </small>
                        <strong style="color: #212529;">${updatedDate}</strong>
                    </div>

                    <!-- Кем изменено -->
                    <div>
                        <small style="color: #6c757d; display: block; margin-bottom: 4px;">
                            <i class="fas fa-user-edit"></i> Изменил
                        </small>
                        <strong style="color: #212529;">${updatedBy}</strong>
                    </div>
                </div>

                ${this.rule.stopped_reason ? `
                    <div style="margin-top: 12px; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px;">
                        <small style="color: #856404;">
                            <i class="fas fa-exclamation-triangle"></i> <strong>Причина остановки:</strong><br>
                            ${this.escapeHtml(this.rule.stopped_reason)}
                        </small>
                    </div>
                ` : ''}

                ${this.rule.deployment_mr_url ? `
                    <div style="margin-top: 12px;">
                        <small style="color: #6c757d;">
                            <i class="fas fa-code-branch"></i> <strong>MR URL:</strong>
                        </small>
                        <a href="${this.escapeHtml(this.rule.deployment_mr_url)}" target="_blank" style="color: #0d6efd; text-decoration: none;">
                            ${this.escapeHtml(this.rule.deployment_mr_url)}
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Изменить workflow статус
     */
    async changeWorkflow(newStatus) {
        try {
            console.log(`🔄 Workflow transition: ${this.currentStatus} → ${newStatus}`);

            // Валидация перехода
            if (!this.canTransitionTo(newStatus)) {
                throw new Error(`Переход ${this.currentStatus} → ${newStatus} не разрешен`);
            }

            const statusInfo = WorkflowStatusManager.getStatusInfo(newStatus);

            // Собрать данные для запроса
            const payload = {
                workflow_status: newStatus
            };

            // Если нужен исполнитель
            if (statusInfo.requiresAssignee) {
                await this.loadUsers();
                const assigneeId = await this.promptForAssignee();
                if (!assigneeId) {
                    throw new Error('Не выбран исполнитель');
                }
                payload.assignee_id = assigneeId;
            }

            // Если нужен комментарий
            if (statusInfo.requiresComment) {
                const comment = await this.promptForComment(newStatus);
                if (!comment || comment.trim() === '') {
                    throw new Error('Комментарий обязателен для этого статуса');
                }

                // Для разных статусов разные поля
                if (newStatus === 'stopped') {
                    payload.stopped_reason = comment;
                } else if (newStatus === 'deployed') {
                    payload.deployment_mr_url = comment;
                } else {
                    payload.comment_text = comment;
                }
            }

            // Отправка запроса
            const response = await fetch(`/api/rules/${this.ruleId}/workflow-status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Неизвестная ошибка');
            }

            console.log('✅ Workflow changed successfully');

            // Обновить локальное состояние
            this.currentStatus = newStatus;
            if (this.rule) {
                this.rule.workflow_status = newStatus;
                Object.assign(this.rule, result.data);
            }

            // Показать уведомление
            this.showNotification(`Статус изменен на "${statusInfo.label}"`, 'success');

            // Перерендерить панель
            this.refreshPanel();

            return result.data;

        } catch (error) {
            console.error('❌ Error changing workflow:', error);
            this.showNotification(`Ошибка: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Загрузить список пользователей
     */
    async loadUsers() {
        if (this.cachedUsers.length > 0) {
            return this.cachedUsers;
        }

        try {
            const response = await fetch('/api/users/list', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            // Обработка разных форматов ответа
            let users = [];
            if (Array.isArray(result)) {
                users = result;
            } else if (result.data?.users && Array.isArray(result.data.users)) {
                users = result.data.users;
            } else if (result.data && Array.isArray(result.data)) {
                users = result.data;
            } else if (result.users && Array.isArray(result.users)) {
                users = result.users;
            }

            this.cachedUsers = users.filter(u => u.is_active !== false);

            console.log(`✅ Loaded ${this.cachedUsers.length} users`);

            return this.cachedUsers;

        } catch (error) {
            console.error('❌ Error loading users:', error);
            this.cachedUsers = [];
            return [];
        }
    }

    /**
   * Показать диалог для выбора исполнителя
   */
    async promptForAssignee() {
        return new Promise((resolve) => {
            const users = this.cachedUsers;

            if (users.length === 0) {
                alert('Нет доступных пользователей');
                resolve(null);
                return;
            }

            const modalId = `assignee-modal-${Date.now()}`;
            const options = users.map(u => `
                <option value="${u.id}">${this.escapeHtml(u.full_name || u.username)}</option>
            `).join('');

            const html = `
                <div style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    z-index: 10001;
                    min-width: 400px;
                ">
                    <h4 style="margin-top: 0; color: #212529;">
                        <i class="fas fa-user-check"></i> Выберите исполнителя
                    </h4>
                    <select id="assignee-select-${Date.now()}" style="
                        width: 100%;
                        padding: 10px;
                        border: 1px solid #ced4da;
                        border-radius: 6px;
                        margin-bottom: 20px;
                        font-size: 1em;
                    ">
                        <option value="">-- Выберите пользователя --</option>
                        ${options}
                    </select>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="document.getElementById('${modalId}').remove(); window.RuleModal.assigneeResolve(null);" style="
                            padding: 8px 16px;
                            border: 1px solid #ced4da;
                            background: white;
                            border-radius: 6px;
                            cursor: pointer;
                        ">Отмена</button>
                        <button onclick="const val = document.getElementById('assignee-select-${Date.now()}').value; document.getElementById('${modalId}').remove(); window.RuleModal.assigneeResolve(val || null);" style="
                            padding: 8px 16px;
                            border: none;
                            background: #0d6efd;
                            color: white;
                            border-radius: 6px;
                            cursor: pointer;
                        ">Выбрать</button>
                    </div>
                </div>
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 10000;
                " onclick="document.getElementById('${modalId}').remove(); window.RuleModal.assigneeResolve(null);"></div>
            `;

            const container = document.createElement('div');
            container.id = modalId;
            container.innerHTML = html;
            document.body.appendChild(container);

            window.RuleModal.assigneeResolve = resolve;
        });
    }

    /**
     * Показать диалог для ввода комментария
     */
    async promptForComment(statusKey) {
        return new Promise((resolve) => {
            const statusInfo = WorkflowStatusManager.getStatusInfo(statusKey);

            let placeholder = 'Введите комментарий...';
            let label = 'Комментарий';

            if (statusKey === 'stopped') {
                label = 'Причина остановки';
                placeholder = 'Почему работа остановлена?';
            } else if (statusKey === 'returned') {
                label = 'Причина возврата';
                placeholder = 'Почему правило возвращено?';
            } else if (statusKey === 'deployed') {
                label = 'Ссылка на Merge Request';
                placeholder = 'https://gitlab.example.com/path/to/merge_request';
            } else if (statusKey === 'info_required') {
                label = 'Требуемая информация';
                placeholder = 'Какая информация требуется?';
            }

            const modalId = `comment-modal-${Date.now()}`;

            const html = `
                <div style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    z-index: 10001;
                    min-width: 500px;
                ">
                    <h4 style="margin-top: 0; color: #212529;">
                        <i class="fas ${statusInfo.icon}"></i> ${label}
                    </h4>
                    <textarea id="comment-text-${Date.now()}" style="
                        width: 100%;
                        padding: 12px;
                        border: 1px solid #ced4da;
                        border-radius: 6px;
                        margin-bottom: 20px;
                        font-size: 1em;
                        font-family: inherit;
                        resize: vertical;
                        min-height: 100px;
                    " placeholder="${placeholder}"></textarea>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="document.getElementById('${modalId}').remove(); window.RuleModal.commentResolve(null);" style="
                            padding: 8px 16px;
                            border: 1px solid #ced4da;
                            background: white;
                            border-radius: 6px;
                            cursor: pointer;
                        ">Отмена</button>
                        <button onclick="const val = document.getElementById('comment-text-${Date.now()}').value; document.getElementById('${modalId}').remove(); window.RuleModal.commentResolve(val || null);" style="
                            padding: 8px 16px;
                            border: none;
                            background: ${statusInfo.color};
                            color: white;
                            border-radius: 6px;
                            cursor: pointer;
                        ">Сохранить</button>
                    </div>
                </div>
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 10000;
                " onclick="document.getElementById('${modalId}').remove(); window.RuleModal.commentResolve(null);"></div>
            `;

            const container = document.createElement('div');
            container.id = modalId;
            container.innerHTML = html;
            document.body.appendChild(container);

            window.RuleModal.commentResolve = resolve;
        });
    }

    /**
     * Обновить panel после изменений
     */
    refreshPanel() {
        const container = document.getElementById('workflow-status-container');
        if (container) {
            container.innerHTML = this.renderWorkflowPanel();
        }
    }

    /**
     * Показать уведомление
     */
    showNotification(message, type = 'info') {
        const colors = {
            success: '#198754',
            error: '#dc3545',
            info: '#0dcaf0',
            warning: '#ffc107'
        };

        const notificationId = `notification-${Date.now()}`;
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
        `;
        notification.innerHTML = `
            <div style="display: flex; gap: 12px; align-items: center;">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                <span>${this.escapeHtml(message)}</span>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (document.getElementById(notificationId)) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// =============================================================================
// ГЛОБАЛЬНЫЙ ОБЪЕКТ RULEMODAL (совместимый с rules.js)
// =============================================================================

window.RuleModal = {
    // Внутреннее состояние
    config: {
        currentRuleId: null,
        currentRule: null,
        editMode: false,
        unsavedChanges: false,
        modalElement: null
    },

    // Внутренние сервисы
    workflowManager: null,
    commentsWidget: null,

    /**
     * ✅ ГЛАВНЫЙ МЕТОД: view(ruleId, options)
     * Точка входа из rules.js: window.RuleModal.view(ruleId)
     */
    async view(ruleId, options = {}) {
        console.log(`📖 RuleModal.view() called with ruleId: ${ruleId}`);
        return this.open(ruleId, options);
    },

    /**
     * ✅ АЛЬТЕРНАТИВНЫЙ МЕТОД: viewRule(ruleId) 
     * Для совместимости
     */
    async viewRule(ruleId) {
        return this.view(ruleId);
    },

    /**
     * Внутренний метод: open()
     */
    async open(ruleId, options = {}) {
        try {
            console.log(`🔍 Opening rule modal: ${ruleId}`, options);

            this.config.currentRuleId = ruleId;

            // Показать загрузку
            this.showLoadingState();

            // Загрузить данные правила
            await this.loadRuleDetails(ruleId);

            // Создать структуру модального окна
            this.createModalStructure();

            // Инициализировать workflow manager
            this.workflowManager = new WorkflowStatusManager(ruleId);
            this.workflowManager.setRule(this.config.currentRule);

            // Рендерить содержимое
            this.renderModalContent();

            // Показать модально окно
            this.showModalDialog();

            console.log('✅ Rule modal opened successfully');

        } catch (error) {
            console.error('❌ Error opening modal:', error);
            alert(`Ошибка открытия правила: ${error.message}`);
            this.close();
        }
    },

    /**
     * Загрузить детали правила
     */
    async loadRuleDetails(ruleId) {
        try {
            const token = localStorage.getItem('token');

            if (!token) {
                throw new Error('Токен авторизации не найден');
            }

            const response = await fetch(`/api/rules/${ruleId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Unknown API error');
            }

            this.config.currentRule = result.data;
            console.log('✅ Rule data loaded:', this.config.currentRule);

        } catch (error) {
            console.error('❌ Error loading rule details:', error);
            throw error;
        }
    },

    /**
     * Загрузить количество комментариев
     */
    async loadCommentsCount(ruleId) {
        try {
            const token = localStorage.getItem('token');

            const response = await fetch(`/api/comments/count?entity_type=rule&entity_id=${ruleId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) return 0;

            const result = await response.json();
            return result.data?.count || 0;

        } catch (error) {
            console.warn('Could not load comments count:', error);
            return 0;
        }
    },

    /**
     * Показать состояние загрузки
     */
    showLoadingState() {
        const loadingEl = document.getElementById('rule-modal-loading');
        const contentEl = document.getElementById('rule-modal-content');

        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
    },

    /**
     * Скрыть состояние загрузки
     */
    hideLoadingState() {
        const loadingEl = document.getElementById('rule-modal-loading');
        const contentEl = document.getElementById('rule-modal-content');

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
    },

    /**
     * Создать HTML структуру модального окна
     */
    createModalStructure() {
        // Удалить старое модальное окно
        const existing = document.getElementById('rule-modal');
        if (existing) {
            existing.remove();
        }

        const rule = this.config.currentRule;
        const modalHTML = `
            <div id="rule-modal" class="modal fade show" tabindex="-1" style="display: block; background: rgba(0,0,0,0.5);">
                <div class="modal-dialog modal-xl modal-dialog-scrollable" style="max-width: 95%; margin: 30px auto;">
                    <div class="modal-content" style="max-height: 90vh; border-radius: 12px; overflow: hidden;">
                        
                        <!-- Header -->
                        <div class="modal-header" style="
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            padding: 20px;
                            border-bottom: none;
                        ">
                            <div style="flex-grow: 1;">
                                <h5 class="modal-title" style="margin: 0; font-size: 1.3em; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-shield-alt"></i>
                                    <span id="modal-rule-name">${this.escapeHtml(rule.name || 'Правило корреляции')}</span>
                                </h5>
                                <small style="opacity: 0.8; margin-top: 5px; display: block;">
                                    ID: ${rule.id}
                                </small>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <button onclick="window.RuleModal.toggleEditMode()" class="btn btn-sm" style="
                                    background: rgba(255,255,255,0.2);
                                    border: 1px solid white;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 4px;
                                    cursor: pointer;
                                ">
                                    <i class="fas fa-edit"></i> Редактировать
                                </button>
                                <button onclick="window.RuleModal.close()" class="btn btn-sm" style="
                                    background: rgba(255,255,255,0.2);
                                    border: 1px solid white;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 4px;
                                    cursor: pointer;
                                ">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Body -->
                        <div class="modal-body" style="padding: 0; overflow-y: auto;">
                            <div id="rule-modal-loading" style="
                                text-align: center;
                                padding: 60px 20px;
                                background: #f8f9fa;
                            ">
                                <div style="font-size: 3em; color: #667eea; margin-bottom: 20px;">
                                    <i class="fas fa-spinner fa-spin"></i>
                                </div>
                                <p style="color: #6c757d; font-size: 1.1em;">Загрузка данных правила...</p>
                            </div>
                            
                            <div id="rule-modal-content" style="display: none; padding: 20px;">
                                <!-- Stats Grid -->
                                <div id="rule-stats-grid" style="margin-bottom: 30px;"></div>

                                <!-- Workflow Panel -->
                                <div id="rule-workflow-panel" style="margin-bottom: 30px;"></div>

                                <!-- Info Card -->
                                <div id="rule-info-card" style="margin-bottom: 30px;"></div>

                                <!-- Technical Details -->
                                <div id="rule-technical-details" style="margin-bottom: 30px;"></div>

                                <!-- Comments -->
                                <div id="rule-comments-section" style="margin-bottom: 30px;"></div>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div class="modal-footer" style="
                            padding: 15px 20px;
                            border-top: 1px solid #e9ecef;
                            background: #f8f9fa;
                        ">
                            <button onclick="window.RuleModal.close()" class="btn btn-secondary" style="
                                padding: 8px 16px;
                                background: #6c757d;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                            ">
                                <i class="fas fa-times"></i> Закрыть
                            </button>
                            <button id="modal-save-btn" onclick="window.RuleModal.saveChanges()" class="btn btn-success" style="
                                display: none;
                                padding: 8px 16px;
                                background: #198754;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                            ">
                                <i class="fas fa-save"></i> Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.config.modalElement = document.getElementById('rule-modal');
    },

    /**
     * Рендерить содержимое модального окна
     */
    renderModalContent() {
        this.hideLoadingState();

        // Рендерить все секции
        this.renderStatsGrid();
        this.renderWorkflowPanel();
        this.renderInfoCard();
        this.renderTechnicalDetails();
        this.renderCommentsSection();
    },

    /**
     * Рендерить Stats Grid
     */
    renderStatsGrid() {
        const container = document.getElementById('rule-stats-grid');
        if (!container) return;

        const rule = this.config.currentRule;
        const workflowInfo = WorkflowStatusManager.getStatusInfo(rule.workflow_status || 'not_started');

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px;">
                <!-- Workflow Status -->
                <div class="stat-card" style="
                    background: ${workflowInfo.bgColor};
                    padding: 18px;
                    border-radius: 10px;
                    border-left: 5px solid ${workflowInfo.color};
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                ">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="
                            background: ${workflowInfo.color};
                            width: 50px;
                            height: 50px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">
                            <i class="fas ${workflowInfo.icon}" style="color: white; font-size: 22px;"></i>
                        </div>
                        <div>
                            <div style="font-size: 0.85em; color: #6c757d; font-weight: 500;">Workflow</div>
                            <div style="font-weight: bold; font-size: 1.1em; color: #212529;">${workflowInfo.label}</div>
                        </div>
                    </div>
                </div>

                <!-- Active/Inactive -->
                <div class="stat-card" style="
                    background: ${rule.active ? '#d1e7dd' : '#f8d7da'};
                    padding: 18px;
                    border-radius: 10px;
                    border-left: 5px solid ${rule.active ? '#198754' : '#dc3545'};
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                ">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas ${rule.active ? 'fa-check-circle' : 'fa-times-circle'}" style="
                            color: ${rule.active ? '#198754' : '#dc3545'};
                            font-size: 50px;
                        "></i>
                        <div>
                            <div style="font-size: 0.85em; color: #6c757d; font-weight: 500;">Статус</div>
                            <div style="font-weight: bold; font-size: 1.1em; color: #212529;">
                                ${rule.active ? 'Активно' : 'Неактивно'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Priority -->
                <div class="stat-card" style="
                    background: #fff3cd;
                    padding: 18px;
                    border-radius: 10px;
                    border-left: 5px solid #ffc107;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                ">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-exclamation-triangle" style="color: #ffc107; font-size: 50px;"></i>
                        <div>
                            <div style="font-size: 0.85em; color: #6c757d; font-weight: 500;">Приоритет</div>
                            <div style="font-weight: bold; font-size: 1.1em; color: #212529; text-transform: capitalize;">
                                ${rule.priority || 'medium'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MITRE ATT&CK -->
                <div class="stat-card" style="
                    background: #cff4fc;
                    padding: 18px;
                    border-radius: 10px;
                    border-left: 5px solid #0dcaf0;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                ">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-shield-alt" style="color: #0dcaf0; font-size: 50px;"></i>
                        <div>
                            <div style="font-size: 0.85em; color: #6c757d; font-weight: 500;">MITRE ATT&CK</div>
                            <div style="font-weight: bold; font-size: 1.1em; color: #212529;">
                                ${rule.attack_id || 'Не указано'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Рендерить Workflow Panel
     */
    renderWorkflowPanel() {
        const container = document.getElementById('rule-workflow-panel');
        if (!container || !this.workflowManager) return;

        container.innerHTML = this.workflowManager.renderWorkflowPanel();
    },

    /**
     * Рендерить Info Card
     */
    renderInfoCard() {
        const container = document.getElementById('rule-info-card');
        if (!container) return;

        const rule = this.config.currentRule;

        container.innerHTML = `
            <div style="
                background: white;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h5 style="
                    margin-bottom: 20px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #e9ecef;
                    color: #212529;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                ">
                    <i class="fas fa-info-circle" style="color: #0dcaf0;"></i>
                    Основная информация
                </h5>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            Название (EN)
                        </label>
                        <input 
                            type="text" 
                            class="form-control rule-field" 
                            data-field="name" 
                            value="${this.escapeHtml(rule.name || '')}"
                            readonly
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        />
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            Название (RU)
                        </label>
                        <input 
                            type="text" 
                            class="form-control rule-field" 
                            data-field="name_ru" 
                            value="${this.escapeHtml(rule.name_ru || '')}"
                            readonly
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        />
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            MITRE ATT&CK ID
                        </label>
                        <input 
                            type="text" 
                            class="form-control rule-field" 
                            data-field="attack_id" 
                            value="${this.escapeHtml(rule.attack_id || '')}"
                            readonly
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        />
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            Приоритет
                        </label>
                        <select 
                            class="form-control rule-field" 
                            data-field="priority"
                            disabled
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        >
                            <option value="low" ${rule.priority === 'low' ? 'selected' : ''}>Низкий</option>
                            <option value="medium" ${rule.priority === 'medium' || !rule.priority ? 'selected' : ''}>Средний</option>
                            <option value="high" ${rule.priority === 'high' ? 'selected' : ''}>Высокий</option>
                            <option value="critical" ${rule.priority === 'critical' ? 'selected' : ''}>Критический</option>
                        </select>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 20px;">
                    <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                        Описание
                    </label>
                    <textarea 
                        class="form-control rule-field" 
                        data-field="description" 
                        rows="4"
                        readonly
                        style="
                            width: 100%;
                            padding: 10px 12px;
                            border: 1px solid #ced4da;
                            border-radius: 6px;
                            background: #f8f9fa;
                            font-size: 0.95em;
                            resize: vertical;
                        "
                    >${this.escapeHtml(rule.description || '')}</textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            Автор
                        </label>
                        <input 
                            type="text" 
                            class="form-control rule-field" 
                            data-field="author" 
                            value="${this.escapeHtml(rule.author || '')}"
                            readonly
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        />
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            Дата создания
                        </label>
                        <input 
                            type="text" 
                            class="form-control rule-field" 
                            data-field="created_at" 
                            value="${rule.created_at ? new Date(rule.created_at).toLocaleString('ru-RU') : 'Не указано'}"
                            readonly
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        />
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Рендерить Technical Details
     */
    renderTechnicalDetails() {
        const container = document.getElementById('rule-technical-details');
        if (!container) return;

        const rule = this.config.currentRule;

        container.innerHTML = `
            <div style="
                background: white;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h5 style="
                    margin-bottom: 20px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #e9ecef;
                    color: #212529;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                ">
                    <i class="fas fa-code" style="color: #0dcaf0;"></i>
                    Технические детали
                </h5>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                        Правило (Lua)
                    </label>
                    <textarea 
                        class="form-control rule-field" 
                        data-field="rule_text" 
                        rows="12"
                        readonly
                        style="
                            width: 100%;
                            padding: 12px;
                            border: 1px solid #ced4da;
                            border-radius: 6px;
                            background: #f8f9fa;
                            font-family: 'Courier New', 'Consolas', monospace;
                            font-size: 0.9em;
                            resize: vertical;
                            line-height: 1.5;
                        "
                    >${this.escapeHtml(rule.rule_text || '')}</textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            Теги
                        </label>
                        <input 
                            type="text" 
                            class="form-control rule-field" 
                            data-field="tags" 
                            value="${this.escapeHtml(Array.isArray(rule.tags) ? rule.tags.join(', ') : (rule.tags || ''))}"
                            readonly
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        />
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                            Уровень
                        </label>
                        <select 
                            class="form-control rule-field" 
                            data-field="level"
                            disabled
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                background: #f8f9fa;
                                font-size: 0.95em;
                            "
                        >
                            <option value="low" ${rule.level === 'low' ? 'selected' : ''}>Low</option>
                            <option value="medium" ${rule.level === 'medium' || !rule.level ? 'selected' : ''}>Medium</option>
                            <option value="high" ${rule.level === 'high' ? 'selected' : ''}>High</option>
                            <option value="critical" ${rule.level === 'critical' ? 'selected' : ''}>Critical</option>
                        </select>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 20px;">
                    <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                        Ложные срабатывания
                    </label>
                    <textarea 
                        class="form-control rule-field" 
                        data-field="false_positives" 
                        rows="3"
                        readonly
                        style="
                            width: 100%;
                            padding: 10px 12px;
                            border: 1px solid #ced4da;
                            border-radius: 6px;
                            background: #f8f9fa;
                            font-size: 0.95em;
                            resize: vertical;
                        "
                    >${this.escapeHtml(rule.false_positives || '')}</textarea>
                </div>

                <div class="form-group" style="margin-top: 20px;">
                    <label style="font-weight: 600; margin-bottom: 8px; display: block; color: #495057;">
                        Ссылки
                    </label>
                    <textarea 
                        class="form-control rule-field" 
                        data-field="references" 
                        rows="4"
                        readonly
                        placeholder="https://example.com/reference1"
                        style="
                            width: 100%;
                            padding: 10px 12px;
                            border: 1px solid #ced4da;
                            border-radius: 6px;
                            background: #f8f9fa;
                            font-size: 0.95em;
                            resize: vertical;
                        "
                    >${this.escapeHtml(Array.isArray(rule.references) ? rule.references.join('\n') : (rule.references || ''))}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Рендерить Comments Section
     */
    renderCommentsSection() {
        const container = document.getElementById('rule-comments-section');
        if (!container) return;

        container.innerHTML = `
            <div style="
                background: white;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h5 style="
                    margin-bottom: 20px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #e9ecef;
                    color: #212529;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                ">
                    <i class="fas fa-comments" style="color: #0dcaf0;"></i>
                    Комментарии
                </h5>
                <div id="comments-widget-container"></div>
            </div>
        `;

        // Инициализация CommentsWidget если доступен
        if (typeof CommentsWidget !== 'undefined') {
            const widgetContainer = document.getElementById('comments-widget-container');
            if (widgetContainer) {
                this.commentsWidget = new CommentsWidget();
                this.commentsWidget.init(widgetContainer, 'rule', this.config.currentRuleId);
            }
        } else {
            document.getElementById('comments-widget-container').innerHTML = `
                <p style="color: #6c757d; text-align: center; padding: 20px;">
                    <i class="fas fa-info-circle"></i> Виджет комментариев недоступен
                </p>
            `;
        }
    },

    /**
     * Показать модальное окно
     */
    showModalDialog() {
        if (this.config.modalElement) {
            this.config.modalElement.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    },

    /**
     * Изменить workflow статус (вызывается из кнопок)
     */
    async changeWorkflowStatus(newStatus) {
        if (!this.workflowManager) {
            console.error('❌ Workflow manager not initialized');
            return;
        }

        try {
            await this.workflowManager.changeWorkflow(newStatus);

            // Обновить отображение после успешного изменения
            this.config.currentRule.workflow_status = newStatus;
            this.renderStatsGrid();
            this.renderWorkflowPanel();

        } catch (error) {
            console.error('❌ Error in changeWorkflowStatus:', error);
        }
    },


    /**
     * Закрыть модальное окно
     */
    close() {
        if (this.config.unsavedChanges) {
            if (!confirm('Есть несохраненные изменения. Закрыть окно?')) {
                return;
            }
        }

        if (this.config.modalElement) {
            this.config.modalElement.style.display = 'none';
            document.body.style.overflow = '';

            setTimeout(() => {
                if (this.config.modalElement) {
                    this.config.modalElement.remove();
                }
            }, 300);
        }

        // Очистка состояния
        this.config.currentRuleId = null;
        this.config.currentRule = null;
        this.config.editMode = false;
        this.config.unsavedChanges = false;
        this.config.modalElement = null;
        this.workflowManager = null;
        this.commentsWidget = null;

        console.log('✅ Modal closed');
    },

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ И СТИЛИ
// =============================================================================

// Добавить CSS стили для анимаций
if (!document.getElementById('rule-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'rule-modal-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }

        .modal.fade {
            transition: opacity 0.3s ease-out;
        }

        .modal.show {
            opacity: 1;
        }

        .rule-field:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
        }

        .btn:hover {
            transform: translateY(-2px);
            transition: all 0.2s ease;
        }

        .btn:active {
            transform: translateY(0);
        }

        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.3s ease;
        }

        .btn-workflow-transition:hover {
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        /* Scrollbar styling */
        .modal-body::-webkit-scrollbar {
            width: 8px;
        }

        .modal-body::-webkit-scrollbar-track {
            background: #f1f1f1;
        }

        .modal-body::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
        }

        .modal-body::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
    `;
    document.head.appendChild(style);
}

// =============================================================================
// ШАГ 2: СИСТЕМА РЕДАКТИРОВАНИЯ И ИНТЕГРАЦИЯ
// =============================================================================

/**
 * FIELD CONFIGURATION - Конфигурация всех полей правила
 * Описывает тип поля, метки, возможность редактирования
 */
getFieldConfig(fieldName) {
    const configs = {
        // Основные поля
        'name': {
            type: 'text',
            label: 'Название (English)',
            label_ru: 'Название (Английский)',
            editable: true,
            required: true,
            maxLength: 255,
            placeholder: 'Rule name in English'
        },
        'name_ru': {
            type: 'text',
            label: 'Название (Русский)',
            label_ru: 'Название (Русский)',
            editable: true,
            required: false,
            maxLength: 255,
            placeholder: 'Название правила на русском'
        },
        'description': {
            type: 'textarea',
            label: 'Description',
            label_ru: 'Описание',
            editable: true,
            required: false,
            rows: 4,
            placeholder: 'Describe the purpose of this rule...'
        },
        'description_ru': {
            type: 'textarea',
            label: 'Описание (Русский)',
            label_ru: 'Описание (Русский)',
            editable: true,
            required: false,
            rows: 4,
            placeholder: 'Описание на русском языке...'
        },

        // MITRE ATT&CK
        'attack_id': {
            type: 'text',
            label: 'MITRE ATT&CK ID',
            label_ru: 'MITRE ATT&CK ID',
            editable: true,
            required: false,
            maxLength: 10,
            placeholder: 'T1234'
        },
        'tactic': {
            type: 'text',
            label: 'Тактика',
            label_ru: 'Тактика',
            editable: true,
            required: false,
            maxLength: 100,
            placeholder: 'Initial Access, Execution...'
        },
        'technique': {
            type: 'text',
            label: 'Техника',
            label_ru: 'Техника',
            editable: true,
            required: false,
            maxLength: 100,
            placeholder: 'Phishing, Command and Scripting...'
        },

        // Приоритеты и уровни
        'priority': {
            type: 'select',
            label: 'Priority',
            label_ru: 'Приоритет',
            editable: true,
            required: true,
            options: [
                { value: 'low', label: 'Low / Низкий' },
                { value: 'medium', label: 'Medium / Средний' },
                { value: 'high', label: 'High / Высокий' },
                { value: 'critical', label: 'Critical / Критический' }
            ]
        },
        'level': {
            type: 'select',
            label: 'Level',
            label_ru: 'Уровень',
            editable: true,
            required: false,
            options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' }
            ]
        },
        'severity': {
            type: 'select',
            label: 'Severity',
            label_ru: 'Серьезность',
            editable: true,
            required: false,
            options: [
                { value: 'informational', label: 'Informational / Информационный' },
                { value: 'low', label: 'Low / Низкий' },
                { value: 'medium', label: 'Medium / Средний' },
                { value: 'high', label: 'High / Высокий' },
                { value: 'critical', label: 'Critical / Критический' }
            ]
        },

        // Технические поля
        'rule_text': {
            type: 'textarea',
            label: 'Rule Logic (Lua)',
            label_ru: 'Логика правила (Lua)',
            editable: true,
            required: true,
            rows: 15,
            placeholder: '-- Lua code here...',
            fontFamily: "'Courier New', 'Consolas', monospace"
        },
        'tags': {
            type: 'text',
            label: 'Tags (comma-separated)',
            label_ru: 'Теги (через запятую)',
            editable: true,
            required: false,
            placeholder: 'malware, network, windows'
        },
        'false_positives': {
            type: 'textarea',
            label: 'False Positives',
            label_ru: 'Ложные срабатывания',
            editable: true,
            required: false,
            rows: 3,
            placeholder: 'Describe scenarios that may cause false positives...'
        },
        'references': {
            type: 'textarea',
            label: 'References (one per line)',
            label_ru: 'Ссылки (каждая с новой строки)',
            editable: true,
            required: false,
            rows: 4,
            placeholder: 'https://example.com/reference1\nhttps://example.com/reference2'
        },

        // Метаданные
        'author': {
            type: 'text',
            label: 'Author',
            label_ru: 'Автор',
            editable: true,
            required: false,
            maxLength: 100,
            placeholder: 'Rule author name'
        },
        'date': {
            type: 'date',
            label: 'Date',
            label_ru: 'Дата',
            editable: false,
            required: false
        },
        'modified': {
            type: 'date',
            label: 'Last Modified',
            label_ru: 'Последнее изменение',
            editable: false,
            required: false
        },

        // Status и активность (управляется через workflow)
        'active': {
            type: 'checkbox',
            label: 'Active',
            label_ru: 'Активно',
            editable: false, // Управляется через workflow
            required: false
        },
        'status': {
            type: 'select',
            label: 'Status',
            label_ru: 'Статус',
            editable: false, // Управляется через workflow
            required: false,
            options: [
                { value: 'draft', label: 'Draft / Черновик' },
                { value: 'testing', label: 'Testing / Тестирование' },
                { value: 'active', label: 'Active / Активно' },
                { value: 'deprecated', label: 'Deprecated / Устарело' },
                { value: 'disabled', label: 'Disabled / Отключено' }
            ]
        },

        // Дополнительные поля
        'custom_fields': {
            type: 'textarea',
            label: 'Custom Fields (JSON)',
            label_ru: 'Дополнительные поля (JSON)',
            editable: true,
            required: false,
            rows: 5,
            placeholder: '{\n  "key": "value"\n}',
            fontFamily: "'Courier New', 'Consolas', monospace"
        },
        'pangeo_radar_url': {
            type: 'url',
            label: 'Pangeo Radar URL',
            label_ru: 'Ссылка на Pangeo Radar',
            editable: true,
            required: false,
            placeholder: 'https://pangeo-radar.example.com/rule/...'
        },
        'test_data': {
            type: 'textarea',
            label: 'Test Data (JSON)',
            label_ru: 'Тестовые данные (JSON)',
            editable: true,
            required: false,
            rows: 10,
            placeholder: '[\n  {\n    "input": {},\n    "expected": "alert"\n  }\n]',
            fontFamily: "'Courier New', 'Consolas', monospace"
        }
    };

    return configs[fieldName] || {
        type: 'text',
        label: fieldName,
        label_ru: fieldName,
        editable: true,
        required: false
    };
},

/**
 * Начать редактирование поля
 */
startEditField(fieldName, currentValue) {
    const fieldConfig = this.getFieldConfig(fieldName);

    if (!fieldConfig.editable) {
        console.warn(`Field "${fieldName}" is not editable`);
        return;
    }

    console.log(`🖊️ Starting edit for field: ${fieldName}`);

    const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
    if (!fieldElement) {
        console.error(`Field element not found: ${fieldName}`);
        return;
    }

    // Сохранить оригинальное значение для возможности отмены
    fieldElement.dataset.originalValue = currentValue || '';

    // Включить редактирование
    if (fieldElement.hasAttribute('readonly')) {
        fieldElement.removeAttribute('readonly');
    }
    if (fieldElement.hasAttribute('disabled')) {
        fieldElement.removeAttribute('disabled');
    }

    fieldElement.style.backgroundColor = '#fff9e6';
    fieldElement.style.borderColor = '#ffc107';
    fieldElement.focus();

    this.config.unsavedChanges = true;

    // Показать кнопки сохранения/отмены
    const saveBtn = document.getElementById('modal-save-btn');
    if (saveBtn) {
        saveBtn.style.display = 'inline-block';
    }
},

    /**
     * Сохранить изменения поля
     */
    async saveField(fieldName, newValue) {
    try {
        console.log(`💾 Saving field: ${fieldName} = ${newValue}`);

        const response = await fetch(`/api/rules/${this.config.currentRuleId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                [fieldName]: newValue
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }

        console.log('✅ Field saved successfully');

        // Обновить локальные данные
        this.config.currentRule[fieldName] = newValue;

        // Убрать подсветку
        const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
        if (fieldElement) {
            fieldElement.style.backgroundColor = '';
            fieldElement.style.borderColor = '';
            delete fieldElement.dataset.originalValue;
        }

        this.showNotification(`Поле "${fieldName}" сохранено`, 'success');

        return result.data;

    } catch (error) {
        console.error('❌ Error saving field:', error);
        this.showNotification(`Ошибка сохранения: ${error.message}`, 'error');
        throw error;
    }
},

/**
 * Отменить изменения поля
 */
cancelEditField(fieldName) {
    console.log(`❌ Canceling edit for field: ${fieldName}`);

    const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
    if (!fieldElement) return;

    // Восстановить оригинальное значение
    const originalValue = fieldElement.dataset.originalValue;
    if (originalValue !== undefined) {
        fieldElement.value = originalValue;
        delete fieldElement.dataset.originalValue;
    }

    // Вернуть readonly/disabled
    const fieldConfig = this.getFieldConfig(fieldName);
    if (!fieldConfig.editable) {
        fieldElement.setAttribute('readonly', 'readonly');
    }

    // Убрать подсветку
    fieldElement.style.backgroundColor = '';
    fieldElement.style.borderColor = '';

    this.showNotification(`Изменения отменены`, 'info');
},

    /**
     * Сохранить все изменения
     */
    async saveChanges() {
    try {
        console.log('💾 Saving all changes...');

        const updatedFields = {};
        const fieldElements = document.querySelectorAll('[data-field]');

        fieldElements.forEach(el => {
            const fieldName = el.dataset.field;
            const fieldConfig = this.getFieldConfig(fieldName);

            if (!fieldConfig.editable) return;

            let value = el.value;

            // Обработка специальных типов
            if (fieldName === 'tags' && value) {
                value = value.split(',').map(t => t.trim()).filter(t => t);
            } else if (fieldName === 'references' && value) {
                value = value.split('\n').map(r => r.trim()).filter(r => r);
            } else if (fieldConfig.type === 'checkbox') {
                value = el.checked;
            }

            // Только измененные поля
            if (el.dataset.originalValue !== undefined) {
                updatedFields[fieldName] = value;
            }
        });

        if (Object.keys(updatedFields).length === 0) {
            this.showNotification('Нет изменений для сохранения', 'info');
            return;
        }

        const response = await fetch(`/api/rules/${this.config.currentRuleId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedFields)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }

        console.log('✅ All changes saved successfully');

        // Обновить локальные данные
        Object.assign(this.config.currentRule, result.data);

        // Очистить маркеры изменений
        fieldElements.forEach(el => {
            if (el.dataset.originalValue !== undefined) {
                delete el.dataset.originalValue;
                el.style.backgroundColor = '';
                el.style.borderColor = '';
            }
        });

        this.config.unsavedChanges = false;

        // Скрыть кнопку сохранения
        const saveBtn = document.getElementById('modal-save-btn');
        if (saveBtn) {
            saveBtn.style.display = 'none';
        }

        this.showNotification('Все изменения сохранены', 'success');

        // Перерендерить для обновления отображения
        this.renderModalContent();

        return result.data;

    } catch (error) {
        console.error('❌ Error saving changes:', error);
        this.showNotification(`Ошибка сохранения: ${error.message}`, 'error');
        throw error;
    }
},

/**
    * TAB SYSTEM - Система табов для переключения между разделами
    */

/**
 * Инициализировать табы
 */
initTabs() {
    console.log('🔗 Initializing tab system');

    const tabButtons = document.querySelectorAll('[data-tab]');
    const tabContents = document.querySelectorAll('[data-tab-content]');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            this.switchTab(tabName);
        });
    });

    // Активировать первый таб по умолчанию
    if (tabButtons.length > 0) {
        tabButtons[0].click();
    }
},

/**
 * Переключить на таб
 */
switchTab(tabName) {
    console.log(`📑 Switching to tab: ${tabName}`);

    // Деактивировать все табы
    const tabButtons = document.querySelectorAll('[data-tab]');
    const tabContents = document.querySelectorAll('[data-tab-content]');

    tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.style.borderBottom = 'none';
        btn.style.color = '#6c757d';
    });

    tabContents.forEach(content => {
        content.style.display = 'none';
    });

    // Активировать выбранный таб
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.querySelector(`[data-tab-content="${tabName}"]`);

    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.borderBottom = '3px solid #667eea';
        activeBtn.style.color = '#667eea';
    }

    if (activeContent) {
        activeContent.style.display = 'block';
    }

    // Обработка специфических табов
    if (tabName === 'logic') {
        this.renderLogicTab();
    } else if (tabName === 'tests') {
        this.renderTestsTab();
    } else if (tabName === 'comments') {
        this.initCommentsWidget();
    }
},

/**
 * Рендерить таб с логикой правила
 */
renderLogicTab() {
    const container = document.getElementById('tab-logic-content');
    if (!container) return;

    const rule = this.config.currentRule;
    const fieldConfig = this.getFieldConfig('rule_text');
    const readonly = this.config.editMode ? '' : 'readonly';

    container.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 8px;">
                <div style="margin-bottom: 15px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px;">
                        <i class="fas fa-code"></i> Lua Code
                    </label>
                    <small style="color: #6c757d; display: block; margin-bottom: 10px;">
                        Введите логику правила на языке Lua. Правило должно возвращать true или false.
                    </small>
                    <textarea 
                        data-field="rule_text"
                        class="form-control rule-field" 
                        rows="20"
                        ${readonly}
                        style="
                            width: 100%;
                            padding: 12px;
                            border: 1px solid #ced4da;
                            border-radius: 6px;
                            font-family: 'Courier New', 'Consolas', monospace;
                            font-size: 0.9em;
                            background: #f8f9fa;
                            resize: vertical;
                            line-height: 1.5;
                        "
                    >${this.escapeHtml(rule.rule_text || '')}</textarea>
                </div>

                <div style="background: #e7f3ff; border-left: 4px solid #0dcaf0; padding: 12px; border-radius: 4px;">
                    <strong style="color: #004085;">💡 Совет:</strong>
                    <pre style="margin: 10px 0 0 0; color: #004085; font-family: monospace; white-space: pre-wrap;">
-- Пример правила корреляции
if event.type == "malware" then
    return true
else
    return false
end
                    </pre>
                </div>

                ${this.rule ? `
                    <div style="margin-top: 15px;">
                        <button onclick="window.RuleModal.validateLogic()" style="
                            background: #0dcaf0;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 6px;
                            cursor: pointer;
                        ">
                            <i class="fas fa-check"></i> Проверить синтаксис
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
},

/**
 * Рендерить таб с тестовыми данными
 */
renderTestsTab() {
    const container = document.getElementById('tab-tests-content');
    if (!container) return;

    const rule = this.config.currentRule;
    const readonly = this.config.editMode ? '' : 'readonly';

    container.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 8px;">
                <h6 style="margin-bottom: 15px;">
                    <i class="fas fa-flask"></i> Тестовые данные (JSON)
                </h6>
                <small style="color: #6c757d; display: block; margin-bottom: 10px;">
                    Определите тестовые сценарии для проверки логики правила.
                </small>
                <textarea 
                    data-field="test_data"
                    class="form-control rule-field" 
                    rows="15"
                    ${readonly}
                    placeholder='[
  {
    "name": "Test case 1",
    "input": {"type": "malware", "severity": "high"},
    "expected": true
  },
  {
    "name": "Test case 2",
    "input": {"type": "normal", "severity": "low"},
    "expected": false
  }
]'
                    style="
                        width: 100%;
                        padding: 12px;
                        border: 1px solid #ced4da;
                        border-radius: 6px;
                        font-family: 'Courier New', 'Consolas', monospace;
                        font-size: 0.9em;
                        background: #f8f9fa;
                        resize: vertical;
                        line-height: 1.5;
                    "
                >${this.escapeHtml(rule.test_data || '')}</textarea>

                <div style="margin-top: 15px;">
                    <button onclick="window.RuleModal.runTests()" style="
                        background: #198754;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 6px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-play"></i> Запустить тесты
                    </button>
                </div>

                <div id="test-results" style="margin-top: 20px;"></div>
            </div>
        `;
},

/**
 * COMMENTS WIDGET INTEGRATION - Интеграция виджета комментариев
 */

/**
 * Инициализировать CommentsWidget
 */
initCommentsWidget() {
    const container = document.getElementById('tab-comments-content');
    if (!container) return;

    console.log('📝 Initializing CommentsWidget');

    // Очистить контейнер
    container.innerHTML = '';

    if (typeof CommentsWidget !== 'undefined') {
        try {
            if (!this.commentsWidget) {
                this.commentsWidget = new CommentsWidget();
            }

            // Инициализировать виджет
            this.commentsWidget.init(container, 'rule', this.config.currentRuleId);

            console.log('✅ CommentsWidget initialized');

        } catch (error) {
            console.error('❌ Error initializing CommentsWidget:', error);
            container.innerHTML = `
                    <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 6px;">
                        <strong style="color: #721c24;">⚠️ Ошибка загрузки виджета комментариев</strong>
                        <p style="margin: 10px 0 0 0; color: #721c24;">${error.message}</p>
                    </div>
                `;
        }
    } else {
        container.innerHTML = `
                <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 6px;">
                    <strong style="color: #856404;">ℹ️ Виджет комментариев не загружен</strong>
                    <p style="margin: 10px 0 0 0; color: #856404;">
                        Убедитесь, что файл comments_widget.js подключен.
                    </p>
                </div>
            `;
    }
},

/**
 * Обновить счетчик комментариев
 */
updateCommentsCount(count) {
    const tabBtn = document.querySelector('[data-tab="comments"]');
    if (tabBtn) {
        let countBadge = tabBtn.querySelector('.comment-count');
        if (!countBadge) {
            countBadge = document.createElement('span');
            countBadge.className = 'comment-count';
            countBadge.style.cssText = `
                    background: #dc3545;
                    color: white;
                    border-radius: 12px;
                    padding: 2px 8px;
                    font-size: 0.8em;
                    margin-left: 8px;
                `;
            tabBtn.appendChild(countBadge);
        }
        countBadge.textContent = count;
    }
},

    /**
     * UTILITY METHODS - Вспомогательные методы
     */

    /**
     * Перезагрузить данные правила
     */
    async reloadRuleData() {
    try {
        console.log('🔄 Reloading rule data...');
        await this.loadRuleDetails(this.config.currentRuleId);
        this.workflowManager.setRule(this.config.currentRule);
        this.renderModalContent();
        this.showNotification('Данные обновлены', 'success');
    } catch (error) {
        console.error('❌ Error reloading data:', error);
        this.showNotification(`Ошибка обновления: ${error.message}`, 'error');
    }
},

/**
 * Форматировать дату
 */
formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
},

/**
 * Преобразовать переводы строк в HTML
 */
nl2br(text) {
    if (!text) return '';
    return this.escapeHtml(text).replace(/\n/g, '<br>');
},

/**
 * Добавить ссылку на Pangeo Radar
 */
addPangeoRadarLink(url) {
    try {
        console.log('🔗 Adding Pangeo Radar link:', url);

        const fieldConfig = this.getFieldConfig('pangeo_radar_url');
        const payload = {
            pangeo_radar_url: url
        };

        return this.saveField('pangeo_radar_url', url);

    } catch (error) {
        console.error('❌ Error adding Pangeo Radar link:', error);
        this.showNotification(`Ошибка: ${error.message}`, 'error');
        throw error;
    }
},

    /**
     * Проверить синтаксис Lua кода
     */
    async validateLogic() {
    try {
        console.log('✔️ Validating Lua logic...');

        const ruleText = document.querySelector('[data-field="rule_text"]').value;

        if (!ruleText || ruleText.trim() === '') {
            this.showNotification('Правило не может быть пустым', 'warning');
            return;
        }

        const response = await fetch(`/api/rules/${this.config.currentRuleId}/validate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rule_text: ruleText })
        });

        const result = await response.json();

        if (result.success) {
            this.showNotification('✅ Синтаксис правила корректен', 'success');
        } else {
            this.showNotification(`❌ Ошибка: ${result.error}`, 'error');
        }

    } catch (error) {
        console.error('❌ Error validating logic:', error);
        this.showNotification(`Ошибка валидации: ${error.message}`, 'error');
    }
},

    /**
     * Запустить тесты
     */
    async runTests() {
    try {
        console.log('🧪 Running tests...');

        const testDataEl = document.querySelector('[data-field="test_data"]');
        const testDataStr = testDataEl.value;

        if (!testDataStr || testDataStr.trim() === '') {
            this.showNotification('Тестовые данные не определены', 'warning');
            return;
        }

        let testData;
        try {
            testData = JSON.parse(testDataStr);
        } catch (e) {
            this.showNotification('❌ Ошибка в JSON тестовых данных', 'error');
            return;
        }

        const response = await fetch(`/api/rules/${this.config.currentRuleId}/test`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ test_data: testData })
        });

        const result = await response.json();

        if (result.success) {
            this.renderTestResults(result.data);
            this.showNotification('✅ Тесты выполнены', 'success');
        } else {
            this.showNotification(`❌ Ошибка: ${result.error}`, 'error');
        }

    } catch (error) {
        console.error('❌ Error running tests:', error);
        this.showNotification(`Ошибка запуска тестов: ${error.message}`, 'error');
    }
},

/**
 * Рендерить результаты тестов
 */
renderTestResults(results) {
    const container = document.getElementById('test-results');
    if (!container) return;

    let html = '<h6 style="margin-bottom: 15px;">📊 Результаты тестов:</h6>';

    if (Array.isArray(results)) {
        results.forEach((test, index) => {
            const passed = test.result === test.expected;
            const bgColor = passed ? '#d1e7dd' : '#f8d7da';
            const borderColor = passed ? '#198754' : '#dc3545';
            const icon = passed ? '✅' : '❌';

            html += `
                    <div style="
                        background: ${bgColor};
                        border-left: 4px solid ${borderColor};
                        padding: 12px;
                        margin-bottom: 10px;
                        border-radius: 4px;
                    ">
                        <strong>${icon} ${test.name || `Тест ${index + 1}`}</strong><br>
                        <small>
                            Ожидался: <code>${test.expected}</code><br>
                            Получен: <code>${test.result}</code>
                        </small>
                    </div>
                `;
        });
    }

    container.innerHTML = html;
},

/**
 * Очистка при закрытии
 */
cleanup() {
    console.log('🧹 Cleaning up...');

    // Очистить обработчики событий
    const fields = document.querySelectorAll('[data-field]');
    fields.forEach(field => {
        field.removeEventListener('blur', () => { });
        field.removeEventListener('change', () => { });
    });

    // Очистить CommentsWidget
    if (this.commentsWidget && typeof this.commentsWidget.destroy === 'function') {
        this.commentsWidget.destroy();
    }

    // Очистить workflow manager
    if (this.workflowManager) {
        this.workflowManager = null;
    }

    // Очистить конфиг
    this.config = {
        currentRuleId: null,
        currentRule: null,
        editMode: false,
        unsavedChanges: false,
        modalElement: null
    };

    console.log('✅ Cleanup complete');
},
/**
 * ПЕРЕОПРЕДЕЛЕННЫЙ МЕТОД toggleEditMode (из ШАГа 1)
 * Полноценный режим редактирования с валидацией
 */
toggleEditMode() {
    this.config.editMode = !this.config.editMode;

    console.log(`🖊️ Edit mode: ${this.config.editMode ? 'ON' : 'OFF'}`);

    const editBtn = document.querySelector('[onclick="window.RuleModal.toggleEditMode()"]');
    const saveBtn = document.getElementById('modal-save-btn');
    const fields = document.querySelectorAll('.rule-field');

    if (this.config.editMode) {
        // Включить режим редактирования
        if (editBtn) {
            editBtn.innerHTML = '<i class="fas fa-times"></i> Отмена';
            editBtn.style.background = '#dc3545';
        }

        if (saveBtn) {
            saveBtn.style.display = 'inline-block';
        }

        fields.forEach(field => {
            const fieldName = field.dataset.field;
            const fieldConfig = this.getFieldConfig(fieldName);

            if (fieldConfig.editable) {
                field.removeAttribute('readonly');
                field.removeAttribute('disabled');
                field.style.backgroundColor = '#fff';
                field.style.borderColor = '#ced4da';
            }
        });

        this.showNotification('Режим редактирования включен', 'info');

    } else {
        // Выключить режим редактирования
        if (this.config.unsavedChanges) {
            if (!confirm('Есть несохраненные изменения. Отменить редактирование?')) {
                this.config.editMode = true;
                return;
            }
        }

        if (editBtn) {
            editBtn.innerHTML = '<i class="fas fa-edit"></i> Редактировать';
            editBtn.style.background = 'rgba(255,255,255,0.2)';
        }

        if (saveBtn) {
            saveBtn.style.display = 'none';
        }

        fields.forEach(field => {
            field.setAttribute('readonly', 'readonly');
            field.style.backgroundColor = '#f8f9fa';
            field.style.borderColor = '#ced4da';
            delete field.dataset.originalValue;
        });

        this.config.unsavedChanges = false;

        // Перерендерить с оригинальными данными
        this.renderModalContent();

        this.showNotification('Режим редактирования выключен', 'info');
    }
},

/**
 * Показать уведомление (переиспользование метода WorkflowStatusManager)
 */
showNotification(message, type = 'info') {
    const colors = {
        success: '#198754',
        error: '#dc3545',
        info: '#0dcaf0',
        warning: '#ffc107'
    };

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };

    const notificationId = `notification-${Date.now()}`;
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
            display: flex;
            align-items: center;
            gap: 12px;
        `;
    notification.innerHTML = `
            <i class="fas ${icons[type] || icons.info}" style="font-size: 1.3em;"></i>
            <span>${this.escapeHtml(message)}</span>
        `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            const el = document.getElementById(notificationId);
            if (el) el.remove();
        }, 300);
    }, 3000);
}
};

// =============================================================================
// ДОПОЛНИТЕЛЬНЫЕ CSS СТИЛИ ДЛЯ МОДАЛЬНОГО ОКНА
// =============================================================================

if (!document.getElementById('rule-modal-advanced-styles')) {
    const advancedStyles = document.createElement('style');
    advancedStyles.id = 'rule-modal-advanced-styles';
    advancedStyles.textContent = `
        /* Tab styles */
        [data-tab] {
            padding: 10px 20px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s;
            border-bottom: 3px solid transparent;
        }

        [data-tab]:hover {
            background: rgba(102, 126, 234, 0.1);
        }

        [data-tab].active {
            border-bottom-color: #667eea;
            color: #667eea;
        }

        [data-tab-content] {
            display: none;
            padding: 20px;
            animation: fadeIn 0.3s ease-in;
        }

        [data-tab-content].active {
            display: block;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Field editing highlight */
        .rule-field[readonly] {
            background: #f8f9fa !important;
            cursor: not-allowed;
        }

        .rule-field:not([readonly]):focus {
            border-color: #667eea !important;
            box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25) !important;
            background: #fff !important;
        }

        .rule-field[data-original-value] {
            background: #fff9e6 !important;
            border-color: #ffc107 !important;
        }

        /* Workflow buttons */
        .btn-workflow-transition {
            transition: all 0.3s ease;
        }

        .btn-workflow-transition:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Modal scrollbar */
        .modal-body::-webkit-scrollbar {
            width: 10px;
        }

        .modal-body::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
        }

        .modal-body::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 10px;
        }

        .modal-body::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        /* Hover effects */
        .stat-card {
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }

        /* Code highlighting */
        textarea[data-field="rule_text"],
        textarea[data-field="test_data"],
        textarea[data-field="custom_fields"] {
            font-family: 'Courier New', 'Consolas', monospace;
            font-size: 0.9em;
            line-height: 1.5;
        }

        /* Buttons */
        .btn {
            transition: all 0.2s ease;
        }

        .btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        .btn:active:not(:disabled) {
            transform: translateY(0);
        }

        /* Loading spinner */
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .fa-spinner.fa-spin {
            animation: spin 1s linear infinite;
        }

        /* Comment count badge */
        .comment-count {
            background: #dc3545;
            color: white;
            border-radius: 12px;
            padding: 2px 8px;
            font-size: 0.8em;
            margin-left: 8px;
            font-weight: bold;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            .modal-dialog {
                max-width: 95% !important;
                margin: 10px auto !important;
            }

            .stat-card {
                min-width: 100% !important;
            }

            [data-tab] {
                padding: 8px 12px;
                font-size: 0.9em;
            }
        }

        /* Accessibility */
        *:focus {
            outline: 2px dashed #667eea;
            outline-offset: 2px;
        }

        button:focus,
        input:focus,
        textarea:focus,
        select:focus {
            outline: none;
            box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
        }

        /* Print styles */
        @media print {
            .modal-header,
            .modal-footer,
            .workflow-actions,
            [data-tab],
            button {
                display: none !important;
            }

            .modal-body {
                overflow: visible !important;
                max-height: none !important;
            }
        }
    `;
    document.head.appendChild(advancedStyles);
}