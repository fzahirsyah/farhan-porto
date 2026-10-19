/* Buku — journal entries: list, entry form (drafts), posted entry view, reversal. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  let prefill = null; // entry input to copy into a new form (duplicate)

  const SOURCE_LABEL = { manual: 'Manual', opening: 'Opening balance', invoice: 'Invoice', bill: 'Bill', expense: 'Expense', credit_note: 'Credit note',
    payment_in: 'Payment received', payment_out: 'Payment made', receive: 'Money received', spend: 'Money spent', transfer: 'Transfer', recognition: 'Revenue recognition',
    ppn_close: 'PPN masa close', tax_payment: 'Tax payment', fx_revalue: 'FX revaluation', year_end: 'Year-end closing', recurring_draft: 'Recurring journal',
    deal_fund: 'Customer funds held', deal_offset: 'Titipan offset', deal_partner: 'Partner share', deal_partner_payment: 'Partner share payout',
    property_cost: 'Capitalized property cost', property_hpp: 'Cost of property sold', property_tax: 'Property tax',
    jv_contribution: 'JV contribution', jv_capital_return: 'JV capital return', jv_distribution: 'JV distribution' };

  // ---------- List ----------
  function list(params, q) {
    const db = Buku.db;
    const where = ['1=1'], args = [];
    if (q.status) { where.push('e.status=?'); args.push(q.status); }
    if (q.from) { where.push('e.date>=?'); args.push(q.from); }
    if (q.to) { where.push('e.date<=?'); args.push(q.to); }
    if (q.q) {
      where.push('(e.number LIKE ? OR e.memo LIKE ? OR e.reference LIKE ? OR EXISTS (SELECT 1 FROM journal_lines l WHERE l.entry_id=e.id AND l.description LIKE ?))');
      const like = '%' + q.q + '%';
      args.push(like, like, like, like);
    }
    const LIMIT = 500;
    const rows = db.all(`SELECT e.* FROM journal_entries e WHERE ${where.join(' AND ')} ORDER BY CASE e.status WHEN 'draft' THEN 0 ELSE 1 END, e.date DESC, e.id DESC LIMIT ${LIMIT + 1}`, args);
    const more = rows.length > LIMIT;
    if (more) rows.pop();

    ui.page({
      title: t('Journal entries'),
      actions: '<a class="btn primary" href="#/journal/new">' + h(t('New journal entry')) + '</a>',
      body:
        '<form class="filters" id="jf">' +
        ui.field(t('Search'), ui.input('q', q.q, { placeholder: t('Number, memo, reference…'), type: 'search' })) +
        ui.field(t('From'), ui.input('from', q.from, { type: 'date' })) +
        ui.field(t('To'), ui.input('to', q.to, { type: 'date' })) +
        ui.field(t('Status'), ui.select('status', [{ value: '', label: t('All') }, { value: 'draft', label: t('Draft') }, { value: 'posted', label: t('Posted') }], q.status)) +
        '<button class="btn" type="submit">' + h(t('Filter')) + '</button></form>' +
        (rows.length
          ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Number')) + '</th><th>' + h(t('Memo')) + '</th><th class="num">' + h(t('Amount (IDR)')) + '</th><th>' + h(t('Status')) + '</th></tr></thead><tbody>' +
            rows.map((e) =>
              '<tr class="link" data-href="#/journal/' + e.id + '"><td class="nowrap">' + h(ui.date(e.date)) + '</td><td class="nowrap mono">' + h(e.number || '—') + '</td><td>' +
              h(e.memo || '') + (e.reference ? '<div class="sub">' + h(t('Ref.')) + ' ' + h(e.reference) + '</div>' : '') +
              (e.source_type !== 'manual' ? '<div class="sub">' + h(t(SOURCE_LABEL[e.source_type] || e.source_type)) + '</div>' : '') + '</td>' +
              '<td class="num">' + h(ui.idr(e.total_base)) + (e.currency !== 'IDR' ? '<div class="sub">' + h(e.currency) + '</div>' : '') + '</td><td>' + statusChip(e) + '</td></tr>').join('') +
            '</tbody></table></div>' + (more ? '<p class="note">' + h(t('Showing the latest {n}. Narrow the filter to see older entries.', { n: LIMIT })) + '</p>' : '')
          : ui.empty(q.q || q.status || q.from || q.to ? t('No entries match this filter.') : t('No journal entries yet. Record your first transaction.'), '<a class="btn primary" href="#/journal/new">' + h(t('New journal entry')) + '</a>')),
    });
    ui.$('#jf').addEventListener('submit', (ev) => {
      ev.preventDefault();
      location.hash = '#/journal' + ui.qs(ui.formData(ui.$('#jf')));
    });
    bindRowLinks();
  }

  function statusChip(e) {
    if (e.status === 'draft') return '<span class="chip draft">' + h(t('Draft')) + '</span>';
    if (e.reversed_by_id) return '<span class="chip muted">' + h(t('Reversed')) + '</span>';
    if (e.reverses_id) return '<span class="chip muted">' + h(t('Reversal')) + '</span>';
    return '<span class="chip ok">' + h(t('Posted')) + '</span>';
  }

  function bindRowLinks() {
    ui.$$('#main tr.link').forEach((tr) => tr.addEventListener('click', (ev) => {
      if (ev.target.closest('a,button')) return;
      location.hash = tr.dataset.href;
    }));
  }

  // ---------- Entry page (form for drafts / new, view for posted) ----------
  function entryPage(params) {
    const db = Buku.db;
    if (params.id === 'new') return form(null);
    const e = Buku.posting.load(db, Number(params.id));
    if (!e) throw new Buku.BukuError('not_found', t('Entry not found.'));
    if (e.status === 'draft') return form(e);
    return view(e);
  }

  function enabledCurrencies() {
    return Buku.db.all('SELECT * FROM currencies WHERE is_enabled=1 ORDER BY CASE code WHEN \'IDR\' THEN 0 ELSE 1 END, code');
  }

  function accountMap() {
    const m = new Map();
    Buku.db.all('SELECT * FROM accounts').forEach((a) => m.set(a.id, a));
    return m;
  }

  function form(existing) {
    const db = Buku.db;
    const accs = accountMap();
    const base = Buku.fx.base(db);
    const src = existing ? Buku.posting.toInput(existing) : prefill || null;
    prefill = null;
    const decOf = (cur) => ui.curDecimals(cur);

    const state = {
      id: existing ? existing.id : null,
      date: src ? src.date : Buku.util.today(),
      currency: src ? src.currency : base,
      rate: src && src.currency !== base ? Buku.money.formatRate(src.rate) : '',
      rateTouched: !!(src && src.currency !== base),
      reference: src ? src.reference || '' : '',
      memo: src ? src.memo || '' : '',
      lines: (src ? src.lines : []).map((l) => ({
        account_id: l.account_id, description: l.description || '', currency: l.currency, rate: l.currency !== base && l.currency !== (src && src.currency) ? Buku.money.formatRate(l.rate) : '',
        debitText: l.debit ? Buku.money.format(l.debit, decOf(l.currency)) : '', creditText: l.credit ? Buku.money.format(l.credit, decOf(l.currency)) : '',
      })),
      dirty: false,
    };
    while (state.lines.length < 2) state.lines.push(blankLine());
    if (!src || state.lines[state.lines.length - 1].account_id) state.lines.push(blankLine());

    function blankLine() {
      return { account_id: '', description: '', currency: state ? state.currency : base, rate: '', debitText: '', creditText: '' };
    }

    const accOpts = ui.accountOptions({ empty: t('Choose account…'), headers: true });
    const title = existing ? t('Draft entry') : src ? t('Copy of entry') : t('New journal entry');

    ui.page({
      title,
      actions: (existing ? '<button type="button" class="btn ghost danger-text" id="del">' + h(t('Delete draft')) + '</button>' : '') +
        '<a class="btn ghost" href="#/journal">' + h(t('Cancel')) + '</a>',
      body:
        '<form id="je" class="entry-form" novalidate>' +
        '<div class="entry-head">' +
        ui.field(t('Date'), ui.input('date', state.date, { type: 'date', required: true })) +
        ui.field(t('Currency'), ui.select('currency', enabledCurrencies().map((c) => ({ value: c.code, label: c.code })), state.currency)) +
        '<div id="rate-field"></div>' +
        ui.field(t('Reference'), ui.input('reference', state.reference, { placeholder: t('e.g. invoice or receipt no.') }), { optional: true }) +
        ui.field(t('Memo'), ui.input('memo', state.memo, { placeholder: t('What is this entry for?') }), { wide: true }) +
        '</div>' +
        '<div class="table-wrap"><table class="lines"><thead><tr><th class="c-acc">' + h(t('Account')) + '</th><th class="c-desc">' + h(t('Description')) + '</th>' +
        '<th class="num c-amt">' + h(t('Debit')) + '</th><th class="num c-amt">' + h(t('Credit')) + '</th><th class="c-x"></th></tr></thead><tbody id="lines"></tbody></table></div>' +
        '<button type="button" class="btn small ghost" id="add-line">' + h(t('Add line')) + '</button>' +
        '<div id="balance" class="balance" aria-live="polite"></div>' +
        '<div class="form-actions sticky"><span class="hint">' + h(t('Ctrl+Enter posts the entry.')) + '</span>' +
        '<button type="button" class="btn" id="save-draft">' + h(t('Save draft')) + '</button>' +
        '<button type="submit" class="btn primary" id="post">' + h(t('Post entry')) + '</button></div>' +
        '</form>',
    });

    const formEl = ui.$('#je');
    const tbody = ui.$('#lines');

    function lineCurrency(l) {
      const a = accs.get(Number(l.account_id));
      if (a && a.currency) return a.currency;
      return state.currency;
    }

    function rateFor(cur, date) {
      const r = Buku.fx.lookup(db, cur, date);
      return r ? r : null;
    }

    function renderRate() {
      const wrap = ui.$('#rate-field');
      if (state.currency === base) { wrap.innerHTML = ''; return; }
      const found = rateFor(state.currency, state.date);
      if (!state.rateTouched && found) state.rate = Buku.money.formatRate(found.rate);
      const hint = found ? (found.rate_date === state.date ? t('Rate saved for this date') : t('Latest saved rate is from {date}', { date: ui.date(found.rate_date) })) : t('No saved rate. It will be saved for this date when you post.');
      wrap.innerHTML = ui.field(t('Rate (IDR per {cur})', { cur: state.currency }), '<input name="rate" class="num" inputmode="decimal" value="' + h(state.rate) + '">', { hint });
      ui.$('[name=rate]', wrap).addEventListener('input', (e) => { state.rate = e.target.value; state.rateTouched = true; markDirty(); recalc(); });
    }

    function rowHtml(l, i) {
      const cur = lineCurrency(l);
      const foreignLine = cur !== state.currency && cur !== base;
      const rateVal = l.rate || (foreignLine ? (rateFor(cur, state.date) ? Buku.money.formatRate(rateFor(cur, state.date).rate) : '') : '');
      if (foreignLine && !l.rate) l.rate = rateVal;
      const a = accs.get(Number(l.account_id));
      const decs = decOf(cur);
      return '<tr data-i="' + i + '">' +
        '<td class="c-acc">' + ui.select('account_id', accOpts, l.account_id, { attrs: 'aria-label="' + h(t('Account')) + '"' }) +
        (cur !== state.currency ? '<div class="line-cur"><span class="chip">' + h(cur) + '</span>' +
          (foreignLine ? '<label>' + h(t('Rate')) + ' <input name="line_rate" class="num small" inputmode="decimal" value="' + h(rateVal) + '"></label>' : '') + '</div>' : '') +
        (a && a.is_header ? '<div class="line-warn">' + h(t('Group account; choose one under it.')) + '</div>' : '') + '</td>' +
        '<td class="c-desc"><input name="description" value="' + h(l.description) + '" aria-label="' + h(t('Description')) + '"></td>' +
        '<td class="c-amt"><input class="num" name="debit" inputmode="decimal" autocomplete="off" data-decimals="' + decs + '" value="' + h(l.debitText) + '" aria-label="' + h(t('Debit')) + '"><div class="base-eq" data-eq="debit"></div></td>' +
        '<td class="c-amt"><input class="num" name="credit" inputmode="decimal" autocomplete="off" data-decimals="' + decs + '" value="' + h(l.creditText) + '" aria-label="' + h(t('Credit')) + '"><div class="base-eq" data-eq="credit"></div></td>' +
        '<td class="c-x"><button type="button" class="icon-btn remove" aria-label="' + h(t('Remove line')) + '">✕</button></td></tr>';
    }

    function renderLines() {
      tbody.innerHTML = state.lines.map(rowHtml).join('');
      recalc();
    }

    function parseLine(l) {
      const cur = lineCurrency(l);
      const d = decOf(cur);
      let debit = 0, credit = 0, rate = '1', ok = true;
      try { debit = Buku.money.parse(l.debitText, d) || 0; } catch (e) { ok = false; }
      try { credit = Buku.money.parse(l.creditText, d) || 0; } catch (e) { ok = false; }
      if (cur !== base) {
        rate = cur === state.currency ? state.rate : l.rate;
        try { Buku.money.parseRate(rate); } catch (e) { rate = null; }
      }
      const debitBase = rate ? Buku.money.toBase(debit, d, rate) : null;
      const creditBase = rate ? Buku.money.toBase(credit, d, rate) : null;
      return { cur, d, debit, credit, rate, debitBase, creditBase, ok };
    }

    function recalc() {
      let td = 0, tc = 0, fd = 0, fc = 0, missingRate = false, bad = false;
      const curs = new Set();
      state.lines.forEach((l, i) => {
        const p = parseLine(l);
        const row = tbody.querySelector('tr[data-i="' + i + '"]');
        if (!p.ok) bad = true;
        if ((p.debit || p.credit) && p.rate === null) missingRate = true;
        td += p.debitBase || 0; tc += p.creditBase || 0;
        if (p.debit || p.credit) curs.add(p.cur);
        if (p.cur === state.currency) { fd += p.debit; fc += p.credit; }
        if (row) {
          const showEq = p.cur !== base;
          row.querySelector('[data-eq=debit]').textContent = showEq && p.debit && p.debitBase !== null ? '≈ ' + ui.idr(p.debitBase, { code: true }) : '';
          row.querySelector('[data-eq=credit]').textContent = showEq && p.credit && p.creditBase !== null ? '≈ ' + ui.idr(p.creditBase, { code: true }) : '';
        }
      });
      const single = curs.size <= 1 && (curs.size === 0 || curs.has(state.currency));
      const diffForeign = fd - fc;
      const diffBase = td - tc;
      // Single-currency foreign entries balance in their own currency; IDR rounding is absorbed when posted.
      const balanced = !bad && !missingRate && (td > 0 || fd > 0) && (single ? diffForeign === 0 : diffBase === 0);
      const max = Math.max(td, tc, 1);
      const showCur = single && state.currency !== base;
      const L = (v, cur) => (cur ? ui.money(v, cur) : ui.idr(v, { code: true }));
      const dShown = showCur ? L(fd, state.currency) : L(td);
      const cShown = showCur ? L(fc, state.currency) : L(tc);
      const diffShown = showCur ? L(Math.abs(diffForeign), state.currency) : L(Math.abs(diffBase));
      const el = ui.$('#balance');
      el.className = 'balance ' + (balanced ? 'is-balanced' : td || tc ? 'is-off' : 'is-empty');
      el.innerHTML =
        '<div class="bal-side"><span>' + h(t('Total debit')) + '</span><strong class="num">' + h(dShown) + '</strong></div>' +
        '<div class="bal-track" aria-hidden="true"><div class="bal-half left"><div class="bal-fill" style="width:' + Math.round((td / max) * 100) + '%"></div></div><div class="bal-pivot"></div><div class="bal-half right"><div class="bal-fill" style="width:' + Math.round((tc / max) * 100) + '%"></div></div></div>' +
        '<div class="bal-side right"><span>' + h(t('Total credit')) + '</span><strong class="num">' + h(cShown) + '</strong></div>' +
        '<div class="bal-state">' + (balanced ? h(t('Balanced')) : missingRate ? h(t('Enter the missing exchange rate')) : bad ? h(t('Check the highlighted amounts')) : td || tc ? h(t('Off by {amount}', { amount: diffShown })) : h(t('Enter amounts to balance the entry'))) +
        (!single && balanced ? ' · ' + h(t('balanced in IDR')) : '') + '</div>';
      ui.$('#post').disabled = !balanced;
      return balanced;
    }

    function markDirty() { state.dirty = true; }

    function readRow(tr) {
      const i = Number(tr.dataset.i);
      return state.lines[i];
    }

    tbody.addEventListener('change', (ev) => {
      const tr = ev.target.closest('tr');
      if (!tr) return;
      const l = readRow(tr);
      if (ev.target.name === 'account_id') {
        const prevCur = lineCurrency(l);
        l.account_id = ev.target.value ? Number(ev.target.value) : '';
        const newCur = lineCurrency(l);
        if (newCur !== prevCur) {
          // Re-read typed amounts with the new currency's decimals.
          l.rate = '';
        }
        // Keep a blank line at the end for quick entry.
        if (tr.dataset.i === String(state.lines.length - 1) && l.account_id) state.lines.push(blankLine());
        markDirty();
        const focusDesc = true;
        renderLines();
        const row = tbody.querySelector('tr[data-i="' + tr.dataset.i + '"]');
        if (row && focusDesc) row.querySelector('[name=description]').focus();
      }
    });

    tbody.addEventListener('input', (ev) => {
      const tr = ev.target.closest('tr');
      if (!tr) return;
      const l = readRow(tr);
      const n = ev.target.name;
      if (n === 'description') l.description = ev.target.value;
      if (n === 'debit') { l.debitText = ev.target.value; if (ev.target.value.trim()) { l.creditText = ''; tr.querySelector('[name=credit]').value = ''; } }
      if (n === 'credit') { l.creditText = ev.target.value; if (ev.target.value.trim()) { l.debitText = ''; tr.querySelector('[name=debit]').value = ''; } }
      if (n === 'line_rate') l.rate = ev.target.value;
      ev.target.classList.remove('invalid');
      tr.classList.remove('row-error');
      markDirty();
      recalc();
    });

    tbody.addEventListener('focusout', (ev) => {
      const n = ev.target.name;
      if (n !== 'debit' && n !== 'credit') return;
      const d = Number(ev.target.dataset.decimals || 0);
      try {
        const v = Buku.money.parse(ev.target.value, d);
        ev.target.value = v ? Buku.money.format(v, d) : '';
        const l = readRow(ev.target.closest('tr'));
        l[n + 'Text'] = ev.target.value;
      } catch (e) {
        ev.target.classList.add('invalid');
      }
    });

    tbody.addEventListener('keydown', (ev) => {
      // "=" in an empty amount fills the amount that balances the entry.
      if (ev.key === '=' && (ev.target.name === 'debit' || ev.target.name === 'credit') && !ev.target.value.trim()) {
        ev.preventDefault();
        const l = readRow(ev.target.closest('tr'));
        const cur = lineCurrency(l);
        if (cur !== state.currency) return;
        let fd = 0, fc = 0;
        state.lines.forEach((x) => { if (x === l) return; const p = parseLine(x); if (p.cur === state.currency) { fd += p.debit; fc += p.credit; } });
        const need = ev.target.name === 'debit' ? fc - fd : fd - fc;
        if (need > 0) {
          ev.target.value = Buku.money.format(need, decOf(cur));
          ev.target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    tbody.addEventListener('click', (ev) => {
      if (!ev.target.closest('.remove')) return;
      const i = Number(ev.target.closest('tr').dataset.i);
      state.lines.splice(i, 1);
      while (state.lines.length < 2) state.lines.push(blankLine());
      markDirty();
      renderLines();
    });

    ui.$('#add-line').addEventListener('click', () => {
      state.lines.push(blankLine());
      renderLines();
      tbody.querySelector('tr:last-child select').focus();
    });

    formEl.addEventListener('change', (ev) => {
      const n = ev.target.name;
      if (n === 'date') { state.date = ev.target.value; state.lines.forEach((l) => { l.rate = ''; }); renderRate(); renderLines(); }
      if (n === 'currency') {
        state.currency = ev.target.value;
        state.rate = ''; state.rateTouched = false;
        state.lines.forEach((l) => { l.rate = ''; });
        renderRate();
        renderLines();
      }
      markDirty();
    });
    formEl.addEventListener('input', (ev) => {
      if (ev.target.name === 'reference') state.reference = ev.target.value;
      if (ev.target.name === 'memo') state.memo = ev.target.value;
      if (ev.target.name === 'reference' || ev.target.name === 'memo') markDirty();
    });

    function toInput() {
      const lines = state.lines.map((l) => {
        const p = parseLine(l);
        if (!p.ok) throw new Buku.BukuError('invalid_amount', t('Check the highlighted amounts.'));
        return {
          account_id: l.account_id ? Number(l.account_id) : null,
          description: l.description,
          currency: p.cur,
          rate: p.cur !== base && p.cur !== state.currency ? l.rate : undefined,
          debit: p.debit,
          credit: p.credit,
        };
      });
      return { id: state.id || undefined, date: state.date, currency: state.currency, rate: state.currency !== base ? state.rate : '1', reference: state.reference, memo: state.memo, lines };
    }

    function showLineError(e) {
      if (e && e.details && e.details.line !== undefined) {
        const row = tbody.querySelector('tr[data-i="' + e.details.line + '"]');
        if (row) { row.classList.add('row-error'); row.scrollIntoView({ block: 'center' }); }
      }
      ui.showError(e);
    }

    function saveRates(input) {
      // Remember rates the user typed so the next entry on this date picks them up.
      const want = [];
      if (input.currency !== base) want.push([input.currency, input.rate]);
      input.lines.forEach((l) => { if (l.rate) want.push([l.currency, l.rate]); });
      want.forEach(([cur, rate]) => {
        const r = Buku.fx.lookup(db, cur, state.date);
        if (!r || r.rate_date !== state.date) Buku.fx.set(db, cur, state.date, rate);
      });
    }

    ui.$('#save-draft').addEventListener('click', () => {
      try {
        const input = toInput();
        const id = Buku.posting.saveDraft(db, input);
        state.dirty = false;
        ui.toast(t('Draft saved'));
        if (!state.id) { state.id = id; history.replaceState(null, '', '#/journal/' + id); }
      } catch (e) { showLineError(e); }
    });

    formEl.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!recalc()) return;
      try {
        const input = toInput();
        let result;
        db.tx(() => {
          saveRates(input);
          result = Buku.posting.post(db, input);
        });
        state.dirty = false;
        ui.toast(t('Posted {number}', { number: result.number }));
        location.hash = '#/journal/' + result.id;
      } catch (e) { showLineError(e); }
    });

    formEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); formEl.requestSubmit(); }
    });

    const del = ui.$('#del');
    if (del) del.addEventListener('click', async () => {
      if (!(await ui.confirm(t('Delete this draft?'), { danger: true, okLabel: t('Delete draft') }))) return;
      try {
        Buku.posting.deleteDraft(db, state.id);
        state.dirty = false;
        ui.toast(t('Draft deleted'));
        location.hash = '#/journal';
      } catch (e) { ui.showError(e); }
    });

    ui.setLeaveGuard(() => (state.dirty ? t('You have unsaved changes in this entry. Leave anyway?') : null));
    renderRate();
    renderLines();
    if (!existing && !src) ui.$('[name=memo]').focus();
  }

  // ---------- Posted entry view ----------
  function view(e) {
    const db = Buku.db;
    const base = Buku.fx.base(db);
    const reversedBy = e.reversed_by_id ? db.get('SELECT id, number, date FROM journal_entries WHERE id=?', [e.reversed_by_id]) : null;
    const reverses = e.reverses_id ? db.get('SELECT id, number FROM journal_entries WHERE id=?', [e.reverses_id]) : null;
    const anyForeign = e.lines.some((l) => l.currency !== base);
    const td = e.lines.reduce((s, l) => s + l.debit_base, 0);
    const tc = e.lines.reduce((s, l) => s + l.credit_base, 0);
    const company = db.get('SELECT name FROM company WHERE id=1');

    const amountCell = (l, side) => {
      const v = l[side], b = l[side + '_base'];
      if (!v) return '<td class="num"></td>';
      if (l.currency === base) return '<td class="num">' + h(ui.idr(b)) + '</td>';
      return '<td class="num">' + h(ui.money(v, l.currency)) + '<div class="sub">' + h(ui.idr(b, { code: true })) + '</div></td>';
    };

    ui.page({
      title: e.number,
      actions:
        '<button type="button" class="btn ghost" id="print">' + h(t('Print')) + '</button>' +
        '<button type="button" class="btn ghost" id="dup">' + h(t('Duplicate')) + '</button>' +
        (!e.reversed_by_id && !e.reverses_id ? '<button type="button" class="btn" id="rev">' + h(t('Reverse')) + '</button>' : ''),
      body:
        '<div class="print-head"><strong>' + h(company.name) + '</strong><span>' + h(t('Journal entry')) + ' ' + h(e.number) + '</span></div>' +
        (reversedBy ? '<div class="banner muted">' + h(t('Reversed by')) + ' <a href="#/journal/' + reversedBy.id + '">' + h(reversedBy.number) + '</a> ' + h(t('on {date}', { date: ui.date(reversedBy.date) })) + '</div>' : '') +
        (reverses ? '<div class="banner muted">' + h(t('This entry reverses')) + ' <a href="#/journal/' + reverses.id + '">' + h(reverses.number) + '</a></div>' : '') +
        '<dl class="facts">' +
        fact(t('Date'), ui.date(e.date)) + fact(t('Status'), null, statusChip(e)) +
        fact(t('Currency'), e.currency + (e.currency !== base ? ' · ' + t('rate') + ' ' + Buku.money.formatRate(e.rate) : '')) +
        (e.reference ? fact(t('Reference'), e.reference) : '') +
        (e.source_type !== 'manual' ? fact(t('Source'), t(SOURCE_LABEL[e.source_type] || e.source_type)) : '') +
        fact(t('Memo'), e.memo || '—', null, true) +
        '</dl>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Account')) + '</th><th>' + h(t('Description')) + '</th><th class="num">' + h(t('Debit')) + '</th><th class="num">' + h(t('Credit')) + '</th></tr></thead><tbody>' +
        e.lines.map((l) =>
          '<tr><td><a href="#/ledger' + ui.qs({ account: l.account_id }) + '">' + h(l.account_code) + ' · ' + h(Buku.i18n.accName({ name: l.account_name, name_en: l.account_name_en })) + '</a></td>' +
          '<td>' + h(l.description || '') + '</td>' + amountCell(l, 'debit') + amountCell(l, 'credit') + '</tr>').join('') +
        '</tbody><tfoot><tr><th colspan="2">' + h(t('Total')) + (anyForeign ? ' (IDR)' : '') + '</th><th class="num">' + h(ui.idr(td)) + '</th><th class="num">' + h(ui.idr(tc)) + '</th></tr></tfoot></table></div>' +
        '<p class="note">' + h(t('Posted entries cannot be edited. To correct one, reverse it and post a new entry.')) + '</p>',
    });

    ui.$('#print').addEventListener('click', () => window.print());
    ui.$('#dup').addEventListener('click', () => {
      prefill = Object.assign(Buku.posting.toInput(e), { id: undefined, date: Buku.util.today() });
      location.hash = '#/journal/new';
    });
    const rev = ui.$('#rev');
    if (rev) rev.addEventListener('click', () => {
      ui.modal({
        title: t('Reverse {number}', { number: e.number }),
        body: '<p>' + h(t('A new entry with the opposite debits and credits will cancel this one. Both stay in the books.')) + '</p>' +
          ui.field(t('Reversal date'), ui.input('date', Buku.util.today() < e.date ? e.date : Buku.util.today(), { type: 'date' })) +
          ui.field(t('Memo'), ui.input('memo', t('Reversal of {number}', { number: e.number }))),
        actions: [
          { label: t('Cancel'), kind: 'ghost' },
          { label: t('Reverse entry'), kind: 'primary', onClick: (m) => {
            const f = ui.formData(m.body);
            const r = Buku.posting.reverse(db, e.id, f.date, f.memo);
            ui.toast(t('Posted {number}', { number: r.number }));
            location.hash = '#/journal/' + r.id;
          } },
        ],
      });
    });
  }

  function fact(label, value, html, wide) {
    return '<div' + (wide ? ' class="wide"' : '') + '><dt>' + h(label) + '</dt><dd>' + (html || h(value)) + '</dd></div>';
  }

  ui.route('/journal', list);
  ui.route('/journal/:id', entryPage);
  Buku.journal = { setPrefill: (p) => { prefill = p; } };
})();
