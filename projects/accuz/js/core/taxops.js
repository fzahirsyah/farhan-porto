/* Buku — tax operations: PPN per masa (period), closing PPN into Utang PPN, tax payments with NTPN,
   PPh 23 withheld by customers (bukti potong register) and withholding we did. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, msg, details) => new Buku.BukuError(code, msg, details);
  const U = () => Buku.util;
  const now = () => Buku.util.nowIso();

  function masaRange(masa) {
    if (!/^\d{4}-\d{2}$/.test(masa || '')) throw E('invalid_period', 'Choose a month.');
    return [masa + '-01', U().monthEnd(masa + '-01')];
  }

  function movement(db, subtype, from, to, sign, excludeSource) {
    return db.scalar(`SELECT coalesce(sum(${sign > 0 ? 'l.credit_base - l.debit_base' : 'l.debit_base - l.credit_base'}),0) FROM journal_lines l
      JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
      WHERE e.status='posted' AND a.subtype=? AND e.date BETWEEN ? AND ? ${excludeSource ? "AND e.source_type<>'" + excludeSource + "'" : ''}`, [subtype, from, to]);
  }

  /** PPN for a masa: output from sales, input from purchases, and the documents behind them. */
  function ppn(db, masa) {
    const [from, to] = masaRange(masa);
    const output = movement(db, 'tax_output', from, to, 1, 'ppn_close');
    const input = movement(db, 'tax_input', from, to, -1, 'ppn_close');
    const sales = db.all(`SELECT d.*, c.name contact_name, c.npwp contact_npwp FROM documents d LEFT JOIN contacts c ON c.id=d.contact_id
      WHERE d.doc_type IN ('invoice','credit_note') AND d.status NOT IN ('draft','void') AND d.tax_total>0 AND d.date BETWEEN ? AND ? ORDER BY d.date, d.number`, [from, to]);
    const purchases = db.all(`SELECT d.*, c.name contact_name, c.npwp contact_npwp FROM documents d LEFT JOIN contacts c ON c.id=d.contact_id
      WHERE d.doc_type IN ('bill','expense') AND d.status NOT IN ('draft','void') AND d.tax_total>0 AND d.date BETWEEN ? AND ? ORDER BY d.date, d.number`, [from, to]);
    const toBase = (d) => (d.currency === Buku.fx.base(db) ? d.tax_total : Buku.money.toBase(d.tax_total, Buku.fx.decimals(db, d.currency), d.rate));
    sales.forEach((d) => { d.tax_base = toBase(d) * (d.doc_type === 'credit_note' ? -1 : 1); d.dpp_base = Buku.money.toBase(d.total - d.tax_total, Buku.fx.decimals(db, d.currency), d.rate) * (d.doc_type === 'credit_note' ? -1 : 1); });
    purchases.forEach((d) => { d.tax_base = toBase(d); d.dpp_base = Buku.money.toBase(d.total - d.tax_total, Buku.fx.decimals(db, d.currency), d.rate); });
    const closed = db.get("SELECT * FROM journal_entries WHERE source_type='ppn_close' AND reference=? AND status='posted' AND reversed_by_id IS NULL", ['PPN ' + masa]);
    return { masa, from, to, output, input, net: output - input, sales, purchases, missingFaktur: sales.filter((d) => d.doc_type === 'invoice' && !d.faktur_no).length, closed };
  }

  /** Move the masa's PPN Keluaran and Masukan into Utang PPN (a debit balance means lebih bayar / carried forward). */
  function closePPN(db, masa, date) {
    const r = ppn(db, masa);
    if (r.closed) throw E('already_closed', 'PPN for this month is already closed (' + r.closed.number + ').');
    if (!r.output && !r.input) throw E('nothing', 'No PPN in this month.');
    const base = Buku.fx.base(db);
    const out = Buku.docs.accountBySubtype(db, 'tax_output'), inp = Buku.docs.accountBySubtype(db, 'tax_input');
    const pay = db.get("SELECT * FROM accounts WHERE subtype='tax_payable' AND is_active=1 AND (name LIKE '%PPN%' OR name_en LIKE '%VAT%') ORDER BY code LIMIT 1") || Buku.docs.accountBySubtype(db, 'tax_payable');
    const lines = [];
    if (r.output) lines.push({ account_id: out.id, debit: r.output, currency: base });
    if (r.input) lines.push({ account_id: inp.id, credit: r.input, currency: base });
    if (r.net > 0) lines.push({ account_id: pay.id, credit: r.net, currency: base, description: 'PPN kurang bayar ' + masa });
    if (r.net < 0) lines.push({ account_id: pay.id, debit: -r.net, currency: base, description: 'PPN lebih bayar ' + masa });
    return db.tx(() => {
      const result = Buku.posting.post(db, { date: date || r.to, currency: base, reference: 'PPN ' + masa, memo: 'Tutup masa PPN ' + masa, source_type: 'ppn_close', lines });
      db.insert('tax_period_closings', { masa, journal_entry_id:result.id, output_base:r.output, input_base:r.input, net_base:r.net, closed_at:now() });
      return result;
    });
  }

  /** Accounts a tax payment can settle: tax payables and prepaid PPh 25. */
  function payableAccounts(db) {
    return db.all("SELECT * FROM accounts WHERE is_active=1 AND is_header=0 AND (subtype IN ('tax_payable','tax_withholding_payable') OR (subtype='tax_prepaid' AND (name LIKE '%25%'))) ORDER BY code");
  }

  function payTax(db, input) {
    if (!U().isIsoDate(input.date)) throw E('invalid_date', 'Enter a valid date.');
    if (!/^\d{4}-\d{2}$/.test(input.masa || '')) throw E('invalid_period', 'Choose the tax month (masa).');
    const amount = Number(input.amount);
    if (!(amount > 0)) throw E('invalid_amount', 'Enter the amount.');
    const acc = db.get('SELECT * FROM accounts WHERE id=?', [input.account_id]);
    const bank = db.get('SELECT * FROM accounts WHERE id=?', [input.bank_account_id]);
    if (!acc || !bank) throw E('missing_account', 'Choose the tax and the bank account.');
    if (bank.currency && bank.currency !== Buku.fx.base(db)) throw E('currency_mismatch', 'Pay taxes from a rupiah account.');
    const base = Buku.fx.base(db);
    return db.tx(() => {
      const r = Buku.posting.post(db, {
        date: input.date, currency: base, reference: input.ntpn ? 'NTPN ' + input.ntpn : null, memo: 'Setor ' + acc.name + ' masa ' + input.masa, source_type: 'tax_payment',
        lines: [{ account_id: acc.id, debit: amount, currency: base }, { account_id: bank.id, credit: amount, currency: base }],
      });
      db.insert('tax_payments', { kind: acc.name, account_id: acc.id, masa: input.masa, date: input.date, amount, bank_account_id: bank.id, ntpn: input.ntpn || null, journal_entry_id: r.id, created_at: now() });
      return r;
    });
  }

  function payments(db, year) {
    return db.all(`SELECT t.*, a.code, a.name account_name, b.name bank_name, e.number FROM tax_payments t JOIN accounts a ON a.id=t.account_id JOIN accounts b ON b.id=t.bank_account_id
      JOIN journal_entries e ON e.id=t.journal_entry_id WHERE (? IS NULL OR substr(t.masa,1,4)=?) ORDER BY t.date DESC`, [year || null, year || null]);
  }

  /** PPh 23 withheld by customers in a date range (from payments), with bukti potong numbers. */
  function withheldByCustomers(db, from, to) {
    return db.all(`SELECT a.*, p.number payment_number, p.date, p.id payment_id, d.number doc_number, d.currency, c.name contact_name, c.npwp contact_npwp
      FROM payment_allocations a JOIN payments p ON p.id=a.payment_id JOIN documents d ON d.id=a.document_id LEFT JOIN contacts c ON c.id=p.contact_id
      WHERE p.status='posted' AND a.withholding>0 AND p.date BETWEEN ? AND ? ORDER BY p.date`, [from, to])
      .map((x) => Object.assign(x, { withholding_base: Buku.money.toBase(x.withholding, Buku.fx.decimals(db, x.currency), x.doc_rate || '1') }));
  }

  function setBuktiPotong(db, allocationId, no, date) {
    db.tx(() => db.run('UPDATE payment_allocations SET bukti_potong_no=?, bukti_potong_date=? WHERE id=?', [no || null, date || null, allocationId]));
  }

  /** Withholding we did on bills and expenses (PPh 23 / 21 / 4(2)) for monthly returns. */
  function withheldByUs(db, from, to) {
    return db.all(`SELECT d.*, c.name contact_name, c.npwp contact_npwp, t.name tax_name, t.kind tax_kind FROM documents d LEFT JOIN contacts c ON c.id=d.contact_id
      JOIN taxes t ON t.id=d.withholding_tax_id WHERE d.doc_type IN ('bill','expense') AND d.status NOT IN ('draft','void') AND d.withholding_total>0 AND d.date BETWEEN ? AND ? ORDER BY t.kind, d.date`, [from, to])
      .map((x) => Object.assign(x, { withholding_base: Buku.money.toBase(x.withholding_total, Buku.fx.decimals(db, x.currency), x.rate) }));
  }

  function setFaktur(db, docId, no, date) {
    db.tx(() => {
      const d = db.get('SELECT * FROM documents WHERE id=?', [docId]);
      if (!d || !['invoice', 'credit_note', 'bill', 'expense'].includes(d.doc_type)) throw E('not_found', 'Document not found.');
      if (no && !/^[0-9.\-]{8,30}$/.test(no.trim())) throw E('invalid_faktur', 'Use digits, dots and dashes for the faktur number.');
      db.run('UPDATE documents SET faktur_no=?, faktur_date=?, updated_at=? WHERE id=?', [no ? no.trim() : null, date || null, now(), docId]);
    });
  }

  Buku.taxops = { ppn, closePPN, payableAccounts, payTax, payments, withheldByCustomers, setBuktiPotong, withheldByUs, setFaktur, masaRange };
})();
