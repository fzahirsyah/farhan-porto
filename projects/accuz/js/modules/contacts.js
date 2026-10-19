/* Buku — contacts (customers, vendors, developers, banks, partners, agents) and products & plans. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const U2 = () => Buku.ui2;
  const now = () => Buku.util.nowIso();
  const TAGS = [['customer', 'Customer'], ['vendor', 'Vendor'], ['developer', 'Developer'], ['bank', 'Bank (KPR)'], ['partner', 'Partner'], ['agent', 'Agent']];

  // ---------------- Contacts ----------------
  function list(params, q) {
    const db = Buku.db;
    const tab = q.tag || '';
    const needle = (q.q || '').toLowerCase();
    const rows = db.all('SELECT * FROM contacts ' + (q.inactive === '1' ? '' : 'WHERE is_active=1 ') + 'ORDER BY name').filter((c) =>
      (!tab || JSON.parse(c.tags || '[]').includes(tab)) &&
      (!needle || [c.name, c.pic_name, c.email, c.npwp, c.phone].some((x) => (x || '').toLowerCase().includes(needle))));
    const open = new Map();
    db.all(`SELECT contact_id, doc_type, currency, sum(CASE WHEN doc_type='credit_note' THEN -(total - amount_paid) WHEN doc_type='bill' THEN total - withholding_total - amount_paid ELSE total - amount_paid END) bal
      FROM documents WHERE status IN ('open','partial') AND doc_type IN ('invoice','credit_note','bill') GROUP BY contact_id, doc_type IN ('bill'), currency`).forEach((r) => {
      if (!open.has(r.contact_id)) open.set(r.contact_id, { ar: [], ap: [] });
      open.get(r.contact_id)[r.doc_type === 'bill' ? 'ap' : 'ar'].push([r.currency, r.bal]);
    });
    const fmtList = (arr) => (arr || []).filter((x) => x[1]).map(([c, v]) => U2().money(v, c)).join('<br>');
    ui.page({
      title: t('Contacts'),
      actions: '<button type="button" class="btn ghost" id="imp">' + h(t('Import CSV')) + '</button><button type="button" class="btn primary" id="new">' + h(t('New contact')) + '</button>',
      body:
        '<div class="toolbar"><nav class="tabs">' + [['', t('All')]].concat(TAGS.map(([k, l]) => [k, t(l)])).map(([v, l]) => '<a class="' + (tab === v ? 'active' : '') + '" href="#/contacts' + ui.qs({ tag: v, q: q.q }) + '">' + h(l) + '</a>').join('') + '</nav>' +
        '<form id="cf" class="inline-filter"><input type="search" name="q" value="' + h(q.q || '') + '" placeholder="' + h(t('Name, PIC, NPWP, email…')) + '" aria-label="' + h(t('Search')) + '"></form></div>' +
        (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Name')) + '</th><th>PIC</th><th>' + h(t('Phone')) + '</th><th>NPWP</th><th class="num">' + h(t('Receivable')) + '</th><th class="num">' + h(t('Payable')) + '</th></tr></thead><tbody>' +
          rows.map((c) => {
            const tags = JSON.parse(c.tags || '[]');
            const o = open.get(c.id) || {};
            return '<tr class="link' + (c.is_active ? '' : ' inactive') + '" data-href="#/contacts/' + c.id + '"><td><strong>' + h(c.name) + '</strong><div class="sub">' + tags.map((x) => h(t((TAGS.find((k) => k[0] === x) || [x, x])[1]))).join(' · ') + '</div></td>' +
              '<td>' + h(c.pic_name || '') + '</td><td>' + h(c.phone || '') + '</td><td class="mono">' + h(c.npwp || '') + '</td><td class="num">' + fmtList(o.ar) + '</td><td class="num">' + fmtList(o.ap) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
          : ui.empty(needle || tab ? t('No contacts match.') : t('No contacts yet. Add your first customer.'), '<button type="button" class="btn primary" id="new2">' + h(t('New contact')) + '</button>')),
    });
    ui.$('#cf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/contacts' + ui.qs({ tag, q: ui.formData(ui.$('#cf')).q }); });
    const openNew = () => edit(null, { tag: tab || 'customer', onSaved: (id) => { location.hash = '#/contacts/' + id; } });
    ui.$('#new').addEventListener('click', openNew);
    const n2 = ui.$('#new2'); if (n2) n2.addEventListener('click', openNew);
    ui.$('#imp').addEventListener('click', importCsv);
    U2().rowLinks();
  }

  /** Add/edit modal. opts: { tag, prefill, onSaved(id) } */
  function edit(id, opts) {
    opts = opts || {};
    const db = Buku.db;
    const c = id ? db.get('SELECT * FROM contacts WHERE id=?', [id]) : Object.assign({ name: '', tags: JSON.stringify([opts.tag || 'customer']), withholds_pph23: 1, is_active: 1, currency: 'IDR', payment_terms_days: 7, payment_term_text: 'Payment Before Delivery' }, opts.prefill || {});
    const tags = JSON.parse(c.tags || '[]');
    const templates = db.all('SELECT id, name FROM doc_templates ORDER BY name');
    ui.modal({
      title: id ? t('Edit contact') : t('New contact'),
      wide: true,
      body:
        '<div class="checks">' + TAGS.map(([k, l]) => '<label class="check"><input type="checkbox" name="tag_' + k + '"' + (tags.includes(k) ? ' checked' : '') + '> ' + h(t(l)) + '</label>').join('') + '</div>' +
        '<div class="grid2">' +
        ui.field(t('Name'), ui.input('name', c.name, { required: true, placeholder: 'PT …' }), { wide: true }) +
        ui.field('PIC', ui.input('pic_name', c.pic_name), { optional: true }) +
        ui.field(t('Phone'), ui.input('phone', c.phone), { optional: true }) +
        ui.field(t('Email'), ui.input('email', c.email, { type: 'email' }), { optional: true }) +
        ui.field('NPWP', ui.input('npwp', c.npwp, { placeholder: '00.000.000.0-000.000' }), { optional: true }) +
        ui.field(t('Address'), '<textarea name="billing_address" rows="3">' + h(c.billing_address || '') + '</textarea>', { wide: true, optional: true }) +
        ui.field(t('Default currency'), ui.select('currency', U2().currencyOptions(), c.currency || 'IDR')) +
        ui.field(t('Sales rep'), ui.select('sales_rep_id', U2().repOptions(), c.sales_rep_id || '')) +
        ui.field(t('Payment terms (days)'), ui.input('payment_terms_days', c.payment_terms_days, { type: 'number', attrs: 'min="0"' })) +
        ui.field(t('Payment term text'), ui.input('payment_term_text', c.payment_term_text, { placeholder: 'Payment Before Delivery' })) +
        ui.field(t('Document template'), ui.select('default_template_id', [{ value: '', label: t('Default for each document') }].concat(templates.map((x) => ({ value: x.id, label: x.name }))), c.default_template_id || '')) +
        ui.field('NIK', ui.input('nik', c.nik), { optional: true }) +
        '</div>' +
        '<label class="check"><input type="checkbox" name="withholds_pph23"' + (c.withholds_pph23 ? ' checked' : '') + '> ' + h(t('Withholds PPh 23 when paying us (companies usually do)')) + '</label>' +
        '<label class="check"><input type="checkbox" name="is_individual"' + (c.is_individual ? ' checked' : '') + '> ' + h(t('Individual (not a company)')) + '</label>' +
        '<label class="check"><input type="checkbox" name="is_related_party"' + (c.is_related_party ? ' checked' : '') + '> ' + h(t('Related party (e.g. joint venture)')) + '</label>' +
        (id ? '<label class="check"><input type="checkbox" name="is_active"' + (c.is_active ? ' checked' : '') + '> ' + h(t('Active')) + '</label>' : '') +
        ui.field(t('Notes'), '<textarea name="notes" rows="2">' + h(c.notes || '') + '</textarea>', { optional: true }),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (m) => {
        const f = ui.formData(m.body);
        if (!f.name) throw new Buku.BukuError('required', t('Enter the name.'));
        const tg = TAGS.map(([k]) => k).filter((k) => f['tag_' + k]);
        const days = f.payment_terms_days === '' ? null : parseInt(f.payment_terms_days, 10);
        if (days !== null && !(days >= 0)) throw new Buku.BukuError('invalid', t('Payment terms must be 0 or more days.'));
        const rec = {
          name: f.name, tags: JSON.stringify(tg), pic_name: f.pic_name || null, phone: f.phone || null, email: f.email || null, npwp: f.npwp || null, nik: f.nik || null,
          billing_address: f.billing_address || null, currency: f.currency, sales_rep_id: f.sales_rep_id ? Number(f.sales_rep_id) : null, payment_terms_days: days,
          payment_term_text: f.payment_term_text || null, default_template_id: f.default_template_id ? Number(f.default_template_id) : null,
          withholds_pph23: f.withholds_pph23 ? 1 : 0, is_individual: f.is_individual ? 1 : 0, is_related_party: f.is_related_party ? 1 : 0, notes: f.notes || null, updated_at: now(),
        };
        let newId = id;
        db.tx(() => {
          if (id) db.update('contacts', id, Object.assign(rec, { is_active: f.is_active ? 1 : 0 }));
          else newId = db.insert('contacts', Object.assign(rec, { created_at: now() }));
        });
        ui.toast(t('Contact saved'));
        if (opts.onSaved) opts.onSaved(newId); else ui.dispatch();
      } }],
    });
  }

  function detail(params) {
    const db = Buku.db;
    const id = Number(params.id);
    const c = db.get('SELECT * FROM contacts WHERE id=?', [id]);
    if (!c) throw new Buku.BukuError('not_found', t('Contact not found.'));
    const docs = db.all("SELECT * FROM documents WHERE contact_id=? ORDER BY date DESC, id DESC LIMIT 200", [id]);
    const pays = db.all("SELECT * FROM payments WHERE contact_id=? ORDER BY date DESC LIMIT 50", [id]);
    const subs = db.all("SELECT s.*, p.name product_name FROM subscriptions s LEFT JOIN products p ON p.id=s.product_id WHERE s.contact_id=? ORDER BY s.id DESC", [id]);
    const curs = Array.from(new Set(docs.map((d) => d.currency).concat([c.currency || 'IDR'])));
    const openBy = (types) => curs.map((cur) => [cur, docs.filter((d) => types.includes(d.doc_type) && ['open', 'partial'].includes(d.status) && d.currency === cur)
      .reduce((s, d) => s + (d.doc_type === 'credit_note' ? -1 : 1) * Buku.docs.balance(d), 0)]).filter((x) => x[1]);
    const ar = openBy(['invoice', 'credit_note']), ap = openBy(['bill']);
    const tags = JSON.parse(c.tags || '[]');
    const today = Buku.util.today();
    ui.page({
      title: c.name,
      actions: '<button type="button" class="btn ghost" id="edit">' + h(t('Edit')) + '</button>' +
        '<a class="btn ghost" href="#/contacts/' + id + '/statement">' + h(t('Statement')) + '</a>' +
        (tags.includes('vendor') ? '<a class="btn ghost" href="#/doc/new/bill?contact=' + id + '">' + h(t('New bill')) + '</a>' : '') +
        '<a class="btn ghost" href="#/doc/new/sales_order?contact=' + id + '">' + h(t('New sales order')) + '</a>' +
        '<a class="btn primary" href="#/doc/new/invoice?contact=' + id + '">' + h(t('New invoice')) + '</a>',
      body:
        '<div class="cols cols-2-1"><section class="panel"><header><h2>' + h(t('Details')) + '</h2></header><dl class="facts compact">' +
        [['PIC', c.pic_name], [t('Phone'), c.phone], [t('Email'), c.email], ['NPWP', c.npwp], [t('Address'), c.billing_address], [t('Payment terms'), (c.payment_terms_days !== null ? c.payment_terms_days + ' ' + t('days') : '') + (c.payment_term_text ? ' · ' + c.payment_term_text : '')],
          [t('Default currency'), c.currency], ['PPh 23', c.withholds_pph23 && !c.is_individual ? t('Withholds 2% when paying us') : t('Does not withhold')]]
          .filter((x) => x[1]).map(([k, v]) => '<div><dt>' + h(k) + '</dt><dd>' + h(v).replace(/\n/g, '<br>') + '</dd></div>').join('') + '</dl>' + (c.notes ? '<p class="note">' + h(c.notes) + '</p>' : '') + '</section>' +
        '<section class="panel"><header><h2>' + h(t('Balance')) + '</h2></header>' +
        '<dl class="facts compact one"><div><dt>' + h(t('Owes us')) + '</dt><dd>' + (ar.length ? ar.map(([cur, v]) => h(U2().money(v, cur))).join('<br>') : '—') + '</dd></div>' +
        '<div><dt>' + h(t('We owe')) + '</dt><dd>' + (ap.length ? ap.map(([cur, v]) => h(U2().money(v, cur))).join('<br>') : '—') + '</dd></div></dl>' +
        (ar.length ? '<a class="btn small primary" href="#/payments/new?direction=in&contact=' + id + '">' + h(t('Record payment')) + '</a>' : '') +
        (ap.length ? ' <a class="btn small" href="#/payments/new?direction=out&contact=' + id + '">' + h(t('Pay')) + '</a>' : '') + '</section></div>' +
        (subs.length ? '<section class="panel"><header><h2>' + h(t('Subscriptions')) + '</h2><a href="#/subscriptions">' + h(t('See all')) + '</a></header><table class="data"><tbody>' +
          subs.map((s) => '<tr class="link" data-href="#/subscriptions?open=' + s.id + '"><td>' + h(s.product_name || s.description) + '<div class="sub">' + h(s.months + ' ' + t('months')) + '</div></td><td>' + (s.start_date ? h(ui.date(s.start_date) + ' – ' + ui.date(s.end_date)) : '—') + '</td><td>' + U2().chip(Buku.subscriptions.displayStatus(s, today)) + '</td><td class="num">' + h(U2().money(s.amount, s.currency)) + '</td></tr>').join('') + '</tbody></table></section>' : '') +
        '<section class="panel"><header><h2>' + h(t('Documents')) + '</h2></header>' +
        (docs.length ? '<table class="data"><tbody>' + docs.map((d) => '<tr class="link" data-href="#/doc/' + d.id + '"><td class="nowrap">' + h(ui.date(d.date)) + '</td><td>' + h(t(U2().DOC[d.doc_type].label)) + ' <span class="mono">' + h(d.number || '') + '</span></td><td>' + U2().chip(U2().docStatus(d)) + '</td><td class="num">' + h(U2().money(d.total, d.currency)) + '</td></tr>').join('') + '</tbody></table>' : ui.empty(t('No documents yet.'))) + '</section>' +
        (pays.length ? '<section class="panel"><header><h2>' + h(t('Payments')) + '</h2></header><table class="data"><tbody>' + pays.map((p) => '<tr class="link" data-href="#/payments/' + p.id + '"><td class="nowrap">' + h(ui.date(p.date)) + '</td><td class="mono">' + h(p.number) + '</td><td>' + U2().chip(p.status) + '</td><td class="num">' + h(U2().money(p.amount, p.currency)) + '</td></tr>').join('') + '</tbody></table></section>' : ''),
    });
    ui.$('#edit').addEventListener('click', () => edit(id));
    U2().rowLinks();
  }

  function statementPage(params, q) {
    const db = Buku.db;
    const id = Number(params.id);
    const c = db.get('SELECT * FROM contacts WHERE id=?', [id]);
    const curs = db.all('SELECT DISTINCT currency FROM documents WHERE contact_id=?', [id]).map((r) => r.currency);
    if (!curs.length) curs.push(c.currency || 'IDR');
    const today = Buku.util.today();
    q.currency = q.currency || curs[0];
    q.from = q.from || Buku.util.monthStart(today, -5);
    q.to = q.to || today;
    ui.page({
      title: t('Statement') + ' · ' + c.name,
      actions: '<a class="btn ghost" href="#/contacts/' + id + '">' + h(t('Back')) + '</a><button type="button" class="btn primary" id="print">' + h(t('Print / PDF')) + '</button>',
      body: '<form class="filters report-filters" id="sf">' + ui.field(t('From'), ui.input('from', q.from, { type: 'date' })) + ui.field(t('To'), ui.input('to', q.to, { type: 'date' })) +
        ui.field(t('Currency'), ui.select('currency', curs.map((x) => ({ value: x, label: x })), q.currency)) + '<button class="btn" type="submit">' + h(t('Show')) + '</button></form><div class="doc-stage" id="paper"></div>',
    });
    U2().showPaper(ui.$('#paper'), Buku.templates.renderContactStatement(db, id, q.currency, q.from, q.to));
    ui.$('#sf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/contacts/' + id + '/statement' + ui.qs(ui.formData(ui.$('#sf'))); });
    ui.$('#print').addEventListener('click', () => U2().printPaper(ui.$('#paper'), 'Statement - ' + c.name + ' - ' + q.to));
  }

  function importCsv() {
    ui.modal({
      title: t('Import contacts from CSV'),
      wide: true,
      body: '<p>' + h(t('First row: column names. Recognised: name, pic, phone, email, npwp, address, tags (customer;vendor), currency, terms_days.')) + '</p><input type="file" accept=".csv,text/csv" name="file"><textarea name="text" rows="8" placeholder="name,pic,phone,email,npwp,address,tags"></textarea>',
      onOpen: (m) => m.body.querySelector('[name=file]').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) m.body.querySelector('[name=text]').value = await f.text(); }),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Import'), kind: 'primary', onClick: (m) => {
        const db = Buku.db;
        const rows = Buku.util.parseCsv(m.body.querySelector('[name=text]').value);
        if (rows.length < 2) throw new Buku.BukuError('empty', t('Paste or choose a CSV file first.'));
        const head = rows[0].map((x) => x.trim().toLowerCase());
        const col = (k) => head.indexOf(k);
        if (col('name') < 0) throw new Buku.BukuError('csv_header', t('The first row must include a “name” column.'));
        let added = 0, skipped = 0;
        db.tx(() => {
          for (const r of rows.slice(1)) {
            const name = (r[col('name')] || '').trim();
            if (!name) continue;
            if (db.scalar('SELECT 1 FROM contacts WHERE lower(name)=lower(?)', [name])) { skipped++; continue; }
            const v = (k) => (col(k) >= 0 ? (r[col(k)] || '').trim() || null : null);
            const tags = (v('tags') || 'customer').toLowerCase().split(/[;|/ ]+/).filter((x) => TAGS.some((k) => k[0] === x));
            const cur = (v('currency') || 'IDR').toUpperCase();
            db.insert('contacts', { name, pic_name: v('pic'), phone: v('phone'), email: v('email'), npwp: v('npwp'), billing_address: v('address'), tags: JSON.stringify(tags.length ? tags : ['customer']),
              currency: db.scalar('SELECT 1 FROM currencies WHERE code=?', [cur]) ? cur : 'IDR', payment_terms_days: v('terms_days') ? parseInt(v('terms_days'), 10) || null : null, created_at: now(), updated_at: now() });
            added++;
          }
        });
        ui.toast(t('{added} contact(s) added, {skipped} already existed', { added, skipped }));
        ui.dispatch();
      } }],
    });
  }

  // ---------------- Products & plans ----------------
  const KINDS = [['plan', 'SaaS plan (subscription)'], ['service', 'Service'], ['commission', 'Commission'], ['fee', 'Fee'], ['other', 'Other']];

  function products() {
    const db = Buku.db;
    const rows = db.all('SELECT p.*, a.code acc_code, t.print_label tax_label FROM products p LEFT JOIN accounts a ON a.id=p.income_account_id LEFT JOIN taxes t ON t.id=p.tax_id ORDER BY p.is_active DESC, p.kind, p.name');
    const prices = new Map();
    db.all('SELECT * FROM product_prices').forEach((p) => { if (!prices.has(p.product_id)) prices.set(p.product_id, []); prices.get(p.product_id).push(p); });
    ui.page({
      title: t('Products & plans'),
      actions: '<button type="button" class="btn primary" id="new">' + h(t('New product')) + '</button>',
      body: '<p class="intro">' + h(t('SaaS plans create subscriptions when invoiced. Their revenue is deferred and recognized month by month after handover.')) + '</p>' +
        (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Name')) + '</th><th>' + h(t('Kind')) + '</th><th>' + h(t('Unit')) + '</th><th class="num">' + h(t('Price')) + '</th><th>' + h(t('Tax')) + '</th><th>' + h(t('Account')) + '</th><th></th></tr></thead><tbody>' +
          rows.map((p) => '<tr class="' + (p.is_active ? '' : 'inactive') + '"><td><strong>' + h(p.name) + '</strong>' + (p.code ? ' <span class="mono muted">' + h(p.code) + '</span>' : '') +
            (p.kind === 'plan' ? '<div class="sub">' + h(t('{n} months', { n: p.default_months || 1 })) + (p.quota_text ? ' · ' + h(p.quota_text) : '') + '</div>' : '') + '</td>' +
            '<td>' + h(t((KINDS.find((k) => k[0] === p.kind) || ['', p.kind])[1])) + '</td><td>' + h(p.unit || '') + '</td>' +
            '<td class="num">' + ((prices.get(p.id) || []).map((x) => h(U2().money(x.unit_price, x.currency))).join('<br>') || '—') + (p.kind === 'plan' ? '<div class="sub">' + h(t('per month')) + '</div>' : '') + '</td>' +
            '<td>' + h(p.tax_label || '—') + '</td><td class="mono">' + h(p.acc_code || '') + '</td><td class="actions"><button type="button" class="btn small ghost" data-id="' + p.id + '">' + h(t('Edit')) + '</button></td></tr>').join('') + '</tbody></table></div>'
          : ui.empty(t('No products yet.'))),
    });
    ui.$('#new').addEventListener('click', () => editProduct(null));
    ui.$$('[data-id]').forEach((b) => b.addEventListener('click', () => editProduct(Number(b.dataset.id))));
  }

  function editProduct(id) {
    const db = Buku.db;
    const p = id ? db.get('SELECT * FROM products WHERE id=?', [id]) : { kind: 'service', unit: 'Unit', is_sold: 1, is_active: 1, tax_id: db.scalar("SELECT id FROM taxes WHERE code='PPN11'") };
    const prices = id ? db.all('SELECT * FROM product_prices WHERE product_id=?', [id]) : [];
    const curs = db.all('SELECT * FROM currencies WHERE is_enabled=1 ORDER BY CASE code WHEN \'IDR\' THEN 0 ELSE 1 END');
    const priceOf = (c) => (prices.find((x) => x.currency === c) || {}).unit_price;
    const accIncome = ui.accountOptions({ empty: t('Default revenue account') }).filter((g) => !g.group || g.group === t('Income'));
    const accExp = ui.accountOptions({ empty: '—' }).filter((g) => !g.group || g.group === t('Expense') || g.group === t('Asset'));
    const m = ui.modal({
      title: id ? t('Edit product') : t('New product'),
      wide: true,
      body: '<div class="grid2">' +
        ui.field(t('Name'), ui.input('name', p.name, { required: true }), { wide: true }) +
        ui.field(t('Code'), ui.input('code', p.code), { optional: true }) +
        ui.field(t('Kind'), ui.select('kind', KINDS.map(([v, l]) => ({ value: v, label: t(l) })), p.kind)) +
        ui.field(t('Unit'), ui.input('unit', p.unit, { placeholder: 'Months, Unit, Lot…' })) +
        ui.field(t('Description'), '<textarea name="description" rows="2">' + h(p.description || '') + '</textarea>', { wide: true, optional: true }) +
        curs.map((c) => ui.field(t('Price') + ' ' + c.code, ui.moneyInput('price_' + c.code, priceOf(c.code), c.decimals, { placeholder: c.code === 'IDR' ? '0' : t('converted from IDR') }), { optional: c.code !== 'IDR' })).join('') +
        '<div class="plan-only grid2 wide">' +
        ui.field(t('Default months'), ui.input('default_months', p.default_months || 6, { type: 'number', attrs: 'min="1" max="120"' })) +
        ui.field(t('Quota'), ui.input('quota_text', p.quota_text, { placeholder: '50 hits/month' }), { optional: true }) +
        ui.field(t('Default line note'), ui.input('default_note', p.default_note, { placeholder: 'SaaS 6 Months | 50 hits/month' }), { optional: true, wide: true }) +
        '</div>' +
        ui.field(t('Revenue account'), ui.select('income_account_id', accIncome, p.income_account_id || '')) +
        ui.field(t('Sales tax'), ui.select('tax_id', U2().taxOptions(['ppn_out']), p.tax_id || '')) +
        ui.field(t('Expense account (when bought)'), ui.select('expense_account_id', accExp, p.expense_account_id || ''), { optional: true }) +
        ui.field(t('Purchase tax'), ui.select('purchase_tax_id', U2().taxOptions(['ppn_in']), p.purchase_tax_id || '')) +
        '</div>' +
        '<label class="check"><input type="checkbox" name="is_sold"' + (p.is_sold ? ' checked' : '') + '> ' + h(t('We sell this')) + '</label>' +
        '<label class="check"><input type="checkbox" name="is_bought"' + (p.is_bought ? ' checked' : '') + '> ' + h(t('We buy this')) + '</label>' +
        (id ? '<label class="check"><input type="checkbox" name="is_active"' + (p.is_active ? ' checked' : '') + '> ' + h(t('Active')) + '</label>' : ''),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (mm) => {
        const f = ui.formData(mm.body);
        if (!f.name) throw new Buku.BukuError('required', t('Enter the name.'));
        if (f.code && db.scalar('SELECT 1 FROM products WHERE code=? AND id<>?', [f.code, id || 0])) throw new Buku.BukuError('duplicate_code', t('Code {code} is already used.', { code: f.code }));
        const rec = {
          name: f.name, code: f.code || null, kind: f.kind, unit: f.unit || null, description: f.description || null,
          default_months: f.kind === 'plan' ? Math.max(1, parseInt(f.default_months, 10) || 1) : null, quota_text: f.kind === 'plan' ? f.quota_text || null : null,
          default_note: f.default_note || null, income_account_id: f.income_account_id ? Number(f.income_account_id) : null, tax_id: f.tax_id ? Number(f.tax_id) : null,
          expense_account_id: f.expense_account_id ? Number(f.expense_account_id) : null, purchase_tax_id: f.purchase_tax_id ? Number(f.purchase_tax_id) : null,
          is_sold: f.is_sold ? 1 : 0, is_bought: f.is_bought ? 1 : 0, updated_at: now(),
        };
        const priceVals = curs.map((c) => [c.code, ui.readMoney(mm.body.querySelector('[name=price_' + c.code + ']'))]);
        db.tx(() => {
          let pid = id;
          if (id) db.update('products', id, Object.assign(rec, { is_active: f.is_active ? 1 : 0 }));
          else pid = db.insert('products', Object.assign(rec, { created_at: now() }));
          db.run('DELETE FROM product_prices WHERE product_id=?', [pid]);
          for (const [cur, v] of priceVals) if (v !== null && v !== undefined) db.insert('product_prices', { product_id: pid, currency: cur, unit_price: Math.max(0, v) });
        });
        ui.toast(t('Product saved'));
        ui.dispatch();
      } }],
    });
    const kindSel = m.body.querySelector('[name=kind]');
    const sync = () => { m.body.querySelector('.plan-only').hidden = kindSel.value !== 'plan'; };
    kindSel.addEventListener('change', () => { if (kindSel.value === 'plan' && !m.body.querySelector('[name=unit]').value) m.body.querySelector('[name=unit]').value = 'Months'; sync(); });
    sync();
  }

  ui.route('/contacts', list);
  ui.route('/contacts/:id', detail);
  ui.route('/contacts/:id/statement', statementPage);
  ui.route('/products', products);
  Buku.contactsUI = { edit, editProduct, TAGS };
})();
