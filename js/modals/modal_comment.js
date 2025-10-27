/**
 * COMMENT MODAL - COMPLETE FIXED VERSION
 * MITRE ATT&CK Matrix Application
 * v17.1 - FIXED AUTH TOKEN KEY
 * @date 2025-10-22
 */

const CommentModal = {
    config: {
        apiBaseUrl: window.APPCONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api',
        commentTypes: [
            { value: 'comment', label: 'Комментарий', icon: '💬' },
            { value: 'note', label: 'Заметка', icon: '📝' },
            { value: 'warning', label: 'Предупреждение', icon: '⚠️' },
            { value: 'recommendation', label: 'Рекомендация', icon: '💡' },
            { value: 'question', label: 'Вопрос', icon: '❓' }
        ],
        priorities: [
            { value: 'low', label: 'Низкий', color: '6b7280' },
            { value: 'normal', label: 'Нормальный', color: '3b82f6' },
            { value: 'high', label: 'Высокий', color: 'f59e0b' },
            { value: 'critical', label: 'Критический', color: 'ef4444' }
        ]
    },

    currentState: {
        entityType: null,
        entityId: null,
        entityName: null,
        modalId: null,
        comments: [],
        currentUser: null,
        entityCache: {}
    },

    /**
     * ✅ ИСПРАВЛЕНО: правильный ключ для получения токена
     */
    getAuthToken() {
        const token = localStorage.getItem('authToken');
        console.log('🔑 Auth Token Retrieved:', token ? token.substring(0, 20) + '...' : 'NO TOKEN');
        return token;
    },

    /**
     * Получить информацию о текущем пользователе
     */
    async getCurrentUser() {
        if (this.currentState.currentUser) {
            return this.currentState.currentUser;
        }

        try {
            const token = this.getAuthToken();
            if (!token) {
                console.warn('⚠️ No authentication token available');
                return null;
            }

            const response = await fetch(`${this.config.apiBaseUrl}/auth/me`, {
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

            if (result.success) {
                this.currentState.currentUser = result.data || result.data.user;
                console.log('✅ Current user:', this.currentState.currentUser);
                return this.currentState.currentUser;
            } else {
                throw new Error('Not authenticated');
            }
        } catch (error) {
            console.error('❌ Failed to get current user:', error);
            return null;
        }
    },

    /**
     * Создать новый комментарий
     */
    async create(entityType, entityId, options = {}) {
        const { onSuccess = null, entityName = null } = options;

        try {
            await this.getCurrentUser();

            this.currentState.entityType = entityType;
            this.currentState.entityId = entityId;
            this.currentState.entityName = entityName;

            const content = this.renderCreateForm();
            const modalId = ModalEngine.open({
                title: '📝 Новый комментарий',
                content,
                size: 'lg',
                buttons: [
                    {
                        text: 'Сохранить',
                        class: 'btn-primary',
                        action: 'save',
                        handler: async () => {
                            await this.handleCreate(modalId, onSuccess);
                        }
                    },
                    {
                        text: 'Отмена',
                        class: 'btn-secondary',
                        action: 'cancel',
                        handler: () => ModalEngine.close(modalId)
                    }
                ]
            });

            this.currentState.modalId = modalId;
            setTimeout(() => this.initializeFormBehavior(), 100);
            return modalId;
        } catch (error) {
            console.error('❌ Error creating comment modal:', error);
            ModalEngine.alert('Ошибка', 'Не удалось открыть форму комментария');
        }
    },

    /**
     * Обработать создание комментария
     */
    async handleCreate(modalId, onSuccess) {
        try {
            const user = await this.getCurrentUser();
            if (!user || !user.id) {
                throw new Error('User not authenticated');
            }

            const text = document.getElementById('comment-text')?.value?.trim();
            const type = document.getElementById('comment-type')?.value || 'comment';
            const priority = document.getElementById('comment-priority')?.value || 'normal';

            if (!text) {
                ModalEngine.alert('Ошибка', 'Текст комментария не может быть пустым');
                return;
            }

            if (text.length > 5000) {
                ModalEngine.alert('Ошибка', 'Текст не может быть больше 5000 символов');
                return;
            }

            if (!this.currentState.entityType || !this.currentState.entityId) {
                ModalEngine.alert('Ошибка', 'Не указана сущность для комментария');
                return;
            }

            const payload = {
                entitytype: this.currentState.entityType,
                entityid: String(this.currentState.entityId),
                text: text,
                commenttype: type,
                priority: priority,
                authorname: user.fullname || user.username,
                userid: user.id
            };

            console.log('💾 Creating comment:', payload);

            const token = this.getAuthToken();
            if (!token) {
                throw new Error('No authentication token');
            }

            const response = await fetch(`${this.config.apiBaseUrl}/comments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to create comment');
            }

            ModalEngine.close(modalId);

            if (typeof Notifications !== 'undefined') {
                Notifications.show('✅ Комментарий создан успешно');
            }

            if (onSuccess) {
                onSuccess(data.data || data.comment);
            }
        } catch (error) {
            console.error('❌ Failed to create comment:', error);
            ModalEngine.alert('Ошибка', `Не удалось сохранить комментарий: ${error.message}`);
        }
    },

    /**
     * Загрузить комментарии для сущности
     */
    async loadComments(entityType, entityId) {
        try {
            const token = this.getAuthToken();
            if (!token) {
                console.warn('⚠️ No auth token for loading comments');
                this.currentState.comments = [];
                return;
            }

            const response = await fetch(
                `${this.config.apiBaseUrl}/comments?entitytype=${entityType}&entityid=${entityId}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                console.warn(`Failed to load comments: HTTP ${response.status}`);
                this.currentState.comments = [];
                return;
            }

            const result = await response.json();

            if (result.success) {
                if (Array.isArray(result.data)) {
                    this.currentState.comments = result.data;
                } else if (result.data?.comments) {
                    this.currentState.comments = result.data.comments;
                } else {
                    this.currentState.comments = [];
                }
            }

            console.log(`✅ Loaded ${this.currentState.comments.length} comments`);
        } catch (error) {
            console.error('❌ Error loading comments:', error);
            this.currentState.comments = [];
        }
    },

    /**
     * Удалить комментарий
     */
    async handleDelete(modalId, commentId) {
        try {
            const token = this.getAuthToken();
            if (!token) {
                throw new Error('No authentication token');
            }

            const response = await fetch(`${this.config.apiBaseUrl}/comments/${commentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to delete comment');
            }

            ModalEngine.close(modalId);

            if (typeof Notifications !== 'undefined') {
                Notifications.show('✅ Комментарий удален');
            }

            this.listForEntity(
                this.currentState.entityType,
                this.currentState.entityId,
                { entityName: this.currentState.entityName }
            );
        } catch (error) {
            console.error('❌ Failed to delete comment:', error);
            ModalEngine.alert('Ошибка', `Не удалось удалить комментарий: ${error.message}`);
        }
    },

    /**
     * Отобразить список комментариев
     */
    async listForEntity(entityType, entityId, options = {}) {
        try {
            this.currentState.entityType = entityType;
            this.currentState.entityId = entityId;

            await this.loadComments(entityType, entityId);

            const content = this.renderCommentsList();
            const displayTitle = `📋 Комментарии (${this.currentState.comments.length})`;

            const modalId = ModalEngine.open({
                title: displayTitle,
                content,
                size: 'xl',
                buttons: [
                    {
                        text: '➕ Добавить',
                        class: 'btn-primary',
                        action: 'add',
                        handler: async () => {
                            await this.create(entityType, entityId, { entityName: options.entityName });
                        }
                    },
                    {
                        text: 'Закрыть',
                        class: 'btn-secondary',
                        action: 'close',
                        handler: () => ModalEngine.close(modalId)
                    }
                ]
            });

            this.currentState.modalId = modalId;
            return modalId;
        } catch (error) {
            console.error('❌ Error listing comments:', error);
            ModalEngine.alert('Ошибка', 'Не удалось загрузить комментарии');
        }
    },

    /**
     * Отобразить форму создания
     */
    renderCreateForm() {
        const user = this.currentState.currentUser;
        const userName = user ? (user.fullname || user.username) : 'Гость';

        return `
            <div class="comment-create-form" style="padding: 1rem;">
                <div class="user-info" style="
                    padding: 0.75rem 1rem;
                    background: rgba(99, 102, 241, 0.1);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    border-radius: var(--radius-md);
                    margin-bottom: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                ">
                    <span style="color: var(--text-primary); font-size: 0.875rem;">
                        👤 <strong>${this.escapeHtml(userName)}</strong>
                    </span>
                </div>

                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <textarea 
                        id="comment-text" 
                        class="form-control" 
                        rows="6" 
                        placeholder="Введите комментарий (Markdown поддерживается)..."
                        style="
                            width: 100%;
                            padding: 1rem;
                            background: rgba(45, 49, 66, 0.5);
                            border: 1px solid var(--border-color);
                            border-radius: var(--radius-md);
                            color: var(--text-primary);
                            resize: vertical;
                            font-size: 0.9375rem;
                            line-height: 1.6;
                            max-length: 5000;
                        "></textarea>
                    <small style="
                        color: var(--text-muted);
                        font-size: 0.8125rem;
                        margin-top: 0.5rem;
                        display: block;
                    ">
                        <span id="char-count">0</span>/5000
                    </small>
                </div>

                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label style="
                        display: block;
                        margin-bottom: 0.5rem;
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        font-weight: 500;
                    ">Тип комментария</label>
                    <select id="comment-type" class="form-select" style="
                        width: 100%;
                        padding: 0.75rem 1rem;
                        background: rgba(45, 49, 66, 0.5);
                        border: 1px solid var(--border-color);
                        border-radius: var(--radius-md);
                        color: var(--text-primary);
                        font-size: 0.9375rem;
                        cursor: pointer;
                    ">
                        ${this.config.commentTypes.map(type =>
            `<option value="${type.value}" ${type.value === 'comment' ? 'selected' : ''}>
                                ${type.icon} ${type.label}
                            </option>`
        ).join('')}
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label style="
                        display: block;
                        margin-bottom: 0.5rem;
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        font-weight: 500;
                    ">Приоритет</label>
                    <select id="comment-priority" class="form-select" style="
                        width: 100%;
                        padding: 0.75rem 1rem;
                        background: rgba(45, 49, 66, 0.5);
                        border: 1px solid var(--border-color);
                        border-radius: var(--radius-md);
                        color: var(--text-primary);
                        font-size: 0.9375rem;
                        cursor: pointer;
                    ">
                        ${this.config.priorities.map(priority =>
            `<option value="${priority.value}" ${priority.value === 'normal' ? 'selected' : ''}>
                                ${priority.label}
                            </option>`
        ).join('')}
                    </select>
                </div>
            </div>
        `;
    },

    /**
     * Отобразить список комментариев
     */
    renderCommentsList() {
        const comments = this.currentState.comments;

        if (comments.length === 0) {
            return `
                <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
                    <p>📭 Комментариев нет</p>
                </div>
            `;
        }

        return `
            <div class="comments-list" style="
                max-height: 60vh;
                overflow-y: auto;
                padding: 1rem;
                display: flex;
                flex-direction: column;
                gap: 1rem;
            ">
                ${comments.map(comment => this.renderCommentItem(comment)).join('')}
            </div>
        `;
    },

    /**
     * Отобразить один комментарий
     */
    renderCommentItem(comment) {
        const date = new Date(comment.created_at).toLocaleString('ru-RU');
        const author = this.escapeHtml(comment.authorname || comment.author_name || 'Неизвестно');
        const text = this.escapeHtml(comment.text);
        const type = comment.commenttype || comment.type || 'comment';
        const priority = comment.priority || 'normal';

        return `
            <div class="comment-item" style="
                background: rgba(45, 49, 66, 0.4);
                border-radius: var(--radius-lg);
                padding: 1.25rem;
                border: 1px solid var(--border-color);
            ">
                <div class="comment-header" style="
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 1rem;
                    padding-bottom: 0.75rem;
                    border-bottom: 1px solid var(--border-color);
                ">
                    <div>
                        <strong style="color: var(--brand-primary);">${author}</strong>
                        <br/>
                        <small style="color: var(--text-muted);">${date}</small>
                    </div>
                    <button 
                        onclick="CommentModal.confirmDelete(${comment.id})"
                        style="
                            background: transparent;
                            border: 1px solid var(--border-color);
                            color: var(--text-muted);
                            padding: 0.375rem 0.625rem;
                            border-radius: var(--radius-sm);
                            cursor: pointer;
                            font-size: 0.875rem;
                        "
                    >🗑️ Удалить</button>
                </div>
                <div class="comment-content" style="
                    color: var(--text-secondary);
                    line-height: 1.6;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                ">
                    ${text}
                </div>
            </div>
        `;
    },

    /**
     * Подтвердить удаление
     */
    confirmDelete(commentId) {
        ModalEngine.open({
            title: '⚠️ Подтверждение',
            content: `<div style="padding: 1rem;"><p>Вы уверены, что хотите удалить комментарий?</p></div>`,
            size: 'sm',
            buttons: [
                {
                    text: 'Удалить',
                    class: 'btn-danger',
                    handler: () => this.handleDelete(ModalEngine.currentModal, commentId)
                },
                {
                    text: 'Отмена',
                    class: 'btn-secondary',
                    handler: () => ModalEngine.closeCurrentModal()
                }
            ]
        });
    },

    /**
     * Очистить HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    },

    /**
     * Инициализировать поведение формы
     */
    initializeFormBehavior() {
        const textarea = document.getElementById('comment-text');
        const charCount = document.getElementById('char-count');

        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                const length = textarea.value.length;
                charCount.textContent = length;
                if (length > 4500) {
                    charCount.style.color = '#ef4444';
                } else {
                    charCount.style.color = 'var(--text-muted)';
                }
            });
            textarea.focus();
        }
    }
};

window.CommentModal = CommentModal;
console.log('✅ CommentModal v17.1 (FIXED - authToken key) loaded successfully');
