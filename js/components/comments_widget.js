/**
 * ========================================
 * COMMENTS WIDGET - FIXED VERSION v18.0
 * MITRE ATT&CK Matrix Application
 * ========================================
 *
 * ИСПРАВЛЕНО v18.0:
 * - Нормализация comment_type: 'recommendation' -> 'recommend' (ENUM-safe)
 * - Только поддерживаемые значения типов в UI (comment|note|warning|question|recommend)
 * - Повторная отправка при 1265 (truncate) с типом 'comment'
 * - Гарантия передачи entity_type/entity_id на всех запросах
 * - Стабильная повторная инициализация, полная очистка destroy()
 * - Загрузка предыдущих комментариев с сортировкой по дате
 *
 * @version 18.0.0
 * @date 2025-10-21
 */

const CommentsWidget = {
    _instances: new Map(),

    create(config) {
        if (!config || !config.containerId || !config.entityType || !config.entityId) {
            throw new Error('CommentsWidget: containerId, entityType и entityId обязательны');
        }

        if (CommentsWidget._instances.has(config.containerId)) {
            try { CommentsWidget._instances.get(config.containerId).destroy(); } catch (_) { }
            CommentsWidget._instances.delete(config.containerId);
        }

        const instance = {
            // ============ CONFIG ============
            config: {
                apiBaseUrl: window.APP_CONFIG?.apiBaseUrl || 'http://172.30.250.199:5000/api',
                containerId: String(config.containerId),
                entityType: String(config.entityType || '').trim(),
                entityId: String(config.entityId || '').trim(),
                onUpdate: typeof config.onUpdate === 'function' ? config.onUpdate : () => { },
                onError: typeof config.onError === 'function' ? config.onError : (e) => console.error('CommentsWidget error:', e),
                showSearch: config.showSearch !== false,
                showFilters: config.showFilters !== false,
                allowAdd: config.allowAdd !== false,
                allowEdit: config.allowEdit !== false,
                allowDelete: config.allowDelete !== false,
                pageSize: Number(config.pageSize || 10),
                autoRefresh: Number(config.autoRefresh || 0),

                // Только поддерживаемые сервером коды (ENUM/VARCHAR-safe)
                commentTypes: [
                    { value: 'comment', label: 'Комментарий', icon: '💬' },
                    { value: 'note', label: 'Заметка', icon: '📝' },
                    { value: 'warning', label: 'Предупреждение', icon: '⚠️' },
                    { value: 'question', label: 'Вопрос', icon: '❓' },
                    { value: 'recommend', label: 'Рекомендация', icon: '💡' } // вместо 'recommendation'
                ],
                priorities: [
                    { value: 'low', label: 'Низкий', color: '#6b7280' },
                    { value: 'normal', label: 'Обычный', color: '#3b82f6' },
                    { value: 'high', label: 'Высокий', color: '#f59e0b' },
                    { value: 'critical', label: 'Критический', color: '#ef4444' }
                ],
                defaultVisibility: 'public'
            },

            // ============ STATE ============
            state: {
                isInitialized: false,
                isLoading: false,
                currentUser: null,
                comments: [],
                filteredComments: [],
                currentPage: 1,
                totalPages: 1,
                searchQuery: '',
                statusFilter: 'all',
                editingCommentId: null,
                autoRefreshTimer: null
            },

            // ============ ELEMENTS ============
            elements: {
                container: null,
                searchInput: null,
                statusFilter: null,
                commentsList: null,
                addForm: null,
                pagination: null
            },

            // ============ INIT / DESTROY ============
            async init() {
                try {
                    if (!this.config.entityType || !this.config.entityId) {
                        throw new Error('Пустые entity_type или entity_id');
                    }
                    if (this.state.isInitialized) this.destroy();

                    this.elements.container = document.getElementById(this.config.containerId);
                    if (!this.elements.container) throw new Error(`Контейнер #${this.config.containerId} не найден`);

                    this.elements.container.innerHTML = '';
                    this.render();
                    this.attachEventListeners();
                    await this.load();

                    if (this.config.autoRefresh > 0) this.startAutoRefresh();

                    this.state.isInitialized = true;
                    CommentsWidget._instances.set(this.config.containerId, this);
                    console.log('✅ CommentsWidget v18.0 initialized', this.config.entityType, this.config.entityId);
                } catch (err) {
                    console.error(err);
                    this.config.onError(err);
                    this.showError('Не удалось инициализировать виджет комментариев');
                }
            },

            destroy() {
                console.log('🗑️ CommentsWidget: Destroying...');

                try {
                    // Останавливаем авто-обновление
                    this.stopAutoRefresh();

                    // 🔧 ИСПРАВЛЕНИЕ: Удаляем все обработчики событий
                    if (this.elements.container) {
                        // Клонируем контейнер чтобы удалить все события
                        const newContainer = this.elements.container.cloneNode(false);
                        this.elements.container.parentNode?.replaceChild(newContainer, this.elements.container);
                    }

                    // Очищаем HTML
                    const container = document.getElementById(this.config.containerId);
                    if (container) {
                        container.innerHTML = '';
                    }

                } catch (e) {
                    console.warn('Error during destroy:', e);
                } finally {
                    // 🔧 ИСПРАВЛЕНИЕ: Полная очистка состояния
                    this.state = {
                        isInitialized: false,
                        isLoading: false,
                        currentUser: null,
                        comments: [],
                        filteredComments: [],
                        currentPage: 1,
                        totalPages: 1,
                        searchQuery: '',
                        statusFilter: 'all',
                        editingCommentId: null,
                        autoRefreshTimer: null
                    };

                    this.elements = {
                        container: null,
                        searchInput: null,
                        statusFilter: null,
                        commentsList: null,
                        addForm: null,
                        pagination: null
                    };

                    // Удаляем из реестра
                    CommentsWidget._instances.delete(this.config.containerId);

                    console.log('✅ CommentsWidget destroyed');
                }
            },

            // ============ USER ============
            async getCurrentUser() {
                if (this.state.currentUser) return this.state.currentUser;
                const token = localStorage.getItem('authToken') || '';
                try {
                    const res = await fetch(`${this.config.apiBaseUrl}/users/check-auth`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data?.success && data?.data?.authenticated) {
                        this.state.currentUser = data.data.user || null;
                        return this.state.currentUser;
                    }
                    return null;
                } catch {
                    return null;
                }
            },

            // ============ LOAD ============
            async load() {
                if (this.state.isLoading) return;
                this.state.isLoading = true;
                this.showLoading();

                const token = localStorage.getItem('authToken') || '';
                const url = `${this.config.apiBaseUrl}/comments?entity_type=${encodeURIComponent(this.config.entityType)}&entity_id=${encodeURIComponent(this.config.entityId)}`;

                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    const json = await res.json();
                    let list = [];
                    if (Array.isArray(json.data)) list = json.data;
                    else if (Array.isArray(json.data?.comments)) list = json.data.comments;
                    else if (Array.isArray(json.comments)) list = json.comments;

                    // Сортировка по дате (новые сверху)
                    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

                    this.state.comments = list;
                    this.applyFilters();
                    this.renderCommentsList();
                    this.updateStats();
                    this.config.onUpdate(this.state.comments);
                } catch (err) {
                    console.error('Load comments failed:', err);
                    this.config.onError(err);
                    this.showError('Не удалось загрузить комментарии');
                } finally {
                    this.state.isLoading = false;
                }
            },

            // ============ RENDER ============
            render() {
                this.elements.container.innerHTML = `
          <div class="comments-widget">
            ${this.config.showSearch ? this.renderSearchBar() : ''}
            ${this.config.allowAdd ? this.renderAddForm() : ''}
            <div class="comments-stats" id="comments-stats-${this.config.containerId}"></div>
            <div class="comments-list" id="comments-list-${this.config.containerId}"></div>
            <div class="comments-pagination" id="comments-pagination-${this.config.containerId}"></div>
          </div>
        `;
                this.elements.searchInput = this.elements.container.querySelector('.comments-search-input');
                this.elements.statusFilter = this.elements.container.querySelector('.comments-status-filter');
                this.elements.commentsList = document.getElementById(`comments-list-${this.config.containerId}`);
                this.elements.addForm = this.elements.container.querySelector('.comment-add-form');
                this.elements.pagination = document.getElementById(`comments-pagination-${this.config.containerId}`);
            },

            renderSearchBar() {
                return `
          <div class="comments-search-bar" style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <input type="text" class="comments-search-input form-control" placeholder="🔍 Поиск по комментариям...">
            </div>
            ${this.config.showFilters ? `
              <select class="comments-status-filter form-select" style="min-width:200px">
                <option value="all" selected>Все</option>
                <option value="active">Активные</option>
                <option value="archived">Архивные</option>
                <option value="deleted">Удалённые</option>
              </select>
            ` : ''}
          </div>
        `;
            },

            renderAddForm() {
                return `
          <div class="comment-add-form" style="margin-bottom:20px;padding:15px;background:#ffffff0a;border:1px solid var(--border-color);border-radius:8px">
            <div style="display:grid;grid-template-columns:1fr 220px 220px;gap:10px;align-items:flex-start">
              <textarea class="comment-add-textarea form-control" placeholder="✍️ Добавить комментарий (поддерживается Markdown)..." rows="3" style="resize:vertical" maxlength="10000"></textarea>
              <select class="comment-add-type form-select" title="Тип">
                ${this.config.commentTypes.map(t => `
                  <option value="${t.value}" ${t.value === 'comment' ? 'selected' : ''}>${t.icon} ${t.label}</option>
                `).join('')}
              </select>
              <select class="comment-add-priority form-select" title="Приоритет">
                ${this.config.priorities.map(p => `
                  <option value="${p.value}" ${p.value === 'normal' ? 'selected' : ''}>${p.label}</option>
                `).join('')}
              </select>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:8px">
              <button class="btn btn-primary comment-add-btn"><i class="fas fa-plus"></i> Добавить комментарий</button>
            </div>
          </div>
        `;
            },

            renderCommentsList() {
                console.log('🎨 Rendering comments list...');

                // 🔧 ИСПРАВЛЕНИЕ: Получаем контейнер заново каждый раз
                const commentsList = document.getElementById(`comments-list-${this.config.containerId}`);

                if (!commentsList) {
                    console.error('❌ Comments list container not found');
                    return;
                }

                const page = this.getPageComments();

                if (page.length === 0) {
                    commentsList.innerHTML = `
            <div style="padding:48px 16px;text-align:center;color:#6c757d">
                <i class="fas fa-comments fa-3x text-muted"></i>
                <p style="margin-top:8px">Комментариев пока нет</p>
            </div>
        `;
                    const pagination = document.getElementById(`comments-pagination-${this.config.containerId}`);
                    if (pagination) pagination.innerHTML = '';
                    console.log('📭 No comments to display');
                    return;
                }

                // Рендерим комментарии
                commentsList.innerHTML = page.map(c => this.renderCommentItem(c)).join('');

                // 🔧 ИСПРАВЛЕНИЕ: Обновляем ссылку на элемент ПОСЛЕ рендера
                this.elements.commentsList = document.getElementById(`comments-list-${this.config.containerId}`);

                // Рендерим пагинацию
                this.renderPagination();

                // 🔧 ИСПРАВЛЕНИЕ: Переподключаем обработчики после рендера
                this.reattachCommentEventListeners();

                console.log(`✅ Rendered ${page.length} comments`);
            },

            // ============================================
            // НОВАЯ ФУНКЦИЯ: reattachCommentEventListeners
            // ============================================
            reattachCommentEventListeners() {
                console.log('🔗 Reattaching comment event listeners...');

                // 🔧 ИСПРАВЛЕНИЕ: Получаем контейнер заново
                const commentsList = document.getElementById(`comments-list-${this.config.containerId}`);
                if (!commentsList) {
                    console.error('❌ Comments list container not found');
                    return;
                }

                // Обновляем ссылку
                this.elements.commentsList = commentsList;

                // Находим все кнопки в списке комментариев
                const editButtons = commentsList.querySelectorAll('.comment-edit-btn');
                const saveButtons = commentsList.querySelectorAll('.comment-save-btn');
                const cancelButtons = commentsList.querySelectorAll('.comment-cancel-btn');
                const deleteButtons = commentsList.querySelectorAll('.comment-delete-btn');

                // 🔧 ИСПРАВЛЕНИЕ: Явно навешиваем обработчики на каждую кнопку
                editButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const id = btn.getAttribute('data-id');
                        console.log('✏️ Edit button clicked:', id);
                        this.handleEditComment(id);
                    });
                });

                saveButtons.forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const id = btn.getAttribute('data-id');
                        console.log('💾 Save button clicked:', id);
                        await this.handleSaveComment(id);
                    });
                });

                cancelButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('❌ Cancel button clicked');
                        this.handleCancelEdit();
                    });
                });

                deleteButtons.forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const id = btn.getAttribute('data-id');
                        console.log('🗑️ Delete button clicked:', id);
                        await this.handleDeleteComment(id);
                    });
                });

                console.log(`✅ Reattached listeners: ${editButtons.length} edit, ${saveButtons.length} save, ${cancelButtons.length} cancel, ${deleteButtons.length} delete`);
            },

            renderCommentItem(comment) {
                const isEditing = this.state.editingCommentId === String(comment.id);
                const type = comment.comment_type || comment.type || 'comment';
                const priority = comment.priority || 'normal';
                const typeInfo = this.config.commentTypes.find(t => t.value === type) || this.config.commentTypes[0];
                const prInfo = this.config.priorities.find(p => p.value === priority) || this.config.priorities[1];

                // 🔧 ИСПРАВЛЕНИЕ: Добавляем отладочную информацию
                console.log(`Rendering comment ${comment.id}, isEditing: ${isEditing}`);

                return `
        <div class="comment-item ${comment.status && comment.status !== 'active' ? 'comment-' + comment.status : ''}" data-comment-id="${comment.id}" style="padding:15px;margin-bottom:12px;background:#ffffff08;border:1px solid var(--border-color);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-color)">
                <div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                        <i class="fas fa-user-circle"></i>
                        <strong>${this.escapeHtml(comment.author_name || 'Неизвестный')}</strong>
                        <span class="badge" style="border:1px solid rgba(99,102,241,0.3);color:var(--text-secondary)">${typeInfo.icon} ${typeInfo.label}</span>
                        <span class="badge" style="border:1px solid ${this.hexToRgba(prInfo.color, 0.3)};color:${prInfo.color}">${prInfo.label}</span>
                        ${comment.status && comment.status !== 'active' ? `<span class="badge bg-secondary">${this.getStatusLabel(comment.status)}</span>` : ''}
                    </div>
                    <div style="font-size:12px;color:#6c757d">${this.formatDate(comment.created_at)}</div>
                </div>
                <div style="display:flex;gap:6px">
                    ${isEditing ? `
                        <button class="btn btn-sm btn-success comment-save-btn" data-id="${comment.id}"><i class="fas fa-check"></i> Сохранить</button>
                        <button class="btn btn-sm btn-secondary comment-cancel-btn"><i class="fas fa-times"></i> Отмена</button>
                    ` : `
                        ${this.config.allowEdit ? `<button class="btn btn-sm btn-primary comment-edit-btn" data-id="${comment.id}"><i class="fas fa-edit"></i> Редактировать</button>` : ''}
                        ${this.config.allowDelete ? `<button class="btn btn-sm btn-danger comment-delete-btn" data-id="${comment.id}"><i class="fas fa-trash"></i> Удалить</button>` : ''}
                    `}
                </div>
            </div>
            <div class="comment-body">
                ${isEditing
                        ? `<textarea class="comment-edit-textarea form-control" rows="3" style="resize:vertical">${this.escapeHtml(comment.text || '')}</textarea>`
                        : `<p style="margin:0;line-height:1.6">${this.escapeHtml(comment.text || '').replace(/\n/g, '<br>')}</p>`
                    }
            </div>
            ${comment.updated_at && comment.updated_at !== comment.created_at ? `
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color)">
                    <small class="text-muted"><i class="fas fa-edit"></i> Изменено ${this.formatDate(comment.updated_at)}</small>
                </div>
            ` : ''}
        </div>
    `;
            },

            renderPagination() {
                if (!this.elements.pagination || this.state.totalPages <= 1) {
                    if (this.elements.pagination) this.elements.pagination.innerHTML = '';
                    return;
                }
                const current = this.state.currentPage;
                const total = this.state.totalPages;
                const pages = [1, ...Array.from({ length: total }, (_, i) => i + 1).filter(p => Math.abs(p - current) <= 1 && p !== 1 && p !== total), total]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .sort((a, b) => a - b);

                this.elements.pagination.innerHTML = `
          <div style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <button class="btn btn-sm btn-outline-secondary" ${current === 1 ? 'disabled' : ''} data-page="${current - 1}"><i class="fas fa-chevron-left"></i> Назад</button>
            ${pages.map((p, idx) => {
                    const prev = pages[idx - 1];
                    const gap = prev && p - prev > 1 ? '<span class="pagination-ellipsis">...</span>' : '';
                    return `${gap}<button class="btn btn-sm ${p === current ? 'btn-primary' : 'btn-outline-secondary'}" data-page="${p}">${p}</button>`;
                }).join('')}
            <button class="btn btn-sm btn-outline-secondary" ${current === total ? 'disabled' : ''} data-page="${current + 1}">Вперёд <i class="fas fa-chevron-right"></i></button>
          </div>
          <div style="text-align:center;color:#6c757d;font-size:12px">
            Показано ${this.getPageComments().length} из ${this.state.filteredComments.length}
          </div>
        `;
            },

            // ============ FILTER / PAGING ============
            applyFilters() {
                let filtered = [...this.state.comments];
                if (this.state.statusFilter !== 'all') {
                    filtered = filtered.filter(c => (c.status || 'active') === this.state.statusFilter);
                }
                if (this.state.searchQuery) {
                    const q = this.state.searchQuery.toLowerCase();
                    filtered = filtered.filter(c =>
                        (c.text && String(c.text).toLowerCase().includes(q)) ||
                        (c.author_name && String(c.author_name).toLowerCase().includes(q))
                    );
                }
                this.state.filteredComments = filtered;
                this.calculatePagination();
            },

            calculatePagination() {
                const total = this.state.filteredComments.length;
                this.state.totalPages = Math.max(1, Math.ceil(total / this.config.pageSize));
                if (this.state.currentPage > this.state.totalPages) this.state.currentPage = this.state.totalPages;
            },

            getPageComments() {
                const start = (this.state.currentPage - 1) * this.config.pageSize;
                return this.state.filteredComments.slice(start, start + this.config.pageSize);
            },

            updateStats() {
                const el = document.getElementById(`comments-stats-${this.config.containerId}`);
                if (!el) return;
                const total = this.state.comments.length;
                const active = this.state.comments.filter(c => (c.status || 'active') === 'active').length;
                const filtered = this.state.filteredComments.length;
                el.innerHTML = `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <span class="badge bg-primary">${total} всего</span>
            <span class="badge bg-success">${active} активных</span>
            ${(this.state.searchQuery || this.state.statusFilter !== 'all') ? `<span class="badge bg-info">${filtered} найдено</span>` : ''}
          </div>
        `;
            },

            // ============ EVENTS ============
            attachEventListeners() {
                console.log('🔗 Attaching event listeners...');

                const container = this.elements.container;
                if (!container) {
                    console.error('❌ Container not found for attaching events');
                    return;
                }

                // 🔧 ИСПРАВЛЕНИЕ: Удаляем старые обработчики перед добавлением новых
                // Клонируем контейнер для удаления всех старых событий
                const oldContainer = container;
                const newContainer = oldContainer.cloneNode(true);
                oldContainer.parentNode?.replaceChild(newContainer, oldContainer);
                this.elements.container = newContainer;

                // Обновляем ссылки на элементы после клонирования
                this.elements.searchInput = newContainer.querySelector('.comments-search-input');
                this.elements.statusFilter = newContainer.querySelector('.comments-status-filter');
                this.elements.commentsList = document.getElementById(`comments-list-${this.config.containerId}`);
                this.elements.addForm = newContainer.querySelector('.comment-add-form');
                this.elements.pagination = document.getElementById(`comments-pagination-${this.config.containerId}`);

                // Поиск
                if (this.elements.searchInput) {
                    this.elements.searchInput.addEventListener('input', this.debounce((e) => {
                        this.state.searchQuery = e.target.value.trim();
                        this.state.currentPage = 1;
                        this.applyFilters();
                        this.renderCommentsList();
                        this.updateStats();
                    }, 250));
                }

                // Фильтр статуса
                if (this.elements.statusFilter) {
                    this.elements.statusFilter.addEventListener('change', () => {
                        this.state.statusFilter = this.elements.statusFilter.value;
                        this.state.currentPage = 1;
                        this.applyFilters();
                        this.renderCommentsList();
                        this.updateStats();
                    });
                }

                // 🔧 ИСПРАВЛЕНИЕ: Event delegation на новом контейнере
                newContainer.addEventListener('click', async (e) => {
                    e.stopPropagation(); // Предотвращаем всплытие

                    const btn = e.target.closest('button');
                    if (!btn) return;

                    console.log('🖱️ Button clicked:', btn.className);

                    // Добавить комментарий
                    if (btn.classList.contains('comment-add-btn')) {
                        e.preventDefault();
                        await this.handleAddComment();
                        return;
                    }

                    // Редактировать
                    if (btn.classList.contains('comment-edit-btn')) {
                        e.preventDefault();
                        const id = btn.getAttribute('data-id');
                        console.log('✏️ Edit comment:', id);
                        this.handleEditComment(id);
                        return;
                    }

                    // Сохранить
                    if (btn.classList.contains('comment-save-btn')) {
                        e.preventDefault();
                        const id = btn.getAttribute('data-id');
                        console.log('💾 Save comment:', id);
                        await this.handleSaveComment(id);
                        return;
                    }

                    // Отмена
                    if (btn.classList.contains('comment-cancel-btn')) {
                        e.preventDefault();
                        console.log('❌ Cancel edit');
                        this.handleCancelEdit();
                        return;
                    }

                    // Удалить
                    if (btn.classList.contains('comment-delete-btn')) {
                        e.preventDefault();
                        const id = btn.getAttribute('data-id');
                        console.log('🗑️ Delete comment:', id);
                        await this.handleDeleteComment(id);
                        return;
                    }

                    // Пагинация
                    if (btn.hasAttribute('data-page')) {
                        e.preventDefault();
                        const page = parseInt(btn.getAttribute('data-page'), 10);
                        console.log('📄 Go to page:', page);
                        this.state.currentPage = page;
                        this.renderCommentsList();
                        return;
                    }
                });

                console.log('✅ Event listeners attached successfully');
            },

            // ============ CRUD ============
            normalizeCommentType(val) {
                const v = String(val || '').toLowerCase();
                if (['comment', 'note', 'warning', 'question', 'recommend'].includes(v)) return v;
                if (v === 'recommendation' || v === 'recom' || v === 'rec' || v === 'recommended') return 'recommend';
                return 'comment';
            },

            async handleAddComment() {
                // validate entity
                if (!this.config.entityType || !this.config.entityId) {
                    this.showNotification('Не указаны параметры сущности для комментария', 'error');
                    return;
                }

                const textarea = this.elements.addForm?.querySelector('.comment-add-textarea');
                const typeSel = this.elements.addForm?.querySelector('.comment-add-type');
                const prSel = this.elements.addForm?.querySelector('.comment-add-priority');
                if (!textarea) return;

                const rawText = (textarea.value || '').trim();
                if (!rawText) { this.showNotification('Введите текст комментария', 'warning'); return; }
                if (rawText.length > 10000) { this.showNotification('Комментарий слишком длинный (максимум 10000 символов)', 'warning'); return; }

                const comment_type = this.normalizeCommentType(typeSel?.value || 'comment');
                const priority = (prSel?.value || 'normal');
                const visibility = this.config.defaultVisibility;

                const user = await this.getCurrentUser();
                const payload = {
                    entity_type: this.config.entityType,
                    entity_id: this.config.entityId,
                    text: rawText,
                    comment_type,
                    priority,
                    visibility
                };
                if (user?.full_name || user?.username) payload.author_name = user.full_name || user.username;
                if (user?.id) payload.user_id = user.id;

                const token = localStorage.getItem('authToken') || '';

                // отправка с авто-ретраем при 1265
                const tryPost = async (body) => {
                    const res = await fetch(`${this.config.apiBaseUrl}/comments`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    if (!res.ok) {
                        let message = `HTTP ${res.status}`;
                        try {
                            const errJson = await res.json();
                            if (errJson?.error) {
                                message = typeof errJson.error === 'string'
                                    ? errJson.error
                                    : (errJson.error.message || errJson.error.error || message);
                            } else if (errJson?.message) {
                                message = errJson.message;
                            }
                        } catch { }
                        throw new Error(message);
                    }
                    const data = await res.json();
                    if (!data?.success) {
                        const msg = data?.error || data?.message || 'Не удалось создать комментарий';
                        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
                    }
                    return data;
                };

                try {
                    try {
                        await tryPost(payload);
                    } catch (err) {
                        // ловим ENUM/VARCHAR truncation на comment_type
                        const msg = String(err.message || '').toLowerCase();
                        if (msg.includes('data truncated') || msg.includes('comment_type')) {
                            // повторяем с безопасным типом
                            const fallback = { ...payload, comment_type: 'comment' };
                            this.showNotification('Тип комментария не поддерживается сервером, отправлено как "Комментарий"', 'warning');
                            await tryPost(fallback);
                        } else {
                            throw err;
                        }
                    }
                    this.showNotification('Комментарий добавлен', 'success');
                    textarea.value = '';
                    await this.load();
                } catch (err) {
                    console.error('Failed to add comment:', err);
                    this.showNotification(`Не удалось добавить комментарий: ${err.message || err}`, 'error');
                }
            },

            handleEditComment(commentId) {
                console.log(`✏️ Editing comment: ${commentId}`);

                if (!commentId) {
                    console.error('❌ No comment ID provided');
                    return;
                }

                // Устанавливаем ID редактируемого комментария
                this.state.editingCommentId = commentId;

                // Перерисовываем список комментариев
                this.renderCommentsList();

                // 🔧 ИСПРАВЛЕНИЕ: Фокусируемся на textarea после рендера с увеличенной задержкой
                setTimeout(() => {
                    // Получаем контейнер заново
                    const commentsList = document.getElementById(`comments-list-${this.config.containerId}`);
                    if (!commentsList) {
                        console.error('❌ Comments list container not found after render');
                        return;
                    }

                    const card = commentsList.querySelector(`[data-comment-id="${commentId}"]`);
                    if (!card) {
                        console.warn(`⚠️ Card not found for comment: ${commentId}`);
                        // Попробуем вывести все карточки для отладки
                        const allCards = commentsList.querySelectorAll('[data-comment-id]');
                        console.log('Available cards:', Array.from(allCards).map(c => c.getAttribute('data-comment-id')));
                        return;
                    }

                    const textarea = card.querySelector('.comment-edit-textarea');
                    if (textarea) {
                        textarea.focus();
                        // Устанавливаем курсор в конец текста
                        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                        console.log('✅ Textarea focused');
                    } else {
                        console.warn('⚠️ Textarea not found in card for comment:', commentId);
                        // Выведем структуру карточки для отладки
                        console.log('Card HTML:', card.innerHTML.substring(0, 200));
                    }
                }, 150);
            },

            handleCancelEdit() {
                console.log('❌ Cancelling edit');

                if (this.state.editingCommentId) {
                    const previousId = this.state.editingCommentId;
                    this.state.editingCommentId = null;
                    this.renderCommentsList();
                    console.log(`✅ Edit cancelled for comment: ${previousId}`);
                }
            },

            async handleSaveComment(commentId) {
                console.log(`💾 Saving comment: ${commentId}`);

                // Получаем контейнер заново
                const commentsList = document.getElementById(`comments-list-${this.config.containerId}`);
                if (!commentsList) {
                    console.error('❌ Comments list container not found');
                    return;
                }

                const card = commentsList.querySelector(`[data-comment-id="${commentId}"]`);
                const textarea = card?.querySelector('.comment-edit-textarea');

                if (!textarea) {
                    console.error('❌ Textarea not found for comment:', commentId);
                    return;
                }

                const text = (textarea.value || '').trim();
                if (!text) {
                    this.showNotification('Текст не может быть пустым', 'warning');
                    return;
                }
                if (text.length > 10000) {
                    this.showNotification('Комментарий слишком длинный (максимум 10000 символов)', 'warning');
                    return;
                }

                const token = localStorage.getItem('authToken') || '';

                try {
                    const url = `${this.config.apiBaseUrl}/comments/${commentId}`;
                    console.log('📤 PUT request URL:', url);

                    const res = await fetch(url, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ text })
                    });

                    if (!res.ok) {
                        let message = `HTTP ${res.status}`;
                        try {
                            const errJson = await res.json();
                            if (errJson?.error) {
                                message = typeof errJson.error === 'string'
                                    ? errJson.error
                                    : (errJson.error?.message || errJson.error?.error || message);
                            } else if (errJson?.message) {
                                message = errJson.message;
                            }
                        } catch (e) {
                            console.warn('Failed to parse error JSON:', e);
                        }
                        throw new Error(message);
                    }

                    const data = await res.json();
                    if (!data?.success) {
                        throw new Error(data?.error || data?.message || 'Не удалось сохранить комментарий');
                    }

                    this.showNotification('Комментарий обновлён', 'success');
                    this.state.editingCommentId = null;
                    await this.load();

                } catch (err) {
                    console.error('Failed to save comment:', err);
                    this.showNotification(`Не удалось сохранить комментарий: ${err.message || err}`, 'error');
                }
            },

            async handleDeleteComment(commentId) {
                if (!confirm('Удалить комментарий?')) return;
                const token = localStorage.getItem('authToken') || '';
                try {
                    const res = await fetch(`${this.config.apiBaseUrl}/comments/${commentId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    if (!data?.success) throw new Error(data?.error || data?.message || 'Не удалось удалить комментарий');
                    this.showNotification('Комментарий удалён', 'success');
                    await this.load();
                } catch (err) {
                    console.error('Failed to delete comment:', err);
                    this.showNotification(`Не удалось удалить комментарий: ${err.message || err}`, 'error');
                }
            },

            // ============ HELPERS ============
            showLoading() {
                if (this.elements.commentsList) {
                    this.elements.commentsList.innerHTML = `
            <div style="padding:40px 16px;text-align:center">
              <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Загрузка...</span></div>
              <p style="margin-top:12px;color:#6c757d">Загрузка комментариев...</p>
            </div>
          `;
                }
            },

            showError(message) {
                if (this.elements.commentsList) {
                    this.elements.commentsList.innerHTML = `
            <div class="alert alert-danger" style="margin:12px 0">
              <i class="fas fa-exclamation-triangle"></i>
              <p>${this.escapeHtml(message)}</p>
              <button class="btn btn-sm btn-primary comment-retry-btn"><i class="fas fa-redo"></i> Повторить</button>
            </div>
          `;
                    this.elements.commentsList.querySelector('.comment-retry-btn')?.addEventListener('click', () => this.load());
                }
            },

            showNotification(message, type = 'info') {
                if (typeof Utils !== 'undefined' && typeof Utils.showNotification === 'function') {
                    Utils.showNotification(message, type);
                } else {
                    console.log(`${type.toUpperCase()}: ${message}`);
                }
            },

            startAutoRefresh() {
                this.stopAutoRefresh();
                if (this.config.autoRefresh > 0) {
                    this.state.autoRefreshTimer = setInterval(() => this.load(), this.config.autoRefresh * 1000);
                    console.log(`🔄 Auto-refresh every ${this.config.autoRefresh}s`);
                }
            },

            stopAutoRefresh() {
                if (this.state.autoRefreshTimer) {
                    clearInterval(this.state.autoRefreshTimer);
                    this.state.autoRefreshTimer = null;
                }
            },

            debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; },

            formatDate(s) {
                if (!s) return '';
                const d = new Date(s), n = new Date(), diff = n - d;
                if (diff < 60000) return 'только что';
                if (diff < 3600000) return `${Math.floor(diff / 60000)} мин. назад`;
                if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч. назад`;
                return d.toLocaleString('ru-RU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            },

            getStatusLabel(st) { return ({ active: 'Активный', archived: 'Архивный', deleted: 'Удалённый' }[st] || st || 'unknown'); },

            escapeHtml(txt) {
                if (txt === null || txt === undefined) return '';
                const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
                return String(txt).replace(/[&<>"']/g, m => map[m]);
            },

            hexToRgba(hex, a = 1) {
                const m = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
                if (!m) return hex;
                const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
                return `rgba(${r},${g},${b},${a})`;
            }
        };

        return instance;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CommentsWidget;
}
console.log('✅ CommentsWidget v18.0 (Fixed ENUM-safe) loaded');
