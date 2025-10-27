/**
 * ========================================
 * MATRIX SERVICES v16.0 - FIXED
 * MITRE ATT&CK Matrix Application
 * ========================================
 * 
 * ИСПРАВЛЕНО v16.0:
 * - Убраны все вызовы MatrixModal
 * - Используется только TechniqueModal
 * - Добавлена функция showMatrixQuickView через TechniqueModal
 * 
 * Зависимости:
 * - API (api.js)
 * - TechniqueModal (js/modals/modal_technique.js)
 * - RuleModal (js/modals/modal_rule.js)
 * - CommentModal (js/modals/modal_comment.js)
 * 
 * @author Storm Labs
 * @version 16.0.0-TECHNIQUE-MODAL-ONLY
 * @date 2025-10-21
 */

const MatrixServices = {

    /**
     * Загрузка данных матрицы
     */
    async fetchMatrix() {
        try {
            console.log('Fetching matrix data...');

            const response = await API.getMatrix();

            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to fetch matrix data');
            }

            console.log('Matrix data loaded:', {
                tactics: response.data.tactics?.length || 0,
                techniques: response.data.techniques?.length || 0,
                parent_techniques: response.data.parent_techniques?.length || 0,
                statistics: response.data.statistics ? 'loaded' : 'empty'
            });

            return response.data;

        } catch (error) {
            console.error('Matrix data fetch error:', error);
            throw error;
        }
    },

    /**
     * Показать быстрый просмотр техники
     * ИСПРАВЛЕНО: использует только TechniqueModal
     * @param {string|Object} techniqueIdOrData - ID техники или объект данных
     */
    async showMatrixQuickView(techniqueIdOrData) {
        try {
            console.log('Opening matrix quick view:', techniqueIdOrData);

            // Просто открываем TechniqueModal
            await this.showTechniqueModal(techniqueIdOrData);

        } catch (error) {
            console.error('Error showing matrix quick view:', error);
            if (window.Notifications) {
                Notifications.show(error.message, 'error', { duration: 5000 });
            }
        }
    },

    /**
     * Получить детали техники
     * @param {string} techniqueId - ID техники (например, T1055)
     */
    async fetchTechniqueDetails(techniqueId) {
        try {
            console.log('Fetching technique details:', techniqueId);

            const matrixData = await this.fetchMatrix();

            if (!matrixData.techniques) {
                throw new Error('No techniques data available');
            }

            // Ищем технику в parent_techniques
            let technique = matrixData.parent_techniques?.find(t =>
                t.technique_id === techniqueId || t.attack_id === techniqueId
            );

            // Если не нашли, ищем в sub-techniques
            if (!technique && matrixData.subtechniques_by_parent) {
                for (const subtechniques of Object.values(matrixData.subtechniques_by_parent)) {
                    technique = subtechniques.find(t =>
                        t.technique_id === techniqueId || t.attack_id === techniqueId
                    );
                    if (technique) break;
                }
            }

            // Если все еще не нашли, ищем в общем списке techniques
            if (!technique) {
                technique = matrixData.techniques?.find(t =>
                    t.technique_id === techniqueId || t.attack_id === techniqueId
                );
            }

            if (!technique) {
                throw new Error(`Technique ${techniqueId} not found in matrix data`);
            }

            console.log('Technique', techniqueId, 'loaded');
            return technique;

        } catch (error) {
            console.error('Technique', techniqueId, 'fetch error:', error);
            throw error;
        }
    },

    /**
     * Показать модальное окно техники
     * ИСПРАВЛЕНО: используется TechniqueModal
     * @param {string} techniqueId - ID техники
     */
    async showTechniqueModal(techniqueId) {
        try {
            console.log('Opening full technique modal:', techniqueId);

            const loadingModalId = ModalEngine.loading(`Загрузка техники ${techniqueId}...`);

            // Загружаем данные параллельно
            const [technique, rules, comments] = await Promise.allSettled([
                this.fetchTechniqueDetails(techniqueId),
                this.fetchTechniqueRules(techniqueId),
                this.fetchTechniqueComments(techniqueId)
            ]);

            ModalEngine.close(loadingModalId);

            if (technique.status === 'rejected') {
                throw new Error(technique.reason?.message || 'Failed to load technique');
            }

            const techniqueData = technique.value;
            techniqueData.correlationRules = rules.status === 'fulfilled' ? rules.value : [];
            techniqueData.comments = comments.status === 'fulfilled' ? comments.value : [];

            // Открываем TechniqueModal
            if (window.TechniqueModal) {
                TechniqueModal.view(techniqueData, {
                    onEdit: (tech) => this.handleTechniqueEdit(tech),
                    onShowComments: (tech) => this.showTechniqueComments(tech.technique_id || tech.attack_id),
                    onShowRules: (tech) => this.showTechniqueRules(tech.technique_id || tech.attack_id)
                });
            } else {
                console.error('TechniqueModal not available');
                ModalEngine.alert('TechniqueModal не доступен', 'Ошибка');
            }

        } catch (error) {
            console.error('Error showing technique modal:', error);
            if (window.Notifications) {
                Notifications.show(error.message, 'error', { duration: 5000 });
            }
        }
    },

    /**
     * Получить правила для техники
     * @param {string} techniqueId - ID техники
     */
    async fetchTechniqueRules(techniqueId) {
        try {
            console.log('Fetching rules for technique:', techniqueId);

            const response = await API.getRules({
                technique_id: techniqueId,
                include_content: true
            });

            if (!response.success) {
                console.warn('Rules fetch warning for', techniqueId, ':', response.error?.message || 'Unknown error');
                return [];
            }

            const rules = response.data?.rules || response.data?.data || [];
            console.log('Rules for', techniqueId, 'loaded:', rules.length);

            return rules;

        } catch (error) {
            console.error('Rules fetch error for', techniqueId, ':', error);
            return [];
        }
    },

    /**
     * Показать правила техники
     * ИСПРАВЛЕНО: не использует MatrixModal
     * @param {string} techniqueId - ID техники
     */
    showTechniqueRules(techniqueId) {
        console.log('Showing rules for technique:', techniqueId);

        // Можно открыть список правил в новом модальном окне
        // Или просто показать уведомление
        if (window.Notifications) {
            Notifications.show(`Правила для техники ${techniqueId}`, 'info', { duration: 3000 });
        }
    },

    /**
     * Получить комментарии для техники
     * @param {string} techniqueId - ID техники
     */
    async fetchTechniqueComments(techniqueId) {
        try {
            console.log('Fetching comments for technique:', techniqueId);

            const response = await API.getComments({
                entity_type: 'technique',
                entity_id: techniqueId,
                sort_by: 'created_at',
                sort_direction: 'desc'
            });

            if (!response.success) {
                console.warn('Comments fetch warning for', techniqueId, ':', response.error?.message || 'Unknown error');
                return [];
            }

            const comments = response.data?.comments || response.data?.data || [];
            console.log('Comments for', techniqueId, 'loaded:', comments.length);

            return comments;

        } catch (error) {
            console.error('Comments fetch error for', techniqueId, ':', error);
            return [];
        }
    },

    /**
     * Показать комментарии техники
     * Использует CommentModal
     * @param {string} techniqueId - ID техники
     */
    showTechniqueComments(techniqueId) {
        if (window.CommentModal) {
            console.log('Opening comments modal for technique:', techniqueId);
            CommentModal.listForEntity('technique', techniqueId);
        } else {
            console.error('CommentModal not available');
            ModalEngine.alert('CommentModal не доступен', 'Ошибка');
        }
    },

    /**
     * Показать модальное окно правила
     * Использует RuleModal
     * @param {string} ruleId - ID правила
     */
    async showRuleModal(ruleId) {
        try {
            console.log('Opening rule modal:', ruleId);

            const loadingModalId = ModalEngine.loading(`Загрузка правила ${ruleId}...`);

            const response = await API.getRule(ruleId);

            ModalEngine.close(loadingModalId);

            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to load rule');
            }

            const rule = response.data?.rule || response.data;

            if (window.RuleModal) {
                RuleModal.view(rule, {
                    onEdit: (r) => this.handleRuleEdit(r),
                    onShowComments: (r) => this.showRuleComments(r.id),
                    onShowTechniques: (r) => this.showRuleTechniques(r),
                    onTestRule: (r) => this.testRule(r)
                });
            } else {
                console.error('RuleModal not available');
                ModalEngine.alert('RuleModal не доступен', 'Ошибка');
            }

        } catch (error) {
            console.error('Error showing rule modal:', error);
            if (window.Notifications) {
                Notifications.show(error.message, 'error', { duration: 5000 });
            }
        }
    },

    /**
     * Показать комментарии правила
     * Использует CommentModal
     * @param {string} ruleId - ID правила
     */
    showRuleComments(ruleId) {
        if (window.CommentModal) {
            console.log('Opening comments modal for rule:', ruleId);
            CommentModal.listForEntity('rule', ruleId);
        } else {
            console.error('CommentModal not available');
        }
    },

    /**
     * Показать техники правила
     * @param {Object} rule - Объект правила
     */
    showRuleTechniques(rule) {
        console.log('Showing techniques for rule:', rule);
        // TODO: Реализовать показ техник правила
    },

    /**
     * Тестировать правило
     * @param {Object} rule - Объект правила
     */
    testRule(rule) {
        if (window.RuleModal) {
            console.log('Testing rule:', rule);
            RuleModal.testRule(rule);
        } else {
            console.error('RuleModal not available');
        }
    },

    /**
     * Обработчик редактирования техники
     * @param {Object} technique - Объект техники
     */
    handleTechniqueEdit(technique) {
        if (window.TechniqueModal) {
            TechniqueModal.edit(technique, {
                onSuccess: (updatedTechnique) => {
                    console.log('Technique updated:', updatedTechnique);
                    if (window.Notifications) {
                        Notifications.show('Техника успешно обновлена', 'success');
                    }
                    if (window.MatrixPage) {
                        window.MatrixPage.refresh();
                    }
                },
                onError: (error) => {
                    console.error('Failed to update technique:', error);
                    if (window.Notifications) {
                        Notifications.show(error.message, 'error');
                    }
                }
            });
        }
    },

    /**
     * Обработчик редактирования правила
     * @param {Object} rule - Объект правила
     */
    handleRuleEdit(rule) {
        if (window.RuleModal) {
            RuleModal.edit(rule, {
                onSuccess: (updatedRule) => {
                    console.log('Rule updated:', updatedRule);
                    if (window.Notifications) {
                        Notifications.show('Правило успешно обновлено', 'success');
                    }
                    if (window.MatrixPage) {
                        window.MatrixPage.refresh();
                    }
                },
                onError: (error) => {
                    console.error('Failed to update rule:', error);
                    if (window.Notifications) {
                        Notifications.show(error.message, 'error');
                    }
                }
            });
        }
    },

    /**
     * Получить статистику
     * @param {string} period - Период статистики (30d, 90d, 1y)
     */
    async fetchStatistics(period = '30d') {
        try {
            console.log('Fetching statistics for period:', period);

            const response = await API.getStatistics(period);

            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to fetch statistics');
            }

            console.log('Statistics for', period, 'loaded');
            return response.data.statistics || response.data;

        } catch (error) {
            console.error('Statistics fetch error:', error);
            throw error;
        }
    },

    /**
     * Поиск техник
     * @param {string} query - Поисковый запрос
     * @param {Object} filters - Фильтры
     */
    async searchTechniques(query, filters = {}) {
        try {
            console.log('Searching techniques:', { query, filters });

            const params = {
                query: query,
                ...filters
            };

            const response = await API.search('query', params);

            if (!response.success) {
                throw new Error(response.error?.message || 'Search failed');
            }

            console.log('Search completed:', response.data.results?.length || 0, 'results');
            return response.data.results;

        } catch (error) {
            console.error('Search error:', error);
            throw error;
        }
    },

    /**
     * Экспорт данных матрицы
     * @param {string} format - Формат экспорта (json, csv, xlsx)
     * @param {string} section - Секция для экспорта (matrix, techniques, statistics)
     */
    async exportMatrix(format = 'json', section = null) {
        try {
            console.log('Exporting matrix data:', { format, section: section || 'all' });

            await API.exportData(format, section);

            console.log('Export completed');
            return true;

        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    },

    /**
     * Проверка здоровья API
     */
    async checkHealth() {
        try {
            const health = await API.healthCheck();
            console.log('API Health:', health);
            return health;
        } catch (error) {
            console.error('Health check failed:', error);
            return { status: 'unhealthy', error: error.message };
        }
    },

    /**
     * Получить полные данные техники (детали + правила + комментарии)
     * @param {string} techniqueId - ID техники
     * @returns {Promise<Object>}
     */
    async fetchTechniqueFullData(techniqueId) {
        try {
            console.log('Fetching full data for technique:', techniqueId);

            const [techniqueResult, rulesResult, commentsResult] = await Promise.allSettled([
                this.fetchTechniqueDetails(techniqueId),
                this.fetchTechniqueRules(techniqueId),
                this.fetchTechniqueComments(techniqueId)
            ]);

            const technique = techniqueResult.status === 'fulfilled' ? techniqueResult.value : null;
            const rules = rulesResult.status === 'fulfilled' ? rulesResult.value : [];
            const comments = commentsResult.status === 'fulfilled' ? commentsResult.value : [];

            if (technique) {
                technique.correlationRules = rules;
                technique.comments = comments;
            }

            console.log('Full data results for', techniqueId, ':', {
                technique: technique ? '✓' : '✗',
                rules: rules.length,
                comments: comments.length
            });

            return {
                technique,
                rules,
                comments,
                hasErrors: techniqueResult.status === 'rejected'
            };

        } catch (error) {
            console.error('Full data fetch error for', techniqueId, ':', error);
            throw error;
        }
    }
};

// Экспорт в глобальную область
window.MatrixServices = MatrixServices;

console.log('✅ Matrix Services v16.0 with TechniqueModal loaded');
