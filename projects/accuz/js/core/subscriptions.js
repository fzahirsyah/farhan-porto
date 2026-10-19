/* Buku — SaaS subscriptions.
   An approved invoice line for a "plan" product creates a subscription. Paid → awaiting handover.
   Handover sets the start date and builds a monthly schedule; "recognize revenue" moves each month
   from Pendapatan Diterima di Muka (deferred) to revenue. Renewals copy the same scheme. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, msg, details) => new Buku.BukuError(code, msg, details);
  const U = () => Buku.util;
  const now = () => Buku.util.nowIso();

  /** Add whole months to an ISO date (clamped to month end: 31 Jan + 1 month = 28/29 Feb). */
  function addMonths(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return target.getUTCFullYear() + '-' + U().pad(target.getUTCMonth() + 1) + '-' + U().pad(Math.min(d, last));
  }

  function endDate(start, months) {
    return U().addDays(addMonths(start, months), -1);
  }

  function createFromInvoice(db, invoiceId) {
    const inv = Buku.docs.load(db, invoiceId);
    for (const l of inv.lines) {
      if (l.product_kind !== 'plan' || !l.line_net) continue;
      if (db.scalar('SELECT 1 FROM subscriptions WHERE invoice_line_id=?', [l.id])) continue;
      const months = Math.max(1, Math.round(l.quantity / 1000));
      const prod = db.get('SELECT * FROM products WHERE id=?', [l.product_id]);
      const revenueAcc = prod.income_account_id || Buku.docs.accountBySubtype(db, 'revenue').id;
      const sid = db.insert('subscriptions', {
        contact_id: inv.contact_id, product_id: l.product_id, sales_rep_id: inv.sales_rep_id,
        description: [l.item_label || prod.name, l.description].filter(Boolean).join(' – '),
        months, price_per_month: l.unit_price, amount: l.line_net, amount_base: l.line_net_base, currency: inv.currency, rate: inv.rate,
        quota_text: prod.quota_text || null, planned_start: l.start_date || null, status: 'pending_payment',
        invoice_id: inv.id, invoice_line_id: l.id, so_id: inv.source_doc_id && db.scalar("SELECT id FROM documents WHERE id=? AND doc_type='sales_order'", [inv.source_doc_id]) || null,
        deferred_account_id: l.is_deferred ? l.account_id : null, revenue_account_id: revenueAcc,
        renews_id: l.renews_subscription_id || null, created_at: now(), updated_at: now(),
      });
      if (l.renews_subscription_id) db.run('UPDATE subscriptions SET renewed_by_id=?, updated_at=? WHERE id=?', [sid, now(), l.renews_subscription_id]);
    }
  }

  function onInvoicePaidChange(db, invoiceId, status) {
    if (status === 'paid') {
      db.run("UPDATE subscriptions SET status='pending_handover', updated_at=? WHERE invoice_id=? AND status='pending_payment'", [now(), invoiceId]);
    } else {
      db.run("UPDATE subscriptions SET status='pending_payment', updated_at=? WHERE invoice_id=? AND status='pending_handover'", [now(), invoiceId]);
    }
  }

  /** Called before an invoice is voided or returned to draft. */
  function beforeInvoiceUnpost(db, invoiceId) {
    const started = db.scalar("SELECT count(*) FROM subscriptions WHERE invoice_id=? AND status IN ('active') ", [invoiceId]);
    if (started) throw E('subscription_started', 'A subscription on this invoice has started. Cancel the subscription or issue a credit note instead.');
    const subs = db.all('SELECT id, renews_id FROM subscriptions WHERE invoice_id=?', [invoiceId]);
    for (const s of subs) {
      if (s.renews_id) db.run('UPDATE subscriptions SET renewed_by_id=NULL WHERE id=?', [s.renews_id]);
      db.run('DELETE FROM subscriptions WHERE id=?', [s.id]);
    }
  }

  /** Mark handover / go-live: sets the period and (with deferral) the monthly schedule. */
  function handover(db, id, startDate, ref, allocationMethod) {
    return db.tx(() => {
      const s = db.get('SELECT * FROM subscriptions WHERE id=?', [id]);
      if (!s) throw E('not_found', 'Subscription not found.');
      if (s.status !== 'pending_handover' || db.scalar('SELECT status FROM documents WHERE id=?', [s.invoice_id]) !== 'paid')
        throw E('payment_required', 'Fully settle the original invoice before handover.');
      if (db.scalar('SELECT count(*) FROM revenue_schedules WHERE subscription_id=?', [id]))
        throw E('already_started', 'A revenue schedule already exists.');
      allocationMethod = allocationMethod || 'equal';
      if (!['equal','daily'].includes(allocationMethod)) throw E('invalid_method', 'Unknown revenue allocation method.');
      if (!U().isIsoDate(startDate)) throw E('invalid_date', 'Enter a valid start date.');
      const end = endDate(startDate, s.months);
      db.run("UPDATE subscriptions SET status='active', start_date=?, end_date=?, handover_ref=?, allocation_method=?, updated_at=? WHERE id=?", [startDate, end, ref || null, allocationMethod, now(), id]);
      if (s.deferred_account_id) {
        let periods = [], weights = [];
        if (allocationMethod === 'daily') {
          for (let m = U().monthStart(startDate); m <= end; m = U().monthStart(m, 1)) {
            const first = m < startDate ? startDate : m;
            const last = U().monthEnd(m) > end ? end : U().monthEnd(m);
            const days = Math.round((Date.parse(last + 'T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / 86400000) + 1;
            periods.push(m.slice(0, 7)); weights.push(days);
          }
        } else {
          for (let i=0;i<s.months;i++) { periods.push(U().monthStart(startDate,i).slice(0,7)); weights.push(1); }
        }
        const per = Buku.docs.allocate(s.amount, weights);
        const perBase = Buku.docs.allocate(s.amount_base, weights);
        periods.forEach((period,i) => db.insert('revenue_schedules', { subscription_id:id, period, amount:per[i], amount_base:perBase[i] }));
      }
      Buku.posting.audit(db, 'handover', 'subscriptions', id, startDate);
      return end;
    });
  }

  /** Schedule rows that are due (period ≤ upto 'YYYY-MM') and not yet recognized, grouped by period. */
  function due(db, upto) {
    return db.all(`SELECT r.*, s.deferred_account_id, s.revenue_account_id, s.description, c.name contact_name FROM revenue_schedules r
      JOIN subscriptions s ON s.id=r.subscription_id LEFT JOIN contacts c ON c.id=s.contact_id
      WHERE r.recognized=0 AND r.period<=? AND s.status='active' ORDER BY r.period, r.id`, [upto]);
  }

  /** Recognize revenue up to and including a month. One journal per month, dated the month end. Safe to repeat. */
  function recognize(db, upto) {
    if (!/^\d{4}-\d{2}$/.test(upto || '')) throw E('invalid_period', 'Choose a month.');
    return db.tx(() => {
      const rows = due(db, upto);
      const byPeriod = new Map();
      rows.forEach((r) => { if (!byPeriod.has(r.period)) byPeriod.set(r.period, []); byPeriod.get(r.period).push(r); });
      const posted = [];
      const base = Buku.fx.base(db);
      for (const [period, list] of byPeriod) {
        const lines = [];
        for (const r of list) {
          if (!r.amount_base) { db.run('UPDATE revenue_schedules SET recognized=1 WHERE id=?', [r.id]); continue; }
          lines.push({ account_id: r.deferred_account_id, debit: r.amount_base, currency: base, description: r.contact_name + ' – ' + period });
          lines.push({ account_id: r.revenue_account_id, credit: r.amount_base, currency: base, description: r.contact_name + ' – ' + (r.description || '') });
        }
        if (!lines.length) continue;
        const date = U().monthEnd(period + '-01');
        const res = Buku.posting.post(db, { date, currency: base, memo: 'Pengakuan pendapatan langganan ' + period, source_type: 'recognition', lines });
        list.forEach((r) => db.run('UPDATE revenue_schedules SET recognized=1, journal_entry_id=? WHERE id=?', [res.id, r.id]));
        posted.push({ period, number: res.number, id: res.id, amount: list.reduce((s, r) => s + r.amount_base, 0) });
      }
      return posted;
    });
  }

  /** Cancellation with an exact linked credit and no orphaned deferred schedules. */
  function cancel(db, id, mode, reason, date) {
    date = date || U().today();
    if (!U().isIsoDate(date)) throw E('invalid_date', 'Invalid cancellation date.');
    if (!['refund','recognize'].includes(mode)) throw E('bad_mode', 'Choose a refund or revenue-recognition cancellation.');
    return db.tx(() => {
      const s = db.get('SELECT * FROM subscriptions WHERE id=?', [id]);
      if (!s || s.status === 'cancelled') throw E('bad_status', 'Subscription is already cancelled or missing.');
      const left = db.all('SELECT * FROM revenue_schedules WHERE subscription_id=? AND recognized=0 ORDER BY period', [id]);
      const amount = left.reduce((x,r) => x + r.amount,0);
      const amountBase = left.reduce((x,r) => x + r.amount_base,0);
      if (s.status !== 'active' && mode === 'refund') throw E('not_started', 'Refund of an unstarted subscription requires an ordinary credit note workflow.');
      let entry = null, creditNoteId = null;
      if (mode === 'recognize' && left.length) {
        if (!s.deferred_account_id) throw E('not_deferred', 'Cannot recognize a non-deferred subscription balance.');
        if (amountBase > 0) {
          const base = Buku.fx.base(db);
          entry = Buku.posting.post(db, { date, currency:base, source_type:'recognition', source_id:id,
            memo:'Sisa pendapatan saat berhenti: subscription ' + id,
            lines:[{account_id:s.deferred_account_id,debit:amountBase},{account_id:s.revenue_account_id,credit:amountBase}] });
        }
        db.run('UPDATE revenue_schedules SET recognized=1,journal_entry_id=? WHERE subscription_id=? AND recognized=0', [entry ? entry.id : null,id]);
      }
      if (mode === 'refund' && amount > 0) {
        const invoice = Buku.docs.load(db, s.invoice_id);
        const line = invoice.lines.find(l => l.id === s.invoice_line_id);
        if (!line || !invoice) throw E('missing_invoice', 'Cannot find the original subscription invoice line.');
        // Credit only the unused net service. Tax is recomputed from the source line's tax code.
        creditNoteId = Buku.docs.save(db, 'credit_note', {
          contact_id:invoice.contact_id, sales_rep_id:invoice.sales_rep_id, date,
          currency:invoice.currency, rate:invoice.rate, source_doc_id:invoice.id,
          reference:'Subscription cancellation #' + id,
          lines:[{ product_id:line.product_id, item_label:line.item_label || 'SaaS service refund',
            description:'Unused service credit – subscription #' + id,
            quantity:1000,unit_price:amount,tax_id:line.tax_id,
            account_id:s.deferred_account_id || s.revenue_account_id,source_line_id:line.id }],
        });
      }
      const cid = db.insert('subscription_cancellations', {
        subscription_id:id,mode,status:mode==='refund' && creditNoteId?'pending_credit':mode==='refund'?'credited':'recognized',
        date,reason:reason || null,amount,amount_base:amountBase,credit_note_id:creditNoteId,
        journal_entry_id:entry ? entry.id : null,created_at:now(),updated_at:now(),
      });
      db.run("UPDATE subscriptions SET status='cancelled', cancel_reason=?, updated_at=? WHERE id=?", [reason || null,now(),id]);
      if (mode === 'refund' && !creditNoteId) db.run('DELETE FROM revenue_schedules WHERE subscription_id=? AND recognized=0', [id]);
      Buku.posting.audit(db,'cancel','subscriptions',id,'Cancellation #'+cid+' '+mode);
      return { cancellation_id:cid, credit_note_id:creditNoteId, journal_entry_id:entry && entry.id, amount, amount_base:amountBase };
    });
  }

  function validateCancellationCredit(db, d) {
    if (d.doc_type !== 'credit_note') return;
    const c = db.get("SELECT * FROM subscription_cancellations WHERE credit_note_id=? AND status='pending_credit'",[d.id]);
    if (!c) return;
    const s = db.get('SELECT * FROM subscriptions WHERE id=?',[c.subscription_id]);
    const lines = d.lines;
    if (lines.length !== 1 || lines[0].line_net !== c.amount ||
        lines[0].account_id !== (s.deferred_account_id || s.revenue_account_id))
      throw E('credit_mismatch','Cancellation credit note must equal the unused service value and account.');
  }
  function onCancellationCreditApproved(db, docId) {
    const c = db.get("SELECT * FROM subscription_cancellations WHERE credit_note_id=? AND status='pending_credit'",[docId]);
    if (!c) return;
    db.run('DELETE FROM revenue_schedules WHERE subscription_id=? AND recognized=0',[c.subscription_id]);
    db.run("UPDATE subscription_cancellations SET status='credited',updated_at=? WHERE id=?",[now(),c.id]);
  }

  /** Status shown to people (adds expiring / expired / renewed to the stored status). */
  function displayStatus(s, today, windowDays) {
    if (s.status === 'cancelled') return 'cancelled';
    if (s.renewed_by_id) return s.status === 'active' && s.end_date >= today ? 'renewed_active' : 'renewed';
    if (s.status !== 'active') return s.status;
    if (s.end_date < today) return 'expired';
    if (s.end_date <= U().addDays(today, windowDays || 30)) return 'expiring';
    return 'active';
  }

  /** Create the renewal document (draft SO by default) with the same plan, months, price and rep. */
  function renew(db, id, opts) {
    opts = opts || {};
    const s = db.get('SELECT * FROM subscriptions WHERE id=?', [id]);
    if (!s) throw E('not_found', 'Subscription not found.');
    if (s.renewed_by_id) throw E('already_renewed', 'This subscription is already renewed.');
    const pending = db.get(`SELECT d.id, d.number FROM document_lines l JOIN documents d ON d.id=l.document_id WHERE l.renews_subscription_id=? AND d.status NOT IN ('void','cancelled','closed') LIMIT 1`, [id]);
    if (pending && !opts.force) throw E('renewal_exists', 'A renewal document already exists' + (pending.number ? ': ' + pending.number : ' (draft)') + '.', { document_id: pending.id });
    const prod = s.product_id ? db.get('SELECT * FROM products WHERE id=?', [s.product_id]) : null;
    const contact = db.get('SELECT * FROM contacts WHERE id=?', [s.contact_id]);
    const inv = s.invoice_id ? db.get('SELECT * FROM documents WHERE id=?', [s.invoice_id]) : null;
    const line = s.invoice_line_id ? db.get('SELECT * FROM document_lines WHERE id=?', [s.invoice_line_id]) : null;
    const date = opts.date || U().today();
    const start = s.end_date ? U().addDays(s.end_date, 1) : date;
    const base = Buku.fx.base(db);
    let rate = '1';
    if (s.currency !== base) rate = (Buku.fx.lookup(db, s.currency, date) || { rate: s.rate }).rate;
    const price = opts.keepPrice === false && prod ? Buku.docs.productPrice(db, prod.id, s.currency, rate) || s.price_per_month : s.price_per_month;
    const type = opts.as === 'invoice' ? 'invoice' : 'sales_order';
    const terms = inv ? inv.terms_days : contact.payment_terms_days;
    return Buku.docs.save(db, type, {
      contact_id: s.contact_id, pic_name: inv ? inv.pic_name : contact.pic_name, sales_rep_id: s.sales_rep_id, company_address_id: inv ? inv.company_address_id : null,
      date, due_date: terms ? U().addDays(date, terms) : (type === 'invoice' ? date : null), terms_days: terms, payment_term_text: inv ? inv.payment_term_text : contact.payment_term_text,
      validity_text: type === 'sales_order' ? '1 Month' : null, currency: s.currency, rate,
      note: line ? line.line_note : null,
      lines: [{
        product_id: s.product_id, item_label: line ? line.item_label : prod && prod.name, description: line ? line.description : s.description,
        start_date: start, end_date: endDate(start, s.months), quantity: s.months * 1000, unit: line ? line.unit : 'Months', unit_price: price,
        tax_id: line ? line.tax_id : prod && prod.tax_id, line_note: line ? line.line_note : prod && prod.default_note, renews_subscription_id: s.id,
      }],
    });
  }

  function list(db, opts) {
    opts = opts || {};
    const today = opts.today || U().today();
    const win = db.setting('renewal_window_days') || 30;
    return db.all(`SELECT s.*, c.name contact_name, p.name product_name, r.code rep_code, d.number invoice_number,
      (SELECT coalesce(sum(amount_base),0) FROM revenue_schedules WHERE subscription_id=s.id AND recognized=1) recognized_base
      FROM subscriptions s JOIN contacts c ON c.id=s.contact_id LEFT JOIN products p ON p.id=s.product_id LEFT JOIN sales_reps r ON r.id=s.sales_rep_id
      LEFT JOIN documents d ON d.id=s.invoice_id ORDER BY coalesce(s.end_date, s.planned_start, s.created_at) DESC, s.id DESC`)
      .map((s) => Object.assign(s, { display: displayStatus(s, today, win) }));
  }

  /** Monthly recurring revenue (IDR) from subscriptions running on `asOf`. */
  function mrr(db, asOf) {
    const subs = db.all(`SELECT s.*, p.name product_name, r.code rep_code, r.name rep_name FROM subscriptions s LEFT JOIN products p ON p.id=s.product_id
      LEFT JOIN sales_reps r ON r.id=s.sales_rep_id WHERE s.status='active' AND s.start_date<=? AND s.end_date>=?`, [asOf, asOf]);
    const per = (s) => Number(Buku.money.divRound(BigInt(s.amount_base), BigInt(s.months)));
    const total = subs.reduce((x, s) => x + per(s), 0);
    const group = (key) => {
      const m = new Map();
      subs.forEach((s) => { const k = s[key] || '—'; m.set(k, (m.get(k) || 0) + per(s)); });
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };
    return { total, count: subs.length, arr: total * 12, byPlan: group('product_name'), byRep: group('rep_name'), subs: subs.map((s) => Object.assign(s, { mrr: per(s) })) };
  }

  /** Deferred revenue the books should hold: unrecognized schedule rows + subscriptions not yet started. */
  function expectedDeferred(db, asOf) {
    const sched = db.scalar(`SELECT coalesce(sum(r.amount_base),0) FROM revenue_schedules r JOIN subscriptions s ON s.id=r.subscription_id
      WHERE s.deferred_account_id IS NOT NULL AND (r.recognized=0 OR r.journal_entry_id IN (SELECT id FROM journal_entries WHERE date>?))`, [asOf || '9999-12-31']);
    const pending = db.scalar(`SELECT coalesce(sum(s.amount_base),0) FROM subscriptions s JOIN documents d ON d.id=s.invoice_id
      WHERE s.deferred_account_id IS NOT NULL AND s.status IN ('pending_payment','pending_handover') AND d.status NOT IN ('void','draft')`);
    return sched + pending;
  }

  Buku.subscriptions = { addMonths, endDate, createFromInvoice, onInvoicePaidChange, beforeInvoiceUnpost, handover, due, recognize, cancel, displayStatus, renew, list, mrr, expectedDeferred, validateCancellationCredit, onCancellationCreditApproved };
})();
