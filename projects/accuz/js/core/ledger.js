/* Buku — ledger queries: balances, trial balance, P&L, balance sheet, general ledger, integrity.
   All report figures are in base currency (IDR) from posted entries only. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const DEBIT_NORMAL = { asset: true, expense: true, liability: false, equity: false, income: false };

  function accounts(db, includeInactive) {
    return db.all('SELECT * FROM accounts ' + (includeInactive ? '' : 'WHERE is_active=1 ') + 'ORDER BY code');
  }

  /** Map account_id → { d, c, fd, fc } for posted lines with from <= date <= to (either bound optional). */
  // Year-end closing entries move the year's result into retained earnings. Profit & loss views leave them out
  // (otherwise a closed year shows zero revenue and profit); balance-sheet views keep them.
  const NOT_CLOSING = "e.source_type <> 'year_end'";

  function sums(db, from, to, opts) {
    const where = ["e.status='posted'"];
    if (opts && opts.excludeClosing) where.push(NOT_CLOSING);
    const params = [];
    if (from) { where.push('e.date >= ?'); params.push(from); }
    if (to) { where.push('e.date <= ?'); params.push(to); }
    const rows = db.all(
      `SELECT l.account_id id, sum(l.debit_base) d, sum(l.credit_base) c, sum(l.debit) fd, sum(l.credit) fc
       FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
       WHERE ${where.join(' AND ')} GROUP BY l.account_id`, params);
    const m = new Map();
    for (const r of rows) m.set(r.id, r);
    return m;
  }

  function depthMap(accs) {
    const byId = new Map(accs.map((a) => [a.id, a]));
    const depth = new Map();
    const d = (a) => {
      if (depth.has(a.id)) return depth.get(a.id);
      const p = a.parent_id ? byId.get(a.parent_id) : null;
      const v = p ? d(p) + 1 : 0;
      depth.set(a.id, v);
      return v;
    };
    accs.forEach(d);
    return depth;
  }

  /** Top-level ancestor for each account. */
  function rootMap(accs) {
    const byId = new Map(accs.map((a) => [a.id, a]));
    const root = new Map();
    for (const a of accs) {
      let r = a, guard = 0;
      while (r.parent_id && byId.has(r.parent_id) && guard++ < 50) r = byId.get(r.parent_id);
      root.set(a.id, r);
    }
    return root;
  }

  /**
   * Turn per-account values (array of numbers per account id) into ordered tree rows with header roll-ups.
   * subset: accounts to include (already ordered by code).
   */
  function tree(subset, values, ncols, hideZero) {
    const byId = new Map(subset.map((a) => [a.id, a]));
    const rolled = new Map(subset.map((a) => [a.id, (values.get(a.id) || new Array(ncols).fill(0)).slice()]));
    // Roll up children into parents, deepest first.
    const depth = depthMap(subset);
    const order = subset.slice().sort((a, b) => depth.get(b.id) - depth.get(a.id));
    for (const a of order) {
      if (a.parent_id && byId.has(a.parent_id)) {
        const p = rolled.get(a.parent_id), v = rolled.get(a.id);
        for (let i = 0; i < ncols; i++) p[i] += v[i];
      }
    }
    return subset
      .map((a) => ({ account: a, depth: depth.get(a.id), values: rolled.get(a.id), is_header: !!a.is_header }))
      .filter((r) => !hideZero || r.values.some((v) => v !== 0) || (r.is_header && r.depth === 0));
  }

  // ---------- Trial balance ----------
  function trialBalance(db, asOf, opts) {
    opts = opts || {};
    const accs = accounts(db, true).filter((a) => !a.is_header);
    const s = sums(db, opts.from || null, asOf);
    const rows = [];
    let td = 0, tc = 0;
    for (const a of accs) {
      const v = s.get(a.id);
      const net = v ? v.d - v.c : 0;
      if (!net && !opts.showZero) continue;
      const debit = net > 0 ? net : 0, credit = net < 0 ? -net : 0;
      td += debit; tc += credit;
      rows.push({ account: a, debit, credit, movement_d: v ? v.d : 0, movement_c: v ? v.c : 0 });
    }
    return { rows, totalDebit: td, totalCredit: tc, balanced: td === tc };
  }

  // ---------- Profit & loss ----------
  const SECTION_ORDER = ['pl_revenue', 'pl_cogs', 'pl_opex', 'pl_other', 'pl_tax'];
  const COST_SECTIONS = new Set(['pl_cogs', 'pl_opex', 'pl_tax']);
  const SUBTOTAL_AFTER = { pl_cogs: 'gross_profit', pl_opex: 'operating_profit', pl_other: 'profit_before_tax' };

  /** periods: [{ from, to, label }]. Returns { columns, blocks: [{ type:'section'|'subtotal', ... }], net: [] } */
  function profitLoss(db, periods, opts) {
    opts = opts || {};
    const all = accounts(db, true).filter((a) => a.type === 'income' || a.type === 'expense');
    const roots = rootMap(all);
    const n = periods.length;
    const values = new Map(); // credit-positive (income +, expense −)
    periods.forEach((p, i) => {
      const s = sums(db, p.from, p.to, { excludeClosing: true });
      for (const a of all) {
        const v = s.get(a.id);
        if (!values.has(a.id)) values.set(a.id, new Array(n).fill(0));
        values.get(a.id)[i] = v ? v.c - v.d : 0;
      }
    });
    const tops = all.filter((a) => !a.parent_id || !all.some((x) => x.id === a.parent_id));
    const sectionOf = (top) => (SECTION_ORDER.includes(top.section) ? top.section : top.type === 'income' ? (top.section || 'pl_other') : (top.section || 'pl_opex'));
    tops.sort((a, b) => SECTION_ORDER.indexOf(sectionOf(a)) - SECTION_ORDER.indexOf(sectionOf(b)) || a.code.localeCompare(b.code));

    const blocks = [];
    const running = new Array(n).fill(0);
    tops.forEach((top, idx) => {
      const section = sectionOf(top);
      const subset = all.filter((a) => roots.get(a.id).id === top.id);
      const sign = COST_SECTIONS.has(section) ? -1 : 1; // display costs as positive numbers
      const full = tree(subset, values, n, false);
      const total = full.find((r) => r.account.id === top.id).values.slice();
      const rows = tree(subset, values, n, !opts.showZero).map((r) => Object.assign(r, { display: r.values.map((v) => v * sign) }));
      for (let i = 0; i < n; i++) running[i] += total[i];
      blocks.push({ type: 'section', section, top, rows, total: total.map((v) => v * sign) });
      const next = tops[idx + 1];
      const key = SUBTOTAL_AFTER[section];
      if (key && (!next || sectionOf(next) !== section)) blocks.push({ type: 'subtotal', key, values: running.slice() });
    });
    blocks.push({ type: 'subtotal', key: 'net_profit', values: running.slice(), final: true });
    return { columns: periods, blocks, net: running.slice() };
  }

  /** Net profit (credit-positive) for a date range — used by the balance sheet. */
  /** Profit for a period as the P&L shows it. opts.includeClosing: also count year-end closing entries (balance sheet). */
  function netProfit(db, from, to, opts) {
    const where = ["e.status='posted'", "a.type IN ('income','expense')"];
    if (!(opts && opts.includeClosing)) where.push(NOT_CLOSING);
    const params = [];
    if (from) { where.push('e.date >= ?'); params.push(from); }
    if (to) { where.push('e.date <= ?'); params.push(to); }
    return db.scalar(
      `SELECT coalesce(sum(l.credit_base - l.debit_base),0) FROM journal_lines l
       JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id WHERE ${where.join(' AND ')}`, params);
  }

  // ---------- Balance sheet ----------
  function balanceSheet(db, dates, opts) {
    opts = opts || {};
    const fyMonth = db.scalar('SELECT fiscal_year_start_month FROM company WHERE id=1') || 1;
    const all = accounts(db, true).filter((a) => a.type === 'asset' || a.type === 'liability' || a.type === 'equity');
    const roots = rootMap(all);
    const n = dates.length;
    const values = new Map();
    const extras = { current: [], prior: [] };
    dates.forEach((asOf, i) => {
      const s = sums(db, null, asOf);
      for (const a of all) {
        const v = s.get(a.id);
        if (!values.has(a.id)) values.set(a.id, new Array(n).fill(0));
        const net = v ? v.d - v.c : 0;
        values.get(a.id)[i] = a.type === 'asset' ? net : -net;
      }
      const fy = Buku.util.fiscalYearStart(asOf, fyMonth);
      // Balance sheet: profit not yet moved to retained earnings (closing entries included).
      extras.current[i] = netProfit(db, fy, asOf, { includeClosing: true });
      extras.prior[i] = netProfit(db, null, Buku.util.addDays(fy, -1), { includeClosing: true });
    });
    const group = (type) => {
      const tops = all.filter((a) => a.type === type && (!a.parent_id || !all.some((x) => x.id === a.parent_id)));
      return tops.map((top) => {
        const subset = all.filter((a) => roots.get(a.id).id === top.id);
        const full = tree(subset, values, n, false);
        const rows = tree(subset, values, n, !opts.showZero);
        return { top, rows, total: full.find((r) => r.account.id === top.id).values.slice() };
      });
    };
    const sumGroups = (gs) => gs.reduce((acc, g) => acc.map((v, i) => v + g.total[i]), new Array(n).fill(0));
    const assets = group('asset'), liabilities = group('liability'), equity = group('equity');
    const totalAssets = sumGroups(assets), totalLiabilities = sumGroups(liabilities);
    const totalEquity = sumGroups(equity).map((v, i) => v + extras.current[i] + extras.prior[i]);
    const totalLE = totalLiabilities.map((v, i) => v + totalEquity[i]);
    return {
      dates, assets, liabilities, equity,
      currentProfit: extras.current, priorProfit: extras.prior,
      totalAssets, totalLiabilities, totalEquity, totalLE,
      difference: totalAssets.map((v, i) => v - totalLE[i]),
    };
  }

  // ---------- General ledger ----------
  function generalLedger(db, accountId, from, to) {
    const acc = db.get('SELECT * FROM accounts WHERE id=?', [accountId]);
    if (!acc) throw new Buku.BukuError('not_found', 'Account not found.');
    const ids = [acc.id];
    if (acc.is_header) {
      // Headers show all lines of their descendants.
      const all = db.all('SELECT id, parent_id FROM accounts');
      let frontier = [acc.id];
      while (frontier.length) {
        const kids = all.filter((a) => frontier.includes(a.parent_id)).map((a) => a.id);
        ids.push(...kids);
        frontier = kids;
      }
    }
    const ph = ids.map(() => '?').join(',');
    const sign = DEBIT_NORMAL[acc.type] ? 1 : -1;
    const foreign = acc.currency && acc.currency !== Buku.fx.base(db) ? acc.currency : null;
    const open = from
      ? db.get(`SELECT coalesce(sum(l.debit_base-l.credit_base),0) b, coalesce(sum(l.debit-l.credit),0) f FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
                WHERE e.status='posted' AND l.account_id IN (${ph}) AND e.date < ?`, ids.concat([from]))
      : { b: 0, f: 0 };
    const params = ids.slice();
    let where = `e.status='posted' AND l.account_id IN (${ph})`;
    if (from) { where += ' AND e.date >= ?'; params.push(from); }
    if (to) { where += ' AND e.date <= ?'; params.push(to); }
    const lines = db.all(
      `SELECT l.*, e.date, e.number, e.memo, e.reference, e.source_type, e.id entry_id, a.code account_code, a.name account_name, c.name contact_name
       FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id LEFT JOIN contacts c ON c.id=l.contact_id
       WHERE ${where} ORDER BY e.date, e.id, l.line_no`, params);
    let run = open.b * sign, runF = open.f * sign;
    let td = 0, tc = 0;
    for (const l of lines) {
      run += (l.debit_base - l.credit_base) * sign;
      if (foreign) runF += (l.debit - l.credit) * sign;
      l.balance = run;
      l.balance_foreign = runF;
      td += l.debit_base; tc += l.credit_base;
    }
    return { account: acc, foreign, sign, opening: open.b * sign, openingForeign: open.f * sign, lines, totalDebit: td, totalCredit: tc, closing: run, closingForeign: runF };
  }

  /** Current balance (normal-sign) of each account, base and foreign — for lists and dashboards. */
  function accountBalances(db, asOf) {
    const s = sums(db, null, asOf || null);
    const accs = accounts(db, true);
    const out = new Map();
    const values = new Map();
    for (const a of accs) {
      const v = s.get(a.id);
      values.set(a.id, [v ? v.d - v.c : 0, v ? v.fd - v.fc : 0]);
    }
    for (const r of tree(accs, values, 2, false)) {
      const sign = DEBIT_NORMAL[r.account.type] ? 1 : -1;
      out.set(r.account.id, { base: r.values[0] * sign, foreign: r.account.currency ? r.values[1] * sign : null });
    }
    return out;
  }

  function journalReport(db, from, to, opts) {
    opts = opts || {};
    const params = [];
    let where = "e.status='posted'";
    if (from) { where += ' AND e.date >= ?'; params.push(from); }
    if (to) { where += ' AND e.date <= ?'; params.push(to); }
    if (opts.source) { where += ' AND e.source_type = ?'; params.push(opts.source); }
    const entries = db.all(`SELECT * FROM journal_entries e WHERE ${where} ORDER BY e.date, e.number`, params);
    const lines = db.all(
      `SELECT l.*, a.code account_code, a.name account_name FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
       JOIN accounts a ON a.id=l.account_id WHERE ${where} ORDER BY l.entry_id, l.line_no`, params);
    const byEntry = new Map(entries.map((e) => [e.id, Object.assign(e, { lines: [] })]));
    for (const l of lines) byEntry.get(l.entry_id)?.lines.push(l);
    const total = entries.reduce((s, e) => s + e.total_base, 0);
    return { entries, total };
  }

  /** Data integrity checks. Returns an array of { level: 'error'|'warning', message }. */
  function integrity(db) {
    const T = (k, v) => (Buku.i18n ? Buku.i18n.t(k, v) : k);
    const issues = [];
    const unbalanced = db.all(
      `SELECT e.number, sum(l.debit_base) d, sum(l.credit_base) c FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id
       WHERE e.status='posted' GROUP BY e.id HAVING d <> c`);
    unbalanced.forEach((u) => issues.push({ level: 'error', message: T('Entry {n} does not balance ({d} vs {c}).', { n: u.number, d: u.d, c: u.c }) }));
    const tb = db.get(`SELECT coalesce(sum(l.debit_base),0) d, coalesce(sum(l.credit_base),0) c FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted'`);
    if (tb.d !== tb.c) issues.push({ level: 'error', message: T('Trial balance is off by {n}.', { n: tb.d - tb.c }) });
    const headerLines = db.scalar(`SELECT count(*) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id WHERE e.status='posted' AND a.is_header=1`);
    if (headerLines) issues.push({ level: 'error', message: T('{n} posted line(s) use a group account.', { n: headerLines }) });
    const mismatch = db.scalar(`SELECT count(*) FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE a.currency IS NOT NULL AND a.currency <> l.currency`);
    if (mismatch) issues.push({ level: 'error', message: T('{n} line(s) are in a different currency from their account.', { n: mismatch }) });
    const noNumber = db.scalar(`SELECT count(*) FROM journal_entries WHERE status='posted' AND number IS NULL`);
    if (noNumber) issues.push({ level: 'error', message: T('{n} posted entries have no number.', { n: noNumber }) });
    const fk = db.all('PRAGMA foreign_key_check');
    if (fk.length) issues.push({ level: 'error', message: T('{n} broken reference(s) between tables.', { n: fk.length }) });
    const ic = db.scalar('PRAGMA integrity_check');
    if (ic !== 'ok') issues.push({ level: 'error', message: T('SQLite integrity check: {r}', { r: ic }) });
    const drafts = db.scalar(`SELECT count(*) FROM journal_entries WHERE status='draft'`);
    if (drafts) issues.push({ level: 'warning', message: T('{n} draft(s) waiting to be posted.', { n: drafts }) });
    if (Buku.reports2 && db.scalar("SELECT count(*) FROM sqlite_master WHERE name='documents'")) issues.push(...Buku.reports2.controlChecks(db));
    return issues;
  }

  Buku.ledger = { accounts, sums, tree, trialBalance, profitLoss, netProfit, balanceSheet, generalLedger, accountBalances, journalReport, integrity, DEBIT_NORMAL };
})();
