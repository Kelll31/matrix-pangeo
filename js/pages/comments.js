/**
 * ========================================
 * COMMENTS PAGE - PRODUCTION READY
 * js/pages/comments.js
 * ========================================
 * @version 11.0.0-AUTH-FIXED
 * @date 2025-10-22
 * 
 * ✅ Убрана автоинициализация
 * ✅ Добавлена проверка аутентификации
 * ✅ Исправлены фильтры
 */

const CommentsPage = {
    config: {
        perPage: 50,
        refreshInterval: 5000
    },

    state: {
        comments: [],
        currentPage: 1,
        totalPages: 1,
        totalComments: 0,
        filters: { entity_type: '', entity_id: '', search: '' },
        searchTimeout: null,
        refreshTimer: null,
        isLoading: false,
        initialized: false
    },

    async init() {
        // ✅ Защита от повторной инициализации
        if (this.state.initialized) {
            console.log('⚠️ CommentsPage already initialized');
            return;
        }

        // ✅ ПРОВЕРКА АУТЕНТИФИКАЦИИ
        if (!API.isAuthenticated()) {
            console.warn('⚠️ Not authenticated, skipping CommentsPage initialization');
            return;
        }

        console.log('🔧 Initializing CommentsPage...');

        this.container = document.getElementById('comments');
        if (!this.container) {
            console.error('❌ #comments container not found');
            return;
        }

        this.renderLayout();
        this.setupEventHandlers();

        // Загружаем комментарии
        await this.loadComments();

        // Запускаем автообновление
        this.startAutoRefresh();

        this.state.initialized = true;
        console.log('✅ CommentsPage initialized successfully');
    },

    destroy() {
        console.log('🧹 Destroying CommentsPage...');

        this.stopAutoRefresh();

        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
            this.state.searchTimeout = null;
        }

        this.state.initialized = false;
        console.log('✅ CommentsPage destroyed');
    },

    startAutoRefresh() {
        this.stopAutoRefresh();

        this.state.refreshTimer = setInterval(() => {
            // Автообновление с текущими фильтрами (silent mode)
            this.loadComments(true);
        }, this.config.refreshInterval);

        console.log(`⏰ Auto-refresh started: ${this.config.refreshInterval / 1000}s`);
    },

    stopAutoRefresh() {
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
            this.state.refreshTimer = null;
            console.log('⏸️ Auto-refresh stopped');
        }
    },

    renderLayout() {
        this.container.innerHTML = `
      <div class="content-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-xl);padding-bottom:var(--space-lg);border-bottom:1px solid var(--border-color);">
        <h1 style="margin:0;display:flex;align-items:center;gap:var(--space-md);">
          <i class="fas fa-comments" style="color:var(--brand-primary);"></i> 
          Комментарии
          <span id="totalCommentsBadge" class="badge badge-primary" style="background:var(--brand-primary);color:white;padding:var(--space-xs) var(--space-sm);border-radius:var(--radius-md);">0</span>
        </h1>
        <div style="display:flex;gap:var(--space-sm);">
          <button id="btnCreateComment" class="btn btn-primary">
            <i class="fas fa-plus"></i> Новый
          </button>
          <button id="btnRefreshComments" class="btn btn-secondary">
            <i class="fas fa-sync-alt"></i> Обновить
          </button>
        </div>
      </div>
      
      <div class="filters-row" style="display:flex;gap:var(--space-md);align-items:flex-end;flex-wrap:wrap;padding:var(--space-lg);background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);margin-bottom:var(--space-xl);">
        <div style="flex:1;min-width:180px;">
          <label style="display:block;margin-bottom:var(--space-sm);font-size:var(--font-size-xs);font-weight:600;color:var(--text-muted);text-transform:uppercase;">Тип</label>
          <select id="filterEntityType" class="form-select" style="width:100%;">
            <option value="">Все</option>
            <option value="technique">Техники</option>
            <option value="rule">Правила</option>
          </select>
        </div>
        <div style="flex:1;min-width:180px;">
          <label style="display:block;margin-bottom:var(--space-sm);font-size:var(--font-size-xs);font-weight:600;color:var(--text-muted);text-transform:uppercase;">ID</label>
          <input id="filterEntityId" class="form-input" placeholder="T1059" style="width:100%;">
        </div>
        <div style="flex:2;min-width:220px;">
          <label style="display:block;margin-bottom:var(--space-sm);font-size:var(--font-size-xs);font-weight:600;color:var(--text-muted);text-transform:uppercase;">Поиск</label>
          <input id="filterSearch" class="form-input" placeholder="Текст..." style="width:100%;">
        </div>
        <button id="btnApplyFilters" class="btn btn-primary"><i class="fas fa-filter"></i></button>
        <button id="btnResetFilters" class="btn btn-secondary"><i class="fas fa-times"></i></button>
      </div>
      
      <div id="commentsList" style="min-height:200px;"></div>
      <div id="commentsPagination"></div>
    `;
    },

    async loadComments(silent = false) {
        // Защита от одновременных запросов
        if (this.state.isLoading) {
            console.log('⏳ Already loading...');
            return;
        }

        this.state.isLoading = true;

        if (!silent) {
            this.showLoading();
        }

        const { entity_type, entity_id, search } = this.state.filters;
        const offset = (this.state.currentPage - 1) * this.config.perPage;

        console.log('📥 Loading comments:', { entity_type, entity_id, search, page: this.state.currentPage });

        try {
            let url, params;

            // Определяем URL и параметры в зависимости от фильтров
            if (search && search.trim()) {
                url = '/comments/search';
                params = {
                    q: search.trim(),
                    limit: this.config.perPage,
                    offset
                };
            } else if (entity_type && entity_id && entity_id.trim()) {
                url = `/comments/entity/${encodeURIComponent(entity_type)}/${encodeURIComponent(entity_id.trim())}`;
                params = {};
            } else {
                url = '/comments';
                params = {
                    limit: this.config.perPage,
                    offset
                };
            }

            const response = await API.get(url, params);

            if (!response || !response.success) {
                throw new Error(response?.message || 'Ошибка загрузки комментариев');
            }

            const data = response.data;
            this.state.comments = data.comments || [];

            // Обновляем пагинацию
            if (data.pagination) {
                this.state.totalComments = data.pagination.total || 0;
                this.state.totalPages = data.pagination.total_pages || 1;
            } else {
                this.state.totalComments = this.state.comments.length;
                this.state.totalPages = 1;
            }

            console.log(`✅ Loaded ${this.state.comments.length} of ${this.state.totalComments} comments`);

            this.updateBadge();
            this.renderComments();
            this.renderPagination();

        } catch (error) {
            console.error('❌ Failed to load comments:', error);

            if (!silent) {
                const errorMsg = error.message || 'Не удалось загрузить комментарии';
                if (typeof Notifications !== 'undefined') {
                    Notifications.error(errorMsg);
                } else {
                    alert(errorMsg);
                }
            }

            this.renderComments(); // Показываем пустой список

        } finally {
            this.state.isLoading = false;
            if (!silent) {
                this.hideLoading();
            }
        }
    },

    updateBadge() {
        const badge = document.getElementById('totalCommentsBadge');
        if (badge) {
            badge.textContent = this.state.totalComments;
        }
    },

    renderComments() {
        const list = document.getElementById('commentsList');
        if (!list) return;

        // Пустой список
        if (!this.state.comments.length) {
            list.innerHTML = `
        <div style="text-align:center;padding:var(--space-3xl);">
          <div style="font-size:4rem;color:var(--text-muted);margin-bottom:var(--space-lg);">
            <i class="fas fa-comments"></i>
          </div>
          <h3 style="margin:0 0 var(--space-sm);color:var(--text-primary);">Нет комментариев</h3>
          <p style="color:var(--text-muted);margin-bottom:var(--space-xl);">Добавьте новый комментарий</p>
          <button id="btnEmptyCreate" class="btn btn-primary">
            <i class="fas fa-plus"></i> Создать
          </button>
        </div>
      `;

            const btnEmptyCreate = document.getElementById('btnEmptyCreate');
            if (btnEmptyCreate) {
                btnEmptyCreate.onclick = () => this.showCreateModal();
            }
            return;
        }

        // Рендерим список комментариев
        list.innerHTML = this.state.comments.map(c => {
            const icon = c.entity_type === 'technique' ? 'fa-shield-alt' : 'fa-file-code';
            const color = c.entity_type === 'technique' ? 'var(--color-success)' : 'var(--brand-primary)';
            const letter = (c.author_name || 'U')[0].toUpperCase();
            const date = c.created_at ? new Date(c.created_at).toLocaleString('ru-RU') : 'Неизвестно';

            return `
      <div data-id="${c.id}" style="background:var(--bg-card);border:1px solid var(--border-color);border-left:4px solid ${color};border-radius:var(--radius-lg);padding:var(--space-lg);margin-bottom:var(--space-md);">
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-md);">
          <div style="display:flex;gap:var(--space-md);">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--brand-primary),var(--accent-purple));display:flex;align-items:center;justify-content:center;color:white;font-weight:700;flex-shrink:0;">
              ${letter}
            </div>
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${this.esc(c.author_name || 'Unknown')}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${date}</div>
            </div>
          </div>
          <div style="display:flex;gap:var(--space-xs);">
            <button data-action="view" data-id="${c.id}" class="btn btn-icon btn-secondary" title="Просмотр">
              <i class="fas fa-eye"></i>
            </button>
            <button data-action="edit" data-id="${c.id}" class="btn btn-icon btn-primary" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            <button data-action="delete" data-id="${c.id}" class="btn btn-icon btn-danger" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div style="display:inline-flex;align-items:center;gap:var(--space-xs);padding:var(--space-xs) var(--space-sm);background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:var(--space-md);font-size:var(--font-size-sm);">
          <i class="fas ${icon}" style="color:${color};"></i>
          <span style="color:var(--text-muted);">${c.entity_type === 'technique' ? 'Техника' : 'Правило'}:</span>
          <span style="font-weight:600;color:var(--text-primary);">${this.esc(c.entity_id || '')}</span>
        </div>
        <div style="color:var(--text-primary);line-height:1.6;white-space:pre-wrap;word-break:break-word;">${this.esc(c.text || '')}</div>
      </div>
      `;
        }).join('');
    },

    renderPagination() {
        const pg = document.getElementById('commentsPagination');
        if (!pg) return;

        // Скрываем пагинацию если только одна страница
        if (this.state.totalPages <= 1) {
            pg.innerHTML = '';
            return;
        }

        pg.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;gap:var(--space-md);margin-top:var(--space-xl);padding:var(--space-lg);">
        <button id="prevPage" class="btn btn-secondary" ${this.state.currentPage === 1 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i> Назад
        </button>
        <span style="font-weight:600;color:var(--text-primary);">
          Страница ${this.state.currentPage} из ${this.state.totalPages}
        </span>
        <button id="nextPage" class="btn btn-secondary" ${this.state.currentPage === this.state.totalPages ? 'disabled' : ''}>
          Вперёд <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;

        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');

        if (prevBtn) {
            prevBtn.onclick = (e) => {
                e.preventDefault();
                if (this.state.currentPage > 1) {
                    this.state.currentPage--;
                    this.loadComments();
                }
            };
        }

        if (nextBtn) {
            nextBtn.onclick = (e) => {
                e.preventDefault();
                if (this.state.currentPage < this.state.totalPages) {
                    this.state.currentPage++;
                    this.loadComments();
                }
            };
        }
    },

    setupEventHandlers() {
        // Обработчик кликов для всего контейнера
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            e.preventDefault();

            // Кнопки в header
            if (btn.id === 'btnCreateComment') {
                return this.showCreateModal();
            }
            if (btn.id === 'btnRefreshComments') {
                return this.loadComments();
            }
            if (btn.id === 'btnApplyFilters') {
                return this.applyFilters();
            }
            if (btn.id === 'btnResetFilters') {
                return this.resetFilters();
            }

            // Кнопки действий в карточках
            const action = btn.dataset.action;
            const id = btn.dataset.id;

            if (!action || !id) return;

            const comment = this.state.comments.find(c => String(c.id) === String(id));
            if (!comment) {
                console.error(`Comment with id ${id} not found`);
                return;
            }

            if (action === 'view') {
                this.showViewModal(comment);
            } else if (action === 'edit') {
                this.showEditModal(comment);
            } else if (action === 'delete') {
                this.showDeleteModal(comment);
            }
        });

        // Обработчик ввода в поиск (с debounce)
        this.container.addEventListener('input', (e) => {
            if (e.target.id === 'filterSearch') {
                clearTimeout(this.state.searchTimeout);
                this.state.searchTimeout = setTimeout(() => {
                    this.applyFilters();
                }, 500);
            }
        });

        // Обработчик Enter в фильтрах
        this.container.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' &&
                (e.target.id === 'filterEntityId' || e.target.id === 'filterSearch')) {
                e.preventDefault();
                this.applyFilters();
            }
        });
    },

    applyFilters() {
        const typeEl = document.getElementById('filterEntityType');
        const idEl = document.getElementById('filterEntityId');
        const searchEl = document.getElementById('filterSearch');

        this.state.filters.entity_type = typeEl?.value || '';
        this.state.filters.entity_id = idEl?.value.trim() || '';
        this.state.filters.search = searchEl?.value.trim() || '';
        this.state.currentPage = 1; // Сброс на первую страницу

        console.log('🔍 Applying filters:', this.state.filters);

        // Перезагружаем с новыми фильтрами
        this.loadComments();

        // Перезапускаем авторефреш с новыми фильтрами
        this.startAutoRefresh();
    },

    resetFilters() {
        this.state.filters = { entity_type: '', entity_id: '', search: '' };
        this.state.currentPage = 1;

        const typeEl = document.getElementById('filterEntityType');
        const idEl = document.getElementById('filterEntityId');
        const searchEl = document.getElementById('filterSearch');

        if (typeEl) typeEl.value = '';
        if (idEl) idEl.value = '';
        if (searchEl) searchEl.value = '';

        console.log('🔄 Filters reset');

        // Перезагружаем без фильтров
        this.loadComments();

        // Перезапускаем авторефреш
        this.startAutoRefresh();
    },

    showCreateModal() {
        if (typeof CommentModal !== 'undefined') {
            CommentModal.create({
                onSuccess: () => {
                    setTimeout(() => {
                        this.loadComments();
                        this.startAutoRefresh();
                    }, 500);
                }
            });
        } else {
            console.error('CommentModal is not defined');
        }
    },

    showViewModal(comment) {
        if (typeof CommentModal !== 'undefined') {
            CommentModal.view(comment, {
                onEdit: (c) => this.showEditModal(c),
                onDelete: (c) => this.showDeleteModal(c)
            });
        } else {
            console.error('CommentModal is not defined');
        }
    },

    showEditModal(comment) {
        if (typeof CommentModal !== 'undefined') {
            CommentModal.edit(comment, {
                onSuccess: () => {
                    setTimeout(() => {
                        this.loadComments();
                        this.startAutoRefresh();
                    }, 500);
                }
            });
        } else {
            console.error('CommentModal is not defined');
        }
    },

    showDeleteModal(comment) {
        if (typeof CommentModal !== 'undefined') {
            CommentModal.deleteConfirm(comment, {
                onSuccess: () => {
                    setTimeout(() => {
                        this.loadComments();
                        this.startAutoRefresh();
                    }, 500);
                }
            });
        } else {
            console.error('CommentModal is not defined');
        }
    },

    showLoading() {
        const list = document.getElementById('commentsList');
        if (list) {
            list.innerHTML = '';
        }

        const pg = document.getElementById('commentsPagination');
        if (pg) {
            pg.innerHTML = '';
        }

        if (this.container && !this.container.querySelector('.loading-spinner')) {
            this.container.insertAdjacentHTML('beforeend', `
        <div class="loading-spinner" style="text-align:center;padding:var(--space-3xl);">
          <i class="fas fa-spinner fa-spin" style="font-size:3rem;color:var(--brand-primary);"></i>
          <div style="margin-top:var(--space-md);color:var(--text-muted);">Загрузка...</div>
        </div>
      `);
        }
    },

    hideLoading() {
        this.container?.querySelectorAll('.loading-spinner').forEach(el => el.remove());
    },

    esc(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
};

// =========================================================================
// ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ
// =========================================================================

window.CommentsPage = CommentsPage;

// ❌ АВТОИНИЦИАЛИЗАЦИЯ УДАЛЕНА
// Теперь CommentsPage.init() вызывается вручную из app.js
// когда пользователь переключается на раздел "comments"

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    if (CommentsPage.state.initialized) {
        CommentsPage.destroy();
    }
});

console.log('✅ CommentsPage module loaded (awaiting manual initialization)');
