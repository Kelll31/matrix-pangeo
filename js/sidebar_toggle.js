// ========================================
// SIDEBAR TOGGLE
// ========================================

class SidebarToggle {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.mainContent = document.querySelector('.main-content');

        this.isCollapsed = false;

        this.init();
    }

    init() {
        // Toggle button click
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => this.toggle());
        }

        // Overlay click (mobile)
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => this.close());
        }

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });

        // Responsive check
        this.checkResponsive();
        window.addEventListener('resize', () => this.checkResponsive());
    }

    toggle() {
        if (window.innerWidth <= 768) {
            // Mobile: toggle overlay sidebar
            if (this.isOpen()) {
                this.close();
            } else {
                this.open();
            }
        } else {
            // Desktop: collapse sidebar
            this.isCollapsed = !this.isCollapsed;

            if (this.isCollapsed) {
                this.collapse();
            } else {
                this.expand();
            }
        }
    }

    open() {
        if (this.sidebar) {
            this.sidebar.classList.add('show');
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.classList.add('show');
        }
        document.body.style.overflow = 'hidden';
    }

    close() {
        if (this.sidebar) {
            this.sidebar.classList.remove('show');
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.classList.remove('show');
        }
        document.body.style.overflow = '';
    }

    collapse() {
        if (this.sidebar) {
            this.sidebar.classList.add('collapsed');
        }
        if (this.mainContent) {
            this.mainContent.style.marginLeft = '80px';
        }

        localStorage.setItem('sidebarCollapsed', 'true');
    }

    expand() {
        if (this.sidebar) {
            this.sidebar.classList.remove('collapsed');
        }
        if (this.mainContent) {
            this.mainContent.style.marginLeft = '270px';
        }

        localStorage.setItem('sidebarCollapsed', 'false');
    }

    isOpen() {
        return this.sidebar && this.sidebar.classList.contains('show');
    }

    checkResponsive() {
        if (window.innerWidth <= 768) {
            if (this.sidebar) {
                this.sidebar.classList.remove('collapsed');
            }
            this.isCollapsed = false;
        } else {
            const savedState = localStorage.getItem('sidebarCollapsed');
            if (savedState === 'true') {
                this.collapse();
            }
        }
    }
}

// Initialize
let sidebarToggleInstance;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        sidebarToggleInstance = new SidebarToggle();
    });
} else {
    sidebarToggleInstance = new SidebarToggle();
}