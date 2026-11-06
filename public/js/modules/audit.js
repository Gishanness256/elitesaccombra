(function (root, factory) {
  'use strict';

  const AuditModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = AuditModule;
  }

  if (root) root.AuditModule = AuditModule;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DISPLAY_LIMIT = 500;
  const HEADERS = ['#', 'Date & time', 'Initials', 'User', 'Role', 'Activity', 'Particulars'];

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function parseDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateKey(value) {
    const date = parseDate(value);
    if (!date) return '';

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function timestamp(value) {
    const date = parseDate(value);
    if (!date) return String(value || '');

    const pad = (number) => String(number).padStart(2, '0');
    return `${dateKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function csvCell(value) {
    return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
  }

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const container = options.container || options.view || (doc && doc.querySelector('#view'));
    const state = options.state || options.S;

    if (!doc || !container || !state) {
      throw new Error('AuditModule.init requires a document, view container, and application state.');
    }

    state.audit = Array.isArray(state.audit) ? state.audit : [];

    const currentUser = typeof options.currentUser === 'function'
      ? options.currentUser
      : () => options.user || null;
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const printPage = typeof options.print === 'function'
      ? options.print
      : () => {
          if (typeof window !== 'undefined' && typeof window.print === 'function') {
            window.print();
          }
        };

    let filteredEntries = [];

    function canAccess() {
      const user = currentUser();
      return Boolean(user && ['Admin', 'Treasurer'].includes(user.role));
    }

    function showMessage(text, isError) {
      const message = container.querySelector('#auditMsg');

      if (message) {
        message.className = 'msg' + (isError ? ' err' : '');
        message.textContent = text || '';
      } else if (text) {
        notify(text, Boolean(isError));
      }
    }

    function sortedEntries() {
      return state.audit
        .map((entry, index) => ({ ...entry, n: index + 1 }))
        .reverse();
    }

    function uniqueValues(entries, key) {
      return [...new Set(entries.map((entry) => entry[key]).filter(Boolean))]
        .sort((left, right) => String(left).localeCompare(String(right)));
    }

    function selectOptions(values, selected) {
      return [
        '<option value="">All</option>',
        ...values.map((value) =>
          `<option value="${escapeHTML(value)}"${value === selected ? ' selected' : ''}>${escapeHTML(value)}</option>`
        )
      ].join('');
    }

    function render() {
      if (!canAccess()) {
        container.innerHTML = `
          <div class="card">
            <p class="msg err" role="alert">You do not have permission to view the system activity log.</p>
          </div>`;
        return;
      }

      const entries = sortedEntries();
      const users = uniqueValues(entries, 'user');
      const activities = uniqueValues(entries, 'act');

      container.innerHTML = `
        <div class="card noprint">
          <h3>System activity log</h3>
          <p class="note">
            Read-only record of actions performed by system users, including timestamps and officer initials.
          </p>

          <div class="row">
            <div>
              <label for="fu">User</label>
              <select id="fu">${selectOptions(users, '')}</select>
            </div>
            <div>
              <label for="fa">Activity</label>
              <select id="fa">${selectOptions(activities, '')}</select>
            </div>
            <div>
              <label for="f1">From date</label>
              <input id="f1" type="date">
            </div>
            <div>
              <label for="f2">To date</label>
              <input id="f2" type="date">
            </div>
            <div>
              <label for="fq">Search</label>
              <input id="fq" type="search" placeholder="Search particulars, activity or user">
            </div>
          </div>

          <p id="acn" class="note" aria-live="polite"></p>
          <div id="auditMsg" class="msg" role="status" aria-live="polite"></div>
          <button class="btn" id="ac1" type="button">Export filtered log to CSV</button>
          <button class="btn alt2" id="ap1" type="button">Print filtered log</button>
        </div>

        <div class="card" id="rep">
          <h3>System activity log</h3>
          <div id="atb"></div>
        </div>`;

      ['fu', 'fa', 'f1', 'f2', 'fq'].forEach((id) => {
        container.querySelector(`#${id}`).addEventListener('input', draw);
        container.querySelector(`#${id}`).addEventListener('change', draw);
      });

      container.querySelector('#ac1').addEventListener('click', exportCSV);
      container.querySelector('#ap1').addEventListener('click', printLog);

      draw();
    }

    function draw() {
      if (!canAccess()) return render();

      const userFilter = container.querySelector('#fu').value;
      const activityFilter = container.querySelector('#fa').value;
      const fromDate = container.querySelector('#f1').value;
      const toDate = container.querySelector('#f2').value;
      const query = container.querySelector('#fq').value.trim().toLowerCase();

      filteredEntries = sortedEntries().filter((entry) => {
        const key = dateKey(entry.t);
        const searchable = [
          entry.part,
          entry.act,
          entry.user,
          entry.ini,
          entry.role
        ].map((value) => String(value || '')).join(' ').toLowerCase();

        return (!userFilter || entry.user === userFilter) &&
          (!activityFilter || entry.act === activityFilter) &&
          (!fromDate || (key && key >= fromDate)) &&
          (!toDate || (key && key <= toDate)) &&
          (!query || searchable.includes(query));
      });

      const count = filteredEntries.length;
      const note = `${count} of ${state.audit.length} entries` +
        (count > DISPLAY_LIMIT
          ? ` — showing the latest ${DISPLAY_LIMIT} (CSV export includes all filtered entries)`
          : '');

      container.querySelector('#acn').textContent = note;

      const visibleEntries = filteredEntries.slice(0, DISPLAY_LIMIT);
      const rows = visibleEntries.map((entry) => [
        entry.n,
        timestamp(entry.t),
        `<b>${escapeHTML(entry.ini || '')}</b>`,
        escapeHTML(entry.user || ''),
        escapeHTML(entry.role || ''),
        escapeHTML(entry.act || ''),
        `<span>${escapeHTML(entry.part || '')}</span>`
      ]);

      container.querySelector('#atb').innerHTML = table(HEADERS, rows);
    }

    function table(headers, rows) {
      const heading = headers
        .map((header) => `<th scope="col">${escapeHTML(header)}</th>`)
        .join('');

      const body = rows.length
        ? rows.map((row) =>
            `<tr>${row.map((cell) => `<td>${cell == null ? '' : cell}</td>`).join('')}</tr>`
          ).join('')
        : `<tr><td colspan="${headers.length}">No matching audit entries.</td></tr>`;

      return `<div class="tw"><table><thead><tr>${heading}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function exportCSV() {
      if (!canAccess()) {
        return showMessage('You do not have permission to export the system activity log.', true);
      }

      const rows = [
        HEADERS,
        ...filteredEntries.map((entry) => [
          entry.n,
          timestamp(entry.t),
          entry.ini || '',
          entry.user || '',
          entry.role || '',
          entry.act || '',
          entry.part || ''
        ])
      ];

      const csv = rows
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n');

      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = doc.createElement('a');

      link.href = url;
      link.download = `elite-sacco-audit-log-${dateKey(new Date())}.csv`;
      link.style.display = 'none';
      doc.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 2000);
      audit('Audit log exported', `Exported ${filteredEntries.length} filtered audit entries`, currentUser());
      showMessage('Filtered audit log exported to CSV.');
    }

    function printLog() {
      if (!canAccess()) {
        return showMessage('You do not have permission to print the system activity log.', true);
      }

      audit('Audit log printed', `Printed ${filteredEntries.length} audit entries`, currentUser());
      draw();
      printPage();
    }

    render();

    return {
      render,
      refresh: draw,
      exportCSV,
      print: printLog,
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return { init, DISPLAY_LIMIT };
});
