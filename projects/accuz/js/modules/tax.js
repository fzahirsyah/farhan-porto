/* Buku — tax screens (PPN per masa, PPh 23 registers, tax payments) and Tier 2 reports
   (aging, cash flow, sales, deferred revenue, open sales orders, MRR). */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const U2 = () => Buku.ui2;
  const U = Buku.util;

  function tax(params, q) {
    const tab = q.tab || 'ppn';
    const tabs = [['ppn', t('PPN')], ['pph23', t('PPh 23 withheld by customers')], ['ours', t('Withheld by us')], ['payments', t('Tax payments')]];
    ui.page({
      title: t('Tax'),
      actions: '<button type="button" class="btn primary" id="pay">' + h(t('Pay tax')) + '</button>',
      body: '<nav class="tabs toolbar">' + tabs.map(([k, l]) => '<a class="' + (tab === k ? 'active' : '') + '" href="#/tax?tab=' + k + '">' + h(l) + '</a>').join('') + '</nav><div id="tab"></div>',
    });
    ui.$('#pay').addEventListener('click', () => payModal());
    if (tab === 'ppn') ppnTab(q);
    if (tab === 'pph23') pph23Tab(q);
    if (tab === 'ours') oursTab(q);
    if (tab === 'payments') paymentsTab(q);
  }

  function ppnTab(q) {
    const db = Buku.db;
    const masa = q.masa || U.monthStart(U.today(), -1).slice(0, 7);
    const r = Buku.taxops.ppn(db, masa);
    const docRows = (docs, side) => docs.map((d) => '<tr class="link" data-href="#/doc/' + d.id + '"><td class="nowrap">' + h(ui.date(d.date)) + '</td><td class="mono">' + h(d.number) + '</td><td>' + h(d.contact_name || d.subject || '') + '<div class="sub mono">' + h(d.contact_npwp || '') + '</div></td>' +
      '<td class="num">' + h(ui.idr(d.dpp_base)) + '</td><td class="num">' + h(ui.idr(d.tax_base)) + '</td>' + (side === 'sale' ? '<td>' + (d.faktur_no ? '<span class="mono">' + h(d.faktur_no) + '</span>' : d.doc_type === 'invoice' ? '<button type="button" class="btn small" data-faktur="' + d.id + '">' + h(t('Add')) + '</button>' : '') + '</td>' : '<td class="mono">' + h(d.vendor_invoice_no || '') + '</td>') + '</tr>').join('');
    ui.$('#tab').innerHTML = '<form class="filters" id="mf">' + ui.field(t('Tax month (masa)'), ui.input('masa', masa, { type: 'month' })) + '<button class="btn" type="submit">' + h(t('Show')) + '</button></form>' +
      '<div class="kpis kpis-3"><div class="kpi"><span class="kpi-label">' + h(t('PPN Keluaran (sales)')) + '</span><span class="kpi-value num">' + h(ui.idr(r.output, { code: true })) + '</span></div>' +
      '<div class="kpi"><span class="kpi-label">' + h(t('PPN Masukan (purchases)')) + '</span><span class="kpi-value num">' + h(ui.idr(r.input, { code: true })) + '</span></div>' +
      '<div class="kpi"><span class="kpi-label">' + h(r.net >= 0 ? t('To pay (kurang bayar)') : t('Overpaid (lebih bayar)')) + '</span><span class="kpi-value num">' + h(ui.idr(Math.abs(r.net), { code: true })) + '</span>' +
      '<span class="kpi-sub">' + (r.closed ? h(t('Closed in {n}', { n: r.closed.number })) : '<button type="button" class="btn small" id="close">' + h(t('Close this masa')) + '</button>') + '</span></div></div>' +
      (r.missingFaktur ? '<div class="banner warn"><div>' + h(t('{n} invoice(s) this month have no faktur pajak number yet.', { n: r.missingFaktur })) + '</div></div>' : '') +
      '<section class="panel"><header><h2>' + h(t('Sales with PPN')) + '</h2></header>' + (r.sales.length ? '<table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(t('Customer')) + '</th><th class="num">DPP</th><th class="num">PPN</th><th>' + h(t('Faktur')) + '</th></tr></thead><tbody>' + docRows(r.sales, 'sale') + '</tbody></table>' : '<p class="note">' + h(t('None this month.')) + '</p>') + '</section>' +
      '<section class="panel"><header><h2>' + h(t('Purchases with PPN')) + '</h2></header>' + (r.purchases.length ? '<table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(t('Vendor')) + '</th><th class="num">DPP</th><th class="num">PPN</th><th>' + h(t('Vendor invoice')) + '</th></tr></thead><tbody>' + docRows(r.purchases, 'purchase') + '</tbody></table>' : '<p class="note">' + h(t('None this month.')) + '</p>') + '</section>' +
      '<div class="form-actions"><button type="button" class="btn ghost" id="csv">' + h(t('Export CSV')) + '</button></div>';
    ui.$('#mf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/tax?tab=ppn&masa=' + ui.formData(ui.$('#mf')).masa; });
    const cl = ui.$('#close');
    if (cl) cl.addEventListener('click', async () => {
      if (!(await ui.confirm(t('Move this month’s PPN Keluaran and Masukan into Utang PPN? You can pay it afterwards with “Pay tax”.')))) return;
      try { const e = Buku.taxops.closePPN(Buku.db, masa); ui.toast(t('Posted {number}', { number: e.number })); ui.dispatch(); } catch (err) { ui.showError(err); }
    });
    ui.$$('[data-faktur]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const d = Buku.db.get('SELECT * FROM documents WHERE id=?', [Number(b.dataset.faktur)]);
      ui.modal({ title: t('Faktur pajak') + ' · ' + d.number, body: ui.field(t('Faktur number'), ui.input('no', '')) + ui.field(t('Faktur date'), ui.input('date', d.date, { type: 'date' })),
        actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (m) => { const f = ui.formData(m.body); Buku.taxops.setFaktur(Buku.db, d.id, f.no, f.date); ui.dispatch(); } }] });
    }));
    ui.$('#csv').addEventListener('click', () => {
      const rows = [[t('Type'), t('Date'), t('Number'), t('Contact'), 'NPWP', 'DPP', 'PPN', t('Faktur / vendor invoice')]];
      r.sales.forEach((d) => rows.push([t('Sales'), d.date, d.number, d.contact_name, d.contact_npwp, d.dpp_base, d.tax_base, d.faktur_no]));
      r.purchases.forEach((d) => rows.push([t('Purchases'), d.date, d.number, d.contact_name, d.contact_npwp, d.dpp_base, d.tax_base, d.vendor_invoice_no]));
      U.download('ppn-' + masa + '.csv', U.toCsv(rows), 'text/csv;charset=utf-8');
    });
    U2().rowLinks(ui.$('#tab'));
  }

  function rangeForm(q, tab) {
    const from = q.from || U.monthStart(U.today(), -2), to = q.to || U.monthEnd(U.today());
    return { from, to, html: '<form class="filters" id="rgf">' + ui.field(t('From'), ui.input('from', from, { type: 'date' })) + ui.field(t('To'), ui.input('to', to, { type: 'date' })) + '<button class="btn" type="submit">' + h(t('Show')) + '</button></form>',
      bind: () => ui.$('#rgf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/tax' + ui.qs(Object.assign({ tab }, ui.formData(ui.$('#rgf')))); }) };
  }

  function pph23Tab(q) {
    const R = rangeForm(q, 'pph23');
    const rows = Buku.taxops.withheldByCustomers(Buku.db, R.from, R.to);
    const total = rows.reduce((s, r) => s + r.withholding_base, 0);
    const missing = rows.filter((r) => !r.bukti_potong_no).length;
    ui.$('#tab').innerHTML = R.html + '<p class="intro">' + h(t('PPh 23 your customers withheld. It is prepaid tax you credit against corporate income tax, so collect every bukti potong.')) + '</p>' +
      (missing ? '<div class="banner warn"><div>' + h(t('{n} without a bukti potong number.', { n: missing })) + '</div></div>' : '') +
      (rows.length ? '<table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Customer')) + '</th><th>' + h(t('Invoice')) + '</th><th class="num">PPh 23</th><th>' + h(t('Bukti potong')) + '</th></tr></thead><tbody>' +
        rows.map((r) => '<tr><td>' + h(ui.date(r.date)) + '</td><td>' + h(r.contact_name || '') + '<div class="sub mono">' + h(r.contact_npwp || '') + '</div></td><td><a href="#/doc/' + r.document_id + '">' + h(r.doc_number) + '</a> · <a href="#/payments/' + r.payment_id + '">' + h(r.payment_number) + '</a></td>' +
          '<td class="num">' + h(ui.idr(r.withholding_base)) + '</td><td><button type="button" class="btn small ' + (r.bukti_potong_no ? 'ghost' : '') + '" data-bp="' + r.id + '">' + h(r.bukti_potong_no || t('Add number')) + '</button></td></tr>').join('') +
        '</tbody><tfoot><tr><th colspan="3">' + h(t('Total')) + '</th><td class="num">' + h(ui.idr(total)) + '</td><td></td></tr></tfoot></table>' : ui.empty(t('No withholding in this period.')));
    R.bind();
    ui.$$('[data-bp]').forEach((b) => b.addEventListener('click', () => {
      const r = rows.find((x) => x.id === Number(b.dataset.bp));
      ui.modal({ title: t('Bukti potong PPh 23'), body: ui.field(t('Number'), ui.input('no', r.bukti_potong_no || '')) + ui.field(t('Date'), ui.input('date', r.bukti_potong_date || r.date, { type: 'date' })),
        actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (m) => { const f = ui.formData(m.body); Buku.taxops.setBuktiPotong(Buku.db, r.id, f.no, f.date); ui.dispatch(); } }] });
    }));
  }

  function oursTab(q) {
    const R = rangeForm(q, 'ours');
    const rows = Buku.taxops.withheldByUs(Buku.db, R.from, R.to);
    const byTax = new Map();
    rows.forEach((r) => byTax.set(r.tax_name, (byTax.get(r.tax_name) || 0) + r.withholding_base));
    ui.$('#tab').innerHTML = R.html + '<p class="intro">' + h(t('Tax you withheld from vendors and agents. Pay it with “Pay tax” and report it in the monthly return.')) + '</p>' +
      (byTax.size ? '<div class="kpis kpis-3">' + Array.from(byTax).map(([k, v]) => '<div class="kpi"><span class="kpi-label">' + h(k) + '</span><span class="kpi-value num">' + h(ui.idr(v, { code: true })) + '</span></div>').join('') + '</div>' : '') +
      (rows.length ? '<table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Vendor')) + '</th><th>' + h(t('Document')) + '</th><th>' + h(t('Tax')) + '</th><th class="num">' + h(t('Amount')) + '</th></tr></thead><tbody>' +
        rows.map((r) => '<tr class="link" data-href="#/doc/' + r.id + '"><td>' + h(ui.date(r.date)) + '</td><td>' + h(r.contact_name || '') + '<div class="sub mono">' + h(r.contact_npwp || '') + '</div></td><td class="mono">' + h(r.vendor_invoice_no || r.number) + '</td><td>' + h(r.tax_name) + '</td><td class="num">' + h(ui.idr(r.withholding_base)) + '</td></tr>').join('') + '</tbody></table>'
        : ui.empty(t('No withholding in this period.')));
    R.bind();
    U2().rowLinks(ui.$('#tab'));
  }

  function paymentsTab() {
    const rows = Buku.taxops.payments(Buku.db);
    ui.$('#tab').innerHTML = rows.length ? '<table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Tax')) + '</th><th>' + h(t('Masa')) + '</th><th>NTPN</th><th>' + h(t('Paid from')) + '</th><th class="num">' + h(t('Amount')) + '</th></tr></thead><tbody>' +
      rows.map((r) => '<tr class="link" data-href="#/journal/' + r.journal_entry_id + '"><td>' + h(ui.date(r.date)) + '</td><td>' + h(r.account_name) + '</td><td>' + h(r.masa) + '</td><td class="mono">' + h(r.ntpn || '') + '</td><td>' + h(r.bank_name) + '</td><td class="num">' + h(ui.idr(r.amount)) + '</td></tr>').join('') + '</tbody></table>'
      : ui.empty(t('No tax payments recorded yet.'));
    U2().rowLinks(ui.$('#tab'));
  }

  function payModal() {
    const db = Buku.db;
    const accs = Buku.taxops.payableAccounts(db);
    const bal = Buku.ledger.accountBalances(db);
    const banks = db.all("SELECT * FROM accounts WHERE is_active=1 AND is_header=0 AND subtype IN ('bank','cash') AND (currency IS NULL OR currency='IDR') ORDER BY code");
    ui.modal({
      title: t('Pay tax'),
      body: '<div class="grid2">' + ui.field(t('Tax'), ui.select('account_id', accs.map((a) => ({ value: a.id, label: a.name + ' · ' + ui.idr((bal.get(a.id) || { base: 0 }).base) })), (accs[0] || {}).id)) +
        ui.field(t('Masa'), ui.input('masa', U.monthStart(U.today(), -1).slice(0, 7), { type: 'month' })) + ui.field(t('Date paid'), ui.input('date', U.today(), { type: 'date' })) +
        ui.field(t('Amount'), ui.moneyInput('amount', null, 0)) + ui.field(t('Paid from'), ui.select('bank', banks.map((b) => ({ value: b.id, label: b.name })), (banks[0] || {}).id)) +
        ui.field('NTPN', ui.input('ntpn', '', { placeholder: '16 karakter' }), { optional: true }) + '</div>',
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Record payment'), kind: 'primary', onClick: (m) => {
        const f = ui.formData(m.body);
        Buku.taxops.payTax(db, { account_id: Number(f.account_id), masa: f.masa, date: f.date, amount: ui.readMoney(m.body.querySelector('[name=amount]')), bank_account_id: Number(f.bank), ntpn: f.ntpn });
        ui.toast(t('Tax payment recorded'));
        location.hash = '#/tax?tab=payments';
        ui.dispatch();
      } }],
    });
  }

  // ---------------- Reports ----------------
  function head(title, period) {
    const c = Buku.db.get('SELECT name FROM company WHERE id=1');
    return '<div class="report-head"><div class="rh-company">' + h(c.name) + '</div><h2 class="rh-title">' + h(title) + '</h2><div class="rh-period">' + h(period) + '</div></div>';
  }
  function actions() { return '<button type="button" class="btn ghost" id="csv">' + h(t('Export CSV')) + '</button><button type="button" class="btn ghost" id="print">' + h(t('Print / PDF')) + '</button>'; }
  function bind(name, rows) {
    ui.$('#print').addEventListener('click', () => window.print());
    ui.$('#csv').addEventListener('click', () => U.download(name + '.csv', U.toCsv(rows()), 'text/csv;charset=utf-8'));
    U2().rowLinks();
  }
  function dateForm(q, path, opts) {
    opts = opts || {};
    const f = opts.asOf ? ui.field(t('As of'), ui.input('asof', q.asof, { type: 'date' })) : ui.field(t('From'), ui.input('from', q.from, { type: 'date' })) + ui.field(t('To'), ui.input('to', q.to, { type: 'date' }));
    return '<form class="filters report-filters" id="rf">' + f + (opts.extra || '') + '<button class="btn" type="submit">' + h(t('Show')) + '</button></form>';
  }
  function bindForm(path) {
    const f = ui.$('#rf');
    f.addEventListener('submit', (e) => { e.preventDefault(); location.hash = path + ui.qs(ui.formData(f)); });
    f.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => f.requestSubmit()));
  }

  function aging(side) {
    return function (params, q) {
      const db = Buku.db;
      q.asof = q.asof || U.today();
      const r = Buku.reports2.aging(db, side, q.asof);
      const title = side === 'ar' ? t('Receivables aging') : t('Payables aging');
      ui.page({
        title, actions: actions(), cls: 'report wide-report',
        body: dateForm(q, '', { asOf: true }) + '<div class="report-sheet">' + head(title, t('As of {date}', { date: ui.date(q.asof) })) +
          (r.rows.length ? '<div class="table-wrap"><table class="data report-table"><thead><tr><th>' + h(side === 'ar' ? t('Customer') : t('Vendor')) + '</th><th>' + h(t('Currency')) + '</th>' + r.buckets.map(([, l]) => '<th class="num">' + h(t(l)) + '</th>').join('') + '<th class="num">' + h(t('Total')) + '</th><th class="num">IDR</th></tr></thead><tbody>' +
            r.rows.map((x) => '<tr class="link" data-href="#/contacts/' + x.contact_id + '"><td>' + h(x.contact_name) + '</td><td>' + h(x.currency) + '</td>' + r.buckets.map(([k]) => '<td class="num">' + h(x.buckets[k] ? Buku.money.format(x.buckets[k], ui.curDecimals(x.currency)) : '') + '</td>').join('') +
              '<td class="num"><strong>' + h(Buku.money.format(x.total, ui.curDecimals(x.currency))) + '</strong></td><td class="num">' + h(ui.idr(x.base)) + '</td></tr>').join('') +
            '</tbody><tfoot><tr class="subtotal final"><th colspan="2">' + h(t('Total (IDR)')) + '</th>' + r.buckets.map(([k]) => '<td class="num">' + h(ui.idr(r.totals.base[k])) + '</td>').join('') + '<td></td><td class="num">' + h(ui.idr(r.totals.baseTotal)) + '</td></tr></tfoot></table></div>' +
            '<h3 class="section-title">' + h(t('Open documents')) + '</h3><table class="data"><tbody>' + r.items.map((d) => '<tr class="link" data-href="#/doc/' + d.id + '"><td>' + h(d.contact_name) + '</td><td class="mono">' + h(d.number) + '</td><td>' + h(ui.date(d.due_date || d.date)) + '</td><td>' + (d.days_overdue ? '<span class="chip bad">' + h(t('{n} days late', { n: d.days_overdue })) + '</span>' : '') + '</td><td class="num">' + h(U2().money(d.open, d.currency)) + '</td></tr>').join('') + '</tbody></table>'
            : ui.empty(t('Nothing outstanding.'))) + '</div>',
      });
      bindForm(side === 'ar' ? '#/reports/ar' : '#/reports/ap');
      bind((side === 'ar' ? 'umur-piutang-' : 'umur-utang-') + q.asof, () => [[t('Contact'), t('Currency')].concat(r.buckets.map(([, l]) => t(l)), [t('Total'), 'IDR'])].concat(r.rows.map((x) => [x.contact_name, x.currency].concat(r.buckets.map(([k]) => x.buckets[k]), [x.total, x.base]))));
    };
  }

  function cashFlow(params, q) {
    const db = Buku.db;
    const fy = U.fiscalYearStart(U.today(), db.scalar('SELECT fiscal_year_start_month FROM company WHERE id=1'));
    q.from = q.from || fy; q.to = q.to || U.today();
    const r = Buku.reports2.cashFlow(db, q.from, q.to);
    const L = Buku.i18n;
    const sect = (title, items, total) => '<tbody><tr class="sec-title"><th colspan="2">' + h(title) + '</th></tr>' + items.map(([label, v, href]) => '<tr' + (href ? ' class="link" data-href="' + href + '"' : '') + '><td><span class="indent" style="--d:0"></span>' + h(label) + '</td><td class="num">' + h(ui.amt(v)) + '</td></tr>').join('') +
      '<tr class="sec-total"><td>' + h(t('Net cash from {x}', { x: title.toLowerCase() })) + '</td><td class="num">' + h(ui.amt(total)) + '</td></tr></tbody>';
    const items = (g) => r.groups[g].filter((x) => x.amount).map((x) => [x.account.code + ' ' + L.accName(x.account), x.amount, '#/ledger' + ui.qs({ account: x.account.id, from: q.from, to: q.to })]);
    ui.page({
      title: t('Cash flow'), actions: actions(), cls: 'report',
      body: dateForm(q) + '<div class="report-sheet">' + head(t('Cash flow statement'), ui.date(q.from) + ' – ' + ui.date(q.to)) +
        '<div class="table-wrap"><table class="data report-table">' +
        sect(t('Operating activities'), [[t('Net profit'), r.net, '#/reports/pl' + ui.qs({ from: q.from, to: q.to })]].concat(items('operating')), r.operating) +
        sect(t('Investing activities'), items('investing'), r.investing) +
        sect(t('Financing activities'), items('financing').concat(r.retainedEarnings ? [[t('Retained earnings movements'), r.retainedEarnings]] : []), r.financing) +
        '<tbody><tr class="subtotal"><th>' + h(t('Net change in cash')) + '</th><td class="num">' + h(ui.amt(r.computed)) + '</td></tr>' +
        '<tr><td>' + h(t('Cash at start')) + '</td><td class="num">' + h(ui.amt(r.cashStart)) + '</td></tr><tr class="subtotal final"><th>' + h(t('Cash at end')) + '</th><td class="num">' + h(ui.amt(r.cashEnd)) + '</td></tr></tbody></table></div>' +
        '<p class="check-line ' + (r.difference ? 'bad' : 'ok') + '">' + h(r.difference ? t('Difference to bank and cash accounts: {a}', { a: ui.idr(r.difference) }) : t('Agrees with the change in bank and cash accounts.')) + '</p></div>',
    });
    bindForm('#/reports/cashflow');
    bind('arus-kas-' + q.from + '-' + q.to, () => [[t('Item'), 'IDR'], [t('Net profit'), r.net]].concat(items('operating').map((x) => [x[0], x[1]]), [[t('Operating activities'), r.operating]], items('investing').map((x) => [x[0], x[1]]), [[t('Investing activities'), r.investing]], items('financing').map((x) => [x[0], x[1]]), [[t('Financing activities'), r.financing], [t('Net change in cash'), r.computed]]));
  }

  function sales(params, q) {
    const db = Buku.db;
    q.from = q.from || U.monthStart(U.today(), -2); q.to = q.to || U.today(); q.by = q.by || 'customer';
    const r = Buku.reports2.sales(db, q.from, q.to, q.by);
    const extra = ui.field(t('By'), ui.select('by', [{ value: 'customer', label: t('Customer') }, { value: 'product', label: t('Product') }, { value: 'rep', label: t('Sales rep') }], q.by));
    ui.page({
      title: t('Sales'), actions: actions(), cls: 'report',
      body: dateForm(q, '', { extra }) + '<div class="report-sheet">' + head(t('Sales by {x}', { x: t({ customer: 'Customer', product: 'Product', rep: 'Sales rep' }[q.by]).toLowerCase() }), ui.date(q.from) + ' – ' + ui.date(q.to)) +
        (r.rows.length ? '<table class="data report-table"><thead><tr><th></th><th class="num">' + h(t('Invoices')) + '</th><th class="num">' + h(t('Net sales (IDR)')) + '</th><th class="num">%</th></tr></thead><tbody>' +
          r.rows.map((x) => '<tr><td>' + h(x.k) + '</td><td class="num">' + x.docs + '</td><td class="num">' + h(ui.idr(x.amount)) + '</td><td class="num">' + (r.total ? Math.round(x.amount * 1000 / r.total) / 10 : 0) + '</td></tr>').join('') +
          '</tbody><tfoot><tr class="subtotal final"><th>' + h(t('Total')) + '</th><td></td><td class="num">' + h(ui.idr(r.total)) + '</td><td></td></tr></tfoot></table><p class="note">' + h(t('Excludes VAT. Credit notes are deducted.')) + '</p>' : ui.empty(t('No sales in this period.'))) + '</div>',
    });
    bindForm('#/reports/sales');
    bind('penjualan-' + q.by + '-' + q.from + '-' + q.to, () => [[q.by, t('Invoices'), 'IDR']].concat(r.rows.map((x) => [x.k, x.docs, x.amount])));
  }

  function deferred(params, q) {
    const db = Buku.db;
    q.from = q.from || U.monthStart(U.today(), -11); q.to = q.to || U.monthEnd(U.today());
    const r = Buku.reports2.deferredRollforward(db, q.from, q.to);
    const row = (l, v, cls) => '<tr class="' + (cls || '') + '"><td>' + h(l) + '</td><td class="num">' + h(ui.amt(v)) + '</td></tr>';
    const mrr = Buku.subscriptions.mrr(db, q.to > U.today() ? U.today() : q.to);
    ui.page({
      title: t('Deferred revenue'), actions: actions(), cls: 'report',
      body: dateForm(q) + '<div class="report-sheet">' + head(t('Deferred revenue (Pendapatan Diterima di Muka)'), ui.date(q.from) + ' – ' + ui.date(q.to)) +
        (r ? '<table class="data report-table"><tbody>' + row(t('Opening balance'), r.opening) + row(t('+ Invoiced (SaaS paid in advance)'), r.invoiced) + row(t('− Recognized as revenue'), -r.recognized) + row(t('− Credit notes'), -r.credited) + (r.other ? row(t('± Manual journals'), r.other) : '') + row(t('Closing balance'), r.closing, 'subtotal final') + '</tbody></table>' +
          '<p class="check-line ' + (r.closing === r.expected || q.to < U.today() ? 'ok' : 'bad') + '">' + h(r.closing === r.expected ? t('Matches the subscription schedules.') : t('Subscription schedules expect {a}.', { a: ui.idr(r.expected) })) + '</p>' : ui.empty(t('No deferred revenue account.'))) +
        '<h3 class="section-title">' + h(t('Monthly recurring revenue')) + '</h3><table class="data report-table"><tbody>' + row(t('MRR'), mrr.total, 'subtotal') + row(t('ARR (MRR × 12)'), mrr.arr) + '</tbody></table>' +
        (mrr.byPlan.length ? '<table class="data report-table"><thead><tr><th>' + h(t('Plan')) + '</th><th class="num">MRR</th></tr></thead><tbody>' + mrr.byPlan.map(([k, v]) => row(k, v)).join('') + '</tbody></table>' : '') +
        (mrr.byRep.length ? '<table class="data report-table"><thead><tr><th>' + h(t('Sales rep')) + '</th><th class="num">MRR</th></tr></thead><tbody>' + mrr.byRep.map(([k, v]) => row(k, v)).join('') + '</tbody></table>' : '') + '</div>',
    });
    bindForm('#/reports/deferred');
    bind('pendapatan-diterima-di-muka-' + q.to, () => r ? [[t('Item'), 'IDR'], [t('Opening balance'), r.opening], [t('Invoiced'), r.invoiced], [t('Recognized'), -r.recognized], [t('Credit notes'), -r.credited], [t('Other'), r.other], [t('Closing balance'), r.closing], ['MRR', mrr.total]] : []);
  }

  function openSOs() {
    const db = Buku.db;
    const rows = Buku.reports2.openSalesOrders(db);
    const total = rows.reduce((s, d) => s + d.remaining_base, 0);
    ui.page({
      title: t('Open sales orders'), actions: actions(), cls: 'report',
      body: '<div class="report-sheet">' + head(t('Open sales orders'), t('As of {date}', { date: ui.date(U.today()) })) +
        (rows.length ? '<table class="data report-table"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(t('Customer')) + '</th><th>' + h(t('Sales')) + '</th><th class="num">' + h(t('Not yet invoiced')) + '</th><th class="num">IDR</th></tr></thead><tbody>' +
          rows.map((d) => '<tr class="link" data-href="#/doc/' + d.id + '"><td>' + h(ui.date(d.date)) + '</td><td class="mono">' + h(d.number) + '</td><td>' + h(d.contact_name) + (d.expired ? ' <span class="chip muted">' + h(t('Expired')) + '</span>' : '') + (d.signed_at ? ' <span class="chip ok">' + h(t('Signed')) + '</span>' : '') + '</td><td>' + h(d.rep_code || '') + '</td><td class="num">' + h(U2().money(d.remaining, d.currency)) + '</td><td class="num">' + h(ui.idr(d.remaining_base)) + '</td></tr>').join('') +
          '</tbody><tfoot><tr class="subtotal final"><th colspan="5">' + h(t('Total (excl. VAT)')) + '</th><td class="num">' + h(ui.idr(total)) + '</td></tr></tfoot></table>' : ui.empty(t('No open sales orders.'))) + '</div>',
    });
    bind('sales-order-terbuka', () => [[t('Date'), t('Number'), t('Customer'), t('Currency'), t('Not yet invoiced'), 'IDR']].concat(rows.map((d) => [d.date, d.number, d.contact_name, d.currency, d.remaining, d.remaining_base])));
  }

  ui.route('/tax', tax);
  ui.route('/reports/ar', aging('ar'));
  ui.route('/reports/ap', aging('ap'));
  ui.route('/reports/cashflow', cashFlow);
  ui.route('/reports/sales', sales);
  ui.route('/reports/deferred', deferred);
  ui.route('/reports/open-so', openSOs);
})();
