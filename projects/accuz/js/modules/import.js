/* Buku — Import from Excel screen: download the template, choose a workbook, check it, then import. */
(function () {
  'use strict';
  const Buku = window.Buku, ui = Buku.ui, h = Buku.util.h;
  const t = (k, v) => Buku.i18n.t(k, v);
  let state = { file: null, workbook: null, result: null };
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function sheetRows(r) {
    if (!r.key) return '<tr class="muted"><td>' + h(r.name) + '</td><td colspan="5">' + h(t('Not recognised — ignored')) + '</td></tr>';
    const status = r.errors.length ? '<span class="chip draft">' + h(t('{n} problems', { n: r.errors.length })) + '</span>' : '<span class="chip ok">' + h(t('Ready')) + '</span>';
    return '<tr><td><strong>' + h(r.name) + '</strong>' + (norm(r.label) !== norm(r.name) ? '<div class="sub">' + h(r.label) + '</div>' : '') + '</td><td class="num">' + r.rows + '</td><td class="num">' + (r.created + r.updated) +
      '</td><td class="num">' + r.skipped + '</td><td>' + status + '</td><td>' + (r.unknown.length ? '<span class="sub">' + h(t('Ignored columns: {c}', { c: r.unknown.join(', ') })) + '</span>' : '') + '</td></tr>';
  }

  function resultHtml(res, committed) {
    const errs = [];
    res.sheets.forEach((s) => s.errors.forEach((e) => errs.push('<li class="error"><strong>' + h(s.name) + ' · ' + h(t('row {n}', { n: e.row })) + '</strong> — ' + h(e.message) + '</li>')));
    const head = committed
      ? '<div class="banner info"><div><strong>' + h(t('Import finished.')) + '</strong> ' + h(t('Remember to save the company file (Ctrl+S).')) + '</div></div>'
      : res.ok ? '<div class="banner info"><div><strong>' + h(t('Everything checks out.')) + '</strong> ' + h(t('Nothing has been saved yet. Click Import to add the data in one step.')) + '</div>' +
          '<button class="btn primary" id="xl-commit">' + h(t('Import')) + '</button></div>'
        : '<div class="banner bad"><div><strong>' + h(t('{n} problems found. Nothing was imported.', { n: res.errors })) + '</strong> ' + h(t('Fix them in Excel, save, and choose the file again.')) + '</div></div>';
    return head +
      '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Sheet')) + '</th><th class="num">' + h(t('Rows')) + '</th><th class="num">' + h(committed ? t('Added') : t('Will add')) +
      '</th><th class="num">' + h(t('Already there (skipped)')) + '</th><th>' + h(t('Status')) + '</th><th></th></tr></thead><tbody>' + res.sheets.map(sheetRows).join('') + '</tbody></table></div>' +
      (errs.length ? '<h3 class="section-title">' + h(t('Problems')) + '</h3><ul class="issues">' + errs.slice(0, 300).join('') + '</ul>' + (errs.length > 300 ? '<p class="note">' + h(t('{n} more not shown.', { n: errs.length - 300 })) + '</p>' : '') : '');
  }

  function view() {
    const sheets = Buku.excelImport.SHEETS.map((s) => '<li><strong>' + h(s.id) + '</strong> — ' + h(t(s.desc)) + '</li>').join('');
    ui.page({
      title: t('Import from Excel'),
      actions: '<button class="btn" id="xl-template">' + h(t('Download template')) + '</button>',
      body:
        '<div class="card-form"><p>' + h(t('Bring data in from an Excel workbook. Each sheet is one table; the sheet name tells the app what it contains. Sheets with other names are ignored.')) + '</p>' +
        '<ul class="plain-columns">' + sheets + '</ul>' +
        '<p class="note">' + h(t('The file is checked first and nothing is saved until you confirm. Rows that already exist are skipped, so you can import the same file again after fixing it.')) + '</p>' +
        '<div class="button-row" style="margin-top:14px"><label class="btn primary">' + h(t('Choose Excel file…')) + '<input type="file" id="xl-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>' +
        ' <span id="xl-name" class="sub">' + h(state.file ? state.file : '') + '</span></div></div>' +
        '<div id="xl-result">' + (state.result ? resultHtml(state.result, state.result.committed) : '') + '</div>',
    });
    ui.$('#xl-template').addEventListener('click', () => {
      Buku.util.download(t('import-template') + '.xlsx', new Blob([Buku.excelImport.template()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    });
    ui.$('#xl-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        state = { file: f.name, workbook: await Buku.xlsx.read(await f.arrayBuffer()), result: null };
        check();
      } catch (err) { ui.showError(err); }
      e.target.value = '';
    });
    bindCommit();
  }

  function check() {
    state.result = Buku.excelImport.run(Buku.db, state.workbook, { commit: false, fileName: state.file });
    if (!state.result.sheets.some((s) => s.key)) {
      ui.$('#xl-result').innerHTML = '<div class="banner warn"><div>' + h(t('No sheet in this file has a name the app recognises. Use the template sheet names, e.g. Kontak, Invoice, Pembayaran.')) + '</div></div>';
      return;
    }
    ui.$('#xl-name').textContent = state.file;
    ui.$('#xl-result').innerHTML = resultHtml(state.result, false);
    bindCommit();
  }

  function bindCommit() {
    const b = ui.$('#xl-commit');
    if (!b) return;
    b.addEventListener('click', () => {
      try {
        const res = Buku.excelImport.run(Buku.db, state.workbook, { commit: true, fileName: state.file });
        state.result = res;
        ui.$('#xl-result').innerHTML = resultHtml(res, res.committed);
        if (res.committed) ui.toast(t('Imported {n} records', { n: res.sheets.reduce((s, x) => s + x.created + x.updated, 0) }));
        bindCommit();
      } catch (err) { ui.showError(err); }
    });
  }

  ui.route('/import', () => { if (state.result && state.result.committed) state = { file: null, workbook: null, result: null }; view(); });
})();
