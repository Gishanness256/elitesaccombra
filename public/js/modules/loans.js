(function (root, factory) {
  'use strict';

  const LoansModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = LoansModule;
  }

  if (root) {
    root.LoansModule = LoansModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATEGORIES = {
    'Normal Loan': 3,
    'Special Loan': 2.5,
    'Secured Business Loan': 2.5,
    'Agricultural Loan': 2,
    'School Fees Loan': 2
  };

  const NON_MEMBER_EXTRA_RATE = 1;

  const LOAN_HEADERS = [
    'Loan Ref',
    'Account',
    'Name',
    'Telephone',
    'Category',
    'Term (months)',
    'Principal',
    'Rate (% per month)',
    'Date Disbursed',
    'Due Date',
    'Amount Paid',
    'Balance',
    'Status'
  ];

  const IMPORT_ALIASES = {
    acc: ['account', 'account number', 'acc', 'member account'],
    name: ['name', 'names', 'borrower', 'full name'],
    tel: ['telephone', 'phone', 'contact', 'tel'],
    category: ['category', 'loan category', 'loan type'],
    term: ['term', 'term months', 'loan term', 'term (months)'],
    amount: ['principal', 'amount', 'loan amount', 'disbursed'],
    rate: ['rate', 'interest rate', 'rate (% per month)'],
    date: ['date disbursed', 'disbursement date', 'date'],
    status: ['status', 'loan status'],
    balance: ['balance', 'outstanding balance'],
    paid: ['amount paid', 'paid', 'repayments'],
    clearedDate: ['cleared date', 'date cleared', 'settlement date']
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

  function today() {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  }

  function formatDate(date) {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  function addMonths(date, months) {
    const value = new Date(date);
    return new Date(value.getFullYear(), value.getMonth() + Number(months || 0), value.getDate());
  }

  function number(value) {
    const parsed = parseFloat(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return `UGX ${Math.round(Number(value) || 0).toLocaleString()}`;
  }

  function normalizeKey(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function normalizeHeader(value) {
    return normalizeKey(value).replace(/[\s_-]+/g, '');
  }

  function suggestedRate(category, term, isMember) {
    const base = CATEGORIES[category] == null ? 3 : CATEGORIES[category];
    const months = Number(term) || 0;
    const termAdjustment = months <= 6 ? 0 : months <= 12 ? 0.25 : 0.5;
    const nonMemberAdjustment = isMember ? 0 : NON_MEMBER_EXTRA_RATE;

    return Number((base + termAdjustment + nonMemberAdjustment).toFixed(2));
  }

  function monthlyRepaymentSimulation(loan) {
    const principal = Number(loan.amt) || 0;
    const rate = (Number(loan.rate) || 0) / 100;
    const start = new Date(loan.date);

    if (!principal || Number.isNaN(start.getTime())) return [];

    const repayments = [...(loan.reps || [])]
      .filter((repayment) => repayment && repayment.date)
      .sort((left, right) => new Date(left.date) - new Date(right.date));

    let remainingPrincipal = principal;
    let interest = principal * rate;
    let monthIndex = 0;
    const output = [];

    function nextMonth() {
      return new Date(start.getFullYear(), start.getMonth() + monthIndex + 1, start.getDate());
    }

    repayments.forEach((repayment) => {
      const paymentDate = new Date(repayment.date);

      while (nextMonth() < paymentDate) {
        interest += (remainingPrincipal + interest) * rate;
        monthIndex += 1;
      }

      let payment = Number(repayment.amt) || 0;
      const interestPaid = Math.min(payment, interest);
      interest -= interestPaid;
      payment -= interestPaid;

      const principalPaid = Math.min(payment, remainingPrincipal);
      remainingPrincipal -= principalPaid;

      output.push({
        date: formatDate(repayment.date),
        p: principalPaid,
        i: interestPaid,
        bal: Math.max(0, remainingPrincipal + interest),
        ini: repayment.ini || '',
        type: repayment.type || 'Payment'
      });
    });

    return output;
  }

  function calculateBalance(loan, asOf) {
    const rate = (Number(loan.rate) || 0) / 100;
    const start = new Date(loan.date);
    const end = asOf ? new Date(asOf) : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

    let balance = (Number(loan.amt) || 0) * (1 + rate);
    let monthIndex = 0;
    let previousPeriod = new Date(start.getTime() - 1);

    const repayments = (loan.reps || []).map((repayment) => ({
      date: new Date(repayment.date),
      amount: Number(repayment.amt) || 0
    }));

    while (true) {
      const nextPeriod = new Date(
        start.getFullYear(),
        start.getMonth() + monthIndex + 1,
        start.getDate()
      );

      if (nextPeriod > end) break;

      const paid = repayments
        .filter((repayment) => repayment.date > previousPeriod && repayment.date <= nextPeriod)
        .reduce((total, repayment) => total + repayment.amount, 0);

      balance = Math.max(0, balance - paid) * (1 + rate);
      previousPeriod = nextPeriod;
      monthIndex += 1;
    }

    balance -= repayments
      .filter((repayment) => repayment.date > previousPeriod && repayment.date <= end)
      .reduce((total, repayment) => total + repayment.amount, 0);

    return Math.max(0, balance);
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        row.push(value);
        value = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(value);
        if (row.some((cell) => String(cell).trim())) rows.push(row);
        row = [];
        value = '';
      } else {
        value += character;
      }
    }

    row.push(value);
    if (row.some((cell) => String(cell).trim())) rows.push(row);
    return rows;
  }

  function csvToRecords(rows) {
    if (!rows.length) return [];

    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] == null ? '' : cells[index];
      });
      return record;
    });
  }

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const container = options.container || options.view || (doc && doc.querySelector('#view'));
    const state = options.state || options.S;

    if (!doc || !container || !state) {
      throw new Error('LoansModule.init requires a document, view container, and application state.');
    }

    state.members = Array.isArray(state.members) ? state.members : [];
    state.non = Array.isArray(state.non) ? state.non : [];
    state.loans = Array.isArray(state.loans) ? state.loans : [];
    state.reqs = Array.isArray(state.reqs) ? state.reqs : [];
    state.lseq = Number(state.lseq) || 0;

    const currentUser = typeof options.currentUser === 'function'
      ? options.currentUser
      : () => options.user || null;
    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const XLSX = options.XLSX || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
    const jsPDF = options.jsPDF ||
      (typeof globalThis !== 'undefined' && globalThis.jspdf && globalThis.jspdf.jsPDF);
    const simulate = typeof options.simulateLoan === 'function'
      ? options.simulateLoan
      : monthlyRepaymentSimulation;
    const getBalance = typeof options.loanBalance === 'function'
      ? options.loanBalance
      : calculateBalance;
    const canView = typeof options.canView === 'function'
      ? options.canView
      : (view) => {
          const user = currentUser();
          const role = user && user.role;
          if (view === 'lreq') return ['Admin', 'Credit Officer', 'Credit Supervisor'].includes(role);
          if (view === 'lapp') return role === 'Admin';
          if (view === 'lsec') return ['Admin', 'Credit Officer', 'Credit Supervisor'].includes(role);
          return false;
        };

    let loanFilter = 'active';
    let searchQuery = '';
    let selectedLoanIndex = null;
    let paymentMessage = { text: '', error: false };

    function user() {
      return currentUser() || {};
    }

    function initials(person) {
      if (person && person.ini) return String(person.ini);
      return String(person && person.name || '')
        .split(/\s+/)
        .map((part) => part[0] || '')
        .join('')
        .toUpperCase()
        .slice(0, 3);
    }

    function showMessage(text, error, selector) {
      const message = container.querySelector(selector || '#msg');

      if (message) {
        message.className = 'msg' + (error ? ' err' : '');
        message.textContent = text || '';
      } else if (text) {
        notify(text, Boolean(error));
      }
    }

    function memberByAccount(account) {
      return state.members.find((member) => member.acc === account);
    }

    function findOrCreateNonMember(name, telephone, nin) {
      let person = state.non.find((candidate) =>
        (nin && candidate.nin && candidate.nin.toUpperCase() === nin.toUpperCase()) ||
        (candidate.name.toLowerCase() === name.toLowerCase() &&
          (!telephone || !candidate.tel || candidate.tel === telephone))
      );

      if (!person) {
        person = {
          id: Date.now().toString(36),
          name,
          tel: telephone || '',
          nin: nin || ''
        };
        state.non.push(person);
      }

      return person;
    }

    function borrower(loan) {
      const member = memberByAccount(loan.acc);
      if (member) {
        return {
          account: member.acc,
          name: `${member.first || ''} ${member.last || ''}`.trim(),
          telephone: loan.tel || member.tel || '',
          isNonMember: false
        };
      }

      const nonMember = state.non.find((person) => person.id === loan.nid);
      return {
        account: '',
        name: nonMember ? nonMember.name : loan.name || 'Unknown',
        telephone: loan.tel || (nonMember && nonMember.tel) || '',
        isNonMember: true
      };
    }

    function reference(loan, index) {
      return loan.ref || `LN-${String(index + 1).padStart(4, '0')}`;
    }

    function paid(loan) {
      return (loan.reps || []).reduce((total, repayment) => total + (Number(repayment.amt) || 0), 0);
    }

    function status(loan) {
      if (getBalance(loan) < 0.5) return 'Cleared';
      if (loan.term && addMonths(loan.date, loan.term) < new Date()) return 'Overdue';
      return 'Active';
    }

    function statusBadge(value) {
      const classes = {
        Approved: 'ok',
        Rejected: 'no',
        'On Hold': 'hold',
        Pending: 'pen',
        Cleared: 'ok',
        Overdue: 'no',
        Active: 'pen'
      };
      return `<span class="bd ${classes[value] || 'pen'}">${escapeHTML(value)}</span>`;
    }

    function hasRepaymentPermission() {
      const current = user();
      const rolePermissions = state.roles && state.roles[current.role];
      return Boolean(rolePermissions && rolePermissions[2]);
    }

    function nextLoanReference() {
      return `LN-${String(state.loans.length + 1).padStart(4, '0')}`;
    }

    function renderRequests() {
      if (!canView('lreq')) return renderHomeNotice();

      const memberOptions = state.members.map((member) =>
        `<option value="${escapeHTML(member.acc)}">${escapeHTML(member.acc)} — ${escapeHTML(`${member.first || ''} ${member.last || ''}`.trim())}</option>`
      ).join('');

      const requestRows = [...state.reqs].reverse().map((request) => [
        escapeHTML(request.id),
        escapeHTML(request.date),
        escapeHTML(request.name),
        request.type === 'm' ? 'Member' : 'Non-member',
        escapeHTML(request.cat),
        escapeHTML(request.term),
        Math.round(request.amt || 0).toLocaleString(),
        escapeHTML(request.rate),
        escapeHTML(request.by || ''),
        statusBadge(request.status),
        escapeHTML(request.remark || '')
      ]);

      container.innerHTML = `
        <div class="card">
          <h3>New loan request</h3>
          <div class="row">
            <div>
              <label for="qt">Applicant type</label>
              <select id="qt">
                <option value="m">SACCO member</option>
                <option value="n">Non-member</option>
              </select>
            </div>
            <div id="qmw">
              <label for="qm">Member (account)</label>
              <select id="qm"><option value="">— select member —</option>${memberOptions}</select>
            </div>
            <div>
              <label for="qn">Applicant name(s)</label>
              <input id="qn" autocomplete="name">
            </div>
            <div>
              <label for="qd">Date</label>
              <input id="qd" type="date" value="${today()}">
            </div>
            <div>
              <label for="qp">Telephone</label>
              <input id="qp" type="tel" autocomplete="tel">
            </div>
            <div>
              <label for="qe">Email</label>
              <input id="qe" type="email" autocomplete="email">
            </div>
            <div>
              <label for="qad">Address</label>
              <input id="qad" autocomplete="street-address">
            </div>
            <div id="qxw" hidden>
              <label for="qx">NIN (non-member)</label>
              <input id="qx" autocomplete="off">
            </div>
            <div>
              <label for="qc">Loan category / type</label>
              <select id="qc">${Object.keys(CATEGORIES).map((category) =>
                `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
              ).join('')}</select>
            </div>
            <div>
              <label for="ql">Loan term (months)</label>
              <input id="ql" type="number" min="1" max="60" value="6">
            </div>
            <div>
              <label for="qam">Amount to borrow (UGX)</label>
              <input id="qam" type="number" min="1000" step="1000">
            </div>
            <div>
              <label for="qr">Interest rate (% per month)</label>
              <input id="qr" type="number" min="0.01" max="30" step="0.01">
            </div>
          </div>
          <p class="note" id="qrn"></p>
          <button class="btn" id="qs" type="button">Submit loan request</button>
          <button class="btn alt2" id="qx2" type="button">Clear</button>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
        </div>

        <div class="card">
          <h3>Loan requests</h3>
          ${table(LOAN_REQUEST_HEADERS, requestRows)}
        </div>`;

      bindRequestForm();
      updateSuggestedRate();
    }

    const LOAN_REQUEST_HEADERS = [
      'Ref', 'Date', 'Applicant', 'Type', 'Category', 'Term',
      'Amount', 'Rate %/mo', 'Requested by', 'Status', 'Remark'
    ];

    function table(headers, rows) {
      return `<div class="tw"><table>
        <thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join('')}</tr></thead>
        <tbody>${rows.length
          ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell == null ? '' : cell}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${headers.length}">No records to display.</td></tr>`
        }</tbody>
      </table></div>`;
    }

    function bindRequestForm() {
      const applicantType = container.querySelector('#qt');
      const memberSelect = container.querySelector('#qm');
      const category = container.querySelector('#qc');
      const term = container.querySelector('#ql');
      const rate = container.querySelector('#qr');

      applicantType.addEventListener('change', updateApplicantMode);
      memberSelect.addEventListener('change', populateMember);
      category.addEventListener('change', updateSuggestedRate);
      term.addEventListener('input', updateSuggestedRate);
      rate.addEventListener('input', () => { rate.dataset.manual = 'true'; });
      container.querySelector('#qs').addEventListener('click', submitRequest);
      container.querySelector('#qx2').addEventListener('click', renderRequests);

      updateApplicantMode();
    }

    function updateApplicantMode() {
      const isMember = container.querySelector('#qt').value === 'm';
      container.querySelector('#qmw').hidden = !isMember;
      container.querySelector('#qxw').hidden = isMember;
      container.querySelector('#qn').readOnly = isMember;

      if (isMember) {
        container.querySelector('#qx').value = '';
      } else {
        container.querySelector('#qm').value = '';
        ['#qn', '#qp', '#qe', '#qad'].forEach((selector) => {
          container.querySelector(selector).value = '';
        });
      }

      delete container.querySelector('#qr').dataset.manual;
      updateSuggestedRate();
    }

    function populateMember() {
      const member = memberByAccount(container.querySelector('#qm').value);
      container.querySelector('#qn').value = member
        ? `${member.first || ''} ${member.last || ''}`.trim()
        : '';
      container.querySelector('#qp').value = member ? member.tel || '' : '';
      container.querySelector('#qe').value = member ? member.email || '' : '';
      container.querySelector('#qad').value = member ? member.addr || '' : '';
    }

    function updateSuggestedRate() {
      const rateInput = container.querySelector('#qr');
      const isMember = container.querySelector('#qt').value === 'm';
      const suggested = suggestedRate(
        container.querySelector('#qc').value,
        container.querySelector('#ql').value,
        isMember
      );

      if (!rateInput.dataset.manual) rateInput.value = suggested.toFixed(2);
      container.querySelector('#qrn').textContent =
        `Suggested rate: ${suggested.toFixed(2)}% per month` +
        (isMember ? '' : ` (includes ${NON_MEMBER_EXTRA_RATE}% non-member adjustment).`);
    }

    function submitRequest() {
      if (!canView('lreq')) return showMessage('You do not have permission to submit loan requests.', true);

      const isMember = container.querySelector('#qt').value === 'm';
      const account = isMember ? container.querySelector('#qm').value : '';
      const member = account ? memberByAccount(account) : null;
      const name = container.querySelector('#qn').value.trim();
      const telephone = container.querySelector('#qp').value.trim();
      const date = container.querySelector('#qd').value;
      const category = container.querySelector('#qc').value;
      const term = Math.round(number(container.querySelector('#ql').value));
      const amount = number(container.querySelector('#qam').value);
      const rate = number(container.querySelector('#qr').value);

      if (isMember && !member) return showMessage('Select a member.', true);
      if (!name) return showMessage('Applicant name is required.', true);
      if (!telephone) return showMessage('Contact telephone is required.', true);
      if (!date) return showMessage('Choose the date.', true);
      if (amount <= 0) return showMessage('Enter the amount to borrow.', true);
      if (term < 1 || term > 60) return showMessage('Loan term must be 1–60 months.', true);
      if (rate <= 0 || rate > 30) return showMessage('Enter an interest rate greater than 0 and no more than 30%.', true);

      let nonMemberId;
      if (!isMember) {
        nonMemberId = findOrCreateNonMember(
          name,
          telephone,
          container.querySelector('#qx').value.trim()
        ).id;
      }

      state.lseq += 1;
      const id = `LR-${String(state.lseq).padStart(4, '0')}`;
      const current = user();

      state.reqs.push({
        id,
        date,
        type: isMember ? 'm' : 'n',
        acc: account,
        nid: nonMemberId,
        name,
        tel: telephone,
        email: container.querySelector('#qe').value.trim(),
        addr: container.querySelector('#qad').value.trim(),
        cat: category,
        term,
        amt: amount,
        rate,
        status: 'Pending',
        remark: '',
        by: current.name || current.email || '',
        byRole: current.role || ''
      });

      audit('Loan request submitted', `${id} — ${name}, ${category}, ${money(amount)}, ${rate}% per month, ${term} months`, current);
      save();
      renderRequests();
      showMessage(`Request ${id} submitted for approval.`);
    }

    function renderApprovals() {
      if (!canView('lapp')) return renderHomeNotice();

      const pending = state.reqs.filter((request) =>
        request.status === 'Pending' || request.status === 'On Hold'
      );
      const completed = state.reqs.filter((request) =>
        request.status === 'Approved' || request.status === 'Rejected'
      );

      const pendingRows = pending.map((request) => {
        const standing = request.type === 'm'
          ? `Savings ${money(savingsBalance(request.acc))}<br>Loans ${money(
              state.loans
                .filter((loan) => loan.acc === request.acc)
                .reduce((sum, loan) => sum + getBalance(loan), 0)
            )}`
          : '—';

        return [
          escapeHTML(request.id),
          escapeHTML(request.date),
          escapeHTML(request.name),
          escapeHTML(request.tel),
          escapeHTML(request.cat),
          escapeHTML(request.term),
          Math.round(request.amt || 0).toLocaleString(),
          escapeHTML(request.rate),
          standing,
          escapeHTML(request.by || ''),
          `<input data-remark-for="${escapeHTML(request.id)}" aria-label="Remark for ${escapeHTML(request.id)}">`,
          `<button class="btn sm" type="button" data-decision="Approved" data-id="${escapeHTML(request.id)}">Approve</button>
           <button class="btn alt2 sm" type="button" data-decision="On Hold" data-id="${escapeHTML(request.id)}">Hold</button>
           <button class="btn alt2 sm" type="button" data-decision="Rejected" data-id="${escapeHTML(request.id)}">Reject</button>`
        ];
      });

      const completedRows = [...completed].reverse().map((request) => [
        escapeHTML(request.id),
        escapeHTML(request.name),
        escapeHTML(request.cat),
        Math.round(request.amt || 0).toLocaleString(),
        statusBadge(request.status),
        escapeHTML(request.decBy || ''),
        escapeHTML(request.decOn || ''),
        escapeHTML(request.remark || '')
      ]);

      container.innerHTML = `
        <div class="card">
          <h3>Awaiting decision</h3>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
          ${table(
            ['Ref', 'Date', 'Applicant', 'Contact', 'Category', 'Term', 'Amount', 'Rate %/mo', 'Member standing', 'Requested by', 'Remark', 'Decision'],
            pendingRows
          )}
        </div>
        <div class="card">
          <h3>Decision history</h3>
          ${table(['Ref', 'Applicant', 'Category', 'Amount', 'Status', 'Decided by', 'Date', 'Remark'], completedRows)}
        </div>`;

      container.querySelectorAll('[data-decision]').forEach((button) => {
        button.addEventListener('click', () => decideRequest(button.dataset.id, button.dataset.decision));
      });
    }

    function savingsBalance(account) {
      return state.savings
        .filter((transaction) => transaction.acc === account)
        .reduce((sum, transaction) => sum + (transaction.w ? -Number(transaction.amt || 0) : Number(transaction.amt || 0)), 0);
    }

    function decideRequest(id, decision) {
      if (user().role !== 'Admin') return showMessage('Only the System Admin can decide loan requests.', true);

      const request = state.reqs.find((item) => item.id === id);
      if (!request || !['Pending', 'On Hold'].includes(request.status)) {
        return showMessage('This request is no longer awaiting a decision.', true);
      }

      const remarkInput = container.querySelector(`[data-remark-for="${CSS.escape(id)}"]`);
      const remark = remarkInput ? remarkInput.value.trim() : '';

      if (decision !== 'Approved' && !remark) {
        return showMessage(`Add a remark before ${decision === 'Rejected' ? 'rejecting' : 'holding'} ${id}.`, true);
      }

      request.status = decision;
      request.remark = remark;
      request.decBy = user().name || user().email || '';
      request.decOn = today();

      if (decision === 'Approved') {
        state.loans.push({
          ref: nextLoanReference(),
          req: request.id,
          acc: request.acc || '',
          nid: request.nid,
          name: request.name,
          amt: request.amt,
          rate: request.rate,
          date: today(),
          cat: request.cat,
          term: request.term,
          tel: request.tel,
          reps: [],
          ini: initials(user())
        });
      }

      audit(
        `Loan ${decision.toLowerCase()}`,
        `${id} — ${request.name}, ${money(request.amt)} at ${request.rate}% per month${remark ? ` · Remark: ${remark}` : ''}`,
        user()
      );

      save();
      renderApprovals();
      showMessage(`${id} ${decision === 'Approved' ? 'approved' : decision === 'Rejected' ? 'rejected' : 'placed on hold'}.`);
    }

    function renderLoans() {
      if (!canView('lsec')) return renderHomeNotice();

      const activeLoans = state.loans.map((loan, index) => ({
        loan,
        index,
        borrower: borrower(loan),
        status: status(loan),
        balance: getBalance(loan)
      }));

      const filtered = activeLoans.filter((row) => {
        const matchesFilter = loanFilter === 'all' ||
          (loanFilter === 'cleared' ? row.status === 'Cleared' : row.status !== 'Cleared');
        const text = `${row.borrower.name} ${row.borrower.account} ${reference(row.loan, row.index)}`.toLowerCase();
        return matchesFilter && (!searchQuery || text.includes(searchQuery));
      });

      const summaries = activeLoans.filter((row) => row.balance >= 0.5);
      const outstandingPrincipal = summaries.reduce((sum, row) => sum + row.balance, 0);

      container.innerHTML = `
        <div class="kpis">
          <div class="kpi">Active loans<b>${summaries.length}</b></div>
          <div class="kpi">Outstanding balance<b>${money(outstandingPrincipal)}</b></div>
          <div class="kpi">Total loans<b>${state.loans.length}</b></div>
        </div>

        <div class="card">
          <h3>Loans</h3>
          <div class="row">
            <div>
              <label for="lf">Show</label>
              <select id="lf">
                <option value="active">Active loans</option>
                <option value="cleared">Cleared loans</option>
                <option value="all">All loans</option>
              </select>
            </div>
            <div>
              <label for="ls">Search</label>
              <input id="ls" placeholder="Borrower, account or loan ref" value="${escapeHTML(searchQuery)}">
            </div>
          </div>

          <div class="noprint">
            <button class="btn" id="ex1" type="button">Export Excel</button>
            <button class="btn alt2" id="ex2" type="button">Export CSV</button>
            <button class="btn alt2" id="ex3" type="button">Export PDF</button>
            <button class="btn alt2" id="tp" type="button">Download import template</button>
          </div>

          <div class="row noprint">
            <div>
              <label for="lu">Import old loans (.xlsx, .xls or .csv)</label>
              <input type="file" id="lu" accept=".xlsx,.xls,.csv">
              <p class="note">Required columns: Account (blank for non-members), Name, Principal, Date. Other fields are optional.</p>
            </div>
          </div>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
          <div id="lt"></div>
        </div>

        <div id="ld"></div>`;

      container.querySelector('#lf').value = loanFilter;
      container.querySelector('#lf').addEventListener('change', (event) => {
        loanFilter = event.target.value;
        renderLoans();
      });
      container.querySelector('#ls').addEventListener('input', (event) => {
        searchQuery = event.target.value.trim().toLowerCase();
        renderLoans();
        const search = container.querySelector('#ls');
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      });

      container.querySelector('#ex1').addEventListener('click', exportLoansExcel);
      container.querySelector('#ex2').addEventListener('click', exportLoansCSV);
      container.querySelector('#ex3').addEventListener('click', exportLoansPDF);
      container.querySelector('#tp').addEventListener('click', downloadImportTemplate);
      container.querySelector('#lu').addEventListener('change', importFile);

      drawLoansTable(filtered);
      drawLoanDetails();
    }

    function loanTableRow(row) {
      const loan = row.loan;
      const index = row.index;
      const dueDate = loan.term ? formatDate(addMonths(loan.date, loan.term)) : '';
      return [
        row.status === 'Cleared' ? '✔' : '',
        escapeHTML(reference(loan, index)),
        escapeHTML(row.borrower.account),
        escapeHTML(row.borrower.name),
        escapeHTML(loan.cat || ''),
        escapeHTML(loan.term || ''),
        Math.round(loan.amt || 0).toLocaleString(),
        escapeHTML(loan.rate || ''),
        escapeHTML(loan.date || ''),
        escapeHTML(dueDate),
        Math.round(paid(loan)).toLocaleString(),
        Math.round(row.balance).toLocaleString(),
        statusBadge(row.status),
        `<button class="btn alt2 sm" type="button" data-loan-index="${index}">Details</button>`
      ];
    }

    function drawLoansTable(rows) {
      const target = container.querySelector('#lt');
      if (!target) return;

      target.innerHTML = table(
        ['✔', ...LOAN_HEADERS, 'Details'],
        rows.map(loanTableRow)
      );

      target.querySelectorAll('[data-loan-index]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedLoanIndex = Number(button.dataset.loanIndex);
          paymentMessage = { text: '', error: false };
          drawLoanDetails();
          container.querySelector('#ld')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    function drawLoanDetails() {
      const target = container.querySelector('#ld');
      const loan = state.loans[selectedLoanIndex];

      if (!target || !loan) {
        if (target) target.replaceChildren();
        return;
      }

      const person = borrower(loan);
      const outstanding = getBalance(loan);
      const cleared = outstanding < 0.5;
      const repaymentAllowed = hasRepaymentPermission();
      const installments = loan.term
        ? Math.round((Number(loan.amt) || 0) * ((Number(loan.rate) || 0) / 100) /
          (1 - Math.pow(1 + (Number(loan.rate) || 0) / 100, -Number(loan.term))))
        : 0;

      const history = simulate(loan).map((repayment) => [
        escapeHTML(repayment.date),
        escapeHTML(repayment.type || 'Payment'),
        Math.round(repayment.p || 0).toLocaleString(),
        Math.round(repayment.i || 0).toLocaleString(),
        Math.round(repayment.bal || 0).toLocaleString(),
        escapeHTML(repayment.ini || '')
      ]);

      target.innerHTML = `
        <div class="card">
          <h3>${escapeHTML(reference(loan, selectedLoanIndex))} — ${escapeHTML(person.name)} ${statusBadge(status(loan))}</h3>
          <div class="kpis">
            <div class="kpi">Principal<b>${money(loan.amt)}</b></div>
            <div class="kpi">Rate<b>${escapeHTML(loan.rate)}% / month</b></div>
            <div class="kpi">Amount paid<b>${money(paid(loan))}</b></div>
            <div class="kpi">Balance<b>${money(outstanding)}</b></div>
          </div>
          <p class="note">Account: ${escapeHTML(person.account || 'Non-member')} · Telephone: ${escapeHTML(person.telephone || '—')} · Disbursed: ${escapeHTML(loan.date || '')}</p>
          ${cleared
            ? '<div class="tagline">Loan cleared — the current balance is zero.</div>'
            : repaymentAllowed
              ? `<h3>Record payment</h3>
                <div class="row">
                  <div>
                    <label for="pt">Payment type</label>
                    <select id="pt">
                      <option value="inst">Installment</option>
                      <option value="lump">Lump sum</option>
                      <option value="full">Full settlement</option>
                    </select>
                  </div>
                  <div>
                    <label for="pdt">Payment date</label>
                    <input id="pdt" type="date" value="${today()}">
                  </div>
                  <div>
                    <label for="pam">Amount (UGX)</label>
                    <input id="pam" type="number" min="1" step="1" placeholder="${installments || ''}">
                  </div>
                </div>
                <button class="btn" id="pb" type="button">Record payment</button>`
              : '<p class="note">Your role does not have permission to acknowledge loan repayments.</p>'
          }
          <div id="dm" class="msg${paymentMessage.error ? ' err' : ''}" role="status" aria-live="polite">${escapeHTML(paymentMessage.text)}</div>
          <h3>Repayment history</h3>
          ${table(['Date', 'Type', 'Principal paid', 'Interest paid', 'Balance after', 'By'], history)}
        </div>`;

      if (!cleared && repaymentAllowed) {
        container.querySelector('#pt').addEventListener('change', updatePaymentFields);
        container.querySelector('#pdt').addEventListener('change', updatePaymentFields);
        container.querySelector('#pb').addEventListener('click', recordPayment);
        updatePaymentFields();
      }
    }

    function updatePaymentFields() {
      const type = container.querySelector('#pt')?.value;
      const date = container.querySelector('#pdt')?.value || today();
      const amountInput = container.querySelector('#pam');
      const loan = state.loans[selectedLoanIndex];

      if (!amountInput || !loan) return;

      const isFullPayment = type === 'full';
      amountInput.readOnly = isFullPayment;
      if (isFullPayment) {
        amountInput.value = Math.ceil(getBalance(loan, new Date(date)));
      }
    }

    function recordPayment() {
      const loan = state.loans[selectedLoanIndex];
      if (!loan) return;
      if (!hasRepaymentPermission()) {
        return showMessage('You do not have permission to acknowledge loan repayments.', true, '#dm');
      }

      const type = container.querySelector('#pt').value;
      const date = container.querySelector('#pdt').value;
      const currentDate = today();

      if (!date || date < loan.date || date > currentDate) {
        return showMessage('Choose a valid date (not before disbursement or in the future).', true, '#dm');
      }

      const latestPayment = (loan.reps || []).reduce(
        (latest, repayment) => repayment.date > latest ? repayment.date : latest,
        ''
      );

      if (latestPayment && date < latestPayment) {
        return showMessage(`Date cannot be earlier than the last recorded payment (${latestPayment}).`, true, '#dm');
      }

      const due = Math.ceil(getBalance(loan, new Date(date)));
      const amount = type === 'full' ? due : number(container.querySelector('#pam').value);

      if (amount <= 0) return showMessage('Enter an amount.', true, '#dm');
      if (amount > due) return showMessage(`Amount exceeds the balance due on that date (${money(due)}).`, true, '#dm');

      loan.reps = Array.isArray(loan.reps) ? loan.reps : [];
      loan.reps.push({
        date,
        amt: amount,
        type: type === 'full' ? 'Full settlement' : type === 'lump' ? 'Lump sum' : 'Installment',
        ini: initials(user())
      });

      audit('Loan repayment', `${reference(loan, selectedLoanIndex)} — ${personName(loan)} paid ${money(amount)}`, user());
      save();

      paymentMessage = {
        text: getBalance(loan) < 0.5
          ? 'Payment recorded. Loan fully cleared ✔'
          : `Payment of ${money(amount)} recorded.`,
        error: false
      };

      renderLoans();
    }

    function personName(loan) {
      return borrower(loan).name;
    }

    function currentFilteredLoans() {
      return state.loans.map((loan, index) => ({
        loan,
        index,
        borrower: borrower(loan),
        status: status(loan),
        balance: getBalance(loan)
      })).filter((row) => {
        const matchesFilter = loanFilter === 'all' ||
          (loanFilter === 'cleared' ? row.status === 'Cleared' : row.status !== 'Cleared');
        const text = `${row.borrower.name} ${row.borrower.account} ${reference(row.loan, row.index)}`.toLowerCase();
        return matchesFilter && (!searchQuery || text.includes(searchQuery));
      });
    }

    function download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = doc.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function exportLoansCSV() {
      const rows = currentFilteredLoans().map((row) => loanTableRow(row).slice(1, 14).map((cell) =>
        String(cell).replace(/<[^>]*>/g, '')
      ));
      const csv = [LOAN_HEADERS, ...rows]
        .map((row) => row.map((cell) => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      download(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), `elite-sacco-loans-${loanFilter}-${today()}.csv`);
      audit('Loans exported', `Exported loans to CSV (${loanFilter})`, user());
    }

    function exportLoansExcel() {
      if (!XLSX || !XLSX.utils || typeof XLSX.writeFile !== 'function') {
        return showMessage('Excel library could not load — check your internet connection.', true);
      }

      const rows = currentFilteredLoans().map((row) => {
        const loan = row.loan;
        return [
          reference(loan, row.index),
          row.borrower.account,
          row.borrower.name,
          row.borrower.telephone,
          loan.cat || '',
          loan.term || '',
          Math.round(loan.amt || 0),
          loan.rate || '',
          loan.date || '',
          loan.term ? formatDate(addMonths(loan.date, loan.term)) : '',
          Math.round(paid(loan)),
          Math.round(row.balance),
          row.status
        ];
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([LOAN_HEADERS, ...rows]);
      worksheet['!cols'] = LOAN_HEADERS.map((header) => ({ wch: Math.max(12, header.length + 3) }));
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Loans');
      XLSX.writeFile(workbook, `elite-sacco-loans-${loanFilter}-${today()}.xlsx`);
      audit('Loans exported', `Exported loans to Excel (${loanFilter})`, user());
    }

    function exportLoansPDF() {
      if (!jsPDF) return showMessage('PDF library could not load — check your internet connection.', true);

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
      if (typeof pdf.autoTable !== 'function') {
        return showMessage('PDF table plugin could not load — check your internet connection.', true);
      }

      const rows = currentFilteredLoans().map((row) => {
        const loan = row.loan;
        return [
          reference(loan, row.index),
          row.borrower.account,
          row.borrower.name,
          row.borrower.telephone,
          loan.cat || '',
          loan.term || '',
          Math.round(loan.amt || 0).toLocaleString(),
          String(loan.rate || ''),
          loan.date || '',
          loan.term ? formatDate(addMonths(loan.date, loan.term)) : '',
          Math.round(paid(loan)).toLocaleString(),
          Math.round(row.balance).toLocaleString(),
          row.status
        ];
      });

      pdf.setFontSize(14);
      pdf.setTextColor(27, 60, 145);
      pdf.text(`Elite SACCO Mbarara — ${loanFilter} loans`, 40, 36);
      pdf.autoTable({
        startY: 50,
        head: [LOAN_HEADERS],
        body: rows,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [27, 60, 145] }
      });
      pdf.save(`elite-sacco-loans-${loanFilter}-${today()}.pdf`);
      audit('Loans exported', `Exported loans to PDF (${loanFilter})`, user());
    }

    function downloadImportTemplate() {
      const sampleAccount = state.members[0] ? state.members[0].acc : '';
      const headers = [
        'Account',
        'Name',
        'Telephone',
        'Category',
        'Term (months)',
        'Principal',
        'Rate (% per month)',
        'Date Disbursed',
        'Amount Paid',
        'Balance',
        'Status',
        'Cleared Date'
      ];
      const sample = [
        sampleAccount,
        sampleAccount ? `${state.members[0].first || ''} ${state.members[0].last || ''}`.trim() : 'Example Borrower',
        '',
        'Normal Loan',
        6,
        100000,
        3,
        today(),
        0,
        '',
        'Active',
        ''
      ];

      if (XLSX && XLSX.utils && typeof XLSX.writeFile === 'function') {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, sample]), 'Loans');
        XLSX.writeFile(workbook, 'elite-sacco-loans-import-template.xlsx');
      } else {
        const csv = [headers, sample]
          .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
          .join('\r\n');
        download(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), 'elite-sacco-loans-import-template.csv');
      }

      audit('Template downloaded', 'Downloaded loans import template', user());
    }

    function importValue(record, key) {
      for (const alias of IMPORT_ALIASES[key]) {
        const normalized = normalizeHeader(alias);
        if (record[normalized] !== undefined && String(record[normalized]).trim() !== '') {
          return String(record[normalized]).trim();
        }
      }
      return '';
    }

    function parseImportDate(value) {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDate(value);

      const text = String(value || '').trim();
      const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;

      const local = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (local) return `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}`;

      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? '' : formatDate(date);
    }

    function importRecords(records) {
      let imported = 0;
      let duplicates = 0;
      let skipped = 0;
      let unknownAccounts = 0;

      records.forEach((record) => {
        const accountText = importValue(record, 'acc');
        const accountMember = accountText ? memberByAccount(accountText) : null;
        const name = importValue(record, 'name') || (accountMember
          ? `${accountMember.first || ''} ${accountMember.last || ''}`.trim()
          : '');
        const telephone = importValue(record, 'tel') || (accountMember && accountMember.tel) || '';
        const amount = number(importValue(record, 'amount'));
        const date = parseImportDate(importValue(record, 'date'));

        if (!date || amount <= 0 || (!accountMember && !name)) {
          skipped += 1;
          return;
        }

        if (accountText && !accountMember) {
          unknownAccounts += 1;
        }

        const nonMember = accountMember ? null : findOrCreateNonMember(name, telephone, '');
        const key = accountMember ? accountMember.acc : nonMember.id;

        if (state.loans.some((loan) =>
          (loan.acc || loan.nid) === key &&
          loan.date === date &&
          Number(loan.amt) === amount
        )) {
          duplicates += 1;
          return;
        }

        const rawCategory = importValue(record, 'category');
        const category = Object.keys(CATEGORIES).find((candidate) =>
          candidate.toLowerCase() === rawCategory.toLowerCase()
        ) || rawCategory || 'Normal Loan';
        const term = Math.round(number(importValue(record, 'term')));
        const rawRate = number(importValue(record, 'rate'));
        const rate = rawRate > 0 ? rawRate : suggestedRate(category, term, Boolean(accountMember));
        const loan = {
          ref: nextLoanReference(),
          acc: accountMember ? accountMember.acc : '',
          nid: accountMember ? undefined : nonMember.id,
          name,
          amt: amount,
          rate,
          date,
          cat: category,
          term,
          tel: telephone,
          reps: [],
          ini: initials(user())
        };

        const importedStatus = importValue(record, 'status').toLowerCase();
        const rawBalance = importValue(record, 'balance');
        const rawPaid = number(importValue(record, 'paid'));

        if (/clear|closed|settled|fully/.test(importedStatus)) {
          let clearedDate = parseImportDate(importValue(record, 'clearedDate')) || today();
          if (clearedDate < date) clearedDate = date;

          const amountDue = Math.ceil(getBalance(loan, new Date(clearedDate)));
          if (amountDue > 0) {
            loan.reps.push({
              date: clearedDate,
              amt: amountDue,
              type: 'Imported settlement',
              ini: initials(user())
            });
          }
        } else if (rawBalance !== '') {
          const difference = getBalance(loan) - number(rawBalance);
          if (difference >= 0.5) {
            loan.reps.push({
              date: today(),
              amt: Math.round(difference),
              type: 'Imported payments',
              ini: initials(user())
            });
          }
        } else if (rawPaid > 0) {
          loan.reps.push({
            date: today(),
            amt: Math.min(rawPaid, Math.ceil(getBalance(loan))),
            type: 'Imported payments',
            ini: initials(user())
          });
        }

        state.loans.push(loan);
        imported += 1;
      });

      if (imported) {
        audit('Loans imported', `Imported ${imported} loan(s)`, user());
        save();
      }

      const result = `Imported ${imported} loan(s)` +
        (duplicates ? `, skipped ${duplicates} duplicate(s)` : '') +
        (skipped ? `, skipped ${skipped} invalid row(s)` : '') +
        (unknownAccounts ? `; ${unknownAccounts} unknown account number(s) were treated as non-member borrowers` : '');

      selectedLoanIndex = null;
      renderLoans();
      showMessage(result, skipped > 0);
      return result;
    }

    async function readImportFile(file) {
      if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
        return csvToRecords(parseCSV(await file.text()));
      }

      if (!XLSX || !XLSX.read || !XLSX.utils) {
        throw new Error('Excel reader could not load — check your internet connection.');
      }

      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true
      });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      return XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: '',
        dateNF: 'yyyy-mm-dd'
      }).map((row) => {
        const normalized = {};
        Object.keys(row).forEach((key) => {
          normalized[normalizeHeader(key)] = row[key];
        });
        return normalized;
      });
    }

    async function importFile(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        const records = await readImportFile(file);
        importRecords(records);
      } catch (error) {
        showMessage(error.message || 'Could not import the selected file.', true);
      } finally {
        event.target.value = '';
      }
    }

    function renderHomeNotice() {
      container.innerHTML = '<div class="card"><p class="msg err">You do not have permission to access this loan view.</p></div>';
    }

    const views = {
      lreq: renderRequests,
      lapp: renderApprovals,
      lsec: renderLoans
    };

    return {
      render: (view) => {
        const renderer = views[view];
        if (!renderer) throw new Error(`Unknown loans view: ${view}`);
        renderer();
      },
      requests: renderRequests,
      approvals: renderApprovals,
      loans: renderLoans,
      importRecords,
      balance: getBalance,
      simulate: simulate,
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return {
    init,
    CATEGORIES: { ...CATEGORIES },
    suggestedRate,
    calculateBalance,
    monthlyRepaymentSimulation
  };
});
