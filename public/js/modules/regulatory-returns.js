(function (root, factory) {
  'use strict';

  const RegulatoryReturnsModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = RegulatoryReturnsModule;
  }

  if (root) root.RegulatoryReturnsModule = RegulatoryReturnsModule;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BALANCE_INPUTS = [
    ['cash', 'Cash on hand'],
    ['bank', 'Bank balances'],
    ['liq', 'Other liquid investments (T-bills, fixed deposits)'],
    ['oa', 'Other assets (fixed assets, prepayments)'],
    ['ol', 'Other liabilities'],
    ['sh', 'Member share capital'],
    ['rs', 'Statutory / other reserves']
  ];

  const FLOW_INPUTS = [
    ['fee', 'Fee & other income (this month)'],
    ['sint', 'Interest / dividends paid on savings (this month)'],
    ['opx', 'Operating expenses (this month)']
  ];

  const ALL_INPUTS = [...BALANCE_INPUTS, ...FLOW_INPUTS];

  const BUCKET_LABELS = [
    'Current (not yet due)',
    '1–29 days overdue',
    '30–59 days overdue',
    '60–89 days overdue',
    '90+ days overdue'
  ];

  const DEFAULT_CONFIG = {
    reg: 'Uganda Microfinance Regulatory Authority (UMRA)',
    lic: '',
    minLiq: 15,
    minCore: 10,
    minInst: 8,
    maxP30: 5,
    maxP90: 2,
    pr: [1, 5, 25, 50, 100]
  };

  const h = (label) => ({ heading: label });
  const row = (label, key, type, extra) => ({
    label,
    key,
    type: type || 'money',
    ...(extra || {})
  });
  const FLOW = { flow: true };
  const FLOW_BOLD = { flow: true, bold: true };

  const TEMPLATES = [
    {
      id: 'sum',
      name: 'Prudential Ratios Summary',
      sheet: 'Ratios',
      rows: [
        h('Liquidity'),
        row('Liquidity ratio (liquid assets ÷ savings + short-term liabilities)', 'rLiq', 'percent', { benchmark: ['min', 'minLiq'] }),
        row('Liquid assets ÷ total assets', 'rLiqTA', 'percent'),
        row('Loans (principal) ÷ member savings', 'rL2S', 'percent'),
        h('Capital adequacy'),
        row('Core capital ÷ total assets', 'rCore', 'percent', { benchmark: ['min', 'minCore'] }),
        row('Institutional capital ÷ total assets', 'rInst', 'percent', { benchmark: ['min', 'minInst'] }),
        row('Net worth ÷ member savings', 'rNW2S', 'percent'),
        h('Asset quality'),
        row('Portfolio at risk, 30 days and above (PAR 30)', 'rP30', 'percent', { benchmark: ['max', 'maxP30'] }),
        row('Portfolio at risk, 90 days and above (PAR 90)', 'rP90', 'percent', { benchmark: ['max', 'maxP90'] }),
        row('Provision ÷ principal outstanding', 'rPC', 'percent'),
        h('Earnings'),
        row('Operating self-sufficiency (income ÷ expenses)', 'rOSS', 'percent')
      ]
    },
    {
      id: 'sfp',
      name: 'Statement of Financial Position',
      sheet: 'Financial Position',
      note: 'Retained earnings is derived as total assets less liabilities, member share capital and reserves.',
      rows: [
        h('Assets'),
        row('Cash on hand', 'i_cash'),
        row('Bank balances', 'i_bank'),
        row('Other liquid investments', 'i_liq'),
        row('Loans to members and others (principal outstanding)', 'prin'),
        row('Interest receivable', 'intr'),
        row('Less: loan loss provision', 'prov'),
        row('Other assets', 'i_oa'),
        row('TOTAL ASSETS', 'ta', 'money', { bold: true }),
        h('Liabilities'),
        row('Member savings / deposits', 'sb'),
        row('Other liabilities', 'i_ol'),
        row('TOTAL LIABILITIES', 'tl', 'money', { bold: true }),
        h('Equity'),
        row('Member share capital', 'i_sh'),
        row('Statutory / other reserves', 'i_rs'),
        row('Retained earnings & surplus (derived)', 're'),
        row('TOTAL EQUITY (core capital)', 'nw', 'money', { bold: true }),
        row('TOTAL LIABILITIES AND EQUITY', 'tle', 'money', { bold: true })
      ]
    },
    {
      id: 'inc',
      name: 'Statement of Income',
      sheet: 'Income',
      note: 'Loan interest income is accrued using interest collected plus the change in interest receivable. Provision expense is the change in required provision.',
      rows: [
        h('Income'),
        row('Interest income on loans (accrual)', 'iinc', 'money', FLOW),
        row('Fee & other income', 'i_fee', 'money', FLOW),
        row('TOTAL INCOME', 'tinc', 'money', FLOW_BOLD),
        h('Expenses'),
        row('Interest / dividends paid on savings', 'i_sint', 'money', FLOW),
        row('Operating expenses', 'i_opx', 'money', FLOW),
        row('Loan loss provision expense', 'pexp', 'money', FLOW),
        row('TOTAL EXPENSES', 'texp', 'money', { ...FLOW, bold: true }),
        h('Result'),
        row('NET SURPLUS / (DEFICIT)', 'sur', 'money', FLOW_BOLD),
        row('Operating self-sufficiency (income ÷ expenses)', 'rOSS', 'percent'),
        h('Memo: loan activity'),
        row('Loans disbursed', 'dis', 'money', FLOW),
        row('Principal repaid', 'rp', 'money', FLOW),
        row('Interest collected', 'ri', 'money', FLOW)
      ]
    },
    {
      id: 'liq',
      name: 'Liquidity Return',
      sheet: 'Liquidity',
      rows: [
        h('Liquid assets'),
        row('Cash on hand', 'i_cash'),
        row('Bank balances', 'i_bank'),
        row('Other liquid investments', 'i_liq'),
        row('TOTAL LIQUID ASSETS', 'liqA', 'money', { bold: true }),
        h('Liability base'),
        row('Member savings / deposits', 'sb'),
        row('Other short-term liabilities', 'i_ol'),
        row('TOTAL SAVINGS AND SHORT-TERM LIABILITIES', 'lbase', 'money', { bold: true }),
        h('Liquidity position'),
        row('Liquidity ratio', 'rLiq', 'percent', { benchmark: ['min', 'minLiq'], bold: true }),
        row('Liquid assets above / (below) required minimum', 'liqGap'),
        row('Liquid assets ÷ total assets', 'rLiqTA', 'percent'),
        h('Savings movement'),
        row('Deposits received', 'dep', 'money', FLOW),
        row('Withdrawals paid', 'wd', 'money', FLOW)
      ]
    },
    {
      id: 'cap',
      name: 'Capital Adequacy Return',
      sheet: 'Capital Adequacy',
      note: 'Core capital is member share capital plus reserves and derived retained earnings.',
      rows: [
        h('Core capital'),
        row('Member share capital', 'i_sh'),
        row('Statutory / other reserves', 'i_rs'),
        row('Retained earnings & surplus (derived)', 're'),
        row('TOTAL CORE CAPITAL', 'core', 'money', { bold: true }),
        row('Institutional capital', 'inst'),
        h('Asset base'),
        row('Total assets', 'ta'),
        row('Member savings / deposits', 'sb'),
        h('Capital adequacy ratios'),
        row('Core capital ÷ total assets', 'rCore', 'percent', { benchmark: ['min', 'minCore'], bold: true }),
        row('Core capital above / (below) required minimum', 'capGap'),
        row('Institutional capital ÷ total assets', 'rInst', 'percent', { benchmark: ['min', 'minInst'] })
      ]
    },
    {
      id: 'pqr',
      name: 'Portfolio Quality & Loan Loss Provisioning',
      sheet: 'Portfolio Quality',
      note: 'Provision rates are applied to principal outstanding by overdue bucket.',
      rows: [
        h('Portfolio'),
        row('Active loans (number)', 'nl', 'number'),
        row('Principal outstanding', 'prin'),
        row('Interest receivable', 'intr'),
        row('Gross portfolio', 'gross', 'money', { bold: true }),
        h('Ageing of principal outstanding'),
        ...BUCKET_LABELS.map((label, index) => row(label, `bk${index}`)),
        h('Number of loans by ageing'),
        ...BUCKET_LABELS.map((label, index) => row(label, `bn${index}`, 'number')),
        h('Provision required'),
        ...BUCKET_LABELS.map((label, index) => row(`Provision — ${label}`, `bp${index}`)),
        row('TOTAL PROVISION REQUIRED', 'prov', 'money', { bold: true }),
        row('Provision ÷ principal outstanding', 'rPC', 'percent'),
        h('Portfolio at risk (on principal)'),
        row('Overdue 1 day and above', 'rP1', 'percent'),
        row('PAR 30', 'rP30', 'percent', { benchmark: ['max', 'maxP30'] }),
        row('PAR 60', 'rP60', 'percent'),
        row('PAR 90', 'rP90', 'percent', { benchmark: ['max', 'maxP90'] }),
        h('Activity in period'),
        row('Loans disbursed (amount)', 'dis', 'money', FLOW),
        row('Loans disbursed (number)', 'disn', 'number', FLOW),
        row('Principal repaid', 'rp', 'money', FLOW),
        row('Interest collected', 'ri', 'money', FLOW)
      ]
    },
    {
      id: 'mem',
      name: 'Membership & Savings Return',
      sheet: 'Membership',
      note: 'Registered member count reflects current members; the system does not store member registration dates.',
      rows: [
        h('Membership'),
        row('Registered members', 'mem', 'number'),
        row('Members with a savings balance', 'msv', 'number'),
        row('Active borrowers', 'nb', 'number'),
        row('Active loans', 'nl', 'number'),
        h('Savings'),
        row('Member savings balance', 'sb', 'money', { bold: true }),
        row('Average savings per member', 'asv'),
        row('Deposits in period', 'dep', 'money', FLOW),
        row('Withdrawals in period', 'wd', 'money', FLOW),
        row('Net savings movement', 'nsm', 'money', { ...FLOW, bold: true }),
        h('Intermediation'),
        row('Loans (principal) ÷ member savings', 'rL2S', 'percent')
      ]
    }
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

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function monthKey(year, monthIndex) {
    return `${year}-${pad2(monthIndex + 1)}`;
  }

  function currentMonthKey() {
    const date = new Date();
    return monthKey(date.getFullYear(), date.getMonth());
  }

  function previousMonthKey() {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return monthKey(date.getFullYear(), date.getMonth());
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function toDate(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function clampPercentage(value) {
    return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
  }

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const container = options.container || options.view || (doc && doc.querySelector('#view'));
    const state = options.state || options.S;

    if (!doc || !container || !state) {
      throw new Error('RegulatoryReturnsModule.init requires a document, view container, and application state.');
    }

    state.members = Array.isArray(state.members) ? state.members : [];
    state.savings = Array.isArray(state.savings) ? state.savings : [];
    state.loans = Array.isArray(state.loans) ? state.loans : [];
    state.non = Array.isArray(state.non) ? state.non : [];
    state.regin = state.regin && typeof state.regin === 'object' ? state.regin : {};
    state.rcfg = { ...DEFAULT_CONFIG, ...(state.rcfg || {}) };

    if (!Array.isArray(state.rcfg.pr) || state.rcfg.pr.length !== 5) {
      state.rcfg.pr = DEFAULT_CONFIG.pr.slice();
    }

    const currentUser = typeof options.currentUser === 'function'
      ? options.currentUser
      : () => options.user || null;
    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const XLSX = options.XLSX || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
    const jsPDF = options.jsPDF ||
      (typeof globalThis !== 'undefined' && globalThis.jspdf && globalThis.jspdf.jsPDF);
    const simulateLoan = typeof options.simulateLoan === 'function'
      ? options.simulateLoan
      : defaultSimulation;
    const balanceAt = typeof options.loanBalance === 'function'
      ? options.loanBalance
      : defaultBalance;

    let reportState = {
      mode: 'm',
      asAt: '',
      months: 6,
      templateId: 'sum'
    };

    let snapshotCache = new Map();

    function defaultSimulation(loan) {
      const principal = Number(loan.amt) || 0;
      const rate = (Number(loan.rate) || 0) / 100;
      const start = toDate(loan.date);
      if (!principal || !start) return [];

      const repayments = [...(loan.reps || [])]
        .filter((item) => item && item.date)
        .sort((left, right) => new Date(left.date) - new Date(right.date));

      let remainingPrincipal = principal;
      let interest = principal * rate;
      let monthIndex = 0;
      const output = [];

      function nextMonth() {
        return new Date(start.getFullYear(), start.getMonth() + monthIndex + 1, start.getDate());
      }

      repayments.forEach((repayment) => {
        const date = toDate(repayment.date);
        if (!date) return;

        while (nextMonth() < date) {
          interest += (remainingPrincipal + interest) * rate;
          monthIndex += 1;
        }

        let amount = Number(repayment.amt) || 0;
        const interestPaid = Math.min(amount, interest);
        interest -= interestPaid;
        amount -= interestPaid;

        const principalPaid = Math.min(amount, remainingPrincipal);
        remainingPrincipal -= principalPaid;

        output.push({
          date: formatDate(date),
          p: principalPaid,
          i: interestPaid,
          bal: Math.max(0, remainingPrincipal + interest),
          ini: repayment.ini || '',
          type: repayment.type || 'Payment'
        });
      });

      return output;
    }

    function defaultBalance(loan, asOf) {
      const rate = (Number(loan.rate) || 0) / 100;
      const start = toDate(loan.date);
      const end = toDate(asOf || new Date());

      if (!start || !end || end < start) return { b: 0, k: 0 };

      let balance = (Number(loan.amt) || 0) * (1 + rate);
      let monthIndex = 0;
      let previousPeriod = new Date(start.getTime() - 1);

      const repayments = (loan.reps || []).map((repayment) => ({
        date: toDate(repayment.date),
        amount: Number(repayment.amt) || 0
      })).filter((repayment) => repayment.date);

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

    function balanceValue(loan, date) {
      const value = balanceAt(loan, date);
      return typeof value === 'number' ? value : Number(value && value.b) || 0;
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

    function canConfigure() {
      const current = currentUser();
      return !current || current.role === 'Admin' || current.role === 'Treasurer';
    }

    function hasDataThrough(month) {
      const hasTransactions = [...state.savings, ...state.loans].some((item) => {
        const date = toDate(item.date);
        return date && monthKey(date.getFullYear(), date.getMonth()) <= month;
      });

      const hasRepayments = state.loans.some((loan) =>
        (loan.reps || []).some((repayment) => {
          const date = toDate(repayment.date);
          return date && monthKey(date.getFullYear(), date.getMonth()) <= month;
        })
      );

      return hasTransactions || hasRepayments;
    }

    function firstDataMonth() {
      const dates = [
        ...state.savings.map((item) => item.date),
        ...state.loans.map((item) => item.date),
        ...state.loans.flatMap((loan) => (loan.reps || []).map((item) => item.date))
      ].map(toDate).filter(Boolean);

      if (!dates.length) return null;

      dates.sort((left, right) => left - right);
      return monthKey(dates[0].getFullYear(), dates[0].getMonth());
    }

    function inputValue(month, key, carryForward) {
      const saved = state.regin[month] || {};
      const value = saved[key];

      if (value !== undefined && value !== '' && value !== null && Number.isFinite(Number(value))) {
        return Number(value);
      }

      if (carryForward) {
        const earlierMonths = Object.keys(state.regin)
          .filter((candidate) =>
            candidate < month &&
            state.regin[candidate] &&
            state.regin[candidate][key] !== undefined &&
            state.regin[candidate][key] !== '' &&
            Number.isFinite(Number(state.regin[candidate][key]))
          )
          .sort()
          .reverse();

        if (earlierMonths.length) return Number(state.regin[earlierMonths[0]][key]);
      }

      return null;
    }

    function loanStats(asOf) {
      const stats = {
        principal: 0,
        interest: 0,
        gross: 0,
        count: 0,
        buckets: [0, 0, 0, 0, 0],
        bucketCounts: [0, 0, 0, 0, 0],
        borrowerKeys: new Set()
      };

      state.loans.forEach((loan) => {
        const disbursed = toDate(loan.date);
        if (!disbursed || disbursed > asOf) return;

        const balance = balanceValue(loan, asOf);
        if (balance < 0.5) return;

        const principalPaid = simulateLoan(loan)
          .filter((repayment) => {
            const date = toDate(repayment.date);
            return date && date <= asOf;
          })
          .reduce((total, repayment) => total + (Number(repayment.p) || 0), 0);

        const principalOutstanding = Math.min(
          balance,
          Math.max(0, (Number(loan.amt) || 0) - principalPaid)
        );
        const interestOutstanding = Math.max(0, balance - principalOutstanding);

        let bucket = 0;
        if (loan.term) {
          const due = addMonths(loan.date, loan.term);
          const overdueDays = Math.floor((asOf - due) / 86400000);
          bucket = overdueDays <= 0 ? 0
            : overdueDays < 30 ? 1
              : overdueDays < 60 ? 2
                : overdueDays < 90 ? 3 : 4;
        }

        stats.principal += principalOutstanding;
        stats.interest += interestOutstanding;
        stats.gross += balance;
        stats.count += 1;
        stats.buckets[bucket] += principalOutstanding;
        stats.bucketCounts[bucket] += 1;
        stats.borrowerKeys.add(loan.acc || loan.nid || `loan-${stats.count}`);
      });

      return stats;
    }

    function snapshot(year, monthIndex) {
      const key = monthKey(year, monthIndex);
      if (snapshotCache.has(key)) return snapshotCache.get(key);

      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
      const monthStart = new Date(year, monthIndex, 1);
      const previousMonthEnd = new Date(monthStart.getTime() - 1);
      const currentLoans = loanStats(monthEnd);
      const previousLoans = loanStats(previousMonthEnd);
      const isInMonth = (value) => {
        const date = toDate(value);
        return date && date >= monthStart && date <= monthEnd;
      };

      const snap = { key, missingInputs: [] };

      BALANCE_INPUTS.forEach(([inputKey]) => {
        const value = inputValue(key, inputKey, true);
        if (value == null) snap.missingInputs.push(inputKey);
        snap[`i_${inputKey}`] = value || 0;
      });

      FLOW_INPUTS.forEach(([inputKey]) => {
        const value = inputValue(key, inputKey, false);
        if (value == null) snap.missingInputs.push(inputKey);
        snap[`i_${inputKey}`] = value || 0;
      });

      const savingsToDate = state.savings.filter((transaction) => {
        const date = toDate(transaction.date);
        return date && date <= monthEnd;
      });

      snap.sb = savingsToDate.reduce(
        (total, transaction) => total + (transaction.w ? -1 : 1) * (Number(transaction.amt) || 0),
        0
      );

      const monthlySavings = state.savings.filter((transaction) => isInMonth(transaction.date));
      snap.dep = monthlySavings
        .filter((transaction) => !transaction.w)
        .reduce((total, transaction) => total + (Number(transaction.amt) || 0), 0);
      snap.wd = monthlySavings
        .filter((transaction) => transaction.w)
        .reduce((total, transaction) => total + (Number(transaction.amt) || 0), 0);
      snap.nsm = snap.dep - snap.wd;

      const balancesByMember = {};
      savingsToDate.forEach((transaction) => {
        balancesByMember[transaction.acc] = (balancesByMember[transaction.acc] || 0) +
          (transaction.w ? -1 : 1) * (Number(transaction.amt) || 0);
      });

      snap.mem = state.members.length;
      snap.msv = Object.values(balancesByMember).filter((value) => value > 0).length;
      snap.asv = snap.mem ? snap.sb / snap.mem : null;

      snap.nl = currentLoans.count;
      snap.nb = currentLoans.borrowerKeys.size;
      snap.prin = currentLoans.principal;
      snap.intr = currentLoans.interest;
      snap.gross = currentLoans.gross;

      snap.dis = 0;
      snap.disn = 0;
      snap.rp = 0;
      snap.ri = 0;

      state.loans.forEach((loan) => {
        if (isInMonth(loan.date)) {
          snap.dis += Number(loan.amt) || 0;
          snap.disn += 1;
        }

        simulateLoan(loan).forEach((repayment) => {
          if (isInMonth(repayment.date)) {
            snap.rp += Number(repayment.p) || 0;
            snap.ri += Number(repayment.i) || 0;
          }
        });
      });

      currentLoans.buckets.forEach((value, index) => {
        snap[`bk${index}`] = value;
        snap[`bn${index}`] = currentLoans.bucketCounts[index];
        snap[`bp${index}`] = value * (Number(state.rcfg.pr[index]) || 0) / 100;
      });

      snap.prov = currentLoans.buckets.reduce(
        (total, value, index) => total + value * (Number(state.rcfg.pr[index]) || 0) / 100,
        0
      );

      const previousProvision = previousLoans.buckets.reduce(
        (total, value, index) => total + value * (Number(state.rcfg.pr[index]) || 0) / 100,
        0
      );

      snap.liqA = snap.i_cash + snap.i_bank + snap.i_liq;
      snap.tl = snap.sb + snap.i_ol;
      snap.lbase = snap.tl;
      snap.ta = snap.liqA + snap.prin + snap.intr - snap.prov + snap.i_oa;
      snap.nw = snap.ta - snap.tl;
      snap.re = snap.nw - snap.i_sh - snap.i_rs;
      snap.core = snap.nw;
      snap.inst = snap.i_rs + snap.re;
      snap.tle = snap.tl + snap.nw;

      snap.iinc = snap.ri + (currentLoans.interest - previousLoans.interest);
      snap.tinc = snap.iinc + snap.i_fee;
      snap.pexp = snap.prov - previousProvision;
      snap.texp = snap.i_sint + snap.i_opx + snap.pexp;
      snap.sur = snap.tinc - snap.texp;
      snap.liqGap = snap.liqA - (Number(state.rcfg.minLiq) || 0) / 100 * snap.lbase;
      snap.capGap = snap.core - (Number(state.rcfg.minCore) || 0) / 100 * snap.ta;

      const ratio = (numerator, denominator) => denominator > 0
        ? numerator / denominator * 100
        : null;
      const overduePrincipal = (index) =>
        currentLoans.buckets.slice(index).reduce((total, value) => total + value, 0);

      snap.rLiq = ratio(snap.liqA, snap.lbase);
      snap.rLiqTA = ratio(snap.liqA, snap.ta);
      snap.rL2S = ratio(snap.prin, snap.sb);
      snap.rCore = snap.ta > 0 ? ratio(snap.core, snap.ta) : null;
      snap.rInst = snap.ta > 0 ? ratio(snap.inst, snap.ta) : null;
      snap.rNW2S = ratio(snap.nw, snap.sb);
      snap.rP1 = ratio(overduePrincipal(1), snap.prin);
      snap.rP30 = ratio(overduePrincipal(2), snap.prin);
      snap.rP60 = ratio(overduePrincipal(3), snap.prin);
      snap.rP90 = ratio(overduePrincipal(4), snap.prin);
      snap.rPC = ratio(snap.prov, snap.prin);
      snap.rOSS = snap.texp > 0 ? ratio(snap.tinc, snap.texp) : null;

      snapshotCache.set(key, snap);
      return snap;
    }

    function getWindow() {
      const [year, monthNumber] = reportState.asAt.split('-').map(Number);
      const monthIndex = monthNumber - 1;
      const firstMonth = firstDataMonth();
      const isAvailable = ([candidateYear, candidateMonth]) => {
        const key = monthKey(candidateYear, candidateMonth);
        return firstMonth && key >= firstMonth;
      };

      let current = [];
      let previous = [];

      if (reportState.mode === 'm') {
        current = [[year, monthIndex]];
      } else if (reportState.mode === 'mom') {
        for (let index = reportState.months - 1; index >= 0; index -= 1) {
          const date = new Date(year, monthIndex - index, 1);
          current.push([date.getFullYear(), date.getMonth()]);
        }
      } else {
        for (let month = 0; month <= monthIndex; month += 1) {
          current.push([year, month]);
          previous.push([year - 1, month]);
        }
      }

      const requestedMonths = current.length;

      return {
        mode: reportState.mode,
        year,
        monthIndex,
        requestedMonths,
        firstMonth,
        current: current.filter(isAvailable).map(([y, m]) => snapshot(y, m)),
        previous: previous.filter(isAvailable).map(([y, m]) => snapshot(y, m))
      };
    }

    function periodBasis(windowData) {
      const monthName = new Date(windowData.year, windowData.monthIndex, 1)
        .toLocaleString('en', { month: 'short' });

      if (windowData.mode === 'm') return `Month-end ${reportState.asAt}`;
      if (windowData.mode === 'mom') return `Month-on-month average, ${reportState.months} months to ${reportState.asAt}`;

      return `Year-on-year average, Jan–${monthName} ${windowData.year} vs Jan–${monthName} ${windowData.year - 1}`;
    }

    function mean(snapshots, key) {
      const values = snapshots.map((item) => item[key]).filter((value) =>
        value != null && Number.isFinite(Number(value))
      );

      return values.length
        ? values.reduce((total, value) => total + Number(value), 0) / values.length
        : null;
    }

    function total(snapshots, key) {
      return snapshots.length
        ? snapshots.reduce((sum, item) => sum + (Number(item[key]) || 0), 0)
        : null;
    }

    function formatCell(cell) {
      if (!cell) return '';
      if (cell.type === 'text') return String(cell.value == null ? '' : cell.value);
      if (cell.value == null || !Number.isFinite(Number(cell.value))) return 'n/a';

      const value = Number(cell.value);
      if (cell.type === 'percent') return `${value.toFixed(2)}%`;
      if (cell.type === 'pp') return `${value >= 0 ? '+' : ''}${value.toFixed(2)} pp`;
      if (cell.type === 'changePercent') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
      return formatNumber(value);
    }

    function buildReturn(template, windowData) {
      const hasFlows = template.rows.some((item) => item.flow);
      const headers = ['Item'];

      if (windowData.mode === 'm') {
        headers.push('Value');
      } else if (windowData.mode === 'mom') {
        headers.push(...windowData.current.map((item) => item.key), 'Average');
        if (hasFlows) headers.push('Total');
        headers.push('Change vs prior month');
      } else {
        headers.push(
          `Avg ${windowData.year} (YTD)`,
          `Avg ${windowData.year - 1} (YTD)`,
          'Change',
          '% change'
        );
        if (hasFlows) headers.push(`Total ${windowData.year}`, `Total ${windowData.year - 1}`);
      }

      headers.push('Benchmark', 'Status');

      const rows = template.rows.map((item) => {
        if (item.heading) return { heading: item.heading };

        const cells = [{ value: item.label, type: 'text' }];
        const key = item.key;
        const type = item.type === 'percent' ? 'percent' : 'money';
        let primaryValue = null;

        if (windowData.mode === 'm') {
          primaryValue = windowData.current[0] ? windowData.current[0][key] : null;
          cells.push({ value: primaryValue, type });
        } else if (windowData.mode === 'mom') {
          windowData.current.forEach((snapshot) => {
            cells.push({ value: snapshot[key], type });
          });

          primaryValue = mean(windowData.current, key);
          cells.push({ value: primaryValue, type });

          if (hasFlows) {
            cells.push(item.flow
              ? { value: total(windowData.current, key), type }
              : { value: '', type: 'text' });
          }

          const count = windowData.current.length;
          const previous = count > 1 ? windowData.current[count - 2][key] : null;
          const latest = count > 0 ? windowData.current[count - 1][key] : null;

          cells.push(
            latest != null && previous != null
              ? { value: latest - previous, type: item.type === 'percent' ? 'pp' : type }
              : { value: 'n/a', type: 'text' }
          );
        } else {
          const currentAverage = mean(windowData.current, key);
          const previousAverage = mean(windowData.previous, key);
          primaryValue = currentAverage;

          cells.push({ value: currentAverage, type });
          cells.push(previousAverage == null
            ? { value: 'n/a', type: 'text' }
            : { value: previousAverage, type });

          const change = currentAverage != null && previousAverage != null
            ? currentAverage - previousAverage
            : null;

          cells.push(change == null
            ? { value: 'n/a', type: 'text' }
            : { value: change, type: item.type === 'percent' ? 'pp' : type });

          cells.push(
            item.type === 'percent' || change == null || !previousAverage
              ? { value: 'n/a', type: 'text' }
              : { value: change / Math.abs(previousAverage) * 100, type: 'changePercent' }
          );

          if (hasFlows) {
            cells.push(item.flow
              ? { value: total(windowData.current, key), type }
              : { value: '', type: 'text' });
            cells.push(item.flow && windowData.previous.length
              ? { value: total(windowData.previous, key), type }
              : { value: '', type: 'text' });
          }
        }

        let status = '';
        if (item.benchmark) {
          const [direction, configKey] = item.benchmark;
          const limit = Number(state.rcfg[configKey]) || 0;
          cells.push({
            value: `${direction === 'min' ? '≥' : '≤'} ${limit}%`,
            type: 'text'
          });

          status = primaryValue == null
            ? 'n/a'
            : (direction === 'min' ? primaryValue >= limit : primaryValue <= limit)
              ? 'Compliant'
              : 'Breach';

          cells.push({ value: status, type: 'text' });
        } else {
          cells.push({ value: '', type: 'text' }, { value: '', type: 'text' });
        }

        return { cells, bold: Boolean(item.bold), status };
      });

      return { title: template.name, headers, rows };
    }

    function renderTable(report) {
      const finalColumns = report.headers.length;
      const header = report.headers.map((value, index) =>
        `<th${index > 0 && index < finalColumns - 2 ? ' class="n"' : ''} scope="col">${escapeHTML(value)}</th>`
      ).join('');

      const body = report.rows.map((item) => {
        if (item.heading) {
          return `<tr><td colspan="${report.headers.length}" style="font-weight:800;color:var(--blue);background:var(--blue-soft)">${escapeHTML(item.heading)}</td></tr>`;
        }

        const cells = item.cells.map((cell, index) => {
          const numeric = index > 0 && index < finalColumns - 2;
          const style = [
            numeric ? 'text-align:right' : '',
            item.bold ? 'font-weight:800' : '',
            item.status && index === finalColumns - 1
              ? `color:${item.status === 'Breach' ? '#D62828' : '#0a7a3b'}`
              : ''
          ].filter(Boolean).join(';');

          return `<td${numeric ? ' class="n"' : ''}${style ? ` style="${style}"` : ''}>${escapeHTML(formatCell(cell))}</td>`;
        }).join('');

        return `<tr>${cells}</tr>`;
      }).join('');

      return `<div class="tw"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function getNotes(template, windowData) {
      const notes = [];
      if (template.note) notes.push(template.note);

      if (template.id === 'pqr') {
        notes.push(
          `Provision rates (current / 1–29 / 30–59 / 60–89 / 90+ days): ${state.rcfg.pr.join('% / ')}%.`
        );
      }

      if (windowData.mode !== 'm') {
        notes.push('Balances are month-end averages. Flow items are monthly averages, with period totals shown separately.');
      }

      const missing = new Set(windowData.current.flatMap((item) => item.missingInputs));
      if (missing.size) {
        const labels = ALL_INPUTS
          .filter(([key]) => missing.has(key))
          .map(([, label]) => label);
        notes.push(`Financial inputs not entered (treated as zero): ${labels.join(', ')}.`);
      }

      notes.push('Benchmarks are indicative. Confirm they match the regulator’s current guidelines before submission.');
      notes.push('This report follows a common prudential-return structure; transfer figures to the regulator’s prescribed form if required.');

      return notes;
    }

    function renderNotes(template, windowData) {
      return getNotes(template, windowData)
        .map((note) => `<p>${escapeHTML(note)}</p>`)
        .join('');
    }

    function render() {
      snapshotCache = new Map();

      const firstMonth = firstDataMonth();
      const defaultMonth = firstMonth && firstMonth > previousMonthKey()
        ? currentMonthKey()
        : previousMonthKey();

      if (!reportState.asAt || reportState.asAt > currentMonthKey()) {
        reportState.asAt = defaultMonth;
      }

      const editable = canConfigure();
      const disabled = editable ? '' : ' disabled';
      const config = state.rcfg;

      container.innerHTML = `
        <div class="card noprint">
          <h3>Generate regulatory return</h3>
          <div class="row">
            <div>
              <label for="rt">Return / template</label>
              <select id="rt">
                ${TEMPLATES.map((template) =>
                  `<option value="${template.id}">${escapeHTML(template.name)}</option>`
                ).join('')}
              </select>
            </div>
            <div>
              <label for="rb">Reporting basis</label>
              <select id="rb">
                <option value="m">Month-end snapshot</option>
                <option value="mom">Month-on-month average</option>
                <option value="yoy">Year-on-year average (YTD)</option>
              </select>
            </div>
            <div>
              <label for="ra">As at month</label>
              <input id="ra" type="month" max="${currentMonthKey()}">
            </div>
            <div id="rnw">
              <label for="rn">Months in average</label>
              <select id="rn">
                <option value="3">3</option>
                <option value="6">6</option>
                <option value="12">12</option>
              </select>
            </div>
          </div>
          <p class="note" id="rinfo"></p>
          <button class="btn" id="e1" type="button">Export PDF</button>
          <button class="btn alt2" id="e2" type="button">Export Excel</button>
          <button class="btn alt2" id="e3" type="button">Full pack — PDF</button>
          <button class="btn alt2" id="e4" type="button">Full pack — Excel</button>
          <button class="btn alt2" id="e5" type="button">Print</button>
          <button class="btn alt2" id="e6" type="button">Go to latest data month</button>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
        </div>

        <details class="card noprint">
          <summary style="cursor:pointer;font-weight:800;color:var(--blue)">Monthly financial inputs (cash, bank, capital, income &amp; expenses)</summary>
          <p class="note">Loans, savings and interest are calculated from system records. Enter other figures here. Balance items carry forward to later months when no newer value is entered.</p>
          <div class="row">
            <div>
              <label for="im">Month</label>
              <input id="im" type="month" max="${currentMonthKey()}" value="${escapeHTML(reportState.asAt)}">
            </div>
          </div>
          <div class="row">
            ${ALL_INPUTS.map(([key, label]) => `
              <div>
                <label for="in_${key}">${escapeHTML(label)}</label>
                <input id="in_${key}" type="number" min="0" step="0.01"${disabled}>
              </div>
            `).join('')}
          </div>
          <button class="btn" id="isv" type="button"${disabled}>Save inputs for month</button>
          <div id="msg3" class="msg" role="status" aria-live="polite"></div>
          <div id="isaved"></div>
        </details>

        <details class="card noprint">
          <summary style="cursor:pointer;font-weight:800;color:var(--blue)">Institution &amp; benchmarks</summary>
          <p class="note">Benchmarks are indicative defaults. Verify them against the regulator’s current guidelines before filing.</p>
          <div class="row">
            ${textInput('cg_reg', 'Regulator', config.reg, disabled)}
            ${textInput('cg_lic', 'Registration / licence no.', config.lic, disabled)}
            ${numberInput('cg_minLiq', 'Minimum liquidity ratio (%)', config.minLiq, disabled)}
            ${numberInput('cg_minCore', 'Minimum core capital ratio (%)', config.minCore, disabled)}
            ${numberInput('cg_minInst', 'Minimum institutional capital ratio (%)', config.minInst, disabled)}
            ${numberInput('cg_maxP30', 'Maximum PAR 30 (%)', config.maxP30, disabled)}
            ${numberInput('cg_maxP90', 'Maximum PAR 90 (%)', config.maxP90, disabled)}
          </div>
          <div class="row">
            ${BUCKET_LABELS.map((label, index) =>
              numberInput(`cg_pr${index}`, `Provision % — ${label}`, config.pr[index], disabled)
            ).join('')}
          </div>
          <button class="btn" id="csv" type="button"${disabled}>Save settings</button>
          <div id="msg2" class="msg" role="status" aria-live="polite"></div>
          ${editable ? '' : '<p class="note">Only the System Admin or Treasurer can change these settings.</p>'}
        </details>

        <div id="rep">
          <div class="card">
            <h2 id="rtt" style="font-size:1.35rem"></h2>
            <p class="note" id="rcap"></p>
            <div id="rres"></div>
            <div id="rnt" class="note"></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;margin-top:2rem;font-size:.85rem">
              <div style="border-top:1.5px solid #000;padding-top:.4rem">Prepared by<br><br>Signature: ____________<br>Date: ____________</div>
              <div style="border-top:1.5px solid #000;padding-top:.4rem">Reviewed by (Treasurer)<br><br>Signature: ____________<br>Date: ____________</div>
              <div style="border-top:1.5px solid #000;padding-top:.4rem">Approved by (Manager / Chairperson)<br><br>Signature: ____________<br>Date: ____________</div>
            </div>
          </div>
        </div>`;

      container.querySelector('#rt').value = reportState.templateId;
      container.querySelector('#rb').value = reportState.mode;
      container.querySelector('#ra').value = reportState.asAt;
      container.querySelector('#rn').value = String(reportState.months);

      ['rt', 'rb', 'rn'].forEach((id) => {
        container.querySelector(`#${id}`).addEventListener('change', draw);
      });
      container.querySelector('#ra').addEventListener('input', draw);
      container.querySelector('#ra').addEventListener('change', draw);
      container.querySelector('#e1').addEventListener('click', () => exportPDF([selectedTemplate()]));
      container.querySelector('#e2').addEventListener('click', () => exportExcel([selectedTemplate()]));
      container.querySelector('#e3').addEventListener('click', () => exportPDF(TEMPLATES));
      container.querySelector('#e4').addEventListener('click', () => exportExcel(TEMPLATES));
      container.querySelector('#e5').addEventListener('click', printReport);
      container.querySelector('#e6').addEventListener('click', () => {
        container.querySelector('#ra').value = latestDataMonth() || previousMonthKey();
        draw();
      });
      container.querySelector('#im').addEventListener('change', loadInputs);
      container.querySelector('#isv').addEventListener('click', saveInputs);
      container.querySelector('#csv').addEventListener('click', saveConfig);

      loadInputs();
      renderSavedMonths();
      draw();
    }

    function textInput(id, label, value, disabled) {
      return `<div><label for="${id}">${escapeHTML(label)}</label><input id="${id}" type="text" value="${escapeHTML(value)}"${disabled}></div>`;
    }

    function numberInput(id, label, value, disabled) {
      return `<div><label for="${id}">${escapeHTML(label)}</label><input id="${id}" type="number" min="0" step="0.01" value="${escapeHTML(value)}"${disabled}></div>`;
    }

    function selectedTemplate() {
      return TEMPLATES.find((template) => template.id === reportState.templateId) || TEMPLATES[0];
    }

    function latestDataMonth() {
      const dates = [
        ...state.savings.map((item) => item.date),
        ...state.loans.map((item) => item.date),
        ...state.loans.flatMap((loan) => (loan.reps || []).map((item) => item.date))
      ].map(toDate).filter(Boolean);

      if (!dates.length) return '';

      dates.sort((left, right) => right - left);
      return monthKey(dates[0].getFullYear(), dates[0].getMonth());
    }

    function draw() {
      const monthInput = container.querySelector('#ra');
      if (!monthInput) return;

      if (monthInput.value) reportState.asAt = monthInput.value;
      if (!reportState.asAt || reportState.asAt > currentMonthKey()) {
        reportState.asAt = currentMonthKey();
        monthInput.value = reportState.asAt;
      }

      reportState.mode = container.querySelector('#rb').value;
      reportState.templateId = container.querySelector('#rt').value;
      reportState.months = Number(container.querySelector('#rn').value) || 6;

      container.querySelector('#rnw').style.display = reportState.mode === 'mom' ? '' : 'none';

      const windowData = getWindow();
      const template = selectedTemplate();
      const output = buildReturn(template, windowData);

      const firstMonth = firstDataMonth();
      container.querySelector('#rinfo').textContent = firstMonth
        ? `Financial data is recorded from ${firstMonth}. ${windowData.current.length} of ${windowData.requestedMonths} month(s) in the selected window have data.`
        : 'No loan or savings records exist yet. Record transactions before generating a return.';

      container.querySelector('#rtt').textContent = template.name;

      if (!windowData.current.length) {
        container.querySelector('#rcap').textContent = '';
        container.querySelector('#rres').innerHTML =
          '<p class="msg err">No financial data on or before the selected month. Choose a later month or record savings/loans first.</p>';
        container.querySelector('#rnt').replaceChildren();
        return;
      }

      container.querySelector('#rcap').textContent =
        `${state.rcfg.reg} · ${periodBasis(windowData)} · Amounts in UGX`;
      container.querySelector('#rres').innerHTML = renderTable(output);
      container.querySelector('#rnt').innerHTML = renderNotes(template, windowData);
    }

    function loadInputs() {
      const month = container.querySelector('#im')?.value;
      if (!month) return;

      ALL_INPUTS.forEach(([key], index) => {
        const element = container.querySelector(`#in_${key}`);
        const currentValue = (state.regin[month] || {})[key];

        if (element) {
          element.value = currentValue == null ? '' : String(currentValue);
          element.placeholder = index < BALANCE_INPUTS.length
            ? inputValue(month, key, true) == null
              ? ''
              : String(inputValue(month, key, true))
            : '';
        }
      });

      container.querySelector('#msg3').textContent = '';
    }

    function renderSavedMonths() {
      const target = container.querySelector('#isaved');
      if (!target) return;

      const months = Object.keys(state.regin).sort().reverse();
      if (!months.length) {
        target.replaceChildren();
        return;
      }

      const headers = ['Month', ...ALL_INPUTS.map((item) => item[1])];
      const rows = months.map((month) => [
        escapeHTML(month),
        ...ALL_INPUTS.map(([key]) => {
          const value = state.regin[month] && state.regin[month][key];
          return value == null ? '' : formatNumber(value);
        })
      ]);

      target.innerHTML = `<h3 style="margin-top:1rem">Saved months</h3>${table(headers, rows, ALL_INPUTS.map((_, index) => index + 1))}`;
    }

    function saveInputs() {
      if (!canConfigure()) {
        return showMessage('Only the System Admin or Treasurer can save financial inputs.', true, '#msg3');
      }

      const month = container.querySelector('#im').value;
      if (!month) return showMessage('Choose a month.', true, '#msg3');

      const values = {};
      let invalid = false;

      ALL_INPUTS.forEach(([key]) => {
        const raw = container.querySelector(`#in_${key}`).value.trim();
        if (!raw) return;

        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          invalid = true;
        } else {
          values[key] = value;
        }
      });

      if (invalid) {
        return showMessage('Enter valid amounts (zero or more).', true, '#msg3');
      }

      if (Object.keys(values).length) {
        state.regin[month] = values;
      } else {
        delete state.regin[month];
      }

      audit('Regulatory inputs saved', `Saved financial inputs for ${month}`, currentUser());
      save();
      snapshotCache = new Map();
      loadInputs();
      renderSavedMonths();
      draw();
      showMessage(`Inputs saved for ${month}.`, false, '#msg3');
    }

    function saveConfig() {
      if (!canConfigure()) {
        return showMessage('Only the System Admin or Treasurer can change settings.', true, '#msg2');
      }

      const get = (id) => container.querySelector(`#${id}`).value.trim();
      const values = {
        minLiq: get('cg_minLiq'),
        minCore: get('cg_minCore'),
        minInst: get('cg_minInst'),
        maxP30: get('cg_maxP30'),
        maxP90: get('cg_maxP90'),
        pr: [0, 1, 2, 3, 4].map((index) => get(`cg_pr${index}`))
      };

      const percentages = [
        values.minLiq,
        values.minCore,
        values.minInst,
        values.maxP30,
        values.maxP90,
        ...values.pr
      ];

      if (percentages.some((value) => value === '' || !clampPercentage(value))) {
        return showMessage('Percentages must be between 0 and 100.', true, '#msg2');
      }

      if (!get('cg_reg')) {
        return showMessage('Regulator name is required.', true, '#msg2');
      }

      Object.assign(state.rcfg, {
        reg: get('cg_reg'),
        lic: get('cg_lic'),
        minLiq: Number(values.minLiq),
        minCore: Number(values.minCore),
        minInst: Number(values.minInst),
        maxP30: Number(values.maxP30),
        maxP90: Number(values.maxP90),
        pr: values.pr.map(Number)
      });

      audit('Regulatory settings changed', 'Updated regulator details, benchmarks and provision rates', currentUser());
      save();
      snapshotCache = new Map();
      draw();
      showMessage('Settings saved.', false, '#msg2');
    }

    function periodBasis(windowData) {
      const month = new Date(windowData.year, windowData.monthIndex, 1)
        .toLocaleString('en', { month: 'short' });

      if (windowData.mode === 'm') return `Month-end ${reportState.asAt}`;
      if (windowData.mode === 'mom') {
        return `Month-on-month average, ${reportState.months} months to ${reportState.asAt}`;
      }

      return `Year-on-year average, Jan–${month} ${windowData.year} vs Jan–${month} ${windowData.year - 1}`;
    }

    function download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = doc.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function safeText(value) {
      return String(value == null ? '' : value)
        .replace(/[≥]/g, '>=')
        .replace(/[≤]/g, '<=')
        .replace(/[÷]/g, '/')
        .replace(/[—–]/g, '-')
        .replace(/[^\x00-\x7F]/g, '');
    }

    function reportHeaderLines(template, windowData) {
      return [
        ['ELITE SACCO MBARARA'],
        [template.name],
        ['Regulator', state.rcfg.reg],
        ['Registration / licence no.', state.rcfg.lic || '-'],
        ['Basis', periodBasis(windowData)],
        ['Months included', `${windowData.current.length} of ${windowData.requestedMonths}`],
        ['Amounts', 'UGX'],
        ['Generated', formatDate(new Date())]
      ];
    }

    function worksheetFor(template, windowData) {
      const output = buildReturn(template, windowData);
      const rows = reportHeaderLines(template, windowData);
      const numericCells = [];

      rows.push(output.headers);

      output.rows.forEach((item) => {
        if (item.heading) {
          rows.push([item.heading]);
          return;
        }

        const rowValues = item.cells.map((cell, index) => {
          if (cell.value == null) return 'n/a';

          if (cell.type === 'text') return cell.value;

          if (Number.isFinite(Number(cell.value))) {
            if (cell.type === 'percent' || cell.type === 'changePercent') {
              numericCells.push({
                row: rows.length,
                column: index,
                type: cell.type
              });
              return Number(cell.value) / 100;
            }

            numericCells.push({
              row: rows.length,
              column: index,
              type: cell.type
            });
            return Number(cell.value);
          }

          return String(cell.value);
        });

        rows.push(rowValues);
      });

      rows.push([], ['Notes'], ...getNotes(template, windowData).map((note) => [note]));
      rows.push(
        [],
        [`Prepared by: ${(currentUser() && currentUser().name) || ''}`, 'Signature: ____________', 'Date: ____________'],
        ['Reviewed by (Treasurer)', 'Signature: ____________', 'Date: ____________'],
        ['Approved by (Manager / Chairperson)', 'Signature: ____________', 'Date: ____________']
      );

      const worksheet = XLSX.utils.aoa_to_sheet(rows);

      numericCells.forEach(({ row: rowIndex, column, type }) => {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
        const cell = worksheet[address];
        if (!cell || typeof cell.v !== 'number') return;

        cell.z = type === 'percent' || type === 'changePercent'
          ? '0.00%'
          : '#,##0;[Red](#,##0)';
      });

      worksheet['!cols'] = [
        { wch: 62 },
        ...output.headers.slice(1).map(() => ({ wch: 16 }))
      ];

      return worksheet;
    }

    function exportExcel(templates) {
      if (!XLSX || !XLSX.utils || typeof XLSX.writeFile !== 'function') {
        return showMessage('Excel library could not load — check your internet connection.', true);
      }

      const windowData = getWindow();
      if (!windowData.current.length) {
        return showMessage('No data for the selected period.', true);
      }

      const workbook = XLSX.utils.book_new();
      templates.forEach((template) => {
        XLSX.utils.book_append_sheet(workbook, worksheetFor(template, windowData), template.sheet);
      });

      const pack = templates.length > 1;
      const name = pack ? 'regulatory-pack' : templates[0].id;
      const filename = `elite-sacco-${name}-${reportState.mode}-${reportState.asAt}.xlsx`;

      XLSX.writeFile(workbook, filename);
      audit(
        'Regulatory return exported',
        `Exported ${pack ? 'full regulatory pack' : templates[0].name} to Excel (${reportState.asAt})`,
        currentUser()
      );
      save();
      showMessage('Excel export generated.');
    }

    function exportPDF(templates) {
      if (!jsPDF) {
        return showMessage('PDF library could not load — check your internet connection.', true);
      }

      const windowData = getWindow();
      if (!windowData.current.length) {
        return showMessage('No data for the selected period.', true);
      }

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      if (typeof pdf.autoTable !== 'function') {
        return showMessage('PDF table plugin could not load — check your internet connection.', true);
      }

      templates.forEach((template, templateIndex) => {
        if (templateIndex) pdf.addPage();

        const output = buildReturn(template, windowData);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        pdf.setFontSize(15);
        pdf.setTextColor(27, 60, 145);
        pdf.text('Elite SACCO Mbarara', 40, 38);

        pdf.setFontSize(11);
        pdf.setTextColor(0);
        pdf.text(safeText(`${template.name} — ${periodBasis(windowData)}`), 40, 56);

        pdf.setFontSize(8.5);
        pdf.text(safeText(`Regulator: ${state.rcfg.reg}    Registration/licence no.: ${state.rcfg.lic || '-'}`), 40, 72);
        pdf.text(
          safeText(`Months included: ${windowData.current.length} of ${windowData.requestedMonths}    Amounts in UGX    Generated ${formatDate(new Date())}`),
          40,
          84
        );

        const body = output.rows.map((item) => {
          if (item.heading) {
            return [{
              content: safeText(item.heading),
              colSpan: output.headers.length,
              styles: {
                fillColor: [233, 238, 251],
                textColor: [27, 60, 145],
                fontStyle: 'bold'
              }
            }];
          }

          return item.cells.map((cell) => safeText(formatCell(cell)));
        });

        pdf.autoTable({
          startY: 96,
          head: [output.headers.map(safeText)],
          body,
          styles: {
            fontSize: output.headers.length > 10 ? 6.5 : 8,
            cellPadding: 3
          },
          headStyles: { fillColor: [27, 60, 145] },
          columnStyles: Object.fromEntries(
            output.headers.map((_, index) => [
              index,
              { halign: index > 0 && index < output.headers.length - 2 ? 'right' : 'left' }
            ])
          ),
          didParseCell: (hook) => {
            if (hook.section !== 'body') return;

            const item = output.rows[hook.row.index];
            if (item && item.bold) hook.cell.styles.fontStyle = 'bold';

            if (item && item.status && hook.column.index === output.headers.length - 1) {
              hook.cell.styles.textColor = item.status === 'Breach'
                ? [214, 40, 40]
                : item.status === 'Compliant'
                  ? [10, 122, 59]
                  : [0, 0, 0];
            }
          },
          didDrawPage: () => {
            pdf.setFontSize(7);
            pdf.setTextColor(120);
            pdf.text(
              safeText(`Elite SACCO Mbarara — ${template.name} — ${periodBasis(windowData)} — Page ${pdf.internal.getNumberOfPages()}`),
              40,
              pageHeight - 18
            );
            pdf.setTextColor(0);
          }
        });

        let y = pdf.lastAutoTable.finalY + 14;
        pdf.setFontSize(7.5);
        pdf.setTextColor(0);

        const noteLines = getNotes(template, windowData)
          .flatMap((note) => pdf.splitTextToSize(safeText(`Note: ${note}`), pageWidth - 80));

        if (y + noteLines.length * 10 + 70 > pageHeight - 30) {
          pdf.addPage();
          y = 40;
        }

        noteLines.forEach((line) => {
          pdf.text(line, 40, y);
          y += 10;
        });

        y += 26;
        const signatureWidth = (pageWidth - 80) / 3;

        [
          `Prepared by: ${(currentUser() && currentUser().name) || ''}`,
          'Reviewed by (Treasurer)',
          'Approved by (Manager / Chairperson)'
        ].forEach((label, index) => {
          const x = 40 + index * signatureWidth;
          pdf.line(x, y, x + signatureWidth - 20, y);
          pdf.text(safeText(label), x, y + 10);
          pdf.text('Date: ____________', x, y + 22);
        });
      });

      const isPack = templates.length > 1;
      const filename = `elite-sacco-${isPack ? 'regulatory-pack' : templates[0].id}-${reportState.mode}-${reportState.asAt}.pdf`;

      pdf.save(filename);
      audit(
        'Regulatory return exported',
        `Exported ${isPack ? 'full regulatory pack' : templates[0].name} to PDF (${reportState.asAt})`,
        currentUser()
      );
      save();
      showMessage('PDF export generated.');
    }

    function printReport() {
      const template = selectedTemplate();
      audit('Regulatory return printed', `${template.name} (${reportState.asAt})`, currentUser());
      save();

      if (typeof options.print === 'function') {
        options.print();
      } else if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    }

    render();

    return {
      render,
      draw,
      snapshot,
      buildReturn,
      exportPDF,
      exportExcel,
      print: printReport,
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return {
    init,
    templates: TEMPLATES,
    defaultConfig: { ...DEFAULT_CONFIG, pr: DEFAULT_CONFIG.pr.slice() },
    balanceInputs: BALANCE_INPUTS,
    flowInputs: FLOW_INPUTS
  };
});
