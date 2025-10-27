/**
 * ============================================================================
 * MODAL USERS - Modal Dialogs for User Management
 * ============================================================================
 * Handles create, edit, view and password-change modals for users.
 * 
 * @version 1.0.0
 * @date 2025-10-15
 */

(function () {
    'use strict';

    const MODAL_CONTAINER_ID = 'modal-root';

    // Ensure modal root exists
    function ensureModalRoot() {
        let root = document.getElementById(MODAL_CONTAINER_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = MODAL_CONTAINER_ID;
            document.body.appendChild(root);
        }
        return root;
    }

    // Close and remove modal
    function closeModal(modal) {
        modal.remove();
    }

    // Create basic overlay
    function createOverlay(contentHtml) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = contentHtml;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay);
            }
        });
        ensureModalRoot().appendChild(overlay);
        return overlay;
    }

    // View User Details Modal
    function showUserDetails(user) {
        const html = `
            <div class="modal-content user-details-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-user-circle"></i> ${escapeHtml(user.full_name)}</h2>
                    <button class="modal-close" data-close>&times;</button>
                </div>
                <div class="modal-body">
                    <div class="details-grid">
                        <div><strong>Username:</strong> ${escapeHtml(user.username)}</div>
                        <div><strong>Email:</strong> ${escapeHtml(user.email)}</div>
                        <div><strong>Role:</strong> ${escapeHtml(user.role)}</div>
                        <div><strong>Status:</strong> ${user.is_active ? 'Active' : 'Inactive'}</div>
                        <div><strong>Created:</strong> ${formatDateTime(user.created_at)}</div>
                        ${user.last_login ? `<div><strong>Last Login:</strong> ${formatDateTime(user.last_login)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
        const overlay = createOverlay(html);
        overlay.querySelector('[data-close]').onclick = () => closeModal(overlay);
    }

    // Create/Edit User Modal
    function showUserForm(type, user = {}) {
        const isEdit = type === 'edit';
        const html = `
            <div class="modal-content user-form-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-user-${isEdit ? 'edit' : 'plus'}"></i> ${isEdit ? 'Edit User' : 'Create User'}</h2>
                    <button class="modal-close" data-close>&times;</button>
                </div>
                <div class="modal-body">
                    <form id="user-form">
                        ${isEdit ? `<input type="hidden" id="form-user-id" value="${user.id}">` : ''}
                        <div class="form-group">
                            <label>Username *</label>
                            <input type="text" id="form-username" class="form-input" value="${escapeHtml(user.username || '')}" required>
                        </div>
                        <div class="form-group">
                            <label>Email *</label>
                            <input type="email" id="form-email" class="form-input" value="${escapeHtml(user.email || '')}" required>
                        </div>
                        <div class="form-group">
                            <label>Full Name *</label>
                            <input type="text" id="form-fullname" class="form-input" value="${escapeHtml(user.full_name || '')}" required>
                        </div>
                        ${!isEdit ? `
                        <div class="form-group">
                            <label>Password *</label>
                            <input type="password" id="form-password" class="form-input" required minlength="8">
                        </div>
                        ` : ''}
                        <div class="form-group">
                            <label>Role *</label>
                            <select id="form-role" class="form-select">
                                <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                                <option value="analyst" ${user.role === 'analyst' ? 'selected' : ''}>Analyst</option>
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="form-active" ${user.is_active ? 'checked' : ''}>
                                Active
                            </label>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-cancel>Cancel</button>
                    <button class="btn btn-primary" data-submit>${isEdit ? 'Save' : 'Create'}</button>
                </div>
            </div>
        `;
        const overlay = createOverlay(html);
        overlay.querySelector('[data-close]').onclick = () => closeModal(overlay);
        overlay.querySelector('[data-cancel]').onclick = () => closeModal(overlay);
        overlay.querySelector('[data-submit]').onclick = () => {
            const form = overlay.querySelector('#user-form');
            const id = form.querySelector('#form-user-id')?.value;
            const payload = {
                username: form.querySelector('#form-username').value.trim(),
                email: form.querySelector('#form-email').value.trim(),
                full_name: form.querySelector('#form-fullname').value.trim(),
                role: form.querySelector('#form-role').value,
                is_active: form.querySelector('#form-active').checked
            };
            if (!payload.username || !payload.email || !payload.full_name) {
                alert('Please fill required fields');
                return;
            }
            if (!isEdit) {
                payload.password = form.querySelector('#form-password').value;
            }
            window.UsersManager[isEdit ? 'submitEdit' : 'submitCreate'](id, payload);
            closeModal(overlay);
        };
    }

    // Change Password Modal
    function showPasswordModal(userId) {
        const html = `
            <div class="modal-content password-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-key"></i> Change Password</h2>
                    <button class="modal-close" data-close>&times;</button>
                </div>
                <div class="modal-body">
                    <form id="password-form">
                        <input type="hidden" id="pwd-user-id" value="${userId}">
                        <div class="form-group">
                            <label>New Password *</label>
                            <input type="password" id="pwd-new" class="form-input" required minlength="8">
                        </div>
                        <div class="form-group">
                            <label>Confirm *</label>
                            <input type="password" id="pwd-confirm" class="form-input" required minlength="8">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-cancel>Cancel</button>
                    <button class="btn btn-primary" data-submit>Change</button>
                </div>
            </div>
        `;
        const overlay = createOverlay(html);
        overlay.querySelector('[data-close]').onclick = () => closeModal(overlay);
        overlay.querySelector('[data-cancel]').onclick = () => closeModal(overlay);
        overlay.querySelector('[data-submit]').onclick = () => {
            const form = overlay.querySelector('#password-form');
            const newPwd = form.querySelector('#pwd-new').value;
            const confirmPwd = form.querySelector('#pwd-confirm').value;
            if (newPwd !== confirmPwd) {
                alert('Passwords do not match');
                return;
            }
            window.UsersManager.submitPassword(form.querySelector('#pwd-user-id').value, newPwd);
            closeModal(overlay);
        };
    }

    // Utility functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDateTime(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return iso; }
    }

    // Expose modals
    window.ModalUsers = {
        showUserDetails,
        showUserForm,
        showPasswordModal
    };

    console.log('✅ modal_users.js loaded');
})();
