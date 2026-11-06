(function (root, factory) {
  'use strict';

  const ExportHelpers = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = ExportHelpers;
  }

  if (root) {
    root.ExportHelpers = ExportHelpers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeRows(headers, rows) {
    if (!Array.isArray(headers)) {
      throw new TypeError('ExportHelpers: headers must be an array.');
    }

    if (!Array.isArray(rows)) {
      throw new TypeError('ExportHelpers: rows must be an array.');
    }

    return rows.map((row) => {
      const cells = Array.isArray(row) ? row : [row];
      return headers.map((_, index) => {
        const value = cells[index];
        return value == null ? '' : value;
      });
    });
  }

  function ensureExtension(filename, extension) {
    const name = String(filename || 'export').trim();
    const suffix = `.${extension}`;

    return name.toLowerCase().endsWith(suffix)
      ? name
      : `${name}${suffix}`;
  }

  function download(blob, filename) {
    if (typeof document === 'undefined' || !URL.createObjectURL) {
      throw new Error('ExportHelpers.download requires a browser.');
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function csvCell(value) {
    return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
  }

  /**
   * Download rows as a UTF-8 CSV file.
   */
  function exportCSV(headers, rows, filename) {
    const data = normalizeRows(headers, rows);
    const lines = [headers, ...data]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF', lines], {
      type: 'text/csv;charset=utf-8'
    });

    download(blob, ensureExtension(filename, 'csv'));
  }

  /**
   * Download rows as an Excel workbook.
   * Requires the SheetJS XLSX library.
   */
  function exportExcel(headers, rows, filename, sheetName) {
    const xlsx = typeof globalThis !== 'undefined' ? globalThis.XLSX : null;

    if (!xlsx || !xlsx.utils || typeof xlsx.writeFile !== 'function') {
      throw new Error('Excel export is unavailable: the XLSX library did not load.');
    }

    const data = normalizeRows(headers, rows);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet([headers, ...data]);

    worksheet['!cols'] = headers.map((heading) => ({
      wch: Math.max(12, Math.min(32, String(heading).length + 4))
    }));

    xlsx.utils.book_append_sheet(
      workbook,
      worksheet,
      String(sheetName || 'Report').slice(0, 31)
    );

    xlsx.writeFile(workbook, ensureExtension(filename, 'xlsx'));
  }

  /**
   * Download rows as a PDF table.
   * Requires jsPDF and the jsPDF-AutoTable plugin.
   *
   * options may include orientation, format, title, and autoTable options.
   */
  function exportPDF(headers, rows, filename, options) {
    options = options || {};

    const jsPDF = typeof globalThis !== 'undefined'
      ? globalThis.jspdf && globalThis.jspdf.jsPDF
      : null;

    if (!jsPDF) {
      throw new Error('PDF export is unavailable: the jsPDF library did not load.');
    }

    const data = normalizeRows(headers, rows);
    const pdf = new jsPDF({
      orientation: options.orientation || 'landscape',
      unit: options.unit || 'pt',
      format: options.format || 'a4'
    });

    if (typeof pdf.autoTable !== 'function') {
      throw new Error('PDF table export is unavailable: the AutoTable plugin did not load.');
    }

    if (options.title) {
      pdf.setFontSize(14);
      pdf.text(String(options.title), 40, 36);
    }

    pdf.autoTable({
      startY: options.title ? 52 : 40,
      head: [headers.map(String)],
      body: data.map((row) => row.map((cell) => String(cell))),
      styles: {
        fontSize: 8,
        cellPadding: 4
      },
      headStyles: {
        fillColor: [27, 60, 145]
      },
      ...(options.autoTable || {})
    });

    pdf.save(ensureExtension(filename, 'pdf'));
  }

  return {
    download,
    exportCSV,
    exportExcel,
    exportPDF
  };
});
