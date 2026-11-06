(function (root, factory) {
  'use strict';

  const Tables = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = Tables;
  }

  if (root) {
    root.Tables = Tables;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Render a table as an HTML string.
   *
   * Cell values are treated as HTML to support existing dashboard content
   * such as badges, checkboxes, and action buttons. Escape untrusted values
   * before passing them to this function.
   *
   * @param {Array<string>} headers Column headings.
   * @param {Array<Array<*>>} rows Table rows.
   * @param {Array<number>} numericColumns Column indexes to right-align.
   * @param {Object} options Optional caption, className, and emptyText.
   * @returns {string} HTML for a horizontally scrollable table.
   */
  function render(headers, rows, numericColumns, options) {
    if (!Array.isArray(headers)) {
      throw new TypeError('Tables.render: headers must be an array.');
    }

    if (!Array.isArray(rows)) {
      throw new TypeError('Tables.render: rows must be an array.');
    }

    numericColumns = Array.isArray(numericColumns) ? numericColumns : [];
    options = options || {};

    const className = options.className
      ? ` class="${escapeAttribute(options.className)}"`
      : '';

    const caption = options.caption
      ? `<caption>${String(options.caption)}</caption>`
      : '';

    const headerHTML = headers
      .map((heading, index) => {
        const numericClass = numericColumns.includes(index) ? ' class="n"' : '';
        return `<th scope="col"${numericClass}>${heading == null ? '' : heading}</th>`;
      })
      .join('');

    const bodyHTML = rows.length
      ? rows
          .map((row) => {
            const cells = Array.isArray(row) ? row : [row];

            return `<tr>${headers
              .map((_, index) => {
                const numericClass = numericColumns.includes(index) ? ' class="n"' : '';
                const value = cells[index] == null ? '' : cells[index];
                return `<td${numericClass}>${value}</td>`;
              })
              .join('')}</tr>`;
          })
          .join('')
      : `<tr><td colspan="${Math.max(headers.length, 1)}">${options.emptyText || 'No records to display.'}</td></tr>`;

    return `<div class="tw"><table${className}>${caption}<thead><tr>${headerHTML}</tr></thead><tbody>${bodyHTML}</tbody></table></div>`;
  }

  /**
   * Render a table into a DOM element.
   *
   * @param {Element|string} target Element or CSS selector.
   * @param {Array<string>} headers Column headings.
   * @param {Array<Array<*>>} rows Table rows.
   * @param {Array<number>} numericColumns Column indexes to right-align.
   * @param {Object} options Render options.
   * @returns {Element} The target element.
   */
  function mount(target, headers, rows, numericColumns, options) {
    if (typeof document === 'undefined') {
      throw new Error('Tables.mount: a browser document is required.');
    }

    const element = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!element || typeof element.innerHTML !== 'string') {
      throw new TypeError('Tables.mount: target must be an element or a valid selector.');
    }

    element.innerHTML = render(headers, rows, numericColumns, options);
    return element;
  }

  /**
   * Escape text for safe insertion into HTML.
   *
   * @param {*} value Value to escape.
   * @returns {string} Escaped text.
   */
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function escapeAttribute(value) {
    return escapeHTML(value);
  }

  return {
    render,
    mount,
    escapeHTML
  };
});
