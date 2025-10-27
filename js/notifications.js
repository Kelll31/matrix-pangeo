/**
 * MITRE ATT&CK Matrix - Simple Slide Notifications
 * Простая и лаконичная анимация выдвигания
 */

const Notifications = {
    container: null,
    notifications: new Map(),

    defaultOptions: {
        duration: 5000,
        closable: true,
        persistent: false
    },

    init() {
        const oldContainers = document.querySelectorAll('[id*="notification"], [class*="notification-container"]');
        oldContainers.forEach(c => c.remove());

        this.createContainer();
        this.injectStyles();
        this.setupEventListeners();
        console.log('✅ Simple Slide Notifications initialized');
    },

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'notificationContainer';
        this.container.className = 'notification-container-simple';

        this.container.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            z-index: 999999 !important;
            pointer-events: none !important;
            max-width: 420px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 12px !important;
        `;

        document.body.appendChild(this.container);
    },

    injectStyles() {
        const oldStyles = document.querySelectorAll('[id*="notification-styles"]');
        oldStyles.forEach(s => s.remove());

        const style = document.createElement('style');
        style.id = 'notification-styles-simple';
        style.textContent = `
            /* ===== CONTAINER ===== */
            .notification-container-simple {
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                z-index: 999999 !important;
                pointer-events: none !important;
                max-width: 420px !important;
            }

            /* ===== NOTIFICATION ===== */
            .notification-simple {
                background: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 12px !important;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1) !important;
                padding: 16px 20px !important;
                min-width: 320px !important;
                pointer-events: auto !important;
                position: relative !important;
                display: flex !important;
                align-items: flex-start !important;
                gap: 12px !important;

                /* АНИМАЦИЯ ВЫДВИГАНИЯ СПРАВА */
                animation: slideInFromRight 0.3s ease-out !important;
                transform-origin: right center !important;
            }

            /* ===== ICON ===== */
            .notification-simple-icon {
                width: 36px !important;
                height: 36px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: 50% !important;
                flex-shrink: 0 !important;
                font-size: 18px !important;
                font-weight: 600 !important;
            }

            /* Success */
            .notification-simple.success .notification-simple-icon {
                background: rgba(16, 185, 129, 0.15) !important;
                color: #10b981 !important;
            }

            .notification-simple.success {
                border-left: 4px solid #10b981 !important;
            }

            /* Error */
            .notification-simple.error .notification-simple-icon {
                background: rgba(239, 68, 68, 0.15) !important;
                color: #ef4444 !important;
            }

            .notification-simple.error {
                border-left: 4px solid #ef4444 !important;
            }

            /* Warning */
            .notification-simple.warning .notification-simple-icon {
                background: rgba(245, 158, 11, 0.15) !important;
                color: #f59e0b !important;
            }

            .notification-simple.warning {
                border-left: 4px solid #f59e0b !important;
            }

            /* Info */
            .notification-simple.info .notification-simple-icon {
                background: rgba(59, 130, 246, 0.15) !important;
                color: #3b82f6 !important;
            }

            .notification-simple.info {
                border-left: 4px solid #3b82f6 !important;
            }

            /* ===== CONTENT ===== */
            .notification-simple-content {
                flex: 1 !important;
                min-width: 0 !important;
            }

            .notification-simple-title {
                font-weight: 600 !important;
                color: #1e293b !important;
                margin: 0 0 4px 0 !important;
                font-size: 14px !important;
                line-height: 1.4 !important;
            }

            .notification-simple-message {
                color: #64748b !important;
                font-size: 13px !important;
                line-height: 1.5 !important;
                margin: 0 !important;
            }

            /* ===== CLOSE BUTTON ===== */
            .notification-simple-close {
                background: transparent !important;
                border: none !important;
                color: #94a3b8 !important;
                cursor: pointer !important;
                padding: 4px !important;
                border-radius: 4px !important;
                transition: all 0.2s ease !important;
                flex-shrink: 0 !important;
                font-size: 20px !important;
                line-height: 1 !important;
                width: 24px !important;
                height: 24px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }

            .notification-simple-close:hover {
                background: #f1f5f9 !important;
                color: #1e293b !important;
            }

            /* ===== PROGRESS BAR ===== */
            .notification-simple-progress {
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 3px !important;
                background: rgba(0, 0, 0, 0.05) !important;
                border-radius: 0 0 12px 12px !important;
                overflow: hidden !important;
            }

            .notification-simple-progress-bar {
                height: 100% !important;
                transition: width linear !important;
            }

            .notification-simple.success .notification-simple-progress-bar {
                background: #10b981 !important;
            }

            .notification-simple.error .notification-simple-progress-bar {
                background: #ef4444 !important;
            }

            .notification-simple.warning .notification-simple-progress-bar {
                background: #f59e0b !important;
            }

            .notification-simple.info .notification-simple-progress-bar {
                background: #3b82f6 !important;
            }

            /* ===== АНИМАЦИЯ ПОЯВЛЕНИЯ (ВЫДВИГАНИЕ СПРАВА) ===== */
            @keyframes slideInFromRight {
                from {
                    transform: translateX(120%) !important;
                    opacity: 0 !important;
                }
                to {
                    transform: translateX(0) !important;
                    opacity: 1 !important;
                }
            }

            /* ===== АНИМАЦИЯ ИСЧЕЗНОВЕНИЯ (ЗАДВИГАНИЕ ВПРАВО) ===== */
            .notification-simple.removing {
                animation: slideOutToRight 0.3s ease-in forwards !important;
            }

            @keyframes slideOutToRight {
                from {
                    transform: translateX(0) !important;
                    opacity: 1 !important;
                }
                to {
                    transform: translateX(120%) !important;
                    opacity: 0 !important;
                }
            }

            /* ===== MOBILE ===== */
            @media (max-width: 768px) {
                .notification-container-simple {
                    top: 12px !important;
                    right: 12px !important;
                    left: 12px !important;
                    max-width: none !important;
                }

                .notification-simple {
                    min-width: auto !important;
                }
            }

            /* ===== DARK MODE ===== */
            @media (prefers-color-scheme: dark) {
                .notification-simple {
                    background: #1e293b !important;
                    border-color: #334155 !important;
                }

                .notification-simple-title {
                    color: #f1f5f9 !important;
                }

                .notification-simple-message {
                    color: #cbd5e1 !important;
                }

                .notification-simple-close {
                    color: #94a3b8 !important;
                }

                .notification-simple-close:hover {
                    background: rgba(255, 255, 255, 0.1) !important;
                    color: #f1f5f9 !important;
                }
            }

            /* ===== ACCESSIBILITY ===== */
            @media (prefers-reduced-motion: reduce) {
                .notification-simple {
                    animation: fadeIn 0.2s ease !important;
                }

                .notification-simple.removing {
                    animation: fadeOut 0.2s ease forwards !important;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            }
        `;
        document.head.appendChild(style);
    },

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.clearAll();
        });
    },

    show(message, type = 'info', options = {}) {
        const config = { ...this.defaultOptions, ...options };
        const id = this.generateId();

        const notification = this.createNotification(id, message, type, config);
        this.container.appendChild(notification);

        this.notifications.set(id, {
            element: notification,
            type,
            config,
            createdAt: Date.now()
        });

        if (!config.persistent && config.duration > 0) {
            this.scheduleRemoval(id, config.duration);
        }

        this.limitNotifications(5);

        return id;
    },

    createNotification(id, message, type, config) {
        const notification = document.createElement('div');
        notification.className = `notification-simple ${type}`;
        notification.dataset.id = id;

        const icon = this.getIcon(type);
        const title = config.title || this.getDefaultTitle(type);

        let progressHtml = '';
        if (!config.persistent && config.duration > 0) {
            progressHtml = `
                <div class="notification-simple-progress">
                    <div class="notification-simple-progress-bar" style="width: 100%; transition: width ${config.duration}ms linear;"></div>
                </div>
            `;
        }

        notification.innerHTML = `
            <div class="notification-simple-icon">${icon}</div>
            <div class="notification-simple-content">
                <div class="notification-simple-title">${title}</div>
                <div class="notification-simple-message">${message}</div>
            </div>
            ${config.closable ? '<button class="notification-simple-close" data-close>×</button>' : ''}
            ${progressHtml}
        `;

        if (config.closable) {
            const closeBtn = notification.querySelector('[data-close]');
            closeBtn.addEventListener('click', () => this.remove(id));
        }

        if (!config.persistent && config.duration > 0) {
            setTimeout(() => {
                const progressBar = notification.querySelector('.notification-simple-progress-bar');
                if (progressBar) progressBar.style.width = '0%';
            }, 50);
        }

        return notification;
    },

    getIcon(type) {
        return { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';
    },

    getDefaultTitle(type) {
        return { success: 'Успешно', error: 'Ошибка', warning: 'Внимание', info: 'Информация' }[type] || 'Информация';
    },

    generateId() {
        return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    scheduleRemoval(id, duration) {
        setTimeout(() => this.remove(id), duration);
    },

    remove(id) {
        const data = this.notifications.get(id);
        if (!data) return;

        const { element } = data;
        element.classList.add('removing');

        setTimeout(() => {
            if (element.parentNode) element.parentNode.removeChild(element);
            this.notifications.delete(id);
        }, 300);
    },

    clearAll() {
        this.notifications.forEach((data, id) => this.remove(id));
    },

    limitNotifications(max = 5) {
        if (this.notifications.size > max) {
            const oldest = Array.from(this.notifications.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
            if (oldest) this.remove(oldest[0]);
        }
    },

    success(message, options = {}) {
        return this.show(message, 'success', options);
    },

    error(message, options = {}) {
        return this.show(message, 'error', options);
    },

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    },

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Notifications.init());
} else {
    Notifications.init();
}

window.Notifications = Notifications;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Notifications;
}

console.log('✅ Simple Slide Notifications - Ready!');
