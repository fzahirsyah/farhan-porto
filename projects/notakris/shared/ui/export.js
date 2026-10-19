/* NotaKris — export to CSV / Excel (SheetJS) / PDF (jsPDF + AutoTable). Libraries are bundled locally. */
(function () {
  const NK = (window.NK = window.NK || {});

  function fileName(name, ext) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + NK.fmt.today() + '.' + ext;
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  const office = () => { try { return NK.db.get('SELECT name,city FROM office WHERE id=1') || {}; } catch (e) { return {}; } };

  /* rows: array of arrays (raw values: numbers stay numbers) */
  function download(fmt, name, headers, rows, meta) {
    meta = meta || {};
    const title = meta.title || name; const off = office();
    const sub = (off.name || 'NotaKris') + ' · dibuat ' + NK.fmt.tgl(NK.fmt.today(), 'long');
    if (fmt === 'csv') {
      const q = (v) => { v = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      saveBlob(new Blob(['﻿' + [headers].concat(rows).map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName(name, 'csv'));
    } else if (fmt === 'xlsx') {
      if (!window.XLSX) return NK.ui.toast('Pustaka Excel tidak termuat', 'err');
      const ws = XLSX.utils.aoa_to_sheet([[title], [sub], [], headers].concat(rows));
      ws['!cols'] = headers.map((h, i) => ({ wch: Math.min(50, Math.max(10, String(h).length, ...rows.slice(0, 200).map((r) => String(r[i] === null || r[i] === undefined ? '' : r[i]).length)) + 2) }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, String(title).slice(0, 31).replace(/[\\/?*[\]:]/g, ''));
      XLSX.writeFile(wb, fileName(name, 'xlsx'));
    } else {
      if (!window.jspdf || !window.jspdf.jsPDF) return NK.ui.toast('Pustaka PDF tidak termuat', 'err');
      const p = (s) => String(s === null || s === undefined ? '' : s).replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, '->').replace(/✓/g, 'v').replace(/[^\x00-\xFF]/g, '');
      const doc = new window.jspdf.jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
      doc.setFontSize(14); doc.setTextColor(74, 44, 67); doc.text(p(title), 40, 42);
      doc.setFontSize(9); doc.setTextColor(110); doc.text(p(sub), 40, 58);
      const numCols = meta.numCols || [];
      const fmtCell = (v, i) => (typeof v === 'number' && numCols[i] ? v.toLocaleString('id-ID') : v);
      doc.autoTable({ head: [headers.map(p)], body: rows.map((r) => r.map((v, i) => p(fmtCell(v, i)))), startY: 72, styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [74, 44, 67] }, alternateRowStyles: { fillColor: [250, 248, 245] }, margin: { left: 40, right: 40 },
        columnStyles: Object.fromEntries(numCols.map((n, i) => [i, n ? { halign: 'right' } : {}])),
        didDrawPage: (d) => { doc.setFontSize(8); doc.setTextColor(150); doc.text('NotaKris · halaman ' + doc.internal.getNumberOfPages(), d.settings.margin.left, doc.internal.pageSize.height - 18); } });
      doc.save(fileName(name, 'pdf'));
    }
    NK.ui.toast(title + ' diunduh (' + fmt.toUpperCase() + ')', 'ok');
  }

  NK.exp = { download, saveBlob, fileName };
})();
