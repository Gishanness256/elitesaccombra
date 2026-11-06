(function (root, factory) {
  'use strict';

  const AccessLevelsModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = AccessLevelsModule;
  }

  if (root) {
    root.AccessLevelsModule = AccessLevelsModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROLES = ['Admin', 'Treasurer', 'Credit Supervisor', 'Credit Officer'];

  // Keep this order aligned with the PERMS array used by the app.
  const PERMISSIONS = [
    'Approve loans',
    'Acknowledge savings/deposits',
    'Acknowledge loan repayments',
    'Set interest rates',
    'Create/remove system users',
    'Create/remove member accounts',
    'Weekly reports',
    'Monthly reports',
    'Annual reports'
  ];

  const DEFAULTS = {
    Admin: () => PERMISSIONS.map(() => true),
    Treasurer: () => PERMISSIONS.map((_, index) => [1, 2, 6, 7, 8].includes(index)),
    'Credit Supervisor': () => PERMISSIONS.map((_, index) => [0, 2, 3, 6, 7].includes(index)),
    'Credit Officer': () => PERMISSIONS.map((_, index) => [1, 2, 6].includes(index))
  };

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const container = options.container || options.view || (doc && doc.querySelector('#view'));
    const state = options.state || options.S;

    if (!doc || !container || !state) {
      throw new Error('AccessLevelsModule.init requires a document, view container, and application state.');
    }

    const roles = options.roles || ROLES;
    const permissions = options.permissions || PERMISSIONS;
    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const currentUser = typeof options.currentUser === 'function'
      ? options.currentUser
      : () => options.user || null;
    const canEdit = typeof options.canEdit === 'function'
      ? options.canEdit
      : () => {
          const user = currentUser();
          return !user || user.role === 'Admin';
        };

    state.roles = state.roles || {};

    // Ensure every role has a permission array with the expected number of entries.
    roles.forEach((role) => {
      const current = Array.isArray(state.roles[role]) ? state.roles[role] : [];
      const defaults = DEFAULTS[role] ? DEFAULTS[role]() : permissions.map(() => false);

      state.roles[role] = permissions.map((_, index) =>
        current[index] === undefined ? Boolean(defaults[index]) : Boolean(current[index])
      );
    });

    function render() {
      const disabled = canEdit() ? '' : ' disabled';
      const rows = permissions.map((permission, permissionIndex) => {
        const checkboxes = roles.map((role) => {
          const checked = state.roles[role][permissionIndex] ? ' checked' : '';
          return `<td class="n">
            <input type="checkbox"
              data-role="${escapeHTML(role)}"
              data-permission-index="${permissionIndex}"
              aria-label="${escapeHTML(role)}: ${escapeHTML(permission)}"${checked}${disabled}>
          </td>`;
        }).join('');

        return `<tr><td>${escapeHTML(permission)}</td>${checkboxes}</tr>`;
      }).join('');

      const headers = roles
        .map((role) => `<th class="n" scope="col">${escapeHTML(role)}</th>`)
        .join('');

      container.innerHTML = `
        <div class="card">
          <h3>Tick the permissions each role holds</h3>
          <div class="tw">
            <table>
              <thead>
                <tr><th scope="col">Permission</th>${headers}</tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <button class="btn" id="sr" type="button"${disabled}>Save access levels</button>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
        </div>`;

      container.querySelector('#sr').addEventListener('click', saveChanges);

      if (!canEdit()) {
        showMessage('Only the System Admin can change access levels.', true);
      }
    }

    function showMessage(text, isError) {
      const message = container.querySelector('#msg');
      if (!message) {
        notify(text, Boolean(isError));
        return;
      }

      message.className = 'msg' + (isError ? ' err' : '');
      message.textContent = text || '';
    }

    function saveChanges() {
      if (!canEdit()) {
        showMessage('Only the System Admin can change access levels.', true);
        return;
      }

      container.querySelectorAll('[data-role][data-permission-index]').forEach((checkbox) => {
        const role = checkbox.dataset.role;
        const index = Number(checkbox.dataset.permissionIndex);

        if (state.roles[role] && Number.isInteger(index)) {
          state.roles[role][index] = checkbox.checked;
        }
      });

      audit('Access levels changed', 'Updated role permissions', currentUser());
      save();
      showMessage('Access levels saved.');
    }

    render();

    return {
      render,
      save: saveChanges,
      hasPermission(role, index) {
        return Boolean(state.roles[role] && state.roles[role][index]);
      },
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return {
    init,
    ROLES: ROLES.slice(),
    PERMISSIONS: PERMISSIONS.slice()
  };
});
