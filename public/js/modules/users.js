(function (root, factory) {
  'use strict';

  const UsersModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = UsersModule;
  }

  if (root) {
    root.UsersModule = UsersModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DOMAIN = '@elitesacco.co.ug';
  const DEFAULT_ROLES = ['Admin', 'Treasurer', 'Credit Supervisor', 'Credit Officer'];

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function initials(user) {
    if (user && user.ini) return String(user.ini);

    return String(user && user.name || '')
      .trim()
      .split(/\s+/)
      .map((part) => part[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 3);
  }

  function normalizeHandle(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(DOMAIN, '')
      .replace(/\s+/g, '.');
  }

  function validHandle(handle) {
    return /^[a-z0-9][a-z0-9._-]*$/.test(handle);
  }

  function table(headers, rows) {
    const head = headers.map((header) => `<th>${header}</th>`).join('');
    const body = rows.length
      ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell == null ? '' : cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}">No records to display.</td></tr>`;

    return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const container = options.container || options.view || (doc && doc.querySelector('#view'));
    const state = options.state || options.S;
    const roles = options.roles || DEFAULT_ROLES;
    const currentUser = typeof options.currentUser === 'function'
      ? options.currentUser
      : () => options.user || (state && state.users && state.users[0]);
    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const isAdmin = typeof options.isAdmin === 'function'
      ? options.isAdmin
      : () => {
          const user = currentUser();
          return Boolean(user && user.role === 'Admin');
        };

    if (!doc || !container || !state) {
      throw new Error('UsersModule.init requires a document, view container, and application state.');
    }

    state.users = Array.isArray(state.users) ? state.users : [];
    state.non = Array.isArray(state.non) ? state.non : [];

    function showMessage(text, error, id) {
      const element = container.querySelector(id || '#msg');
      if (element) {
        element.className = 'msg' + (error ? ' err' : '');
        element.textContent = text || '';
      } else if (text) {
        notify(text, Boolean(error));
      }
    }

    function render() {
      const roleOptions = roles
        .map((role) => `<option value="${escapeHTML(role)}">${escapeHTML(role)}</option>`)
        .join('');

      const userRows = state.users.map((user, index) => [
        escapeHTML(user.name),
        escapeHTML(initials(user)),
        escapeHTML(user.email),
        `<span class="tag">${escapeHTML(user.role)}</span>`,
        `<button class="btn alt2 sm" type="button" data-reset-user="${index}">Reset credentials</button>
         ${user !== currentUser()
           ? `<button class="btn alt2 sm" type="button" data-remove-user="${index}">Remove</button>`
           : '<span class="note">Current user</span>'}`
      ]);

      const memberRows = (state.members || []).map((member) => [
        escapeHTML(member.acc),
        escapeHTML(`${member.first || ''} ${member.last || ''}`.trim()),
        escapeHTML(member.tel),
        '<span class="tag">Member</span>'
      ]);

      const nonMemberRows = state.non.map((person) => [
        escapeHTML(person.name),
        escapeHTML(person.tel),
        escapeHTML(person.nin),
        `<button class="btn alt2 sm" type="button" data-remove-non="${escapeHTML(person.id)}">Remove</button>`
      ]);

      container.innerHTML = `
        <div class="card">
          <h3>Create system user</h3>
          <div class="row">
            <div>
              <label for="un">Full name</label>
              <input id="un" autocomplete="name">
            </div>
            <div>
              <label for="ue">Login handle</label>
              <div style="display:flex;align-items:center;gap:.4rem">
                <input id="ue" autocomplete="username" aria-describedby="domainHint">
                <span id="domainHint">${DOMAIN}</span>
              </div>
            </div>
            <div>
              <label for="up">Password</label>
              <input id="up" type="password" autocomplete="new-password">
            </div>
            <div>
              <label for="ur">Role</label>
              <select id="ur">${roleOptions}</select>
            </div>
            <div>
              <label for="ui">Initials (optional)</label>
              <input id="ui" maxlength="3" autocomplete="off">
            </div>
          </div>
          <button class="btn" id="ua" type="button">Create user</button>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
        </div>

        <div class="card">
          <h3>Reset credentials</h3>
          <div class="row">
            <div>
              <label for="rs">System user</label>
              <select id="rs">
                ${state.users.map((user, index) =>
                  `<option value="${index}">${escapeHTML(user.name)} — ${escapeHTML(user.email)}</option>`
                ).join('')}
              </select>
            </div>
            <div>
              <label for="rh">New login handle</label>
              <div style="display:flex;align-items:center;gap:.4rem">
                <input id="rh" autocomplete="username">
                <span>${DOMAIN}</span>
              </div>
            </div>
            <div>
              <label for="rp1">New password</label>
              <input id="rp1" type="password" autocomplete="new-password">
            </div>
            <div>
              <label for="rp2">Confirm new password</label>
              <input id="rp2" type="password" autocomplete="new-password">
            </div>
          </div>
          <button class="btn" id="rb" type="button">Reset credentials</button>
          <div id="msg2" class="msg" role="status" aria-live="polite"></div>
        </div>

        <div class="card">
          <h3>System users</h3>
          ${table(['Name', 'Initials', 'Login handle', 'Role', 'Actions'], userRows)}
        </div>

        <div class="card">
          <h3>SACCO members (account holders)</h3>
          ${table(['Account', 'Name', 'Telephone', 'Type'], memberRows)}
        </div>

        <div class="card">
          <h3>Non-members (borrowers without accounts)</h3>
          <div class="row">
            <div><label for="nn">Full name</label><input id="nn"></div>
            <div><label for="nt">Telephone</label><input id="nt" type="tel"></div>
            <div><label for="nx">NIN (optional)</label><input id="nx"></div>
          </div>
          <button class="btn" id="na" type="button">Add non-member</button>
          <div id="msg3" class="msg" role="status" aria-live="polite"></div>
          ${table(['Name', 'Telephone', 'NIN', 'Actions'], nonMemberRows)}
        </div>`;

      bindControls();
      if (!isAdmin()) disableAdminControls();
      updateResetHandle();
    }

    function disableAdminControls() {
      ['#ua', '#rb', '#na'].forEach((selector) => {
        const button = container.querySelector(selector);
        if (button) {
          button.disabled = true;
          button.title = 'Only the System Admin can perform this action.';
        }
      });

      container.querySelectorAll('[data-remove-user], [data-remove-non]').forEach((button) => {
        button.disabled = true;
      });

      showMessage(
        'Only the System Admin can create users, reset credentials, or remove records.',
        true
      );
    }

    function updateResetHandle() {
      const select = container.querySelector('#rs');
      const handle = container.querySelector('#rh');
      if (!select || !handle) return;

      const user = state.users[Number(select.value)];
      handle.value = user ? normalizeHandle(user.email) : '';
    }

    function bindControls() {
      const nameInput = container.querySelector('#un');
      const handleInput = container.querySelector('#ue');
      const userSelect = container.querySelector('#rs');

      if (nameInput && handleInput) {
        nameInput.addEventListener('blur', () => {
          if (!handleInput.value.trim()) {
            const firstName = nameInput.value.trim().split(/\s+/)[0] || '';
            handleInput.value = normalizeHandle(firstName).replace(/[^a-z0-9._-]/g, '');
          }
        });
      }

      if (userSelect) userSelect.addEventListener('change', updateResetHandle);

      container.querySelector('#ua')?.addEventListener('click', createUser);
      container.querySelector('#rb')?.addEventListener('click', resetCredentials);
      container.querySelector('#na')?.addEventListener('click', addNonMember);

      container.querySelectorAll('[data-reset-user]').forEach((button) => {
        button.addEventListener('click', () => {
          const select = container.querySelector('#rs');
          if (!select) return;

          select.value = button.dataset.resetUser;
          updateResetHandle();
          container.querySelector('#rp1')?.focus();
          container.querySelector('#rs')?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        });
      });

      container.querySelectorAll('[data-remove-user]').forEach((button) => {
        button.addEventListener('click', () => removeUser(Number(button.dataset.removeUser)));
      });

      container.querySelectorAll('[data-remove-non]').forEach((button) => {
        button.addEventListener('click', () => removeNonMember(button.dataset.removeNon));
      });
    }

    function createUser() {
      if (!isAdmin()) {
        return showMessage('Only the System Admin can create users.', true);
      }

      const name = container.querySelector('#un').value.trim();
      const handle = normalizeHandle(container.querySelector('#ue').value);
      const password = container.querySelector('#up').value;
      const role = container.querySelector('#ur').value;
      const enteredInitials = container.querySelector('#ui').value.trim().toUpperCase();

      if (!name || !handle || !password) {
        return showMessage('Name, login handle and password are required.', true);
      }

      if (!validHandle(handle)) {
        return showMessage(
          'Login handle may contain only letters, numbers, dots, hyphens and underscores (for example, jane).',
          true
        );
      }

      if (password.length < 6) {
        return showMessage('Password must be at least 6 characters.', true);
      }

      const email = handle + DOMAIN;
      if (state.users.some((user) => String(user.email).toLowerCase() === email)) {
        return showMessage(`${email} is already in use. Choose a different handle.`, true);
      }

      const user = {
        name,
        email,
        role,
        ini: enteredInitials || initials({ name }),
        pw: password
      };

      state.users.push(user);
      audit('User created', `Created system user ${name} (${email})`, user);
      save();
      render();
      showMessage(`System user ${name} created.`);
    }

    function resetCredentials() {
      if (!isAdmin()) {
        return showMessage('Only the System Admin can reset credentials.', true, '#msg2');
      }

      const index = Number(container.querySelector('#rs').value);
      const user = state.users[index];
      const handle = normalizeHandle(container.querySelector('#rh').value);
      const password = container.querySelector('#rp1').value;
      const confirmation = container.querySelector('#rp2').value;

      if (!user) return showMessage('Select a user.', true, '#msg2');
      if (!validHandle(handle)) {
        return showMessage(
          'Login handle may contain only letters, numbers, dots, hyphens and underscores.',
          true,
          '#msg2'
        );
      }
      if (password.length < 6) {
        return showMessage('New password must be at least 6 characters.', true, '#msg2');
      }
      if (password !== confirmation) {
        return showMessage('Passwords do not match.', true, '#msg2');
      }

      const email = handle + DOMAIN;
      if (state.users.some((other, otherIndex) =>
        otherIndex !== index && String(other.email).toLowerCase() === email
      )) {
        return showMessage(`${email} is already in use by another user.`, true, '#msg2');
      }

      const oldEmail = user.email;
      user.email = email;
      user.pw = password;

      audit(
        'Credentials reset',
        `Reset login credentials for ${user.name} (${oldEmail === email ? email : `${oldEmail} → ${email}`})`,
        currentUser()
      );
      save();

      const header = doc.querySelector('#who');
      if (header && user === currentUser()) {
        header.textContent = `Signed in as ${user.email} · ${user.role}`;
      }

      render();
      showMessage(`Credentials reset for ${user.name}. New login handle: ${email}`, false, '#msg2');
    }

    function removeUser(index) {
      if (!isAdmin()) return showMessage('Only the System Admin can remove users.', true);

      const user = state.users[index];
      if (!user) return;
      if (user === currentUser()) {
        return showMessage('You cannot remove the currently signed-in user.', true);
      }

      if (typeof options.confirm === 'function' && !options.confirm(`Remove system user ${user.name}?`)) {
        return;
      }

      state.users.splice(index, 1);
      audit('User removed', `Removed system user ${user.name} (${user.email})`, currentUser());
      save();
      render();
      showMessage(`System user ${user.name} removed.`);
    }

    function addNonMember() {
      if (!isAdmin()) {
        return showMessage('Only the System Admin can add non-members.', true, '#msg3');
      }

      const name = container.querySelector('#nn').value.trim();
      const tel = container.querySelector('#nt').value.trim();
      const nin = container.querySelector('#nx').value.trim().toUpperCase();

      if (!name) return showMessage('Name is required.', true, '#msg3');

      const record = {
        id: Date.now().toString(36),
        name,
        tel,
        nin
      };

      state.non.push(record);
      audit('Non-member added', `Added non-member borrower ${name}`, currentUser());
      save();
      render();
      showMessage(`Non-member ${name} added.`, false, '#msg3');
    }

    function removeNonMember(id) {
      if (!isAdmin()) {
        return showMessage('Only the System Admin can remove non-members.', true, '#msg3');
      }

      const index = state.non.findIndex((person) => person.id === id);
      if (index < 0) return;

      const [person] = state.non.splice(index, 1);
      audit('Non-member removed', `Removed non-member borrower ${person.name}`, currentUser());
      save();
      render();
      showMessage(`Non-member ${person.name} removed.`, false, '#msg3');
    }

    render();

    return {
      render,
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return { init };
});
