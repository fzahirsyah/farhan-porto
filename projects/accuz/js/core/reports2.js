/* Buku — Tier 2 reports: receivable/payable aging, customer statement, cash flow, sales analysis,
   open sales orders, deferred revenue roll-forward, and control-account checks. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const U = () => Buku.util;
  const BUCKETS = [['current', 'Not due'], ['d30', '1–30 days'], ['d60', '31–60 days'], ['d90', '61–90 days'], ['d90p', 'Over 90 days']];

  /** Amount settled on a document up to a date (payments + credit applications), in its currency. */
  function settledAsOf(db, docId, asOf) {
    return db.scalar(`SELECT coalesce(sum(a.amount),0) FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.document_id=? AND p.status='posted' AND p.date<=?`, [docId, asOf])
      + db.scalar('SELECT coalesce(sum(amount),0) FROM document_applications WHERE (document_id=? OR credit_doc_id=?) AND date<=?', [docId, docId, asOf]);
  }

  /** side 'ar' (invoices, minus unapplied credit notes) or 'ap' (bills). Balances in document currency and IDR at document rate. */
  function aging(db, side, asOf) {
    asOf = asOf || U().today();
    const types = side === 'ar' ? "('invoice','credit_note')" : "('bill')";
    const docs = db.all(`SELECT d.*, c.name contact_name FROM documents d JOIN contacts c ON c.id=d.contact_id WHERE d.doc_type IN ${types}
      AND d.status NOT IN ('draft','void') AND d.date<=? ORDER BY c.name, d.date`, [asOf]);
    const rows = new Map();
    const totals = { currency: {}, base: Object.fromEntries(BUCKETS.map((b) => [b[0], 0])), baseTotal: 0 };
    const items = [];
    for (const d of docs) {
      const open = Buku.docs.payable(d) - settledAsOf(db, d.id, asOf);
      if (open <= 0) continue;
      const sign = d.doc_type === 'credit_note' ? -1 : 1;
      const due = d.due_date || d.date;
      const days = Math.floor((new Date(asOf) - new Date(due)) / 86400000);
      const bucket = days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'd90p';
      const amt = open * sign;
      const baseAmt = Number(Buku.money.divRound(BigInt(d.total_base) * BigInt(open), BigInt(Buku.docs.payable(d) || 1))) * sign;
      const key = d.contact_id + '|' + d.currency;
      if (!rows.has(key)) rows.set(key, { contact_id: d.contact_id, contact_name: d.contact_name, currency: d.currency, buckets: Object.fromEntries(BUCKETS.map((b) => [b[0], 0])), total: 0, base: 0 });
      const r = rows.get(key);
      r.buckets[bucket] += amt; r.total += amt; r.base += baseAmt;
      totals.base[bucket] += baseAmt; totals.baseTotal += baseAmt;
      if (!totals.currency[d.currency]) totals.currency[d.currency] = 0;
      totals.currency[d.currency] += amt;
      items.push(Object.assign(d, { open: amt, open_base: baseAmt, days_overdue: Math.max(0, days), bucket }));
    }
    return { asOf, buckets: BUCKETS, rows: Array.from(rows.values()), items, totals };
  }

  /** Customer (or vendor) statement in one currency. */
  function statement(db, contactId, currency, from, to) {
    const isVendor = !!db.scalar("SELECT count(*) FROM documents WHERE contact_id=? AND doc_type='bill'", [contactId]) && !db.scalar("SELECT count(*) FROM documents WHERE contact_id=? AND doc_type='invoice'", [contactId]);
    const docTypes = isVendor ? "('bill')" : "('invoice','credit_note')";
    const events = [];
    db.all(`SELECT * FROM documents WHERE contact_id=? AND currency=? AND doc_type IN ${docTypes} AND status NOT IN ('draft','void') AND date<=?`, [contactId, currency, to]).forEach((d) => {
      const amt = d.doc_type === 'credit_note' ? -d.total : Buku.docs.payable(d);
      events.push({ date: d.date, kind: d.doc_type, ref: d.number, doc_id: d.id, due: d.due_date, amount: amt });
    });
    db.all(`SELECT p.*, sum(a.amount) applied FROM payments p JOIN payment_allocations a ON a.payment_id=p.id JOIN documents d ON d.id=a.document_id
      WHERE p.contact_id=? AND d.currency=? AND p.status='posted' AND p.date<=? GROUP BY p.id`, [contactId, currency, to]).forEach((p) => {
      events.push({ date: p.date, kind: p.direction === 'in' ? 'payment_in' : 'payment_out', ref: p.number, payment_id: p.id, amount: p.direction === 'in' ? -p.applied : (isVendor ? -p.applied : p.applied) });
    });
    events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind.startsWith('payment') ? 1 : -1));
    let opening = 0, running = 0;
    const lines = [];
    for (const e of events) {
      if (from && e.date < from) { opening += e.amount; continue; }
      if (!lines.length) running = opening;
      running += e.amount;
      lines.push(Object.assign(e, { balance: running }));
    }
    if (!lines.length) running = opening;
    const ag = aging(db, isVendor ? 'ap' : 'ar', to);
    const row = ag.rows.find((r) => r.contact_id === contactId && r.currency === currency);
    return { contactId, currency, from, to, opening, lines, closing: running, aging: row ? row.buckets : null, buckets: BUCKETS, isVendor };
  }

  // ---------------- Cash flow (indirect) ----------------
  const OPERATING = new Set(['ar', 'current_asset', 'vendor_prepayment', 'tax_input', 'tax_prepaid', 'property_inventory', 'ap', 'current_liability', 'deferred_revenue',
    'customer_funds_held', 'customer_credit', 'partner_payable', 'tax_output', 'tax_payable', 'tax_withholding_payable', 'accumulated_depreciation']);
  const INVESTING = new Set(['fixed_asset', 'investment_jv']);
  const FINANCING = new Set(['equity', 'long_term_liability', 'opening_balance']);

  function cashFlow(db, from, to) {
    const accs = db.all('SELECT * FROM accounts WHERE is_header=0');
    const before = Buku.ledger.sums(db, null, U().addDays(from, -1));
    const during = Buku.ledger.sums(db, from, to);
    const net = Buku.ledger.netProfit(db, from, to);
    const groups = { operating: [], investing: [], financing: [] };
    let cashStart = 0, cashChange = 0;
    for (const a of accs) {
      const v = during.get(a.id);
      const mov = v ? v.d - v.c : 0; // debit-positive movement
      if (a.subtype === 'cash' || a.subtype === 'bank') {
        const b = before.get(a.id);
        cashStart += b ? b.d - b.c : 0;
        cashChange += mov;
        continue;
      }
      if (a.type === 'income' || a.type === 'expense' || !mov) continue;
      // Cash effect of a balance-sheet change is the opposite of its debit movement.
      const effect = -mov;
      const g = INVESTING.has(a.subtype) ? 'investing' : FINANCING.has(a.subtype) || a.type === 'equity' ? 'financing' : 'operating';
      if (a.subtype === 'retained_earnings') continue;
      groups[g].push({ account: a, amount: effect });
    }
    const sum = (g) => groups[g].reduce((s, x) => s + x.amount, 0);
    const operating = net + sum('operating');
    const investing = sum('investing');
    const financing = sum('financing');
    // Retained earnings movements (closing entries / dividends) are financing too.
    // Closing entries are not cash: leave them out of retained-earnings movements (net profit already excludes them).
    const duringNoClose = Buku.ledger.sums(db, from, to, { excludeClosing: true });
    const re = accs.filter((a) => a.subtype === 'retained_earnings').reduce((s, a) => { const v = duringNoClose.get(a.id); return s + (v ? v.c - v.d : 0); }, 0);
    const financingTotal = financing + re;
    const computed = operating + investing + financingTotal;
    return { from, to, net, groups, operating, investing, financing: financingTotal, retainedEarnings: re, cashStart, cashEnd: cashStart + cashChange, cashChange, computed, difference: computed - cashChange };
  }

  // ---------------- Sales analysis ----------------
  function sales(db, from, to, by) {
    const key = by === 'product' ? "coalesce(p.name, l.item_label, '—')" : by === 'rep' ? "coalesce(r.name, '—')" : 'c.name';
    const rows = db.all(`SELECT ${key} k, sum(CASE WHEN d.doc_type='credit_note' THEN -l.line_net_base ELSE l.line_net_base END) amount,
      count(DISTINCT CASE WHEN d.doc_type='invoice' THEN d.id END) docs
      FROM document_lines l JOIN documents d ON d.id=l.document_id LEFT JOIN products p ON p.id=l.product_id LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN sales_reps r ON r.id=d.sales_rep_id
      WHERE d.doc_type IN ('invoice','credit_note') AND d.status NOT IN ('draft','void') AND d.date BETWEEN ? AND ? GROUP BY k ORDER BY amount DESC`, [from, to]);
    return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  }

  function openSalesOrders(db) {
    return db.all(`SELECT d.*, c.name contact_name, r.code rep_code FROM documents d JOIN contacts c ON c.id=d.contact_id LEFT JOIN sales_reps r ON r.id=d.sales_rep_id
      WHERE d.doc_type='sales_order' AND d.status IN ('confirmed','partial') ORDER BY d.date`).map((d) => {
      const lines = Buku.docs.soRemaining(db, d.id);
      const ratio = lines.reduce((s, l) => s + l.line_net * Math.max(0, l.remaining) / (l.quantity || 1), 0);
      const remaining = Math.round(ratio);
      const remainingWithTax = d.total && d.subtotal ? Math.round(remaining * d.total / Math.max(1, d.total - d.tax_total)) : remaining;
      return Object.assign(d, { remaining, remaining_with_tax: remainingWithTax, remaining_base: d.currency === Buku.fx.base(db) ? remaining : Buku.money.toBase(remaining, Buku.fx.decimals(db, d.currency), d.rate),
        expired: d.valid_until && d.valid_until < U().today() });
    });
  }

  /** Deferred revenue: opening + invoiced − recognized − credited = closing, checked against the ledger and the schedules. */
  function deferredRollforward(db, from, to) {
    const accIds = db.all("SELECT id FROM accounts WHERE subtype='deferred_revenue'").map((a) => a.id);
    if (!accIds.length) return null;
    const ph = accIds.map(() => '?').join(',');
    const bal = (upto) => db.scalar(`SELECT coalesce(sum(l.credit_base-l.debit_base),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted' AND l.account_id IN (${ph}) AND e.date<=?`, accIds.concat([upto]));
    const mov = (types) => db.scalar(`SELECT coalesce(sum(l.credit_base-l.debit_base),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
      WHERE e.status='posted' AND l.account_id IN (${ph}) AND e.date BETWEEN ? AND ? AND e.source_type IN (${types.map(() => '?').join(',')})`, accIds.concat([from, to], types));
    const opening = bal(U().addDays(from, -1));
    const invoiced = mov(['invoice']);
    const recognized = -mov(['recognition']);
    const credited = -mov(['credit_note']);
    const closing = bal(to);
    const other = closing - opening - invoiced + recognized + credited;
    return { from, to, opening, invoiced, recognized, credited, other, closing, expected: Buku.subscriptions.expectedDeferred(db, to) };
  }

  /** Control checks used by the data check: receivables, payables and deferred revenue agree with documents. */
  function controlChecks(db) {
    const issues = [];
    const T = (k, v) => Buku.i18n.t(k, v);
    for (const [sub, types, label] of [['ar', "('invoice','credit_note')", 'Receivables'], ['ap', "('bill')", 'Payables']]) {
      const accs = db.all('SELECT * FROM accounts WHERE subtype=? AND is_header=0', [sub]);
      for (const a of accs) {
        const ledgerBal = db.scalar(`SELECT coalesce(sum(l.debit_base-l.credit_base),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted' AND l.account_id=?`, [a.id]) * (sub === 'ar' ? 1 : -1);
        const cur = a.currency || Buku.fx.base(db);
        const docs = db.scalar(`SELECT coalesce(sum(CASE WHEN doc_type='credit_note' THEN -(total_base-base_cleared) ELSE total_base-base_cleared END),0) FROM documents
          WHERE doc_type IN ${types} AND status IN ('open','partial','paid') AND currency=?`, [cur]);
        const deposits = 0;
        if (ledgerBal !== docs + deposits) issues.push({ level: 'warning', message: T('{acc}: ledger {a} but open documents {b}. Enter opening receivables/payables as opening invoices or bills, not journals.', { acc: a.code + ' ' + a.name, a: Buku.money.format(ledgerBal, 0), b: Buku.money.format(docs, 0) }) });
      }
    }
    const def = db.scalar("SELECT coalesce(sum(l.credit_base-l.debit_base),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id WHERE e.status='posted' AND a.subtype='deferred_revenue'");
    const exp = Buku.subscriptions.expectedDeferred(db);
    if (def !== exp) issues.push({ level: 'warning', message: T('Deferred revenue is {a} in the ledger but {b} in subscription schedules.', { a: Buku.money.format(def, 0), b: Buku.money.format(exp, 0) }) });
    return issues;
  }

  Buku.reports2 = { BUCKETS, aging, statement, cashFlow, sales, openSalesOrders, deferredRollforward, controlChecks, settledAsOf };
})();
