/* Buku — the posting engine. The ONLY code that writes journal_entries / journal_lines.
   Rules: every posted entry balances in base currency (IDR); posted entries are immutable
   (enforced again by SQLite triggers); corrections happen by reversal. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, msg, details) => new Buku.BukuError(code, msg, details);

  function audit(db, action, table, id, summary) {
    db.run('INSERT INTO audit_log(at,action,table_name,record_id,summary) VALUES(?,?,?,?,?)', [Buku.util.nowIso(), action, table, id, summary || null]);
  }

  function lockDate(db) {
    return db.setting('lock_date') || null;
  }

  /**
   * Validate and compute an entry. Returns { entry, lines, debitBase, creditBase }.
   * opts.strict: require balance and complete lines (posting); drafts may be unbalanced.
   */
  function build(db, input, opts) {
    const strict = !!(opts && opts.strict);
    const base = Buku.fx.base(db);
    if (!Buku.util.isIsoDate(input.date)) throw E('invalid_date', 'Enter a valid date.');
    const lock = lockDate(db);
    if (strict && lock && input.date <= lock) throw E('period_locked', 'This date is on or before the lock date (' + lock + ').');

    if (strict && db.scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='period_closings'")) {
      const closed = db.scalar("SELECT 1 FROM period_closings WHERE period=? AND status='closed'", [input.date.slice(0,7)]);
      if (closed) throw E('period_closed', 'Accounting period ' + input.date.slice(0,7) + ' is closed. Reopen with a reason or post a valid current-period correction.');
    }

    // VAT closing protects only VAT-affecting postings; the general lock date is independent.
    if (strict && input.source_type !== 'ppn_close' && db.scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='tax_period_closings'")) {
      const closed = db.scalar('SELECT 1 FROM tax_period_closings WHERE masa=?', [input.date.slice(0, 7)]);
      if (closed && (input.lines || []).some(l => {
        const a = db.get('SELECT subtype FROM accounts WHERE id=?', [l.account_id]);
        return a && (a.subtype === 'tax_input' || a.subtype === 'tax_output');
      })) throw E('tax_period_closed', 'PPN period ' + input.date.slice(0, 7) + ' is closed. Use an allowed correction in an open period.');
    }
    const currency = input.currency || base;
    const cur = db.get('SELECT * FROM currencies WHERE code=?', [currency]);
    if (!cur) throw E('unknown_currency', 'Unknown currency ' + currency);
    if (!cur.is_enabled) throw E('currency_disabled', currency + ' is not enabled.');
    let rate = '1';
    if (currency !== base) {
      if (!input.rate) throw E('missing_rate', 'Enter the exchange rate for ' + currency + '.');
      rate = Buku.money.rateToString(input.rate);
    }

    const lines = [];
    (input.lines || []).forEach((l, i) => {
      const debit = Number(l.debit || 0);
      const credit = Number(l.credit || 0);
      if (!l.account_id && !debit && !credit) return; // empty row
      if (!Number.isInteger(debit) || !Number.isInteger(credit)) throw E('invalid_amount', 'Line ' + (i + 1) + ': invalid amount.', { line: i });
      if (debit < 0 || credit < 0) throw E('negative_amount', 'Line ' + (i + 1) + ': amounts cannot be negative.', { line: i });
      if (debit > 0 && credit > 0) throw E('both_sides', 'Line ' + (i + 1) + ': use either debit or credit, not both.', { line: i });
      if (!l.account_id) throw E('missing_account', 'Line ' + (i + 1) + ': choose an account.', { line: i });
      const acc = db.get('SELECT * FROM accounts WHERE id=?', [l.account_id]);
      if (!acc) throw E('unknown_account', 'Line ' + (i + 1) + ': account not found.', { line: i });
      if (acc.is_header) throw E('header_account', 'Line ' + (i + 1) + ': ' + acc.code + ' is a group account; choose an account under it.', { line: i });
      if (!acc.is_active) throw E('inactive_account', 'Line ' + (i + 1) + ': ' + acc.code + ' is inactive.', { line: i });
      const hasBase = l.base !== undefined && l.base !== null;
      if (strict && !debit && !credit && !hasBase) throw E('zero_line', 'Line ' + (i + 1) + ': enter a debit or credit amount.', { line: i });

      const lineCur = l.currency || currency;
      if (acc.currency && acc.currency !== lineCur) {
        throw E('currency_mismatch', 'Line ' + (i + 1) + ': ' + acc.code + ' only accepts ' + acc.currency + '.', { line: i });
      }
      let lineRate;
      if (lineCur === base) lineRate = '1';
      else if (lineCur === currency) lineRate = rate;
      else if (l.rate) lineRate = Buku.money.rateToString(l.rate);
      else throw E('missing_rate', 'Line ' + (i + 1) + ': enter the ' + lineCur + ' rate.', { line: i });
      const lc = db.get('SELECT * FROM currencies WHERE code=?', [lineCur]);
      if (!lc || !lc.is_enabled) throw E('currency_disabled', 'Line ' + (i + 1) + ': ' + lineCur + ' is not enabled.', { line: i });

      lines.push({
        account_id: acc.id,
        description: (l.description || '').trim() || null,
        contact_id: l.contact_id || null,
        currency: lineCur,
        rate: lineRate,
        debit,
        credit,
        debit_base: Buku.money.toBase(debit, lc.decimals, lineRate),
        credit_base: Buku.money.toBase(credit, lc.decimals, lineRate),
        _decimals: lc.decimals,
      });
      // Engine-generated entries (payments) may fix a line's IDR value exactly, e.g. the
      // receivable cleared at the invoice's original rate. Only whole non-negative rupiah allowed.
      if (l.base !== undefined && l.base !== null) {
        if (!Number.isInteger(l.base) || l.base < 0) throw E('invalid_amount', 'Line ' + (i + 1) + ': invalid base amount.', { line: i });
        const last = lines[lines.length - 1];
        const side = l.side || (debit > 0 ? 'debit' : 'credit');
        if (side === 'debit') { last.debit_base = l.base; last.credit_base = 0; } else { last.credit_base = l.base; last.debit_base = 0; }
        last._override = true;
      }
    });

    let debitBase = lines.reduce((s, l) => s + l.debit_base, 0);
    let creditBase = lines.reduce((s, l) => s + l.credit_base, 0);

    if (strict) {
      if (lines.length < 2) throw E('too_few_lines', 'An entry needs at least two lines.');
      if (!lines.some((l) => l.debit > 0 || l.debit_base > 0) || !lines.some((l) => l.credit > 0 || l.credit_base > 0)) throw E('one_sided', 'An entry needs at least one debit and one credit.');

      const currencies = new Set(lines.map((l) => l.currency + '@' + l.rate));
      const overridden = lines.some((l) => l._override);
      if (currencies.size === 1 && !overridden) {
        // Single currency at a single rate: must balance in that currency; absorb conversion rounding.
        const fd = lines.reduce((s, l) => s + l.debit, 0);
        const fc = lines.reduce((s, l) => s + l.credit, 0);
        if (fd !== fc) throw E('unbalanced', 'Debits and credits are not equal.', { difference: fd - fc, currency: lines[0].currency });
        const diff = debitBase - creditBase;
        if (diff !== 0) {
          if (Math.abs(diff) > lines.length) throw E('unbalanced', 'Rounding difference too large.', { difference: diff });
          // Put the rounding on the largest line of the smaller side so the entry balances exactly.
          const side = diff > 0 ? 'credit' : 'debit';
          const target = lines.filter((l) => l[side] > 0).sort((a, b) => b[side + '_base'] - a[side + '_base'])[0];
          target[side + '_base'] += Math.abs(diff);
          if (side === 'credit') creditBase += Math.abs(diff); else debitBase += Math.abs(diff);
        }
      } else if (debitBase !== creditBase) {
        throw E('unbalanced', 'The entry does not balance in IDR.', { difference: debitBase - creditBase, currency: base });
      }
    }

    const entry = {
      date: input.date,
      reference: (input.reference || '').trim() || null,
      memo: (input.memo || '').trim() || null,
      source_type: input.source_type || 'manual',
      source_id: input.source_id || null,
      ...(input.deal_id ? { deal_id: input.deal_id } : {}),
      currency,
      rate,
      total_base: debitBase,
    };
    return { entry, lines, debitBase, creditBase };
  }

  function writeLines(db, entryId, lines) {
    lines.forEach((l, i) => {
      db.insert('journal_lines', {
        entry_id: entryId, line_no: i + 1, account_id: l.account_id, description: l.description,
        contact_id: l.contact_id, currency: l.currency, rate: l.rate,
        debit: l.debit, credit: l.credit, debit_base: l.debit_base, credit_base: l.credit_base,
      });
    });
  }

  function numberExists(db) {
    return (n) => !!db.scalar('SELECT 1 FROM journal_entries WHERE number=?', [n]);
  }

  /** Save (or update) a draft. Returns the entry id. */
  function saveDraft(db, input) {
    const built = build(db, input, { strict: false });
    const now = Buku.util.nowIso();
    return db.tx(() => {
      let id = input.id;
      if (id) {
        const cur = db.get('SELECT status FROM journal_entries WHERE id=?', [id]);
        if (!cur) throw E('not_found', 'Entry not found.');
        if (cur.status !== 'draft') throw E('posted_entry_locked', 'Posted entries cannot be edited. Reverse it instead.');
        db.run('DELETE FROM journal_lines WHERE entry_id=?', [id]);
        db.update('journal_entries', id, Object.assign({}, built.entry, { updated_at: now }));
      } else {
        id = db.insert('journal_entries', Object.assign({}, built.entry, { status: 'draft', created_at: now, updated_at: now }));
      }
      writeLines(db, id, built.lines);
      return id;
    });
  }

  /** Validate strictly and post. input may carry an existing draft id. Returns { id, number }. */
  function post(db, input) {
    const built = build(db, input, { strict: true });
    const now = Buku.util.nowIso();
    return db.tx(() => {
      let id = input.id;
      if (id) {
        const cur = db.get('SELECT status FROM journal_entries WHERE id=?', [id]);
        if (!cur) throw E('not_found', 'Entry not found.');
        if (cur.status !== 'draft') throw E('posted_entry_locked', 'This entry is already posted.');
        db.run('DELETE FROM journal_lines WHERE entry_id=?', [id]);
        db.update('journal_entries', id, Object.assign({}, built.entry, { updated_at: now }));
      } else {
        id = db.insert('journal_entries', Object.assign({}, built.entry, { status: 'draft', created_at: now, updated_at: now }));
      }
      writeLines(db, id, built.lines);
      const seqType = input.sequence || (built.entry.source_type === 'opening' ? 'opening' : 'journal');
      const number = input.number || Buku.numbering.take(db, seqType, built.entry.date, {}, numberExists(db));
      db.run("UPDATE journal_entries SET status='posted', number=?, posted_at=?, updated_at=? WHERE id=?", [number, now, now, id]);
      assertBalanced(db, id);
      audit(db, 'post', 'journal_entries', id, number);
      return { id, number };
    });
  }

  /** Post an existing draft as-is. */
  function postDraft(db, id) {
    const e = load(db, id);
    if (!e) throw E('not_found', 'Entry not found.');
    return post(db, toInput(e));
  }

  function deleteDraft(db, id) {
    db.tx(() => {
      const cur = db.get('SELECT status FROM journal_entries WHERE id=?', [id]);
      if (!cur) throw E('not_found', 'Entry not found.');
      if (cur.status !== 'draft') throw E('posted_entry_locked', 'Posted entries cannot be deleted. Reverse it instead.');
      db.run('DELETE FROM journal_entries WHERE id=?', [id]);
      audit(db, 'delete_draft', 'journal_entries', id, null);
    });
  }

  /** Create a posted mirror entry that cancels `id`. Uses the original base amounts exactly. */
  function reverse(db, id, date, memo) {
    const now = Buku.util.nowIso();
    return db.tx(() => {
      const e = load(db, id);
      if (!e) throw E('not_found', 'Entry not found.');
      if (e.status !== 'posted') throw E('not_posted', 'Only posted entries can be reversed.');
      if (['property_cost','property_hpp','jv_contribution','jv_capital_return','jv_distribution','property_tax'].includes(e.source_type))
        throw E('property_event_locked', 'Property and JV accounting events cannot be reversed from the general journal. Use an approved adjustment workflow.');
      if (e.deal_id && ['deal_fund','deal_offset','deal_partner','deal_partner_payment','invoice'].includes(e.source_type))
        throw E('deal_event_locked', 'Deal financial events cannot be reversed from the general journal; use a controlled correcting workflow.');
      if (e.reversed_by_id) throw E('already_reversed', 'This entry has already been reversed.');
      if (e.reverses_id) throw E('is_reversal', 'This entry is itself a reversal.');
      date = date || Buku.util.today();
      if (!Buku.util.isIsoDate(date)) throw E('invalid_date', 'Enter a valid date.');
      if (date < e.date) throw E('reverse_before', 'The reversal date cannot be before the original entry.');
      const lock = lockDate(db);
      if (lock && date <= lock) throw E('period_locked', 'This date is on or before the lock date (' + lock + ').');
      if (db.scalar("SELECT 1 FROM period_closings WHERE period=? AND status='closed'", [date.slice(0,7)]))
        throw E('period_closed', 'Cannot reverse into a closed accounting period. Reopen with a reason.');
      if (db.scalar('SELECT 1 FROM tax_period_closings WHERE masa=?', [date.slice(0, 7)]) &&
        e.lines.some(l => ['tax_input','tax_output'].includes(db.scalar('SELECT subtype FROM accounts WHERE id=?', [l.account_id]))))
        throw E('tax_period_closed', 'Cannot reverse VAT into a closed VAT period. Choose an open correction period.');
      const rid = db.insert('journal_entries', {
        date, reference: e.number, memo: memo || 'Pembalik ' + e.number,
        source_type: e.source_type === 'manual' ? 'manual' : e.source_type, source_id: e.source_id,
        currency: e.currency, rate: e.rate, status: 'draft', reverses_id: e.id, total_base: e.total_base, ...(e.deal_id ? { deal_id:e.deal_id } : {}),
        created_at: now, updated_at: now,
      });
      writeLines(db, rid, e.lines.map((l) => ({
        account_id: l.account_id, description: l.description, contact_id: l.contact_id, currency: l.currency, rate: l.rate,
        debit: l.credit, credit: l.debit, debit_base: l.credit_base, credit_base: l.debit_base,
      })));
      const number = Buku.numbering.take(db, 'journal', date, {}, numberExists(db));
      db.run("UPDATE journal_entries SET status='posted', number=?, posted_at=?, updated_at=? WHERE id=?", [number, now, now, rid]);
      db.run('UPDATE journal_entries SET reversed_by_id=?, updated_at=? WHERE id=?', [rid, now, e.id]);
      assertBalanced(db, rid);
      audit(db, 'reverse', 'journal_entries', e.id, e.number + ' → ' + number);
      return { id: rid, number };
    });
  }

  function assertBalanced(db, id) {
    const r = db.get('SELECT sum(debit_base) d, sum(credit_base) c, count(*) n FROM journal_lines WHERE entry_id=?', [id]);
    if (!r || r.n < 2 || r.d !== r.c) throw E('integrity', 'Integrity check failed: entry does not balance.');
  }

  /** Load an entry with its lines (joined with account code/name). */
  function load(db, id) {
    const e = db.get('SELECT * FROM journal_entries WHERE id=?', [id]);
    if (!e) return null;
    e.lines = db.all(
      `SELECT l.*, a.code AS account_code, a.name AS account_name, a.name_en AS account_name_en, c.name AS contact_name
       FROM journal_lines l JOIN accounts a ON a.id=l.account_id LEFT JOIN contacts c ON c.id=l.contact_id
       WHERE l.entry_id=? ORDER BY l.line_no`, [id]);
    return e;
  }

  function toInput(e) {
    return {
      id: e.status === 'draft' ? e.id : undefined,
      date: e.date, reference: e.reference, memo: e.memo, currency: e.currency, rate: e.rate,
      source_type: e.source_type, source_id: e.source_id,
      lines: e.lines.map((l) => ({ account_id: l.account_id, description: l.description, contact_id: l.contact_id, currency: l.currency, rate: l.rate, debit: l.debit, credit: l.credit })),
    };
  }

  /**
   * Post opening balances. lines: [{ account_id, debit, credit, currency?, rate? }].
   * The difference goes to the Opening Balance Equity account automatically.
   */
  function postOpening(db, date, lines, memo) {
    const obe = db.get("SELECT id FROM accounts WHERE subtype='opening_balance' AND is_active=1 ORDER BY id LIMIT 1");
    if (!obe) throw E('no_obe', 'No Opening Balance Equity account found.');
    const base = Buku.fx.base(db);
    const clean = lines.filter((l) => l.account_id && (l.debit || l.credit));
    if (!clean.length) throw E('empty', 'Enter at least one opening balance.');
    // Compute base totals to find the balancing amount.
    const probe = build(db, { date, currency: base, lines: clean }, { strict: false });
    const diff = probe.debitBase - probe.creditBase;
    const all = clean.slice();
    if (diff > 0) all.push({ account_id: obe.id, credit: diff, currency: base, description: 'Ekuitas saldo awal' });
    if (diff < 0) all.push({ account_id: obe.id, debit: -diff, currency: base, description: 'Ekuitas saldo awal' });
    return post(db, { date, currency: base, source_type: 'opening', memo: memo || 'Saldo awal', lines: all });
  }

  Buku.posting = { build, saveDraft, post, postDraft, deleteDraft, reverse, load, toInput, postOpening, audit };
})();
