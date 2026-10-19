/* Buku — banking: transfers, quick spend/receive, statement import (BCA + any CSV), matching, reconciliation.
   Statement amounts are in the bank account's currency: positive = money in, negative = money out. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, msg, details) => new Buku.BukuError(code, msg, details);
  const U = () => Buku.util;
  const now = () => Buku.util.nowIso();

  function bankAccounts(db) {
    const bal = Buku.ledger.accountBalances(db);
    return db.all("SELECT * FROM accounts WHERE subtype IN ('bank','cash') AND is_header=0 ORDER BY is_active DESC, CASE subtype WHEN 'bank' THEN 0 ELSE 1 END, code")
      .map((a) => Object.assign(a, {
        cur: a.currency || Buku.fx.base(db),
        balance: bal.get(a.id) ? bal.get(a.id).base : 0,
        balance_foreign: bal.get(a.id) && a.currency ? bal.get(a.id).foreign : null,
        unmatched: db.scalar("SELECT count(*) FROM bank_import_lines WHERE account_id=? AND status='new'", [a.id]),
        last_rec: db.get('SELECT statement_date, statement_balance FROM reconciliations WHERE account_id=? ORDER BY statement_date DESC, id DESC LIMIT 1', [a.id]),
      }));
  }

  function curOf(db, accountId) {
    const a = db.get('SELECT * FROM accounts WHERE id=?', [accountId]);
    if (!a) throw E('not_found', 'Account not found.');
    return { acc: a, cur: a.currency || Buku.fx.base(db) };
  }

  function rateFor(db, cur, date, given) {
    if (cur === Buku.fx.base(db)) return '1';
    const r = given || (Buku.fx.lookup(db, cur, date) || {}).rate;
    if (!r) throw E('missing_rate', 'Enter the exchange rate for ' + cur + '.');
    return Buku.money.rateToString(r);
  }

  /** Move money between two bank/cash accounts. Cross-currency differences go to realized FX. */
  function transfer(db, input) {
    if (!U().isIsoDate(input.date)) throw E('invalid_date', 'Enter a valid date.');
    if (Number(input.from_id) === Number(input.to_id)) throw E('same_account', 'Choose two different accounts.');
    const f = curOf(db, input.from_id), t = curOf(db, input.to_id);
    const amountFrom = Number(input.amount_from), amountTo = Number(input.amount_to !== undefined && input.amount_to !== null && input.amount_to !== '' ? input.amount_to : input.amount_from);
    if (!(amountFrom > 0) || !(amountTo > 0)) throw E('invalid_amount', 'Enter the amount.');
    if (f.cur === t.cur && amountFrom !== amountTo) throw E('invalid_amount', 'Same-currency transfers move the same amount.');
    const fee = Number(input.fee || 0);
    const rf = rateFor(db, f.cur, input.date, input.rate_from), rt = rateFor(db, t.cur, input.date, input.rate_to);
    const toB = (v, c, r) => Buku.money.toBase(v, Buku.fx.decimals(db, c), r);
    const lines = [
      { account_id: t.acc.id, debit: amountTo, currency: t.cur, rate: rt, description: input.memo || null },
      { account_id: f.acc.id, credit: amountFrom, currency: f.cur, rate: rf, description: input.memo || null },
    ];
    if (fee) {
      const feeAcc = Buku.docs.accountBySubtype(db, 'other_expense');
      lines.push({ account_id: feeAcc.id, debit: fee, currency: f.cur, rate: rf, description: 'Biaya transfer' });
      lines.push({ account_id: f.acc.id, credit: fee, currency: f.cur, rate: rf, description: 'Biaya transfer' });
    }
    const diff = toB(amountTo, t.cur, rt) - toB(amountFrom, f.cur, rf);
    if (diff !== 0) {
      const fx = Buku.docs.accountBySubtype(db, 'fx_realized');
      lines.push(Object.assign({ account_id: fx.id, currency: Buku.fx.base(db), description: 'Selisih kurs transfer' }, diff > 0 ? { credit: diff } : { debit: -diff }));
    }
    return db.tx(() => {
      const r = Buku.posting.post(db, { date: input.date, currency: Buku.fx.base(db), memo: input.memo || ('Transfer ' + f.acc.name + ' → ' + t.acc.name), reference: input.reference, source_type: 'transfer', lines });
      if (input.bank_import_line_id) db.run("UPDATE bank_import_lines SET status='created', journal_entry_id=? WHERE id=?", [r.id, input.bank_import_line_id]);
      return r;
    });
  }

  /**
   * Quick money in/out with any counter-account (bank interest, owner top-up, reimbursement settlement…).
   * input: { direction, date, account_id (bank), amount, counter_account_id, contact_id, memo, reference, tax_id (optional PPN on spend) }
   */
  function spendReceive(db, input) {
    const { acc, cur } = curOf(db, input.account_id);
    const amount = Number(input.amount);
    if (!(amount > 0)) throw E('invalid_amount', 'Enter the amount.');
    if (!input.counter_account_id) throw E('missing_account', 'Choose what the money is for.');
    const rate = rateFor(db, cur, input.date, input.rate);
    const counter = db.get('SELECT * FROM accounts WHERE id=?', [input.counter_account_id]);
    const lines = [];
    let net = amount, tax = 0, taxAcc = null;
    if (input.tax_id) {
      const t = db.get('SELECT * FROM taxes WHERE id=?', [input.tax_id]);
      if (t && t.account_id && (t.kind === 'ppn_in' || t.kind === 'ppn_out')) {
        // Amount is tax-inclusive: split out the VAT.
        const effNum = BigInt(t.base_num) * Buku.money.parseRate(t.rate);
        const den = BigInt(t.base_den) * 100000000n;
        net = Number(Buku.money.divRound(BigInt(amount) * den, den + effNum));
        tax = amount - net;
        taxAcc = t.account_id;
      }
    }
    const ccur = counter.currency || cur;
    if (counter.currency && counter.currency !== cur) throw E('currency_mismatch', 'The counter-account only accepts ' + counter.currency + '.');
    const desc = input.memo || null;
    if (input.direction === 'in') {
      lines.push({ account_id: acc.id, debit: amount, currency: cur, rate, contact_id: input.contact_id || null, description: desc });
      lines.push({ account_id: counter.id, credit: net, currency: ccur, rate, contact_id: input.contact_id || null, description: desc });
      if (tax) lines.push({ account_id: taxAcc, credit: tax, currency: cur, rate, description: 'PPN' });
    } else {
      lines.push({ account_id: counter.id, debit: net, currency: ccur, rate, contact_id: input.contact_id || null, description: desc });
      if (tax) lines.push({ account_id: taxAcc, debit: tax, currency: cur, rate, description: 'PPN' });
      lines.push({ account_id: acc.id, credit: amount, currency: cur, rate, contact_id: input.contact_id || null, description: desc });
    }
    return db.tx(() => {
      const r = Buku.posting.post(db, { date: input.date, currency: cur, rate, memo: input.memo || (input.direction === 'in' ? 'Penerimaan lain' : 'Pengeluaran lain'), reference: input.reference, source_type: input.direction === 'in' ? 'receive' : 'spend', lines });
      if (input.bank_import_line_id) db.run("UPDATE bank_import_lines SET status='created', journal_entry_id=? WHERE id=?", [r.id, input.bank_import_line_id]);
      return r;
    });
  }

  // ---------------- Statement parsing ----------------
  /** Parse an amount like "1,500,000.00", "1.500.000,00", "-250.000", "1,500,000.00 CR". Returns { minor, sign } with decimals. */
  function parseStatementAmount(text, decimals) {
    let s = String(text || '').trim().replace(/^'/, '');
    if (!s) return null;
    let sign = 1;
    if (/\bDB\b|\bD$|\bDR\b|^-|\(.*\)/i.test(s)) sign = -1;
    if (/\bCR\b|\bK$/i.test(s)) sign = 1;
    s = s.replace(/\b(CR|DB|DR|D|K)\b/gi, '').replace(/[()\s+-]/g, '').replace(/^(Rp|IDR|USD|SGD)/i, '');
    if (!s) return null;
    // Decide the decimal separator: the last of . or , followed by 1–2 digits at the end.
    const m = s.match(/[.,](\d{1,2})$/);
    let intPart = s, frac = '';
    if (m) { intPart = s.slice(0, s.length - m[0].length); frac = m[1]; }
    intPart = intPart.replace(/[.,]/g, '');
    if (!/^\d+$/.test(intPart || '0') || !/^\d*$/.test(frac)) return null;
    const d = decimals || 0;
    let minor = BigInt(intPart || '0') * 10n ** BigInt(d);
    if (d > 0 && frac) minor += BigInt((frac + '00').slice(0, d));
    if (d === 0 && frac && Number(frac[0]) >= 5) minor += 1n;
    return Number(minor) * sign;
  }

  function parseDate(text, fmt, fallbackYear) {
    let s = String(text || '').trim().replace(/^'/, '');
    if (!s) return null;
    let y, m, d;
    let mm;
    if ((mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = mm[1]; m = mm[2]; d = mm[3]; }
    else if ((mm = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/))) {
      if (fmt === 'mdy') { m = mm[1]; d = mm[2]; } else { d = mm[1]; m = mm[2]; }
      y = mm[3] || fallbackYear;
      if (y && String(y).length === 2) y = '20' + y;
    } else return null;
    if (!y) return null;
    const iso = y + '-' + U().pad(Number(m)) + '-' + U().pad(Number(d));
    return U().isIsoDate(iso) ? iso : null;
  }

  /**
   * BCA statement (KlikBCA / KlikBCA Bisnis CSV). Tolerant of the common layouts:
   * header lines (No. rekening, Periode dd/mm/yyyy - dd/mm/yyyy), then
   * Tanggal Transaksi, Keterangan, Cabang, Jumlah ("1,500,000.00 CR"/"DB"), Saldo — or separate Mutasi/Debet/Kredit columns.
   */
  function parseBCA(text, decimals) {
    const rows = U().parseCsv(text);
    const all = String(text);
    const per = all.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const year = per ? per[3] : String(new Date().getFullYear());
    const startMonth = per ? Number(per[2]) : null;
    const hi = rows.findIndex((r) => r.some((c) => /tanggal/i.test(c)) && r.some((c) => /keterangan/i.test(c)));
    if (hi < 0) throw E('statement_format', 'This does not look like a BCA statement (no “Tanggal” and “Keterangan” columns).');
    const head = rows[hi].map((c) => c.trim().toLowerCase());
    const col = (re) => head.findIndex((c) => re.test(c));
    const cDate = col(/tanggal/), cDesc = col(/keterangan/), cAmt = col(/^jumlah|^mutasi|^nominal/), cDb = col(/debet|debit/), cCr = col(/kredit|credit/), cBal = col(/saldo/), cDir = col(/^(db\/cr|d\/k|cr\/db)$/);
    // KlikBCA puts CR/DB in an unnamed column right after the amount.
    const cDirX = cDir >= 0 ? cDir : cAmt >= 0 && head[cAmt + 1] === '' ? cAmt + 1 : -1;
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const first = (r[cDate] || '').trim();
      if (/saldo|mutasi|^total/i.test(first) || /saldo awal|saldo akhir|mutasi (kredit|debet)/i.test(r.join(' '))) continue;
      let date;
      if (/^'?pend/i.test(first)) date = null; else date = parseDate(first, 'dmy', year);
      if (!date) continue;
      // Statement spanning a year end (Dec → Jan): months before the period start belong to next year.
      if (startMonth && Number(date.slice(5, 7)) < startMonth && !/\d{4}/.test(first)) date = (Number(year) + 1) + date.slice(4);
      let amount = null;
      if (cAmt >= 0) {
        amount = parseStatementAmount((r[cAmt] || '') + (cDirX >= 0 ? ' ' + (r[cDirX] || '') : ''), decimals);
      } else if (cDb >= 0 || cCr >= 0) {
        const db_ = cDb >= 0 ? parseStatementAmount(r[cDb], decimals) : null;
        const cr = cCr >= 0 ? parseStatementAmount(r[cCr], decimals) : null;
        if (cr) amount = Math.abs(cr); else if (db_) amount = -Math.abs(db_);
      }
      if (!amount) continue;
      out.push({ date, description: (r[cDesc] || '').replace(/\s+/g, ' ').trim(), amount, balance: cBal >= 0 ? parseStatementAmount(r[cBal], decimals) : null });
    }
    if (!out.length) throw E('statement_empty', 'No transactions found in this file.');
    return out;
  }

  /**
   * Generic CSV with a column mapping. map: { date, description, amount | debit + credit, balance, dateFormat: 'dmy'|'mdy'|'ymd', skip }
   * (indexes are 0-based). Amount columns may use either decimal convention.
   */
  function parseGeneric(text, map, decimals) {
    const rows = U().parseCsv(text).slice(Number(map.skip || 0));
    const out = [];
    for (const r of rows) {
      const date = parseDate(r[map.date], map.dateFormat || 'dmy', null);
      if (!date) continue;
      let amount = null;
      if (map.amount !== undefined && map.amount !== '' && map.amount !== null) amount = parseStatementAmount(r[map.amount], decimals);
      else {
        const dbv = map.debit !== undefined && map.debit !== '' ? parseStatementAmount(r[map.debit], decimals) : null;
        const crv = map.credit !== undefined && map.credit !== '' ? parseStatementAmount(r[map.credit], decimals) : null;
        if (crv) amount = Math.abs(crv); else if (dbv) amount = -Math.abs(dbv);
      }
      if (!amount) continue;
      out.push({ date, description: (r[map.description] || '').trim(), amount, balance: map.balance !== undefined && map.balance !== '' ? parseStatementAmount(r[map.balance], decimals) : null });
    }
    if (!out.length) throw E('statement_empty', 'No transactions found with this column mapping.');
    return out;
  }

  /** Save parsed rows; duplicates (same date, amount, description, balance) are skipped. */
  function importRows(db, accountId, rows, meta) {
    return db.tx(() => {
      const imp = db.insert('bank_imports', { account_id: accountId, file_name: meta && meta.fileName || null, preset: meta && meta.preset || null, line_count: 0, imported_at: now() });
      let added = 0, dup = 0;
      const seen = new Map();
      for (const r of rows) {
        // Same transaction twice on one day is legitimate; number repeats within the file.
        const key = [r.date, r.amount, r.description, r.balance === null || r.balance === undefined ? '' : r.balance].join('|');
        const n = (seen.get(key) || 0) + 1;
        seen.set(key, n);
        const hash = key + '#' + n;
        if (db.scalar('SELECT 1 FROM bank_import_lines WHERE account_id=? AND hash=?', [accountId, hash])) { dup++; continue; }
        db.insert('bank_import_lines', { import_id: imp, account_id: accountId, date: r.date, description: r.description, amount: r.amount, balance: r.balance === undefined ? null : r.balance, hash });
        added++;
      }
      db.run('UPDATE bank_imports SET line_count=? WHERE id=?', [added, imp]);
      return { importId: imp, added, duplicates: dup };
    });
  }

  // ---------------- Matching ----------------
  /** Candidate matches for one statement line, best first. */
  function suggestions(db, lineId) {
    const line = db.get('SELECT * FROM bank_import_lines WHERE id=?', [lineId]);
    if (!line) throw E('not_found', 'Statement line not found.');
    const { cur } = curOf(db, line.account_id);
    const amt = Math.abs(line.amount);
    const desc = (line.description || '').toUpperCase();
    const out = [];

    // Already recorded in the books (posted, not yet reconciled, same amount, ±10 days).
    const existing = db.all(`SELECT l.id line_id, e.id entry_id, e.number, e.date, e.memo FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
      WHERE e.status='posted' AND l.account_id=? AND ${line.amount > 0 ? 'l.debit' : 'l.credit'}=? AND e.date BETWEEN ? AND ?
      AND NOT EXISTS (SELECT 1 FROM bank_import_lines b WHERE b.journal_entry_id=e.id AND b.account_id=l.account_id)
      ORDER BY abs(julianday(e.date)-julianday(?)) LIMIT 5`, [line.account_id, amt, U().addDays(line.date, -10), U().addDays(line.date, 10), line.date]);
    existing.forEach((x) => out.push({ type: 'existing', score: 90 - Math.abs((new Date(x.date) - new Date(line.date)) / 86400000), entry_id: x.entry_id, label: x.number + ' · ' + (x.memo || ''), date: x.date }));

    if (line.amount > 0) {
      const inv = db.all(`SELECT d.*, c.name contact_name FROM documents d JOIN contacts c ON c.id=d.contact_id WHERE d.doc_type='invoice' AND d.status IN ('open','partial') AND d.currency=?`, [cur]);
      for (const d of inv) {
        const bal = Buku.docs.balance(d);
        const wt = Buku.payments.suggestedWithholding(db, d, bal).amount;
        const numberHit = d.number && desc.includes(d.number.toUpperCase());
        const nameHit = d.contact_name && desc.includes(d.contact_name.toUpperCase().replace(/^(PT|CV)\.?\s+/, '').split(' ')[0]);
        if (amt === bal) out.push({ type: 'invoice', score: 80 + (numberHit ? 15 : 0) + (nameHit ? 5 : 0), document_id: d.id, withholding: 0, label: d.number + ' · ' + d.contact_name, applied: bal });
        else if (wt && amt === bal - wt) out.push({ type: 'invoice', score: 78 + (numberHit ? 15 : 0) + (nameHit ? 5 : 0), document_id: d.id, withholding: wt, label: d.number + ' · ' + d.contact_name + ' (−PPh 23)', applied: bal });
        else if (numberHit && amt < bal) out.push({ type: 'invoice', score: 60, document_id: d.id, withholding: 0, label: d.number + ' · ' + d.contact_name + ' (partial)', applied: amt, partial: true });
      }
    } else {
      const bills = db.all(`SELECT d.*, c.name contact_name FROM documents d JOIN contacts c ON c.id=d.contact_id WHERE d.doc_type='bill' AND d.status IN ('open','partial') AND d.currency=?`, [cur]);
      for (const d of bills) {
        const bal = Buku.docs.balance(d);
        const hit = (d.vendor_invoice_no && desc.includes(d.vendor_invoice_no.toUpperCase())) || (d.number && desc.includes(d.number.toUpperCase()));
        if (amt === bal) out.push({ type: 'bill', score: 80 + (hit ? 15 : 0), document_id: d.id, label: (d.vendor_invoice_no || d.number) + ' · ' + d.contact_name, applied: bal });
      }
    }
    // Rules.
    const rules = db.all("SELECT r.*, a.code, a.name account_name FROM bank_rules r JOIN accounts a ON a.id=r.account_id WHERE r.is_active=1 ORDER BY length(r.pattern) DESC");
    for (const r of rules) {
      if (r.direction === 'in' && line.amount < 0) continue;
      if (r.direction === 'out' && line.amount > 0) continue;
      if (desc.includes(r.pattern.toUpperCase())) out.push({ type: 'rule', score: 70, rule_id: r.id, account_id: r.account_id, contact_id: r.contact_id, memo: r.memo, label: r.pattern + ' → ' + r.code + ' ' + r.account_name });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  function matchExisting(db, lineId, entryId) {
    db.tx(() => {
      const line = db.get('SELECT * FROM bank_import_lines WHERE id=?', [lineId]);
      if (!line || line.status !== 'new') throw E('bad_status', 'This statement line is already handled.');
      const ok = db.scalar("SELECT count(*) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.id=? AND e.status='posted' AND l.account_id=?", [entryId, line.account_id]);
      if (!ok) throw E('mismatch', 'That entry does not touch this bank account.');
      db.run("UPDATE bank_import_lines SET status='matched', journal_entry_id=? WHERE id=?", [entryId, lineId]);
    });
  }

  function ignore(db, lineId, undo) {
    db.tx(() => db.run('UPDATE bank_import_lines SET status=? WHERE id=? AND status IN (\'new\',\'ignored\')', [undo ? 'new' : 'ignored', lineId]));
  }

  function unmatch(db, lineId) {
    db.tx(() => {
      const line = db.get('SELECT * FROM bank_import_lines WHERE id=?', [lineId]);
      if (line.status !== 'matched') throw E('bad_status', 'Only matched lines can be unmatched. Void the payment or reverse the entry instead.');
      db.run("UPDATE bank_import_lines SET status='new', journal_entry_id=NULL WHERE id=?", [lineId]);
    });
  }

  /** Apply the best rule to every new line that has one (creates spend/receive entries). Returns count. */
  function applyRules(db, accountId) {
    let n = 0;
    db.tx(() => {
      const lines = db.all("SELECT * FROM bank_import_lines WHERE account_id=? AND status='new' ORDER BY date", [accountId]);
      for (const l of lines) {
        const best = suggestions(db, l.id)[0];
        if (!best || best.type !== 'rule') continue;
        spendReceive(db, { direction: l.amount > 0 ? 'in' : 'out', date: l.date, account_id: accountId, amount: Math.abs(l.amount), counter_account_id: best.account_id, contact_id: best.contact_id, memo: best.memo || l.description, bank_import_line_id: l.id });
        n++;
      }
    });
    return n;
  }

  function addRule(db, rule) {
    if (!rule.pattern || !rule.account_id) throw E('required', 'Enter the text to look for and the account.');
    return db.tx(() => db.insert('bank_rules', { pattern: rule.pattern.trim(), direction: rule.direction || 'any', account_id: rule.account_id, contact_id: rule.contact_id || null, memo: rule.memo || null, created_at: now() }));
  }

  // ---------------- Reconciliation ----------------
  /** Amount of a journal line in the account's own currency (positive = money in). */
  function lineAmount(l) { return l.debit - l.credit; }

  function clearedBalance(db, accountId) {
    return db.scalar('SELECT coalesce(sum(l.debit - l.credit),0) FROM journal_lines l JOIN reconciliation_lines rl ON rl.journal_line_id=l.id WHERE l.account_id=?', [accountId]);
  }

  function uncleared(db, accountId, upto) {
    return db.all(`SELECT l.*, e.date, e.number, e.memo, e.id entry_id,
      (SELECT b.id FROM bank_import_lines b WHERE b.journal_entry_id=e.id AND b.account_id=l.account_id LIMIT 1) import_line_id
      FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
      WHERE l.account_id=? AND e.status='posted' AND e.date<=? AND NOT EXISTS (SELECT 1 FROM reconciliation_lines rl WHERE rl.journal_line_id=l.id)
      AND (l.debit<>0 OR l.credit<>0) ORDER BY e.date, e.id`, [accountId, upto]);
  }

  /** Finish a reconciliation: cleared lines must bring the cleared balance exactly to the statement balance. */
  function reconcile(db, accountId, statementDate, statementBalance, lineIds) {
    return db.tx(() => {
      if (!U().isIsoDate(statementDate)) throw E('invalid_date', 'Enter the statement date.');
      const prev = db.get('SELECT statement_date FROM reconciliations WHERE account_id=? ORDER BY statement_date DESC LIMIT 1', [accountId]);
      if (prev && statementDate < prev.statement_date) throw E('rec_order', 'This date is before the last reconciliation (' + prev.statement_date + ').');
      const opening = clearedBalance(db, accountId);
      let sum = 0;
      const valid = new Set(uncleared(db, accountId, statementDate).map((l) => l.id));
      for (const id of lineIds) {
        if (!valid.has(Number(id))) throw E('bad_line', 'A selected line cannot be cleared.');
        const l = db.get('SELECT * FROM journal_lines WHERE id=?', [id]);
        sum += lineAmount(l);
      }
      const diff = statementBalance - (opening + sum);
      if (diff !== 0) throw E('rec_difference', 'The cleared items differ from the statement.', { difference: diff });
      const rid = db.insert('reconciliations', { account_id: accountId, statement_date: statementDate, statement_balance: statementBalance, status: 'finished', created_at: now() });
      for (const id of lineIds) db.insert('reconciliation_lines', { reconciliation_id: rid, journal_line_id: Number(id) });
      Buku.posting.audit(db, 'reconcile', 'accounts', accountId, statementDate);
      return rid;
    });
  }

  /** Undo the latest reconciliation of an account. */
  function undoReconciliation(db, accountId) {
    db.tx(() => {
      const last = db.get('SELECT * FROM reconciliations WHERE account_id=? ORDER BY statement_date DESC, id DESC LIMIT 1', [accountId]);
      if (!last) throw E('not_found', 'Nothing to undo.');
      db.run('DELETE FROM reconciliations WHERE id=?', [last.id]);
    });
  }

  Buku.banking = {
    bankAccounts, transfer, spendReceive, parseStatementAmount, parseDate, parseBCA, parseGeneric, importRows, suggestions, matchExisting, ignore, unmatch,
    applyRules, addRule, clearedBalance, uncleared, reconcile, undoReconciliation,
  };
})();
