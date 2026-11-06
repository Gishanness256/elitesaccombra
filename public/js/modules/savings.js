(function (root, factory) {
  'use strict';

  const SavingsModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = SavingsModule;
  }

  if (root) {
    root.SavingsModule = SavingsModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const IMPORT_HEADERS = [
    'Account',
    'Date',
    'Amount',
    'Type',
    'Channel',
    'Slip No.',
    'Remarks'
  ];

  const SAMPLE_DATE = '2026-03-15';

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function today() {
    const date = new Date();
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }

    const text = String(value == null ? '' : value).trim();
    if (!text) return '';

    // Supports YYYY-MM-DD and YYYY/MM/DD.
    let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    }

    // Supports DD/MM/YYYY, DD-MM-YYYY, and DD.MM.YYYY.
    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) {
      return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  function amount(value) {
    const parsed = parseFloat(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatAmount(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function normalizeKey(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        row.push(cell);
        cell = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(cell);
        if (row.some((value) => String(value).trim() !== '')) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += character;
      }
    }

    row.push(cell);
    if (row.some((value) => String(value).trim() !== '')) rows.push(row);
    return rows;
  }

  function rowsFromCSV(csvRows) {
    if (!csvRows.length) return [];

    const headers = csvRows[0].map(normalizeKey);
    return csvRows.slice(1).map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] == null ? '' : cells[index];
      });
      return record;
    });
  }

  function rowsFromWorkbook(file, XLSX) {
    if (!XLSX || !XLSX.read || !XLSX.utils) {
      return Promise.reject(new Error('Excel reader is unavailable. Check that the XLSX library loaded.'));
    }

    return file.arrayBuffer().then((buffer) => {
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true
      });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json(firstSheet, {
        raw: false,
        defval: '',
        dateNF: 'yyyy-mm-dd'
      }).map((row) => {
        const normalized = {};
        Object.keys(row).forEach((key) => {
          normalized[normalizeKey(key)] = row[key];
        });
        return normalized;
      });
    });
  }

  function download(blob, filename, doc) {
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');

    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    doc.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 2000);
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
      throw new Error('SavingsModule.init requires a document, view container, and application state.');
    }

    state.members = Array.isArray(state.members) ? state.members : [];
    state.savings = Array.isArray(state.savings) ? state.savings : [];
    state.sseq = Number.isFinite(Number(state.sseq)) ? Number(state.sseq) : 0;

    const currentUser = typeof options.currentUser === 'function'
      ? options.currentUser
      : () => options.user || null;
    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const XLSX = options.XLSX || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
    const canRecord = typeof options.canRecord === 'function'
      ? options.canRecord
      : () => {
          const user = currentUser();
          return Boolean(user && state.roles && state.roles[user.role] && state.roles[user.role][1]);
        };

    let lastMessage = null;

    function showMessage(text, isError) {
      lastMessage = { text, isError: Boolean(isError) };
      const element = container.querySelector('#msg');

      if (element) {
        element.className = 'msg' + (isError ? ' err' : '');
        element.textContent = text || '';
      } else if (text) {
        notify(text, Boolean(isError));
      }
    }

    function memberByAccount(account) {
      return state.members.find((member) => member.acc === account);
    }

    function memberName(account) {
      const member = memberByAccount(account);
      return member ? `${member.first || ''} ${member.last || ''}`.trim() : '';
    }

    function balance(account) {
      return state.savings.reduce((total, transaction) => {
        if (account && transaction.acc !== account) return total;
        return total + (transaction.w ? -Number(transaction.amt || 0) : Number(transaction.amt || 0));
      }, 0);
    }

    function monthList() {
      const months = [];
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() - 11);

      for (let index = 0; index < 12; index += 1) {
        const month = new Date(start.getFullYear(), start.getMonth() + index, 1);
        months.push(month);
      }

      return months;
    }

    function monthTransactions(member, month) {
      const key = `${month.getFullYear()}-${month.getMonth()}`;
      return state.savings.filter((transaction) => {
        if (transaction.acc !== member.acc) return false;
        const date = new Date(transaction.date);
        return !Number.isNaN(date.getTime()) &&
          `${date.getFullYear()}-${date.getMonth()}` === key;
      });
    }

    function render() {
      const allowed = canRecord();
      const transactions = [...state.savings]
        .sort((left, right) => new Date(right.date) - new Date(left.date))
        .slice(0, 25);

      const months = monthList();
      const monthHeadings = months.map((month) =>
        `<th class="n" scope="col">${escapeHTML(month.toLocaleString('en', {
          month: 'short',
          year: '2-digit'
        }))}</th>`
      ).join('');

      const memberRows = state.members.map((member) => {
        const totals = months.map((month) => {
          const net = monthTransactions(member, month).reduce(
            (sum, transaction) => sum + (transaction.w ? -Number(transaction.amt || 0) : Number(transaction.amt || 0)),
            0
          );
          return `<td class="n">${net ? formatAmount(net) : ''}</td>`;
        }).join('');

        const total = state.savings
          .filter((transaction) => transaction.acc === member.acc)
          .reduce((sum, transaction) => sum + (transaction.w ? -Number(transaction.amt || 0) : Number(transaction.amt || 0)), 0);

        return `<tr>
          <td>${escapeHTML(member.acc)}</td>
          <td>${escapeHTML(`${member.first || ''} ${member.last || ''}`.trim())}</td>
          ${totals}
          <td class="n"><b>${formatAmount(total)}</b></td>
        </tr>`;
      }).join('');

      const transactionRows = transactions.map((transaction) => {
        const isWithdrawal = Boolean(transaction.w);

        return `<tr>
          <td>${escapeHTML(transaction.ref || '')}</td>
          <td>${escapeHTML(transaction.date || '')}</td>
          <td>${escapeHTML(transaction.acc || '')}</td>
          <td>${escapeHTML(memberName(transaction.acc))}</td>
          <td>${isWithdrawal ? 'Withdrawal' : 'Deposit'}</td>
          <td class="n">${formatAmount(transaction.amt)}</td>
          <td>${escapeHTML(transaction.ch || '')}</td>
          <td>${escapeHTML(transaction.slip || '')}</td>
          <td>${escapeHTML(transaction.rm || '')}</td>
          <td>${escapeHTML(transaction.ini || '')}</td>
        </tr>`;
      }).join('');

      const memberOptions = state.members.map((member) =>
        `<option value="${escapeHTML(member.acc)}">${escapeHTML(member.acc)} — ${escapeHTML(`${member.first || ''} ${member.last || ''}`.trim())}</option>`
      ).join('');

      container.innerHTML = `
        <div class="card">
          <h3>Record a member's deposit or withdrawal</h3>
          ${allowed ? `
            <div class="row">
              <div>
                <label for="sa">Member (account)</label>
                <select id="sa">
                  <option value="">— select member —</option>
                  ${memberOptions}
                </select>
              </div>
              <div>
                <label for="sd">Date</label>
                <input id="sd" type="date" value="${today()}">
              </div>
              <div>
                <label for="sk">Transaction type</label>
                <select id="sk">
                  <option value="d">Deposit</option>
                  <option value="w">Withdrawal</option>
                </select>
              </div>
              <div>
                <label for="sm">Amount (UGX)</label>
                <input id="sm" type="number" min="1" step="1">
              </div>
              <div>
                <label for="sc">Channel</label>
                <select id="sc">
                  <option>Counter / Cash</option>
                  <option>Bank</option>
                  <option>Mobile Money</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label for="sr">Slip number (optional)</label>
                <input id="sr" autocomplete="off">
              </div>
              <div class="full">
                <label for="srm">Remarks (optional)</label>
                <input id="srm" autocomplete="off">
              </div>
            </div>
            <p class="note" id="sbal">Select a member to see their current savings balance.</p>
            <button class="btn" id="ss" type="button">Save deposit</button>
            <div id="msg" class="msg" role="status" aria-live="polite"></div>

            <div class="card">
              <h3>Import transactions</h3>
              <p class="note">Upload an Excel or CSV file with Account, Date, Amount, Type, Channel, Slip No. and Remarks columns.</p>
              <div class="row">
                <div>
                  <label for="su">Import Excel or CSV</label>
                  <input id="su" type="file" accept=".xlsx,.xls,.csv">
                </div>
              </div>
              <button class="btn alt2" id="st1" type="button">Download Excel template</button>
              <button class="btn alt2" id="st2" type="button">Download CSV template</button>
            </div>
          ` : `
            <p class="note">Your role does not have permission to record savings deposits or withdrawals.</p>
            <div id="msg" class="msg" role="status" aria-live="polite"></div>
          `}
        </div>

        <div class="card">
          <h3>Recent transactions</h3>
          <div class="tw">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ref</th><th scope="col">Date</th><th scope="col">Account</th>
                  <th scope="col">Member</th><th scope="col">Type</th><th class="n" scope="col">Amount</th>
                  <th scope="col">Channel</th><th scope="col">Slip no.</th><th scope="col">Remarks</th>
                  <th scope="col">Officer</th>
                </tr>
              </thead>
              <tbody>${transactionRows || '<tr><td colspan="10">No savings transactions recorded.</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>Member savings by month</h3>
          <div class="tw">
            <table>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Member</th>
                  ${monthHeadings}
                  <th class="n" scope="col">Total</th>
                </tr>
              </thead>
              <tbody>${memberRows || '<tr><td colspan="15">No members recorded.</td></tr>'}</tbody>
            </table>
          </div>
          <p class="note">Monthly totals show deposits less withdrawals. The total is the net savings recorded for each member.</p>
        </div>`;

      bindControls();

      if (lastMessage) {
        showMessage(lastMessage.text, lastMessage.isError);
      }
    }

    function bindControls() {
      const memberSelect = container.querySelector('#sa');
      const typeSelect = container.querySelector('#sk');

      memberSelect?.addEventListener('change', updateBalance);
      typeSelect?.addEventListener('change', updateSaveButton);
      container.querySelector('#ss')?.addEventListener('click', recordTransaction);
      container.querySelector('#st1')?.addEventListener('click', downloadExcelTemplate);
      container.querySelector('#st2')?.addEventListener('click', downloadCSVTemplate);
      container.querySelector('#su')?.addEventListener('change', importFile);
    }

    function updateBalance() {
      const account = container.querySelector('#sa')?.value || '';
      const display = container.querySelector('#sbal');
      if (!display) return;

      display.textContent = account
        ? `Current savings balance: UGX ${formatAmount(balance(account))}`
        : 'Select a member to see their current savings balance.';
    }

    function updateSaveButton() {
      const type = container.querySelector('#sk')?.value;
      const button = container.querySelector('#ss');
      if (button) button.textContent = `Save ${type === 'w' ? 'withdrawal' : 'deposit'}`;
    }

    function recordTransaction() {
      if (!canRecord()) return showMessage('You do not have permission to record savings transactions.', true);

      const account = container.querySelector('#sa').value;
      const value = Number(container.querySelector('#sm').value);
      const date = container.querySelector('#sd').value;
      const withdrawal = container.querySelector('#sk').value === 'w';

      if (!account || !memberByAccount(account) || !date || !Number.isFinite(value) || value <= 0) {
        return showMessage('Choose a member, amount and date.', true);
      }

      if (withdrawal && value > balance(account)) {
        return showMessage(
          `Withdrawal exceeds the savings balance (UGX ${formatAmount(balance(account))}).`,
          true
        );
      }

      state.sseq += 1;
      const reference = `SV-${String(state.sseq).padStart(6, '0')}`;
      const user = currentUser() || {};

      state.savings.push({
        acc: account,
        amt: value,
        date,
        w: withdrawal,
        ini: user.ini || String(user.name || '')
          .split(/\s+/)
          .map((part) => part[0] || '')
          .join('')
          .toUpperCase()
          .slice(0, 3),
        ref: reference,
        ch: container.querySelector('#sc').value,
        slip: container.querySelector('#sr').value.trim(),
        rm: container.querySelector('#srm').value.trim()
      });

      const member = memberByAccount(account);
      const description = `${reference} — ${account} ${memberName(account)}, UGX ${formatAmount(value)} via ${container.querySelector('#sc').value}`;
      audit(withdrawal ? 'Savings withdrawal' : 'Savings deposit', description, user);
      save();

      lastMessage = {
        text: `Transaction ${reference} recorded.`,
        isError: false
      };
      render();
    }

    function templateRows() {
      const exampleAccount = state.members[0]?.acc || 'ES-F 000001';

      return [
        [exampleAccount, SAMPLE_DATE, 50000, 'Deposit', 'Counter / Cash', 'SLP-001', 'Monthly savings'],
        [exampleAccount, SAMPLE_DATE, 10000, 'Withdrawal', 'Counter / Cash', 'SLP-002', 'Example withdrawal']
      ];
    }

    function downloadCSVTemplate() {
      const rows = [IMPORT_HEADERS, ...templateRows()];
      const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
      download(
        new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
        'elite-sacco-savings-import-template.csv',
        doc
      );
      audit('Template downloaded', 'Downloaded savings import template (CSV)', currentUser());
    }

    function downloadExcelTemplate() {
      if (!XLSX || !XLSX.utils || typeof XLSX.writeFile !== 'function') {
        return showMessage('Excel library could not load — check your internet connection.', true);
      }

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, ...templateRows()]);
      sheet['!cols'] = IMPORT_HEADERS.map(() => ({ wch: 20 }));

      XLSX.utils.book_append_sheet(workbook, sheet, 'Savings');
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ['Column', 'Required', 'Notes'],
          ['Account', 'Yes', 'Existing member account number'],
          ['Date', 'Yes', 'Date in YYYY-MM-DD format'],
          ['Amount', 'Yes', 'Positive amount in UGX'],
          ['Type', 'Yes', 'Deposit or Withdrawal'],
          ['Channel', 'No', 'For example, Counter / Cash, Bank or Mobile Money'],
          ['Slip No.', 'No', 'Receipt or transaction reference'],
          ['Remarks', 'No', 'Additional transaction notes']
        ]),
        'Instructions'
      );

      XLSX.writeFile(workbook, 'elite-sacco-savings-import-template.xlsx');
      audit('Template downloaded', 'Downloaded savings import template (Excel)', currentUser());
    }

    function getField(record, aliases) {
      for (const alias of aliases) {
        const key = normalizeKey(alias);
        if (record[key] !== undefined && String(record[key]).trim() !== '') {
          return String(record[key]).trim();
        }
      }
      return '';
    }

    function importRecords(rows) {
      let imported = 0;
      let skipped = 0;
      let unknownAccounts = 0;
      let duplicates = 0;

      rows.forEach((record) => {
        const account = getField(record, ['account', 'account number', 'acc', 'member account']);
        const rawDate = getField(record, ['date', 'transaction date']);
        const date = parseDate(rawDate);
        const value = amount(getField(record, ['amount', 'amt', 'value']));
        const type = getField(record, ['type', 'transaction type']).toLowerCase();
        const channel = getField(record, ['channel', 'payment channel', 'method']);
        const slip = getField(record, ['slip no', 'slip number', 'receipt', 'reference']);
        const remarks = getField(record, ['remarks', 'remark', 'notes']);

        if (!account || !date || value <= 0 || !type) {
          skipped += 1;
          return;
        }

        const member = memberByAccount(account);
        if (!member) {
          unknownAccounts += 1;
          skipped += 1;
          return;
        }

        const isWithdrawal = /withdraw|withdrawal|^w$/.test(type);
        const isDeposit = /deposit|^d$/.test(type);

        if (!isWithdrawal && !isDeposit) {
          skipped += 1;
          return;
        }

        const duplicate = state.savings.some((transaction) =>
          transaction.acc === account &&
          transaction.date === date &&
          Number(transaction.amt) === value &&
          Boolean(transaction.w) === isWithdrawal &&
          String(transaction.slip || '') === slip
        );

        if (duplicate) {
          duplicates += 1;
          return;
        }

        if (isWithdrawal && value > balance(account)) {
          skipped += 1;
          return;
        }

        state.sseq += 1;
        const user = currentUser() || {};
        state.savings.push({
          acc: account,
          amt: value,
          date,
          w: isWithdrawal,
          ini: user.ini || String(user.name || '')
            .split(/\s+/)
            .map((part) => part[0] || '')
            .join('')
            .toUpperCase()
            .slice(0, 3),
          ref: `SV-${String(state.sseq).padStart(6, '0')}`,
          ch: channel || 'Imported',
          slip,
          rm: remarks
        });

        imported += 1;
      });

      if (imported) {
        audit('Savings imported', `Imported ${imported} savings transaction(s)`, currentUser());
        save();
      }

      const result = `Imported ${imported} transaction(s)` +
        (duplicates ? `, skipped ${duplicates} duplicate(s)` : '') +
        (skipped ? `, skipped ${skipped} invalid or unrecognized row(s)` : '') +
        (unknownAccounts ? ` (${unknownAccounts} unknown account number(s))` : '') +
        '.';

      lastMessage = { text: result, isError: skipped > 0 || unknownAccounts > 0 };
      render();
    }

    async function importFile(event) {
      if (!canRecord()) {
        showMessage('You do not have permission to import savings transactions.', true);
        return;
      }

      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        let rows;

        if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
          rows = rowsFromCSV(parseCSV(await file.text()));
        } else {
          rows = await rowsFromWorkbook(file, XLSX);
        }

        importRecords(rows);
      } catch (error) {
        showMessage(error.message || 'Could not import the selected file.', true);
      } finally {
        event.target.value = '';
      }
    }

    render();

    return {
      render,
      balance,
      importRecords,
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return { init };
});
