/**
 * ========================================
 * MODAL TEMPLATES
 * MITRE ATT&CK Matrix Application v10.1
 * ========================================
 * 
 * Шаблоны для различных типов модальных окон
 * Используют существующие стили из components.css
 * 
 * @author Storm Labs
 * @version 10.1.0
 * @date 2025-10-15
 */

const ModalTemplates = {
    // ========================================
    // FORM TEMPLATES
    // ========================================

    /**
     * Базовый шаблон формы
     */
    form(fields = [], formId = 'modalForm') {
        let formHtml = `<form id="${formId}" class="modal-form">`;

        fields.forEach(field => {
            formHtml += this.renderFormField(field);
        });

        formHtml += '</form>';
        return formHtml;
    },

    /**
     * Рендер поля формы
     */
    renderFormField(field) {
        const {
            type = 'text',
            name = '',
            label = '',
            placeholder = '',
            required = false,
            value = '',
            options = [],
            rows = 3,
            maxlength = null,
            description = ''
        } = field;

        let fieldHtml = `
            <div class="form-group" style="margin-bottom: var(--space-lg);">
                <label for="field_${name}" class="form-label">
                    ${this.escapeHtml(label)}
                    ${required ? '<span style="color: var(--color-error);">*</span>' : ''}
                </label>
        `;

        switch (type) {
            case 'text':
            case 'email':
            case 'password':
                fieldHtml += `
                    <input 
                        type="${type}" 
                        id="field_${name}" 
                        name="${name}" 
                        class="form-control" 
                        placeholder="${this.escapeHtml(placeholder)}"
                        value="${this.escapeHtml(value)}"
                        ${required ? 'required' : ''}
                        ${maxlength ? `maxlength="${maxlength}"` : ''}
                    >
                `;
                break;

            case 'textarea':
                fieldHtml += `
                    <textarea 
                        id="field_${name}" 
                        name="${name}" 
                        class="form-control" 
                        rows="${rows}"
                        placeholder="${this.escapeHtml(placeholder)}"
                        ${required ? 'required' : ''}
                        ${maxlength ? `maxlength="${maxlength}"` : ''}
                    >${this.escapeHtml(value)}</textarea>
                `;
                break;

            case 'select':
                fieldHtml += `
                    <select 
                        id="field_${name}" 
                        name="${name}" 
                        class="form-select" 
                        ${required ? 'required' : ''}
                    >
                        <option value="">${placeholder || 'Выберите вариант'}</option>
                `;
                options.forEach(option => {
                    const optionValue = typeof option === 'object' ? option.value : option;
                    const optionText = typeof option === 'object' ? option.text : option;
                    const selected = value === optionValue ? 'selected' : '';
                    fieldHtml += `<option value="${this.escapeHtml(optionValue)}" ${selected}>${this.escapeHtml(optionText)}</option>`;
                });
                fieldHtml += '</select>';
                break;

            case 'checkbox':
                fieldHtml += `
                    <label class="checkbox-wrapper" style="display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-sm);">
                        <input 
                            type="checkbox" 
                            id="field_${name}" 
                            name="${name}" 
                            value="1"
                            ${value ? 'checked' : ''}
                        >
                        <span>${this.escapeHtml(placeholder || 'Включить')}</span>
                    </label>
                `;
                break;

            case 'radio':
                fieldHtml += '<div style="margin-top: var(--space-sm);">';
                options.forEach(option => {
                    const optionValue = typeof option === 'object' ? option.value : option;
                    const optionText = typeof option === 'object' ? option.text : option;
                    const checked = value === optionValue ? 'checked' : '';
                    fieldHtml += `
                        <label class="radio-wrapper" style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm);">
                            <input type="radio" name="${name}" value="${this.escapeHtml(optionValue)}" ${checked}>
                            <span>${this.escapeHtml(optionText)}</span>
                        </label>
                    `;
                });
                fieldHtml += '</div>';
                break;
        }

        if (description) {
            fieldHtml += `
                <div class="form-help" style="margin-top: var(--space-xs); font-size: var(--font-size-xs); color: var(--text-muted);">
                    ${this.escapeHtml(description)}
                </div>
            `;
        }

        fieldHtml += '</div>';
        return fieldHtml;
    },

    // ========================================
    // CONTENT TEMPLATES
    // ========================================

    /**
     * Информационный блок
     */
    info(content, icon = 'fa-info-circle') {
        return `
            <div class="modal-info" style="display: flex; gap: var(--space-md); padding: var(--space-lg); background: var(--color-info-bg); border: 1px solid var(--accent-blue-light); border-radius: var(--radius-lg);">
                <div style="flex-shrink: 0;">
                    <i class="fas ${icon}" style="font-size: var(--font-size-lg); color: var(--accent-blue);"></i>
                </div>
                <div style="color: var(--text-primary);">
                    ${content}
                </div>
            </div>
        `;
    },

    /**
     * Предупреждение
     */
    warning(content, icon = 'fa-exclamation-triangle') {
        return `
            <div class="modal-warning" style="display: flex; gap: var(--space-md); padding: var(--space-lg); background: var(--color-warning-bg); border: 1px solid var(--accent-orange-light); border-radius: var(--radius-lg);">
                <div style="flex-shrink: 0;">
                    <i class="fas ${icon}" style="font-size: var(--font-size-lg); color: var(--accent-orange);"></i>
                </div>
                <div style="color: var(--text-primary);">
                    ${content}
                </div>
            </div>
        `;
    },

    /**
     * Ошибка
     */
    error(content, icon = 'fa-times-circle') {
        return `
            <div class="modal-error" style="display: flex; gap: var(--space-md); padding: var(--space-lg); background: var(--color-error-bg); border: 1px solid var(--accent-red-light); border-radius: var(--radius-lg);">
                <div style="flex-shrink: 0;">
                    <i class="fas ${icon}" style="font-size: var(--font-size-lg); color: var(--accent-red);"></i>
                </div>
                <div style="color: var(--text-primary);">
                    ${content}
                </div>
            </div>
        `;
    },

    /**
     * Успех
     */
    success(content, icon = 'fa-check-circle') {
        return `
            <div class="modal-success" style="display: flex; gap: var(--space-md); padding: var(--space-lg); background: var(--color-success-bg); border: 1px solid var(--accent-green-light); border-radius: var(--radius-lg);">
                <div style="flex-shrink: 0;">
                    <i class="fas ${icon}" style="font-size: var(--font-size-lg); color: var(--accent-green);"></i>
                </div>
                <div style="color: var(--text-primary);">
                    ${content}
                </div>
            </div>
        `;
    },

    /**
     * Индикатор загрузки
     */
    loading(message = 'Загрузка...') {
        return `
            <div class="modal-loading" style="text-align: center; padding: var(--space-2xl);">
                <div class="loading-spinner large">
                    <i class="fas fa-spinner fa-spin" style="font-size: var(--font-size-3xl); color: var(--brand-primary); margin-bottom: var(--space-md);"></i>
                    <div style="color: var(--text-muted); font-size: var(--font-size-base);">${this.escapeHtml(message)}</div>
                </div>
            </div>
        `;
    },

    /**
     * Детали элемента в виде списка
     */
    detailsList(details = {}, title = null) {
        let content = '';

        if (title) {
            content += `<h4 style="margin: 0 0 var(--space-lg) 0; color: var(--text-primary);">${this.escapeHtml(title)}</h4>`;
        }

        content += '<div class="details-list">';

        Object.entries(details).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                content += `
                    <div style="display: flex; padding: var(--space-sm) 0; border-bottom: 1px solid var(--border-color);">
                        <div style="flex: 0 0 30%; font-weight: var(--font-weight-semibold); color: var(--text-muted);">
                            ${this.escapeHtml(key)}:
                        </div>
                        <div style="flex: 1; color: var(--text-primary);">
                            ${this.formatValue(value)}
                        </div>
                    </div>
                `;
            }
        });

        content += '</div>';
        return content;
    },

    /**
     * Таблица данных
     */
    table(data = [], columns = [], title = null) {
        if (!data.length) return '<p style="text-align: center; color: var(--text-muted);">Нет данных для отображения</p>';

        let content = '';

        if (title) {
            content += `<h4 style="margin: 0 0 var(--space-lg) 0; color: var(--text-primary);">${this.escapeHtml(title)}</h4>`;
        }

        content += `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--bg-tertiary);">
        `;

        columns.forEach(col => {
            const colTitle = typeof col === 'object' ? col.title : col;
            content += `
                <th style="padding: var(--space-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--text-primary); border-bottom: 1px solid var(--border-color);">
                    ${this.escapeHtml(colTitle)}
                </th>
            `;
        });

        content += '</tr></thead><tbody>';

        data.forEach(row => {
            content += '<tr style="border-bottom: 1px solid var(--border-color);">';
            columns.forEach(col => {
                const colKey = typeof col === 'object' ? col.key : col;
                const value = row[colKey] || '';
                content += `
                    <td style="padding: var(--space-md); color: var(--text-secondary);">
                        ${this.formatValue(value)}
                    </td>
                `;
            });
            content += '</tr>';
        });

        content += '</tbody></table></div>';
        return content;
    },

    /**
     * Код с подсветкой синтаксиса
     */
    code(code, language = 'text') {
        return `
            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden;">
                <div style="padding: var(--space-sm) var(--space-md); background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-xs); color: var(--text-muted); text-transform: uppercase;">
                    ${this.escapeHtml(language)}
                </div>
                <pre style="margin: 0; padding: var(--space-lg); overflow-x: auto; font-family: var(--font-family-mono); font-size: var(--font-size-sm); color: var(--text-primary); line-height: 1.5;"><code>${this.escapeHtml(code)}</code></pre>
            </div>
        `;
    },

    // ========================================
    // SPECIALIZED TEMPLATES
    // ========================================

    /**
     * Шаблон для техник MITRE ATT&CK
     */
    techniqueDetails(technique) {
        const details = {
            'ID': technique.id || technique.attack_id,
            'Название': technique.name,
            'Тактики': Array.isArray(technique.tactics) ? technique.tactics.join(', ') : technique.tactics,
            'Платформы': Array.isArray(technique.platforms) ? technique.platforms.join(', ') : technique.platforms,
            'Источники данных': Array.isArray(technique.data_sources) ? technique.data_sources.join(', ') : technique.data_sources,
            'Версия': technique.version,
            'Создано': technique.created_at ? new Date(technique.created_at).toLocaleString('ru-RU') : null,
            'Обновлено': technique.updated_at ? new Date(technique.updated_at).toLocaleString('ru-RU') : null
        };

        let content = this.detailsList(details);

        if (technique.description) {
            content += `
                <div style="margin-top: var(--space-xl);">
                    <h4 style="margin: 0 0 var(--space-md) 0; color: var(--text-primary);">Описание</h4>
                    <div style="color: var(--text-secondary); line-height: 1.6;">
                        ${this.escapeHtml(technique.description)}
                    </div>
                </div>
            `;
        }

        return content;
    },

    /**
     * Шаблон для правил корреляции
     */
    ruleDetails(rule) {
        const details = {
            'ID': rule.id,
            'Название': rule.name,
            'Тип': rule.rule_type,
            'Статус': rule.status,
            'Серьезность': rule.severity,
            'Категория': rule.category,
            'Автор': rule.author,
            'Создано': rule.created_at ? new Date(rule.created_at).toLocaleString('ru-RU') : null,
            'Обновлено': rule.updated_at ? new Date(rule.updated_at).toLocaleString('ru-RU') : null
        };

        let content = this.detailsList(details);

        if (rule.description) {
            content += `
                <div style="margin-top: var(--space-xl);">
                    <h4 style="margin: 0 0 var(--space-md) 0; color: var(--text-primary);">Описание</h4>
                    <div style="color: var(--text-secondary); line-height: 1.6;">
                        ${this.escapeHtml(rule.description)}
                    </div>
                </div>
            `;
        }

        if (rule.rule_logic) {
            content += `
                <div style="margin-top: var(--space-xl);">
                    <h4 style="margin: 0 0 var(--space-md) 0; color: var(--text-primary);">Логика правила</h4>
                    ${this.code(rule.rule_logic, 'sql')}
                </div>
            `;
        }

        return content;
    },

    // ========================================
    // UTILITIES
    // ========================================

    /**
     * Форматирование значений
     */
    formatValue(value) {
        if (value === null || value === undefined) {
            return '<span style="color: var(--text-muted); font-style: italic;">-</span>';
        }

        if (typeof value === 'boolean') {
            return value
                ? '<span style="color: var(--color-success);">Да</span>'
                : '<span style="color: var(--color-error);">Нет</span>';
        }

        if (Array.isArray(value)) {
            return value.length > 0
                ? this.escapeHtml(value.join(', '))
                : '<span style="color: var(--text-muted); font-style: italic;">Пусто</span>';
        }

        if (typeof value === 'object') {
            return this.escapeHtml(JSON.stringify(value, null, 2));
        }

        // Проверяем, является ли значение URL
        const urlPattern = /^(https?:\/\/[^\s]+)$/i;
        if (typeof value === 'string' && urlPattern.test(value)) {
            return `<a href="${this.escapeHtml(value)}" target="_blank" style="color: var(--brand-primary);">${this.escapeHtml(value)}</a>`;
        }

        return this.escapeHtml(String(value));
    },

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    },

    /**
     * Извлечение данных формы
     */
    extractFormData(formElement) {
        const formData = new FormData(formElement);
        const data = {};

        for (const [key, value] of formData.entries()) {
            // Обработка чекбоксов и радио-кнопок
            const field = formElement.querySelector(`[name="${key}"]`);
            if (field) {
                if (field.type === 'checkbox') {
                    data[key] = field.checked;
                } else if (field.type === 'radio') {
                    if (field.checked) {
                        data[key] = value;
                    }
                } else {
                    data[key] = value;
                }
            }
        }

        return data;
    },

    /**
     * Валидация формы
     */
    validateForm(formElement) {
        const errors = [];
        const requiredFields = formElement.querySelectorAll('[required]');

        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                const label = formElement.querySelector(`label[for="${field.id}"]`);
                const fieldName = label ? label.textContent.replace('*', '').trim() : field.name;
                errors.push(`Поле "${fieldName}" обязательно для заполнения`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }
};

// Export для модульной системы
window.ModalTemplates = ModalTemplates;