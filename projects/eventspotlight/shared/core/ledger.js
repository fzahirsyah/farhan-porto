/* Event Spotlight — double-entry ledger, chart of accounts, event posting rules and financial statements.
   Everything that touches money posts through ES.ledger.post so the books always balance. */
(function () {
  const ES = (window.ES = window.ES || {});

  const COA = [
    ['1010', 'Cash and bank', 'asset', 1], ['1020', 'Payment gateway balance', 'asset', 1], ['1100', 'Accounts receivable', 'asset', 1],
    ['1200', 'Advances to vendors', 'asset', 0], ['1300', 'VAT input', 'asset', 1],
    ['2010', 'Accounts payable', 'liability', 1], ['2100', 'Ticket deposits (until event date)', 'liability', 1], ['2110', 'Sponsor deposits (until event date)', 'liability', 1],
    ['2200', 'VAT output', 'liability', 1], ['2210', 'Withholding tax payable', 'liability', 1], ['2220', 'Entertainment tax payable', 'liability', 0], ['2300', 'Commissions payable', 'liability', 1],
    ['3000', 'Owner equity', 'equity', 1], ['3100', 'Retained earnings', 'equity', 1],
    ['4010', 'Ticket revenue', 'revenue', 1], ['4020', 'Sponsorship revenue', 'revenue', 1], ['4030', 'Transfer fee income', 'revenue', 1], ['4040', 'Other income', 'revenue', 0],
    ['5010', 'Artist fees and riders', 'expense', 1], ['5020', 'Production (sound, lighting, stage)', 'expense', 1], ['5030', 'Venue and permits', 'expense', 1],
    ['5040', 'Security and medical', 'expense', 1], ['5050', 'Marketing and media', 'expense', 1], ['5060', 'Promotor commissions', 'expense', 1],
    ['5070', 'Logistics and hospitality', 'expense', 1], ['5080', 'Payment gateway fees', 'expense', 1], ['5090', 'Software and platform', 'expense', 0], ['5900', 'Other event costs', 'expense', 1]
  ];
  // budget / PO category -> expense account code
  const CATEGORY_ACCOUNT = { Artists: '5010', Production: '5020', Venue: '5030', Security: '5040', Marketing: '5050', Promotors: '5060', Logistics: '5070', Other: '5900' };
  const CATEGORIES = Object.keys(CATEGORY_ACCOUNT);

  const acc = (code) => ES.db.val('SELECT id FROM accounts WHERE code=?', [code]);

  function seedAccounts(DB) {
    COA.forEach(([code, name, type, system]) => DB.run('INSERT OR IGNORE INTO accounts(code,name,type,system) VALUES(?,?,?,?)', [code, name, type, system]));
  }

  /* lines: [{code|account_id, debit, credit, memo}] — must balance. Returns entry id. Runs inside DB.write. */
  function post(o) {
    const lines = o.lines.filter((l) => (l.debit || 0) || (l.credit || 0));
    const dr = lines.reduce((s, l) => s + (l.debit || 0), 0), cr = lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.round(dr) !== Math.round(cr)) throw new Error('Journal does not balance: debit ' + dr + ' vs credit ' + cr);
    if (!lines.length) return null;
    const date = o.date || ES.fmt.today();
    const lock = ES.db.setting('books_locked_until', '');
    if (lock && date <= lock && !o.force) throw new Error('Books are locked through ' + ES.fmt.date(lock) + '. Choose a later date.');
    const no = ES.num.next('JRN', date);
    const id = ES.db.insert('journal_entries', { event_id: o.event_id || null, date, no, memo: o.memo || '', source: o.source || 'manual', source_id: o.source_id || null, created_by: (ES.session && ES.session.name) || 'System', created_at: ES.fmt.nowStamp() });
    lines.forEach((l) => {
      const aid = l.account_id || acc(l.code);
      if (!aid) throw new Error('Unknown account ' + l.code);
      ES.db.insert('journal_lines', { entry_id: id, account_id: aid, debit: Math.round(l.debit || 0), credit: Math.round(l.credit || 0), memo: l.memo || '' });
    });
    return id;
  }
  function reverse(entryId, reason) {
    const e = ES.db.get('SELECT * FROM journal_entries WHERE id=?', [entryId]);
    if (!e || e.reversed) throw new Error('Entry cannot be reversed');
    const ls = ES.db.all('SELECT * FROM journal_lines WHERE entry_id=?', [entryId]);
    const id = post({ event_id: e.event_id, memo: 'Reversal of ' + e.no + (reason ? ': ' + reason : ''), source: 'reversal', source_id: entryId, lines: ls.map((l) => ({ account_id: l.account_id, debit: l.credit, credit: l.debit, memo: l.memo })) });
    ES.db.update('journal_entries', entryId, { reversed: 1 });
    return id;
  }

  // ---- posting rules ----
  function ticketSale(o, order) {
    // order: {subtotal, admin_fee, total, payer}. Buyer pays subtotal (+ fee when buyer pays it); gateway keeps the fee.
    const fee = order.admin_fee || 0, payer = order.payer || 'buyer';
    const lines = [{ code: '1020', debit: order.subtotal - (payer === 'eo' ? fee : 0) }, { code: '2100', credit: order.subtotal }];
    if (payer === 'eo' && fee) lines.push({ code: '5080', debit: fee });
    return post({ event_id: o.event_id, date: o.date, memo: 'Ticket sale ' + o.no, source: 'ticket_sale', source_id: o.id, lines });
  }
  function transferFee(o) {
    return post({ event_id: o.event_id, date: o.date, memo: 'Transfer fee ' + o.ref, source: 'transfer_fee', source_id: o.id, lines: [{ code: '1020', debit: o.fee }, { code: '4030', credit: o.fee }] });
  }
  function refund(o) {
    return post({ event_id: o.event_id, date: o.date, memo: 'Refund ' + o.ref, source: 'refund', source_id: o.id, lines: [{ code: '2100', debit: o.amount }, { code: '1020', credit: o.amount }] });
  }
  function gatewayPayout(o) {
    return post({ event_id: o.event_id, date: o.date, memo: o.memo || 'Gateway payout', source: 'payout', source_id: o.id, lines: [{ code: '1010', debit: o.amount }, { code: '1020', credit: o.amount }] });
  }
  function invoiceIssued(doc) {
    const lines = [{ code: '1100', debit: doc.total }, { code: '2110', credit: doc.subtotal }];
    if (doc.tax_amount) lines.push({ code: '2200', credit: doc.tax_amount });
    return post({ event_id: doc.event_id, date: doc.issue_date, memo: 'Invoice ' + doc.no + ' ' + doc.party_name, source: 'invoice', source_id: doc.id, lines });
  }
  function paymentIn(o) {
    return post({ event_id: o.event_id, date: o.date, memo: o.memo, source: 'payment_in', source_id: o.id, lines: [{ code: '1010', debit: o.amount }, { code: '1100', credit: o.amount }] });
  }
  // PO / vendor invoice accepted (three-way match passed): expense + VAT input, payable net of withholding.
  function vendorBill(o) {
    const exp = CATEGORY_ACCOUNT[o.category] || '5900';
    const lines = [{ code: exp, debit: o.amount }, { code: '2010', credit: o.amount + (o.ppn || 0) - (o.pph || 0) }];
    if (o.ppn) lines.push({ code: '1300', debit: o.ppn });
    if (o.pph) lines.push({ code: '2210', credit: o.pph });
    return post({ event_id: o.event_id, date: o.date, memo: o.memo, source: 'vendor_bill', source_id: o.id, lines });
  }
  function vendorPayment(o) {
    return post({ event_id: o.event_id, date: o.date, memo: o.memo, source: 'vendor_payment', source_id: o.id, lines: [{ code: '2010', debit: o.amount }, { code: '1010', credit: o.amount }] });
  }
  function recognise(o) {
    // Move deposits to revenue on the event date.
    const lines = [];
    if (o.tickets) lines.push({ code: '2100', debit: o.tickets }, { code: '4010', credit: o.tickets });
    if (o.sponsors) lines.push({ code: '2110', debit: o.sponsors }, { code: '4020', credit: o.sponsors });
    return post({ event_id: o.event_id, date: o.date, memo: o.memo || 'Revenue recognised on event date', source: 'recognise', lines });
  }
  function commission(o) {
    return post({ event_id: o.event_id, date: o.date, memo: o.memo, source: 'commission', source_id: o.id, lines: [{ code: '5060', debit: o.amount }, { code: '2300', credit: o.amount }] });
  }
  function commissionPaid(o) {
    return post({ event_id: o.event_id, date: o.date, memo: o.memo, source: 'commission_paid', source_id: o.id, lines: [{ code: '2300', debit: o.amount }, { code: '1010', credit: o.amount }] });
  }

  // ---- reports ----
  // Strict version: only lines whose entry matches the filters (the LEFT JOIN above would keep orphan lines).
  function trial(eventId, asOf) {
    const p = []; let w = '1=1';
    if (eventId) { w += ' AND e.event_id=?'; p.push(eventId); }
    if (asOf) { w += ' AND e.date<=?'; p.push(asOf); }
    const rows = ES.db.all(`SELECT a.id,a.code,a.name,a.type,COALESCE(SUM(l.debit),0) d,COALESCE(SUM(l.credit),0) c FROM accounts a
      LEFT JOIN (SELECT l.* FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE ${w}) l ON l.account_id=a.id GROUP BY a.id ORDER BY a.code`, p);
    return rows.map((r) => Object.assign(r, { net: r.type === 'asset' || r.type === 'expense' ? r.d - r.c : r.c - r.d }));
  }
  function incomeStatement(eventId, asOf) {
    const t = trial(eventId, asOf); const rev = t.filter((r) => r.type === 'revenue' && (r.d || r.c)); const exp = t.filter((r) => r.type === 'expense' && (r.d || r.c));
    const R = rev.reduce((s, r) => s + r.net, 0), X = exp.reduce((s, r) => s + r.net, 0);
    return { revenue: rev, expenses: exp, totalRevenue: R, totalExpenses: X, net: R - X };
  }
  function balanceSheet(eventId, asOf) {
    const t = trial(eventId, asOf); const g = (ty) => t.filter((r) => r.type === ty && (r.d || r.c));
    const is = incomeStatement(eventId, asOf);
    const assets = g('asset'), liab = g('liability'), eq = g('equity');
    const A = assets.reduce((s, r) => s + r.net, 0), L = liab.reduce((s, r) => s + r.net, 0), E = eq.reduce((s, r) => s + r.net, 0) + is.net;
    return { assets, liabilities: liab, equity: eq, currentEarnings: is.net, totalAssets: A, totalLiabilities: L, totalEquity: E, balanced: Math.round(A - L - E) === 0 };
  }
  function accountLedger(accountId, eventId) {
    const p = [accountId]; let w = '';
    if (eventId) { w = ' AND e.event_id=?'; p.push(eventId); }
    return ES.db.all(`SELECT e.date,e.no,e.memo,l.debit,l.credit,l.memo lmemo FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=?${w} ORDER BY e.date,e.id`, p);
  }
  // Budget vs committed vs paid for an event.
  function budgetStatus(eventId) {
    return ES.db.all('SELECT * FROM budget_lines WHERE event_id=? ORDER BY category,id', [eventId]).map((b) => {
      const committed = ES.db.val("SELECT COALESCE(SUM(CASE WHEN invoice_amount IS NOT NULL AND status IN ('invoiced','paid') THEN invoice_amount ELSE amount END),0) FROM purchase_orders WHERE budget_line_id=? AND status NOT IN ('draft','cancelled')", [b.id]) || 0;
      const paid = ES.db.val("SELECT COALESCE(SUM(CASE WHEN invoice_amount IS NOT NULL THEN invoice_amount ELSE amount END),0) FROM purchase_orders WHERE budget_line_id=? AND status='paid'", [b.id]) || 0;
      return Object.assign(b, { committed, paid, remaining: b.planned - committed });
    });
  }

  ES.ledger = { COA, CATEGORY_ACCOUNT, CATEGORIES, seedAccounts, post, reverse, ticketSale, transferFee, refund, gatewayPayout, invoiceIssued, paymentIn, vendorBill, vendorPayment, recognise, commission, commissionPaid,  trial, incomeStatement, balanceSheet, accountLedger, budgetStatus, acc };
})();
