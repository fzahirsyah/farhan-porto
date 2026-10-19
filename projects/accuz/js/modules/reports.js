/* Buku — reports: profit & loss, balance sheet, trial balance, journal report, general ledger.
   Every figure links to the ledger lines behind it. Print and CSV on every report. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const L = () => Buku.i18n;
  const U = Buku.util;

  // ---------- Shared bits ----------
  function fy() {
    return Buku.db.scalar('SELECT fiscal_year_start_month FROM company WHERE id=1') || 1;
  }

  function presets() {
    const today = U.today();
    const fys = U.fiscalYearStart(today, fy());
    const lastFys = U.fiscalYearStart(U.addDays(fys, -1), fy());
    const qStart = U.monthStart(today, -((Number(today.slice(5, 7)) - 1) % 3));
    return [
      ['this_month', t('This month'), U.monthStart(today), U.monthEnd(today)],
      ['last_month', t('Last month'), U.monthStart(today, -1), U.monthEnd(U.monthStart(today, -1))],
      ['this_quarter', t('This quarter'), qStart, U.monthEnd(U.monthStart(qStart, 2))],
      ['this_year', t('This financial year'), fys, U.addDays(U.monthStart(fys, 12), -1)],
      ['last_year', t('Last financial year'), lastFys, U.addDays(fys, -1)],
      ['ytd', t('Year to date'), fys, today],
    ];
  }

  function periodBar(q, opts) {
    opts = opts || {};
    const ps = presets();
    const preset = ps.find((p) => p[2] === q.from && p[3] === q.to);
    return '<form class="filters report-filters" id="rf">' +
      (opts.asOf
        ? ui.field(t('As of'), ui.input('asof', q.asof, { type: 'date' }))
        : ui.field(t('Period'), ui.select('preset', ps.map((p) => ({ value: p[0], label: p[1] })).concat([{ value: 'custom', label: t('Custom') }]), preset ? preset[0] : 'custom')) +
          ui.field(t('From'), ui.input('from', q.from, { type: 'date' })) + ui.field(t('To'), ui.input('to', q.to, { type: 'date' }))) +
      (opts.extra || '') +
      '<button class="btn" type="submit">' + h(t('Show')) + '</button></form>';
  }

  function bindPeriodBar(path, extraKeys) {
    const f = ui.$('#rf');
    if (!f) return;
    const ps = presets();
    const preset = f.querySelector('[name=preset]');
    if (preset) preset.addEventListener('change', () => {
      const p = ps.find((x) => x[0] === preset.value);
      if (p) { f.querySelector('[name=from]').value = p[2]; f.querySelector('[name=to]').value = p[3]; f.requestSubmit(); }
    });
    ['from', 'to'].forEach((n) => { const el = f.querySelector('[name=' + n + ']'); if (el && preset) el.addEventListener('change', () => { preset.value = 'custom'; }); });
    f.querySelectorAll('select:not([name=preset]), input[type=checkbox]').forEach((el) => el.addEventListener('change', () => f.requestSubmit()));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = ui.formData(f);
      delete v.preset;
      Object.keys(v).forEach((k) => { if (v[k] === true) v[k] = '1'; if (v[k] === false) v[k] = ''; });
      location.hash = path + ui.qs(v);
    });
  }

  function printHead(title, period) {
    const c = Buku.db.get('SELECT name, npwp FROM company WHERE id=1');
    return '<div class="report-head"><div class="rh-company">' + h(c.name) + '</div><h2 class="rh-title">' + h(title) + '</h2><div class="rh-period">' + h(period) + '</div></div>';
  }

  function reportActions() {
    return '<button type="button" class="btn ghost" id="csv">' + h(t('Export CSV')) + '</button><button type="button" class="btn ghost" id="print">' + h(t('Print / PDF')) + '</button>';
  }

  function bindActions(csvName, csvRows) {
    ui.$('#print').addEventListener('click', () => window.print());
    ui.$('#csv').addEventListener('click', () => Buku.util.download(csvName + '.csv', Buku.util.toCsv(csvRows()), 'text/csv;charset=utf-8'));
    ui.$$('#main [data-href]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.hash = el.dataset.href;
    }));
  }

  const range = (from, to) => (from ? ui.date(from) : '…') + ' – ' + ui.date(to);
  const ledgerHref = (accId, from, to) => '#/ledger' + ui.qs({ account: accId, from, to });

  // ---------- Profit & loss ----------
  const SECTION_TITLE = { pl_revenue: 'Revenue', pl_cogs: 'Cost of revenue', pl_opex: 'Operating expenses', pl_other: 'Other income & expenses', pl_tax: 'Income tax' };
  const SUBTOTAL_TITLE = { gross_profit: 'Gross profit', operating_profit: 'Operating profit', profit_before_tax: 'Profit before tax', net_profit: 'Net profit' };

  function plColumns(q) {
    const from = q.from, to = q.to;
    if (q.compare === 'monthly') {
      const cols = [];
      let m = U.monthStart(from);
      while (m <= to && cols.length < 12) {
        const end = U.monthEnd(m) > to ? to : U.monthEnd(m);
        cols.push({ from: m < from ? from : m, to: end, label: L().formatDate(m, 'month') });
        m = U.monthStart(m, 1);
      }
      cols.push({ from, to, label: t('Total') });
      return cols;
    }
    const cols = [{ from, to, label: range(from, to) }];
    if (q.compare === 'prev') {
      const days = Math.round((new Date(to) - new Date(from)) / 86400000);
      const pto = U.addDays(from, -1);
      // Whole-month periods compare with the same number of whole months.
      if (from === U.monthStart(from) && to === U.monthEnd(to)) {
        const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
        cols.push({ from: U.monthStart(from, -months), to: pto, label: range(U.monthStart(from, -months), pto) });
      } else cols.push({ from: U.addDays(pto, -days), to: pto, label: range(U.addDays(pto, -days), pto) });
    }
    if (q.compare === 'prev_year') {
      const sh = (d) => (Number(d.slice(0, 4)) - 1) + d.slice(4);
      const fixEnd = (d) => (U.isIsoDate(sh(d)) ? sh(d) : U.addDays(sh(d.slice(0, 8) + '01'), 27));
      cols.push({ from: sh(from), to: fixEnd(to), label: range(sh(from), fixEnd(to)) });
    }
    return cols;
  }

  function profitLoss(params, q) {
    const ps = presets();
    if (!q.from || !q.to) { const p = ps.find((x) => x[0] === 'ytd'); q.from = q.from || p[2]; q.to = q.to || p[3]; }
    const cols = plColumns(q);
    const r = Buku.ledger.profitLoss(Buku.db, cols, { showZero: q.zero === '1' });
    const multi = cols.length > 1;
    const head = '<tr><th></th>' + cols.map((c) => '<th class="num">' + h(multi ? c.label : t('Amount (IDR)')) + '</th>').join('') + '</tr>';
    let body = '';
    for (const b of r.blocks) {
      if (b.type === 'section') {
        body += '<tbody class="pl-section">';
        for (const row of b.rows) {
          const a = row.account;
          const isTop = row.account.id === b.top.id;
          if (isTop) {
            body += '<tr class="sec-title"><th colspan="' + (cols.length + 1) + '">' + h(L().accName(a) || t(SECTION_TITLE[b.section])) + '</th></tr>';
            continue;
          }
          body += '<tr class="' + (row.is_header ? 'is-header' : 'link') + '"' + (row.is_header ? '' : ' data-href="' + ledgerHref(a.id, cols[0].from, cols[0].to) + '"') + '>' +
            '<td><span class="indent" style="--d:' + (row.depth - 1) + '"></span><span class="mono acc-code">' + h(a.code) + '</span> ' + h(L().accName(a)) + '</td>' +
            row.display.map((v, i) => '<td class="num">' + (row.is_header ? '' : '<a href="' + ledgerHref(a.id, cols[i].from, cols[i].to) + '">') + h(ui.amt(v)) + (row.is_header ? '' : '</a>') + '</td>').join('') + '</tr>';
        }
        body += '<tr class="sec-total"><td>' + h(t('Total {name}', { name: L().accName(b.top).toLowerCase() })) + '</td>' + b.total.map((v) => '<td class="num">' + h(ui.amt(v)) + '</td>').join('') + '</tr></tbody>';
      } else {
        body += '<tbody><tr class="subtotal' + (b.final ? ' final' : '') + '"><th>' + h(t(SUBTOTAL_TITLE[b.key])) + '</th>' + b.values.map((v) => '<td class="num">' + h(ui.amt(v)) + '</td>').join('') + '</tr></tbody>';
      }
    }
    const compareSel = ui.field(t('Compare'), ui.select('compare', [
      { value: '', label: t('No comparison') }, { value: 'prev', label: t('Previous period') }, { value: 'prev_year', label: t('Same period last year') }, { value: 'monthly', label: t('Month by month') },
    ], q.compare || ''));
    const zero = '<label class="check"><input type="checkbox" name="zero"' + (q.zero === '1' ? ' checked' : '') + '> ' + h(t('Show zero rows')) + '</label>';
    ui.page({
      title: t('Profit & loss'),
      actions: reportActions(),
      cls: 'report' + (cols.length > 4 ? ' wide-report' : ''),
      body: periodBar(q, { extra: compareSel + zero }) +
        '<div class="report-sheet">' + printHead(t('Profit & loss'), range(q.from, q.to)) +
        '<div class="table-wrap"><table class="data report-table"><thead>' + head + '</thead>' + body + '</table></div></div>',
    });
    bindPeriodBar('#/reports/pl');
    bindActions('laba-rugi-' + q.from + '-' + q.to, () => {
      const rows = [[t('Account')].concat(cols.map((c) => c.label))];
      for (const b of r.blocks) {
        if (b.type === 'section') {
          for (const row of b.rows) rows.push([(row.account.id === b.top.id ? '' : row.account.code + ' ') + L().accName(row.account)].concat(row.account.id === b.top.id ? cols.map(() => '') : row.display));
          rows.push([t('Total {name}', { name: L().accName(b.top).toLowerCase() })].concat(b.total));
        } else rows.push([t(SUBTOTAL_TITLE[b.key])].concat(b.values));
      }
      return rows;
    });
  }

  // ---------- Balance sheet ----------
  function balanceSheet(params, q) {
    q.asof = q.asof || U.today();
    const dates = [q.asof];
    if (q.compare === 'prev_month') dates.push(U.monthEnd(U.monthStart(q.asof, -1)));
    if (q.compare === 'prev_year') dates.push(U.addDays(U.fiscalYearStart(q.asof, fy()), -1));
    const r = Buku.ledger.balanceSheet(Buku.db, dates, { showZero: q.zero === '1' });
    const n = dates.length;
    const head = '<tr><th></th>' + dates.map((d) => '<th class="num">' + h(ui.date(d)) + '</th>').join('') + '</tr>';
    const fyStart = (d) => U.fiscalYearStart(d, fy());

    const groupHtml = (groups) => groups.map((g) =>
      '<tbody>' + g.rows.map((row) => {
        const a = row.account;
        if (a.id === g.top.id) return '<tr class="sec-title"><th colspan="' + (n + 1) + '">' + h(L().accName(a)) + '</th></tr>';
        return '<tr class="' + (row.is_header ? 'is-header' : 'link') + '"' + (row.is_header ? '' : ' data-href="' + ledgerHref(a.id, null, dates[0]) + '"') + '><td><span class="indent" style="--d:' + (row.depth - 1) + '"></span>' +
          (row.is_header ? '' : '<span class="mono acc-code">' + h(a.code) + '</span> ') + h(L().accName(a)) + '</td>' +
          row.values.map((v, i) => '<td class="num">' + (row.is_header ? h(ui.amt(v)) : '<a href="' + ledgerHref(a.id, null, dates[i]) + '">' + h(ui.amt(v)) + '</a>') + '</td>').join('') + '</tr>';
      }).join('') + '</tbody>').join('');

    const totalRow = (label, values, cls) => '<tbody><tr class="' + (cls || 'sec-total') + '"><th>' + h(label) + '</th>' + values.map((v) => '<td class="num">' + h(ui.amt(v)) + '</td>').join('') + '</tr></tbody>';
    const earningsRows =
      '<tbody><tr class="link" data-href="#/reports/pl' + ui.qs({ from: fyStart(dates[0]), to: dates[0] }) + '"><td><span class="indent" style="--d:0"></span>' + h(t('Current year profit')) + '</td>' + r.currentProfit.map((v, i) => '<td class="num"><a href="#/reports/pl' + ui.qs({ from: fyStart(dates[i]), to: dates[i] }) + '">' + h(ui.amt(v)) + '</a></td>').join('') + '</tr>' +
      (r.priorProfit.some((v) => v) ? '<tr><td><span class="indent" style="--d:0"></span>' + h(t('Prior years profit (not yet closed)')) + '</td>' + r.priorProfit.map((v) => '<td class="num">' + h(ui.amt(v)) + '</td>').join('') + '</tr>' : '') + '</tbody>';
    const balanced = r.difference.every((v) => v === 0);
    const compareSel = ui.field(t('Compare'), ui.select('compare', [{ value: '', label: t('No comparison') }, { value: 'prev_month', label: t('End of previous month') }, { value: 'prev_year', label: t('End of last financial year') }], q.compare || ''));
    const zero = '<label class="check"><input type="checkbox" name="zero"' + (q.zero === '1' ? ' checked' : '') + '> ' + h(t('Show zero rows')) + '</label>';

    ui.page({
      title: t('Balance sheet'),
      actions: reportActions(),
      cls: 'report',
      body: periodBar(q, { asOf: true, extra: compareSel + zero }) +
        (balanced ? '' : '<div class="banner bad">' + h(t('Assets do not equal liabilities plus equity. Run the data check in Data & backup.')) + '</div>') +
        '<div class="report-sheet">' + printHead(t('Balance sheet'), t('As of {date}', { date: ui.date(q.asof) })) +
        '<div class="table-wrap"><table class="data report-table"><thead>' + head + '</thead>' +
        groupHtml(r.assets) + totalRow(t('Total assets'), r.totalAssets, 'subtotal') +
        groupHtml(r.liabilities) + totalRow(t('Total liabilities'), r.totalLiabilities) +
        groupHtml(r.equity) + earningsRows + totalRow(t('Total equity'), r.totalEquity) +
        totalRow(t('Total liabilities and equity'), r.totalLE, 'subtotal final') +
        '</table></div>' +
        '<p class="check-line ' + (balanced ? 'ok' : 'bad') + '">' + h(balanced ? t('Balanced: assets equal liabilities plus equity.') : t('Difference: {amount}', { amount: ui.idr(r.difference[0]) })) + '</p></div>',
    });
    bindPeriodBar('#/reports/bs');
    bindActions('neraca-' + q.asof, () => {
      const rows = [[t('Account')].concat(dates)];
      const add = (groups) => groups.forEach((g) => g.rows.forEach((row) => rows.push([(row.is_header ? '' : row.account.code + ' ') + L().accName(row.account)].concat(row.values))));
      add(r.assets); rows.push([t('Total assets')].concat(r.totalAssets));
      add(r.liabilities); rows.push([t('Total liabilities')].concat(r.totalLiabilities));
      add(r.equity); rows.push([t('Current year profit')].concat(r.currentProfit)); rows.push([t('Prior years profit (not yet closed)')].concat(r.priorProfit));
      rows.push([t('Total equity')].concat(r.totalEquity)); rows.push([t('Total liabilities and equity')].concat(r.totalLE));
      return rows;
    });
  }

  // ---------- Trial balance ----------
  function trialBalance(params, q) {
    q.asof = q.asof || U.today();
    const r = Buku.ledger.trialBalance(Buku.db, q.asof, { showZero: q.zero === '1' });
    const zero = '<label class="check"><input type="checkbox" name="zero"' + (q.zero === '1' ? ' checked' : '') + '> ' + h(t('Show zero rows')) + '</label>';
    ui.page({
      title: t('Trial balance'),
      actions: reportActions(),
      cls: 'report',
      body: periodBar(q, { asOf: true, extra: zero }) +
        '<div class="report-sheet">' + printHead(t('Trial balance'), t('As of {date}', { date: ui.date(q.asof) })) +
        (r.rows.length ? '<div class="table-wrap"><table class="data report-table"><thead><tr><th>' + h(t('Account')) + '</th><th class="num">' + h(t('Debit')) + '</th><th class="num">' + h(t('Credit')) + '</th></tr></thead><tbody>' +
          r.rows.map((x) => '<tr class="link" data-href="' + ledgerHref(x.account.id, null, q.asof) + '"><td><span class="mono acc-code">' + h(x.account.code) + '</span> ' + h(L().accName(x.account)) + '</td><td class="num">' + h(x.debit ? ui.idr(x.debit) : '') + '</td><td class="num">' + h(x.credit ? ui.idr(x.credit) : '') + '</td></tr>').join('') +
          '</tbody><tfoot><tr class="subtotal final"><th>' + h(t('Total')) + '</th><td class="num">' + h(ui.idr(r.totalDebit)) + '</td><td class="num">' + h(ui.idr(r.totalCredit)) + '</td></tr></tfoot></table></div>' +
          '<p class="check-line ' + (r.balanced ? 'ok' : 'bad') + '">' + h(r.balanced ? t('Debits equal credits.') : t('Out of balance by {amount}.', { amount: ui.idr(r.totalDebit - r.totalCredit) })) + '</p>'
          : ui.empty(t('Nothing posted up to this date.'))) + '</div>',
    });
    bindPeriodBar('#/reports/tb');
    bindActions('neraca-saldo-' + q.asof, () => [[t('Code'), t('Account'), t('Debit'), t('Credit')]].concat(r.rows.map((x) => [x.account.code, L().accName(x.account), x.debit, x.credit])).concat([['', t('Total'), r.totalDebit, r.totalCredit]]));
  }

  // ---------- Journal report ----------
  function journalReport(params, q) {
    if (!q.from || !q.to) { q.from = U.monthStart(U.today()); q.to = U.monthEnd(U.today()); }
    const r = Buku.ledger.journalReport(Buku.db, q.from, q.to);
    const base = Buku.fx.base(Buku.db);
    ui.page({
      title: t('Journal report'),
      actions: reportActions(),
      cls: 'report',
      body: periodBar(q) + '<div class="report-sheet">' + printHead(t('Journal report'), range(q.from, q.to)) +
        (r.entries.length ? '<div class="table-wrap"><table class="data report-table journal-report"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(t('Account')) + '</th><th class="num">' + h(t('Debit')) + '</th><th class="num">' + h(t('Credit')) + '</th></tr></thead>' +
          r.entries.map((e) => '<tbody class="je"><tr class="je-head link" data-href="#/journal/' + e.id + '"><td class="nowrap">' + h(ui.date(e.date)) + '</td><td class="mono nowrap"><a href="#/journal/' + e.id + '">' + h(e.number) + '</a></td><td colspan="3">' + h(e.memo || '') + (e.reference ? ' <span class="muted">· ' + h(e.reference) + '</span>' : '') + '</td></tr>' +
            e.lines.map((l) => '<tr><td></td><td></td><td class="' + (l.credit_base ? 'credit-acc' : '') + '"><span class="mono acc-code">' + h(l.account_code) + '</span> ' + h(l.account_name) + (l.currency !== base ? ' <span class="muted">(' + h(ui.money(l.debit || l.credit, l.currency)) + ')</span>' : '') + (l.description ? '<div class="sub">' + h(l.description) + '</div>' : '') + '</td>' +
              '<td class="num">' + h(l.debit_base ? ui.idr(l.debit_base) : '') + '</td><td class="num">' + h(l.credit_base ? ui.idr(l.credit_base) : '') + '</td></tr>').join('') + '</tbody>').join('') +
          '<tfoot><tr class="subtotal final"><th colspan="3">' + h(t('Total ({n} entries)', { n: r.entries.length })) + '</th><td class="num">' + h(ui.idr(r.total)) + '</td><td class="num">' + h(ui.idr(r.total)) + '</td></tr></tfoot></table></div>'
          : ui.empty(t('No posted entries in this period.'))) + '</div>',
    });
    bindPeriodBar('#/reports/journal');
    bindActions('jurnal-' + q.from + '-' + q.to, () => {
      const rows = [[t('Date'), t('Number'), t('Memo'), t('Code'), t('Account'), t('Description'), t('Currency'), t('Debit (foreign)'), t('Credit (foreign)'), t('Debit (IDR)'), t('Credit (IDR)')]];
      r.entries.forEach((e) => e.lines.forEach((l) => rows.push([e.date, e.number, e.memo, l.account_code, l.account_name, l.description, l.currency, l.currency !== base ? Buku.money.format(l.debit, ui.curDecimals(l.currency), { locale: 'en' }).replace(/,/g, '') : '', l.currency !== base ? Buku.money.format(l.credit, ui.curDecimals(l.currency), { locale: 'en' }).replace(/,/g, '') : '', l.debit_base, l.credit_base])));
      return rows;
    });
  }

  // ---------- General ledger ----------
  function ledger(params, q) {
    const db = Buku.db;
    const opts = ui.accountOptions({ all: true, headers: true, headersSelectable: true, empty: t('Choose account…') });
    if (!q.from && !q.to) { q.from = U.fiscalYearStart(U.today(), fy()); q.to = U.today(); }
    const picker = ui.field(t('Account'), ui.select('account', opts, q.account || ''), { cls: 'grow' });
    if (!q.account) {
      ui.page({ title: t('General ledger'), cls: 'report', body: periodBar(q, { extra: picker }).replace('class="filters report-filters"', 'class="filters report-filters ledger-filters"') + ui.empty(t('Choose an account to see its transactions.')) });
      bindPeriodBar('#/ledger');
      ui.$('#rf [name=account]').addEventListener('change', () => ui.$('#rf').requestSubmit());
      return;
    }
    const g = Buku.ledger.generalLedger(db, Number(q.account), q.from || null, q.to || null);
    const a = g.account;
    const f = g.foreign;
    const sideAmt = (l, side) => {
      if (!l[side + '_base']) return '<td class="num"></td>';
      return '<td class="num">' + (f ? h(ui.money(l[side], f)) + '<div class="sub">' + h(ui.idr(l[side + '_base'])) + '</div>' : h(ui.idr(l[side + '_base']))) + '</td>';
    };
    const balCell = (b, bf) => '<td class="num">' + (f ? h(ui.money(bf, f)) + '<div class="sub">' + h(ui.idr(b)) + '</div>' : h(ui.amt(b))) + '</td>';
    ui.page({
      title: t('General ledger'),
      actions: reportActions(),
      cls: 'report',
      body: periodBar(q, { extra: picker }).replace('class="filters report-filters"', 'class="filters report-filters ledger-filters"') +
        '<div class="report-sheet">' + printHead(a.code + ' · ' + L().accName(a), range(q.from, q.to)) +
        '<div class="table-wrap"><table class="data report-table"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(t('Description')) + '</th><th class="num">' + h(t('Debit')) + '</th><th class="num">' + h(t('Credit')) + '</th><th class="num">' + h(t('Balance')) + '</th></tr></thead><tbody>' +
        '<tr class="muted-row"><td>' + h(q.from ? ui.date(q.from) : '') + '</td><td></td><td>' + h(t('Opening balance')) + '</td><td></td><td></td>' + balCell(g.opening, g.openingForeign) + '</tr>' +
        g.lines.map((l) => '<tr class="link" data-href="#/journal/' + l.entry_id + '"><td class="nowrap">' + h(ui.date(l.date)) + '</td><td class="mono nowrap"><a href="#/journal/' + l.entry_id + '">' + h(l.number) + '</a></td><td>' +
          h(l.description || l.memo || '') + (a.is_header ? '<div class="sub">' + h(l.account_code + ' · ' + l.account_name) + '</div>' : l.description && l.memo ? '<div class="sub">' + h(l.memo) + '</div>' : '') + '</td>' +
          sideAmt(l, 'debit') + sideAmt(l, 'credit') + balCell(l.balance, l.balance_foreign) + '</tr>').join('') +
        '</tbody><tfoot><tr class="subtotal final"><th colspan="3">' + h(t('Closing balance')) + '</th><td class="num">' + h(ui.idr(g.totalDebit)) + '</td><td class="num">' + h(ui.idr(g.totalCredit)) + '</td>' + balCell(g.closing, g.closingForeign) + '</tr></tfoot></table></div>' +
        (g.lines.length ? '' : '<p class="note">' + h(t('No transactions in this period.')) + '</p>') +
        '<p class="note">' + h(Buku.ledger.DEBIT_NORMAL[a.type] ? t('Balance shown as debit minus credit.') : t('Balance shown as credit minus debit.')) + '</p></div>',
    });
    bindPeriodBar('#/ledger');
    ui.$('#rf [name=account]').addEventListener('change', () => ui.$('#rf').requestSubmit());
    const fdiv = f ? Math.pow(10, ui.curDecimals(f)) : 1;
    bindActions('buku-besar-' + a.code + '-' + (q.from || '') + '-' + (q.to || ''), () => {
      const rows = [[t('Date'), t('Number'), t('Description'), t('Debit (IDR)'), t('Credit (IDR)'), t('Balance (IDR)')].concat(f ? [t('Debit') + ' ' + f, t('Credit') + ' ' + f, t('Balance') + ' ' + f] : [])];
      rows.push([q.from || '', '', t('Opening balance'), '', '', g.opening].concat(f ? ['', '', g.openingForeign / fdiv] : []));
      g.lines.forEach((l) => rows.push([l.date, l.number, l.description || l.memo || '', l.debit_base, l.credit_base, l.balance].concat(f ? [l.debit / fdiv, l.credit / fdiv, l.balance_foreign / fdiv] : [])));
      return rows;
    });
  }

  ui.route('/reports/pl', profitLoss);
  ui.route('/reports/bs', balanceSheet);
  ui.route('/reports/tb', trialBalance);
  ui.route('/reports/journal', journalReport);
  ui.route('/ledger', ledger);
})();
