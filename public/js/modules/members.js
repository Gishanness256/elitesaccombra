(function (root, factory) {
  'use strict';

  const MembersModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = MembersModule;
  }

  if (root) {
    root.MembersModule = MembersModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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
      throw new Error('MembersModule.init requires a document, view container, and application state.');
    }

    state.members = Array.isArray(state.members) ? state.members : [];
    state.seq = Number.isFinite(Number(state.seq)) ? Number(state.seq) : 0;

    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const canManage = typeof options.canManage === 'function'
      ? options.canManage
      : () => true;
    const confirmAction = typeof options.confirm === 'function'
      ? options.confirm
      : (message) => typeof window === 'undefined' || window.confirm(message);

    let editingAccount = null;
    let photoData = '';

    function message(text, isError) {
      const element = container.querySelector('#msg');
      if (!element) {
        if (text) notify(text, Boolean(isError));
        return;
      }

      element.className = 'msg' + (isError ? ' err' : '');
      element.textContent = text || '';
    }

    function accountNumber() {
      const prefix = container.querySelector('#mg')?.value.trim() || 'F';
      const nextSequence = editingAccount
        ? state.members.find((member) => member.acc === editingAccount)?.acc
        : null;

      return nextSequence || `ES-${prefix} ${String(state.seq + 1).padStart(6, '0')}`;
    }

    function updateAccountPreview() {
      const account = container.querySelector('#an');
      if (account) account.textContent = accountNumber();
    }

    function render() {
      const rows = state.members.map((member) => {
        const photo = member.photo
          ? `<img src="${escapeHTML(member.photo)}" alt="Photo of ${escapeHTML(member.first)} ${escapeHTML(member.last)}" style="width:36px;height:44px;object-fit:cover;border-radius:8px">`
          : '<span class="photo" style="width:36px;height:44px">No photo</span>';

        return `<tr>
          <td>${photo}</td>
          <td>${escapeHTML(member.acc)}</td>
          <td>${escapeHTML(`${member.first || ''} ${member.last || ''}`.trim())}</td>
          <td>${escapeHTML(member.dob)}</td>
          <td>${escapeHTML(member.nin)}</td>
          <td>${escapeHTML(member.tel)}</td>
          <td>${escapeHTML(member.addr)}</td>
          <td>
            <button type="button" class="btn alt2 sm" data-e="${escapeHTML(member.acc)}">Edit</button>
            <button type="button" class="btn alt2 sm" data-d="${escapeHTML(member.acc)}">Remove</button>
          </td>
        </tr>`;
      }).join('');

      container.innerHTML = `
        <div class="card">
          <h3 id="mh">Add member</h3>
          <div class="row">
            <div><label for="mf">First name</label><input id="mf" autocomplete="given-name"></div>
            <div><label for="ml">Last name</label><input id="ml" autocomplete="family-name"></div>
            <div><label for="md">Date of birth</label><input id="md" type="date" autocomplete="bday"></div>
            <div><label for="mg">Account prefix</label><input id="mg" value="F" maxlength="8" autocomplete="off"></div>
            <div><label for="ma">Address</label><input id="ma" autocomplete="street-address"></div>
            <div><label for="mn">NIN</label><input id="mn" autocomplete="off"></div>
            <div><label for="mt">Telephone</label><input id="mt" type="tel" autocomplete="tel"></div>
            <div><label for="me">Email</label><input id="me" type="email" autocomplete="email"></div>
          </div>

          <label for="pf">Passport photo</label>
          <div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">
            <div class="photo" id="ph">No photo</div>
            <input id="pf" type="file" accept="image/*" style="max-width:300px">
          </div>

          <p style="margin-top:.8rem">Account number: <b id="an"></b></p>
          <button class="btn" id="ms" type="button">Save member</button>
          <button class="btn alt2" id="mc" type="button">Clear</button>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
        </div>

        <div class="card">
          <h3>Members</h3>
          <div class="tw">
            <table>
              <thead>
                <tr>
                  <th scope="col">Photo</th>
                  <th scope="col">Account</th>
                  <th scope="col">Name</th>
                  <th scope="col">DOB</th>
                  <th scope="col">NIN</th>
                  <th scope="col">Telephone</th>
                  <th scope="col">Address</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="8">No members recorded.</td></tr>`}</tbody>
            </table>
          </div>
        </div>`;

      bindControls();
      updateAccountPreview();
    }

    function bindControls() {
      container.querySelector('#mg')?.addEventListener('input', updateAccountPreview);
      container.querySelector('#mc')?.addEventListener('click', clearForm);
      container.querySelector('#ms')?.addEventListener('click', saveMember);
      container.querySelector('#pf')?.addEventListener('change', handlePhoto);

      container.querySelectorAll('[data-e]').forEach((button) => {
        button.addEventListener('click', () => editMember(button.dataset.e));
      });

      container.querySelectorAll('[data-d]').forEach((button) => {
        button.addEventListener('click', () => removeMember(button.dataset.d));
      });
    }

    function handlePhoto(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        message('Choose an image file.', true);
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        photoData = String(reader.result || '');

        const preview = container.querySelector('#ph');
        if (preview) {
          preview.style.backgroundImage = `url("${photoData}")`;
          preview.textContent = '';
        }
      };
      reader.onerror = () => message('Could not read the selected photo.', true);
      reader.readAsDataURL(file);
    }

    function editMember(account) {
      const member = state.members.find((item) => item.acc === account);
      if (!member) return;

      editingAccount = member.acc;
      photoData = member.photo || '';

      container.querySelector('#mh').textContent = 'Edit member';
      container.querySelector('#mf').value = member.first || '';
      container.querySelector('#ml').value = member.last || '';
      container.querySelector('#md').value = member.dob || '';
      container.querySelector('#ma').value = member.addr || '';
      container.querySelector('#mn').value = member.nin || '';
      container.querySelector('#mt').value = member.tel || '';
      container.querySelector('#me').value = member.email || '';

      const prefix = container.querySelector('#mg');
      if (prefix) {
        prefix.value = (member.acc.match(/^ES-(.*?)\s/) || [null, 'F'])[1];
      }

      const preview = container.querySelector('#ph');
      if (preview && photoData) {
        preview.style.backgroundImage = `url("${photoData}")`;
        preview.textContent = '';
      }

      container.querySelector('#an').textContent = member.acc;
      message('');
      container.querySelector('#mf').focus();
    }

    function clearForm() {
      editingAccount = null;
      photoData = '';

      const formFields = ['#mf', '#ml', '#md', '#ma', '#mn', '#mt', '#me'];
      formFields.forEach((selector) => {
        const field = container.querySelector(selector);
        if (field) field.value = '';
      });

      const prefix = container.querySelector('#mg');
      if (prefix) prefix.value = 'F';

      const fileInput = container.querySelector('#pf');
      if (fileInput) fileInput.value = '';

      const preview = container.querySelector('#ph');
      if (preview) {
        preview.style.backgroundImage = '';
        preview.textContent = 'No photo';
      }

      container.querySelector('#mh').textContent = 'Add member';
      updateAccountPreview();
      message('');
    }

    function saveMember() {
      if (!canManage()) {
        return message('You do not have permission to manage members.', true);
      }

      const value = (selector) => container.querySelector(selector).value.trim();
      const first = value('#mf');
      const last = value('#ml');
      const dob = value('#md');
      const addr = value('#ma');
      const nin = value('#mn').toUpperCase();
      const tel = value('#mt');
      const email = value('#me');

      if (!first || !last || !dob || !addr || !nin || !tel) {
        return message('Please fill in all required fields.', true);
      }

      const duplicateNIN = state.members.some((member) =>
        member.nin &&
        member.nin.toUpperCase() === nin &&
        member.acc !== editingAccount
      );

      if (duplicateNIN) {
        return message('A member with this NIN already exists.', true);
      }

      const details = { first, last, dob, addr, nin, tel, email, photo: photoData };

      if (editingAccount) {
        const member = state.members.find((item) => item.acc === editingAccount);
        if (!member) return message('The member could not be found.', true);

        Object.assign(member, details);
        audit('Member updated', `Updated member ${member.acc} — ${first} ${last}`);
        save();
        render();
        message(`Member ${first} ${last} updated.`);
        return;
      }

      state.seq += 1;
      const member = {
        acc: `ES-${value('#mg') || 'F'} ${String(state.seq).padStart(6, '0')}`,
        ...details
      };

      state.members.push(member);
      audit('Member created', `Created member ${member.acc} — ${first} ${last}`);
      save();
      render();
      message(`Member ${first} ${last} added with account ${member.acc}.`);
    }

    function removeMember(account) {
      if (!canManage()) {
        return message('You do not have permission to remove members.', true);
      }

      const index = state.members.findIndex((member) => member.acc === account);
      if (index < 0) return;

      const member = state.members[index];
      if (!confirmAction(`Remove member ${member.first} ${member.last} (${member.acc})?`)) {
        return;
      }

      state.members.splice(index, 1);
      audit('Member removed', `Removed member ${member.acc} — ${member.first} ${member.last}`);
      save();
      render();
      message(`Member ${member.acc} removed.`);
    }

    render();

    return {
      render,
      clear: clearForm,
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return { init };
});
