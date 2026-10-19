/* NotaKris — accounting engine. Double-entry journal with automatic posting rules.
   Client money (BPHTB, PPh, PNBP collected on behalf of clients) is a liability, never revenue,
   and is received into a separate trust bank account. All functions run inside DB.write. */
(function () {
  const NK = (window.NK = window.NK || {});
  const A = {
    KAS: '1-1100', BANK_OPS: '1-1200', BANK_TITIPAN: '1-1300', PIUTANG: '1-1400', PREPAID: '1-1500',
    EQUIP: '1-2100', ACC_DEP: '1-2900',
    UTANG_USAHA: '2-1100', TITIPAN_PAJAK: '2-1200', TITIPAN_PNBP: '2-1300', UTANG_PPH21: '2-1400',
    MODAL: '3-1000', PRIVE: '3-2000', LABA_DITAHAN: '3-3000',
    HON_NOTARIS: '4-1000', HON_PPAT: '4-2000', JASA: '4-3000', LEGAL: '4-4000', LAIN: '4-9000',
    GAJI: '5-1000'
  };
  const isClientFund = (code) => code === A.TITIPAN_PAJAK || code === A.TITIPAN_PNBP;

  function periodClosed(date) {
    const r = NK.db.get('SELECT closed FROM periods WHERE month=?', [date.slice(0, 7)]);
    return r && r.closed;
  }

  /* lines: [{account, debit, credit}] — must balance; zero lines are dropped. */
  function post(e) {
    const lines = e.lines.filter((l) => (l.debit || 0) !== 0 || (l.credit || 0) !== 0);
    const d = lines.reduce((s, l) => s + Math.round(l.debit || 0), 0);
    const c = lines.reduce((s, l) => s + Math.round(l.credit || 0), 0);
    if (d !== c) throw new Error(`Jurnal tidak seimbang (debit ${d} ≠ kredit ${c}) — ${e.description}`);
    if (!lines.length) return null;
    if (periodClosed(e.date)) throw new Error('Periode ' + NK.fmt.bulanTahun(e.date.slice(0, 7)) + ' sudah ditutup.');
    const id = NK.db.insert('journal_entries', {
      date: e.date, ref: e.ref || null, description: e.description, source: e.source || 'manual', source_id: e.source_id || null,
      manual: e.manual ? 1 : 0, created_by: (NK.session && NK.session.name) || 'Sistem', created_at: NK.fmt.nowStamp()
    });
    lines.forEach((l) => NK.db.insert('journal_lines', { entry_id: id, account_code: l.account, debit: Math.round(l.debit || 0), credit: Math.round(l.credit || 0) }));
    return id;
  }
  function removeBySource(source, sourceId) {
    NK.db.all('SELECT id,date FROM journal_entries WHERE source=? AND source_id=?', [source, sourceId]).forEach((e) => {
      if (periodClosed(e.date)) throw new Error('Jurnal berada di periode yang sudah ditutup.');
      NK.db.run('DELETE FROM journal_entries WHERE id=?', [e.id]);
    });
  }

  // Invoice issued: Dr Piutang (total) / Cr revenue per item / Cr client-fund liability for pass-through items
  function postInvoice(invId) {
    const inv = NK.db.get('SELECT * FROM invoices WHERE id=?', [invId]);
    const items = NK.db.all('SELECT * FROM invoice_items WHERE invoice_id=?', [invId]);
    const total = items.reduce((s, i) => s + Math.round(i.qty * i.price), 0);
    const credits = {};
    items.forEach((i) => { const a = i.account_code || A.HON_NOTARIS; credits[a] = (credits[a] || 0) + Math.round(i.qty * i.price); });
    const id = post({ date: inv.date, ref: inv.no, description: 'Invoice ' + inv.no, source: 'invoice', source_id: invId,
      lines: [{ account: A.PIUTANG, debit: total }].concat(Object.entries(credits).map(([a, v]) => ({ account: a, credit: v }))) });
    NK.db.run('UPDATE invoices SET entry_id=? WHERE id=?', [id, invId]);
    return id;
  }

  // How much of an invoice is client money vs office money, and how much of each is still unpaid.
  function invoiceSplit(invId, excludePaymentId) {
    const items = NK.db.all('SELECT * FROM invoice_items WHERE invoice_id=?', [invId]);
    let fund = 0, office = 0;
    items.forEach((i) => { const v = Math.round(i.qty * i.price); if (isClientFund(i.account_code)) fund += v; else office += v; });
    const paid = NK.db.all("SELECT * FROM payments WHERE invoice_id=? AND status='terverifikasi' AND id<>?", [invId, excludePaymentId || 0]);
    // earlier payments were allocated to client funds first
    let paidTotal = paid.reduce((s, p) => s + p.amount, 0);
    const fundPaid = Math.min(fund, paidTotal); const officePaid = paidTotal - fundPaid;
    return { fund, office, total: fund + office, fundDue: fund - fundPaid, officeDue: office - officePaid, paidTotal };
  }

  // Verified payment: client-fund portion goes to the trust account first, the rest to the operating account.
  function postPayment(paymentId) {
    const p = NK.db.get('SELECT * FROM payments WHERE id=?', [paymentId]);
    const inv = NK.db.get('SELECT * FROM invoices WHERE id=?', [p.invoice_id]);
    const sp = invoiceSplit(p.invoice_id, paymentId);
    const toFund = Math.min(p.amount, Math.max(0, sp.fundDue));
    const toOps = p.amount - toFund;
    const cashAcc = p.method === 'Tunai' ? A.KAS : A.BANK_OPS;
    const id = post({ date: p.date, ref: inv.no, description: 'Pembayaran ' + inv.no, source: 'payment', source_id: paymentId,
      lines: [{ account: A.BANK_TITIPAN, debit: toFund }, { account: cashAcc, debit: toOps }, { account: A.PIUTANG, credit: p.amount }] });
    NK.db.run('UPDATE payments SET entry_id=? WHERE id=?', [id, paymentId]);
    return id;
  }

  // Client money paid out to the tax office / ministry
  function postDeposit(o) {
    return post({ date: o.date, ref: o.ref, description: o.description, source: 'setoran', source_id: o.source_id || null,
      lines: [{ account: o.account || A.TITIPAN_PAJAK, debit: o.amount }, { account: A.BANK_TITIPAN, credit: o.amount }] });
  }

  function poTotal(poId) { return Math.round(NK.db.val('SELECT COALESCE(SUM(qty*price),0) FROM po_items WHERE po_id=?', [poId])); }
  function postPOReceived(poId, date) {
    const po = NK.db.get('SELECT * FROM purchase_orders WHERE id=?', [poId]);
    const id = post({ date, ref: po.no, description: 'Barang/jasa diterima ' + po.no, source: 'po-terima', source_id: poId,
      lines: [{ account: po.expense_account || '5-4000', debit: poTotal(poId) }, { account: A.UTANG_USAHA, credit: poTotal(poId) }] });
    NK.db.run('UPDATE purchase_orders SET received_entry_id=? WHERE id=?', [id, poId]);
    return id;
  }
  function postPOPaid(poId, date) {
    const po = NK.db.get('SELECT * FROM purchase_orders WHERE id=?', [poId]);
    const id = post({ date, ref: po.no, description: 'Pembayaran vendor ' + po.no, source: 'po-bayar', source_id: poId,
      lines: [{ account: A.UTANG_USAHA, debit: poTotal(poId) }, { account: A.BANK_OPS, credit: poTotal(poId) }] });
    NK.db.run('UPDATE purchase_orders SET paid_entry_id=? WHERE id=?', [id, poId]);
    return id;
  }

  // Payroll: Dr salary expense (gross) / Cr bank (net) / Cr PPh 21 payable
  function postPayroll(runId, date) {
    const run = NK.db.get('SELECT * FROM payroll_runs WHERE id=?', [runId]);
    const t = NK.db.get('SELECT SUM(base+allowance+overtime) g, SUM(pph21) t, SUM(net) n FROM payroll_lines WHERE run_id=?', [runId]);
    const id = post({ date, ref: 'GAJI ' + run.period, description: 'Gaji karyawan ' + NK.fmt.bulanTahun(run.period), source: 'gaji', source_id: runId,
      lines: [{ account: A.GAJI, debit: t.g }, { account: A.BANK_OPS, credit: t.n }, { account: A.UTANG_PPH21, credit: t.t }] });
    NK.db.run("UPDATE payroll_runs SET entry_id=?, status='diposting', posted_at=? WHERE id=?", [id, NK.fmt.nowStamp(), runId]);
    return id;
  }

  // ---- reporting helpers ----
  function balances(from, to) {
    const where = []; const p = [];
    if (from) { where.push('e.date>=?'); p.push(from); }
    if (to) { where.push('e.date<=?'); p.push(to); }
    const rows = NK.db.all(`SELECT a.code,a.name,a.type,a.client_fund, COALESCE(SUM(l.debit),0) d, COALESCE(SUM(l.credit),0) c
      FROM accounts a LEFT JOIN journal_lines l ON l.account_code=a.code
      LEFT JOIN journal_entries e ON e.id=l.entry_id ${where.length ? 'AND ' + where.join(' AND ') : ''}
      GROUP BY a.code ORDER BY a.code`, p);
    rows.forEach((r) => { r.balance = ['aset', 'beban'].includes(r.type) ? r.d - r.c : r.c - r.d; });
    return rows;
  }
  function accountBalance(code, to) {
    const r = NK.db.get(`SELECT COALESCE(SUM(l.debit),0) d, COALESCE(SUM(l.credit),0) c FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_code=? ${to ? 'AND e.date<=?' : ''}`, to ? [code, to] : [code]);
    const t = NK.db.val('SELECT type FROM accounts WHERE code=?', [code]);
    return ['aset', 'beban'].includes(t) ? r.d - r.c : r.c - r.d;
  }
  function trialOk() {
    const r = NK.db.get('SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines');
    return { ok: r.d === r.c, debit: r.d, credit: r.c };
  }
  function receivable(invId) {
    const total = Math.round(NK.db.val('SELECT COALESCE(SUM(qty*price),0) FROM invoice_items WHERE invoice_id=?', [invId]));
    const paid = NK.db.val("SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=? AND status='terverifikasi'", [invId]);
    return { total, paid, due: total - paid };
  }

  NK.acc = { A, isClientFund, post, removeBySource, postInvoice, invoiceSplit, postPayment, postDeposit, postPOReceived, postPOPaid, poTotal, postPayroll, balances, accountBalance, trialOk, receivable, periodClosed };
})();
