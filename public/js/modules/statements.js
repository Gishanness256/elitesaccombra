(function (root, factory) {
  'use strict';

  const StatementsModule = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = StatementsModule;
  }

  if (root) {
    root.StatementsModule = StatementsModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLORS = {
    deposits: '#1B3C91',
    loans: '#E07A1F',
    repayments: '#2E9E5B'
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

  function localDate(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 10);
  }

  function formatAmount(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function formatCurrency(value) {
    return `UGX ${formatAmount(value)}`;
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
      throw new Error('StatementsModule.init requires a document, view container, and application state.');
    }

    state.members = Array.isArray(state.members) ? state.members : [];
    state.savings = Array.isArray(state.savings) ? state.savings : [];
    state.loans = Array.isArray(state.loans) ? state.loans : [];

    const save = typeof options.save === 'function' ? options.save : function () {};
    const audit = typeof options.audit === 'function' ? options.audit : function () {};
    const notify = typeof options.notify === 'function' ? options.notify : function () {};
    const calculateBalance = typeof options.loanBalance === 'function'
      ? options.loanBalance
      : (loan) => Number(loan.amt || 0) * (1 + Number(loan.rate || 0) / 100);

    let generatedRows = [];
    let currentReport = null;

    function showMessage(text, isError) {
      const message = container.querySelector('#msg');
      if (message) {
        message.className = 'msg' + (isError ? ' err' : '');
        message.textContent = text || '';
      } else if (text) {
        notify(text, Boolean(isError));
      }
    }

    function buildReport(days) {
      const periodDays = Number(days);
      const bucketCount = periodDays === 7 ? 7 : periodDays === 30 ? 6 : 12;
      const end = new Date();
      const start = new Date(end.getTime() - periodDays * 86400000);
      const span = periodDays / bucketCount;
      const periodName = periodDays === 7
        ? 'Weekly'
        : periodDays === 30
          ? 'Monthly'
          : 'Annual';

      const inRange = (value) => {
        const date = new Date(value);
        return !Number.isNaN(date.getTime()) && date > start && date <= end;
      };

      const buckets = Array.from({ length: bucketCount }, (_, index) => {
        const labelDate = new Date(start.getTime() + index * span * 86400000);
        const label = localDate(labelDate);
        return {
          label: periodDays === 365 ? label.slice(2) : label.slice(5),
          deposits: 0,
          loans: 0,
          repayments: 0
        };
      });

      const bucketIndex = (value) => Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((new Date(value) - start) / 86400000 / span))
      );

      state.savings
        .filter((transaction) => inRange(transaction.date) && !transaction.w)
        .forEach((transaction) => {
          buckets[bucketIndex(transaction.date)].deposits += Number(transaction.amt) || 0;
        });

      state.loans.forEach((loan) => {
        if (inRange(loan.date)) {
          buckets[bucketIndex(loan.date)].loans += Number(loan.amt) || 0;
        }

        (loan.reps || []).forEach((repayment) => {
          if (inRange(repayment.date)) {
            buckets[bucketIndex(repayment.date)].repayments += Number(repayment.amt) || 0;
          }
        });
      });

      const totals = buckets.reduce((sum, bucket) => {
        sum.deposits += bucket.deposits;
        sum.loans += bucket.loans;
        sum.repayments += bucket.repayments;
        return sum;
      }, { deposits: 0, loans: 0, repayments: 0 });

      const savingsBalance = state.savings.reduce(
        (sum, transaction) => sum + (transaction.w ? -1 : 1) * (Number(transaction.amt) || 0),
        0
      );

      const loansOutstanding = state.loans.reduce(
        (sum, loan) => sum + (
          typeof calculateBalance(loan) === 'number'
            ? calculateBalance(loan)
            : Number(calculateBalance(loan).b) || 0
        ),
        0
      );

      const rows = [
        ['Period', `${periodName} ${localDate(start)} to ${localDate(end)}`],
        ['Deposits received', Math.round(totals.deposits)],
        ['Loans disbursed', Math.round(totals.loans)],
        ['Repayments received', Math.round(totals.repayments)],
        ['Total savings balance', Math.round(savingsBalance)],
        ['Loans outstanding', Math.round(loansOutstanding)],
        ['Registered members', state.members.length]
      ];

      return {
        days: periodDays,
        name: periodName,
        start,
        end,
        buckets,
        totals,
        savingsBalance,
        loansOutstanding,
        rows
      };
    }

    function chartBars(report) {
      const width = 520;
      const height = 200;
      const barWidth = width / report.buckets.length;
      const maximum = Math.max(
        1,
        ...report.buckets.flatMap((bucket) => [
          bucket.deposits,
          bucket.loans,
          bucket.repayments
        ])
      );

      const bars = report.buckets.map((bucket, index) => {
        const values = [
          ['deposits', COLORS.deposits],
          ['loans', COLORS.loans],
          ['repayments', COLORS.repayments]
        ];

        return values.map(([key, color], seriesIndex) => {
          const value = bucket[key];
          const groupWidth = barWidth - 8;
          const itemWidth = groupWidth / values.length;
          const x = index * barWidth + 4 + seriesIndex * itemWidth;
          const barHeight = value / maximum * (height - 24);
          const y = height - barHeight;

          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}"
            width="${Math.max(1, itemWidth - 2).toFixed(1)}"
            height="${barHeight.toFixed(1)}" fill="${color}">
            <title>${escapeHTML(bucket.label)}: ${key} UGX ${formatAmount(value)}</title>
          </rect>`;
        }).join('');
      }).join('');

      const labels = report.buckets.map((bucket, index) => {
        const x = index * barWidth + barWidth / 2;
        return `<text x="${x.toFixed(1)}" y="${height + 16}" text-anchor="middle" font-size="10">${escapeHTML(bucket.label)}</text>`;
      }).join('');

      return `<svg viewBox="0 0 ${width} ${height + 22}" width="100%" role="img" aria-label="Deposits, loans and repayments by period">
        ${bars}${labels}
      </svg>`;
    }

    function chartDonut(report) {
      const values = [
        { label: 'Deposits', value: report.totals.deposits, color: COLORS.deposits },
        { label: 'Loans disbursed', value: report.totals.loans, color: COLORS.loans },
        { label: 'Repayments', value: report.totals.repayments, color: COLORS.repayments }
      ];

      const total = values.reduce((sum, item) => sum + item.value, 0);
      if (!total) {
        return '<p class="note">No activity to show for this period.</p>';
      }

      const circumference = 251.3;
      let offset = 0;

      const circles = values.map((item) => {
        const length = item.value / total * circumference;
        const circle = `<circle r="40" cx="60" cy="60" fill="none"
          stroke="${item.color}" stroke-width="16"
          stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}"
          transform="rotate(-90 60 60)">
          <title>${item.label}: UGX ${formatAmount(item.value)}</title>
        </circle>`;
        offset += length;
        return circle;
      }).join('');

      return `<svg viewBox="0 0 120 120" width="160" role="img" aria-label="Activity breakdown">
        ${circles}
        <text x="60" y="58" text-anchor="middle" font-size="9">Total activity</text>
        <text x="60" y="72" text-anchor="middle" font-size="10">${escapeHTML(formatAmount(total))}</text>
      </svg>`;
    }

    function render() {
      container.innerHTML = `
        <div class="card noprint">
          <h3>Generate report</h3>
          <div class="row">
            <div>
              <label for="rp">Period</label>
              <select id="rp">
                <option value="7">Weekly (last 7 days)</option>
                <option value="30">Monthly (last 30 days)</option>
                <option value="365">Annual (last 365 days)</option>
              </select>
            </div>
          </div>
          <button class="btn" id="rg" type="button">Generate report</button>
          <button class="btn alt2" id="rpf" type="button">Print report</button>
          <button class="btn alt2" id="rx" type="button">Export CSV</button>
          <div id="msg" class="msg" role="status" aria-live="polite"></div>
        </div>
        <div id="rep"></div>`;

      container.querySelector('#rg').addEventListener('click', generate);
      container.querySelector('#rpf').addEventListener('click', printReport);
      container.querySelector('#rx').addEventListener('click', exportCSV);

      generate();
    }

    function generate() {
      const periodDays = Number(container.querySelector('#rp').value);
      currentReport = buildReport(periodDays);
      generatedRows = currentReport.rows;

      const report = currentReport;
      const periodLabel = `${report.name} ${localDate(report.start)} to ${localDate(report.end)}`;
      const buckets = report.buckets;

      container.querySelector('#rep').innerHTML = `
        <div class="card">
          <h2 style="font-size:1.4rem">Elite SACCO Mbarara — ${escapeHTML(report.name)} Financial Report</h2>
          <p>Period: ${escapeHTML(periodLabel)}</p>

          <div class="kpis">
            <div class="kpi">Deposits received<b>${formatCurrency(report.totals.deposits)}</b></div>
            <div class="kpi">Loans disbursed<b>${formatCurrency(report.totals.loans)}</b></div>
            <div class="kpi">Repayments received<b>${formatCurrency(report.totals.repayments)}</b></div>
            <div class="kpi">Loans outstanding<b>${formatCurrency(report.loansOutstanding)}</b></div>
          </div>

          <h3>Statement</h3>
          <p>
            During this ${escapeHTML(report.name.toLowerCase())} period, Elite SACCO received
            <b>${formatCurrency(report.totals.deposits)}</b> in member deposits and disbursed
            <b>${formatCurrency(report.totals.loans)}</b> in approved loans, while
            <b>${formatCurrency(report.totals.repayments)}</b> in repayments were received.
            The current savings balance is <b>${formatCurrency(report.savingsBalance)}</b>,
            with <b>${formatCurrency(report.loansOutstanding)}</b> in loans outstanding.
          </p>

          <div class="charts">
            <div>
              <h3>Activity trend</h3>
              ${chartBars(report)}
              <div class="lg">
                <span><b style="background:${COLORS.deposits}"></b>Deposits</span>
                <span><b style="background:${COLORS.loans}"></b>Loans disbursed</span>
                <span><b style="background:${COLORS.repayments}"></b>Repayments</span>
              </div>
            </div>
            <div>
              <h3>Activity breakdown</h3>
              ${chartDonut(report)}
              <div class="lg">
                <span><b style="background:${COLORS.deposits}"></b>Deposits</span>
                <span><b style="background:${COLORS.loans}"></b>Loans</span>
                <span><b style="background:${COLORS.repayments}"></b>Repayments</span>
              </div>
            </div>
          </div>

          <h3>Breakdown</h3>
          ${table(
            ['Interval', 'Deposits', 'Loans', 'Repayments'],
            buckets.map((bucket) => [
              escapeHTML(bucket.label),
              formatAmount(bucket.deposits),
              formatAmount(bucket.loans),
              formatAmount(bucket.repayments)
            ]),
            [1, 2, 3]
          )}
        </div>`;

      showMessage('');
      audit('Report generated', container.querySelector('#rp').selectedOptions[0].text);
      save();
    }

    function table(headers, rows, numericColumns) {
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

    function exportCSV() {
      if (!currentReport) return;

      const rows = [
        ...generatedRows,
        [],
        ['Interval', 'Deposits', 'Loans', 'Repayments'],
        ...currentReport.buckets.map((bucket) => [
          bucket.label,
          Math.round(bucket.deposits),
          Math.round(bucket.loans),
          Math.round(bucket.repayments)
        ])
      ];

      const csv = rows
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n');

      download(
        new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
        `elite-sacco-${currentReport.name.toLowerCase()}-report-${localDate(currentReport.end)}.csv`,
        doc
      );

      audit('Report exported', 'Exported report to CSV');
      save();
      showMessage('Report exported to CSV.');
    }

    function printReport() {
      if (!currentReport) return;

      audit('Report printed', container.querySelector('#rp').selectedOptions[0].text + ' report');
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
      generate,
      exportCSV,
      print: printReport,
      getReport() {
        return currentReport;
      },
      destroy() {
        container.replaceChildren();
      }
    };
  }

  return { init };
});
