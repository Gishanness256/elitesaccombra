(function (root, factory) {
  'use strict';

  const PortfolioModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = PortfolioModule;
  }

  if (root) {
    root.PortfolioModule = PortfolioModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BUCKETS = [
    { label: 'Current (not yet due)', color: '#2E9E5B' },
    { label: '1–29 days', color: '#E0B01F' },
    { label: '30–59 days', color: '#E07A1F' },
    { label: '60–89 days', color: '#D62828' },
    { label: '90+ days', color: '#8B0000' }
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

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatAmount(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function formatCurrency(value) {
    return `UGX ${formatAmount(value)}`;
  }

  function addMonths(value, count) {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth() + Number(count || 0), date.getDate());
  }

  function daysBetween(later, earlier) {
    return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
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

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return { b: 0, k: 0 };
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

    return { b: Math.max(0, balance), k: monthIndex };
  }

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const container = options.container || options.view || (doc && doc.querySelector('#view'));
    const state = options.state || options.S;

    if (!doc || !container || !state) {
      throw new Error('PortfolioModule.init requires a document, view container, and application state.');
    }

    state.members = Array.isArray(state.members) ? state.members : [];
    state.savings = Array.isArray(state.savings) ? state.savings : [];
    state.loans = Array.isArray(state.loans) ? state.loans : [];
    state.non = Array.isArray(state.non) ? state.non : [];

    const simulate = typeof options.simulateLoan === 'function'
      ? options.simulateLoan
      : monthlyRepaymentSimulation;
    const balanceAt = typeof options.loanBalance === 'function'
      ? options.loanBalance
      : calculateBalance;
    const getBorrower = typeof options.borrower === 'function'
      ? options.borrower
      : defaultBorrower;
    const getLoanReference = typeof options.loanReference === 'function'
      ? options.loanReference
      : (loan, index) => loan.ref || `LN-${String(index + 1).padStart(4, '0')}`;

    function defaultBorrower(loan) {
      const member = state.members.find((item) => item.acc === loan.acc);
      if (member) {
        return {
          acc: member.acc,
          name: `${member.first || ''} ${member.last || ''}`.trim(),
          nm: 0
        };
      }

      const nonMember = state.non.find((item) => item.id === loan.nid);
      return {
        acc: '',
        name: nonMember ? nonMember.name : loan.name || 'Unknown',
        nm: 1
      };
    }

    function loanBalance(loan, date) {
      const result = balanceAt(loan, date ? new Date(date) : new Date());
      return typeof result === 'number' ? result : Number(result && result.b) || 0;
    }

    function displayBorrower(value) {
      const name = escapeHTML(value && value.name || 'Unknown');
      return value && value.nm ? `<i>${name}</i>` : name;
    }

    function table(headers, rows, numericColumns) {
      numericColumns = numericColumns || [];

      const head = headers.map((header, index) =>
        `<th${numericColumns.includes(index) ? ' class="n"' : ''} scope="col">${header}</th>`
      ).join('');

      const body = rows.length
        ? rows.map((row) => `<tr>${row.map((cell, index) =>
            `<td${numericColumns.includes(index) ? ' class="n"' : ''}>${cell == null ? '' : cell}</td>`
          ).join('')}</tr>`).join('')
        : `<tr><td colspan="${headers.length}">No records to display.</td></tr>`;

      return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function ledgerEvents() {
      const events = [];

      state.savings.forEach((transaction) => {
        events.push({
          date: transaction.date,
          type: 'savings',
          transaction
        });
      });

      state.loans.forEach((loan, index) => {
        events.push({ date: loan.date, type: 'disbursement', loan, index });

        simulate(loan).forEach((repayment) => {
          events.push({
            date: repayment.date,
            type: 'repayment',
            loan,
            index,
            repayment
          });
        });
      });

      events.sort((left, right) => {
        const dateDifference = new Date(left.date) - new Date(right.date);
        if (dateDifference) return dateDifference;

        return (left.type === 'disbursement' ? -1 : 0) -
          (right.type === 'disbursement' ? -1 : 0);
      });

      return events;
    }

    function renderLedger() {
      const savingsBalances = {};
      const loanBalances = {};
      const events = ledgerEvents();

      const rows = events.map((event) => {
        let account = '';
        let particulars = '';
        let deposit = 0;
        let withdrawal = 0;
        let disbursed = 0;
        let principalPaid = 0;
        let interestPaid = 0;
        let officer = '';
        let key = '';

        if (event.type === 'savings') {
          const transaction = event.transaction;
          account = transaction.acc || '';
          key = account;
          const amount = Number(transaction.amt) || 0;

          savingsBalances[account] = (savingsBalances[account] || 0) +
            (transaction.w ? -amount : amount);

          if (transaction.w) {
            withdrawal = amount;
            particulars = 'Savings withdrawal';
          } else {
            deposit = amount;
            particulars = 'Savings deposit';
          }

          officer = transaction.ini || '';
        } else {
          const loan = event.loan;
          const person = getBorrower(loan);

          account = person.acc || '';
          key = loan.acc || `nm${loan.nid || event.index}`;

          if (event.type === 'disbursement') {
            loanBalances[event.index] =
              (Number(loan.amt) || 0) * (1 + (Number(loan.rate) || 0) / 100);
            disbursed = Number(loan.amt) || 0;
            particulars = `Loan disbursement — ${displayBorrower(person)}`;
            officer = loan.ini || '';
          } else {
            loanBalances[event.index] = Number(event.repayment.bal) || 0;
            principalPaid = Number(event.repayment.p) || 0;
            interestPaid = Number(event.repayment.i) || 0;
            particulars = `Loan repayment — ${displayBorrower(person)}`;
            officer = event.repayment.ini || '';
          }
        }

        const hasLoanBalance = state.loans.some((loan, index) => {
          const loanKey = loan.acc || `nm${loan.nid || index}`;
          return loanKey === key && loanBalances[index] != null;
        });

        const outstandingForKey = state.loans.reduce((total, loan, index) => {
          const loanKey = loan.acc || `nm${loan.nid || index}`;
          return loanKey === key && loanBalances[index] != null
            ? total + loanBalances[index]
            : total;
        }, 0);

        return [
          escapeHTML(formatDate(event.date)),
          escapeHTML(account),
          particulars,
          deposit ? formatAmount(deposit) : '',
          withdrawal ? formatAmount(withdrawal) : '',
          savingsBalances[account] != null ? formatAmount(savingsBalances[account]) : '',
          disbursed ? formatAmount(disbursed) : '',
          principalPaid ? formatAmount(principalPaid) : '',
          interestPaid ? formatAmount(interestPaid) : '',
          hasLoanBalance ? formatAmount(outstandingForKey) : '',
          escapeHTML(officer)
        ];
      });

      container.innerHTML = `
        <div class="card">
          <h3>General ledger</h3>
          ${table(
            [
              'Date',
              'Account',
              'Particulars',
              'Savings Deposit In (Cr/Dr)',
              'Savings Withdrawal Out',
              'Savings Balance',
              'Loan Disbursement',
              'Loan Repayment (Principal)',
              'Interest Paid',
              'Loan Balance',
              'Officer'
            ],
            rows,
            [3, 4, 5, 6, 7, 8, 9]
          )}
        </div>`;
    }

    function bucketIndex(daysOverdue) {
      if (daysOverdue <= 0) return 0;
      if (daysOverdue < 30) return 1;
      if (daysOverdue < 60) return 2;
      if (daysOverdue < 90) return 3;
      return 4;
    }

    function liquidityRows(asOf) {
      const buckets = BUCKETS.map(() => []);
      const loans = [];
      let totalOutstanding = 0;
      let noTermCount = 0;

      state.loans.forEach((loan, index) => {
        const outstanding = loanBalance(loan, asOf);
        if (outstanding < 0.5) return;

        totalOutstanding += outstanding;

        if (!loan.term) {
          noTermCount += 1;
          return;
        }

        const dueDate = addMonths(loan.date, loan.term);
        dueDate.setHours(0, 0, 0, 0);

        const daysOverdue = Math.floor((asOf - dueDate) / 86400000);
        const bucket = bucketIndex(daysOverdue);
        const person = getBorrower(loan);

        const row = {
          loan,
          index,
          person,
          outstanding,
          dueDate,
          daysOverdue,
          bucket
        };

        buckets[bucket].push(row);
        loans.push(row);
      });

      return { buckets, loans, totalOutstanding, noTermCount };
    }

    function renderLiquidity() {
      const asOf = new Date();
      asOf.setHours(0, 0, 0, 0);

      const portfolio = liquidityRows(asOf);
      const { buckets, loans, totalOutstanding, noTermCount } = portfolio;

      const amountForBucket = (index) =>
        buckets[index].reduce((total, row) => total + row.outstanding, 0);

      const countFromBucket = (index) =>
        buckets.slice(index).reduce((total, bucket) => total + bucket.length, 0);

      const amountFromBucket = (index) =>
        buckets.slice(index).reduce(
          (total, bucket) => total + bucket.reduce((sum, row) => sum + row.outstanding, 0),
          0
        );

      const percentage = (amount) =>
        totalOutstanding ? `${(amount / totalOutstanding * 100).toFixed(2)}%` : '0.00%';

      const par30 = amountFromBucket(2);
      const par60 = amountFromBucket(3);
      const par90 = amountFromBucket(4);

      const bucketRows = BUCKETS.map((bucket, index) => [
        `<b style="color:${bucket.color}">●</b> ${escapeHTML(bucket.label)}`,
        buckets[index].length,
        formatAmount(amountForBucket(index)),
        percentage(amountForBucket(index))
      ]);

      const maxBucketAmount = Math.max(1, ...BUCKETS.map((_, index) => amountForBucket(index)));
      const bars = BUCKETS.map((bucket, index) => {
        const amount = amountForBucket(index);
        const width = Math.max(0, amount / maxBucketAmount * 100);

        return `<div style="display:flex;align-items:center;gap:.6rem;margin:.45rem 0;font-size:.85rem">
          <span style="width:145px;flex:none">${escapeHTML(bucket.label)}</span>
          <div style="height:16px;background:${bucket.color};border-radius:8px;width:${width.toFixed(1)}%;min-width:${amount ? '3px' : '0'}"></div>
          <b>${formatAmount(amount)}</b>
        </div>`;
      }).join('');

      const overdue = loans
        .filter((row) => row.daysOverdue > 0)
        .sort((left, right) => right.daysOverdue - left.daysOverdue);

      const overdueRows = overdue.map((row) => [
        escapeHTML(getLoanReference(row.loan, row.index)),
        escapeHTML(row.person.acc || ''),
        displayBorrower(row.person),
        escapeHTML(formatDate(row.dueDate)),
        row.daysOverdue,
        formatAmount(row.outstanding),
        escapeHTML(BUCKETS[row.bucket].label)
      ]);

      container.innerHTML = `
        <div class="kpis">
          <div class="kpi">Loan portfolio outstanding<b>${formatCurrency(totalOutstanding)}</b></div>
          <div class="kpi">PAR 30 (30+ days overdue)<b>${percentage(par30)}</b><small>${formatCurrency(par30)} · ${countFromBucket(2)} loan(s)</small></div>
          <div class="kpi">PAR 60 (60+ days overdue)<b>${percentage(par60)}</b><small>${formatCurrency(par60)} · ${countFromBucket(3)} loan(s)</small></div>
          <div class="kpi">PAR 90 (90+ days overdue)<b>${percentage(par90)}</b><small>${formatCurrency(par90)} · ${countFromBucket(4)} loan(s)</small></div>
        </div>

        <div class="card">
          <h3>Portfolio at Risk (PAR)</h3>
          <p style="font-size:.88rem;margin-bottom:.6rem">
            PAR = outstanding balance of loans past their due date by the stated number of days ÷ total outstanding loan portfolio.
          </p>
          ${bars}
        </div>

        <div class="card">
          <h3>Ageing of outstanding loans</h3>
          ${table(['Bucket', 'Loans', 'Outstanding balance', '% of portfolio'], bucketRows, [1, 2, 3])}
          ${noTermCount
            ? `<p class="note">${noTermCount} outstanding loan(s) have no term and are included in the portfolio total, but not assigned to an ageing bucket.</p>`
            : ''}
        </div>

        <div class="card">
          <h3>Overdue loans</h3>
          ${table(
            ['Ref', 'Account', 'Borrower', 'Due date', 'Days overdue', 'Balance', 'PAR bucket'],
            overdueRows,
            [4, 5]
          )}
        </div>`;
    }

    function render(view) {
      if (view === 'ledger') return renderLedger();
      if (view === 'liquidity') return renderLiquidity();
      throw new Error(`Unknown portfolio view: ${view}`);
    }

    return {
      render,
      ledger: renderLedger,
      liquidity: renderLiquidity,
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return {
    init,
    BUCKETS: BUCKETS.map((bucket) => ({ ...bucket })),
    calculateBalance,
    monthlyRepaymentSimulation
  };
});
