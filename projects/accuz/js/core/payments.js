/* Buku — payments received and made.
   Receipt: Dr bank (amount) + Dr bank fee + Dr prepaid PPh 23 (withheld by customer) = Cr receivable (+ Cr customer deposit for any surplus),
   with the receivable cleared at the invoice's own IDR value and any difference posted as realized FX gain/loss. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, msg, details) => new Buku.BukuError(code, msg, details);
  const now = () => Buku.util.nowIso();

  /** Accounts money can come from / go to: cash, bank, and customer/vendor deposits. */
  function fundAccounts(db, direction) {
    const extra = direction === 'in' ? "'customer_credit'" : "'vendor_prepayment'";
    return db.all(`SELECT * FROM accounts WHERE is_active=1 AND is_header=0 AND subtype IN ('cash','bank',${extra}) ORDER BY CASE subtype WHEN 'bank' THEN 0 WHEN 'cash' THEN 1 ELSE 2 END, code`);
  }

  function accountCurrency(db, acc) {
    return acc.currency || Buku.fx.base(db);
  }

  /**
   * Record a payment.
   * input: { direction:'in'|'out', contact_id, date, account_id, amount, rate, fee, fee_account_id, reference, memo, bank_import_line_id,
   *          allocations: [{ document_id, amount, withholding, withholding_tax_id, bukti_potong_no, bukti_potong_date, doc_rate }] }
   * Amounts: payment amount/fee in the account's currency; allocation amount (incl. withholding) in the document's currency.
   */
  function post(db, input) {
    const dir = input.direction;
    if (dir !== 'in' && dir !== 'out') throw E('bad_direction', 'Choose received or paid.');
    if (!Buku.util.isIsoDate(input.date)) throw E('invalid_date', 'Enter a valid date.');
    const base = Buku.fx.base(db);
    const acc = db.get('SELECT * FROM accounts WHERE id=?', [input.account_id]);
    if (!acc || !fundAccounts(db, dir).some((a) => a.id === acc.id)) throw E('bad_account', 'Choose a bank, cash or deposit account.');
    const cur = accountCurrency(db, acc);
    const rate = cur === base ? '1' : Buku.money.rateToString(input.rate || (Buku.fx.lookup(db, cur, input.date) || {}).rate || '');
    const amount = Number(input.amount || 0);
    const fee = Number(input.fee || 0);
    if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(fee) || fee < 0) throw E('invalid_amount', 'Enter valid amounts.');
    const isDeposit = acc.subtype === 'customer_credit' || acc.subtype === 'vendor_prepayment';
    if (isDeposit && fee) throw E('fee_on_deposit', 'Bank charges do not apply when using a deposit.');
    const allocs = (input.allocations || []).filter((a) => Number(a.amount) > 0);
    if (!amount && !allocs.length) throw E('invalid_amount', 'Enter the amount.');

    const decAcc = Buku.fx.decimals(db, cur);
    const toB = (v, c, r) => Buku.money.toBase(v, Buku.fx.decimals(db, c), r);
    const lines = [];
    const prepared = [];
    let cashApplied = 0; // in account currency, for same-currency allocations
    let crossCurrency = false;
    let wtBaseTotal = 0;

    for (const a of allocs) {
      const d = db.get('SELECT * FROM documents WHERE id=?', [a.document_id]);
      if (!d || !['open', 'partial'].includes(d.status)) throw E('doc_not_open', 'A selected document is no longer open.');
      if (input.contact_id && d.contact_id !== Number(input.contact_id)) throw E('mismatch', 'All documents must belong to the same contact.');
      if (!input.instalment_collection && db.scalar("SELECT 1 FROM instalment_plans WHERE invoice_id=? AND status='active'",[d.id]))
        throw E('instalment_allocation_required','This invoice has a managed instalment plan. Collect through the instalment schedule.');
      const okType = dir === 'in' ? d.doc_type === 'invoice' : (d.doc_type === 'bill' || d.doc_type === 'credit_note');
      if (!okType) throw E('mismatch', d.number + ' cannot be settled by this payment.');
      const amt = Number(a.amount), wt = Number(a.withholding || 0);
      if (!Number.isInteger(amt) || amt <= 0 || !Number.isInteger(wt) || wt < 0) throw E('invalid_amount', d.number + ': invalid amount.');
      if (amt > Buku.docs.balance(d)) throw E('over_payment', d.number + ': more than the open balance (' + Buku.money.format(Buku.docs.balance(d), Buku.fx.decimals(db, d.currency)) + ').');
      if (wt > amt) throw E('invalid_amount', d.number + ': withholding is more than the amount.');
      if (wt && (dir !== 'in' || d.doc_type !== 'invoice')) throw E('bad_withholding', 'Withholding at payment applies to customer invoices only.');
      const docRate = d.currency === base ? '1' : d.currency === cur ? rate : Buku.money.rateToString(a.doc_rate || (Buku.fx.lookup(db, d.currency, input.date) || {}).rate || '');
      if (d.currency !== cur) crossCurrency = true; else cashApplied += amt - wt;
      const arBase = Buku.docs.clearBase(d, amt);
      prepared.push({ a, d, amt, wt, docRate, arBase });
    }

    // Received: the bank deducted the fee, so the customer paid amount + fee. Paid: the fee is extra.
    const unapplied = crossCurrency ? 0 : amount + (dir === 'in' ? fee : 0) - cashApplied;
    if (!crossCurrency && unapplied < 0) throw E('under_payment', 'The amounts applied are more than the payment.');
    if (crossCurrency && !amount) throw E('invalid_amount', 'Enter the amount that moved in the account.');

    // Lines.
    const contact = input.contact_id ? Number(input.contact_id) : null;
    const feeAcc = fee ? (input.fee_account_id ? Number(input.fee_account_id) : Buku.docs.accountBySubtype(db, 'other_expense').id) : null;
    if (dir === 'in') {
      if (amount) lines.push({ account_id: acc.id, debit: amount, currency: cur, rate, contact_id: contact });
      if (fee) lines.push({ account_id: feeAcc, debit: fee, currency: cur, rate, description: 'Biaya bank' });
    } else {
      if (amount) lines.push({ account_id: acc.id, credit: amount, currency: cur, rate, contact_id: contact });
      if (fee) { lines.push({ account_id: feeAcc, debit: fee, currency: cur, rate, description: 'Biaya bank' }); lines.push({ account_id: acc.id, credit: fee, currency: cur, rate, description: 'Biaya bank' }); }
    }
    for (const p of prepared) {
      const { d, amt, wt, docRate, arBase } = p;
      const ctl = d.doc_type === 'bill' ? Buku.docs.controlAccount(db, 'ap', d.currency) : Buku.docs.controlAccount(db, 'ar', d.currency);
      if (dir === 'in') {
        if (wt) {
          const t = p.a.withholding_tax_id ? db.get('SELECT * FROM taxes WHERE id=?', [p.a.withholding_tax_id]) : db.get("SELECT * FROM taxes WHERE kind='pph23' AND direction='withheld_by_customer' AND is_active=1 ORDER BY id LIMIT 1");
          if (!t || !t.account_id) throw E('tax_no_account', 'Set up the PPh 23 (withheld by customer) tax with an account.');
          p.wtTaxId = t.id;
          const wb = toB(wt, d.currency, docRate);
          wtBaseTotal += wb;
          lines.push({ account_id: t.account_id, debit: wt, currency: d.currency, rate: docRate, description: 'PPh 23 ' + d.number + (p.a.bukti_potong_no ? ' · BP ' + p.a.bukti_potong_no : ''), contact_id: contact });
        }
        lines.push({ account_id: ctl.id, credit: amt, currency: d.currency, rate: d.rate, base: arBase, description: d.number, contact_id: contact });
      } else {
        // Paying a bill clears payable (debit); refunding a credit note clears the negative receivable (debit).
        lines.push({ account_id: ctl.id, debit: amt, currency: d.currency, rate: d.rate, base: arBase, description: d.number, contact_id: contact });
      }
    }
    if (unapplied > 0) {
      const dep = dir === 'in' ? Buku.docs.accountBySubtype(db, 'customer_credit') : Buku.docs.accountBySubtype(db, 'vendor_prepayment');
      if (dep.id === acc.id) throw E('deposit_loop', 'A deposit cannot be paid into itself.');
      lines.push(Object.assign({ account_id: dep.id, currency: cur, rate, description: dir === 'in' ? 'Kelebihan bayar / uang muka' : 'Uang muka pembelian', contact_id: contact },
        dir === 'in' ? { credit: unapplied } : { debit: unapplied }));
    }

    // Realized FX difference so the entry balances exactly in IDR.
    const sumBase = (side) => lines.reduce((s, l) => {
      const v = l.base !== undefined ? ((l.side || (l.debit ? 'debit' : 'credit')) === side ? l.base : 0) : (l[side] ? toB(l[side], l.currency, l.rate) : 0);
      return s + v;
    }, 0);
    const diff = sumBase('debit') - sumBase('credit');
    if (diff !== 0) {
      const fx = Buku.docs.accountBySubtype(db, 'fx_realized');
      lines.push(Object.assign({ account_id: fx.id, currency: base, description: 'Selisih kurs' }, diff > 0 ? { credit: diff } : { debit: -diff }));
    }

    return db.tx(() => {
      const seq = dir === 'in' ? 'payment_in' : 'payment_out';
      const number = Buku.numbering.take(db, seq, input.date, {}, (n) => !!db.scalar('SELECT 1 FROM payments WHERE number=?', [n]));
      const who = contact ? db.scalar('SELECT name FROM contacts WHERE id=?', [contact]) : '';
      const docsLabel = prepared.map((p) => p.d.number).join(', ');
      const r = Buku.posting.post(db, {
        date: input.date, currency: cur, rate, reference: number,
        memo: (dir === 'in' ? 'Penerimaan ' : 'Pembayaran ') + number + (who ? ' – ' + who : '') + (docsLabel ? ' (' + docsLabel + ')' : ''),
        source_type: dir === 'in' ? 'payment_in' : 'payment_out', lines,
      });
      const pid = db.insert('payments', {
        number, direction: dir, contact_id: contact, date: input.date, account_id: acc.id, currency: cur, rate, amount, fee, fee_account_id: feeAcc,
        unapplied: Math.max(0, unapplied), reference: input.reference || null, memo: input.memo || null, journal_entry_id: r.id, status: 'posted',
        bank_import_line_id: input.bank_import_line_id || null, created_at: now(), updated_at: now(),
      });
      db.run('UPDATE journal_entries SET source_id=? WHERE id=?', [pid, r.id]);
      for (const p of prepared) {
        db.insert('payment_allocations', {
          payment_id: pid, document_id: p.d.id, amount: p.amt, withholding: p.wt, withholding_tax_id: p.wtTaxId || null,
          bukti_potong_no: p.a.bukti_potong_no || null, bukti_potong_date: p.a.bukti_potong_date || null, doc_rate: p.docRate, ar_base: p.arBase,
        });
        db.run('UPDATE documents SET base_cleared=base_cleared+? WHERE id=?', [p.arBase, p.d.id]);
        Buku.docs.refreshPaid(db, p.d.id);
      }
      if (input.bank_import_line_id) db.run("UPDATE bank_import_lines SET status='created', journal_entry_id=? WHERE id=?", [r.id, input.bank_import_line_id]);
      Buku.posting.audit(db, 'post', 'payments', pid, number);
      return { id: pid, number, entry_id: r.id };
    });
  }

  function load(db, id) {
    const p = db.get(`SELECT p.*, c.name contact_name, a.code account_code, a.name account_name FROM payments p LEFT JOIN contacts c ON c.id=p.contact_id
      JOIN accounts a ON a.id=p.account_id WHERE p.id=?`, [id]);
    if (!p) return null;
    p.allocations = db.all(`SELECT al.*, d.number doc_number, d.doc_type, d.currency doc_currency, d.date doc_date, d.total doc_total FROM payment_allocations al
      JOIN documents d ON d.id=al.document_id WHERE al.payment_id=? ORDER BY al.id`, [id]);
    return p;
  }

  /** Void a payment: reverse its entry and reopen the documents it settled. */
  function voidPayment(db, id, date) {
    return db.tx(() => {
      const p = load(db, id);
      if (!p || p.status !== 'posted') throw E('bad_status', 'This payment is already void.');
      if (db.scalar('SELECT 1 FROM property_disbursements WHERE payment_id=?', [id]))
        throw E('kpr_disbursement_locked', 'This payment records a property KPR disbursement. Use a controlled correction.');
      if (db.scalar('SELECT 1 FROM instalment_allocations WHERE payment_id=?', [id]))
        throw E('instalment_payment_locked', 'This payment is allocated to an instalment schedule. Use a controlled instalment correction.');
      const active = db.scalar("SELECT count(*) FROM subscriptions s JOIN payment_allocations a ON a.document_id=s.invoice_id WHERE a.payment_id=? AND s.status='active'", [id]);
      if (active) throw E('subscription_started', 'A subscription paid by this payment has already started. Cancel it first or keep the payment.');
      if (db.scalar('SELECT count(*) FROM reconciliation_lines rl JOIN journal_lines l ON l.id=rl.journal_line_id WHERE l.entry_id=?', [p.journal_entry_id])) {
        throw E('reconciled', 'This payment is part of a finished bank reconciliation.');
      }
      Buku.posting.reverse(db, p.journal_entry_id, date && date > p.date ? date : p.date, 'Batal ' + p.number);
      db.run("UPDATE payments SET status='void', updated_at=? WHERE id=?", [now(), id]);
      for (const a of p.allocations) {
        db.run('UPDATE documents SET base_cleared=base_cleared-? WHERE id=?', [a.ar_base, a.document_id]);
        Buku.docs.refreshPaid(db, a.document_id);
      }
      if (p.bank_import_line_id) db.run("UPDATE bank_import_lines SET status='new', journal_entry_id=NULL WHERE id=?", [p.bank_import_line_id]);
      Buku.posting.audit(db, 'void', 'payments', id, p.number);
    });
  }

  /** PPh 23 a customer is expected to withhold on an amount applied to an invoice (2% of the DPP part). */
  function suggestedWithholding(db, invoice, applied) {
    const t = db.get("SELECT * FROM taxes WHERE kind='pph23' AND direction='withheld_by_customer' AND is_active=1 ORDER BY id LIMIT 1");
    if (!t || !invoice.total) return { amount: 0, tax: t };
    const c = invoice.contact_id ? db.get('SELECT withholds_pph23, is_individual FROM contacts WHERE id=?', [invoice.contact_id]) : null;
    if (c && (!c.withholds_pph23 || c.is_individual)) return { amount: 0, tax: t };
    const net = invoice.total - invoice.tax_total; // DPP before VAT
    const share = Number(Buku.money.divRound(BigInt(net) * BigInt(applied), BigInt(invoice.total)));
    return { amount: Buku.tax.amount(share, t), tax: t };
  }

  Buku.payments = { post, load, voidPayment, fundAccounts, suggestedWithholding };
})();
