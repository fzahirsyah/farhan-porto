/* Buku — sales & purchase documents: sales orders, invoices, credit notes, bills, expenses.
   Totals are integer maths; approval posts through the posting engine. A document's total_base is
   the IDR value of its control line (receivable, payable or paid-from account). */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, msg, details) => new Buku.BukuError(code, msg, details);
  const M = () => Buku.money;
  const now = () => Buku.util.nowIso();

  const TYPES = {
    sales_order: { side: 'sale', seq: 'sales_order', posts: false },
    invoice: { side: 'sale', seq: 'invoice', posts: true },
    credit_note: { side: 'sale', seq: 'credit_note', posts: true, reverse: true },
    bill: { side: 'purchase', seq: 'bill', posts: true },
    expense: { side: 'purchase', seq: 'expense', posts: true, paidNow: true },
  };
  const OPEN_STATUSES = ['open', 'partial'];

  function type(t) {
    const x = TYPES[t];
    if (!x) throw E('bad_type', 'Unknown document type ' + t);
    return x;
  }

  // ---------------- Totals ----------------
  /** Allocate `total` across `weights` proportionally (largest remainder); returns integers summing to total. */
  function allocate(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!total || !sum) return weights.map(() => 0);
    const raw = weights.map((w) => (BigInt(total) * BigInt(w)));
    const base = raw.map((r) => Number(r / BigInt(sum)));
    let rest = total - base.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [Number(r % BigInt(sum)), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; rest > 0 && k < order.length; k++, rest--) base[order[k][1]]++;
    return base;
  }

  /**
   * Compute line and document totals. lines: [{ quantity (×1000), unit_price, discount_percent, tax_id }]
   * header: { discount_type, discount_value, withholding_tax_id }. Pure apart from reading taxes.
   */
  function compute(db, header, lines) {
    const taxes = new Map(db.all('SELECT * FROM taxes').map((t) => [t.id, t]));
    const out = lines.map((l) => {
      const qty = Number(l.quantity || 0);
      const price = Number(l.unit_price || 0);
      if (!Number.isInteger(qty) || qty < 0) throw E('invalid_qty', 'Invalid quantity.');
      if (!Number.isInteger(price) || price < 0) throw E('invalid_amount', 'Invalid price.');
      const subtotal = Number(M().divRound(BigInt(qty) * BigInt(price), 1000n));
      const pct = l.discount_percent && Number(String(l.discount_percent).replace(',', '.')) ? String(l.discount_percent).replace(',', '.') : null;
      if (pct && (Number(pct) < 0 || Number(pct) > 100)) throw E('invalid_discount', 'Discount must be between 0 and 100%.');
      const disc = pct ? M().percentOf(subtotal, pct) : 0;
      return Object.assign({}, l, { quantity: qty, unit_price: price, discount_percent: pct, line_subtotal: subtotal, line_discount: disc, line_net: subtotal - disc, line_tax: 0 });
    });
    // Document-level discount, spread over lines so tax and revenue stay per line.
    const netBefore = out.map((l) => l.line_net);
    const sumNet = netBefore.reduce((a, b) => a + b, 0);
    let docDisc = 0;
    if (header.discount_type === 'percent' && Number(header.discount_value)) {
      const p = String(header.discount_value).replace(',', '.');
      if (Number(p) < 0 || Number(p) > 100) throw E('invalid_discount', 'Discount must be between 0 and 100%.');
      docDisc = M().percentOf(sumNet, p);
    } else if (header.discount_type === 'amount' && Number(header.discount_value)) {
      docDisc = Math.round(Number(header.discount_value));
      if (docDisc < 0 || docDisc > sumNet) throw E('invalid_discount', 'The discount is larger than the total.');
    }
    allocate(docDisc, netBefore).forEach((d, i) => { out[i].line_discount += d; out[i].line_net -= d; });

    // VAT per tax code on the grouped base (matches how invoices show "VAT – 11%" on the total).
    const groups = new Map();
    out.forEach((l, i) => {
      const t = l.tax_id ? taxes.get(Number(l.tax_id)) : null;
      if (!t || (t.kind !== 'ppn_out' && t.kind !== 'ppn_in')) return;
      if (!groups.has(t.id)) groups.set(t.id, { tax: t, base: 0, idx: [] });
      const g = groups.get(t.id);
      g.base += l.line_net;
      g.idx.push(i);
    });
    const taxLines = [];
    for (const g of groups.values()) {
      const amount = Buku.tax.amount(g.base, g.tax);
      allocate(amount, g.idx.map((i) => out[i].line_net)).forEach((a, k) => { out[g.idx[k]].line_tax = a; });
      taxLines.push({ tax: g.tax, base: g.base, dpp: Buku.tax.dpp(g.base, g.tax), amount });
    }
    const subtotal = out.reduce((s, l) => s + l.line_subtotal, 0);
    const net = out.reduce((s, l) => s + l.line_net, 0);
    const taxTotal = taxLines.reduce((s, t) => s + t.amount, 0);
    let withholding = 0, whtTax = null;
    if (header.withholding_tax_id) {
      whtTax = taxes.get(Number(header.withholding_tax_id));
      if (whtTax) withholding = Buku.tax.amount(net, whtTax);
    }
    return {
      lines: out, taxLines, subtotal, net,
      discount_total: subtotal - net,
      tax_total: taxTotal,
      total: net + taxTotal,
      withholding_total: withholding, withholdingTax: whtTax,
    };
  }

  // ---------------- Helpers ----------------
  function base(db) { return Buku.fx.base(db); }

  function controlAccount(db, subtype, currency) {
    const a = db.get('SELECT * FROM accounts WHERE subtype=? AND is_active=1 AND is_header=0 AND currency=? ORDER BY code LIMIT 1', [subtype, currency])
      || db.get('SELECT * FROM accounts WHERE subtype=? AND is_active=1 AND is_header=0 AND currency IS NULL ORDER BY code LIMIT 1', [subtype]);
    if (!a) throw E('no_control_account', 'No active ' + (subtype === 'ar' ? 'receivable' : 'payable') + ' account for ' + currency + '.', { subtype, currency });
    return a;
  }

  function accountBySubtype(db, subtype) {
    const a = db.get('SELECT * FROM accounts WHERE subtype=? AND is_active=1 AND is_header=0 ORDER BY code LIMIT 1', [subtype]);
    if (!a) throw E('no_account', 'No active account of kind ' + subtype + '.', { subtype });
    return a;
  }

  function load(db, id) {
    const d = db.get(`SELECT d.*, c.name contact_name, c.npwp contact_npwp, c.email contact_email, c.phone contact_phone, c.billing_address contact_address,
      r.code rep_code, r.name rep_name FROM documents d LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN sales_reps r ON r.id=d.sales_rep_id WHERE d.id=?`, [id]);
    if (!d) return null;
    d.lines = db.all(`SELECT l.*, p.name product_name, p.code product_code, p.kind product_kind, t.code tax_code, t.print_label tax_label
      FROM document_lines l LEFT JOIN products p ON p.id=l.product_id LEFT JOIN taxes t ON t.id=l.tax_id WHERE l.document_id=? ORDER BY l.line_no`, [id]);
    d.text_blocks = JSON.parse(d.text_blocks || '{}');
    return d;
  }

  function payable(d) {
    // What the contact must pay (or be paid): bills exclude the tax we withheld.
    return d.total - (d.doc_type === 'bill' || d.doc_type === 'expense' ? d.withholding_total : 0);
  }

  function balance(d) {
    return payable(d) - d.amount_paid;
  }

  // ---------------- Save draft ----------------
  const HEADER_FIELDS = ['contact_id', 'pic_name', 'sales_rep_id', 'company_address_id', 'date', 'due_date', 'valid_until', 'validity_text', 'payment_term_text', 'terms_days',
    'reference', 'vendor_invoice_no', 'subject', 'note', 'currency', 'rate', 'discount_type', 'discount_value', 'withholding_tax_id', 'paid_from_account_id', 'source_doc_id', 'template_id',
    'faktur_no', 'faktur_date'];

  /** Create or update an editable document. input: header fields + lines + text_blocks. Returns id. */
  function save(db, docType, input) {
    const T = type(docType);
    if (!Buku.util.isIsoDate(input.date)) throw E('invalid_date', 'Enter a valid date.');
    const b = base(db);
    const currency = input.currency || b;
    if (!db.scalar('SELECT is_enabled FROM currencies WHERE code=?', [currency])) throw E('currency_disabled', currency + ' is not enabled.');
    let rate = '1';
    if (currency !== b) {
      if (!input.rate) throw E('missing_rate', 'Enter the exchange rate for ' + currency + '.');
      rate = M().rateToString(input.rate);
    }
    if (docType !== 'expense' && !input.contact_id) throw E('missing_contact', T.side === 'sale' ? 'Choose a customer.' : 'Choose a vendor.');
    if (input.due_date && !Buku.util.isIsoDate(input.due_date)) throw E('invalid_date', 'Enter a valid due date.');
    if (input.due_date && input.due_date < input.date) throw E('due_before_date', 'The due date is before the document date.');
    if (docType === 'expense' && !input.paid_from_account_id) throw E('missing_account', 'Choose the account the expense was paid from.');
    const lines = (input.lines || []).filter((l) => l.product_id || l.description || l.item_label || Number(l.unit_price) || l.account_id);
    if (!lines.length) throw E('no_lines', 'Add at least one line.');
    lines.forEach((l, i) => {
      if (l.start_date && !Buku.util.isIsoDate(l.start_date)) throw E('invalid_date', 'Line ' + (i + 1) + ': invalid start date.', { line: i });
      if (l.end_date && !Buku.util.isIsoDate(l.end_date)) throw E('invalid_date', 'Line ' + (i + 1) + ': invalid end date.', { line: i });
      if (T.side === 'purchase' && !l.account_id && !(l.product_id && db.scalar('SELECT expense_account_id FROM products WHERE id=?', [l.product_id]))) {
        throw E('missing_account', 'Line ' + (i + 1) + ': choose an expense account.', { line: i });
      }
    });
    const c = compute(db, input, lines);

    return db.tx(() => {
      let id = input.id;
      const hdr = {};
      HEADER_FIELDS.forEach((f) => { if (input[f] !== undefined) hdr[f] = input[f] === '' ? null : input[f]; });
      if (input.deal_id !== undefined) hdr.deal_id = input.deal_id || null;
      Object.assign(hdr, {
        currency, rate, discount_type: input.discount_type || 'none', discount_value: input.discount_value === undefined || input.discount_value === null ? null : String(input.discount_value),
        subtotal: c.subtotal, discount_total: c.discount_total, tax_total: c.tax_total, withholding_total: c.withholding_total, total: c.total,
        text_blocks: JSON.stringify(input.text_blocks || {}), updated_at: now(),
      });
      if (id) {
        const cur = db.get('SELECT * FROM documents WHERE id=?', [id]);
        if (!cur) throw E('not_found', 'Document not found.');
        if (!editable(db, cur)) throw E('not_editable', 'This document can no longer be edited.');
        db.update('documents', id, hdr);
        // Keep SO lines that were invoiced; the editor never removes those.
        db.run('DELETE FROM document_lines WHERE document_id=?', [id]);
      } else {
        id = db.insert('documents', Object.assign(hdr, { doc_type: docType, status: 'draft', created_at: now() }));
      }
      c.lines.forEach((l, i) => {
        db.insert('document_lines', {
          document_id: id, line_no: i + 1, product_id: l.product_id || null, item_label: l.item_label || null, description: l.description || null,
          start_date: l.start_date || null, end_date: l.end_date || null, quantity: l.quantity, unit: l.unit || null, unit_price: l.unit_price,
          discount_percent: l.discount_percent, line_subtotal: l.line_subtotal, line_discount: l.line_discount, line_net: l.line_net, line_tax: l.line_tax,
          tax_id: l.tax_id || null, account_id: l.account_id || null, line_note: l.line_note || null, source_line_id: l.source_line_id || null,
          qty_fulfilled: l.qty_fulfilled || 0, renews_subscription_id: l.renews_subscription_id || null,
        });
      });
      return id;
    });
  }

  function editable(db, d) {
    if (d.status === 'draft') return true;
    if (d.doc_type === 'sales_order' && d.status === 'confirmed') {
      return !db.scalar('SELECT count(*) FROM document_lines WHERE document_id=? AND qty_fulfilled>0', [d.id]);
    }
    return false;
  }

  function deleteDraft(db, id) {
    db.tx(() => {
      const d = db.get('SELECT * FROM documents WHERE id=?', [id]);
      if (!d) throw E('not_found', 'Document not found.');
      if (d.status !== 'draft' || d.number) throw E('not_editable', 'Only unnumbered drafts can be deleted. Void it instead.');
      db.run('DELETE FROM documents WHERE id=?', [id]);
    });
  }

  function assignNumber(db, d) {
    if (d.number) return d.number;
    const rep = d.sales_rep_id ? db.scalar('SELECT code FROM sales_reps WHERE id=?', [d.sales_rep_id]) : null;
    const n = Buku.numbering.take(db, type(d.doc_type).seq, d.date, { sales: rep || 'XX' },
      (x) => !!db.scalar('SELECT 1 FROM documents WHERE doc_type=? AND number=?', [d.doc_type, x]));
    db.run('UPDATE documents SET number=? WHERE id=?', [n, d.id]);
    return n;
  }

  function snapshotContact(db, d) {
    if (!d.contact_id) return;
    const c = db.get('SELECT name, pic_name, phone, email, npwp, billing_address FROM contacts WHERE id=?', [d.contact_id]);
    db.run('UPDATE documents SET billing_snapshot=? WHERE id=?', [JSON.stringify(c), d.id]);
  }

  // ---------------- Sales orders ----------------
  function confirm(db, id) {
    return db.tx(() => {
      const d = load(db, id);
      if (!d || d.doc_type !== 'sales_order') throw E('not_found', 'Sales order not found.');
      if (d.status !== 'draft') throw E('bad_status', 'Only drafts can be confirmed.');
      const number = assignNumber(db, d);
      snapshotContact(db, d);
      db.run("UPDATE documents SET status='confirmed', approved_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
      Buku.posting.audit(db, 'confirm', 'documents', id, number);
      return number;
    });
  }

  function markSigned(db, id, date) {
    db.tx(() => db.run('UPDATE documents SET signed_at=?, updated_at=? WHERE id=?', [date || null, now(), id]));
  }

  function setSOStatus(db, id, status) {
    db.tx(() => {
      const d = db.get('SELECT * FROM documents WHERE id=?', [id]);
      const allowed = { closed: ['confirmed', 'partial'], cancelled: ['draft', 'confirmed'], confirmed: ['closed', 'cancelled'] };
      if (!allowed[status] || !allowed[status].includes(d.status)) throw E('bad_status', 'This change is not allowed.');
      if (status === 'cancelled' && db.scalar('SELECT count(*) FROM document_lines WHERE document_id=? AND qty_fulfilled>0', [id])) throw E('bad_status', 'Part of this order is invoiced. Close it instead.');
      const target = status === 'confirmed' ? soProgress(db, id) : status;
      db.run('UPDATE documents SET status=?, updated_at=? WHERE id=?', [target, now(), id]);
    });
  }

  function soProgress(db, soId) {
    const r = db.get('SELECT sum(quantity) q, sum(min(qty_fulfilled, quantity)) f FROM document_lines WHERE document_id=?', [soId]);
    if (!r || !r.f) return 'confirmed';
    return r.f >= r.q ? 'complete' : 'partial';
  }

  function refreshSO(db, soId) {
    const so = db.get('SELECT status FROM documents WHERE id=?', [soId]);
    if (!so || ['closed', 'cancelled', 'draft'].includes(so.status)) return;
    db.run('UPDATE documents SET status=?, updated_at=? WHERE id=?', [soProgress(db, soId), now(), soId]);
  }

  /** Remaining (uninvoiced) quantity per SO line, counting draft invoices too. */
  function soRemaining(db, soId) {
    return db.all(`SELECT l.*, l.quantity - coalesce((SELECT sum(il.quantity) FROM document_lines il JOIN documents i ON i.id=il.document_id
      WHERE il.source_line_id=l.id AND i.status <> 'void'), 0) AS remaining FROM document_lines l WHERE l.document_id=? ORDER BY l.line_no`, [soId]);
  }

  /** Create a draft invoice from an SO. qty: { soLineId: quantity×1000 } (omit for all remaining). */
  function invoiceFromSO(db, soId, opts) {
    opts = opts || {};
    const so = load(db, soId);
    if (!so || so.doc_type !== 'sales_order') throw E('not_found', 'Sales order not found.');
    if (!['confirmed', 'partial'].includes(so.status)) throw E('bad_status', 'Confirm the sales order first.');
    const rem = soRemaining(db, soId);
    const lines = [];
    for (const l of rem) {
      const want = opts.qty && opts.qty[l.id] !== undefined ? Number(opts.qty[l.id]) : l.remaining;
      if (want <= 0) continue;
      if (want > l.remaining && !opts.allowOver) throw E('over_invoice', 'Line ' + l.line_no + ': only ' + l.remaining / 1000 + ' left to invoice.');
      lines.push({
        product_id: l.product_id, item_label: l.item_label, description: l.description, start_date: l.start_date, end_date: l.end_date,
        quantity: want, unit: l.unit, unit_price: l.unit_price, discount_percent: l.discount_percent, tax_id: l.tax_id, account_id: l.account_id,
        line_note: l.line_note, source_line_id: l.id, renews_subscription_id: l.renews_subscription_id,
      });
    }
    if (!lines.length) throw E('nothing_left', 'Everything on this order is already invoiced.');
    const date = opts.date || Buku.util.today();
    const terms = so.terms_days;
    let rate = so.rate;
    if (so.currency !== base(db)) { const r = Buku.fx.lookup(db, so.currency, date); if (r) rate = r.rate; }
    // A percentage discount carries over; an amount discount is shared pro rata.
    let discount_type = so.discount_type, discount_value = so.discount_value;
    if (so.discount_type === 'amount' && Number(so.discount_value)) {
      const soNet = so.lines.reduce((s, l) => s + l.line_subtotal - (l.discount_percent ? M().percentOf(l.line_subtotal, l.discount_percent) : 0), 0);
      const invNet = compute(db, { discount_type: 'none' }, lines).net;
      discount_value = String(soNet ? Number(M().divRound(BigInt(Number(so.discount_value)) * BigInt(invNet), BigInt(soNet))) : 0);
    }
    return save(db, 'invoice', {
      contact_id: so.contact_id, pic_name: so.pic_name, sales_rep_id: so.sales_rep_id, company_address_id: so.company_address_id, date,
      due_date: terms ? Buku.util.addDays(date, terms) : date, payment_term_text: so.payment_term_text, terms_days: terms,
      reference: so.number, subject: so.subject, note: so.note, currency: so.currency, rate, discount_type, discount_value,
      source_doc_id: so.id, lines,
    });
  }

  // ---------------- Approval & posting ----------------
  function lineAccount(db, d, l, settings) {
    const prod = l.product_id ? db.get('SELECT * FROM products WHERE id=?', [l.product_id]) : null;
    if (type(d.doc_type).side === 'sale') {
      if (d.doc_type === 'credit_note' && l.source_line_id) {
        const src = db.get('SELECT account_id, is_deferred FROM document_lines WHERE id=?', [l.source_line_id]);
        if (src && src.account_id) return { account_id: src.account_id, deferred: !!src.is_deferred };
      }
      if (prod && prod.kind === 'plan' && settings.deferred && d.doc_type === 'invoice' && !l.account_id) {
        return { account_id: accountBySubtype(db, 'deferred_revenue').id, deferred: true };
      }
      const acc = l.account_id || (prod && prod.income_account_id) || accountBySubtype(db, 'revenue').id;
      return { account_id: acc, deferred: false };
    }
    const acc = l.account_id || (prod && prod.expense_account_id);
    if (!acc) throw E('missing_account', 'Line ' + l.line_no + ': choose an expense account.');
    return { account_id: acc, deferred: false };
  }

  /** Approve an invoice, credit note, bill or expense: number it, post it, and run follow-ups. */
  function approve(db, id, opts) {
    opts = opts || {};
    return db.tx(() => {
      const d = load(db, id);
      if (!d) throw E('not_found', 'Document not found.');
      const T = type(d.doc_type);
      if (!T.posts) throw E('bad_type', 'This document does not post.');
      if (d.status !== 'draft') throw E('bad_status', 'Only drafts can be approved.');
      if (!d.lines.length) throw E('no_lines', 'Add at least one line.');
      if (d.total <= 0) throw E('zero_total', 'The total must be more than zero.');
      if (d.doc_type === 'credit_note') guardPropertySale(db, d.source_doc_id);
      if (Buku.subscriptions && Buku.subscriptions.validateCancellationCredit)
        Buku.subscriptions.validateCancellationCredit(db, d);
      if (Buku.deals && Buku.deals.validateCommissionInvoice) Buku.deals.validateCommissionInvoice(db, d);
      const settings = { deferred: db.setting('deferred_revenue') !== false };
      const b = base(db);
      const number = assignNumber(db, d);
      snapshotContact(db, d);
      const who = d.contact_name || '';
      const entryLines = [];
      const lineMap = []; // index in entryLines → document line id
      const cur = d.currency;

      // Revenue / expense lines.
      const docLines = d.lines.map((l) => Object.assign(l, lineAccount(db, d, l, settings)));
      // Taxes per account.
      const taxByAcc = new Map();
      const taxes = new Map(db.all('SELECT * FROM taxes').map((t) => [t.id, t]));
      for (const l of docLines) {
        if (!l.line_tax) continue;
        const t = taxes.get(l.tax_id);
        if (!t.account_id) throw E('tax_no_account', 'Tax ' + t.code + ' has no account. Set one in Taxes.');
        taxByAcc.set(t.account_id, (taxByAcc.get(t.account_id) || 0) + l.line_tax);
      }
      const desc = (l) => [l.item_label || l.product_name, l.description].filter(Boolean).join(' – ').slice(0, 200) || null;

      if (T.side === 'sale') {
        const ar = controlAccount(db, 'ar', cur);
        const control = { account_id: ar.id, description: who, contact_id: d.contact_id };
        if (T.reverse) control.credit = d.total; else control.debit = d.total;
        entryLines.push(control);
        for (const l of docLines) {
          if (!l.line_net) continue;
          lineMap[entryLines.length] = l.id;
          entryLines.push(Object.assign({ account_id: l.account_id, description: desc(l), contact_id: d.contact_id }, T.reverse ? { debit: l.line_net } : { credit: l.line_net }));
        }
        for (const [acc, amt] of taxByAcc) entryLines.push(Object.assign({ account_id: acc, description: 'PPN ' + number }, T.reverse ? { debit: amt } : { credit: amt }));
      } else {
        for (const l of docLines) {
          if (!l.line_net) continue;
          lineMap[entryLines.length] = l.id;
          entryLines.push({ account_id: l.account_id, description: desc(l), contact_id: d.contact_id, debit: l.line_net });
        }
        for (const [acc, amt] of taxByAcc) entryLines.push({ account_id: acc, description: 'PPN ' + (d.vendor_invoice_no || number), debit: amt });
        const toPay = d.total - d.withholding_total;
        let controlAcc;
        if (T.paidNow) {
          controlAcc = db.get('SELECT * FROM accounts WHERE id=?', [d.paid_from_account_id]);
          if (!controlAcc) throw E('missing_account', 'Choose the account the expense was paid from.');
        } else controlAcc = controlAccount(db, 'ap', cur);
        if (toPay > 0) entryLines.push({ account_id: controlAcc.id, description: who || d.subject, contact_id: d.contact_id, credit: toPay, _control: true });
        if (d.withholding_total) {
          const wt = taxes.get(d.withholding_tax_id);
          if (!wt || !wt.account_id) throw E('tax_no_account', 'The withholding tax has no account.');
          entryLines.push({ account_id: wt.account_id, description: wt.name + ' ' + (d.vendor_invoice_no || number), contact_id: d.contact_id, credit: d.withholding_total });
        }
      }

      const memoBy = { invoice: 'Invoice', credit_note: 'Nota kredit', bill: 'Tagihan', expense: 'Biaya' };
      const r = Buku.posting.post(db, {
        date: d.date, currency: cur, rate: d.rate, reference: number, memo: memoBy[d.doc_type] + ' ' + number + (who ? ' – ' + who : d.subject ? ' – ' + d.subject : ''),
        source_type: d.doc_type, source_id: d.id, deal_id: d.deal_id || null, lines: entryLines,
      });
      // Record exact IDR values for each document line and the control line.
      const posted = db.all('SELECT * FROM journal_lines WHERE entry_id=? ORDER BY line_no', [r.id]);
      posted.forEach((pl, i) => {
        const docLineId = lineMap[i];
        if (docLineId) db.run('UPDATE document_lines SET line_net_base=?, account_id=?, is_deferred=? WHERE id=?',
          [pl.debit_base + pl.credit_base, pl.account_id, docLines.find((x) => x.id === docLineId).deferred ? 1 : 0, docLineId]);
      });
      let controlBase;
      if (T.side === 'sale') controlBase = posted[0].debit_base + posted[0].credit_base;
      else {
        const idx = entryLines.findIndex((l) => l._control);
        controlBase = idx >= 0 ? posted[idx].credit_base : 0;
      }
      const status = T.paidNow ? 'paid' : 'open';
      db.run('UPDATE documents SET status=?, journal_entry_id=?, total_base=?, approved_at=?, updated_at=?, amount_paid=?, base_cleared=? WHERE id=?',
        [status, r.id, controlBase, now(), now(), T.paidNow ? d.total - d.withholding_total : 0, T.paidNow ? controlBase : 0, id]);

      // Follow-ups.
      if (d.doc_type === 'invoice') {
        d.lines.forEach((l) => { if (l.source_line_id) db.run('UPDATE document_lines SET qty_fulfilled=qty_fulfilled+? WHERE id=?', [l.quantity, l.source_line_id]); });
        if (d.source_doc_id) refreshSO(db, d.source_doc_id);
        if (Buku.subscriptions) Buku.subscriptions.createFromInvoice(db, id);
      }
      if (d.doc_type === 'credit_note' && d.source_doc_id && !opts.noAutoApply) {
        const inv = db.get('SELECT * FROM documents WHERE id=?', [d.source_doc_id]);
        if (inv && OPEN_STATUSES.includes(inv.status)) {
          const amt = Math.min(d.total, balance(inv));
          if (amt > 0) applyCredit(db, id, inv.id, amt, d.date);
        }
      }
      if (Buku.subscriptions && Buku.subscriptions.onCancellationCreditApproved) Buku.subscriptions.onCancellationCreditApproved(db, id);
      Buku.posting.audit(db, 'approve', 'documents', id, number);
      return { id, number, entry_id: r.id };
    });
  }

  /** Apply (part of) a credit note to an open invoice of the same customer and currency. */
  function applyCredit(db, creditId, invoiceId, amount, date) {
    return db.tx(() => {
      const cn = db.get('SELECT * FROM documents WHERE id=?', [creditId]);
      const inv = db.get('SELECT * FROM documents WHERE id=?', [invoiceId]);
      if (!cn || cn.doc_type !== 'credit_note' || !OPEN_STATUSES.includes(cn.status)) throw E('bad_status', 'This credit note cannot be applied.');
      if (!inv || inv.doc_type !== 'invoice' || !OPEN_STATUSES.includes(inv.status)) throw E('bad_status', 'This invoice is not open.');
      guardPropertySale(db, inv.id);
      if (cn.contact_id !== inv.contact_id || cn.currency !== inv.currency) throw E('mismatch', 'The credit note and invoice must be for the same customer and currency.');
      if (!(amount > 0) || amount > balance(cn) || amount > balance(inv)) throw E('invalid_amount', 'The amount is more than what is open.');
      const invBase = clearBase(inv, amount), cnBase = clearBase(cn, amount);
      // If the two documents used different rates, the receivable needs an FX adjustment.
      let entryId = null;
      if (invBase !== cnBase) {
        const ar = controlAccount(db, 'ar', inv.currency);
        const fx = accountBySubtype(db, 'fx_realized');
        const diff = invBase - cnBase;
        const r = Buku.posting.post(db, {
          date, currency: base(db), memo: 'Selisih kurs penerapan ' + cn.number + ' ke ' + inv.number, source_type: 'credit_note', source_id: cn.id,
          lines: diff > 0
            ? [{ account_id: fx.id, debit: diff, currency: base(db) }, { account_id: ar.id, currency: inv.currency, rate: inv.rate, side: 'credit', base: diff }]
            : [{ account_id: ar.id, currency: inv.currency, rate: inv.rate, side: 'debit', base: -diff }, { account_id: fx.id, credit: -diff, currency: base(db) }],
        });
        entryId = r.id;
      }
      db.insert('document_applications', { credit_doc_id: creditId, document_id: invoiceId, date, amount, ar_base: invBase, journal_entry_id: entryId, created_at: now() });
      db.run('UPDATE documents SET base_cleared=base_cleared+? WHERE id=?', [cnBase, creditId]);
      db.run('UPDATE documents SET base_cleared=base_cleared+? WHERE id=?', [invBase, invoiceId]);
      refreshPaid(db, creditId);
      refreshPaid(db, invoiceId);
    });
  }

  /** IDR value of clearing `amount` of a document (exact remainder when it closes the document). */
  function clearBase(d, amount) {
    const p = payable(d);
    if (amount >= balance(d)) return d.total_base - d.base_cleared;
    return Number(M().divRound(BigInt(d.total_base) * BigInt(amount), BigInt(p)));
  }

  /** Recompute amount_paid and status from payments and credit applications. */
  function refreshPaid(db, id) {
    const d = db.get('SELECT * FROM documents WHERE id=?', [id]);
    if (!d || ['draft', 'void'].includes(d.status) || d.doc_type === 'sales_order' || d.doc_type === 'expense') return;
    const paid = db.scalar(`SELECT coalesce(sum(a.amount),0) FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.document_id=? AND p.status='posted'`, [id])
      + db.scalar('SELECT coalesce(sum(amount),0) FROM document_applications WHERE document_id=? OR credit_doc_id=?', [id, id])
      + db.scalar('SELECT coalesce(sum(amount),0) FROM deal_settlement_allocations WHERE invoice_id=?', [id]);
    const p = payable(d);
    const status = paid <= 0 ? 'open' : paid >= p ? 'paid' : 'partial';
    db.run('UPDATE documents SET amount_paid=?, status=?, updated_at=? WHERE id=?', [paid, status, now(), id]);
    if (d.doc_type === 'invoice' && Buku.subscriptions) Buku.subscriptions.onInvoicePaidChange(db, id, status);
  }

  function hasSettlements(db, id) {
    return db.scalar(`SELECT count(*) FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.document_id=? AND p.status='posted'`, [id])
      + db.scalar('SELECT count(*) FROM document_applications WHERE document_id=? OR credit_doc_id=?', [id, id])
      + db.scalar('SELECT count(*) FROM deal_settlement_allocations WHERE invoice_id=?', [id]);
  }

  /** Undo posting: void (final) or back to draft (keeps the number) when nothing settled it. */
  function unpost(db, id, mode, date) {
    return db.tx(() => {
      const d = load(db, id);
      if (!d) throw E('not_found', 'Document not found.');
      if (d.doc_type === 'sales_order') {
        if (mode === 'void') return setSOStatus(db, id, 'cancelled');
        throw E('bad_status', 'Not possible for sales orders.');
      }
      if (!['open', 'partial', 'paid'].includes(d.status)) throw E('bad_status', 'Only approved documents can be voided.');
      if (db.scalar('SELECT 1 FROM property_sales WHERE invoice_id=?', [id]))
        throw E('property_sale_locked', 'This invoice has recognized property HPP. Use a controlled property sale correction.');
      if (db.scalar('SELECT 1 FROM deal_commissions WHERE invoice_id=?', [id]))
        throw E('linked_commission', 'This invoice is linked to a property commission. Reconcile it through a controlled correction.');
      if (db.scalar("SELECT 1 FROM subscription_cancellations WHERE credit_note_id=? AND status='credited'", [id]))
        throw E('cancellation_credit_locked', 'This credit note cleared a cancellation. Use a controlled correcting entry.');
      if (d.doc_type !== 'expense' && hasSettlements(db, id)) throw E('has_payments', 'Remove the payments or credit notes applied to this document first.');
      if (Buku.subscriptions) Buku.subscriptions.beforeInvoiceUnpost(db, id);
      if (d.journal_entry_id) Buku.posting.reverse(db, d.journal_entry_id, date && date > d.date ? date : d.date, (mode === 'void' ? 'Batal ' : 'Kembali ke draf ') + d.number);
      if (d.doc_type === 'invoice') {
        d.lines.forEach((l) => { if (l.source_line_id) db.run('UPDATE document_lines SET qty_fulfilled=max(0, qty_fulfilled-?) WHERE id=?', [l.quantity, l.source_line_id]); });
        if (d.source_doc_id) refreshSO(db, d.source_doc_id);
      }
      const status = mode === 'void' ? 'void' : 'draft';
      db.run('UPDATE documents SET status=?, journal_entry_id=NULL, total_base=0, base_cleared=0, amount_paid=0, voided_at=?, updated_at=? WHERE id=?',
        [status, mode === 'void' ? now() : null, now(), id]);
      db.run('UPDATE document_lines SET line_net_base=0 WHERE document_id=?', [id]);
      Buku.posting.audit(db, mode === 'void' ? 'void' : 'unapprove', 'documents', id, d.number);
    });
  }

  /** Property sale invoices carry HPP and inventory postings; a credit note would reverse only the revenue. */
  function isPropertySale(db, invoiceId) {
    return !!invoiceId && !!db.scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='property_sales'") &&
      !!db.scalar('SELECT 1 FROM property_sales WHERE invoice_id=?', [invoiceId]);
  }
  function guardPropertySale(db, invoiceId) {
    if (isPropertySale(db, invoiceId)) throw E('property_sale_credit', 'A credit note cannot be used on a property sale invoice: it would reverse the revenue but not the HPP and inventory. Cancelling or repricing a sold unit needs a controlled property sale correction.');
  }

  /** Draft credit note copying an invoice's lines (user edits quantities/amounts). */
  function creditNoteFromInvoice(db, invoiceId) {
    guardPropertySale(db, invoiceId);
    const inv = load(db, invoiceId);
    if (!inv || inv.doc_type !== 'invoice' || !['open', 'partial', 'paid'].includes(inv.status)) throw E('bad_status', 'Only approved invoices can be credited.');
    return save(db, 'credit_note', {
      contact_id: inv.contact_id, pic_name: inv.pic_name, sales_rep_id: inv.sales_rep_id, company_address_id: inv.company_address_id, date: Buku.util.today() < inv.date ? inv.date : Buku.util.today(),
      reference: inv.number, currency: inv.currency, rate: inv.rate, discount_type: inv.discount_type, discount_value: inv.discount_value, source_doc_id: inv.id,
      lines: inv.lines.map((l) => ({ product_id: l.product_id, item_label: l.item_label, description: l.description, start_date: l.start_date, end_date: l.end_date,
        quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, discount_percent: l.discount_percent, tax_id: l.tax_id, source_line_id: l.id, line_note: l.line_note })),
    });
  }

  /** Copy any document into a new draft of the same (or another) type. */
  function duplicate(db, id, asType) {
    const d = load(db, id);
    const t = asType || d.doc_type;
    const today = Buku.util.today();
    let rate = d.rate;
    if (d.currency !== base(db)) { const r = Buku.fx.lookup(db, d.currency, today); if (r) rate = r.rate; }
    const input = {};
    HEADER_FIELDS.forEach((f) => { input[f] = d[f]; });
    Object.assign(input, { date: today, due_date: d.terms_days ? Buku.util.addDays(today, d.terms_days) : null, rate, faktur_no: null, faktur_date: null, source_doc_id: null, text_blocks: d.text_blocks,
      lines: d.lines.map((l) => ({ product_id: l.product_id, item_label: l.item_label, description: l.description, start_date: l.start_date, end_date: l.end_date, quantity: l.quantity, unit: l.unit,
        unit_price: l.unit_price, discount_percent: l.discount_percent, tax_id: l.tax_id, account_id: l.account_id, line_note: l.line_note })) });
    return save(db, t, input);
  }

  /** Open documents a payment can settle. direction 'in': invoices; 'out': bills and credit notes (refunds). */
  function openForPayment(db, contactId, direction) {
    const types = direction === 'in' ? "('invoice')" : "('bill','credit_note')";
    return db.all(`SELECT * FROM documents WHERE contact_id=? AND doc_type IN ${types} AND status IN ('open','partial') ORDER BY coalesce(due_date, date), id`, [contactId])
      .map((d) => Object.assign(d, { balance: balance(d), payable: payable(d) }));
  }

  /** Default product and tax lookups used by forms. */
  function productPrice(db, productId, currency, rate) {
    const p = db.get('SELECT unit_price FROM product_prices WHERE product_id=? AND currency=?', [productId, currency]);
    if (p) return p.unit_price;
    const idr = db.get("SELECT unit_price FROM product_prices WHERE product_id=? AND currency='IDR'", [productId]);
    if (!idr) return 0;
    if (currency === 'IDR') return idr.unit_price;
    // Convert the rupiah price at the document rate.
    const dec = Buku.fx.decimals(db, currency);
    return Number(M().divRound(BigInt(idr.unit_price) * (10n ** BigInt(dec)) * 1000000n, M().parseRate(rate)));
  }

  Buku.docs = {
    TYPES, compute, allocate, save, load, editable, deleteDraft, confirm, markSigned, setSOStatus, soRemaining, invoiceFromSO, refreshSO,
    approve, unpost, applyCredit, clearBase, refreshPaid, balance, payable, creditNoteFromInvoice, duplicate, openForPayment, productPrice,
    controlAccount, accountBySubtype, hasSettlements, isPropertySale,
  };
})();
