/**
 * ========================================
 * MODAL ENGINE - ЕДИНАЯ ТОЧКА ВХОДА
 * MITRE ATT&CK Matrix Application v10.1
 * ========================================
 * 
 * Центральный движок модальных окон
 * Координирует работу всех модальных компонентов
 * Использует существующие CSS стили из components.css
 * 
 * @author Storm Labs
 * @version 10.1.0
 * @date 2025-10-15
 */

const ModalEngine = {
    // ========================================
    // CONFIGURATION
    // ========================================
    config: {
        baseClass: 'modal',
        overlayClass: 'modal-overlay',
        closeOnBackdrop: true,
        closeOnEscape: true,
        focusTrap: true,
        animationDuration: 300,
        zIndex: {
            base: 1040,
            step: 10
        },
        sizes: {
            sm: { width: '400px', maxHeight: '60vh' },
            md: { width: '600px', maxHeight: '70vh' },
            lg: { width: '800px', maxHeight: '80vh' },
            xl: { width: '1000px', maxHeight: '90vh' },
            full: { width: '95vw', maxHeight: '95vh' }
        }
    },

    // ========================================
    // STATE
    // ========================================
    state: {
        modals: new Map(),
        activeModal: null,
        modalCount: 0,
        initialized: false
    },

    // ========================================
    // INITIALIZATION
    // ========================================
    init() {
        if (this.state.initialized) return;

        console.log('🎬 Initializing Modal Engine...');

        // Создаём контейнер для модалов
        this.createModalContainer();

        // Настраиваем глобальные обработчики
        this.setupGlobalHandlers();

        this.state.initialized = true;
        console.log('✅ Modal Engine initialized');
    },

    createModalContainer() {
        if (document.getElementById('modal-container')) return;

        const container = document.createElement('div');
        container.id = 'modal-container';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: ${this.config.zIndex.base};
        `;
        document.body.appendChild(container);
    },

    setupGlobalHandlers() {
        // ESC для закрытия модалов
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.config.closeOnEscape && this.state.activeModal) {
                this.close(this.state.activeModal);
            }
        });

        // Предотвращаем скролл body при открытом модале
        this.preventBodyScroll();

        console.log('⌨️ Global handlers setup complete');
    },

    preventBodyScroll() {
        const originalStyle = window.getComputedStyle(document.body).overflow;

        this.updateBodyScroll = () => {
            if (this.state.modalCount > 0) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = originalStyle;
            }
        };
    },

    // ========================================
    // MODAL MANAGEMENT
    // ========================================
    open(options = {}) {
        this.init(); // Ленивая инициализация

        const modalId = `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const modal = this.createModal(modalId, options);

        this.state.modals.set(modalId, modal);
        this.state.activeModal = modalId;
        this.state.modalCount++;

        this.showModal(modalId);
        this.updateBodyScroll();

        return modalId;
    },

    close(modalId = null) {
        const targetId = modalId || this.state.activeModal;
        if (!targetId || !this.state.modals.has(targetId)) return;

        this.hideModal(targetId);

        setTimeout(() => {
            this.destroyModal(targetId);
        }, this.config.animationDuration);
    },

    createModal(modalId, options) {
        const {
            title = 'Modal',
            content = '',
            size = 'md',
            type = 'default',
            showHeader = true,
            showFooter = true,
            buttons = [],
            onShow = null,
            onHide = null
        } = options;

        const modal = {
            id: modalId,
            options,
            element: this.buildModalElement(modalId, {
                title,
                content,
                size,
                type,
                showHeader,
                showFooter,
                buttons
            }),
            callbacks: { onShow, onHide }
        };

        return modal;
    },

    buildModalElement(modalId, config) {
        const { title, content, size, type, showHeader, showFooter, buttons } = config;
        const sizeConfig = this.config.sizes[size] || this.config.sizes.md;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: var(--bg-modal);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            visibility: hidden;
            transition: all ${this.config.animationDuration}ms ease;
            pointer-events: auto;
            z-index: ${this.config.zIndex.base + this.state.modalCount * this.config.zIndex.step};
        `;

        // Закрытие по клику на backdrop
        if (this.config.closeOnBackdrop) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.close(modalId);
                }
            });
        }

        const modalDialog = document.createElement('div');
        modalDialog.className = 'modal-dialog';
        modalDialog.style.cssText = `
            width: 100%;
            height: 80%;
            max-width: 90vw;
            background: var(--bg-card);
            border-radius: var(--radius-xl);
            box-shadow: var(--shadow-xl);
            display: flex;
            flex-direction: column;
            transform: scale(0.9) translateY(20px);
            transition: all ${this.config.animationDuration}ms ease;
        `;

        let modalContent = '';

        // Header
        if (showHeader) {
            modalContent += `
                <div class="modal-header" style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--space-xl);
                    border-bottom: 1px solid var(--border-color);
                ">
                    <h3 style="
                        margin: 0;
                        font-size: var(--font-size-lg);
                        font-weight: var(--font-weight-semibold);
                        color: var(--text-primary);
                    ">${this.escapeHtml(title)}</h3>
                    <button class="btn btn-icon btn-ghost modal-close" style="
                        margin: calc(var(--space-sm) * -1);
                    ">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }

        // Body
        modalContent += `
            <div class="modal-body" style="
                flex: 1;
                padding: var(--space-xl);
                overflow-y: auto;
            ">
                ${content}
            </div>
        `;

        // Footer
        if (showFooter && buttons.length > 0) {
            const buttonElements = buttons.map(btn =>
                `<button class="btn ${btn.class || 'btn-secondary'}" data-action="${btn.action || ''}">${btn.text || 'Button'}</button>`
            ).join(' ');

            modalContent += `
                <div class="modal-footer" style="
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: var(--space-md);
                    padding: var(--space-xl);
                    border-top: 1px solid var(--border-color);
                ">
                    ${buttonElements}
                </div>
            `;
        }

        modalDialog.innerHTML = modalContent;

        // Обработчики кнопок
        modalDialog.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.close(modalId));
        });

        modalDialog.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const actionName = btn.getAttribute('data-action');
                const button = buttons.find(b => b.action === actionName);

                if (button && typeof button.handler === 'function') {
                    button.handler(e);
                } else if (actionName === 'close') {
                    this.close(modalId);
                }
            });
        });

        overlay.appendChild(modalDialog);
        return overlay;
    },

    showModal(modalId) {
        const modal = this.state.modals.get(modalId);
        if (!modal) return;

        const container = document.getElementById('modal-container');
        container.appendChild(modal.element);

        // Анимация появления
        requestAnimationFrame(() => {
            modal.element.style.opacity = '1';
            modal.element.style.visibility = 'visible';

            const dialog = modal.element.querySelector('.modal-dialog');
            dialog.style.transform = 'scale(1) translateY(0)';
        });

        // Focus trap
        if (this.config.focusTrap) {
            this.trapFocus(modal.element);
        }

        // Callback
        if (modal.callbacks.onShow) {
            modal.callbacks.onShow(modalId);
        }
    },

    hideModal(modalId) {
        const modal = this.state.modals.get(modalId);
        if (!modal) return;

        modal.element.style.opacity = '0';
        modal.element.style.visibility = 'hidden';

        const dialog = modal.element.querySelector('.modal-dialog');
        dialog.style.transform = 'scale(0.9) translateY(20px)';

        // Callback
        if (modal.callbacks.onHide) {
            modal.callbacks.onHide(modalId);
        }
    },

    destroyModal(modalId) {
        const modal = this.state.modals.get(modalId);
        if (!modal) return;

        modal.element.remove();
        this.state.modals.delete(modalId);
        this.state.modalCount--;

        if (this.state.activeModal === modalId) {
            // Находим следующий активный модал
            const modalIds = Array.from(this.state.modals.keys());
            this.state.activeModal = modalIds.length > 0 ? modalIds[modalIds.length - 1] : null;
        }

        this.updateBodyScroll();
    },

    // ========================================
    // SHORTCUTS
    // ========================================
    alert(message, title = 'Информация') {
        return this.open({
            title,
            content: `<p style="margin: 0; color: var(--text-primary);">${this.escapeHtml(message)}</p>`,
            size: 'md',
            buttons: [
                { text: 'OK', class: 'btn-primary', action: 'close', handler: () => this.close() }
            ]
        });
    },

    confirm(message, title = 'Подтверждение') {
        return new Promise((resolve) => {
            this.open({
                title,
                content: `<p style="margin: 0; color: var(--text-primary);">${this.escapeHtml(message)}</p>`,
                size: 'md',
                buttons: [
                    {
                        text: 'Да',
                        class: 'btn-primary',
                        action: 'confirm',
                        handler: () => {
                            resolve(true);
                            this.close();
                        }
                    },
                    {
                        text: 'Отмена',
                        class: 'btn-secondary',
                        action: 'cancel',
                        handler: () => {
                            resolve(false);
                            this.close();
                        }
                    }
                ]
            });
        });
    },

    loading(message = 'Загрузка...') {
        return this.open({
            title: message,
            content: `
                <div class="loading-spinner" style="text-align: center; padding: var(--space-xl);">
                    <i class="fas fa-spinner fa-spin" style="font-size: var(--font-size-3xl); color: var(--brand-primary); margin-bottom: var(--space-md);"></i>
                    <div style="color: var(--text-muted);">Пожалуйста, подождите...</div>
                </div>
            `,
            size: 'sm',
            showHeader: false,
            showFooter: false
        });
    },

    // ========================================
    // SPECIALIZED MODALS
    // ========================================
    comment(options = {}) {
        if (typeof CommentModal !== 'undefined') {
            return CommentModal.show(options);
        }
        console.warn('CommentModal not loaded');
        return null;
    },

    technique(options = {}) {
        if (typeof TechniqueModal !== 'undefined') {
            return TechniqueModal.show(options);
        }
        console.warn('TechniqueModal not loaded');
        return null;
    },

    rule(options = {}) {
        if (typeof RuleModal !== 'undefined') {
            return RuleModal.show(options);
        }
        console.warn('RuleModal not loaded');
        return null;
    },

    // ========================================
    // UTILITIES
    // ========================================
    trapFocus(element) {
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        firstElement.focus();

        element.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        });
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // ========================================
    // PUBLIC API
    // ========================================
    closeAll() {
        Array.from(this.state.modals.keys()).forEach(modalId => {
            this.close(modalId);
        });
    },

    isOpen(modalId = null) {
        if (modalId) {
            return this.state.modals.has(modalId);
        }
        return this.state.modalCount > 0;
    },

    getActiveModal() {
        return this.state.activeModal;
    }
};

// ========================================
// AUTO-INITIALIZE
// ========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ModalEngine.init());
} else {
    ModalEngine.init();
}

// Export для модульной системы
window.ModalEngine = ModalEngine;