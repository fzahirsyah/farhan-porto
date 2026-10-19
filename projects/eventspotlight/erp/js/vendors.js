/* Vendors and purchase orders: order, PIC delivery confirmation, vendor invoice, three-way match, approve and pay (with tax). */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const ST = { draft: ['Draft', ''], ordered: ['Ordered', 'b'], invoiced: ['Invoiced', 'a'], paid: ['Paid', 'g'], cancelled: ['Cancelled', 'r'] };
  const TAXES = [['none', 'No tax'], ['PPN', 'VAT (PPN)'], ['PPh23', 'Withholding (PPh 23)'], ['PPN+PPh23', 'VAT and withholding']];
  const TABS = [['orders', 'Purchase orders'], ['deliveries', 'Deliveries'], ['vendors', 'Vendors']];

  function render(el, param) {
    const [a, id] = (param || 'orders').split('/'); const tab = a === 'po' || a === 'orders' ? 'orders' : a === 'vendor' || a === 'vendors' ? 'vendors' : a === 'deliveries' ? 'deliveries' : 'orders'; const ev = E.ev();
    if (!ev) { el.innerHTML = E.pageHead('Vendors') + ES.ui.empty('No event yet'); return; }
    el.innerHTML = E.pageHead('Vendors and orders', 'An order is paid only when the order, the PIC delivery confirmation and the vendor invoice agree', can('vendors') ? '<button class="btn primary" id="newPO">New purchase order</button>' : '') + '<div class="tabs" id="vt"></div><div id="vb"></div>';
    const waiting = DB().val("SELECT COUNT(*) FROM purchase_orders WHERE event_id=? AND status IN ('ordered','invoiced') AND delivered_at IS NULL", [ev.id]);
    ES.ui.tabs($('#vt'), TABS.map((t) => ({ id: t[0], label: t[1], count: t[0] === 'deliveries' && waiting ? waiting : null, countClass: 'a' })), tab, (t) => (location.hash = '#/vendors/' + t));
    ({ orders, deliveries, vendors })[tab]($('#vb'), ev);
    if ($('#newPO')) $('#newPO').onclick = () => poForm(ev);
    if (a === 'po' && id) poDrawer(Number(id)); if (a === 'vendor' && id) vendorForm(DB().get('SELECT * FROM vendors WHERE id=?', [Number(id)]));
  }
  const poRows = (ev) => DB().all("SELECT p.*, v.name vendor, u.name pic FROM purchase_orders p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.pic_id WHERE p.event_id=? ORDER BY p.id DESC", [ev.id]);
  const stage = (p) => (p.status === 'paid' ? 'Paid' : p.status === 'draft' ? 'Not ordered' : p.invoice_amount !== null && p.invoice_amount !== undefined ? (ES.biz.match(p).ok ? 'Matched' : 'Check match') : p.delivered_at ? 'Delivered, no invoice' : 'Waiting for delivery');

  function orders(el, ev) {
    const rows = poRows(ev); const open = rows.filter((r) => !['paid', 'cancelled'].includes(r.status)).reduce((a, r) => a + (r.invoice_amount === null || r.invoice_amount === undefined ? r.amount : r.invoice_amount), 0);
    el.innerHTML = `<div class="grid g4" style="margin-bottom:14px"><div class="card kpi"><div class="l">Committed and not yet paid</div><div class="n">${F.rpShort(open)}</div></div>
      <div class="card kpi"><div class="l">Ready to pay</div><div class="n">${rows.filter((r) => r.status === 'invoiced' && ES.biz.match(r).ok).length}</div></div>
      <div class="card kpi"><div class="l">Do not match</div><div class="n">${rows.filter((r) => r.status === 'invoiced' && !ES.biz.match(r).ok).length}</div></div>
      <div class="card kpi"><div class="l">Paid</div><div class="n">${rows.filter((r) => r.status === 'paid').length}</div></div></div><div class="card"><div id="po"></div></div>`;
    ES.ui.dataTable($('#po'), { rows, pageSize: 20, exportName: 'purchase-orders', searchKeys: ['no', 'vendor', 'description', 'category'], filters: [{ key: 'status', label: 'Status', options: Object.entries(ST).map(([k, v]) => [k, v[0]]) }, { key: 'category', label: 'Category', options: ES.ledger.CATEGORIES.map((c) => [c, c]) }],
      columns: [{ key: 'no', label: 'Order' }, { key: 'vendor', label: 'Vendor', render: (r) => `<b>${esc(r.vendor || '—')}</b><div class="sub">${esc(r.description)}</div>`, value: (r) => r.vendor }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Order', num: true, render: (r) => F.rp(r.amount) },
        { key: 'invoice_amount', label: 'Invoice', num: true, render: (r) => (r.invoice_amount === null || r.invoice_amount === undefined ? '—' : F.rp(r.invoice_amount)) }, { key: 'due_date', label: 'Due', render: (r) => (r.due_date ? F.date(r.due_date) : '') },
        { key: 'status', label: 'Status', render: (r) => tag(...ST[r.status]) + `<div class="sub">${esc(stage(r))}</div>`, value: (r) => stage(r) }], onRow: (r) => poDrawer(r.id) });
  }

  function deliveries(el, ev) {
    const rows = poRows(ev).filter((r) => ['ordered', 'invoiced'].includes(r.status));
    el.innerHTML = '<div class="notice" style="margin-bottom:12px">The person in charge (PIC) confirms here, or on the crew phone app, that the goods or service arrived. Finance cannot pay without it.</div><div class="card"><div id="dl"></div></div>';
    ES.ui.dataTable($('#dl'), { rows, pageSize: 20, searchKeys: ['no', 'vendor', 'description', 'pic'], filters: [{ key: 'state', label: 'State', options: [['wait', 'Waiting'], ['done', 'Delivered']], test: (r, v) => (v === 'done' ? !!r.delivered_at : !r.delivered_at) }], columns: [{ key: 'no', label: 'Order' }, { key: 'vendor', label: 'Vendor', render: (r) => `<b>${esc(r.vendor)}</b><div class="sub">${esc(r.description)}</div>`, value: (r) => r.vendor },
      { key: 'pic', label: 'PIC', render: (r) => esc(r.pic || 'Not assigned') }, { key: 'due_date', label: 'Due', render: (r) => (r.delivered_at ? '' : ES.ui.dueTag(r.due_date)), value: (r) => r.due_date || '' },
      { key: 'delivered_at', label: 'Delivery', render: (r) => (r.delivered_at ? tag('Delivered', 'g') + `<div class="sub">${esc(r.delivered_by || '')} · ${F.stamp(r.delivered_at)}</div>` : tag('Waiting', 'a')), value: (r) => (r.delivered_at ? 'Delivered' : 'Waiting') },
      { key: 'id', label: '', sortable: false, render: (r) => (!r.delivered_at && can('vendors.confirm') ? `<button class="btn sm go" data-cd="${r.id}">Confirm delivery</button>` : '') }], onRow: (r) => poDrawer(r.id),
      afterRender: (c) => $$('[data-cd]', c).forEach((b) => (b.onclick = () => confirmDelivery(Number(b.dataset.cd)))) });
  }
  function confirmDelivery(id) {
    const f = [{ name: 'note', label: 'Note (what arrived, condition)', type: 'textarea', full: true }];
    ES.ui.drawer.open({ title: 'Confirm delivery', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn go" data-s>Confirm delivery</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.readForm(b, f); await E.act('confirm delivery', () => ES.biz.confirmDelivery(id, v.note), 'Delivery confirmed'); ES.ui.drawer.close(); }; } });
  }

  // ---------- PO drawer ----------
  function poDrawer(id) {
    const p = DB().get('SELECT p.*, v.name vendor, v.bank, u.name pic FROM purchase_orders p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.pic_id WHERE p.id=?', [id]); if (!p) return;
    const m = ES.biz.match(p); const t = ES.biz.taxesFor(p); const net = t.base + t.ppn - t.pph; const hasInv = p.invoice_amount !== null && p.invoice_amount !== undefined;
    const steps = [['Ordered', p.status !== 'draft'], ['Delivered', !!p.delivered_at], ['Invoiced', hasInv], ['Matched', hasInv && m.ok], ['Paid', p.status === 'paid']];
    const pay = p.payment_id ? DB().get('SELECT * FROM payments WHERE id=?', [p.payment_id]) : null;
    const btn = [];
    if (p.status === 'draft' && can('vendors')) btn.push('<button class="btn primary" data-a="order">Place order</button>');
    if (['ordered', 'invoiced'].includes(p.status) && !p.delivered_at && can('vendors.confirm')) btn.push('<button class="btn go" data-a="deliver">Confirm delivery</button>');
    if (['ordered', 'invoiced'].includes(p.status) && can('vendors')) btn.push(`<button class="btn" data-a="invoice">${hasInv ? 'Change vendor invoice' : 'Record vendor invoice'}</button>`);
    if (p.status === 'invoiced' && can('pay.approve')) btn.push(m.ok ? '<button class="btn primary" data-a="pay">Approve and pay</button>' : '<button class="btn danger" data-a="exception">Pay as an exception…</button>');
    ES.ui.drawer.open({ title: p.no + ' · ' + (p.vendor || ''), wide: true, body: `<div class="row" style="gap:6px;margin-bottom:14px">${steps.map(([l, on]) => `<span class="tag ${on ? 'g' : ''}" style="${on ? '' : 'opacity:.5'}">${on ? '✓ ' : ''}${l}</span>`).join('<span class="muted">›</span>')}</div>
      <div class="kv"><span>Description</span><span>${esc(p.description)}</span><span>Category</span><span>${esc(p.category)}</span><span>Order amount</span><span><b>${F.rp(p.amount)}</b></span><span>Tax</span><span>${esc((TAXES.find((x) => x[0] === (p.tax_code || 'none')) || [])[1] || p.tax_code)}</span><span>PIC</span><span>${esc(p.pic || 'Not assigned')}</span><span>Due</span><span>${p.due_date ? F.date(p.due_date) : '—'}</span>
        <span>Delivery</span><span>${p.delivered_at ? tag('Confirmed', 'g') + ' ' + esc(p.delivered_by || '') + ' · ' + F.stamp(p.delivered_at) : tag('Not confirmed', 'a')}</span>
        <span>Vendor invoice</span><span>${hasInv ? esc(p.invoice_no || '') + ' · <b>' + F.rp(p.invoice_amount) + '</b> · ' + F.date(p.invoice_date) : 'Not received'}</span>${p.source === 'artist_request' ? '<span>Source</span><span>Artist special request</span>' : ''}</div>
      ${p.status === 'invoiced' || p.status === 'paid' ? `<div class="section-t" style="margin:18px 0 8px">Three-way match</div>
        <div class="${m.ok ? 'notice ok' : 'notice'}" style="${m.ok ? '' : 'background:var(--red-soft,#fbe4e7);border-color:var(--red)'}">${m.ok ? '✓ Order, delivery and invoice agree.' : '✗ ' + m.reasons.map(esc).join('<br>✗ ')}</div>
        <div class="section-t" style="margin:18px 0 8px">Payment</div><table class="tbl"><tbody><tr><td>Invoice amount</td><td class="num">${F.rp(t.base)}</td></tr>${t.ppn ? `<tr><td>VAT (PPN) ${ES.cfg.get('tax.ppn_rate', { eventId: p.event_id })}%</td><td class="num">+ ${F.rp(t.ppn)}</td></tr>` : ''}${t.pph ? `<tr><td>Withholding (PPh 23) ${ES.cfg.get('tax.pph23_rate', { eventId: p.event_id })}%, paid to the tax office</td><td class="num">− ${F.rp(t.pph)}</td></tr>` : ''}<tr><td><b>Pay to vendor</b></td><td class="num"><b>${F.rp(net)}</b></td></tr></tbody></table><div class="muted" style="margin-top:6px">Tax rates are set in Settings and must be confirmed by your accountant.</div>` : ''}
      ${pay ? `<div class="notice ok" style="margin-top:14px">Paid ${F.date(pay.date)} by ${esc(pay.created_by || '')} · ${F.rp(pay.amount)}${pay.note ? ' · note: ' + esc(pay.note) : ''}</div>` : ''}`,
      footer: btn.join(''), onMount: (b, d) => $$('[data-a]', d).forEach((x) => (x.onclick = () => action(x.dataset.a, p, m))) });
  }
  async function action(a, p, m) {
    if (a === 'order') { await E.act('place order', () => { ES.biz.orderPO(p.id); }, 'Order placed'); ES.ui.drawer.close(); }
    else if (a === 'deliver') confirmDelivery(p.id);
    else if (a === 'invoice') { const f = [{ name: 'no', label: 'Vendor invoice number', required: true }, { name: 'amount', label: 'Invoice amount before tax (Rp)', type: 'money', required: true }, { name: 'date', label: 'Invoice date', type: 'date', default: F.today() }];
      ES.ui.drawer.open({ title: 'Vendor invoice', body: `<div class="notice" style="margin-bottom:12px">Order amount is ${F.rp(p.amount)}. The invoice must match it within the tolerance of ${ES.cfg.get('finance.match_tolerance_pct', { eventId: p.event_id })}%.</div>` + ES.ui.formHTML(f, { no: p.invoice_no, amount: p.invoice_amount === null ? p.amount : p.invoice_amount, date: p.invoice_date || F.today() }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save invoice</button>', onMount: (b, d) => { ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
        d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f, (v, fail) => { if (v.amount <= 0) fail('amount', 'Enter an amount'); }); if (!v) return; await E.act('vendor invoice', () => ES.biz.recordVendorInvoice(p.id, v), 'Invoice recorded'); ES.ui.drawer.close(); poDrawer(p.id); }; } }); }
    else if (a === 'pay') { if (!(await ES.ui.confirm('Approve and pay ' + p.no + '?', 'The bill and the payment are posted to the books.', { ok: 'Approve and pay' }))) return; const r = await E.act('vendor payment', () => ES.biz.approvePayment(p.id), 'Paid'); ES.ui.drawer.close(); if (r) toast('Paid ' + F.rp(r.net), 'ok'); }
    else if (a === 'exception') { const f = [{ name: 'note', label: 'Why are you paying although it does not match?', type: 'textarea', required: true, full: true }];
      ES.ui.drawer.open({ title: 'Pay as an exception', body: `<div class="notice" style="margin-bottom:12px;background:var(--red-soft,#fbe4e7);border-color:var(--red)">${m.reasons.map(esc).join('<br>')}</div>` + ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn danger" data-s>Pay anyway</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
        d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('vendor payment exception', () => ES.biz.approvePayment(p.id, { exception: true, note: v.note }), 'Paid as an exception. The note is kept in the log.'); ES.ui.drawer.close(); }; } }); }
  }

  function poForm(ev) {
    const vs = DB().all("SELECT id,name,category FROM vendors WHERE status='active' ORDER BY name"); const us = DB().all('SELECT id,name FROM users WHERE active=1 ORDER BY name');
    const f = [{ name: 'vendor_id', label: 'Vendor', type: 'select', required: true, placeholder: 'Choose a vendor', options: vs.map((v) => [v.id, v.name + ' · ' + (v.category || '')]) }, { name: 'category', label: 'Budget category', type: 'select', options: ES.ledger.CATEGORIES.map((c) => [c, c]) },
      { name: 'description', label: 'What are you ordering?', required: true, full: true }, { name: 'amount', label: 'Amount before tax (Rp)', type: 'money', required: true }, { name: 'tax_code', label: 'Tax', type: 'select', options: TAXES }, { name: 'pic_id', label: 'PIC who confirms delivery', type: 'select', placeholder: 'Choose', options: us.map((u) => [u.id, u.name]) }, { name: 'due_date', label: 'Delivery due', type: 'date' }, { name: 'go', label: 'Place the order right away', type: 'checkbox', default: 1 }];
    ES.ui.drawer.open({ title: 'New purchase order', body: ES.ui.formHTML(f, { category: 'Production', tax_code: 'PPN' }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Create</button>', onMount: (b, d) => { ES.ui.bindMoney(b);
      const vsel = b.querySelector('[name=vendor_id]'); vsel.onchange = () => { const v = vs.find((x) => x.id === Number(vsel.value)); if (v && ES.ledger.CATEGORIES.includes(v.category)) b.querySelector('[name=category]').value = v.category; };
      d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f, (v, fail) => { if (v.amount <= 0) fail('amount', 'Enter an amount'); }); if (!v) return; const bl = DB().get('SELECT id FROM budget_lines WHERE event_id=? AND category=? ORDER BY id LIMIT 1', [ev.id, v.category]);
        await E.act('purchase order', () => { const po = ES.biz.createPO({ eventId: ev.id, vendor_id: Number(v.vendor_id), category: v.category, description: v.description, amount: v.amount, tax_code: v.tax_code, budget_line_id: bl && bl.id, pic_id: v.pic_id ? Number(v.pic_id) : null, due_date: v.due_date || null }); if (v.go) ES.biz.orderPO(po.id); }, 'Order created'); ES.ui.drawer.close(); }; } });
  }

  function vendors(el) {
    const rows = DB().all("SELECT v.*, (SELECT COUNT(*) FROM purchase_orders p WHERE p.vendor_id=v.id) n, (SELECT COALESCE(SUM(CASE WHEN invoice_amount IS NOT NULL THEN invoice_amount ELSE amount END),0) FROM purchase_orders p WHERE p.vendor_id=v.id AND p.status='paid') paid FROM vendors v ORDER BY v.name");
    el.innerHTML = `<div class="card"><div class="card-h"><h3>Vendors</h3>${can('vendors') ? '<button class="btn primary sm" style="margin-left:auto" id="addV">Add vendor</button>' : ''}</div><div id="vl"></div></div>`;
    ES.ui.dataTable($('#vl'), { rows, exportName: 'vendors', searchKeys: ['name', 'category', 'contact', 'email'], columns: [{ key: 'name', label: 'Vendor', render: (r) => `<b>${esc(r.name)}</b><div class="sub">${esc(r.contact || '')}</div>`, value: (r) => r.name }, { key: 'category', label: 'Category' }, { key: 'email', label: 'Email' }, { key: 'npwp', label: 'NPWP' }, { key: 'n', label: 'Orders', num: true }, { key: 'paid', label: 'Paid so far', num: true, render: (r) => F.rp(r.paid) }, { key: 'status', label: 'Status', render: (r) => (r.status === 'active' ? tag('Active', 'g') : tag(r.status)) }], onRow: can('vendors') ? vendorForm : null });
    if ($('#addV')) $('#addV').onclick = () => vendorForm(null);
  }
  function vendorForm(v) {
    if (!can('vendors')) return;
    const f = [{ name: 'name', label: 'Company name', required: true, full: true }, { name: 'category', label: 'Category', type: 'select', options: ES.ledger.CATEGORIES.map((c) => [c, c]) }, { name: 'contact', label: 'Contact person' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' }, { name: 'npwp', label: 'NPWP' }, { name: 'bank', label: 'Bank account', full: true }, { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['paused', 'Paused']] }];
    ES.ui.drawer.open({ title: v ? v.name : 'Add vendor', body: ES.ui.formHTML(f, v || { category: 'Production', status: 'active' }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const x = ES.ui.validate(b, f); if (!x) return; await E.act('vendor', () => { if (v) DB().update('vendors', v.id, x); else DB().insert('vendors', x); DB().log('vendor saved', 'vendors', v ? v.id : 0, x.name); }, 'Saved'); ES.ui.drawer.close(); }; } });
  }

  E.register('vendors', { label: 'Vendors and orders', icon: 'ven', section: 'Partners', perm: 'vendors', render, keywords: 'purchase orders po delivery invoice pay match', badge: () => { const e = E.eventId(); return e ? DB().val("SELECT COUNT(*) FROM purchase_orders WHERE event_id=? AND status='invoiced'", [e]) || 0 : 0; } });
})();
