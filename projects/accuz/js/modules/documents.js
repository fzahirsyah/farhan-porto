/* Buku — sales orders, invoices, credit notes, bills and expenses: lists, editor, document view. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const U2 = () => Buku.ui2;

  // ---------------- Lists ----------------
  const FILTERS = {
    sales_order: [['', 'All'], ['draft', 'Draft'], ['open', 'Open'], ['complete', 'Fully invoiced'], ['closed', 'Closed']],
    invoice: [['', 'All'], ['draft', 'Draft'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void']],
    credit_note: [['', 'All'], ['draft', 'Draft'], ['open', 'Open credit'], ['paid', 'Applied'], ['void', 'Void']],
    bill: [['', 'All'], ['draft', 'Draft'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void']],
    expense: [['', 'All'], ['draft', 'Draft'], ['paid', 'Recorded'], ['void', 'Void']],
  };

  function listFor(type) {
    return function (params, q) {
      const db = Buku.db;
      const D = U2().DOC[type];
      const where = ['d.doc_type=?'], args = [type];
      const today = Buku.util.today();
      const st = q.status || '';
      if (st === 'draft') where.push("d.status='draft'");
      else if (st === 'open') where.push("d.status IN ('confirmed','partial','open')");
      else if (st === 'unpaid') where.push("d.status IN ('open','partial')");
      else if (st === 'overdue') { where.push("d.status IN ('open','partial') AND d.due_date<?"); args.push(today); }
      else if (st) { where.push('d.status=?'); args.push(st); }
      if (q.from) { where.push('d.date>=?'); args.push(q.from); }
      if (q.to) { where.push('d.date<=?'); args.push(q.to); }
      if (q.q) { const like = '%' + q.q + '%'; where.push('(d.number LIKE ? OR c.name LIKE ? OR d.reference LIKE ? OR d.vendor_invoice_no LIKE ? OR d.subject LIKE ?)'); args.push(like, like, like, like, like); }
      const rows = db.all(`SELECT d.*, c.name contact_name, r.code rep_code FROM documents d LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN sales_reps r ON r.id=d.sales_rep_id
        WHERE ${where.join(' AND ')} ORDER BY CASE d.status WHEN 'draft' THEN 0 ELSE 1 END, d.date DESC, d.id DESC LIMIT 500`, args);
      const openTotals = new Map();
      rows.filter((d) => ['open', 'partial'].includes(d.status)).forEach((d) => openTotals.set(d.currency, (openTotals.get(d.currency) || 0) + Buku.docs.balance(d)));
      const newLabel = { sales_order: 'New sales order', invoice: 'New invoice', credit_note: 'New credit note', bill: 'New bill', expense: 'New expense' }[type];
      ui.page({
        title: t(D.plural),
        actions: '<a class="btn primary" href="#/doc/new/' + type + '">' + h(t(newLabel)) + '</a>',
        body:
          '<div class="toolbar"><nav class="tabs">' + FILTERS[type].map(([v, l]) => '<a class="' + (st === v ? 'active' : '') + '" href="' + D.list + ui.qs({ status: v, q: q.q }) + '">' + h(t(l)) + '</a>').join('') + '</nav>' +
          '<form id="df" class="inline-filter"><input type="search" name="q" value="' + h(q.q || '') + '" placeholder="' + h(t('Number, contact, reference…')) + '" aria-label="' + h(t('Search')) + '"></form></div>' +
          (openTotals.size ? '<p class="note open-total">' + h(t('Open balance')) + ': ' + Array.from(openTotals).map(([c, v]) => '<strong>' + h(U2().money(v, c)) + '</strong>').join(' · ') + '</p>' : '') +
          (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(type === 'expense' ? t('Description') : D.side === 'sale' ? t('Customer') : t('Vendor')) + '</th>' +
            (type === 'invoice' || type === 'bill' ? '<th>' + h(t('Due')) + '</th>' : '') + '<th class="num">' + h(t('Total')) + '</th>' + (type === 'invoice' || type === 'bill' ? '<th class="num">' + h(t('Balance')) + '</th>' : '') + '<th>' + h(t('Status')) + '</th></tr></thead><tbody>' +
            rows.map((d) => '<tr class="link" data-href="#/doc/' + d.id + '"><td class="nowrap">' + h(ui.date(d.date)) + '</td><td class="mono nowrap">' + h(d.number || '—') + (d.vendor_invoice_no ? '<div class="sub">' + h(d.vendor_invoice_no) + '</div>' : '') + '</td>' +
              '<td>' + h(d.contact_name || d.subject || '') + (d.reference && type !== 'bill' ? '<div class="sub">' + h(d.reference) + '</div>' : '') + (d.rep_code ? '<div class="sub">' + h(t('Sales')) + ' ' + h(d.rep_code) + '</div>' : '') + '</td>' +
              (type === 'invoice' || type === 'bill' ? '<td class="nowrap">' + h(d.due_date ? ui.date(d.due_date) : '') + '</td>' : '') +
              '<td class="num">' + h(U2().money(d.total, d.currency)) + '</td>' +
              (type === 'invoice' || type === 'bill' ? '<td class="num">' + (['open', 'partial'].includes(d.status) ? h(U2().money(Buku.docs.balance(d), d.currency)) : '') + '</td>' : '') +
              '<td>' + U2().chip(U2().docStatus(d)) + (d.signed_at ? ' <span class="chip ok">' + h(t('Signed')) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
            : ui.empty(st || q.q ? t('Nothing matches this filter.') : t('Nothing here yet.'), '<a class="btn primary" href="#/doc/new/' + type + '">' + h(t(newLabel)) + '</a>')),
      });
      ui.$('#df').addEventListener('submit', (e) => { e.preventDefault(); location.hash = D.list + ui.qs({ status: st, q: ui.formData(ui.$('#df')).q }); });
      U2().rowLinks();
    };
  }

  // ---------------- Editor ----------------
  function docPage(params, q) {
    if (params.id === 'new') return editor(null, params.type || q.type, q);
    const d = Buku.docs.load(Buku.db, Number(params.id));
    if (!d) throw new Buku.BukuError('not_found', t('Document not found.'));
    if (q.edit === '1' && Buku.docs.editable(Buku.db, d)) return editor(d, d.doc_type, q);
    if (d.status === 'draft') return editor(d, d.doc_type, q);
    return view(d);
  }

  function editor(existing, type, q) {
    const db = Buku.db;
    if (!U2().DOC[type]) throw new Buku.BukuError('bad_type', 'Unknown document type');
    const D = U2().DOC[type];
    const sale = D.side === 'sale';
    const base = Buku.fx.base(db);
    const today = Buku.util.today();
    const d = existing || {};
    const contactId = d.contact_id || (q.contact ? Number(q.contact) : '');
    const contact = contactId ? db.get('SELECT * FROM contacts WHERE id=?', [contactId]) : null;
    const settings = { deferred: db.setting('deferred_revenue') !== false };
    const addresses = db.all('SELECT * FROM company_addresses WHERE is_active=1 ORDER BY is_default DESC, label');
    const templates = db.all("SELECT * FROM doc_templates WHERE doc_type IN (?, 'all') ORDER BY is_default DESC, name", [type]);
    const products = db.all('SELECT * FROM products WHERE is_active=1 AND ' + (sale ? 'is_sold=1' : 'is_bought=1') + ' ORDER BY kind, name');
    const defaultTax = sale ? db.scalar("SELECT id FROM taxes WHERE code='PPN11' AND is_active=1") : null;
    const state = {
      currency: d.currency || (contact && contact.currency) || base,
      rate: d.rate && d.currency !== base ? Buku.money.formatRate(d.rate) : '',
      rateTouched: !!(d.rate && d.currency && d.currency !== base),
      lines: (d.lines || []).map((l) => Object.assign({}, l)),
      dirty: false,
    };
    // Opening documents (unpaid before go-live) post against Ekuitas Saldo Awal, without tax.
    const obe = db.get("SELECT * FROM accounts WHERE subtype='opening_balance' AND is_active=1 ORDER BY code LIMIT 1");
    const opening = (q.opening === '1' || (existing && d.lines.length && d.lines.every((l) => obe && l.account_id === obe.id))) && !!obe && (type === 'invoice' || type === 'bill');
    if (!state.lines.length) state.lines.push(blankLine());
    function blankLine() { return { product_id: '', item_label: '', description: '', quantity: 1000, unit: '', unit_price: 0, discount_percent: '', tax_id: sale && !opening ? defaultTax || '' : '', account_id: opening ? obe.id : '', start_date: '', end_date: '', line_note: '' }; }

    const curDec = () => ui.curDecimals(state.currency);
    const contactSel = '<div class="with-add">' + ui.select('contact_id', U2().contactOptions(sale ? 'customer' : 'vendor', sale ? t('Choose customer…') : t('Choose vendor…')), contactId) +
      '<button type="button" class="btn small ghost" id="add-contact">' + h(t('New')) + '</button></div>';
    const titleText = existing ? (d.number ? t(D.label) + ' ' + d.number : t('Draft') + ' · ' + t(D.label)) : t({ sales_order: 'New sales order', invoice: 'New invoice', credit_note: 'New credit note', bill: 'New bill', expense: 'New expense' }[type]);
    const termsDays = d.terms_days !== undefined && d.terms_days !== null ? d.terms_days : contact && contact.payment_terms_days !== null && contact.payment_terms_days !== undefined ? contact.payment_terms_days : (type === 'invoice' ? 7 : type === 'bill' ? 30 : '');
    const date = d.date || today;
    const tb = d.text_blocks || {};
    const fundAccs = db.all("SELECT * FROM accounts WHERE is_active=1 AND is_header=0 AND (subtype IN ('cash','bank') OR (type='liability' AND subtype IN ('current_liability'))) ORDER BY subtype<>'bank', code");
    const whtOpts = [{ value: '', label: t('No withholding') }].concat(db.all("SELECT * FROM taxes WHERE is_active=1 AND direction IN ('withheld_by_us','final') ORDER BY kind").map((x) => ({ value: x.id, label: x.name })));

    let headFields = '';
    if (type !== 'expense') headFields += ui.field(sale ? t('Customer') : t('Vendor'), contactSel, { cls: 'span2' });
    if (sale) headFields += ui.field('PIC', ui.input('pic_name', d.pic_name || (contact && contact.pic_name) || ''), { optional: true });
    headFields += ui.field(t('Date'), ui.input('date', date, { type: 'date' }));
    if (type === 'invoice' || type === 'bill' || type === 'sales_order') {
      headFields += ui.field(t('Terms (days)'), ui.input('terms_days', termsDays, { type: 'number', attrs: 'min="0" max="365"' }));
      if (type !== 'sales_order') headFields += ui.field(t('Due date'), ui.input('due_date', d.due_date || (termsDays !== '' ? Buku.util.addDays(date, Number(termsDays)) : date), { type: 'date' }));
    }
    if (type === 'sales_order') headFields += ui.field(t('Validity'), ui.input('validity_text', d.validity_text || '1 Month')) + ui.field(t('Valid until'), ui.input('valid_until', d.valid_until || Buku.util.addDays(date, 30), { type: 'date' }), { optional: true });
    if (sale && type !== 'credit_note') headFields += ui.field(t('Payment term'), ui.input('payment_term_text', d.payment_term_text || (contact && contact.payment_term_text) || 'Payment Before Delivery'));
    headFields += ui.field(t('Currency'), ui.select('currency', U2().currencyOptions(), state.currency)) + '<div id="rate-slot"></div>';
    if (sale) headFields += ui.field(t('Sales rep'), ui.select('sales_rep_id', U2().repOptions(), d.sales_rep_id || (contact && contact.sales_rep_id) || ''));
    if (type === 'sales_order') headFields += ui.field(t('Opportunity / reference no.'), ui.input('reference', d.reference || ''), { optional: true });
    if (type === 'invoice' || type === 'credit_note') headFields += ui.field(type === 'invoice' ? t('Customer PO / reference') : t('Invoice reference'), ui.input('reference', d.reference || ''), { optional: true });
    if (type === 'bill') headFields += ui.field(t('Vendor invoice no.'), ui.input('vendor_invoice_no', d.vendor_invoice_no || ''));
    if (type === 'expense') headFields += ui.field(t('Paid from'), ui.select('paid_from_account_id', fundAccs.map((a) => ({ value: a.id, label: a.code + ' · ' + Buku.i18n.accName(a) })), d.paid_from_account_id || '')) +
      ui.field(t('What was it for?'), ui.input('subject', d.subject || '', { placeholder: t('e.g. Office supplies October') }), { cls: 'span2' }) + ui.field(t('Paid to'), ui.select('contact_id', U2().contactOptions('vendor', t('— optional —')), contactId), { optional: true });
    if (!sale) headFields += ui.field(t('Withholding (we withhold)'), ui.select('withholding_tax_id', whtOpts, d.withholding_tax_id || ''), { hint: t('PPh 23 on services from companies, PPh 21 for individuals.') });
    if (sale && addresses.length > 1) headFields += ui.field(t('Our address'), ui.select('company_address_id', addresses.map((a) => ({ value: a.id, label: a.label })), d.company_address_id || addresses[0].id));
    if (sale) headFields += ui.field(t('Template'), ui.select('template_id', [{ value: '', label: t('Default') }].concat(templates.map((x) => ({ value: x.id, label: x.name }))), d.template_id || (contact && contact.default_template_id) || ''));

    const prodOptions = [{ value: '', label: t('— product —') }].concat(products.map((p) => ({ value: p.id, label: p.name + (p.kind === 'plan' ? ' ⟳' : '') })));
    const taxKinds = sale ? ['ppn_out'] : ['ppn_in'];
    const accOpts = ui.accountOptions({ empty: sale ? t('Default account') : t('Choose account…') });
    const showPeriod = sale;

    ui.page({
      title: titleText,
      nav: D.list,
      cls: 'doc-editor',
      actions: (existing && !d.number && d.status === 'draft' ? '<button type="button" class="btn ghost danger-text" id="del">' + h(t('Delete draft')) + '</button>' : '') +
        '<a class="btn ghost" href="' + (existing ? '#/doc/' + d.id : D.list) + '">' + h(t('Cancel')) + '</a>',
      body:
        (opening ? '<div class="banner info"><div><strong>' + h(t('Opening document')) + '</strong> ' + h(t('Use the original number in the reference and the original dates. It posts against {acc}.', { acc: obe.code + ' ' + obe.name })) + '</div></div>' : '') +
        (d.status === 'confirmed' ? '<div class="banner info"><div>' + h(t('Editing a confirmed sales order. Nothing has been invoiced from it yet.')) + '</div></div>' : '') +
        '<form id="doc" novalidate><div class="doc-head">' + headFields + '</div>' +
        '<div class="table-wrap"><table class="lines doc-lines"><thead><tr><th class="c-prod">' + h(t('Product / description')) + '</th><th class="num c-qty">' + h(t('Qty')) + '</th><th class="c-unit">' + h(t('Unit')) + '</th>' +
        '<th class="num c-price">' + h(t('Price')) + '</th><th class="num c-disc">' + h(t('Disc. %')) + '</th><th class="c-tax">' + h(t('Tax')) + '</th><th class="num c-amt">' + h(t('Amount')) + '</th><th class="c-x"></th></tr></thead><tbody id="dl"></tbody></table></div>' +
        '<button type="button" class="btn small ghost" id="add-line">' + h(t('Add line')) + '</button>' +
        '<div class="doc-bottom"><div class="doc-notes">' +
        ui.field(type === 'bill' || type === 'expense' ? t('Internal note') : t('Note (printed under the lines)'), '<textarea name="note" rows="2">' + h(d.note || '') + '</textarea>', { optional: true }) +
        (sale ? '<details class="text-blocks"><summary>' + h(t('Document text (optional overrides)')) + '</summary><p class="hint">' + h(t('Leave empty to use the template’s text. **bold**, *italic*, lines starting with • become bullets. Placeholders: {company}, {customer}, {total}, {due_date}, {finance_phone}.')) + '</p>' +
          ['intro', 'terms', 'notes', 'legal', 'payment'].map((k) => ui.field(t({ intro: 'Opening paragraph', terms: 'Terms', notes: 'Notes (Catatan)', legal: 'Legal clause', payment: 'Payment instructions' }[k]), '<textarea name="tb_' + k + '" rows="3" placeholder="' + h(t('Template default')) + '">' + h(tb[k] || '') + '</textarea>')).join('') + '</details>' : '') +
        '</div><div class="doc-totals" id="totals"></div></div>' +
        '<div class="form-actions sticky"><span class="hint" id="fx-hint"></span>' +
        '<button type="button" class="btn" id="preview">' + h(t('Preview')) + '</button>' +
        '<button type="button" class="btn" id="save">' + h(t('Save draft')) + '</button>' +
        '<button type="submit" class="btn primary" id="finish">' + h(t({ sales_order: 'Confirm sales order', invoice: 'Approve invoice', credit_note: 'Approve credit note', bill: 'Approve bill', expense: 'Record expense' }[type])) + '</button></div></form>',
    });

    const formEl = ui.$('#doc');
    const tbody = ui.$('#dl');

    function renderRate() {
      const slot = ui.$('#rate-slot');
      if (state.currency === base) { slot.innerHTML = ''; return; }
      const dt = formEl.querySelector('[name=date]').value;
      const found = Buku.fx.lookup(db, state.currency, dt);
      if (!state.rateTouched && found) state.rate = Buku.money.formatRate(found.rate);
      slot.innerHTML = ui.field(t('Rate (IDR per {cur})', { cur: state.currency }), '<input name="rate" class="num" inputmode="decimal" value="' + h(state.rate) + '">',
        { hint: found ? t('Latest saved rate is from {date}', { date: ui.date(found.rate_date) }) : t('No saved rate. It will be saved for this date.') });
      slot.querySelector('[name=rate]').addEventListener('input', (e) => { state.rate = e.target.value; state.rateTouched = true; state.dirty = true; recalc(); });
    }

    function lineRow(l, i) {
      const prod = l.product_id ? products.find((p) => p.id === Number(l.product_id)) : null;
      const isPlan = prod && prod.kind === 'plan';
      return '<tr data-i="' + i + '" class="dl-main"><td class="c-prod">' +
        (products.length ? ui.select('product_id', prodOptions, l.product_id || '') : '') +
        '<input name="item_label" value="' + h(l.item_label || '') + '" placeholder="' + h(t('Item (optional)')) + '" class="small-in">' +
        '<textarea name="description" rows="2" placeholder="' + h(t('Description')) + '">' + h(l.description || '') + '</textarea>' +
        (!sale ? ui.select('account_id', accOpts, l.account_id || (prod && prod.expense_account_id) || '') : opening ? '<div class="sub">→ ' + h(obe.code + ' ' + obe.name) + '</div>' : '') +
        (showPeriod ? '<div class="dl-extra' + (isPlan || l.start_date ? ' open' : '') + '"><label>' + h(t('Start')) + ' <input type="date" name="start_date" value="' + h(l.start_date || '') + '"></label>' +
          '<label>' + h(t('End')) + ' <input type="date" name="end_date" value="' + h(l.end_date || '') + '"></label>' +
          (type === 'sales_order' ? '<label>' + h(t('Note')) + ' <input name="line_note" value="' + h(l.line_note || '') + '"></label>' : '') + '</div>' +
          (!(isPlan || l.start_date) ? '<button type="button" class="link-btn show-extra">' + h(t('+ period / note')) + '</button>' : '') : '') +
        (isPlan && settings.deferred && type === 'invoice' ? '<div class="sub">' + h(t('Subscription · revenue deferred until handover')) + '</div>' : '') +
        (l.qty_fulfilled ? '<div class="sub">' + h(t('{n} already invoiced', { n: U2().qtyText(l.qty_fulfilled) })) + '</div>' : '') +
        '</td>' +
        '<td class="c-qty"><input name="quantity" class="num" inputmode="decimal" value="' + h(U2().qtyText(l.quantity)) + '"></td>' +
        '<td class="c-unit"><input name="unit" value="' + h(l.unit || '') + '" placeholder="' + h(t('Unit')) + '"></td>' +
        '<td class="c-price"><input name="unit_price" class="num" inputmode="decimal" data-decimals="' + curDec() + '" value="' + h(l.unit_price ? Buku.money.format(l.unit_price, curDec()) : '') + '"></td>' +
        '<td class="c-disc"><input name="discount_percent" class="num" inputmode="decimal" value="' + h(l.discount_percent || '') + '" placeholder="0"></td>' +
        '<td class="c-tax">' + ui.select('tax_id', U2().taxOptions(taxKinds), l.tax_id || '') + '</td>' +
        '<td class="c-amt num" data-amt></td>' +
        '<td class="c-x"><button type="button" class="icon-btn remove" aria-label="' + h(t('Remove line')) + '">✕</button></td></tr>';
    }

    function render() { tbody.innerHTML = state.lines.map(lineRow).join(''); recalc(); }

    function readLines(strict) {
      return state.lines.map((l) => {
        const x = Object.assign({}, l);
        try { x.quantity = U2().readQty(l._qty !== undefined ? l._qty : U2().qtyText(l.quantity)); } catch (e) { if (strict) throw e; x.quantity = 0; }
        try { x.unit_price = l._price !== undefined ? Buku.money.parse(l._price, curDec()) || 0 : l.unit_price || 0; } catch (e) { if (strict) throw e; x.unit_price = 0; }
        x.discount_percent = (x.discount_percent || '').toString().replace(',', '.') || null;
        x.product_id = x.product_id ? Number(x.product_id) : null;
        x.tax_id = x.tax_id ? Number(x.tax_id) : null;
        x.account_id = x.account_id ? Number(x.account_id) : null;
        delete x._qty; delete x._price;
        return x;
      });
    }

    function header() {
      const f = ui.formData(formEl);
      return {
        discount_type: f.discount_type || 'none', discount_value: f.discount_type === 'amount' ? (() => { try { return Buku.money.parse(f.discount_value, curDec()); } catch (e) { return 0; } })() : f.discount_value,
        withholding_tax_id: f.withholding_tax_id ? Number(f.withholding_tax_id) : null,
      };
    }

    function recalc() {
      let c;
      const lines = readLines(false);
      const valid = lines.filter((l) => l.product_id || l.description || l.unit_price || l.item_label);
      try { c = Buku.docs.compute(db, header(), valid.length ? valid : [{ quantity: 0, unit_price: 0 }]); } catch (e) { c = null; }
      let vi = 0;
      lines.forEach((l, i) => {
        const cell = tbody.querySelector('tr[data-i="' + i + '"] [data-amt]');
        if (!cell) return;
        const used = l.product_id || l.description || l.unit_price || l.item_label;
        cell.textContent = used && c ? Buku.money.format(c.lines[vi++].line_net, curDec()) : '';
      });
      const tot = ui.$('#totals');
      const prevType = (formEl.querySelector('[name=discount_type]') || {}).value || d.discount_type || 'none';
      const prevVal = (formEl.querySelector('[name=discount_value]') || {}).value;
      const discVal = prevVal !== undefined ? prevVal : d.discount_type === 'amount' ? Buku.money.format(Number(d.discount_value || 0), curDec()) : d.discount_value || '';
      const cur = state.currency;
      if (!tot.dataset.built) {
        tot.dataset.built = '1';
        tot.innerHTML = '<div class="tot-row"><span>' + h(t('Subtotal')) + '</span><strong class="num" data-t="subtotal"></strong></div>' +
          '<div class="tot-row disc"><span>' + h(t('Discount')) + ' ' + ui.select('discount_type', [{ value: 'none', label: '—' }, { value: 'percent', label: '%' }, { value: 'amount', label: cur }], prevType) +
          '<input name="discount_value" class="num small" inputmode="decimal" value="' + h(discVal) + '"></span><strong class="num" data-t="discount"></strong></div>' +
          '<div data-t="taxes"></div><div class="tot-row grand"><span>' + h(t('Total')) + '</span><strong class="num" data-t="total"></strong></div><div data-t="wht"></div><div data-t="base"></div>';
        tot.addEventListener('input', () => { state.dirty = true; recalc(); });
        tot.addEventListener('change', () => { state.dirty = true; recalc(); });
      }
      const F = (v) => U2().money(v, cur);
      const set = (k, html) => { const el = tot.querySelector('[data-t=' + k + ']'); if (el) el.innerHTML = html; };
      if (!c) { set('total', '—'); return; }
      set('subtotal', h(F(c.subtotal)));
      set('discount', c.discount_total ? '− ' + h(F(c.discount_total)) : '—');
      set('taxes', c.taxLines.map((x) => '<div class="tot-row"><span>' + h(x.tax.print_label || x.tax.name) + (x.tax.base_num !== x.tax.base_den ? ' <em class="sub">DPP ' + h(F(x.dpp)) + '</em>' : '') + '</span><strong class="num">' + h(F(x.amount)) + '</strong></div>').join(''));
      set('total', h(F(c.total)));
      set('wht', c.withholding_total ? '<div class="tot-row"><span>' + h(c.withholdingTax.name) + '</span><strong class="num">− ' + h(F(c.withholding_total)) + '</strong></div><div class="tot-row grand"><span>' + h(t('To pay vendor')) + '</span><strong class="num">' + h(F(c.total - c.withholding_total)) + '</strong></div>' : '');
      let baseNote = '';
      if (cur !== base) { try { baseNote = '≈ ' + ui.idr(Buku.money.toBase(c.total, curDec(), state.rate), { code: true }); } catch (e) { baseNote = t('Enter the exchange rate'); } }
      set('base', baseNote ? '<p class="note">' + h(baseNote) + '</p>' : '');
      if (sale && type !== 'credit_note' && c.net) {
        const pph = db.get("SELECT * FROM taxes WHERE kind='pph23' AND direction='withheld_by_customer' AND is_active=1 LIMIT 1");
        const cc = formEl.querySelector('[name=contact_id]') && formEl.querySelector('[name=contact_id]').value ? db.get('SELECT withholds_pph23, is_individual FROM contacts WHERE id=?', [Number(formEl.querySelector('[name=contact_id]').value)]) : null;
        ui.$('#fx-hint').textContent = pph && cc && cc.withholds_pph23 && !cc.is_individual ? t('Customer will likely pay {amount} after PPh 23.', { amount: F(c.total - Buku.tax.amount(c.net, pph)) }) : '';
      }
    }

    function applyProduct(l, prod) {
      const dt = formEl.querySelector('[name=date]').value;
      const rate = state.currency === base ? '1' : state.rate || '1';
      l.product_id = prod.id;
      l.unit = prod.unit || l.unit;
      if (!l.description) l.description = prod.description || prod.name;
      let price = 0;
      try { price = Buku.docs.productPrice(db, prod.id, state.currency, rate); } catch (e) { price = 0; }
      l.unit_price = price; delete l._price;
      l.tax_id = opening ? '' : sale ? (prod.tax_id || (contact && contact.default_tax_id) || defaultTax || '') : (prod.purchase_tax_id || '');
      if (!sale && prod.expense_account_id && !opening) l.account_id = prod.expense_account_id;
      if (prod.kind === 'plan') {
        l.quantity = (prod.default_months || 1) * 1000; delete l._qty;
        if (!l.unit) l.unit = 'Months';
        const start = l.start_date || Buku.util.monthStart(dt, 1);
        l.start_date = start;
        l.end_date = Buku.subscriptions.endDate(start, prod.default_months || 1);
        if (type === 'sales_order' && !l.line_note) l.line_note = String(prod.default_months || '');
        if (prod.default_note && !formEl.querySelector('[name=note]').value) formEl.querySelector('[name=note]').value = prod.default_note;
      }
    }

    tbody.addEventListener('change', (ev) => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const l = state.lines[Number(tr.dataset.i)];
      const n = ev.target.name;
      if (n === 'product_id') {
        const prod = products.find((p) => p.id === Number(ev.target.value));
        if (prod) applyProduct(l, prod); else l.product_id = '';
        if (Number(tr.dataset.i) === state.lines.length - 1 && prod) state.lines.push(blankLine());
        render();
      } else if (n === 'tax_id' || n === 'account_id') l[n] = ev.target.value;
      else if (n === 'start_date') {
        l.start_date = ev.target.value;
        const prod = products.find((p) => p.id === Number(l.product_id));
        if (prod && prod.kind === 'plan' && l.start_date) {
          const months = Math.max(1, Math.round(U2().readQty(l._qty !== undefined ? l._qty : U2().qtyText(l.quantity)) / 1000));
          l.end_date = Buku.subscriptions.endDate(l.start_date, months);
          tr.querySelector('[name=end_date]').value = l.end_date;
        }
      } else if (n === 'end_date') l.end_date = ev.target.value;
      state.dirty = true;
      recalc();
    });
    tbody.addEventListener('input', (ev) => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const l = state.lines[Number(tr.dataset.i)];
      const n = ev.target.name;
      ev.target.classList.remove('invalid');
      if (n === 'quantity') l._qty = ev.target.value;
      else if (n === 'unit_price') l._price = ev.target.value;
      else if (['item_label', 'description', 'unit', 'discount_percent', 'line_note'].includes(n)) l[n] = ev.target.value;
      state.dirty = true;
      recalc();
    });
    tbody.addEventListener('focusout', (ev) => {
      if (ev.target.name !== 'unit_price') return;
      try { const v = Buku.money.parse(ev.target.value, curDec()); ev.target.value = v ? Buku.money.format(v, curDec()) : ''; } catch (e) { ev.target.classList.add('invalid'); }
    });
    tbody.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      if (ev.target.closest('.remove')) {
        const l = state.lines[Number(tr.dataset.i)];
        if (l.qty_fulfilled) { ui.toast(t('This line is already partly invoiced.'), 'error'); return; }
        state.lines.splice(Number(tr.dataset.i), 1);
        if (!state.lines.length) state.lines.push(blankLine());
        state.dirty = true; render();
      }
      if (ev.target.closest('.show-extra')) { tr.querySelector('.dl-extra').classList.add('open'); ev.target.remove(); }
    });
    ui.$('#add-line').addEventListener('click', () => { state.lines.push(blankLine()); render(); });

    formEl.addEventListener('change', (ev) => {
      const n = ev.target.name;
      if (n === 'contact_id' && ev.target.value) {
        const c = db.get('SELECT * FROM contacts WHERE id=?', [Number(ev.target.value)]);
        const set = (name, v) => { const el = formEl.querySelector('[name=' + name + ']'); if (el && v !== null && v !== undefined && v !== '') el.value = v; };
        set('pic_name', c.pic_name); set('sales_rep_id', c.sales_rep_id); set('payment_term_text', c.payment_term_text); set('template_id', c.default_template_id);
        if (c.payment_terms_days !== null && c.payment_terms_days !== undefined) { set('terms_days', c.payment_terms_days); syncDue(); }
        if (c.currency && c.currency !== state.currency && !state.lines.some((l) => l.unit_price)) { formEl.querySelector('[name=currency]').value = c.currency; changeCurrency(c.currency); }
      }
      if (n === 'date' || n === 'terms_days') { syncDue(); if (n === 'date') { state.rateTouched = false; renderRate(); } }
      if (n === 'currency') changeCurrency(ev.target.value);
      state.dirty = true;
    });
    formEl.addEventListener('input', (ev) => { if (ev.target.name && ev.target.closest('.doc-head, .doc-notes')) state.dirty = true; });

    function syncDue() {
      const due = formEl.querySelector('[name=due_date]');
      const days = formEl.querySelector('[name=terms_days]');
      const dt = formEl.querySelector('[name=date]').value;
      if (due && days && days.value !== '' && Buku.util.isIsoDate(dt)) due.value = Buku.util.addDays(dt, Number(days.value));
      const vu = formEl.querySelector('[name=valid_until]');
      if (vu && Buku.util.isIsoDate(dt) && !existing) vu.value = Buku.util.addDays(dt, 30);
    }

    function changeCurrency(cur) {
      const oldDec = curDec();
      // Keep typed prices as numbers in the new currency (re-read with its decimals).
      state.lines.forEach((l) => { if (l._price === undefined && l.unit_price) l._price = Buku.money.format(l.unit_price, oldDec); });
      state.currency = cur; state.rate = ''; state.rateTouched = false;
      renderRate();
      ui.$('#totals').dataset.built = '';
      render();
    }

    const addContact = ui.$('#add-contact');
    if (addContact) addContact.addEventListener('click', async () => {
      const id = await U2().newContact(sale ? 'customer' : 'vendor');
      const sel = formEl.querySelector('[name=contact_id]');
      sel.innerHTML = U2().contactOptions(sale ? 'customer' : 'vendor', sale ? t('Choose customer…') : t('Choose vendor…')).map((o) => '<option value="' + o.value + '">' + h(o.label) + '</option>').join('');
      sel.value = id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });

    function collect() {
      const f = ui.formData(formEl);
      const lines = readLines(true);
      const input = {
        id: existing ? d.id : undefined,
        contact_id: f.contact_id ? Number(f.contact_id) : null, pic_name: f.pic_name || null, sales_rep_id: f.sales_rep_id ? Number(f.sales_rep_id) : null,
        company_address_id: f.company_address_id ? Number(f.company_address_id) : (existing ? d.company_address_id : null), date: f.date,
        due_date: f.due_date || null, terms_days: f.terms_days === '' || f.terms_days === undefined ? null : Number(f.terms_days), valid_until: f.valid_until || null,
        validity_text: f.validity_text || null, payment_term_text: f.payment_term_text || null, reference: f.reference || null, vendor_invoice_no: f.vendor_invoice_no || null,
        subject: f.subject || null, note: f.note || null, currency: state.currency, rate: state.currency !== base ? state.rate : '1',
        discount_type: f.discount_type || 'none', discount_value: null, withholding_tax_id: f.withholding_tax_id ? Number(f.withholding_tax_id) : null,
        paid_from_account_id: f.paid_from_account_id ? Number(f.paid_from_account_id) : null, template_id: f.template_id ? Number(f.template_id) : null,
        source_doc_id: existing ? d.source_doc_id : null, faktur_no: existing ? d.faktur_no : null, faktur_date: existing ? d.faktur_date : null,
        text_blocks: sale ? Object.fromEntries(['intro', 'terms', 'notes', 'legal', 'payment'].map((k) => [k, f['tb_' + k] || null]).filter(([, v]) => v)) : {},
        lines,
      };
      if (input.discount_type === 'amount') input.discount_value = Buku.money.parse(f.discount_value, curDec()) || 0;
      else if (input.discount_type === 'percent') input.discount_value = (f.discount_value || '0').replace(',', '.');
      if (type === 'expense' && !input.subject && lines[0]) input.subject = lines[0].description;
      return input;
    }

    function saveRate(input) {
      if (input.currency === base) return;
      const r = Buku.fx.lookup(db, input.currency, input.date);
      if (!r || r.rate_date !== input.date) Buku.fx.set(db, input.currency, input.date, input.rate);
    }

    function save(thenFinish) {
      const input = collect();
      let id;
      db.tx(() => {
        saveRate(input);
        id = Buku.docs.save(db, type, input);
        if (thenFinish) {
          if (type === 'sales_order') { if (!existing || d.status === 'draft') Buku.docs.confirm(db, id); }
          else Buku.docs.approve(db, id);
        }
      });
      state.dirty = false;
      return id;
    }

    ui.$('#save').addEventListener('click', () => {
      try {
        const id = save(false);
        ui.toast(t('Draft saved'));
        if (!existing) location.hash = '#/doc/' + id; else ui.dispatch();
      } catch (e) { ui.showError(e); }
    });
    formEl.addEventListener('submit', (ev) => {
      ev.preventDefault();
      try {
        const id = save(true);
        const doc = db.get('SELECT number FROM documents WHERE id=?', [id]);
        ui.toast(t('{doc} {number} saved', { doc: t(D.label), number: doc.number || '' }));
        location.hash = '#/doc/' + id;
        if (existing && location.hash === '#/doc/' + id) ui.dispatch();
      } catch (e) { ui.showError(e); }
    });
    ui.$('#preview').addEventListener('click', () => {
      try {
        if (!sale) { ui.toast(t('Preview is available for sales documents.')); return; }
        const id = save(false);
        if (!existing) history.replaceState(null, '', '#/doc/' + id);
        const m = ui.modal({ title: t('Preview'), wide: true, body: '<div class="doc-stage" id="pv"></div>', actions: [{ label: t('Close'), kind: 'primary' }] });
        m.el.querySelector('.modal').classList.add('xwide');
        U2().showPaper(m.body.querySelector('#pv'), Buku.templates.renderDocument(db, id));
        if (!existing) { m.close = ((orig) => () => { orig(); ui.dispatch(); })(m.close); }
      } catch (e) { ui.showError(e); }
    });
    const del = ui.$('#del');
    if (del) del.addEventListener('click', async () => {
      if (!(await ui.confirm(t('Delete this draft?'), { danger: true, okLabel: t('Delete draft') }))) return;
      try { Buku.docs.deleteDraft(db, d.id); state.dirty = false; location.hash = D.list; } catch (e) { ui.showError(e); }
    });
    ui.setLeaveGuard(() => (state.dirty ? t('You have unsaved changes. Leave anyway?') : null));
    renderRate();
    render();
  }

  // ---------------- View ----------------
  function view(d) {
    const db = Buku.db;
    const D = U2().DOC[d.doc_type];
    const sale = D.side === 'sale';
    const status = U2().docStatus(d);
    const cur = d.currency;
    const M = (v) => U2().money(v, cur);
    const payments = db.all(`SELECT a.*, p.number, p.date, p.id pid, p.status pstatus FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.document_id=? ORDER BY p.date`, [d.id]);
    const apps = db.all(`SELECT x.*, c.number cn_number, c.id cn_id, i.number inv_number, i.id inv_id FROM document_applications x JOIN documents c ON c.id=x.credit_doc_id JOIN documents i ON i.id=x.document_id WHERE x.credit_doc_id=? OR x.document_id=?`, [d.id, d.id]);
    const children = db.all("SELECT * FROM documents WHERE source_doc_id=? ORDER BY id", [d.id]);
    const source = d.source_doc_id ? db.get('SELECT * FROM documents WHERE id=?', [d.source_doc_id]) : null;
    const subs = d.doc_type === 'invoice' ? db.all('SELECT * FROM subscriptions WHERE invoice_id=?', [d.id]) : [];
    const open = ['open', 'partial'].includes(d.status);
    const fileTitle = [d.number, d.contact_name, d.reference].filter(Boolean).join(' - ');
    const hasPreview = sale;

    const acts = [];
    const A = (id, label, kind) => acts.push('<button type="button" class="btn ' + (kind || '') + '" data-act="' + id + '">' + h(label) + '</button>');
    if (d.doc_type === 'sales_order') {
      if (['confirmed', 'partial'].includes(d.status)) A('invoice', t('Create invoice'), 'primary');
      if (Buku.docs.editable(db, d)) A('edit', t('Edit'));
      if (['confirmed', 'partial'].includes(d.status)) A('signed', d.signed_at ? t('Signed {date}', { date: ui.date(d.signed_at) }) : t('Mark as signed'));
      if (d.status === 'partial' || d.status === 'confirmed') A('close', d.status === 'confirmed' ? t('Cancel order') : t('Close order'), 'ghost');
      if (d.status === 'closed' || d.status === 'cancelled') A('reopen', t('Reopen'), 'ghost');
    }
    if (d.doc_type === 'invoice' && open) { A('pay', t('Record payment'), 'primary'); }
    if (d.doc_type === 'bill' && open) A('payout', t('Pay bill'), 'primary');
    if (d.doc_type === 'credit_note' && open) { A('apply', t('Apply to invoice'), 'primary'); A('refund', t('Refund'), ''); }
    if (d.doc_type === 'invoice' && ['open', 'partial', 'paid'].includes(d.status)) { A('faktur', d.faktur_no ? t('Faktur {n}', { n: d.faktur_no }) : t('Add faktur pajak no.')); if (!Buku.docs.isPropertySale(db, d.id)) A('credit', t('Credit note'), 'ghost'); }
    if (hasPreview) A('print', t('Print / PDF'));
    A('dup', t('Duplicate'), 'ghost');
    if (['open', 'partial', 'paid'].includes(d.status) && !Buku.docs.hasSettlements(db, d.id) || (d.doc_type === 'expense' && d.status === 'paid')) {
      if (d.doc_type !== 'expense') A('redraft', t('Back to draft'), 'ghost');
      A('void', t('Void'), 'ghost danger-text');
    }

    const facts = [
      [t('Status'), null, U2().chip(status) + (d.signed_at ? ' <span class="chip ok">' + h(t('Signed')) + '</span>' : '')],
      [sale ? t('Customer') : t('Vendor'), d.contact_name ? null : '—', d.contact_name ? '<a href="#/contacts/' + d.contact_id + '">' + h(d.contact_name) + '</a>' : null],
      [t('Date'), ui.date(d.date)],
      d.due_date ? [t('Due'), ui.date(d.due_date)] : null,
      [t('Total'), M(d.total)],
      d.withholding_total ? [t('Withheld by us'), M(d.withholding_total)] : null,
      ['invoice', 'bill', 'credit_note'].includes(d.doc_type) && d.status !== 'draft' ? [d.doc_type === 'credit_note' ? t('Applied') : t('Paid'), M(d.amount_paid)] : null,
      ['invoice', 'bill', 'credit_note'].includes(d.doc_type) && open ? [t('Balance'), null, '<strong>' + h(M(Buku.docs.balance(d))) + '</strong>'] : null,
      cur !== Buku.fx.base(db) ? [t('Rate'), Buku.money.formatRate(d.rate) + (d.total_base ? ' · ' + ui.idr(d.total_base, { code: true }) : '')] : null,
      d.faktur_no ? [t('Faktur pajak'), d.faktur_no + (d.faktur_date ? ' · ' + ui.date(d.faktur_date) : '')] : null,
      d.journal_entry_id ? [t('Journal'), null, '<a href="#/journal/' + d.journal_entry_id + '">' + h(t('View entry')) + '</a>'] : null,
    ].filter(Boolean);

    const related = [];
    if (source) related.push('<li>' + h(t(U2().DOC[source.doc_type].label)) + ' <a href="#/doc/' + source.id + '">' + h(source.number || t('Draft')) + '</a></li>');
    children.forEach((c) => related.push('<li>' + h(t(U2().DOC[c.doc_type].label)) + ' <a href="#/doc/' + c.id + '">' + h(c.number || t('Draft')) + '</a> ' + U2().chip(U2().docStatus(c)) + '</li>'));
    payments.forEach((p) => related.push('<li>' + h(t('Payment')) + ' <a href="#/payments/' + p.pid + '">' + h(p.number) + '</a> · ' + h(ui.date(p.date)) + ' · ' + h(M(p.amount)) + (p.withholding ? ' (' + h(t('incl. PPh 23 {a}', { a: M(p.withholding) })) + ')' : '') + (p.pstatus === 'void' ? ' ' + U2().chip('void') : '') + '</li>'));
    apps.forEach((x) => related.push('<li>' + (x.credit_doc_id === d.id ? h(t('Applied to')) + ' <a href="#/doc/' + x.inv_id + '">' + h(x.inv_number) + '</a>' : h(t('Credit note')) + ' <a href="#/doc/' + x.cn_id + '">' + h(x.cn_number) + '</a>') + ' · ' + h(M(x.amount)) + '</li>'));
    subs.forEach((s) => related.push('<li>' + h(t('Subscription')) + ' <a href="#/subscriptions?open=' + s.id + '">' + h(s.months + ' ' + t('months')) + '</a> ' + U2().chip(Buku.subscriptions.displayStatus(s, Buku.util.today())) + '</li>'));

    ui.page({
      title: t(D.label) + ' ' + (d.number || ''),
      nav: D.list,
      cls: 'doc-view',
      actions: '<a class="btn ghost" href="' + D.list + '">' + h(t('Back')) + '</a>',
      body: '<div class="doc-layout"><div class="doc-main">' +
        (hasPreview ? '<div class="doc-stage" id="paper"></div>' : purchaseSummary(d)) +
        '</div><aside class="doc-side"><div class="panel"><dl class="facts one">' + facts.map(([k, v, html]) => '<div><dt>' + h(k) + '</dt><dd>' + (html || h(v)) + '</dd></div>').join('') + '</dl>' +
        '<div class="stack" id="acts">' + acts.join('') + '</div></div>' +
        (related.length ? '<div class="panel"><header><h2>' + h(t('Related')) + '</h2></header><ul class="related">' + related.join('') + '</ul></div>' : '') +
        '</aside></div>',
    });
    if (hasPreview) U2().showPaper(ui.$('#paper'), Buku.templates.renderDocument(db, d.id));

    ui.$('#acts').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      try {
        if (act === 'print') U2().printPaper(ui.$('#paper'), fileTitle);
        if (act === 'edit') location.hash = '#/doc/' + d.id + '?edit=1';
        if (act === 'pay') location.hash = '#/payments/new' + ui.qs({ direction: 'in', contact: d.contact_id, doc: d.id });
        if (act === 'payout' || act === 'refund') location.hash = '#/payments/new' + ui.qs({ direction: 'out', contact: d.contact_id, doc: d.id });
        if (act === 'dup') { const id = Buku.docs.duplicate(db, d.id); ui.toast(t('Copied to a new draft')); location.hash = '#/doc/' + id; }
        if (act === 'credit') { const id = Buku.docs.creditNoteFromInvoice(db, d.id); location.hash = '#/doc/' + id; }
        if (act === 'invoice') invoiceFromSO(d);
        if (act === 'signed') signedModal(d);
        if (act === 'faktur') fakturModal(d);
        if (act === 'apply') applyModal(d);
        if (act === 'close') { if (await ui.confirm(d.status === 'confirmed' ? t('Cancel this sales order?') : t('Close this order? The remaining quantity will not be invoiced.'))) { Buku.docs.setSOStatus(db, d.id, d.status === 'confirmed' ? 'cancelled' : 'closed'); ui.dispatch(); } }
        if (act === 'reopen') { Buku.docs.setSOStatus(db, d.id, 'confirmed'); ui.dispatch(); }
        if (act === 'redraft') { if (await ui.confirm(t('Return this document to draft? Its journal entry is reversed; the number is kept.'))) { Buku.docs.unpost(db, d.id, 'draft', Buku.util.today()); ui.toast(t('Back to draft')); ui.dispatch(); } }
        if (act === 'void') { if (await ui.confirm(t('Void this document? Its journal entry is reversed. This cannot be undone.'), { danger: true, okLabel: t('Void') })) { Buku.docs.unpost(db, d.id, 'void', Buku.util.today()); ui.toast(t('Voided')); ui.dispatch(); } }
      } catch (e) { ui.showError(e); }
    });
  }

  function purchaseSummary(d) {
    const M = (v) => U2().money(v, d.currency);
    return '<section class="panel"><header><h2>' + h(d.vendor_invoice_no ? t('Vendor invoice {n}', { n: d.vendor_invoice_no }) : d.subject || '') + '</h2></header>' +
      '<table class="data"><thead><tr><th>' + h(t('Description')) + '</th><th>' + h(t('Account')) + '</th><th class="num">' + h(t('Qty')) + '</th><th class="num">' + h(t('Price')) + '</th><th class="num">' + h(t('Amount')) + '</th><th class="num">' + h(t('Tax')) + '</th></tr></thead><tbody>' +
      d.lines.map((l) => { const a = l.account_id ? Buku.db.get('SELECT code, name FROM accounts WHERE id=?', [l.account_id]) : null; return '<tr><td>' + h([l.product_name, l.description].filter(Boolean).join(' – ')) + '</td><td>' + (a ? '<span class="mono">' + h(a.code) + '</span> ' + h(a.name) : '') + '</td><td class="num">' + h(U2().qtyText(l.quantity)) + '</td><td class="num">' + h(M(l.unit_price)) + '</td><td class="num">' + h(M(l.line_net)) + '</td><td class="num">' + h(l.line_tax ? M(l.line_tax) : '') + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th colspan="4">' + h(t('Total')) + '</th><td class="num">' + h(M(d.total)) + '</td><td></td></tr></tfoot></table>' + (d.note ? '<p class="note">' + h(d.note) + '</p>' : '') + '</section>';
  }

  function invoiceFromSO(d) {
    const db = Buku.db;
    const rem = Buku.docs.soRemaining(db, d.id);
    ui.modal({
      title: t('Create invoice from {n}', { n: d.number }),
      wide: true,
      body: '<p>' + h(t('Choose how much of each line to invoice now. The rest stays open on the order.')) + '</p>' + ui.field(t('Invoice date'), ui.input('date', Buku.util.today(), { type: 'date' })) +
        '<table class="data"><thead><tr><th>' + h(t('Line')) + '</th><th class="num">' + h(t('Ordered')) + '</th><th class="num">' + h(t('Left')) + '</th><th class="num">' + h(t('Invoice now')) + '</th></tr></thead><tbody>' +
        rem.map((l) => '<tr><td>' + h(l.item_label || l.description || '') + '</td><td class="num">' + h(U2().qtyText(l.quantity)) + '</td><td class="num">' + h(U2().qtyText(Math.max(0, l.remaining))) + '</td>' +
          '<td><input class="num small" name="q_' + l.id + '" value="' + h(U2().qtyText(Math.max(0, l.remaining))) + '"' + (l.remaining <= 0 ? ' disabled' : '') + '></td></tr>').join('') + '</tbody></table>',
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Create invoice draft'), kind: 'primary', onClick: (m) => {
        const f = ui.formData(m.body);
        const qty = {};
        rem.forEach((l) => { if (f['q_' + l.id] !== undefined) qty[l.id] = U2().readQty(f['q_' + l.id]); });
        const id = Buku.docs.invoiceFromSO(db, d.id, { date: f.date, qty });
        location.hash = '#/doc/' + id;
      } }],
    });
  }

  function signedModal(d) {
    ui.modal({
      title: t('Customer signature'),
      body: '<p>' + h(t('Record when the customer signed the sales order.')) + '</p>' + ui.field(t('Signed on'), ui.input('date', d.signed_at || Buku.util.today(), { type: 'date' })),
      actions: [
        ...(d.signed_at ? [{ label: t('Clear'), kind: 'ghost', onClick: () => { Buku.docs.markSigned(Buku.db, d.id, null); ui.dispatch(); } }] : []),
        { label: t('Save'), kind: 'primary', onClick: (m) => { Buku.docs.markSigned(Buku.db, d.id, ui.formData(m.body).date); ui.dispatch(); } },
      ],
    });
  }

  function fakturModal(d) {
    ui.modal({
      title: t('Faktur pajak'),
      body: '<p>' + h(t('After issuing the e-Faktur in Coretax, record its number here.')) + '</p>' +
        ui.field(t('Faktur number'), ui.input('no', d.faktur_no || '', { placeholder: '04002600000000001' })) + ui.field(t('Faktur date'), ui.input('date', d.faktur_date || d.date, { type: 'date' })),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (m) => { const f = ui.formData(m.body); Buku.taxops.setFaktur(Buku.db, d.id, f.no, f.no ? f.date : null); ui.dispatch(); } }],
    });
  }

  function applyModal(cn) {
    const db = Buku.db;
    const invs = db.all("SELECT * FROM documents WHERE doc_type='invoice' AND contact_id=? AND currency=? AND status IN ('open','partial') ORDER BY date", [cn.contact_id, cn.currency]);
    if (!invs.length) { ui.toast(t('This customer has no open invoices in {cur}.', { cur: cn.currency }), 'error'); return; }
    const bal = Buku.docs.balance(cn);
    ui.modal({
      title: t('Apply {n}', { n: cn.number }),
      body: ui.field(t('Invoice'), ui.select('inv', invs.map((i) => ({ value: i.id, label: i.number + ' · ' + U2().money(Buku.docs.balance(i), i.currency) })), invs[0].id)) +
        ui.field(t('Amount'), ui.moneyInput('amount', Math.min(bal, Buku.docs.balance(invs[0])), ui.curDecimals(cn.currency))),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Apply'), kind: 'primary', onClick: (m) => {
        const f = ui.formData(m.body);
        Buku.docs.applyCredit(db, cn.id, Number(f.inv), ui.readMoney(m.body.querySelector('[name=amount]')), Buku.util.today() < cn.date ? cn.date : Buku.util.today());
        ui.toast(t('Credit applied'));
        ui.dispatch();
      } }],
    });
  }

  ui.route('/sales-orders', listFor('sales_order'));
  ui.route('/invoices', listFor('invoice'));
  ui.route('/credit-notes', listFor('credit_note'));
  ui.route('/bills', listFor('bill'));
  ui.route('/expenses', listFor('expense'));
  ui.route('/doc/new/:type', (p, q) => editor(null, p.type, q));
  ui.route('/doc/:id', docPage);
})();
