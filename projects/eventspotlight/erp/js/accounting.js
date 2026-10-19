/* Accounting: documents (quotation, contract, invoice, receipt), payments, journal, trial balance, income statement, balance sheet, budget, tax, period close. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const TYPE = { quotation: 'Quotation', contract: 'Contract', invoice: 'Invoice', receipt: 'Receipt' };
  const DST = { draft: ['Draft', ''], sent: ['Sent', 'b'], accepted: ['Accepted', 'g'], issued: ['Issued', 'b'], partial: ['Part paid', 'a'], paid: ['Paid', 'g'], void: ['Void', 'r'] };
  const TABS = [['documents', 'Documents'], ['payments', 'Payments'], ['journal', 'Journal'], ['trial', 'Trial balance'], ['income', 'Income statement'], ['balance', 'Balance sheet'], ['budget', 'Budget'], ['tax', 'Tax'], ['close', 'Period close']];

  function render(el, param) {
    const [t0, id] = (param || 'documents').split('/'); const tab = t0 === 'doc' ? 'documents' : TABS.find((t) => t[0] === t0) ? t0 : 'documents'; const ev = E.ev();
    if (!ev) { el.innerHTML = E.pageHead('Accounting') + ES.ui.empty('No event yet'); return; }
    el.innerHTML = E.pageHead('Accounting', esc(ev.name) + ' · ticket money is the organiser’s money; the yearly software plan is a separate cost', '') + '<div class="tabs" id="at"></div><div id="ab"></div>';
    ES.ui.tabs($('#at'), TABS.map((t) => ({ id: t[0], label: t[1] })), tab, (t) => (location.hash = '#/accounting/' + t));
    ({ documents, payments, journal, trial, income, balance, budget, tax, close })[tab]($('#ab'), ev);
    if (t0 === 'doc' && id) docDrawer(Number(id));
  }
  const evFilter = (ev) => `<div class="row" style="margin-bottom:10px;gap:8px"><span class="seg" id="scope"><button data-s="e" class="on">This event</button><button data-s="all">All events</button></span></div>`;
  function scoped(el, ev, draw) { let s = 'e'; const go = () => { draw(s === 'e' ? ev.id : null); $$('#scope button', el).forEach((b) => b.classList.toggle('on', b.dataset.s === s)); $$('#scope button', el).forEach((b) => (b.onclick = () => { s = b.dataset.s; go(); })); }; go(); }

  // ---------- documents ----------
  function documents(el, ev) {
    const rows = DB().all('SELECT * FROM documents WHERE event_id=? ORDER BY id DESC', [ev.id]);
    el.innerHTML = `<div class="card"><div class="card-h"><h3>Quotations, contracts, invoices and receipts</h3>${can('accounting') ? '<span style="margin-left:auto"><button class="btn sm" data-n="quotation">New quotation</button> <button class="btn primary sm" data-n="invoice">New invoice</button></span>' : ''}</div><div id="dc"></div></div>`;
    ES.ui.dataTable($('#dc'), { rows, pageSize: 20, exportName: 'documents', searchKeys: ['no', 'party_name', 'type'], filters: [{ key: 'type', label: 'Type', options: Object.entries(TYPE) }, { key: 'status', label: 'Status', options: Object.entries(DST).map(([k, v]) => [k, v[0]]) }],
      columns: [{ key: 'no', label: 'Number' }, { key: 'type', label: 'Type', render: (r) => esc(TYPE[r.type]) }, { key: 'party_name', label: 'Party' }, { key: 'issue_date', label: 'Date', render: (r) => F.date(r.issue_date) }, { key: 'due_date', label: 'Due', render: (r) => (r.type === 'invoice' && r.status !== 'paid' ? ES.ui.dueTag(r.due_date) : r.due_date ? F.date(r.due_date) : ''), value: (r) => r.due_date || '' },
        { key: 'total', label: 'Total', num: true, render: (r) => F.rp(r.total) }, { key: 'paid', label: 'Paid', num: true, render: (r) => (r.type === 'invoice' ? F.rp(r.paid) : '') }, { key: 'status', label: 'Status', render: (r) => tag(...(DST[r.status] || [r.status])) }], onRow: (r) => docDrawer(r.id) });
    $$('[data-n]', el).forEach((b) => (b.onclick = () => docForm(ev, b.dataset.n)));
  }
  function linesEditor(lines) {
    return `<div class="items-ed" id="lines"><div class="row" style="font-weight:700;font-size:14px;color:var(--muted)"><span style="flex:1">Description</span><span style="width:70px">Qty</span><span style="width:140px">Unit price</span><span style="width:30px"></span></div>${lines.map(lineRow).join('')}</div><button class="btn sm" id="addLine" style="margin-top:8px">Add line</button><div id="lineTot" class="muted" style="margin-top:8px;text-align:right"></div>`;
  }
  const lineRow = (l) => `<div class="row li" style="gap:6px;margin-top:6px"><input class="input" data-d style="flex:1" value="${esc(l.desc || '')}"><input class="input" data-q style="width:70px" value="${l.qty || 1}" inputmode="decimal"><input class="input" data-p style="width:140px;text-align:right" value="${F.num(l.price || 0)}" inputmode="numeric"><button class="icon-btn" data-rm title="Remove">✕</button></div>`;
  function bindLines(b, vatSel) {
    const read = () => $$('.li', b).map((r) => ({ desc: $('[data-d]', r).value.trim(), qty: Number($('[data-q]', r).value) || 0, price: F.parseNum($('[data-p]', r).value) })).filter((l) => l.desc || l.price);
    const tot = () => { const t = ES.biz.totals(read(), vatSel().checked, E.eventId()); $('#lineTot', b).textContent = 'Subtotal ' + F.rp(t.subtotal) + ' · VAT ' + F.rp(t.tax_amount) + ' · Total ' + F.rp(t.total); };
    b.addEventListener('input', tot); b.addEventListener('change', tot); tot();
    $('#addLine', b).onclick = () => { $('#lines', b).insertAdjacentHTML('beforeend', lineRow({})); tot(); };
    b.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { e.target.closest('.li').remove(); tot(); } });
    return read;
  }
  function docForm(ev, type) {
    const f = [{ name: 'party_name', label: 'Customer', required: true, full: true }, { name: 'party_address', label: 'Address', full: true }, { name: 'due_date', label: type === 'invoice' ? 'Payment due' : 'Valid until', type: 'date', default: F.addDays(F.today(), 14) }, { name: 'vat', label: 'Add VAT (PPN)', type: 'checkbox', default: 1 }, { name: 'notes', label: 'Notes on the document', type: 'textarea', full: true }];
    ES.ui.drawer.open({ title: 'New ' + TYPE[type].toLowerCase(), wide: true, body: ES.ui.formHTML(f) + '<div class="section-t" style="margin:16px 0 6px">Lines</div>' + linesEditor([{ desc: '', qty: 1, price: 0 }]), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Create</button>', onMount: (b, d) => {
      const read = bindLines(b, () => b.querySelector('[name=vat]')); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; const lines = read(); if (!lines.length || lines.some((l) => !l.desc || l.price <= 0)) return toast('Every line needs a description and a price', 'err');
        const id = await E.act('document', () => { const doc = ES.biz.createDoc({ eventId: ev.id, type, party_kind: 'customer', party_name: v.party_name, party_address: v.party_address, due_date: v.due_date, vat: !!v.vat, lines, notes: v.notes, status: type === 'invoice' ? 'issued' : 'draft', terms: type === 'invoice' ? 'Payment within 14 days of the invoice date.' : 'Valid until the date shown.' });
          if (type === 'invoice') DB().update('documents', doc.id, { ledger_entry_id: ES.ledger.invoiceIssued(DB().get('SELECT * FROM documents WHERE id=?', [doc.id])) }); return doc.id; }, TYPE[type] + ' created'); ES.ui.drawer.close(); if (id) docDrawer(id); }; } });
  }
  function docDrawer(id) {
    const d = DB().get('SELECT * FROM documents WHERE id=?', [id]); if (!d) return; const lines = JSON.parse(d.lines || '[]'); const pays = DB().all('SELECT * FROM payments WHERE doc_id=? ORDER BY id', [id]);
    const kids = DB().all('SELECT id,type,no,status FROM documents WHERE ref_doc_id=? ORDER BY id', [id]); const parent = d.ref_doc_id ? DB().get('SELECT id,type,no FROM documents WHERE id=?', [d.ref_doc_id]) : null;
    const btn = ['<button class="btn" data-a="view">View and PDF</button>'];
    if (can('accounting')) {
      if (d.type === 'quotation' && ['draft', 'sent'].includes(d.status)) btn.push('<button class="btn primary" data-a="contract">Accept and make contract</button>');
      if (d.type === 'contract' && d.status !== 'void') btn.push('<button class="btn primary" data-a="invoice">Issue invoice</button>');
      if (d.type === 'invoice' && d.status !== 'paid' && d.status !== 'void') btn.push('<button class="btn go" data-a="pay">Record payment</button>');
    }
    ES.ui.drawer.open({ title: TYPE[d.type] + ' ' + d.no, wide: true, body: `<div class="kv"><span>Party</span><span>${esc(d.party_name)}</span><span>Date</span><span>${F.date(d.issue_date)}</span>${d.due_date ? `<span>Due</span><span>${F.date(d.due_date)}</span>` : ''}<span>Status</span><span>${tag(...(DST[d.status] || [d.status]))}</span>${parent ? `<span>From</span><span><a href="#/accounting/doc/${parent.id}">${esc(parent.no)}</a></span>` : ''}${kids.length ? `<span>Leads to</span><span>${kids.map((k) => `<a href="#/accounting/doc/${k.id}">${esc(k.no)}</a>`).join(', ')}</span>` : ''}</div>
      <table class="tbl" style="margin-top:14px"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="num">${l.qty}</td><td class="num">${F.rp(l.price)}</td><td class="num">${F.rp(l.qty * l.price)}</td></tr>`).join('')}
        <tr><td colspan="3" class="num">Subtotal</td><td class="num">${F.rp(d.subtotal)}</td></tr>${d.tax_amount ? `<tr><td colspan="3" class="num">VAT</td><td class="num">${F.rp(d.tax_amount)}</td></tr>` : ''}${d.stamp ? `<tr><td colspan="3" class="num">Stamp duty</td><td class="num">${F.rp(d.stamp)}</td></tr>` : ''}<tr><td colspan="3" class="num"><b>Total</b></td><td class="num"><b>${F.rp(d.total)}</b></td></tr>${d.type === 'invoice' ? `<tr><td colspan="3" class="num">Paid</td><td class="num">${F.rp(d.paid)}</td></tr><tr><td colspan="3" class="num"><b>Balance</b></td><td class="num"><b>${F.rp(d.total - d.paid)}</b></td></tr>` : ''}</tbody></table>
      ${pays.length ? `<div class="section-t" style="margin:16px 0 6px">Payments</div>${pays.map((p) => `<div class="list"><div class="it"><span>${F.date(p.date)} · ${esc(p.method || '')}</span><span class="spacer"></span><b>${F.rp(p.amount)}</b>${p.receipt_doc_id ? ` <a href="#/accounting/doc/${p.receipt_doc_id}">receipt</a>` : ''}</div></div>`).join('')}` : ''}`, footer: btn.join(''),
      onMount: (b, dr) => $$('[data-a]', dr).forEach((x) => (x.onclick = async () => {
        const a = x.dataset.a;
        if (a === 'view') ES.docs.show(ES.docs.fromDocument(d));
        else if (a === 'contract') { if (!(await ES.ui.confirm('Make a contract?', 'The quotation is accepted, a contract is created and the sponsor is marked as signed.', { ok: 'Accept' }))) return; const c = await E.act('contract', () => ES.biz.contractFrom(d), 'Contract created'); ES.ui.drawer.close(); if (c) docDrawer(c.id); }
        else if (a === 'invoice') { const f = [{ name: 'pct', label: 'Share of the contract value to invoice now (%)', type: 'number', min: 1, max: 100, default: 100, help: 'Use 50 for a deposit invoice, then invoice the rest later.' }, { name: 'due', label: 'Payment due', type: 'date', default: F.addDays(F.today(), 14) }];
          ES.ui.drawer.open({ title: 'Issue invoice', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Issue invoice</button>', onMount: (bb, dd) => { dd.querySelector('[data-x]').onclick = () => docDrawer(d.id); dd.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(bb, f); if (!v) return;
            const invoiced = DB().val("SELECT COALESCE(SUM(subtotal),0) FROM documents WHERE type='invoice' AND ref_doc_id=? AND status!='void'", [d.id]); const amt = Math.round(d.subtotal * v.pct / 100); if (invoiced + amt > d.subtotal) return toast('That would invoice more than the contract value', 'err');
            const inv = await E.act('invoice', () => ES.biz.invoiceFrom(d, { due_date: v.due, lines: v.pct >= 100 ? undefined : [{ desc: v.pct + '% of ' + d.no, qty: 1, price: amt }] }), 'Invoice issued'); ES.ui.drawer.close(); if (inv) docDrawer(inv.id); }; } }); }
        else if (a === 'pay') { const bal = d.total - d.paid; const f = [{ name: 'amount', label: 'Amount received (Rp)', type: 'money', required: true, default: bal }, { name: 'date', label: 'Date received', type: 'date', default: F.today() }, { name: 'method', label: 'Method', type: 'select', options: ['Bank transfer', 'Cash', 'Cheque'].map((x) => [x, x]) }, { name: 'reference', label: 'Reference', full: true }];
          ES.ui.drawer.open({ title: 'Record payment · balance ' + F.rp(bal), body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn go" data-s>Record payment</button>', onMount: (bb, dd) => { ES.ui.bindMoney(bb); dd.querySelector('[data-x]').onclick = () => docDrawer(d.id); dd.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(bb, f, (v, fail) => { if (v.amount > bal) fail('amount', 'More than the balance'); if (!(v.amount > 0)) fail('amount', 'Enter an amount'); }); if (!v) return;
            const r = await E.act('payment', () => ES.biz.recordPayment(d.id, v), 'Payment recorded'); ES.ui.drawer.close(); if (r && r.status === 'paid') { toast('Paid in full. Receipt ' + r.receipt.no + ' issued.', 'ok'); docDrawer(d.id); } else docDrawer(d.id); }; } }); }
      })) });
  }

  // ---------- payments ----------
  function payments(el, ev) {
    const rows = DB().all("SELECT p.*, d.no doc_no, d.party_name, o.no po_no, v.name vendor FROM payments p LEFT JOIN documents d ON d.id=p.doc_id LEFT JOIN purchase_orders o ON o.id=p.po_id LEFT JOIN vendors v ON v.id=o.vendor_id WHERE p.event_id=? ORDER BY p.date DESC, p.id DESC", [ev.id]);
    const inn = rows.filter((r) => r.direction === 'in').reduce((a, r) => a + r.amount, 0), out = rows.filter((r) => r.direction === 'out').reduce((a, r) => a + r.amount, 0);
    el.innerHTML = `<div class="grid g3" style="margin-bottom:14px"><div class="card kpi"><div class="l">Received</div><div class="n">${F.rpShort(inn)}</div></div><div class="card kpi"><div class="l">Paid out</div><div class="n">${F.rpShort(out)}</div></div><div class="card kpi"><div class="l">Net</div><div class="n">${F.rpShort(inn - out)}</div></div></div><div class="card"><div id="py"></div></div>`;
    ES.ui.dataTable($('#py'), { rows, pageSize: 20, exportName: 'payments', searchKeys: ['doc_no', 'party_name', 'po_no', 'vendor', 'note'], filters: [{ key: 'direction', label: 'Direction', options: [['in', 'Received'], ['out', 'Paid']] }], columns: [{ key: 'date', label: 'Date', render: (r) => F.date(r.date) }, { key: 'direction', label: '', render: (r) => tag(r.direction === 'in' ? 'In' : 'Out', r.direction === 'in' ? 'g' : '') },
      { key: 'who', label: 'Party', render: (r) => esc(r.party_name || r.vendor || (r.note || '').replace('commission:', 'Commission #')), value: (r) => r.party_name || r.vendor || r.note }, { key: 'ref', label: 'For', render: (r) => esc(r.doc_no || r.po_no || ''), value: (r) => r.doc_no || r.po_no || '' }, { key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount', num: true, render: (r) => F.rp(r.amount) }] });
  }

  // ---------- journal ----------
  function journal(el, ev) {
    el.innerHTML = `<div class="card"><div class="card-h"><h3>Journal</h3><span class="hint">Every sale, payment and bill posts here automatically</span>${can('accounting.post') ? '<button class="btn primary sm" id="newJ" style="margin-left:12px">Manual journal</button>' : ''}</div><div id="jr"></div></div>`;
    const rows = DB().all("SELECT e.*, (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE entry_id=e.id) amount FROM journal_entries e WHERE e.event_id=? OR e.event_id IS NULL ORDER BY e.date DESC, e.id DESC LIMIT 3000", [ev.id]);
    ES.ui.dataTable($('#jr'), { rows, pageSize: 20, exportName: 'journal', searchKeys: ['no', 'memo', 'source'], filters: [{ key: 'source', label: 'Source', options: [...new Set(rows.map((r) => r.source))].map((s) => [s, s]) }], columns: [{ key: 'date', label: 'Date', render: (r) => F.date(r.date) }, { key: 'no', label: 'Number' }, { key: 'memo', label: 'Memo', render: (r) => esc(r.memo) + (r.reversed ? ' ' + tag('Reversed', 'r') : '') }, { key: 'source', label: 'Source' }, { key: 'amount', label: 'Amount', num: true, render: (r) => F.rp(r.amount) }], onRow: jDrawer });
    if ($('#newJ')) $('#newJ').onclick = () => manualJournal(ev);
  }
  function jDrawer(e) {
    const ls = DB().all('SELECT l.*, a.code, a.name FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE entry_id=?', [e.id]);
    ES.ui.drawer.open({ title: e.no, wide: true, body: `<div class="kv"><span>Date</span><span>${F.date(e.date)}</span><span>Memo</span><span>${esc(e.memo)}</span><span>By</span><span>${esc(e.created_by || '')}</span></div><table class="tbl" style="margin-top:14px"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${ls.map((l) => `<tr><td>${esc(l.code)} ${esc(l.name)}</td><td class="num">${l.debit ? F.rp(l.debit) : ''}</td><td class="num">${l.credit ? F.rp(l.credit) : ''}</td></tr>`).join('')}</tbody></table>`,
      footer: can('accounting.post') && !e.reversed && e.source !== 'reversal' ? '<button class="btn danger" id="rev">Reverse this entry</button>' : '', onMount: (b, d) => { const r = d.querySelector('#rev'); if (r) r.onclick = async () => { if (!(await ES.ui.confirm('Reverse ' + e.no + '?', 'A mirror entry is posted. The original stays visible for the audit trail.', { danger: true, ok: 'Reverse' }))) return; await E.act('reverse', () => ES.ledger.reverse(e.id, 'reversed by ' + ES.session.name), 'Reversed'); ES.ui.drawer.close(); }; } });
  }
  function manualJournal(ev) {
    const accs = DB().all('SELECT * FROM accounts WHERE active=1 ORDER BY code'); const row = () => `<div class="row jl" style="gap:6px;margin-top:6px"><select class="input" data-a style="flex:1">${accs.map((a) => `<option value="${a.id}">${a.code} ${esc(a.name)}</option>`).join('')}</select><input class="input" data-d style="width:130px;text-align:right" placeholder="Debit" inputmode="numeric"><input class="input" data-c style="width:130px;text-align:right" placeholder="Credit" inputmode="numeric"></div>`;
    ES.ui.drawer.open({ title: 'Manual journal', wide: true, body: `${ES.ui.formHTML([{ name: 'date', label: 'Date', type: 'date', default: F.today() }, { name: 'memo', label: 'Memo', required: true, full: true }])}<div class="section-t" style="margin:16px 0 6px">Lines</div><div id="jl">${row() + row()}</div><button class="btn sm" id="jadd" style="margin-top:8px">Add line</button><div id="jtot" class="muted" style="margin-top:8px;text-align:right"></div>`, footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Post</button>', onMount: (b, d) => {
      const read = () => $$('.jl', b).map((r) => ({ account_id: Number($('[data-a]', r).value), debit: F.parseNum($('[data-d]', r).value), credit: F.parseNum($('[data-c]', r).value) })).filter((l) => l.debit || l.credit);
      const tot = () => { const l = read(); const dr = l.reduce((a, x) => a + x.debit, 0), cr = l.reduce((a, x) => a + x.credit, 0); $('#jtot', b).innerHTML = `Debit ${F.rp(dr)} · Credit ${F.rp(cr)} · ` + (dr === cr && dr ? '<b style="color:var(--green)">balanced</b>' : '<b style="color:var(--red)">difference ' + F.rp(Math.abs(dr - cr)) + '</b>'); };
      b.addEventListener('input', tot); tot(); $('#jadd', b).onclick = () => $('#jl', b).insertAdjacentHTML('beforeend', row()); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, [{ name: 'date', label: 'd', required: true }, { name: 'memo', label: 'm', required: true }]); if (!v) return; await E.act('manual journal', () => ES.ledger.post({ event_id: ev.id, date: v.date, memo: v.memo, source: 'manual', lines: read() }), 'Posted'); ES.ui.drawer.close(); }; } });
  }

  // ---------- statements ----------
  const tbl = (head, rows, foot) => `<table class="tbl"><thead><tr>${head.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
  function trial(el, ev) {
    el.innerHTML = '<div class="card">' + evFilter(ev) + '<div id="tb"></div></div>';
    scoped(el, ev, (eid) => { const t = ES.ledger.trial(eid).filter((r) => r.d || r.c); const D = t.reduce((a, r) => a + r.d, 0), C = t.reduce((a, r) => a + r.c, 0);
      $('#tb', el).innerHTML = tbl(['Account', 'Debit', 'Credit'], t.map((r) => `<tr class="click" data-acc="${r.id}"><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${F.rp(r.d)}</td><td class="num">${F.rp(r.c)}</td></tr>`), `<tr><td><b>Total</b></td><td class="num"><b>${F.rp(D)}</b></td><td class="num"><b>${F.rp(C)}</b></td></tr>`) + `<div class="notice ${D === C ? 'ok' : ''}" style="margin-top:12px">${D === C ? '✓ Debits equal credits. The books balance.' : '✗ Out of balance by ' + F.rp(Math.abs(D - C))}</div><div class="muted" style="margin-top:6px">Click an account to see its ledger.</div>`;
      $$('[data-acc]', el).forEach((r) => (r.onclick = () => ledgerDrawer(Number(r.dataset.acc), eid))); });
  }
  function ledgerDrawer(id, eid) {
    const a = DB().get('SELECT * FROM accounts WHERE id=?', [id]); const rows = ES.ledger.accountLedger(id, eid); let run = 0; const dr = a.type === 'asset' || a.type === 'expense';
    ES.ui.drawer.open({ title: a.code + ' ' + a.name, wide: true, body: tbl(['Date · memo', 'Debit', 'Credit', 'Balance'], rows.map((r) => { run += dr ? r.debit - r.credit : r.credit - r.debit; return `<tr><td>${F.date(r.date)} · ${esc(r.memo)}<div class="sub">${esc(r.no)}</div></td><td class="num">${r.debit ? F.rp(r.debit) : ''}</td><td class="num">${r.credit ? F.rp(r.credit) : ''}</td><td class="num">${F.rp(run)}</td></tr>`; })) });
  }
  function income(el, ev) {
    el.innerHTML = '<div class="card">' + evFilter(ev) + '<div id="is"></div></div>';
    scoped(el, ev, (eid) => { const s = ES.ledger.incomeStatement(eid); const list = (arr) => arr.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${F.rp(r.net)}</td></tr>`);
      $('#is', el).innerHTML = `<div class="notice" style="margin-bottom:12px">Ticket and sponsor money is held as a deposit until the event date, then recognised as revenue. Before that, revenue here shows only transfer fees.</div>` + tbl(['Revenue', ''], list(s.revenue), `<tr><td><b>Total revenue</b></td><td class="num"><b>${F.rp(s.totalRevenue)}</b></td></tr>`) + '<div style="height:14px"></div>' + tbl(['Expenses', ''], list(s.expenses), `<tr><td><b>Total expenses</b></td><td class="num"><b>${F.rp(s.totalExpenses)}</b></td></tr>`) + `<div class="card kpi" style="margin-top:14px"><div class="l">${s.net >= 0 ? 'Profit' : 'Loss'} so far</div><div class="n" style="color:${s.net >= 0 ? 'var(--green)' : 'var(--red)'}">${F.rp(s.net)}</div></div>`; });
  }
  function balance(el, ev) {
    el.innerHTML = '<div class="card">' + evFilter(ev) + '<div id="bs"></div></div>';
    scoped(el, ev, (eid) => { const b = ES.ledger.balanceSheet(eid); const list = (arr) => arr.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${F.rp(r.net)}</td></tr>`);
      $('#bs', el).innerHTML = `<div class="grid g2"><div>${tbl(['Assets', ''], list(b.assets), `<tr><td><b>Total assets</b></td><td class="num"><b>${F.rp(b.totalAssets)}</b></td></tr>`)}</div><div>${tbl(['Liabilities and equity', ''], list(b.liabilities).concat(list(b.equity), [`<tr><td>Current earnings</td><td class="num">${F.rp(b.currentEarnings)}</td></tr>`]), `<tr><td><b>Total</b></td><td class="num"><b>${F.rp(b.totalLiabilities + b.totalEquity)}</b></td></tr>`)}</div></div><div class="notice ${b.balanced ? 'ok' : ''}" style="margin-top:12px">${b.balanced ? '✓ Assets equal liabilities plus equity.' : '✗ The balance sheet does not balance.'}</div>`; });
  }

  // ---------- budget ----------
  function budget(el, ev) {
    const rows = ES.ledger.budgetStatus(ev.id); const P = rows.reduce((a, r) => a + r.planned, 0), C = rows.reduce((a, r) => a + r.committed, 0), Pd = rows.reduce((a, r) => a + r.paid, 0);
    const ceil = (DB().get('SELECT budget_ceiling FROM projects WHERE id=?', [ev.project_id]) || {}).budget_ceiling || 0;
    el.innerHTML = `<div class="grid g4" style="margin-bottom:14px"><div class="card kpi"><div class="l">Budget ceiling</div><div class="n">${F.rpShort(ceil)}</div></div><div class="card kpi"><div class="l">Planned</div><div class="n">${F.rpShort(P)}</div></div><div class="card kpi"><div class="l">Committed (orders and invoices)</div><div class="n">${F.rpShort(C)}</div><div class="bar ${C > P ? 'r' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, P ? C / P * 100 : 0)}%"></i></div></div><div class="card kpi"><div class="l">Paid</div><div class="n">${F.rpShort(Pd)}</div></div></div><div class="card"><div id="bg"></div></div>`;
    ES.ui.dataTable($('#bg'), { rows, noSearch: true, pageSize: 30, exportName: 'budget', columns: [{ key: 'category', label: 'Category' }, { key: 'name', label: 'Line' }, { key: 'planned', label: 'Planned', num: true, render: (r) => F.rp(r.planned) }, { key: 'committed', label: 'Committed', num: true, render: (r) => F.rp(r.committed) }, { key: 'paid', label: 'Paid', num: true, render: (r) => F.rp(r.paid) },
      { key: 'remaining', label: 'Remaining', num: true, render: (r) => `<span style="color:${r.remaining < 0 ? 'var(--red)' : 'inherit'};font-weight:${r.remaining < 0 ? 700 : 400}">${F.rp(r.remaining)}</span>` }, { key: 'u', label: 'Used', sortable: false, hideExport: true, render: (r) => `<div class="bar ${r.committed > r.planned ? 'r' : ''}" style="width:90px"><i style="width:${Math.min(100, r.planned ? r.committed / r.planned * 100 : 0)}%"></i></div>` }],
      onRow: can('accounting') ? (r) => { const f = [{ name: 'planned', label: 'Planned amount (Rp)', type: 'money', required: true }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }];
        ES.ui.drawer.open({ title: r.category + ' · ' + r.name, body: ES.ui.formHTML(f, r), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, d) => { ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('budget line', () => { DB().update('budget_lines', r.id, { planned: v.planned, notes: v.notes }); DB().log('budget changed', 'budget_lines', r.id, r.name + ' ' + F.rp(r.planned) + ' → ' + F.rp(v.planned)); }, 'Saved'); ES.ui.drawer.close(); }; } }); } : null });
  }

  // ---------- tax ----------
  function tax(el, ev) {
    const t = ES.ledger.trial(ev.id); const g = (c) => (t.find((r) => r.code === c) || { net: 0 }).net;
    const stamp = DB().val("SELECT COALESCE(SUM(stamp),0) FROM documents WHERE event_id=? AND status!='void'", [ev.id]) || 0;
    const pos = DB().all("SELECT p.*, v.name vendor FROM purchase_orders p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.event_id=? AND p.status='paid' AND p.tax_code!='none'", [ev.id]);
    el.innerHTML = `<div class="notice" style="margin-bottom:12px;background:var(--yellow-soft);border-color:var(--yellow)">These numbers follow the rates in Settings (VAT ${ES.cfg.get('tax.ppn_rate', E.ctx())}%, PPh 23 ${ES.cfg.get('tax.pph23_rate', E.ctx())}%). The rates are placeholders. Your accountant must confirm them and the filing rules, including entertainment tax set by the local government.</div>
      <div class="grid g4" style="margin-bottom:14px"><div class="card kpi"><div class="l">VAT collected (output)</div><div class="n">${F.rpShort(g('2200'))}</div></div><div class="card kpi"><div class="l">VAT paid (input)</div><div class="n">${F.rpShort(g('1300'))}</div></div><div class="card kpi"><div class="l">Withholding to pay</div><div class="n">${F.rpShort(g('2210'))}</div></div><div class="card kpi"><div class="l">Stamp duty on documents</div><div class="n">${F.rpShort(stamp)}</div></div></div>
      <div class="card"><div class="card-h"><h3>Vendor payments with tax</h3></div>${tbl(['Order · vendor', 'Base', 'VAT', 'Withheld'], pos.map((p) => { const x = ES.biz.taxesFor(p); return `<tr><td>${esc(p.no)} · ${esc(p.vendor || '')}</td><td class="num">${F.rp(x.base)}</td><td class="num">${F.rp(x.ppn)}</td><td class="num">${F.rp(x.pph)}</td></tr>`; })) || ''}</div>`;
  }

  // ---------- close ----------
  function close(el, ev) {
    const lock = DB().setting('books_locked_until', ''); const rec = DB().setting('recognised.' + ev.id, ''); const t = ES.ledger.trial(ev.id); const g = (c) => (t.find((r) => r.code === c) || { net: 0 }).net;
    const past = ev.date <= F.today();
    el.innerHTML = `<div class="grid g2"><div class="card"><div class="card-h"><h3>Revenue recognition</h3></div><p class="muted" style="margin-bottom:12px">Money received before the show is a deposit, not income. On the event date it moves into revenue.</p>
      <div class="kv" style="margin-bottom:12px"><span>Ticket deposits</span><span>${F.rp(g('2100'))}</span><span>Sponsor deposits</span><span>${F.rp(g('2110'))}</span><span>Event date</span><span>${F.date(ev.date)}</span><span>Status</span><span>${rec ? tag('Recognised ' + F.date(rec), 'g') : past ? tag('Ready', 'a') : tag('Not yet: event is in the future')}</span></div>
      ${can('accounting.post') ? `<button class="btn primary" id="recog" ${rec || !past ? 'disabled' : ''}>Recognise revenue and close the event</button>` : ''}</div>
      <div class="card"><div class="card-h"><h3>Lock the books</h3></div><p class="muted" style="margin-bottom:12px">Nothing can be posted on or before the lock date. Reverse an entry in a later period instead.</p><div class="kv" style="margin-bottom:12px"><span>Locked through</span><span>${lock ? F.date(lock) : 'Not locked'}</span></div>
      ${can('accounting.post') ? `<div class="row" style="gap:8px"><input type="date" class="input" id="lockDate" style="width:auto" value="${lock || ''}"><button class="btn" id="lockBtn">Set lock date</button></div>` : ''}</div></div>`;
    if ($('#recog')) $('#recog').onclick = async () => { if (!(await ES.ui.confirm('Recognise revenue?', 'Ticket deposits ' + F.rp(g('2100')) + ' and sponsor deposits ' + F.rp(g('2110')) + ' become revenue, and the event is closed.', { ok: 'Recognise' }))) return; const r = await E.act('recognise revenue', () => ES.biz.recogniseRevenue(ev.id), 'Revenue recognised'); if (r) toast('Recognised ' + F.rp(r.tickets + r.sponsors), 'ok'); };
    if ($('#lockBtn')) $('#lockBtn').onclick = () => E.act('lock books', () => { DB().setSetting('books_locked_until', $('#lockDate').value); DB().log('books locked', 'settings', 0, $('#lockDate').value); }, 'Saved');
  }

  E.register('accounting', { label: 'Accounting', icon: 'acc', section: 'Money', perm: 'accounting', render, keywords: 'invoice quotation contract kwitansi receipt journal ledger tax budget payments' });
})();
