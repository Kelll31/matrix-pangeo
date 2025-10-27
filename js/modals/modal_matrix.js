/**
 * ========================================================================
 * MATRIX MODAL v2.0 - ИСПРАВЛЕННАЯ СИСТЕМА КОММЕНТАРИЕВ
 * ========================================================================
 * Быстрый просмотр техник MITRE ATT&CK с унифицированными комментариями
 * 
 * @version 2.0.0-UNIFIED-COMMENTS
 * @date 2025-10-20
 */

const MatrixModal = {
    // ========================================
    // КОНФИГУРАЦИЯ
    // ========================================

    config: {
        version: '2.0.0',
        quickViewSize: 'md',
        animationDuration: 200
    },

    // Текущее состояние
    currentState: {
        techniqueId: null,
        modalId: null,
        technique: null,
        comments: [],
        showComments: false,
        commentsLoading: false
    },

    // ========================================
    // БЫСТРЫЙ ПРОСМОТР ТЕХНИКИ
    // ========================================

    /**
     * Показать быстрое компактное модальное окно техники
     */
    async quickView(techniqueIdOrData) {
        console.log('🎨 Opening quick technique view:', techniqueIdOrData);

        try {
            // Определяем ID и данные техники
            let techniqueId, technique;

            if (typeof techniqueIdOrData === 'string') {
                techniqueId = techniqueIdOrData;
                technique = null;
            } else if (typeof techniqueIdOrData === 'object') {
                technique = techniqueIdOrData;
                techniqueId = this._getTechniqueId(technique);
            } else {
                throw new Error('Invalid technique data');
            }

            // Сохраняем ID
            this.currentState.techniqueId = techniqueId;
            this.currentState.showComments = false;
            this.currentState.comments = [];

            // Показываем индикатор загрузки
            const loadingModalId = ModalEngine.loading(`Загрузка ${techniqueId}...`);

            // Если данных нет - загружаем из API
            if (!technique) {
                if (window.MatrixServices) {
                    const fullData = await MatrixServices.fetchTechniqueFullData(techniqueId);
                    technique = fullData.technique;
                } else {
                    throw new Error('MatrixServices not available');
                }
            }

            // Закрываем индикатор
            ModalEngine.close(loadingModalId);

            // Сохраняем технику
            this.currentState.technique = technique;

            // Загружаем комментарии
            await this.loadComments();

            // Создаём контент
            const content = this._renderQuickView(technique);

            // Создаём кнопки
            const buttons = this._createQuickViewButtons(technique);

            // Формируем простой текстовый заголовок
            const techniqueName = this._getTechniqueName(technique);
            const title = `${techniqueId} - ${techniqueName}`;

            // Открываем модальное окно
            this.currentState.modalId = ModalEngine.open({
                title: title,
                content: content,
                size: this.config.quickViewSize,
                buttons: buttons,
                onClose: () => {
                    this.currentState.modalId = null;
                    this.currentState.showComments = false;
                    this.currentState.comments = [];
                }
            });

        } catch (error) {
            console.error('❌ Quick view error:', error);
            if (window.Notifications) {
                Notifications.show(`Ошибка открытия техники: ${error.message}`, 'error', { duration: 5000 });
            }
        }
    },

    /**
     * Загрузить комментарии для текущей техники
     * Использует новую унифицированную систему комментариев через таблицу comments
     */
    async loadComments() {
        const techniqueId = this.currentState.techniqueId;
        if (!techniqueId) {
            console.warn('⚠️ No technique ID for loading comments');
            return;
        }

        try {
            console.log('📡 Loading comments for technique:', techniqueId);
            this.currentState.commentsLoading = true;

            // Используем унифицированный API endpoint для получения комментариев
            // GET /api/comments/entity/<entity_type>/<entity_id>
            const url = `/api/comments/entity/technique/${techniqueId}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success && data.data) {
                // API возвращает массив комментариев в data.data или data.comments
                this.currentState.comments = data.data.comments || data.data || [];
                console.log(`✅ Loaded ${this.currentState.comments.length} comments for ${techniqueId}`);
            } else {
                console.warn('⚠️ No comments data in response:', data);
                this.currentState.comments = [];
            }

        } catch (error) {
            console.error('❌ Error loading comments:', error);
            this.currentState.comments = [];
        } finally {
            this.currentState.commentsLoading = false;
        }
    },

    // ========================================
    // РЕНДЕРИНГ - ОСНОВНОЙ КОНТЕНТ
    // ========================================

    /**
     * Отрендерить основной контент быстрого просмотра
     */
    _renderQuickView(technique) {
        return `
            <div class="matrix-modal-content">
                ${this._renderQuickCoverage(technique)}
                ${this._renderQuickInfo(technique)}
                ${this._renderQuickDescription(technique)}
                ${this._renderQuickActions(technique)}
                <div id="matrix-modal-comments-container" style="display: none;"></div>
            </div>
        `;
    },

    /**
     * Отрендерить покрытие правилами
     */
    _renderQuickCoverage(technique) {
        const coverage = technique.coverage || {};
        const totalRules = parseInt(coverage.totalrules || coverage.total_rules || 0);
        const activeRules = parseInt(coverage.activerules || coverage.active_rules || 0);

        let icon, status, statusClass;

        if (activeRules > 0) {
            icon = '✅';
            status = `${activeRules}/${totalRules}`;
            statusClass = 'has-coverage';
        } else if (totalRules > 0) {
            icon = '⚠️';
            status = `${totalRules}`;
            statusClass = 'partial-coverage';
        } else {
            icon = '❌';
            status = '0';
            statusClass = 'no-coverage';
        }

        return `
            <div class="matrix-modal-coverage ${statusClass}">
                <div class="coverage-indicator">
                    <div class="coverage-icon">${icon}</div>
                    <div class="coverage-text">
                        <div class="coverage-status">${status}</div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Отрендерить информацию о тактиках и платформах
     */
    _renderQuickInfo(technique) {
        const tactics = technique.tactics || [];
        const tacticsHTML = tactics.length > 0
            ? tactics.map(t => `<span class="info-tag tactic-tag">${Utils.escapeHtml(t.nameru || t.name || t.xmitre_shortname)}</span>`).join('')
            : '<span class="text-muted">-</span>';

        const platforms = technique.platforms || [];
        let platformsHTML = platforms.length > 0
            ? platforms.slice(0, 5).map(p => `<span class="info-tag platform-tag">${Utils.escapeHtml(p)}</span>`).join('')
            : '<span class="text-muted">-</span>';

        if (platforms.length > 5) {
            platformsHTML += `<span class="info-tag more-tag">+${platforms.length - 5}</span>`;
        }

        return `
            <div class="matrix-modal-info">
                <div class="info-row">
                    <div class="info-label">
                        <i class="icon-tactic"></i> Тактики
                    </div>
                    <div class="info-value">${tacticsHTML}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">
                        <i class="icon-platform"></i> Платформы
                    </div>
                    <div class="info-value">${platformsHTML}</div>
                </div>
            </div>
        `;
    },

    /**
     * Отрендерить описание техники
     */
    _renderQuickDescription(technique) {
        const description = technique.descriptionru || technique.description;
        if (!description) return '';

        const shortDescription = Utils.truncate(description, 300);

        return `
            <div class="matrix-modal-description">
                <div class="description-label">
                    <i class="icon-document"></i> Описание
                </div>
                <div class="description-text">${Utils.escapeHtml(shortDescription)}</div>
            </div>
        `;
    },

    /**
     * Отрендерить быстрые действия
     */
    _renderQuickActions(technique) {
        const coverage = technique.coverage || {};
        const totalRules = parseInt(coverage.totalrules || coverage.total_rules || 0);
        const subtechniques = technique.subtechniques || [];
        const commentsCount = this.currentState.comments.length;

        return `
            <div class="matrix-modal-quick-actions">
                ${totalRules > 0 ? `
                    <button class="quick-action-btn" onclick="MatrixModal.showRules()">
                        <i class="icon-shield"></i> Правила
                        <span>${totalRules}</span>
                    </button>
                ` : ''}
                
                ${subtechniques.length > 0 ? `
                    <button class="quick-action-btn" onclick="MatrixModal.showSubtechniques()">
                        <i class="icon-list"></i> Подтехники
                        <span>${subtechniques.length}</span>
                    </button>
                ` : ''}
                
                <button class="quick-action-btn" onclick="MatrixModal.toggleComments()">
                    <i class="icon-comment"></i> Комментарии
                    ${commentsCount > 0 ? `<span>${commentsCount}</span>` : ''}
                </button>
            </div>
        `;
    },

    // ========================================
    // КОММЕНТАРИИ - УНИФИЦИРОВАННАЯ СИСТЕМА
    // ========================================

    /**
     * Показать/скрыть комментарии
     */
    async toggleComments() {
        this.currentState.showComments = !this.currentState.showComments;

        const container = document.getElementById('matrix-modal-comments-container');
        if (!container) {
            console.error('❌ Comments container not found');
            return;
        }

        if (this.currentState.showComments) {
            // Показываем комментарии
            if (this.currentState.comments.length === 0 && !this.currentState.commentsLoading) {
                container.innerHTML = '<div class="comments-loading">⏳ Загрузка комментариев...</div>';
                container.style.display = 'block';
                await this.loadComments();
            }

            container.innerHTML = this.renderComments();
            container.style.display = 'block';
        } else {
            // Скрываем комментарии
            container.style.display = 'none';
        }
    },

    /**
     * Отрендерить список комментариев
     */
    renderComments() {
        const comments = this.currentState.comments;

        if (comments.length === 0) {
            return `
                <div class="matrix-modal-comments">
                    <div class="comments-header">
                        <h3>💬 Комментарии</h3>
                        <button class="btn-add-comment" onclick="MatrixModal.addComment()">
                            <i class="icon-plus"></i> Добавить
                        </button>
                    </div>
                    <div class="comments-empty">
                        <p>Комментариев пока нет</p>
                        <p class="text-muted">Будьте первым, кто оставит комментарий!</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="matrix-modal-comments">
                <div class="comments-header">
                    <h3>💬 Комментарии (${comments.length})</h3>
                    <button class="btn-add-comment" onclick="MatrixModal.addComment()">
                        <i class="icon-plus"></i> Добавить
                    </button>
                </div>
                <div class="comments-list">
                    ${comments.map(comment => this.renderComment(comment)).join('')}
                </div>
            </div>
        `;
    },

    /**
     * Отрендерить один комментарий
     */
    renderComment(comment) {
        const author = comment.author_name || comment.authorname || comment.username || 'Аноним';
        const content = comment.text || comment.content || '';
        const date = comment.created_at ? new Date(comment.created_at).toLocaleString('ru-RU') : '';
        const commentId = comment.id;
        const commentType = comment.comment_type || 'comment';
        const priority = comment.priority || 'normal';
        const status = comment.status || 'active';

        // Иконки для разных типов комментариев
        const typeIcons = {
            'comment': '💬',
            'note': '📝',
            'question': '❓',
            'issue': '⚠️',
            'improvement': '💡',
            'critical': '🔴'
        };

        const icon = typeIcons[commentType] || '💬';

        return `
            <div class="comment-item comment-${commentType} priority-${priority} status-${status}" data-comment-id="${commentId}">
                <div class="comment-header">
                    <div class="comment-author">
                        <span class="comment-type-icon">${icon}</span>
                        <span class="author-name">${Utils.escapeHtml(author)}</span>
                    </div>
                    <div class="comment-meta">
                        <span class="comment-date">${date}</span>
                        <div class="comment-actions">
                            <button class="btn-icon" onclick="MatrixModal.editComment(${commentId})" title="Редактировать">
                                ✏️
                            </button>
                            <button class="btn-icon" onclick="MatrixModal.deleteComment(${commentId})" title="Удалить">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
                <div class="comment-content">
                    ${Utils.escapeHtml(content)}
                </div>
                ${priority !== 'normal' ? `<div class="comment-priority">Приоритет: ${priority}</div>` : ''}
            </div>
        `;
    },

    /**
     * Добавить новый комментарий
     * Использует унифицированную систему: POST /api/comments
     */
    async addComment() {
        const commentData = await this.promptCommentInput('Новый комментарий', '', true);

        if (!commentData) return;

        try {
            const loadingId = ModalEngine.loading('💾 Сохранение комментария...');

            // Получаем текущего пользователя (предполагаем, что есть глобальная переменная или API)
            const currentUser = window.currentUser || { id: 1, username: 'Аноним' };

            // Формируем запрос согласно новой унифицированной системе
            const requestBody = {
                entity_type: 'technique',
                entity_id: this.currentState.techniqueId,
                text: commentData.text,
                comment_type: commentData.type || 'comment',
                priority: commentData.priority || 'normal',
                visibility: 'public',
                status: 'active',
                author_name: currentUser.username,
                created_by: currentUser.id
            };

            console.log('📤 Sending comment:', requestBody);

            // Отправка через унифицированный API: POST /api/comments
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            ModalEngine.close(loadingId);

            if (!data.success) {
                throw new Error(data.error?.message || 'Ошибка сохранения комментария');
            }

            // Добавляем новый комментарий в начало списка
            const newComment = data.data.comment || data.data;
            this.currentState.comments.unshift(newComment);

            console.log('✅ Comment added successfully:', newComment);

            // Обновляем отображение
            if (this.currentState.showComments) {
                const container = document.getElementById('matrix-modal-comments-container');
                if (container) {
                    container.innerHTML = this.renderComments();
                }
            }

            // Обновляем счётчик на кнопке
            this.updateCommentsButton();

            if (window.Notifications) {
                Notifications.show('✅ Комментарий добавлен', 'success');
            }

        } catch (error) {
            console.error('❌ Error adding comment:', error);
            if (window.Notifications) {
                Notifications.show(`❌ Ошибка: ${error.message}`, 'error');
            }
        }
    },

    /**
     * Редактировать комментарий
     * Использует: PUT /api/comments/<id>
     */
    async editComment(commentId) {
        const comment = this.currentState.comments.find(c => c.id === commentId);

        if (!comment) {
            console.error('❌ Comment not found:', commentId);
            return;
        }

        const commentData = await this.promptCommentInput(
            'Редактировать комментарий',
            comment.text,
            true,
            {
                type: comment.comment_type || 'comment',
                priority: comment.priority || 'normal'
            }
        );

        if (!commentData) return;

        try {
            const loadingId = ModalEngine.loading('💾 Сохранение изменений...');

            const requestBody = {
                text: commentData.text,
                comment_type: commentData.type,
                priority: commentData.priority
            };

            const response = await fetch(`/api/comments/${commentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            ModalEngine.close(loadingId);

            if (!data.success) {
                throw new Error(data.error?.message || 'Ошибка сохранения');
            }

            // Обновляем комментарий
            comment.text = commentData.text;
            comment.comment_type = commentData.type;
            comment.priority = commentData.priority;

            console.log('✅ Comment updated successfully');

            // Обновляем отображение
            if (this.currentState.showComments) {
                const container = document.getElementById('matrix-modal-comments-container');
                if (container) {
                    container.innerHTML = this.renderComments();
                }
            }

            if (window.Notifications) {
                Notifications.show('✅ Комментарий обновлён', 'success');
            }

        } catch (error) {
            console.error('❌ Error editing comment:', error);
            if (window.Notifications) {
                Notifications.show(`❌ Ошибка: ${error.message}`, 'error');
            }
        }
    },

    /**
     * Удалить комментарий (soft delete)
     * Использует: DELETE /api/comments/<id>
     */
    async deleteComment(commentId) {
        const confirmed = await ModalEngine.confirm(
            '🗑️ Удалить комментарий?',
            'Это действие нельзя отменить'
        );

        if (!confirmed) return;

        try {
            const loadingId = ModalEngine.loading('🗑️ Удаление комментария...');

            const response = await fetch(`/api/comments/${commentId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            ModalEngine.close(loadingId);

            if (!data.success) {
                throw new Error(data.error?.message || 'Ошибка удаления');
            }

            // Удаляем из списка
            this.currentState.comments = this.currentState.comments.filter(c => c.id !== commentId);

            console.log('✅ Comment deleted successfully');

            // Обновляем отображение
            if (this.currentState.showComments) {
                const container = document.getElementById('matrix-modal-comments-container');
                if (container) {
                    container.innerHTML = this.renderComments();
                }
            }

            // Обновляем счётчик
            this.updateCommentsButton();

            if (window.Notifications) {
                Notifications.show('✅ Комментарий удалён', 'success');
            }

        } catch (error) {
            console.error('❌ Error deleting comment:', error);
            if (window.Notifications) {
                Notifications.show(`❌ Ошибка: ${error.message}`, 'error');
            }
        }
    },

    /**
     * Обновить счётчик комментариев на кнопке
     */
    updateCommentsButton() {
        const commentsCount = this.currentState.comments.length;
        const btn = document.querySelector('.quick-action-btn[onclick="MatrixModal.toggleComments()"] span');

        if (btn) {
            if (commentsCount > 0) {
                btn.textContent = commentsCount;
                btn.style.display = 'inline';
            } else {
                btn.style.display = 'none';
            }
        }
    },

    /**
     * Показать расширенный диалог ввода комментария с типом и приоритетом
     */
    async promptCommentInput(title, defaultValue = '', extended = false, defaults = {}) {
        return new Promise((resolve) => {
            const content = `
                <div class="comment-input-dialog">
                    <textarea id="comment-text-input" 
                              placeholder="Введите текст комментария..." 
                              rows="5">${Utils.escapeHtml(defaultValue)}</textarea>
                    
                    ${extended ? `
                        <div class="comment-options">
                            <div class="option-group">
                                <label for="comment-type-select">Тип комментария:</label>
                                <select id="comment-type-select">
                                    <option value="comment" ${(defaults.type === 'comment' || !defaults.type) ? 'selected' : ''}>💬 Комментарий</option>
                                    <option value="note" ${defaults.type === 'note' ? 'selected' : ''}>📝 Заметка</option>
                                    <option value="question" ${defaults.type === 'question' ? 'selected' : ''}>❓ Вопрос</option>
                                    <option value="issue" ${defaults.type === 'issue' ? 'selected' : ''}>⚠️ Проблема</option>
                                    <option value="improvement" ${defaults.type === 'improvement' ? 'selected' : ''}>💡 Улучшение</option>
                                    <option value="critical" ${defaults.type === 'critical' ? 'selected' : ''}>🔴 Критично</option>
                                </select>
                            </div>
                            
                            <div class="option-group">
                                <label for="comment-priority-select">Приоритет:</label>
                                <select id="comment-priority-select">
                                    <option value="low" ${defaults.priority === 'low' ? 'selected' : ''}>Низкий</option>
                                    <option value="normal" ${(defaults.priority === 'normal' || !defaults.priority) ? 'selected' : ''}>Обычный</option>
                                    <option value="high" ${defaults.priority === 'high' ? 'selected' : ''}>Высокий</option>
                                    <option value="critical" ${defaults.priority === 'critical' ? 'selected' : ''}>Критичный</option>
                                    <option value="urgent" ${defaults.priority === 'urgent' ? 'selected' : ''}>Срочный</option>
                                </select>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="input-hint">💡 Поддерживается форматирование Markdown</div>
                </div>
            `;

            const modalId = ModalEngine.open({
                title: title,
                content: content,
                size: 'sm',
                buttons: [
                    {
                        text: '💾 Сохранить',
                        class: 'btn-primary',
                        action: () => {
                            const textarea = document.getElementById('comment-text-input');
                            const text = textarea ? textarea.value.trim() : '';

                            if (!text) {
                                if (window.Notifications) {
                                    Notifications.show('⚠️ Текст комментария не может быть пустым', 'warning');
                                }
                                return;
                            }

                            const result = { text };

                            if (extended) {
                                const typeSelect = document.getElementById('comment-type-select');
                                const prioritySelect = document.getElementById('comment-priority-select');

                                result.type = typeSelect ? typeSelect.value : 'comment';
                                result.priority = prioritySelect ? prioritySelect.value : 'normal';
                            }

                            resolve(result);
                            ModalEngine.close(modalId);
                        }
                    },
                    {
                        text: '❌ Отмена',
                        class: 'btn-secondary',
                        action: () => {
                            resolve(null);
                            ModalEngine.close(modalId);
                        }
                    }
                ]
            });

            // Фокус на textarea
            setTimeout(() => {
                const textarea = document.getElementById('comment-text-input');
                if (textarea) {
                    textarea.focus();
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                }
            }, 100);
        });
    },

    // ========================================
    // КНОПКИ И ДЕЙСТВИЯ
    // ========================================

    /**
     * Создать кнопки для быстрого просмотра
     */
    _createQuickViewButtons(technique) {
        const buttons = [];

        // Кнопка "Закрыть"
        buttons.push({
            text: '❌ Закрыть',
            class: 'btn-secondary',
            action: 'close'
        });

        return buttons;
    },

    /**
     * Открыть полный просмотр техники
     */
    openFullView() {
        const technique = this.currentState.technique;
        if (!technique) {
            console.error('❌ No technique data available');
            return;
        }

        // Закрываем текущее модальное окно
        if (this.currentState.modalId) {
            ModalEngine.close(this.currentState.modalId);
        }

        // Открываем полное модальное окно
        if (window.TechniqueModal) {
            TechniqueModal.view(technique);
        } else if (window.MatrixServices) {
            MatrixServices.showTechniqueModal(this.currentState.techniqueId);
        } else {
            console.error('❌ TechniqueModal not available');
        }
    },

    /**
     * Показать правила для текущей техники
     */
    async showRules() {
        const techniqueId = this.currentState.techniqueId;
        if (!techniqueId) return;

        try {
            // Закрываем текущее окно
            if (this.currentState.modalId) {
                ModalEngine.close(this.currentState.modalId);
            }

            const loadingModalId = ModalEngine.loading('📡 Загрузка правил...');

            const rules = await MatrixServices.fetchTechniqueRules(techniqueId);

            ModalEngine.close(loadingModalId);

            this.showRulesList(rules);

        } catch (error) {
            console.error('❌ Error loading rules:', error);
            if (window.Notifications) {
                Notifications.show(`❌ Ошибка загрузки правил: ${error.message}`, 'error');
            }
        }
    },

    /**
     * Показать список правил
     */
    showRulesList(rules) {
        if (!rules || rules.length === 0) {
            ModalEngine.alert('❌ Нет правил', 'Для этой техники пока нет правил корреляции');
            return;
        }

        const content = `
            <div class="matrix-modal-rules-list">
                ${rules.map(rule => {
            const ruleId = rule.id || rule.ruleid || rule.rule_id;
            const ruleName = rule.nameru || rule.name || 'Без названия';
            const severity = rule.severity || 'medium';
            const isActive = rule.active !== false;

            return `
                        <div class="rule-list-item ${isActive ? 'active' : 'inactive'}" 
                             onclick="MatrixModal.viewRule('${Utils.escapeHtml(ruleId)}')">
                            <div class="rule-info">
                                <div class="rule-name">${Utils.escapeHtml(ruleName)}</div>
                                <div class="rule-id">${Utils.escapeHtml(ruleId)}</div>
                            </div>
                            <div class="rule-badges">
                                <span class="severity-badge severity-${severity.toLowerCase()}">${severity.toUpperCase()}</span>
                                <span class="status-indicator ${isActive ? 'active' : 'inactive'}">
                                    ${isActive ? '✓ Активно' : '○ Неактивно'}
                                </span>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

        ModalEngine.open({
            title: `🛡️ Правила корреляции (${rules.length})`,
            content: content,
            size: 'md',
            buttons: [
                {
                    text: '❌ Закрыть',
                    class: 'btn-secondary',
                    action: 'close'
                }
            ]
        });
    },

    /**
     * Показать подтехники
     */
    showSubtechniques() {
        const technique = this.currentState.technique;
        const subtechniques = technique?.subtechniques || [];

        if (subtechniques.length === 0) {
            ModalEngine.alert('❌ Нет подтехник', 'У этой техники нет подтехник');
            return;
        }

        const content = `
            <div class="matrix-modal-subtechniques-list">
                ${subtechniques.map(sub => {
            const subId = this._getTechniqueId(sub);
            const subName = this._getTechniqueName(sub);
            const coverage = sub.coverage || {};
            const activeRules = parseInt(coverage.activerules || coverage.active_rules || 0);

            return `
                        <div class="subtechnique-list-item" onclick="MatrixModal.quickView('${Utils.escapeHtml(subId)}')">
                            <div class="subtechnique-info">
                                <div class="subtechnique-id">${Utils.escapeHtml(subId)}</div>
                                <div class="subtechnique-name">${Utils.escapeHtml(subName)}</div>
                            </div>
                            <div class="subtechnique-coverage">
                                ${activeRules > 0
                    ? `<span class="coverage-badge active">✅ ${activeRules}</span>`
                    : `<span class="coverage-badge inactive">❌ 0</span>`
                }
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

        ModalEngine.open({
            title: `📋 Подтехники (${subtechniques.length})`,
            content: content,
            size: 'md',
            buttons: [
                {
                    text: '❌ Закрыть',
                    class: 'btn-secondary',
                    action: 'close'
                }
            ]
        });
    },

    /**
     * Просмотр правила
     */
    async viewRule(ruleId) {
        if (window.RuleModal) {
            await RuleModal.view(ruleId);
        } else if (window.MatrixServices) {
            await MatrixServices.showRuleModal(ruleId);
        } else {
            console.error('❌ RuleModal not available');
        }
    },

    // ========================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ========================================

    /**
     * Получить ID техники из объекта
     */
    _getTechniqueId(technique) {
        return technique?.techniqueid || technique?.attackid || technique?.attack_id || technique?.id || '';
    },

    /**
     * Получить название техники из объекта
     */
    _getTechniqueName(technique) {
        return technique?.nameru || technique?.name_ru || technique?.name || '';
    }
};

// Экспорт для использования в других модулях
window.MatrixModal = MatrixModal;

// Инициализация при загрузке
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MatrixModal;
}

console.log('✅ MatrixModal v2.0 (UNIFIED-COMMENTS) loaded');
