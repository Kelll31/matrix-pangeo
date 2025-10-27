/**
 * ========================================================================
 * MATRIX ORGANIZER v11.0 - ПОЛНОСТЬЮ ИСПРАВЛЕН
 * ========================================================================
 * Правильная организация матрицы с корректной раскладкой техник
 * по тактикам и подтехникам
 * 
 * @version 11.0.0-FINAL
 * @date 2025-10-17
 */

const MatrixOrganizer = {
    /**
     * 🔧 ГЛАВНЫЙ МЕТОД: Организация данных матрицы в табличную структуру
     * @param {Object} matrixData - Данные матрицы с тактиками и техниками
     * @param {Object} filters - Текущие фильтры
     * @returns {Object} Организованная структура матрицы
     */
    organizeMatrix(matrixData, filters = {}) {
        console.log('📊 Organizing matrix data...', {
            tactics: matrixData.tactics?.length || 0,
            parent_techniques: matrixData.parent_techniques?.length || 0,
            filters
        });

        if (!matrixData || !matrixData.tactics || !matrixData.parent_techniques) {
            console.error('❌ Invalid matrix data structure');
            return { rows: [], tactics: [], filteredCount: 0, totalCount: 0 };
        }

        // 1. Получаем отфильтрованные тактики
        const tactics = this._filterTactics(matrixData.tactics, filters);
        console.log(`✅ Filtered tactics: ${tactics.length}`);

        // 2. Получаем отфильтрованные техники
        const filteredTechniques = this._filterTechniques(matrixData.parent_techniques, filters);
        console.log(`✅ Filtered parent techniques: ${filteredTechniques.length}`);

        // 3. Строим карту техник по тактикам
        const techniquesByTactic = this._buildTechniquesByTacticMap(filteredTechniques, tactics);

        // 4. Определяем максимальное количество строк для каждой тактики
        const maxRowsPerTactic = {};
        tactics.forEach(tactic => {
            const tacticId = this._getTacticId(tactic);
            maxRowsPerTactic[tacticId] = (techniquesByTactic[tacticId] || []).length;
        });

        const maxRows = Math.max(...Object.values(maxRowsPerTactic), 0);
        console.log(`📏 Max rows needed: ${maxRows}`);

        // 5. Генерируем строки матрицы
        const rows = this._generateMatrixRows(tactics, techniquesByTactic, maxRows);

        console.log(`✅ Matrix organized: ${rows.length} rows, ${tactics.length} tactics`);

        return {
            rows,
            tactics,
            filteredCount: filteredTechniques.length,
            totalCount: matrixData.parent_techniques?.length || 0
        };
    },

    /**
     * 🔧 Фильтрация тактик
     */
    _filterTactics(tactics, filters) {
        let filtered = [...tactics];

        // Фильтр по конкретной тактике
        if (filters.tactic && filters.tactic !== 'all') {
            filtered = filtered.filter(t =>
                this._getTacticShortname(t) === filters.tactic
            );
        }

        return filtered;
    },

    /**
     * 🔧 Фильтрация техник
     */
    _filterTechniques(techniques, filters) {
        let filtered = [...techniques];

        // Фильтр по платформе
        if (filters.platform && filters.platform !== 'all') {
            filtered = filtered.filter(tech => {
                const platforms = tech.platforms || [];
                return platforms.includes(filters.platform);
            });
        }

        // Фильтр по покрытию
        if (filters.coverage === 'covered') {
            filtered = filtered.filter(tech => {
                const activeRules = tech.coverage?.active_rules || 0;
                return activeRules > 0;
            });
        } else if (filters.coverage === 'uncovered') {
            filtered = filtered.filter(tech => {
                const activeRules = tech.coverage?.active_rules || 0;
                return activeRules === 0;
            });
        }

        // Фильтр по поиску
        if (filters.search && filters.search.trim()) {
            const searchLower = filters.search.toLowerCase().trim();
            filtered = filtered.filter(tech => {
                const techId = this._getTechniqueId(tech).toLowerCase();
                const techName = (tech.name_ru || tech.name || '').toLowerCase();
                return techId.includes(searchLower) || techName.includes(searchLower);
            });
        }

        // Фильтр по конкретной тактике
        if (filters.tactic && filters.tactic !== 'all') {
            filtered = filtered.filter(tech => {
                const tactics = tech.tactics || [];
                return tactics.some(t =>
                    this._getTacticShortname(t) === filters.tactic
                );
            });
        }

        return filtered;
    },

    /**
     * 🔧 Построение карты техник по тактикам
     */
    _buildTechniquesByTacticMap(techniques, tactics) {
        const techniquesByTactic = {};

        // Инициализируем пустыми массивами
        tactics.forEach(tactic => {
            const tacticId = this._getTacticId(tactic);
            techniquesByTactic[tacticId] = [];
        });

        // Распределяем техники по тактикам
        techniques.forEach(technique => {
            const techniqueTactics = technique.tactics || [];

            // Добавляем технику в каждую её тактику
            techniqueTactics.forEach(techTactic => {
                const tacticId = this._getTacticShortname(techTactic);

                if (techniquesByTactic[tacticId]) {
                    techniquesByTactic[tacticId].push(technique);
                }
            });
        });

        return techniquesByTactic;
    },

    /**
     * 🔧 Генерация строк матрицы
     */
    _generateMatrixRows(tactics, techniquesByTactic, maxRows) {
        const rows = [];

        for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
            const row = {
                index: rowIndex,
                cells: []
            };

            // Генерируем ячейки для каждой тактики
            tactics.forEach(tactic => {
                const tacticId = this._getTacticId(tactic);
                const techniques = techniquesByTactic[tacticId] || [];
                const technique = techniques[rowIndex] || null;

                // Создаём ячейку
                const cell = {
                    tacticId: tacticId,
                    rowIndex: rowIndex,
                    isEmpty: !technique,
                    technique: technique,
                    subtechniques: technique ? (technique.subtechniques || []) : []
                };

                row.cells.push(cell);
            });

            rows.push(row);
        }

        return rows;
    },

    /**
     * Вспомогательные методы для получения данных
     */
    _getTacticId(tactic) {
        return tactic?.shortname || tactic?.x_mitre_shortname || tactic?.id || '';
    },

    _getTacticShortname(tactic) {
        return tactic?.shortname || tactic?.x_mitre_shortname || '';
    },

    _getTechniqueId(tech) {
        return tech?.technique_id || tech?.attack_id || tech?.id || '';
    }
};

// Экспорт
window.MatrixOrganizer = MatrixOrganizer;
console.log('✅ Matrix Organizer v11.0 loaded');
