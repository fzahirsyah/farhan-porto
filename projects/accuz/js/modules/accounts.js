/* Buku — chart of accounts (tree, add/edit, deactivate, CSV) and opening balances. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const L = () => Buku.i18n;

  // Subtypes users can pick when creating accounts (system ones are seeded).
  const SUBTYPES = {
    asset: ['cash', 'bank', 'ar', 'current_asset', 'vendor_prepayment', 'tax_input', 'tax_prepaid', 'property_inventory', 'fixed_asset', 'accumulated_depreciation', 'investment_jv', 'other'],
    liability: ['ap', 'current_liability', 'deferred_revenue', 'customer_funds_held', 'customer_credit', 'partner_payable', 'tax_output', 'tax_payable', 'tax_withholding_payable', 'long_term_liability', 'other'],
    equity: ['equity', 'retained_earnings', 'opening_balance', 'other'],
    income: ['revenue', 'other_income', 'fx_realized', 'fx_unrealized', 'rounding', 'other'],
    expense: ['cost_of_sales', 'property_cogs', 'operating', 'other_expense', 'income_tax', 'other'],
  };

  function list(params, q) {
    const db = Buku.db;
    const showInactive = q.inactive === '1';
    const type = q.type || '';
    const accs = db.all('SELECT * FROM accounts ORDER BY code');
    const balances = Buku.ledger.accountBalances(db);
    const depth = new Map();
    const byId = new Map(accs.map((a) => [a.id, a]));
    const d = (a) => (a.parent_id && byId.has(a.parent_id) ? d(byId.get(a.parent_id)) + 1 : 0);
    accs.forEach((a) => depth.set(a.id, d(a)));
    const needle = (q.q || '').toLowerCase();
    const rows = accs.filter((a) =>
      (showInactive || a.is_active) && (!type || a.type === type) &&
      (!needle || a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) || (a.name_en || '').toLowerCase().includes(needle)));

    const tabs = [['', t('All')], ['asset', t('Assets')], ['liability', t('Liabilities')], ['equity', t('Equity')], ['income', t('Income')], ['expense', t('Expenses')]];
    ui.page({
      title: t('Chart of accounts'),
      actions:
        '<a class="btn ghost" href="#/accounts/opening">' + h(t('Opening balances')) + '</a>' +
        '<button type="button" class="btn ghost" id="csv-out">' + h(t('Export CSV')) + '</button>' +
        '<button type="button" class="btn ghost" id="csv-in">' + h(t('Import CSV')) + '</button>' +
        '<button type="button" class="btn primary" id="new-acc">' + h(t('New account')) + '</button>',
      body:
        '<div class="toolbar"><nav class="tabs">' + tabs.map(([v, l]) => '<a href="#/accounts' + ui.qs({ type: v, q: q.q, inactive: q.inactive }) + '" class="' + (type === v ? 'active' : '') + '">' + h(l) + '</a>').join('') + '</nav>' +
        '<form id="af" class="inline-filter"><input type="search" name="q" value="' + h(q.q || '') + '" placeholder="' + h(t('Search code or name')) + '" aria-label="' + h(t('Search')) + '">' +
        '<label class="check"><input type="checkbox" name="inactive"' + (showInactive ? ' checked' : '') + '> ' + h(t('Show inactive')) + '</label></form></div>' +
        (rows.length ? '<div class="table-wrap"><table class="data tree"><thead><tr><th>' + h(t('Code')) + '</th><th>' + h(t('Name')) + '</th><th>' + h(t('Type')) + '</th><th class="num">' + h(t('Balance')) + '</th><th></th></tr></thead><tbody>' +
          rows.map((a) => {
            const b = balances.get(a.id) || { base: 0, foreign: 0 };
            const foreign = a.currency && a.currency !== 'IDR';
            return '<tr class="' + (a.is_header ? 'is-header' : '') + (a.is_active ? '' : ' inactive') + '" data-id="' + a.id + '">' +
              '<td class="mono nowrap">' + h(a.code) + '</td>' +
              '<td><span class="indent" style="--d:' + depth.get(a.id) + '"></span>' + h(L().accName(a)) +
              (a.currency ? ' <span class="chip">' + h(a.currency) + '</span>' : '') + (!a.is_active ? ' <span class="chip muted">' + h(t('Inactive')) + '</span>' : '') +
              '</td>' +
              '<td class="muted">' + h(t(L().SUBTYPE_LABEL[a.subtype] || a.subtype)) + '</td>' +
              '<td class="num">' + (foreign && !a.is_header ? h(ui.money(b.foreign, a.currency)) + '<div class="sub">' + h(ui.idr(b.base, { code: true })) + '</div>' : h(ui.amt(b.base))) + '</td>' +
              '<td class="actions nowrap"><a class="btn small ghost" href="#/ledger' + ui.qs({ account: a.id }) + '">' + h(t('Ledger')) + '</a>' +
              '<button type="button" class="btn small ghost edit">' + h(t('Edit')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div>'
          : ui.empty(t('No accounts match.'))),
    });

    const af = ui.$('#af');
    const go = () => { const f = ui.formData(af); location.hash = '#/accounts' + ui.qs({ type, q: f.q, inactive: f.inactive ? '1' : '' }); };
    af.addEventListener('submit', (e) => { e.preventDefault(); go(); });
    af.querySelector('[name=inactive]').addEventListener('change', go);
    ui.$('#new-acc').addEventListener('click', () => edit(null, type));
    ui.$$('#main .edit').forEach((b) => b.addEventListener('click', () => edit(Number(b.closest('tr').dataset.id))));
    ui.$('#csv-out').addEventListener('click', exportCsv);
    ui.$('#csv-in').addEventListener('click', importCsv);
  }

  function edit(id, presetType) {
    const db = Buku.db;
    const a = id ? db.get('SELECT * FROM accounts WHERE id=?', [id]) : { code: '', name: '', name_en: '', type: presetType || 'expense', subtype: '', parent_id: '', is_header: 0, currency: '', is_active: 1, description: '', is_system: 0 };
    const lineCount = id ? db.scalar('SELECT count(*) FROM journal_lines WHERE account_id=?', [id]) : 0;
    const childCount = id ? db.scalar('SELECT count(*) FROM accounts WHERE parent_id=?', [id]) : 0;
    const locked = lineCount > 0;
    const curs = db.all('SELECT code FROM currencies WHERE is_enabled=1 OR code=? ORDER BY code', [a.currency || '']);

    const parentOptions = (type) => [{ value: '', label: t('— none (top level) —') }].concat(
      db.all('SELECT * FROM accounts WHERE is_header=1 AND type=? AND id<>? ORDER BY code', [type, id || 0]).map((p) => ({ value: p.id, label: p.code + ' · ' + L().accName(p) })));
    const subtypeOptions = (type) => SUBTYPES[type].map((s) => ({ value: s, label: t(L().SUBTYPE_LABEL[s] || s) }));

    const body =
      '<div class="grid2">' +
      ui.field(t('Code'), ui.input('code', a.code, { required: true, placeholder: '6-9100' }), { hint: t('Codes sort the chart. Use the parent’s prefix.') }) +
      ui.field(t('Type'), ui.select('type', ['asset', 'liability', 'equity', 'income', 'expense'].map((x) => ({ value: x, label: t(L().TYPE_LABEL[x]) })), a.type, { attrs: locked || a.is_system ? 'disabled' : '' })) +
      ui.field(t('Name (Indonesian)'), ui.input('name', a.name, { required: true }), { wide: true }) +
      ui.field(t('Name (English)'), ui.input('name_en', a.name_en), { wide: true, optional: true }) +
      ui.field(t('Group under'), '<span data-slot="parent">' + ui.select('parent_id', parentOptions(a.type), a.parent_id) + '</span>') +
      ui.field(t('Kind'), '<span data-slot="subtype">' + ui.select('subtype', subtypeOptions(a.type), a.subtype || SUBTYPES[a.type][0], { attrs: a.is_system ? 'disabled' : '' }) + '</span>') +
      ui.field(t('Currency'), ui.select('currency', [{ value: '', label: t('Any currency') }].concat(curs.map((c) => ({ value: c.code, label: c.code }))), a.currency || '', { attrs: locked ? 'disabled' : '' }),
        { hint: t('Lock bank, receivable and payable accounts to one currency.') }) +
      '</div>' +
      ui.field(t('Notes'), '<textarea name="description" rows="2">' + h(a.description || '') + '</textarea>', { optional: true }) +
      '<label class="check"><input type="checkbox" name="is_header"' + (a.is_header ? ' checked' : '') + (locked || childCount ? ' disabled' : '') + '> ' + h(t('Group account (holds other accounts, cannot be posted to)')) + '</label>' +
      (id ? '<label class="check"><input type="checkbox" name="is_active"' + (a.is_active ? ' checked' : '') + '> ' + h(t('Active')) + '</label>' : '') +
      (locked ? '<p class="note">' + h(t('This account has {n} posted line(s), so its type and currency cannot change.', { n: lineCount })) + '</p>' : '') +
      (a.is_system ? '<p class="note">' + h(t('The app uses this account automatically. You can rename it, but not delete it.')) + '</p>' : '');

    const actions = [{ label: t('Cancel'), kind: 'ghost' }];
    if (id && !a.is_system && !lineCount && !childCount) {
      actions.unshift({ label: t('Delete'), kind: 'danger', onClick: async () => {
        if (!(await ui.confirm(t('Delete account {code}?', { code: a.code }), { danger: true, okLabel: t('Delete') }))) return false;
        db.tx(() => { db.run('DELETE FROM accounts WHERE id=?', [id]); Buku.posting.audit(db, 'delete', 'accounts', id, a.code); });
        ui.toast(t('Account deleted'));
        ui.dispatch();
      } });
    }
    actions.push({ label: id ? t('Save changes') : t('Create account'), kind: 'primary', onClick: (m) => {
      const f = ui.formData(m.body);
      const type = locked || a.is_system ? a.type : f.type;
      if (!f.code || !f.name) throw new Buku.BukuError('required', t('Enter a code and a name.'));
      if (db.scalar('SELECT count(*) FROM accounts WHERE code=? AND id<>?', [f.code, id || 0])) throw new Buku.BukuError('duplicate_code', t('Code {code} is already used.', { code: f.code }));
      const parent = f.parent_id ? db.get('SELECT * FROM accounts WHERE id=?', [Number(f.parent_id)]) : null;
      if (parent && parent.type !== type) throw new Buku.BukuError('parent_type', t('The group must be the same type.'));
      if (parent && id && isDescendant(db, parent.id, id)) throw new Buku.BukuError('cycle', t('An account cannot be grouped under itself.'));
      if (a.is_system && f.is_active === false) throw new Buku.BukuError('system_account', t('System accounts stay active.'));
      const now = Buku.util.nowIso();
      const rec = {
        code: f.code, name: f.name, name_en: f.name_en || null, type,
        subtype: a.is_system ? a.subtype : f.subtype,
        parent_id: parent ? parent.id : null,
        is_header: lineCount || childCount ? a.is_header : f.is_header ? 1 : 0,
        currency: locked ? a.currency : f.currency || null,
        description: f.description || null,
        is_active: id ? (f.is_active ? 1 : 0) : 1,
        updated_at: now,
      };
      db.tx(() => {
        if (id) { db.update('accounts', id, rec); Buku.posting.audit(db, 'update', 'accounts', id, rec.code); }
        else { const nid = db.insert('accounts', Object.assign(rec, { created_at: now })); Buku.posting.audit(db, 'create', 'accounts', nid, rec.code); }
      });
      ui.toast(id ? t('Account saved') : t('Account created'));
      ui.dispatch();
    } });

    const m = ui.modal({ title: id ? t('Edit account {code}', { code: a.code }) : t('New account'), body, actions });
    const typeSel = m.body.querySelector('[name=type]');
    typeSel.addEventListener('change', () => {
      m.body.querySelector('[data-slot=parent]').innerHTML = ui.select('parent_id', parentOptions(typeSel.value), '');
      m.body.querySelector('[data-slot=subtype]').innerHTML = ui.select('subtype', subtypeOptions(typeSel.value), SUBTYPES[typeSel.value][0]);
    });
  }

  function isDescendant(db, candidate, ancestorId) {
    let cur = candidate, guard = 0;
    while (cur && guard++ < 50) {
      if (cur === ancestorId) return true;
      cur = db.scalar('SELECT parent_id FROM accounts WHERE id=?', [cur]);
    }
    return false;
  }

  function exportCsv() {
    const db = Buku.db;
    const rows = db.all('SELECT a.*, p.code parent_code FROM accounts a LEFT JOIN accounts p ON p.id=a.parent_id ORDER BY a.code');
    const csv = Buku.util.toCsv([['code', 'name', 'name_en', 'type', 'subtype', 'parent_code', 'is_header', 'currency', 'is_active']]
      .concat(rows.map((r) => [r.code, r.name, r.name_en, r.type, r.subtype, r.parent_code, r.is_header, r.currency, r.is_active])));
    Buku.util.download('bagan-akun.csv', csv, 'text/csv;charset=utf-8');
  }

  function importCsv() {
    ui.modal({
      title: t('Import accounts from CSV'),
      wide: true,
      body: '<p>' + h(t('Columns: code, name, name_en, type, subtype, parent_code, is_header, currency. Existing codes are skipped; new codes are added.')) + '</p>' +
        '<input type="file" accept=".csv,text/csv" name="file"><textarea name="text" rows="8" placeholder="code,name,name_en,type,subtype,parent_code,is_header,currency"></textarea>',
      onOpen: (m) => {
        m.body.querySelector('[name=file]').addEventListener('change', async (e) => {
          const f = e.target.files[0];
          if (f) m.body.querySelector('[name=text]').value = await f.text();
        });
      },
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Import'), kind: 'primary', onClick: (m) => {
        const db = Buku.db;
        const rows = Buku.util.parseCsv(m.body.querySelector('[name=text]').value);
        if (!rows.length) throw new Buku.BukuError('empty', t('Paste or choose a CSV file first.'));
        const head = rows[0].map((x) => x.trim().toLowerCase());
        const idx = (k) => head.indexOf(k);
        if (idx('code') < 0 || idx('name') < 0 || idx('type') < 0) throw new Buku.BukuError('csv_header', t('The first row must name the columns (code, name, type…).'));
        let added = 0, skipped = 0;
        const now = Buku.util.nowIso();
        db.tx(() => {
          for (const r of rows.slice(1)) {
            const code = (r[idx('code')] || '').trim();
            if (!code) continue;
            if (db.scalar('SELECT 1 FROM accounts WHERE code=?', [code])) { skipped++; continue; }
            const type = (r[idx('type')] || '').trim().toLowerCase();
            if (!SUBTYPES[type]) throw new Buku.BukuError('csv_type', t('Row {code}: unknown type “{type}”.', { code, type }));
            const pcode = idx('parent_code') >= 0 ? (r[idx('parent_code')] || '').trim() : '';
            const parent = pcode ? db.get('SELECT id, type FROM accounts WHERE code=?', [pcode]) : null;
            if (pcode && !parent) throw new Buku.BukuError('csv_parent', t('Row {code}: group {parent} not found.', { code, parent: pcode }));
            const sub = idx('subtype') >= 0 && SUBTYPES[type].includes((r[idx('subtype')] || '').trim()) ? r[idx('subtype')].trim() : SUBTYPES[type][0];
            const cur = idx('currency') >= 0 ? (r[idx('currency')] || '').trim().toUpperCase() || null : null;
            if (cur && !db.scalar('SELECT 1 FROM currencies WHERE code=?', [cur])) throw new Buku.BukuError('csv_currency', t('Row {code}: unknown currency {cur}.', { code, cur }));
            db.insert('accounts', {
              code, name: r[idx('name')].trim(), name_en: idx('name_en') >= 0 ? (r[idx('name_en')] || '').trim() || null : null, type, subtype: sub,
              parent_id: parent && parent.type === type ? parent.id : null, is_header: idx('is_header') >= 0 && /^(1|true|ya|yes)$/i.test((r[idx('is_header')] || '').trim()) ? 1 : 0,
              currency: cur, created_at: now, updated_at: now,
            });
            added++;
          }
        });
        ui.toast(t('{added} account(s) added, {skipped} skipped', { added, skipped }));
        ui.dispatch();
      } }],
    });
  }

  // ---------- Opening balances ----------
  function opening() {
    const db = Buku.db;
    const base = Buku.fx.base(db);
    const company = db.get('SELECT * FROM company WHERE id=1');
    const existing = db.all("SELECT * FROM journal_entries WHERE source_type='opening' AND status='posted' ORDER BY date");
    const defDate = existing.length ? existing[0].date : Buku.util.fiscalYearStart(Buku.util.today(), company.fiscal_year_start_month);
    // Receivables and payables are entered as opening invoices/bills so they can be paid later.
    const accs = db.all("SELECT * FROM accounts WHERE is_active=1 AND is_header=0 AND type IN ('asset','liability','equity') AND subtype NOT IN ('opening_balance','ar','ap') ORDER BY code");
    const groups = ['asset', 'liability', 'equity'];

    ui.page({
      title: t('Opening balances'),
      actions: '<a class="btn ghost" href="#/accounts">' + h(t('Back to accounts')) + '</a>',
      body:
        '<p class="intro">' + h(t('Enter balances on the day before you start recording in Accu-Z Accounting: money in each bank, what customers owe you, what you owe, taxes and so on. The difference goes to “Ekuitas Saldo Awal”, which your accountant can reclassify.')) + '</p>' +
        (existing.length ? '<div class="banner info"><div>' + h(t('Opening balances already posted:')) + ' ' + existing.map((e) => '<a href="#/journal/' + e.id + '">' + h(e.number) + '</a>').join(', ') + '. ' +
          h(t('Posting again adds to them. To redo, reverse the earlier entry first.')) + '</div></div>' : '') +
        '<div class="banner info"><div><strong>' + h(t('Unpaid customer invoices and vendor bills')) + '</strong> ' + h(t('Enter each one as an opening document so you can record its payment later. They post against Ekuitas Saldo Awal, not revenue or expense.')) + '</div>' +
        '<span class="button-row"><a class="btn small" href="#/doc/new/invoice?opening=1">' + h(t('Opening invoice')) + '</a><a class="btn small" href="#/doc/new/bill?opening=1">' + h(t('Opening bill')) + '</a></span></div>' +
        '<form id="ob" novalidate><div class="entry-head">' + ui.field(t('Balances as of'), ui.input('date', defDate, { type: 'date' }), { hint: t('Usually the first day of your financial year.') }) + '</div>' +
        '<div class="table-wrap"><table class="data ob"><thead><tr><th>' + h(t('Account')) + '</th><th class="num">' + h(t('Debit')) + '</th><th class="num">' + h(t('Credit')) + '</th></tr></thead>' +
        groups.map((g) => '<tbody><tr class="group-row"><th colspan="3">' + h(t(L().TYPE_LABEL[g])) + '</th></tr>' +
          accs.filter((a) => a.type === g).map((a) => {
            const cur = a.currency || base;
            const dec = ui.curDecimals(cur);
            const normalDebit = g === 'asset';
            return '<tr data-id="' + a.id + '" data-cur="' + h(cur) + '"><td><span class="mono">' + h(a.code) + '</span> ' + h(L().accName(a)) +
              (cur !== base ? ' <span class="chip">' + h(cur) + '</span><label class="inline-rate">' + h(t('Rate')) + ' <input class="num small" name="rate" inputmode="decimal" value="' + h(rateDefault(db, cur, defDate)) + '"></label>' : '') + '</td>' +
              '<td>' + ui.moneyInput('debit', null, dec, { placeholder: normalDebit ? '0' : '' }) + '</td><td>' + ui.moneyInput('credit', null, dec, { placeholder: normalDebit ? '' : '0' }) + '</td></tr>';
          }).join('') + '</tbody>').join('') +
        '</table></div><div id="ob-sum" class="balance is-empty"></div>' +
        '<div class="form-actions sticky"><button type="submit" class="btn primary">' + h(t('Post opening balances')) + '</button></div></form>',
    });

    const formEl = ui.$('#ob');
    let dirty = false;
    function collect(strict) {
      const date = formEl.querySelector('[name=date]').value;
      const lines = [];
      let errorRow = null;
      ui.$$('tr[data-id]', formEl).forEach((tr) => {
        const cur = tr.dataset.cur;
        let debit = 0, credit = 0, rate;
        try {
          debit = ui.readMoney(tr.querySelector('[name=debit]')) || 0;
          credit = ui.readMoney(tr.querySelector('[name=credit]')) || 0;
        } catch (e) { errorRow = errorRow || e; return; }
        if (!debit && !credit) return;
        if (cur !== base) rate = tr.querySelector('[name=rate]').value;
        lines.push({ account_id: Number(tr.dataset.id), debit: debit > credit ? debit - credit : 0, credit: credit > debit ? credit - debit : 0, currency: cur, rate });
      });
      if (strict && errorRow) throw errorRow;
      return { date, lines };
    }
    function summary() {
      const { lines } = collect(false);
      let d = 0, c = 0;
      for (const l of lines) {
        let b = 0;
        try { b = Buku.money.toBase(l.debit || l.credit, ui.curDecimals(l.currency), l.currency === base ? '1' : l.rate); } catch (e) { b = 0; }
        if (l.debit) d += b; else c += b;
      }
      const diff = d - c;
      const el = ui.$('#ob-sum');
      el.className = 'balance ' + (lines.length ? 'is-balanced' : 'is-empty');
      el.innerHTML = '<div class="bal-side"><span>' + h(t('Total debit')) + '</span><strong class="num">' + h(ui.idr(d, { code: true })) + '</strong></div><div></div>' +
        '<div class="bal-side right"><span>' + h(t('Total credit')) + '</span><strong class="num">' + h(ui.idr(c, { code: true })) + '</strong></div>' +
        '<div class="bal-state">' + (diff ? h(t('{amount} goes to Ekuitas Saldo Awal ({side})', { amount: ui.idr(Math.abs(diff), { code: true }), side: diff > 0 ? t('credit') : t('debit') })) : lines.length ? h(t('Balanced without an equity adjustment')) : h(t('Enter at least one balance'))) + '</div>';
    }
    formEl.addEventListener('input', () => { dirty = true; summary(); });
    formEl.addEventListener('focusout', summary);
    formEl.addEventListener('submit', (ev) => {
      ev.preventDefault();
      try {
        const { date, lines } = collect(true);
        const r = Buku.posting.postOpening(db, date, lines);
        dirty = false;
        ui.toast(t('Posted {number}', { number: r.number }));
        location.hash = '#/journal/' + r.id;
      } catch (e) { ui.showError(e); }
    });
    ui.setLeaveGuard(() => (dirty ? t('Opening balances are not posted yet. Leave anyway?') : null));
    summary();
  }

  function rateDefault(db, cur, date) {
    const r = Buku.fx.lookup(db, cur, date);
    return r ? Buku.money.formatRate(r.rate) : '';
  }

  ui.route('/accounts', list);
  ui.route('/accounts/opening', opening);
})();
