(function (root, factory) {
  'use strict';

  const AccountsModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = AccountsModule;
  }

  if (root) {
    root.AccountsModule = AccountsModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATEMENT_HEADERS = [
    'Date',
    'Ref',
    'Particulars',
    'Deposit',
    'Withdrawal',
    'Savings balance',
    'Loan disbursement',
    'Principal repaid',
    'Interest paid',
    'Loan balance',
    'Officer'
  ];

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function dateOnly(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function formatCurrency(value) {
    return `UGX ${formatNumber(value)}`;
  }

  function addMonths(value, count) {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth() + count, date.getDate());
  }

  function monthlyLoanSimulation(loan) {
    const principal = Number(loan.amt) || 0;
    const rate = (Number(loan.rate) || 0) / 100;
    const start = new Date(loan.date);
    const repayments = [...(loan.reps || [])]
      .filter((repayment) => repayment && repayment.date)
      .sort((left, right) => new Date(left.date) - new Date(right.date));

    if (!principal || Number.isNaN(start.getTime())) return [];

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
        date: dateOnly(repayment.date),
        p: principalPaid,
        i: interestPaid,
        bal: Math.max(0, remainingPrincipal + interest),
        ini: repayment.ini || '',
        type: repayment.type || 'Payment'
      });
    });

    return output;
  }

  function loanBalance(loan, asOf) {
    const rate = (Number(loan.rate) || 0) / 100;
    const start = new Date(loan.date);
    const end = asOf ? new Date(asOf) : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return 0;
    }

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

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const container = options.container || options.view || (doc && doc.querySelector('#view'));
    const state = options.state || options.S;

    if (!doc || !container || !state) {
      throw new Error('AccountsModule.init requires a document, view container, and application state.');
    }

    state.members = Array.isArray(state.members) ? state.members : [];
    state.savings = Array.isArray(state.savings) ? state.savings : [];
    state.loans = Array.isArray(state.loans) ? state.loans : [];

    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const XLSX = options.XLSX || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
    const jsPDF = options.jsPDF ||
      (typeof globalThis !== 'undefined' && globalThis.jspdf && globalThis.jspdf.jsPDF);
    const simulateLoan = typeof options.simulateLoan === 'function'
      ? options.simulateLoan
      : monthlyLoanSimulation;
    const getLoanBalance = typeof options.loanBalance === 'function'
      ? options.loanBalance
      : loanBalance;

    let query = '';
    let selectedAccount = null;
    let currentStatement = null;
    let period = {
      type: 'm',
      month: dateOnly(new Date()).slice(0, 7),
      year: new Date().getFullYear(),
      quarter: Math.floor(new Date().getMonth() / 3) + 1
    };

    function memberFor(account) {
      return state.members.find((member) => member.acc === account);
    }

    function getSavingsBalance(account) {
      return state.savings
        .filter((transaction) => transaction.acc === account)
        .reduce((total, transaction) => total + (transaction.w ? -Number(transaction.amt || 0) : Number(transaction.amt || 0)), 0);
    }

    function memberSummary(member) {
      const transactions = state.savings.filter((transaction) => transaction.acc === member.acc);
      const deposits = transactions.filter((transaction) => !transaction.w)
        .reduce((total, transaction) => total + Number(transaction.amt || 0), 0);
      const withdrawals = transactions.filter((transaction) => transaction.w)
        .reduce((total, transaction) => total + Number(transaction.amt || 0), 0);
      const loans = state.loans.filter((loan) => loan.acc === member.acc);
      const disbursed = loans.reduce((total, loan) => total + Number(loan.amt || 0), 0);
      const repaid = loans.reduce((total, loan) =>
        total + (loan.reps || []).reduce((sum, repayment) => sum + Number(repayment.amt || 0), 0), 0);
      const outstanding = loans.reduce((total, loan) => total + getLoanBalance(loan), 0);
      const activeLoans = loans.filter((loan) => getLoanBalance(loan) >= 0.5).length;
      const savings = getSavingsBalance(member.acc);

      return {
        member,
        deposits,
        withdrawals,
        savings,
        disbursed,
        repaid,
        outstanding,
        activeLoans,
        net: savings - outstanding
      };
    }

    function periodRange() {
      if (period.type === 'q') {
        const firstMonth = (period.quarter - 1) * 3;
        return {
          from: new Date(period.year, firstMonth, 1),
          to: new Date(period.year, firstMonth + 3, 1),
          label: `Quarter ${period.quarter} ${period.year}`
        };
      }

      if (period.type === 'y') {
        return {
          from: new Date(period.year, 0, 1),
          to: new Date(period.year + 1, 0, 1),
          label: `Year ${period.year}`
        };
      }

      const [year, month] = period.month.split('-').map(Number);
      return {
        from: new Date(year, month - 1, 1),
        to: new Date(year, month, 1),
        label: new Date(year, month - 1, 1).toLocaleString('en', {
          month: 'long',
          year: 'numeric'
        })
      };
    }

    function buildStatement(account) {
      const member = memberFor(account);
      if (!member) return null;

      const range = periodRange();
      const events = [];

      state.savings
        .filter((transaction) => transaction.acc === account)
        .forEach((transaction) => {
          events.push({ date: transaction.date, type: 'savings', transaction });
        });

      state.loans.forEach((loan, index) => {
        if (loan.acc !== account) return;

        events.push({ date: loan.date, type: 'disbursement', loan, index });

        simulateLoan(loan).forEach((repayment) => {
          events.push({
            date: repayment.date,
            type: 'repayment',
            loan,
            index,
            repayment
          });
        });
      });

      events.sort((left, right) =>
        new Date(left.date) - new Date(right.date) ||
        (left.type === 'disbursement' ? -1 : 0) -
        (right.type === 'disbursement' ? -1 : 0)
      );

      let savingsBalance = 0;
      let openingSavings = 0;
      const loanBalances = {};
      const rows = [];
      const totals = { deposits: 0, withdrawals: 0, disbursed: 0, principal: 0, interest: 0 };

      events.forEach((event) => {
        const date = new Date(event.date);
        let reference = '';
        let particulars = '';
        let deposit = 0;
        let withdrawal = 0;
        let disbursed = 0;
        let principalPaid = 0;
        let interestPaid = 0;
        let officer = '';

        if (event.type === 'savings') {
          const transaction = event.transaction;
          const amount = Number(transaction.amt) || 0;
          savingsBalance += transaction.w ? -amount : amount;
          if (transaction.w) withdrawal = amount;
          else deposit = amount;

          reference = transaction.ref || '';
          particulars = transaction.w ? 'Savings withdrawal' : 'Savings deposit';
          officer = transaction.ini || '';
        } else if (event.type === 'disbursement') {
          const loan = event.loan;
          loanBalances[event.index] = (Number(loan.amt) || 0) * (1 + (Number(loan.rate) || 0) / 100);
          disbursed = Number(loan.amt) || 0;
          reference = loan.ref || `LN-${String(event.index + 1).padStart(4, '0')}`;
          particulars = `Loan disbursement${loan.cat ? ` — ${loan.cat}` : ''}`;
          officer = loan.ini || '';
        } else {
          const repayment = event.repayment;
          loanBalances[event.index] = Number(repayment.bal) || 0;
          principalPaid = Number(repayment.p) || 0;
          interestPaid = Number(repayment.i) || 0;
          reference = event.loan.ref || `LN-${String(event.index + 1).padStart(4, '0')}`;
          particulars = `Loan repayment — ${repayment.type || 'Payment'}`;
          officer = repayment.ini || '';
        }

        if (date < range.from) {
          openingSavings = savingsBalance;
          return;
        }

        if (date >= range.to) return;

        totals.deposits += deposit;
        totals.withdrawals += withdrawal;
        totals.disbursed += disbursed;
        totals.principal += principalPaid;
        totals.interest += interestPaid;

        const loanBalanceAtEvent = state.loans.reduce((sum, loan, index) =>
          loan.acc === account && loanBalances[index] != null
            ? sum + loanBalances[index]
            : sum, 0);

        rows.push([
          dateOnly(event.date),
          reference,
          particulars,
          deposit || '',
          withdrawal || '',
          Math.round(savingsBalance),
          disbursed || '',
          principalPaid ? Math.round(principalPaid) : '',
          interestPaid ? Math.round(interestPaid) : '',
          loanBalanceAtEvent ? Math.round(loanBalanceAtEvent) : '',
          officer
        ]);
      });

      const previousDay = new Date(range.from.getTime() - 1);
      const closingDate = new Date(Math.min(range.to.getTime() - 1, Date.now()));
      const openingLoans = Math.round(state.loans
        .filter((loan) => loan.acc === account && new Date(loan.date) <= previousDay)
        .reduce((total, loan) => total + getLoanBalance(loan, previousDay), 0));
      const closingLoans = Math.round(state.loans
        .filter((loan) => loan.acc === account && new Date(loan.date) <= closingDate)
        .reduce((total, loan) => total + getLoanBalance(loan, closingDate), 0));
      const closingSavings = Math.round(openingSavings + totals.deposits - totals.withdrawals);

      return {
        member,
        label: range.label,
        from: range.from,
        to: range.to,
        rows,
        totals,
        openingSavings: Math.round(openingSavings),
        closingSavings,
        openingLoans,
        closingLoans,
        netPosition: closingSavings - closingLoans
      };
    }

    function showMessage(text, isError) {
      const element = container.querySelector('#accountMsg');
      if (element) {
        element.className = 'msg' + (isError ? ' err' : '');
        element.textContent = text || '';
      } else if (text) {
        notify(text, Boolean(isError));
      }
    }

    function render() {
      const summaries = state.members.map(memberSummary);
      const filtered = summaries.filter((summary) => {
        const text = `${summary.member.first || ''} ${summary.member.last || ''} ${summary.member.acc || ''}`.toLowerCase();
        return !query || text.includes(query);
      });

      const totals = summaries.reduce((result, summary) => {
        result.deposits += summary.deposits;
        result.withdrawals += summary.withdrawals;
        result.savings += summary.savings;
        result.disbursed += summary.disbursed;
        result.repaid += summary.repaid;
        result.outstanding += summary.outstanding;
        result.activeLoans += summary.activeLoans;
        result.net += summary.net;
        return result;
      }, {
        deposits: 0,
        withdrawals: 0,
        savings: 0,
        disbursed: 0,
        repaid: 0,
        outstanding: 0,
        activeLoans: 0,
        net: 0
      });

      const rows = filtered.map((summary) => {
        const member = summary.member;
        return `<tr>
          <td>${escapeHTML(member.acc)}</td>
          <td>${escapeHTML(`${member.first || ''} ${member.last || ''}`.trim())}</td>
          <td>${escapeHTML(member.tel || '')}</td>
          <td class="n">${formatNumber(summary.deposits)}</td>
          <td class="n">${formatNumber(summary.withdrawals)}</td>
          <td class="n"><b>${formatNumber(summary.savings)}</b></td>
          <td class="n">${formatNumber(summary.disbursed)}</td>
          <td class="n">${formatNumber(summary.repaid)}</td>
          <td class="n">${formatNumber(summary.outstanding)}</td>
          <td class="n">${summary.activeLoans}</td>
          <td class="n"><b>${formatNumber(summary.net)}</b></td>
          <td><button class="btn alt2 sm" type="button" data-statement="${escapeHTML(member.acc)}">Statement</button></td>
        </tr>`;
      }).join('');

      const totalRow = filtered.length
        ? `<tr>
            <td></td><td><b>Total</b></td><td></td>
            <td class="n"><b>${formatNumber(filtered.reduce((sum, item) => sum + item.deposits, 0))}</b></td>
            <td class="n"><b>${formatNumber(filtered.reduce((sum, item) => sum + item.withdrawals, 0))}</b></td>
            <td class="n"><b>${formatNumber(filtered.reduce((sum, item) => sum + item.savings, 0))}</b></td>
            <td class="n"><b>${formatNumber(filtered.reduce((sum, item) => sum + item.disbursed, 0))}</b></td>
            <td class="n"><b>${formatNumber(filtered.reduce((sum, item) => sum + item.repaid, 0))}</b></td>
            <td class="n"><b>${formatNumber(filtered.reduce((sum, item) => sum + item.outstanding, 0))}</b></td>
            <td class="n"><b>${filtered.reduce((sum, item) => sum + item.activeLoans, 0)}</b></td>
            <td class="n"><b>${formatNumber(filtered.reduce((sum, item) => sum + item.net, 0))}</b></td>
            <td></td>
          </tr>`
        : '';

      container.innerHTML = `
        <div class="kpis">
          <div class="kpi">Members<b>${summaries.length}</b></div>
          <div class="kpi">Total savings<b>${formatCurrency(totals.savings)}</b></div>
          <div class="kpi">Loans outstanding<b>${formatCurrency(totals.outstanding)}</b></div>
          <div class="kpi">Active loans<b>${totals.activeLoans}</b></div>
        </div>

        <div class="card">
          <h3>Member accounts — current position</h3>
          <div class="row">
            <div>
              <label for="as">Search</label>
              <input id="as" placeholder="Name or account number" value="${escapeHTML(query)}">
            </div>
          </div>
          <div id="accountMsg" class="msg" role="status" aria-live="polite"></div>
          <div class="tw">
            <table>
              <thead><tr>
                <th scope="col">Account</th>
                <th scope="col">Member</th>
                <th scope="col">Telephone</th>
                <th class="n" scope="col">Deposits</th>
                <th class="n" scope="col">Withdrawals</th>
                <th class="n" scope="col">Savings balance</th>
                <th class="n" scope="col">Loans taken</th>
                <th class="n" scope="col">Loan repayments</th>
                <th class="n" scope="col">Loan outstanding</th>
                <th class="n" scope="col">Active loans</th>
                <th class="n" scope="col">Net position</th>
                <th scope="col">Statement</th>
              </tr></thead>
              <tbody>${rows || '<tr><td colspan="12">No member accounts found.</td></tr>'}${totalRow}</tbody>
            </table>
          </div>
        </div>

        <div id="accountStatement"></div>`;

      container.querySelector('#as').addEventListener('input', (event) => {
        query = event.target.value.trim().toLowerCase();
        render();
        const search = container.querySelector('#as');
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      });

      container.querySelectorAll('[data-statement]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedAccount = button.dataset.statement;
          renderStatement();
          container.querySelector('#accountStatement')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        });
      });

      if (selectedAccount) renderStatement();
    }

    function renderStatement() {
      const target = container.querySelector('#accountStatement');
      const member = memberFor(selectedAccount);
      if (!target || !member) return;

      target.innerHTML = `
        <div class="card">
          <h3>Statement — ${escapeHTML(member.acc)} · ${escapeHTML(`${member.first || ''} ${member.last || ''}`.trim())}</h3>
          <div class="row noprint">
            <div>
              <label for="periodType">Statement period</label>
              <select id="periodType">
                <option value="m">Monthly</option>
                <option value="q">Quarterly</option>
                <option value="y">Annual</option>
              </select>
            </div>
            <div id="monthWrap">
              <label for="periodMonth">Month</label>
              <input id="periodMonth" type="month" value="${escapeHTML(period.month)}">
            </div>
            <div id="quarterWrap" hidden>
              <label for="periodQuarter">Quarter</label>
              <select id="periodQuarter">
                <option value="1">Quarter 1</option>
                <option value="2">Quarter 2</option>
                <option value="3">Quarter 3</option>
                <option value="4">Quarter 4</option>
              </select>
            </div>
            <div>
              <label for="periodYear">Year</label>
              <input id="periodYear" type="number" min="2000" max="2100" value="${period.year}">
            </div>
          </div>

          <div class="noprint">
            <button class="btn" type="button" id="exportExcel">Export Excel</button>
            <button class="btn alt2" type="button" id="exportCSV">Export CSV</button>
            <button class="btn alt2" type="button" id="exportPDF">Export PDF</button>
            <button class="btn alt2" type="button" id="closeStatement">Close statement</button>
          </div>
          <div id="statementBody"></div>
        </div>`;

      target.querySelector('#periodType').value = period.type;
      target.querySelector('#periodQuarter').value = String(period.quarter);
      target.querySelector('#periodYear').value = String(period.year);

      target.querySelector('#periodType').addEventListener('change', (event) => {
        period.type = event.target.value;
        updatePeriodControls();
        updateStatement();
      });
      target.querySelector('#periodMonth').addEventListener('input', (event) => {
        if (!event.target.value) return;
        period.month = event.target.value;
        const [year, month] = period.month.split('-').map(Number);
        period.year = year;
        period.quarter = Math.floor((month - 1) / 3) + 1;
        target.querySelector('#periodYear').value = String(period.year);
        target.querySelector('#periodQuarter').value = String(period.quarter);
        updateStatement();
      });
      target.querySelector('#periodQuarter').addEventListener('change', (event) => {
        period.quarter = Number(event.target.value);
        updateStatement();
      });
      target.querySelector('#periodYear').addEventListener('input', (event) => {
        const year = Number(event.target.value);
        if (year >= 2000 && year <= 2100) {
          period.year = year;
          updateStatement();
        }
      });

      target.querySelector('#exportExcel').addEventListener('click', exportExcel);
      target.querySelector('#exportCSV').addEventListener('click', exportCSV);
      target.querySelector('#exportPDF').addEventListener('click', exportPDF);
      target.querySelector('#closeStatement').addEventListener('click', () => {
        selectedAccount = null;
        currentStatement = null;
        target.replaceChildren();
      });

      updatePeriodControls();
      updateStatement();
    }

    function updatePeriodControls() {
      const target = container.querySelector('#accountStatement');
      if (!target) return;

      const monthly = period.type === 'm';
      const quarterly = period.type === 'q';
      target.querySelector('#monthWrap').hidden = !monthly;
      target.querySelector('#quarterWrap').hidden = !quarterly;
    }

    function updateStatement() {
      currentStatement = buildStatement(selectedAccount);
      const body = container.querySelector('#statementBody');
      if (!body || !currentStatement) return;

      const statement = currentStatement;
      const dataRows = statement.rows.map((row) => `<tr>${row.map((cell, index) => {
        const value = cell === '' ? '' : (index >= 3 && index <= 9 && Number.isFinite(Number(cell))
          ? formatNumber(cell)
          : escapeHTML(cell));
        return `<td${index >= 3 && index <= 9 ? ' class="n"' : ''}>${value}</td>`;
      }).join('')}</tr>`).join('');

      body.innerHTML = `
        <p class="note"><b>${escapeHTML(statement.label)}</b> · ${dateOnly(statement.from)} to ${dateOnly(new Date(statement.to.getTime() - 1))}</p>
        <div class="kpis">
          <div class="kpi">Deposits<b>${formatCurrency(statement.totals.deposits)}</b></div>
          <div class="kpi">Withdrawals<b>${formatCurrency(statement.totals.withdrawals)}</b></div>
          <div class="kpi">Closing savings<b>${formatCurrency(statement.closingSavings)}</b></div>
          <div class="kpi">Loan balance<b>${formatCurrency(statement.closingLoans)}</b></div>
        </div>
        <div class="tw">
          <table>
            <thead><tr>${STATEMENT_HEADERS.map((header, index) =>
              `<th${index >= 3 && index <= 9 ? ' class="n"' : ''} scope="col">${escapeHTML(header)}</th>`
            ).join('')}</tr></thead>
            <tbody>
              <tr><td></td><td></td><td><b>Opening balance</b></td>
                <td></td><td></td><td class="n"><b>${formatNumber(statement.openingSavings)}</b></td>
                <td></td><td></td><td></td><td class="n"><b>${formatNumber(statement.openingLoans)}</b></td><td></td></tr>
              ${dataRows || `<tr><td colspan="${STATEMENT_HEADERS.length}">No transactions in this period.</td></tr>`}
              <tr><td></td><td></td><td><b>Closing balance</b></td>
                <td></td><td></td><td class="n"><b>${formatNumber(statement.closingSavings)}</b></td>
                <td></td><td></td><td></td><td class="n"><b>${formatNumber(statement.closingLoans)}</b></td><td></td></tr>
            </tbody>
          </table>
        </div>
        <p class="note">Net position: <b>${formatCurrency(statement.netPosition)}</b></p>`;
    }

    function exportRows() {
      if (!currentStatement) return [];
      const statement = currentStatement;

      return [
        ['ELITE SACCO MBARARA'],
        ['Member Account Statement'],
        [],
        ['Account', statement.member.acc],
        ['Member', `${statement.member.first || ''} ${statement.member.last || ''}`.trim()],
        ['Telephone', statement.member.tel || ''],
        ['Period', statement.label],
        ['From', dateOnly(statement.from)],
        ['To', dateOnly(new Date(statement.to.getTime() - 1))],
        [],
        ['SUMMARY (UGX)'],
        ['Opening savings balance', statement.openingSavings],
        ['Deposits in period', Math.round(statement.totals.deposits)],
        ['Withdrawals in period', Math.round(statement.totals.withdrawals)],
        ['Closing savings balance', statement.closingSavings],
        ['Opening loan balance', statement.openingLoans],
        ['Loans disbursed', Math.round(statement.totals.disbursed)],
        ['Principal repaid', Math.round(statement.totals.principal)],
        ['Interest paid', Math.round(statement.totals.interest)],
        ['Closing loan balance', statement.closingLoans],
        ['Net position', statement.netPosition],
        [],
        STATEMENT_HEADERS,
        ['', '', 'Opening balance', '', '', statement.openingSavings, '', '', '', statement.openingLoans, ''],
        ...statement.rows,
        ['', '', 'Closing balance', '', '', statement.closingSavings, '', '', '', statement.closingLoans, '']
      ];
    }

    function safeFilename() {
      const member = memberFor(selectedAccount);
      const periodName = period.type === 'm'
        ? period.month
        : period.type === 'q'
          ? `${period.year}-Q${period.quarter}`
          : String(period.year);

      return `statement-${String(member.acc).replace(/\s+/g, '-')}-${periodName}`;
    }

    function exportCSV() {
      if (!currentStatement) return;

      const csv = exportRows()
        .map((row) => row.map((value) => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      const link = doc.createElement('a');
      link.href = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `${safeFilename()}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);

      audit('Statement exported', `Exported CSV statement for ${currentStatement.member.acc} (${currentStatement.label})`);
      save();
    }

    function exportExcel() {
      if (!currentStatement) return;
      if (!XLSX || !XLSX.utils || typeof XLSX.writeFile !== 'function') {
        return showMessage('Excel library could not load — check your internet connection.', true);
      }

      const worksheet = XLSX.utils.aoa_to_sheet(exportRows());
      Object.keys(worksheet).forEach((cell) => {
        if (cell[0] !== '!' && worksheet[cell].t === 'n') worksheet[cell].z = '#,##0';
      });
      worksheet['!cols'] = [
        { wch: 30 }, { wch: 14 }, { wch: 34 }, { wch: 14 }, { wch: 14 },
        { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
      XLSX.writeFile(workbook, `${safeFilename()}.xlsx`);

      audit('Statement exported', `Exported Excel statement for ${currentStatement.member.acc} (${currentStatement.label})`);
      save();
    }

    function exportPDF() {
      if (!currentStatement) return;
      if (!jsPDF) {
        return showMessage('PDF library could not load — check your internet connection.', true);
      }

      const statement = currentStatement;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      if (typeof pdf.autoTable !== 'function') {
        return showMessage('PDF table plugin could not load — check your internet connection.', true);
      }

      pdf.setFontSize(16);
      pdf.setTextColor(27, 60, 145);
      pdf.text('Elite SACCO Mbarara', 40, 40);
      pdf.setFontSize(11);
      pdf.setTextColor(0);
      pdf.text('Member Account Statement', 40, 58);
      pdf.setFontSize(9);
      pdf.text(
        `Account: ${statement.member.acc}    Member: ${statement.member.first || ''} ${statement.member.last || ''}    Telephone: ${statement.member.tel || '-'}`,
        40,
        76
      );
      pdf.text(
        `Period: ${dateOnly(statement.from)} to ${dateOnly(new Date(statement.to.getTime() - 1))}    Generated: ${dateOnly(new Date())}`,
        40,
        90
      );

      pdf.autoTable({
        startY: 105,
        head: [['Savings', 'UGX', 'Loans', 'UGX']],
        body: [
          ['Opening balance', formatNumber(statement.openingSavings), 'Opening balance', formatNumber(statement.openingLoans)],
          ['Deposits', formatNumber(statement.totals.deposits), 'Disbursed', formatNumber(statement.totals.disbursed)],
          ['Withdrawals', formatNumber(statement.totals.withdrawals), 'Principal repaid', formatNumber(statement.totals.principal)],
          ['Closing balance', formatNumber(statement.closingSavings), 'Closing balance', formatNumber(statement.closingLoans)]
        ],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [27, 60, 145] }
      });

      const bodyRows = [
        ['', '', 'Opening balance', '', '', formatNumber(statement.openingSavings), '', '', '', formatNumber(statement.openingLoans), ''],
        ...statement.rows.map((row) => row.map((value, index) =>
          index < 3 || index === 10 ? String(value == null ? '' : value) : value === '' ? '' : formatNumber(value)
        )),
        ['', '', 'Closing balance', '', '', formatNumber(statement.closingSavings), '', '', '', formatNumber(statement.closingLoans), '']
      ];

      pdf.autoTable({
        startY: pdf.lastAutoTable.finalY + 14,
        head: [STATEMENT_HEADERS],
        body: bodyRows,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [27, 60, 145] },
        columnStyles: Object.fromEntries(
          [3, 4, 5, 6, 7, 8, 9].map((index) => [index, { halign: 'right' }])
        ),
        didDrawPage: () => {
          pdf.setFontSize(7);
          pdf.setTextColor(120);
          pdf.text(
            `Elite SACCO Mbarara — ${statement.member.acc} — ${statement.label} — Page ${pdf.internal.getNumberOfPages()}`,
            40,
            pdf.internal.pageSize.getHeight() - 18
          );
          pdf.setTextColor(0);
        }
      });

      pdf.save(`${safeFilename()}.pdf`);
      audit('Statement exported', `Exported PDF statement for ${statement.member.acc} (${statement.label})`);
      save();
    }

    render();

    return {
      render,
      buildStatement,
      setPeriod(nextPeriod) {
        period = { ...period, ...nextPeriod };
        if (selectedAccount) renderStatement();
      },
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return { init };
});
