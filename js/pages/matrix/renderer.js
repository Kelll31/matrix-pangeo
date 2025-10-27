/**
 * ========================================================================
 * MATRIX RENDERER v15.1 - FIXED STATISTICS + COMMENTS
 * ========================================================================
 * 
 * ИСПРАВЛЕНО в v15.1:
 * - Правильное отображение статистики
 * - Иконка 💬 с количеством комментариев
 * - Клик по иконке открывает CommentModal
 * - Отладочные логи для проверки
 * 
 * @version 15.1.0-COMPLETE-FIX
 * @date 2025-10-21
 */

const MatrixRenderer = {
    /**
     * Получить короткое имя тактики
     */
    getTacticShortname(tactic) {
        return tactic?.shortname || tactic?.xmitre_shortname || tactic?.tacticid;
    },

    /**
     * Получить название тактики
     */
    getTacticTitle(tactic) {
        return tactic?.nameru || tactic?.name;
    },

    /**
     * Получить ID техники
     */
    getTechniqueId(tech) {
        return tech?.attackid || tech?.techniqueid || tech?.attack_id;
    },

    /**
     * Получить название техники
     */
    getTechniqueName(tech) {
        return tech?.nameru || tech?.name;
    },

    /**
     * Получить классы CSS для ячейки
     */
    getCoverageClasses(tech) {
        const cov = tech?.coverage;

        if (!cov) return 'technique-cell no-coverage';

        const activeRules = parseInt(
            cov.activerules || cov.active_rules || cov.activeRules || 0
        );

        const totalRules = parseInt(
            cov.totalrules || cov.total_rules || cov.totalRules || 0
        );

        let classes = ['technique-cell'];

        if (activeRules > 0) {
            classes.push('has-coverage');
        } else if (totalRules > 0) {
            classes.push('has-inactive-rules');
        } else {
            classes.push('no-coverage');
        }

        return classes.join(' ');
    },

    /**
     * Получить бейдж покрытия
     */
    getCoverageBadge(tech) {
        const cov = tech?.coverage;

        if (!cov) {
            return '<div class="no-coverage-badge">-</div>';
        }

        const active = parseInt(
            cov.activerules || cov.active_rules || cov.activeRules || 0
        );

        const total = parseInt(
            cov.totalrules || cov.total_rules || cov.totalRules || 0
        );

        if (active > 0) {
            return `<div class="coverage-badge has-active">${active}/${total}</div>`;
        }
        if (total > 0) {
            return `<div class="coverage-badge has-inactive">0/${total}</div>`;
        }
        return '<div class="no-coverage-badge">-</div>';
    },

    /**
     * ✅ Получить количество комментариев
     */
    getCommentsCount(tech) {
        const count = parseInt(
            tech?.comments_count ||
            tech?.commentsCount ||
            tech?.comments?.length ||
            0
        );

        // Отладка
        if (count > 0) {
            console.log('💬 Technique', this.getTechniqueId(tech), 'has', count, 'comments');
        }

        return count;
    },

    /**
     * ✅ Получить бейдж комментариев
     */
    getCommentsBadge(tech) {
        const techId = this.getTechniqueId(tech);

        // Получаем количество комментариев
        const count = parseInt(
            tech?.comments_count ||
            tech?.commentsCount ||
            tech?.comments?.length ||
            0
        );

        // ОТЛАДКА: всегда выводим в консоль
        console.log(`💬 Technique ${techId}: comments_count=${tech?.comments_count}, commentsCount=${tech?.commentsCount}, comments.length=${tech?.comments?.length}, final count=${count}`);

        // ✅ ВСЕГДА показываем бейдж (даже при 0 комментариев - для отладки)
        // После отладки можно вернуть: if (count === 0) return '';

        const displayCount = count > 0 ? count : '0';
        const opacity = count > 0 ? '1' : '0.5'; // Серый если 0

        return `<div class="comments-badge" 
                 title="Комментариев: ${count}"
                 onclick="event.stopPropagation(); console.log('Click on comments badge for ${techId}'); if(window.CommentModal) { CommentModal.listForEntity('technique', '${techId}'); } else { alert('CommentModal not available'); }"
                 style="
                     cursor: pointer; 
                     display: inline-flex; 
                     align-items: center; 
                     gap: 4px; 
                     padding: 3px 7px; 
                     background: rgba(99, 102, 241, 0.2); 
                     border: 1px solid rgba(99, 102, 241, 0.4);
                     border-radius: 4px; 
                     font-size: 11px;
                     font-weight: 600;
                     color: #818cf8;
                     opacity: ${opacity};
                     transition: all 0.2s;
                 "
                 onmouseover="this.style.opacity='1'; this.style.background='rgba(99, 102, 241, 0.3)';"
                 onmouseout="this.style.opacity='${opacity}'; this.style.background='rgba(99, 102, 241, 0.2)';">
        <span style="font-size: 12px;">💬</span>
        <span>${displayCount}</span>
    </div>`;
    },

    /**
     * Индикатор загрузки
     */
    renderLoading(container) {
        if (!container) return;

        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Загрузка матрицы MITRE ATT&CK...</p>
            </div>
        `;
    },

    /**
     * Отображение ошибки
     */
    renderError(container, message) {
        if (!container) return;

        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h3>Ошибка загрузки</h3>
                <p class="error-message">${Utils.escapeHtml(String(message))}</p>
                <button class="retry-button" onclick="location.reload()">
                    Повторить попытку
                </button>
            </div>
        `;
    },

    /**
     * Отрендерить фильтры
     */
    renderFilters(container, tactics, filters) {
        if (!container) return;

        console.log('Rendering filters...');

        const platforms = ['Windows', 'Linux', 'macOS', 'Cloud', 'Network', 'Containers', 'IaaS', 'SaaS'];

        const tacticOptions = tactics.map(t => {
            const val = this.getTacticShortname(t);
            const label = this.getTacticTitle(t);
            const sel = filters.tactic === val ? 'selected' : '';
            return `<option value="${Utils.escapeHtml(val)}" ${sel}>${Utils.escapeHtml(label)}</option>`;
        }).join('');

        container.innerHTML = `
            <div class="filters-panel">
                <div class="filter-group">
                    <label class="filter-label">
                        <i class="icon-platform"></i> Платформа
                    </label>
                    <select id="platformFilter" class="filter-select">
                        <option value="all">Все платформы</option>
                        ${platforms.map(p =>
            `<option value="${p}" ${filters.platform === p ? 'selected' : ''}>${p}</option>`
        ).join('')}
                    </select>
                </div>

                <div class="filter-group">
                    <label class="filter-label">
                        <i class="icon-coverage"></i> Покрытие
                    </label>
                    <select id="coverageFilter" class="filter-select">
                        <option value="all" ${!filters.coverage || filters.coverage === 'all' ? 'selected' : ''}>Все техники</option>
                        <option value="covered" ${filters.coverage === 'covered' ? 'selected' : ''}>Покрытые</option>
                        <option value="uncovered" ${filters.coverage === 'uncovered' ? 'selected' : ''}>Непокрытые</option>
                    </select>
                </div>

                <div class="filter-group">
                    <label class="filter-label">
                        <i class="icon-tactic"></i> Тактика
                    </label>
                    <select id="tacticFilter" class="filter-select">
                        <option value="all">Все тактики</option>
                        ${tacticOptions}
                    </select>
                </div>

                <div class="filter-group filter-search">
                    <label class="filter-label">
                        <i class="icon-search"></i> Поиск
                    </label>
                    <input 
                        type="text" 
                        id="searchFilter" 
                        class="filter-input" 
                        placeholder="Поиск по ID или названию..."
                        value="${Utils.escapeHtml(filters.search)}"
                    />
                </div>
            </div>
        `;
    },

    /**
     * ✅ ИСПРАВЛЕНО: Отрендерить статистику
     */
    renderStatistics(container, stats) {
        if (!container || !stats) {
            console.warn('⚠️ Statistics container or stats is null');
            return;
        }

        console.log('📊 Rendering statistics:', stats);

        // Поддержка разных форматов
        const total = parseInt(
            stats?.overview?.totaltechniques ||
            stats?.overview?.total_techniques ||
            stats?.totaltechniques ||
            stats?.total_techniques ||
            stats?.totalTechniques ||
            0
        );

        const covered = parseInt(
            stats?.overview?.coveredtechniques ||
            stats?.overview?.covered_techniques ||
            stats?.coveredtechniques ||
            stats?.covered_techniques ||
            stats?.coveredTechniques ||
            0
        );

        const percentage = parseInt(
            stats?.overview?.coveragepercentage ||
            stats?.overview?.coverage_percentage ||
            stats?.coveragepercentage ||
            stats?.coverage_percentage ||
            stats?.coveragePercentage ||
            (total ? Math.round((covered / total) * 100) : 0)
        );

        const rules = parseInt(
            stats?.overview?.totalrules ||
            stats?.overview?.total_rules ||
            stats?.totalrules ||
            stats?.total_rules ||
            stats?.totalRules ||
            0
        );

        console.log('📈 Stats values:', { total, covered, percentage, rules });

        container.innerHTML = `
            <div class="statistics-panel" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 16px; background: rgba(45, 49, 66, 0.3); border-radius: 8px; margin-bottom: 16px;">
                <div class="stat-item" style="text-align: center;">
                    <div class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--brand-primary); margin-bottom: 4px;">${total}</div>
                    <div class="stat-label" style="font-size: 12px; color: var(--text-muted);">Всего техник</div>
                </div>
                <div class="stat-item" style="text-align: center;">
                    <div class="stat-value" style="font-size: 32px; font-weight: 700; color: #10b981; margin-bottom: 4px;">${covered}</div>
                    <div class="stat-label" style="font-size: 12px; color: var(--text-muted);">Покрыто</div>
                </div>
                <div class="stat-item" style="text-align: center;">
                    <div class="stat-value" style="font-size: 32px; font-weight: 700; color: #f59e0b; margin-bottom: 4px;">${percentage}%</div>
                    <div class="stat-label" style="font-size: 12px; color: var(--text-muted);">Покрытие</div>
                </div>
                <div class="stat-item" style="text-align: center;">
                    <div class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--brand-secondary); margin-bottom: 4px;">${rules}</div>
                    <div class="stat-label" style="font-size: 12px; color: var(--text-muted);">Правил</div>
                </div>
            </div>
        `;
    },

    /**
     * ✅ Отрендерить матрицу
     */
    renderMatrix(container, matrixData, expandedTechniques = new Set()) {
        if (!container || !matrixData) return;

        console.log('🎨 Rendering matrix with', matrixData.rows?.length || 0, 'rows');

        const { rows = [], tactics = [] } = matrixData;

        const headerCells = tactics.map(tactic => {
            const short = this.getTacticShortname(tactic);
            const title = this.getTacticTitle(tactic);
            const code = short ? short.toUpperCase() : '';

            return `
                <th class="tactic-header" data-tactic-id="${Utils.escapeHtml(short)}">
                    <div class="tactic-info">
                        <div class="tactic-id">${Utils.escapeHtml(code)}</div>
                        <div class="tactic-name">${Utils.escapeHtml(title)}</div>
                    </div>
                </th>
            `;
        }).join('');

        const bodyRows = rows.map(row => {
            const cells = row.cells
                .map(cell => this.renderCellHTML(cell, expandedTechniques))
                .join('');

            return `<tr data-row-index="${row.index}">${cells}</tr>`;
        }).join('');

        container.innerHTML = `
            <div class="matrix-wrapper">
                <div class="matrix-top-scrollbar-wrapper">
                    <div class="matrix-top-scrollbar-content"></div>
                </div>

                <div class="matrix-scroll-container">
                    <table class="matrix-table">
                        <thead class="matrix-thead-sticky">
                            <tr>${headerCells}</tr>
                        </thead>
                        <tbody>
                            ${bodyRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.initializeScrollSync(container);

        console.log('✅ Matrix rendered successfully');
    },

    /**
     * Синхронизация скролла
     */
    initializeScrollSync(container) {
        const topScrollWrapper = container.querySelector('.matrix-top-scrollbar-wrapper');
        const scrollContainer = container.querySelector('.matrix-scroll-container');
        const topScrollContent = container.querySelector('.matrix-top-scrollbar-content');
        const table = container.querySelector('.matrix-table');

        if (!topScrollWrapper || !scrollContainer || !topScrollContent || !table) return;

        const updateScrollbarWidth = () => {
            topScrollContent.style.width = `${table.scrollWidth}px`;
        };

        setTimeout(updateScrollbarWidth, 100);
        window.addEventListener('resize', updateScrollbarWidth);

        topScrollWrapper.addEventListener('scroll', () => {
            if (!scrollContainer.syncing) {
                topScrollWrapper.syncing = true;
                scrollContainer.scrollLeft = topScrollWrapper.scrollLeft;
                setTimeout(() => delete topScrollWrapper.syncing, 10);
            }
        });

        scrollContainer.addEventListener('scroll', () => {
            if (!topScrollWrapper.syncing) {
                scrollContainer.syncing = true;
                topScrollWrapper.scrollLeft = scrollContainer.scrollLeft;
                setTimeout(() => delete scrollContainer.syncing, 10);
            }
        });
    },

    /**
     * ✅ ОБНОВЛЕНО: Отрендерить ячейку с комментариями
     */
    renderCellHTML(cell, expandedTechniques) {
        if (!cell || cell.isEmpty || !cell.technique) {
            return '<td class="tactic-column empty-column"></td>';
        }

        const tech = cell.technique;
        const techId = this.getTechniqueId(tech);
        const techName = this.getTechniqueName(tech);
        const cellClasses = this.getCoverageClasses(tech);
        const coverageBadge = this.getCoverageBadge(tech);
        const commentsBadge = this.getCommentsBadge(tech);
        const subtechniques = cell.subtechniques || [];
        const isExpanded = expandedTechniques?.has(techId);
        const hasSubtechniques = subtechniques.length > 0;

        return `
            <td class="tactic-column">
                <div class="${cellClasses} ${hasSubtechniques ? 'has-subtechniques' : ''}" 
                     data-technique-id="${Utils.escapeHtml(techId)}">

                    <div class="technique-header">
                        <div class="technique-id-name" 
                             data-action="show-details" 
                             data-technique-id="${Utils.escapeHtml(techId)}">
                            <div class="technique-id">${Utils.escapeHtml(techId)}</div>
                            <div class="technique-name">${Utils.escapeHtml(techName)}</div>
                        </div>

                        ${hasSubtechniques ? `
                            <button class="subtechnique-toggle ${isExpanded ? 'expanded' : ''}" 
                                    data-action="toggle-expand" 
                                    data-technique-id="${Utils.escapeHtml(techId)}"
                                    title="${subtechniques.length} подтехник">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                    <path d="M6 9L1 4h10z"/>
                                </svg>
                                <span class="subtechnique-count">${subtechniques.length}</span>
                            </button>
                        ` : ''}
                    </div>

                    <div class="technique-badges">
                        <div class="technique-coverage">${coverageBadge}</div>
                        ${commentsBadge}
                    </div>

                    ${isExpanded && hasSubtechniques ? this.renderSubtechniquesHTML(subtechniques) : ''}
                </div>
            </td>
        `;
    },

    /**
     * ✅ ОБНОВЛЕНО: Отрендерить подтехники с комментариями
     */
    renderSubtechniquesHTML(subtechniques) {
        const items = subtechniques.map(st => {
            const id = this.getTechniqueId(st);
            const name = this.getTechniqueName(st);
            const cellClasses = this.getCoverageClasses(st).replace('technique-cell', 'subtechnique-cell');
            const coverageBadge = this.getCoverageBadge(st);
            const commentsBadge = this.getCommentsBadge(st);

            return `
                <div class="${cellClasses}" 
                     data-technique-id="${Utils.escapeHtml(id)}"
                     data-action="show-details">
                    <div class="subtechnique-id-name">
                        <div class="technique-id">${Utils.escapeHtml(id)}</div>
                        <div class="technique-name">${Utils.escapeHtml(name)}</div>
                    </div>
                    <div class="technique-badges">
                        <div class="technique-coverage">${coverageBadge}</div>
                        ${commentsBadge}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="subtechniques-list">${items}</div>`;
    },

    /**
     * Обновить развёрнутые техники
     */
    updateExpandedStates(container, expandedTechniques) {
        if (!container) return;

        container.querySelectorAll('.subtechnique-toggle').forEach(btn => {
            const id = btn.dataset.techniqueId;
            const expanded = expandedTechniques?.has(id);
            btn.classList.toggle('expanded', !!expanded);
        });
    }
};

window.MatrixRenderer = MatrixRenderer;
console.log('✅ Matrix Renderer v15.1 (COMPLETE-FIX) loaded');
