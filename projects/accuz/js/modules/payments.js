/* Buku — payments received and made: list, record (with allocation and PPh 23), view with kwitansi. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const U2 = () => Buku.ui2;

  function list(params, q) {
    const db = Buku.db;
    const dir = q.direction === 'out' ? 'out' : 'in';
    const rows = db.all(`SELECT p.*, c.name contact_name, a.name account_name, (SELECT group_concat(d.number, ', ') FROM payment_allocations x JOIN documents d ON d.id=x.document_id WHERE x.payment_id=p.id) docs
      FROM payments p LEFT JOIN contacts c ON c.id=p.contact_id JOIN accounts a ON a.id=p.account_id WHERE p.direction=? ORDER BY p.date DESC, p.id DESC LIMIT 500`, [dir]);
    ui.page({
      title: dir === 'in' ? t('Payments received') : t('Payments made'),
      actions: '<a class="btn primary" href="#/payments/new?direction=' + dir + '">' + h(dir === 'in' ? t('Record payment') : t('Pay')) + '</a>',
      body: (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(dir === 'in' ? t('From') : t('To')) + '</th><th>' + h(t('For')) + '</th><th>' + h(t('Account')) + '</th><th class="num">' + h(t('Amount')) + '</th><th>' + h(t('Status')) + '</th></tr></thead><tbody>' +
        rows.map((p) => '<tr class="link" data-href="#/payments/' + p.id + '"><td class="nowrap">' + h(ui.date(p.date)) + '</td><td class="mono">' + h(p.number) + '</td><td>' + h(p.contact_name || '') + '</td><td class="sub">' + h(p.docs || (p.unapplied ? t('Deposit') : '')) + '</td><td>' + h(p.account_name) + '</td><td class="num">' + h(U2().money(p.amount, p.currency)) + '</td><td>' + U2().chip(p.status) + '</td></tr>').join('') +
        '</tbody></table></div>' : ui.empty(t('No payments yet.'), '<a class="btn primary" href="#/payments/new?direction=' + dir + '">' + h(dir === 'in' ? t('Record payment') : t('Pay')) + '</a>')),
    });
    U2().rowLinks();
  }

  /** Record a payment. Query: direction, contact, doc (preselect), line (bank import line), amount, date. */
  function form(params, q) {
    const db = Buku.db;
    const dir = q.direction === 'out' ? 'out' : 'in';
    const base = Buku.fx.base(db);
    const funds = Buku.payments.fundAccounts(db, dir);
    const importLine = q.line ? db.get('SELECT * FROM bank_import_lines WHERE id=?', [Number(q.line)]) : null;
    const docPre = q.doc ? db.get('SELECT * FROM documents WHERE id=?', [Number(q.doc)]) : null;
    const contactId = q.contact ? Number(q.contact) : docPre ? docPre.contact_id : '';
    const accDefault = importLine ? importLine.account_id : (docPre && funds.find((a) => (a.currency || base) === docPre.currency && a.subtype === 'bank') || funds[0] || {}).id;
    const pph = db.get("SELECT * FROM taxes WHERE kind='pph23' AND direction='withheld_by_customer' AND is_active=1 ORDER BY id LIMIT 1");
    const state = { allocs: new Map(), dirty: false, manualAmount: !!importLine };

    ui.page({
      title: dir === 'in' ? t('Record payment received') : t('Record payment made'),
      actions: '<a class="btn ghost" href="' + (docPre ? '#/doc/' + docPre.id : '#/payments?direction=' + dir) + '">' + h(t('Cancel')) + '</a>',
      body: (importLine ? '<div class="banner info"><div>' + h(t('From the bank statement')) + ': <strong>' + h(ui.date(importLine.date)) + ' · ' + h(importLine.description) + '</strong></div></div>' : '') +
        '<form id="pf" novalidate><div class="doc-head">' +
        ui.field(dir === 'in' ? t('Received from') : t('Paid to'), ui.select('contact_id', U2().contactOptions(null, t('Choose contact…')), contactId), { cls: 'span2' }) +
        ui.field(t('Date'), ui.input('date', importLine ? importLine.date : q.date || Buku.util.today(), { type: 'date' })) +
        ui.field(dir === 'in' ? t('Into account') : t('From account'), ui.select('account_id', funds.map((a) => ({ value: a.id, label: Buku.i18n.accName(a) + (a.currency ? ' (' + a.currency + ')' : '') })), accDefault)) +
        '<div id="amt-slot"></div><div id="rate-slot"></div>' +
        ui.field(t('Bank charges'), '<span data-slot="fee"></span>', { optional: true, hint: dir === 'in' ? t('Deducted by the bank from what arrived.') : t('Charged on top of the transfer.') }) +
        ui.field(t('Reference'), ui.input('reference', importLine ? importLine.description.slice(0, 60) : ''), { optional: true }) +
        '</div>' +
        '<h2 class="section-title">' + h(dir === 'in' ? t('Invoices being paid') : t('Bills or refunds being paid')) + '</h2>' +
        '<div id="docs"></div><div id="psum" class="pay-summary"></div>' +
        ui.field(t('Memo'), ui.input('memo', ''), { optional: true }) +
        '<div class="form-actions sticky"><button type="submit" class="btn primary" id="post">' + h(dir === 'in' ? t('Record payment') : t('Record payment made')) + '</button></div></form>',
    });
    const formEl = ui.$('#pf');

    function acc() { return db.get('SELECT * FROM accounts WHERE id=?', [Number(formEl.querySelector('[name=account_id]').value)]); }
    function accCur() { const a = acc(); return a ? a.currency || base : base; }

    function renderAmount() {
      const cur = accCur(), dec = ui.curDecimals(cur);
      const prevAmt = formEl.querySelector('[name=amount]');
      const val = prevAmt ? prevAmt.value : importLine ? Buku.money.format(Math.abs(importLine.amount), dec) : '';
      ui.$('#amt-slot').innerHTML = ui.field(dir === 'in' ? t('Amount received ({cur})', { cur }) : t('Amount paid ({cur})', { cur }), '<input name="amount" class="num" inputmode="decimal" data-decimals="' + dec + '" value="' + h(val) + '">');
      formEl.querySelector('[data-slot=fee]').innerHTML = '<input name="fee" class="num" inputmode="decimal" value="" placeholder="0">';
      const rs = ui.$('#rate-slot');
      if (cur === base) rs.innerHTML = '';
      else {
        const r = Buku.fx.lookup(db, cur, formEl.querySelector('[name=date]').value);
        rs.innerHTML = ui.field(t('Rate (IDR per {cur})', { cur }), '<input name="rate" class="num" inputmode="decimal" value="' + h(r ? Buku.money.formatRate(r.rate) : '') + '">');
      }
    }

    function docsHtml() {
      const cid = Number(formEl.querySelector('[name=contact_id]').value);
      if (!cid) return '<p class="note">' + h(t('Choose the contact to see their open documents.')) + '</p>';
      const docs = Buku.docs.openForPayment(db, cid, dir);
      if (!docs.length) return '<p class="note">' + h(dir === 'in' ? t('No open invoices. The payment will be kept as a customer deposit.') : t('No open bills. The payment will be kept as a vendor prepayment.')) + '</p>';
      const cust = db.get('SELECT * FROM contacts WHERE id=?', [cid]);
      const wantWht = dir === 'in' && pph && cust.withholds_pph23 && !cust.is_individual;
      return '<div class="table-wrap"><table class="data alloc"><thead><tr><th></th><th>' + h(t('Document')) + '</th><th>' + h(t('Due')) + '</th><th class="num">' + h(t('Open')) + '</th><th class="num">' + h(t('Apply')) + '</th>' +
        (dir === 'in' ? '<th>' + h(t('PPh 23 withheld')) + '</th><th>' + h(t('Bukti potong no.')) + '</th>' : '') + '</tr></thead><tbody>' +
        docs.map((d) => {
          const pre = state.allocs.get(d.id);
          const checked = pre ? pre.on : docPre && docPre.id === d.id;
          const dec = ui.curDecimals(d.currency);
          const wt = wantWht && d.doc_type === 'invoice' ? Buku.payments.suggestedWithholding(db, d, d.balance).amount : 0;
          const needRate = d.currency !== accCur();
          return '<tr data-id="' + d.id + '" data-cur="' + d.currency + '"><td><input type="checkbox" name="on"' + (checked ? ' checked' : '') + '></td>' +
            '<td><a href="#/doc/' + d.id + '">' + h(d.number) + '</a>' + (d.doc_type === 'credit_note' ? ' <span class="chip">' + h(t('Refund')) + '</span>' : '') + '<div class="sub">' + h(ui.date(d.date)) + '</div></td>' +
            '<td class="nowrap">' + h(d.due_date ? ui.date(d.due_date) : '') + '</td><td class="num">' + h(U2().money(d.balance, d.currency)) + '</td>' +
            '<td><input class="num small" name="apply" inputmode="decimal" data-decimals="' + dec + '" value="' + h(pre ? pre.apply : checked ? Buku.money.format(d.balance, dec) : '') + '">' +
            (needRate ? '<div class="sub">' + h(t('Rate')) + ' <input class="num small" name="doc_rate" value="' + h((Buku.fx.lookup(db, d.currency, formEl.querySelector('[name=date]').value) || {}).rate || '') + '"></div>' : '') + '</td>' +
            (dir === 'in' ? '<td class="nowrap"><label class="check"><input type="checkbox" name="wt_on"' + ((pre ? pre.wtOn : wt > 0) ? ' checked' : '') + '><input class="num small" name="wt" inputmode="decimal" data-decimals="' + dec + '" value="' + h(pre ? pre.wt : wt ? Buku.money.format(wt, dec) : '') + '"></label></td>' +
              '<td><input name="bp" class="small" value="' + h(pre ? pre.bp : '') + '" placeholder="' + h(t('optional')) + '"></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }

    function readAllocs(strict) {
      const out = [];
      ui.$$('#docs tr[data-id]').forEach((tr) => {
        const dec = ui.curDecimals(tr.dataset.cur);
        const val = (n) => { const el = tr.querySelector('[name=' + n + ']'); return el ? el.value : ''; };
        const on = tr.querySelector('[name=on]').checked;
        state.allocs.set(Number(tr.dataset.id), { on, apply: val('apply'), wt: val('wt'), wtOn: tr.querySelector('[name=wt_on]') ? tr.querySelector('[name=wt_on]').checked : false, bp: val('bp') });
        if (!on) return;
        let amount = 0, wt = 0;
        try { amount = Buku.money.parse(val('apply'), dec) || 0; wt = tr.querySelector('[name=wt_on]') && tr.querySelector('[name=wt_on]').checked ? Buku.money.parse(val('wt'), dec) || 0 : 0; }
        catch (e) { if (strict) throw e; }
        out.push({ document_id: Number(tr.dataset.id), currency: tr.dataset.cur, amount, withholding: wt, bukti_potong_no: val('bp') || null, doc_rate: val('doc_rate') || undefined });
      });
      return out;
    }

    function summary() {
      const cur = accCur(), dec = ui.curDecimals(cur);
      let amount = 0, fee = 0;
      try { amount = Buku.money.parse(formEl.querySelector('[name=amount]').value, dec) || 0; } catch (e) { amount = 0; }
      try { fee = Buku.money.parse(formEl.querySelector('[name=fee]').value, dec) || 0; } catch (e) { fee = 0; }
      const allocs = readAllocs(false);
      const same = allocs.every((a) => a.currency === cur);
      const cashApplied = allocs.reduce((s, a) => s + a.amount - a.withholding, 0);
      const wtTotal = allocs.reduce((s, a) => s + a.withholding, 0);
      const F = (v) => U2().money(v, cur);
      const rows = [];
      if (same) {
        const got = amount + (dir === 'in' ? fee : 0);
        rows.push([dir === 'in' ? t('Settled by cash') : t('Applied'), F(cashApplied)]);
        if (wtTotal) rows.push([t('Settled by PPh 23 withheld'), F(wtTotal)]);
        const left = got - cashApplied;
        if (left > 0) rows.push([dir === 'in' ? t('Kept as customer deposit') : t('Kept as vendor prepayment'), F(left)]);
        if (left < 0) rows.push([t('Short by'), '<span class="bad-text">' + h(F(-left)) + '</span>', true]);
        if (!allocs.length && !amount) rows.length = 0;
      } else rows.push([t('Different currencies'), t('The difference to the invoice rate is posted as FX gain or loss.')]);
      ui.$('#psum').innerHTML = rows.map(([k, v, raw]) => '<div class="tot-row"><span>' + h(k) + '</span><strong class="num">' + (raw ? v : h(v)) + '</strong></div>').join('');
    }

    /** Fill "apply" amounts oldest-first from the amount received (same currency only). */
    function autoAllocate() {
      if (!state.manualAmount) return;
      const cur = accCur(), dec = ui.curDecimals(cur);
      let left;
      try { left = (Buku.money.parse(formEl.querySelector('[name=amount]').value, dec) || 0) + (dir === 'in' ? Buku.money.parse(formEl.querySelector('[name=fee]').value || '0', dec) || 0 : 0); } catch (e) { return; }
      ui.$$('#docs tr[data-id]').forEach((tr) => {
        if (tr.dataset.cur !== cur) return;
        const d = db.get('SELECT * FROM documents WHERE id=?', [Number(tr.dataset.id)]);
        const bal = Buku.docs.balance(d);
        const wtEl = tr.querySelector('[name=wt_on]');
        const wtFull = wtEl && wtEl.checked ? Buku.payments.suggestedWithholding(db, d, bal).amount : 0;
        const cashNeeded = bal - wtFull;
        if (left <= 0) { tr.querySelector('[name=on]').checked = false; tr.querySelector('[name=apply]').value = ''; return; }
        let apply, wt;
        if (left >= cashNeeded) { apply = bal; wt = wtFull; left -= cashNeeded; }
        else { wt = wtEl && wtEl.checked ? Buku.payments.suggestedWithholding(db, d, Number(Buku.money.divRound(BigInt(left) * BigInt(bal), BigInt(Math.max(1, cashNeeded))))).amount : 0; apply = left + wt; left = 0; }
        tr.querySelector('[name=on]').checked = true;
        tr.querySelector('[name=apply]').value = Buku.money.format(apply, dec);
        const w = tr.querySelector('[name=wt]'); if (w) w.value = wt ? Buku.money.format(wt, dec) : '';
      });
    }

    function refreshDocs() { ui.$('#docs').innerHTML = docsHtml(); summary(); }

    formEl.addEventListener('change', (ev) => {
      const n = ev.target.name;
      if (n === 'contact_id') { state.allocs.clear(); refreshDocs(); autoAllocate(); summary(); }
      if (n === 'account_id') { renderAmount(); refreshDocs(); }
      if (n === 'date') renderAmount();
      if (n === 'on' || n === 'wt_on') {
        const tr = ev.target.closest('tr');
        if (n === 'on' && ev.target.checked && !tr.querySelector('[name=apply]').value) {
          const d = db.get('SELECT * FROM documents WHERE id=?', [Number(tr.dataset.id)]);
          tr.querySelector('[name=apply]').value = Buku.money.format(Buku.docs.balance(d), ui.curDecimals(d.currency));
        }
        if (n === 'wt_on' && ev.target.checked) {
          const d = db.get('SELECT * FROM documents WHERE id=?', [Number(tr.dataset.id)]);
          let applied = 0; try { applied = Buku.money.parse(tr.querySelector('[name=apply]').value, ui.curDecimals(d.currency)) || Buku.docs.balance(d); } catch (e) { applied = Buku.docs.balance(d); }
          tr.querySelector('[name=wt]').value = Buku.money.format(Buku.payments.suggestedWithholding(db, d, applied).amount, ui.curDecimals(d.currency));
        }
        if (!state.manualAmount) syncAmountFromAllocs();
        summary();
      }
      state.dirty = true;
    });
    formEl.addEventListener('input', (ev) => {
      const n = ev.target.name;
      if (n === 'amount' || n === 'fee') { state.manualAmount = true; autoAllocate(); }
      if ((n === 'apply' || n === 'wt') && !state.manualAmount) syncAmountFromAllocs();
      summary();
      state.dirty = true;
    });

    /** When the amount was not typed, it follows the documents chosen (cash part only). */
    function syncAmountFromAllocs() {
      const cur = accCur(), dec = ui.curDecimals(cur);
      const allocs = readAllocs(false);
      if (!allocs.length || allocs.some((a) => a.currency !== cur)) return;
      const cash = allocs.reduce((s, a) => s + a.amount - a.withholding, 0);
      formEl.querySelector('[name=amount]').value = cash ? Buku.money.format(cash, dec) : '';
    }

    formEl.addEventListener('submit', (ev) => {
      ev.preventDefault();
      try {
        const f = ui.formData(formEl);
        const cur = accCur(), dec = ui.curDecimals(cur);
        const allocs = readAllocs(true).map((a) => ({ document_id: a.document_id, amount: a.amount, withholding: a.withholding, bukti_potong_no: a.bukti_potong_no, doc_rate: a.doc_rate }));
        const input = {
          direction: dir, contact_id: f.contact_id ? Number(f.contact_id) : null, date: f.date, account_id: Number(f.account_id),
          amount: Buku.money.parse(f.amount, dec) || 0, fee: Buku.money.parse(f.fee || '0', dec) || 0, rate: f.rate, reference: f.reference, memo: f.memo,
          bank_import_line_id: importLine ? importLine.id : null, allocations: allocs,
        };
        if (!input.contact_id && allocs.length) throw new Buku.BukuError('missing_contact', t('Choose the contact.'));
        let r;
        db.tx(() => {
          if (cur !== base && f.rate) { const x = Buku.fx.lookup(db, cur, f.date); if (!x || x.rate_date !== f.date) Buku.fx.set(db, cur, f.date, f.rate); }
          r = Buku.payments.post(db, input);
        });
        state.dirty = false;
        ui.toast(t('Payment {n} recorded', { n: r.number }));
        location.hash = importLine ? '#/banking/' + importLine.account_id : '#/payments/' + r.id;
      } catch (e) { ui.showError(e); }
    });

    renderAmount();
    refreshDocs();
    if (importLine) { autoAllocate(); summary(); }
    else if (docPre) syncAmountFromAllocs(), summary();
    ui.setLeaveGuard(() => (state.dirty ? t('The payment is not recorded yet. Leave anyway?') : null));
  }

  function view(params) {
    const db = Buku.db;
    const p = Buku.payments.load(db, Number(params.id));
    if (!p) throw new Buku.BukuError('not_found', t('Payment not found.'));
    const M = (v, c) => U2().money(v, c || p.currency);
    ui.page({
      title: (p.direction === 'in' ? t('Payment received') : t('Payment made')) + ' ' + p.number,
      cls: 'doc-view',
      actions: '<a class="btn ghost" href="#/payments?direction=' + p.direction + '">' + h(t('Back')) + '</a>',
      body: '<div class="doc-layout"><div class="doc-main">' +
        (p.direction === 'in' ? '<div class="doc-stage" id="paper"></div>' : '') +
        '<section class="panel"><header><h2>' + h(t('Applied to')) + '</h2></header>' +
        (p.allocations.length ? '<table class="data"><thead><tr><th>' + h(t('Document')) + '</th><th class="num">' + h(t('Amount')) + '</th><th class="num">PPh 23</th><th>' + h(t('Bukti potong')) + '</th></tr></thead><tbody>' +
          p.allocations.map((a) => '<tr><td><a href="#/doc/' + a.document_id + '">' + h(a.doc_number) + '</a></td><td class="num">' + h(M(a.amount, a.doc_currency)) + '</td><td class="num">' + h(a.withholding ? M(a.withholding, a.doc_currency) : '') + '</td>' +
            '<td>' + (a.withholding ? '<button type="button" class="btn small ghost" data-bp="' + a.id + '">' + h(a.bukti_potong_no || t('Add number')) + '</button>' : '') + '</td></tr>').join('') + '</tbody></table>'
          : '<p class="note">' + h(t('Not applied to any document.')) + '</p>') +
        (p.unapplied ? '<p class="note">' + h(p.direction === 'in' ? t('{a} kept as customer deposit.', { a: M(p.unapplied) }) : t('{a} kept as vendor prepayment.', { a: M(p.unapplied) })) + '</p>' : '') + '</section>' +
        '</div><aside class="doc-side"><div class="panel"><dl class="facts one">' +
        [[t('Status'), null, U2().chip(p.status)], [p.direction === 'in' ? t('From') : t('To'), p.contact_name || '—'], [t('Date'), ui.date(p.date)], [t('Account'), p.account_name],
          [t('Amount'), M(p.amount)], p.fee ? [t('Bank charges'), M(p.fee)] : null, p.currency !== Buku.fx.base(db) ? [t('Rate'), Buku.money.formatRate(p.rate)] : null,
          p.reference ? [t('Reference'), p.reference] : null, [t('Journal'), null, '<a href="#/journal/' + p.journal_entry_id + '">' + h(t('View entry')) + '</a>']]
          .filter(Boolean).map(([k, v, html]) => '<div><dt>' + h(k) + '</dt><dd>' + (html || h(v)) + '</dd></div>').join('') + '</dl><div class="stack">' +
        (p.direction === 'in' ? '<button type="button" class="btn primary" id="print">' + h(t('Print kwitansi')) + '</button>' : '') +
        (p.status === 'posted' ? '<button type="button" class="btn ghost danger-text" id="void">' + h(t('Void payment')) + '</button>' : '') + '</div></div></aside></div>',
    });
    if (p.direction === 'in') U2().showPaper(ui.$('#paper'), Buku.templates.renderPaymentReceipt(db, p.id));
    const pr = ui.$('#print'); if (pr) pr.addEventListener('click', () => U2().printPaper(ui.$('#paper'), 'Kwitansi ' + p.number + ' - ' + (p.contact_name || '')));
    const vd = ui.$('#void');
    if (vd) vd.addEventListener('click', async () => {
      if (!(await ui.confirm(t('Void this payment? The documents it paid become open again.'), { danger: true, okLabel: t('Void payment') }))) return;
      try { Buku.payments.voidPayment(db, p.id, Buku.util.today()); ui.toast(t('Payment voided')); ui.dispatch(); } catch (e) { ui.showError(e); }
    });
    ui.$$('[data-bp]').forEach((b) => b.addEventListener('click', () => {
      const a = p.allocations.find((x) => x.id === Number(b.dataset.bp));
      ui.modal({
        title: t('Bukti potong PPh 23'),
        body: ui.field(t('Number'), ui.input('no', a.bukti_potong_no || '')) + ui.field(t('Date'), ui.input('date', a.bukti_potong_date || p.date, { type: 'date' })),
        actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (m) => { const f = ui.formData(m.body); Buku.taxops.setBuktiPotong(db, a.id, f.no, f.date); ui.dispatch(); } }],
      });
    }));
  }

  ui.route('/payments', list);
  ui.route('/payments/new', form);
  ui.route('/payments/:id', view);
})();
