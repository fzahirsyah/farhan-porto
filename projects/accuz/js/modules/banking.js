/* Buku — banking: accounts overview, transfer / spend / receive, statement import & matching, rules, reconciliation. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const U2 = () => Buku.ui2;

  function overview() {
    const db = Buku.db;
    const accs = Buku.banking.bankAccounts(db).filter((a) => a.is_active);
    ui.page({
      title: t('Bank & cash'),
      actions: '<button type="button" class="btn ghost" data-q="transfer">' + h(t('Transfer')) + '</button><button type="button" class="btn ghost" data-q="out">' + h(t('Spend money')) + '</button><button type="button" class="btn ghost" data-q="in">' + h(t('Receive money')) + '</button>',
      body: '<div class="bank-grid">' + accs.map((a) => '<a class="bank-card" href="#/banking/' + a.id + '"><div class="bc-top"><strong>' + h(Buku.i18n.accName(a)) + '</strong><span class="chip">' + h(a.cur) + '</span></div>' +
        '<div class="bc-bal num">' + h(a.balance_foreign !== null ? U2().money(a.balance_foreign, a.cur) : ui.idr(a.balance, { code: true })) + '</div>' +
        (a.balance_foreign !== null ? '<div class="sub">' + h(ui.idr(a.balance, { code: true })) + '</div>' : '') +
        '<div class="bc-foot">' + (a.unmatched ? '<span class="chip warn">' + h(t('{n} to review', { n: a.unmatched })) + '</span>' : '') +
        '<span class="sub">' + h(a.last_rec ? t('Reconciled to {d}', { d: ui.date(a.last_rec.statement_date) }) : t('Never reconciled')) + '</span></div></a>').join('') + '</div>',
    });
    ui.$$('[data-q]').forEach((b) => b.addEventListener('click', () => quick(b.dataset.q, null)));
  }

  function quick(kind, accountId, line) {
    const db = Buku.db;
    const accs = Buku.banking.bankAccounts(db).filter((a) => a.is_active);
    const accSel = (name, val) => ui.select(name, accs.map((a) => ({ value: a.id, label: Buku.i18n.accName(a) + ' (' + a.cur + ')' })), val || (accs[0] || {}).id);
    const today = line ? line.date : Buku.util.today();
    const amt = line ? Math.abs(line.amount) : null;
    if (kind === 'transfer') {
      const from = line ? (line.amount < 0 ? line.account_id : '') : accountId;
      const to = line ? (line.amount > 0 ? line.account_id : '') : '';
      const m = ui.modal({
        title: t('Transfer between accounts'),
        body: '<div class="grid2">' + ui.field(t('From'), accSel('from_id', from)) + ui.field(t('To'), accSel('to_id', to || (accs[1] || accs[0] || {}).id)) +
          ui.field(t('Date'), ui.input('date', today, { type: 'date' })) + '<div data-slot="amt" class="wide grid2"></div>' +
          ui.field(t('Transfer fee'), '<input name="fee" class="num" inputmode="decimal" placeholder="0">', { optional: true }) + ui.field(t('Memo'), ui.input('memo', line ? line.description : ''), { optional: true }) + '</div>',
        actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Transfer'), kind: 'primary', onClick: (mm) => {
          const f = ui.formData(mm.body);
          const fa = accs.find((a) => a.id === Number(f.from_id)), ta = accs.find((a) => a.id === Number(f.to_id));
          Buku.banking.transfer(db, { date: f.date, from_id: fa.id, to_id: ta.id, amount_from: Buku.money.parse(f.amount_from, ui.curDecimals(fa.cur)),
            amount_to: fa.cur === ta.cur ? undefined : Buku.money.parse(f.amount_to, ui.curDecimals(ta.cur)), fee: Buku.money.parse(f.fee || '0', ui.curDecimals(fa.cur)) || 0, memo: f.memo, bank_import_line_id: line ? line.id : null });
          ui.toast(t('Transfer recorded')); ui.dispatch();
        } }],
      });
      const sync = () => {
        const f = ui.formData(m.body);
        const fa = accs.find((a) => a.id === Number(f.from_id)), ta = accs.find((a) => a.id === Number(f.to_id));
        const slot = m.body.querySelector('[data-slot=amt]');
        const prevFrom = (m.body.querySelector('[name=amount_from]') || {}).value || (amt ? Buku.money.format(amt, ui.curDecimals(fa.cur)) : '');
        slot.innerHTML = ui.field(t('Amount sent ({cur})', { cur: fa.cur }), '<input name="amount_from" class="num" inputmode="decimal" value="' + h(prevFrom) + '">') +
          (fa.cur !== ta.cur ? ui.field(t('Amount received ({cur})', { cur: ta.cur }), '<input name="amount_to" class="num" inputmode="decimal">', { hint: t('The difference to today’s rate is posted as FX gain or loss.') }) : '');
      };
      m.body.addEventListener('change', (e) => { if (e.target.name === 'from_id' || e.target.name === 'to_id') sync(); });
      sync();
      return;
    }
    const dir = kind;
    const acct = ui.accountOptions({ empty: t('Choose account…') });
    const contacts = U2().contactOptions(null, t('— optional —'));
    ui.modal({
      title: dir === 'in' ? t('Receive money') : t('Spend money'),
      body: '<p class="hint">' + h(dir === 'in' ? t('For money in without an invoice: interest, capital top-up, refunds…') : t('For money out without a bill: bank fees, owner drawings, paying reimbursements…')) + '</p><div class="grid2">' +
        ui.field(t('Bank account'), accSel('account_id', line ? line.account_id : accountId)) + ui.field(t('Date'), ui.input('date', today, { type: 'date' })) +
        ui.field(t('Amount'), '<input name="amount" class="num" inputmode="decimal" value="' + h(amt ? Buku.money.format(amt, ui.curDecimals(Buku.banking.bankAccounts(db).find((a) => a.id === (line ? line.account_id : Number(accountId || (accs[0] || {}).id))).cur)) : '') + '">') +
        ui.field(dir === 'in' ? t('Income or source account') : t('Expense or target account'), ui.select('counter_account_id', acct, '')) +
        ui.field(t('Contact'), ui.select('contact_id', contacts, ''), { optional: true }) +
        ui.field(t('VAT included'), ui.select('tax_id', U2().taxOptions(dir === 'in' ? ['ppn_out'] : ['ppn_in'], t('No VAT')), ''), { optional: true }) +
        ui.field(t('Memo'), ui.input('memo', line ? line.description : ''), { wide: true }) + '</div>' +
        (line ? '<label class="check"><input type="checkbox" name="rule" checked> ' + h(t('Remember: lines containing')) + ' <input name="pattern" class="small" value="' + h(suggestPattern(line.description)) + '"> ' + h(t('go to this account')) + '</label>' : ''),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (mm) => {
        const f = ui.formData(mm.body);
        const a = Buku.banking.bankAccounts(db).find((x) => x.id === Number(f.account_id));
        db.tx(() => {
          Buku.banking.spendReceive(db, { direction: dir, date: f.date, account_id: a.id, amount: Buku.money.parse(f.amount, ui.curDecimals(a.cur)), counter_account_id: Number(f.counter_account_id) || null,
            contact_id: f.contact_id ? Number(f.contact_id) : null, memo: f.memo, tax_id: f.tax_id ? Number(f.tax_id) : null, bank_import_line_id: line ? line.id : null });
          if (line && f.rule && f.pattern) Buku.banking.addRule(db, { pattern: f.pattern, direction: dir, account_id: Number(f.counter_account_id), contact_id: f.contact_id ? Number(f.contact_id) : null });
        });
        ui.toast(t('Recorded')); ui.dispatch();
      } }],
    });
  }

  function suggestPattern(desc) {
    const words = String(desc || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^\d+$/.test(w) && !['TRSF', 'BANKING', 'E-BANKING', 'TRANSFER', 'DARI', 'KE'].includes(w));
    return words.slice(0, 2).join(' ');
  }

  // ---------------- Account page ----------------
  function account(params, q) {
    const db = Buku.db;
    const id = Number(params.id);
    const a = Buku.banking.bankAccounts(db).find((x) => x.id === id);
    if (!a) throw new Buku.BukuError('not_found', t('Account not found.'));
    const tab = q.tab || 'review';
    const tabs = [['review', t('Statement lines')], ['reconcile', t('Reconcile')], ['rules', t('Rules')]];
    ui.page({
      title: Buku.i18n.accName(a),
      actions: '<button type="button" class="btn ghost" id="imp">' + h(t('Import statement')) + '</button><a class="btn ghost" href="#/ledger?account=' + id + '">' + h(t('Ledger')) + '</a>' +
        '<button type="button" class="btn ghost" data-q="transfer">' + h(t('Transfer')) + '</button><button type="button" class="btn ghost" data-q="out">' + h(t('Spend')) + '</button><button type="button" class="btn ghost" data-q="in">' + h(t('Receive')) + '</button>',
      body: '<div class="acct-head"><div><span class="kpi-label">' + h(t('Balance in Accu-Z Accounting')) + '</span><div class="kpi-value num">' + h(a.balance_foreign !== null ? U2().money(a.balance_foreign, a.cur) : ui.idr(a.balance, { code: true })) + '</div></div>' +
        '<div><span class="kpi-label">' + h(t('Last reconciled')) + '</span><div>' + h(a.last_rec ? ui.date(a.last_rec.statement_date) + ' · ' + U2().money(a.last_rec.statement_balance, a.cur) : t('Never')) + '</div></div></div>' +
        '<nav class="tabs toolbar">' + tabs.map(([k, l]) => '<a class="' + (tab === k ? 'active' : '') + '" href="#/banking/' + id + '?tab=' + k + '">' + h(l) + (k === 'review' && a.unmatched ? ' (' + a.unmatched + ')' : '') + '</a>').join('') + '</nav><div id="tab"></div>',
    });
    ui.$('#imp').addEventListener('click', () => importModal(a));
    ui.$$('[data-q]').forEach((b) => b.addEventListener('click', () => quick(b.dataset.q, id)));
    if (tab === 'review') review(a, q);
    if (tab === 'reconcile') reconcile(a, q);
    if (tab === 'rules') rules(a);
  }

  function review(a, q) {
    const db = Buku.db;
    const show = q.show || 'new';
    const lines = db.all(`SELECT b.*, e.number entry_number FROM bank_import_lines b LEFT JOIN journal_entries e ON e.id=b.journal_entry_id WHERE b.account_id=? ${show === 'new' ? "AND b.status='new'" : ''} ORDER BY b.date DESC, b.id DESC LIMIT 400`, [a.id]);
    const box = ui.$('#tab');
    const ruleCount = db.scalar("SELECT count(*) FROM bank_import_lines WHERE account_id=? AND status='new'", [a.id]);
    box.innerHTML = '<div class="toolbar"><nav class="tabs small"><a class="' + (show === 'new' ? 'active' : '') + '" href="#/banking/' + a.id + '?tab=review&show=new">' + h(t('To review')) + '</a><a class="' + (show === 'all' ? 'active' : '') + '" href="#/banking/' + a.id + '?tab=review&show=all">' + h(t('All lines')) + '</a></nav>' +
      (ruleCount ? '<button type="button" class="btn small" id="apply-rules">' + h(t('Apply rules')) + '</button>' : '') + '</div>' +
      (lines.length ? '<div class="table-wrap"><table class="data bank-lines"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Description')) + '</th><th class="num">' + h(t('In')) + '</th><th class="num">' + h(t('Out')) + '</th><th>' + h(t('Match')) + '</th></tr></thead><tbody>' +
        lines.map((l) => {
          let action = '';
          if (l.status === 'new') {
            const s = Buku.banking.suggestions(db, l.id)[0];
            const label = s ? (s.type === 'invoice' ? t('Payment for {x}', { x: s.label }) : s.type === 'bill' ? t('Pay bill {x}', { x: s.label }) : s.type === 'existing' ? t('Matches {x}', { x: s.label }) : t('Rule: {x}', { x: s.label })) : '';
            action = (s ? '<div class="suggest"><span>' + h(label) + '</span><button type="button" class="btn small primary" data-ok="' + l.id + '">' + h(s.type === 'existing' ? t('Match') : t('Record')) + '</button></div>' : '') +
              '<button type="button" class="btn small ghost" data-more="' + l.id + '">' + h(s ? t('Other…') : t('Choose…')) + '</button>';
          } else {
            action = U2().chip(l.status === 'ignored' ? 'void' : 'posted').replace(/>[^<]+</, '>' + h(t(l.status === 'ignored' ? 'Ignored' : l.status === 'matched' ? 'Matched' : 'Recorded')) + '<') +
              (l.journal_entry_id ? ' <a href="#/journal/' + l.journal_entry_id + '">' + h(l.entry_number || '') + '</a>' : '') +
              (l.status === 'ignored' || l.status === 'matched' ? ' <button type="button" class="btn small ghost" data-undo="' + l.id + '">' + h(t('Undo')) + '</button>' : '');
          }
          return '<tr><td class="nowrap">' + h(ui.date(l.date)) + '</td><td>' + h(l.description || '') + (l.balance !== null ? '<div class="sub">' + h(t('Balance')) + ' ' + h(Buku.money.format(l.balance, ui.curDecimals(a.cur))) + '</div>' : '') + '</td>' +
            '<td class="num">' + (l.amount > 0 ? h(Buku.money.format(l.amount, ui.curDecimals(a.cur))) : '') + '</td><td class="num">' + (l.amount < 0 ? h(Buku.money.format(-l.amount, ui.curDecimals(a.cur))) : '') + '</td><td class="match-cell">' + action + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : ui.empty(show === 'new' ? t('Nothing to review. Import a statement to match it with your books.') : t('No statement lines yet.'), '<button type="button" class="btn primary" id="imp2">' + h(t('Import statement')) + '</button>'));
    const i2 = ui.$('#imp2'); if (i2) i2.addEventListener('click', () => importModal(a));
    const ar = ui.$('#apply-rules'); if (ar) ar.addEventListener('click', () => { try { const n = Buku.banking.applyRules(db, a.id); ui.toast(t('{n} line(s) recorded by rules', { n })); ui.dispatch(); } catch (e) { ui.showError(e); } });
    box.addEventListener('click', (ev) => {
      const ok = ev.target.closest('[data-ok]'), more = ev.target.closest('[data-more]'), undo = ev.target.closest('[data-undo]');
      try {
        if (ok) acceptSuggestion(a, Number(ok.dataset.ok));
        if (more) chooseModal(a, Number(more.dataset.more));
        if (undo) { const l = db.get('SELECT * FROM bank_import_lines WHERE id=?', [Number(undo.dataset.undo)]); if (l.status === 'ignored') Buku.banking.ignore(db, l.id, true); else Buku.banking.unmatch(db, l.id); ui.dispatch(); }
      } catch (e) { ui.showError(e); }
    });
  }

  function acceptSuggestion(a, lineId) {
    const db = Buku.db;
    const line = db.get('SELECT * FROM bank_import_lines WHERE id=?', [lineId]);
    const s = Buku.banking.suggestions(db, lineId)[0];
    if (!s) return;
    if (s.type === 'existing') { Buku.banking.matchExisting(db, lineId, s.entry_id); ui.toast(t('Matched')); ui.dispatch(); return; }
    if (s.type === 'rule') {
      Buku.banking.spendReceive(db, { direction: line.amount > 0 ? 'in' : 'out', date: line.date, account_id: a.id, amount: Math.abs(line.amount), counter_account_id: s.account_id, contact_id: s.contact_id, memo: s.memo || line.description, bank_import_line_id: line.id });
      ui.toast(t('Recorded')); ui.dispatch(); return;
    }
    const d = db.get('SELECT * FROM documents WHERE id=?', [s.document_id]);
    if (s.type === 'invoice') {
      ui.modal({
        title: t('Record payment for {n}', { n: d.number }),
        body: '<dl class="facts one"><div><dt>' + h(t('Received')) + '</dt><dd>' + h(U2().money(Math.abs(line.amount), a.cur)) + '</dd></div><div><dt>' + h(t('Applied to {n}', { n: d.number })) + '</dt><dd>' + h(U2().money(s.applied, d.currency)) + '</dd></div>' +
          (s.withholding ? '<div><dt>' + h(t('PPh 23 withheld by customer')) + '</dt><dd>' + h(U2().money(s.withholding, d.currency)) + '</dd></div>' : '') + '</dl>' +
          (s.withholding ? ui.field(t('Bukti potong no.'), ui.input('bp', ''), { optional: true, hint: t('You can add it later from the payment.') }) : ''),
        actions: [{ label: t('Edit details…'), kind: 'ghost', onClick: () => { location.hash = '#/payments/new' + ui.qs({ direction: 'in', contact: d.contact_id, doc: d.id, line: line.id }); } },
          { label: t('Record payment'), kind: 'primary', onClick: (m) => {
            const f = ui.formData(m.body);
            Buku.payments.post(db, { direction: 'in', contact_id: d.contact_id, date: line.date, account_id: a.id, amount: Math.abs(line.amount), bank_import_line_id: line.id,
              allocations: [{ document_id: d.id, amount: s.applied, withholding: s.withholding || 0, bukti_potong_no: f.bp || null }] });
            ui.toast(t('Payment recorded')); ui.dispatch();
          } }],
      });
    }
    if (s.type === 'bill') {
      Buku.payments.post(db, { direction: 'out', contact_id: d.contact_id, date: line.date, account_id: a.id, amount: Math.abs(line.amount), bank_import_line_id: line.id, allocations: [{ document_id: d.id, amount: s.applied }] });
      ui.toast(t('Payment recorded')); ui.dispatch();
    }
  }

  function chooseModal(a, lineId) {
    const db = Buku.db;
    const line = db.get('SELECT * FROM bank_import_lines WHERE id=?', [lineId]);
    const sugg = Buku.banking.suggestions(db, lineId);
    const inMoney = line.amount > 0;
    const m = ui.modal({
      title: (inMoney ? t('Money in') : t('Money out')) + ' · ' + U2().money(Math.abs(line.amount), a.cur),
      body: '<p class="note">' + h(ui.date(line.date)) + ' · ' + h(line.description) + '</p>' +
        (sugg.length ? '<h3 class="section-title">' + h(t('Suggestions')) + '</h3><ul class="pick-list">' + sugg.map((s, i) => '<li><button type="button" class="pick" data-i="' + i + '">' + h(s.label) + '</button></li>').join('') + '</ul>' : '') +
        '<h3 class="section-title">' + h(t('Or')) + '</h3><div class="stack">' +
        (inMoney ? '<button type="button" class="btn" data-a="payin">' + h(t('Customer payment (choose invoices)…')) + '</button>' : '<button type="button" class="btn" data-a="payout">' + h(t('Pay a bill or refund…')) + '</button>') +
        '<button type="button" class="btn" data-a="sr">' + h(inMoney ? t('Other income…') : t('Expense or other payment…')) + '</button>' +
        '<button type="button" class="btn" data-a="tr">' + h(t('Transfer from/to another account…')) + '</button>' +
        '<button type="button" class="btn ghost" data-a="ignore">' + h(t('Ignore this line')) + '</button></div>',
      actions: [{ label: t('Close'), kind: 'ghost' }],
    });
    m.body.addEventListener('click', (ev) => {
      const p = ev.target.closest('.pick'), act = ev.target.closest('[data-a]');
      try {
        if (p) {
          const s = sugg[Number(p.dataset.i)];
          m.close();
          if (s.type === 'existing') { Buku.banking.matchExisting(db, lineId, s.entry_id); ui.dispatch(); }
          else if (s.type === 'invoice' || s.type === 'bill') { const d = db.get('SELECT * FROM documents WHERE id=?', [s.document_id]); location.hash = '#/payments/new' + ui.qs({ direction: s.type === 'invoice' ? 'in' : 'out', contact: d.contact_id, doc: d.id, line: lineId }); }
          else if (s.type === 'rule') { Buku.banking.spendReceive(db, { direction: inMoney ? 'in' : 'out', date: line.date, account_id: a.id, amount: Math.abs(line.amount), counter_account_id: s.account_id, contact_id: s.contact_id, memo: s.memo || line.description, bank_import_line_id: line.id }); ui.dispatch(); }
        }
        if (act) {
          m.close();
          const k = act.dataset.a;
          if (k === 'payin' || k === 'payout') location.hash = '#/payments/new' + ui.qs({ direction: k === 'payin' ? 'in' : 'out', line: lineId });
          if (k === 'sr') quick(inMoney ? 'in' : 'out', a.id, line);
          if (k === 'tr') quick('transfer', a.id, line);
          if (k === 'ignore') { Buku.banking.ignore(db, lineId); ui.dispatch(); }
        }
      } catch (e) { ui.showError(e); }
    });
  }

  // ---------------- Import ----------------
  function importModal(a) {
    const db = Buku.db;
    const dec = ui.curDecimals(a.cur);
    let text = '', fileName = '', parsed = null;
    const m = ui.modal({
      title: t('Import bank statement'),
      wide: true,
      body: '<p class="hint">' + h(t('Download the statement as CSV from your internet banking (KlikBCA: Mutasi Rekening → Download). Lines already imported are skipped.')) + '</p>' +
        '<div class="grid2">' + ui.field(t('File'), '<input type="file" name="file" accept=".csv,.txt,text/csv">') +
        ui.field(t('Format'), ui.select('preset', [{ value: 'bca', label: 'BCA (KlikBCA / KlikBCA Bisnis)' }, { value: 'generic', label: t('Other bank (choose columns)') }], 'bca')) + '</div>' +
        '<div id="map"></div><div id="pv"></div>',
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Import'), kind: 'primary', onClick: () => {
        if (!parsed || !parsed.length) throw new Buku.BukuError('empty', t('Choose a file with transactions first.'));
        const r = Buku.banking.importRows(db, a.id, parsed, { fileName, preset: m.body.querySelector('[name=preset]').value });
        ui.toast(t('{a} new line(s), {d} already imported', { a: r.added, d: r.duplicates }));
        location.hash = '#/banking/' + a.id + '?tab=review';
        ui.dispatch();
      } }],
    });
    const preview = () => {
      const preset = m.body.querySelector('[name=preset]').value;
      const pv = m.body.querySelector('#pv');
      const map = m.body.querySelector('#map');
      parsed = null;
      if (!text) { pv.innerHTML = ''; map.innerHTML = ''; return; }
      try {
        if (preset === 'bca') { map.innerHTML = ''; parsed = Buku.banking.parseBCA(text, dec); }
        else {
          const rows = Buku.util.parseCsv(text);
          if (!map.dataset.built) {
            map.dataset.built = '1';
            const cols = (rows.find((r) => r.length > 2) || rows[0] || []).map((c, i) => ({ value: i, label: (i + 1) + ': ' + String(c).slice(0, 24) }));
            const pick = (name, label, opt) => ui.field(label, ui.select(name, [{ value: '', label: '—' }].concat(cols), ''), { optional: opt });
            map.innerHTML = '<div class="grid4">' + pick('date', t('Date')) + pick('description', t('Description')) + pick('amount', t('Amount (+/−)'), true) + pick('debit', t('Money out'), true) + pick('credit', t('Money in'), true) + pick('balance', t('Balance'), true) +
              ui.field(t('Date format'), ui.select('dateFormat', [{ value: 'dmy', label: 'DD/MM/YYYY' }, { value: 'mdy', label: 'MM/DD/YYYY' }, { value: 'ymd', label: 'YYYY-MM-DD' }], 'dmy')) +
              ui.field(t('Skip first rows'), ui.input('skip', '1', { type: 'number', attrs: 'min="0"' })) + '</div>';
          }
          const f = ui.formData(map);
          if (f.date === '' || f.description === '' || (f.amount === '' && f.debit === '' && f.credit === '')) { pv.innerHTML = '<p class="note">' + h(t('Choose the date, description and amount columns.')) + '</p>'; return; }
          parsed = Buku.banking.parseGeneric(text, { date: Number(f.date), description: Number(f.description), amount: f.amount === '' ? '' : Number(f.amount), debit: f.debit === '' ? '' : Number(f.debit), credit: f.credit === '' ? '' : Number(f.credit), balance: f.balance === '' ? '' : Number(f.balance), dateFormat: f.dateFormat, skip: Number(f.skip || 0) }, dec);
        }
        const inSum = parsed.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0), outSum = parsed.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
        pv.innerHTML = '<p class="check-line ok">' + h(t('{n} transactions · in {i} · out {o}', { n: parsed.length, i: U2().money(inSum, a.cur), o: U2().money(outSum, a.cur) })) + '</p>' +
          '<div class="table-wrap"><table class="data"><tbody>' + parsed.slice(0, 8).map((r) => '<tr><td class="nowrap">' + h(ui.date(r.date)) + '</td><td>' + h(r.description) + '</td><td class="num">' + h(Buku.money.format(r.amount, dec)) + '</td></tr>').join('') + '</tbody></table></div>' + (parsed.length > 8 ? '<p class="note">' + h(t('…and {n} more', { n: parsed.length - 8 })) + '</p>' : '');
      } catch (e) { parsed = null; pv.innerHTML = '<div class="banner bad"><div>' + h(ui.errorText(e)) + '</div></div>'; }
    };
    m.body.querySelector('[name=file]').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; fileName = f.name; text = await f.text(); m.body.querySelector('#map').dataset.built = ''; preview(); });
    m.body.addEventListener('change', (e) => { if (e.target.name === 'preset') { m.body.querySelector('#map').dataset.built = ''; } if (e.target.name !== 'file') preview(); });
  }

  // ---------------- Reconcile ----------------
  function reconcile(a, q) {
    const db = Buku.db;
    const dec = ui.curDecimals(a.cur);
    const date = q.date || Buku.util.today();
    const lastLine = db.get('SELECT balance, date FROM bank_import_lines WHERE account_id=? AND date<=? AND balance IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1', [a.id, date]);
    const lines = Buku.banking.uncleared(db, a.id, date);
    const opening = Buku.banking.clearedBalance(db, a.id);
    const hist = db.all('SELECT * FROM reconciliations WHERE account_id=? ORDER BY statement_date DESC LIMIT 12', [a.id]);
    const box = ui.$('#tab');
    box.innerHTML = '<form id="rec"><div class="filters">' + ui.field(t('Statement date'), ui.input('date', date, { type: 'date' })) +
      ui.field(t('Statement closing balance ({cur})', { cur: a.cur }), '<input name="bal" class="num" inputmode="decimal" value="' + h(q.bal || (lastLine ? Buku.money.format(lastLine.balance, dec) : '')) + '">', { hint: lastLine ? t('From the imported statement on {d}', { d: ui.date(lastLine.date) }) : '' }) + '</div>' +
      (lines.length ? '<div class="table-wrap"><table class="data"><thead><tr><th><input type="checkbox" id="all"></th><th>' + h(t('Date')) + '</th><th>' + h(t('Entry')) + '</th><th class="num">' + h(t('In')) + '</th><th class="num">' + h(t('Out')) + '</th></tr></thead><tbody>' +
        lines.map((l) => '<tr><td><input type="checkbox" name="l" value="' + l.id + '" data-amt="' + (l.debit - l.credit) + '"' + (l.import_line_id ? ' checked' : '') + '></td><td class="nowrap">' + h(ui.date(l.date)) + '</td><td><a href="#/journal/' + l.entry_id + '">' + h(l.number) + '</a> ' + h(l.description || l.memo || '') + (l.import_line_id ? ' <span class="chip ok">' + h(t('on statement')) + '</span>' : '') + '</td>' +
          '<td class="num">' + (l.debit ? h(Buku.money.format(l.debit, dec)) : '') + '</td><td class="num">' + (l.credit ? h(Buku.money.format(l.credit, dec)) : '') + '</td></tr>').join('') + '</tbody></table></div>'
        : ui.empty(t('Everything up to this date is already reconciled.'))) +
      '<div class="balance" id="rsum"></div><div class="form-actions"><button type="submit" class="btn primary" id="fin" disabled>' + h(t('Finish reconciliation')) + '</button></div></form>' +
      (hist.length ? '<section class="panel"><header><h2>' + h(t('History')) + '</h2><button type="button" class="btn small ghost" id="undo">' + h(t('Undo last')) + '</button></header><table class="data"><tbody>' +
        hist.map((r) => '<tr><td>' + h(ui.date(r.statement_date)) + '</td><td class="num">' + h(U2().money(r.statement_balance, a.cur)) + '</td><td class="sub">' + h(t('done {d}', { d: ui.date(r.created_at.slice(0, 10)) })) + '</td></tr>').join('') + '</tbody></table></section>' : '');
    const form = ui.$('#rec');
    const calc = () => {
      let stmt = null;
      try { stmt = Buku.money.parse(form.querySelector('[name=bal]').value, dec); } catch (e) { stmt = null; }
      const sel = ui.$$('[name=l]:checked', form).reduce((s, c) => s + Number(c.dataset.amt), 0);
      const cleared = opening + sel;
      const diff = stmt === null ? null : stmt - cleared;
      const el = ui.$('#rsum');
      el.className = 'balance ' + (diff === 0 ? 'is-balanced' : diff === null ? 'is-empty' : 'is-off');
      el.innerHTML = '<div class="bal-side"><span>' + h(t('Cleared in Accu-Z Accounting')) + '</span><strong class="num">' + h(U2().money(cleared, a.cur)) + '</strong></div><div></div>' +
        '<div class="bal-side right"><span>' + h(t('Statement')) + '</span><strong class="num">' + h(stmt === null ? '—' : U2().money(stmt, a.cur)) + '</strong></div>' +
        '<div class="bal-state">' + (diff === 0 ? h(t('Balanced')) : diff === null ? h(t('Enter the statement balance')) : h(t('Off by {amount}', { amount: U2().money(Math.abs(diff), a.cur) }))) + '</div>';
      ui.$('#fin').disabled = diff !== 0;
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'date') location.hash = '#/banking/' + a.id + '?tab=reconcile&date=' + e.target.value; calc(); });
    form.addEventListener('input', calc);
    const all = ui.$('#all'); if (all) all.addEventListener('change', () => { ui.$$('[name=l]', form).forEach((c) => { c.checked = all.checked; }); calc(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const ids = ui.$$('[name=l]:checked', form).map((c) => Number(c.value));
        Buku.banking.reconcile(db, a.id, form.querySelector('[name=date]').value, Buku.money.parse(form.querySelector('[name=bal]').value, dec), ids);
        ui.toast(t('Reconciled')); ui.dispatch();
      } catch (err) { ui.showError(err); }
    });
    const undo = ui.$('#undo'); if (undo) undo.addEventListener('click', async () => { if (await ui.confirm(t('Undo the latest reconciliation of this account?'))) { Buku.banking.undoReconciliation(db, a.id); ui.dispatch(); } });
    calc();
  }

  function rules(a) {
    const db = Buku.db;
    const list = db.all('SELECT r.*, x.code, x.name account_name, c.name contact_name FROM bank_rules r JOIN accounts x ON x.id=r.account_id LEFT JOIN contacts c ON c.id=r.contact_id ORDER BY r.pattern');
    const box = ui.$('#tab');
    box.innerHTML = '<p class="intro">' + h(t('When a statement line contains the text, Accu-Z Accounting suggests (or with “Apply rules”, records) it to the account. Rules apply to all bank accounts.')) + '</p>' +
      '<form id="nr" class="filters">' + ui.field(t('Text contains'), ui.input('pattern', '', { placeholder: 'BIAYA ADM' })) + ui.field(t('Direction'), ui.select('direction', [{ value: 'any', label: t('Both') }, { value: 'in', label: t('Money in') }, { value: 'out', label: t('Money out') }], 'out')) +
      ui.field(t('Account'), ui.select('account_id', ui.accountOptions({ empty: t('Choose account…') }), ''), { cls: 'grow' }) + '<button class="btn" type="submit">' + h(t('Add rule')) + '</button></form>' +
      (list.length ? '<table class="data"><tbody>' + list.map((r) => '<tr><td><strong>' + h(r.pattern) + '</strong></td><td>' + h(t(r.direction === 'in' ? 'Money in' : r.direction === 'out' ? 'Money out' : 'Both')) + '</td><td><span class="mono">' + h(r.code) + '</span> ' + h(r.account_name) + '</td><td class="actions"><button type="button" class="btn small ghost" data-del="' + r.id + '">' + h(t('Delete')) + '</button></td></tr>').join('') + '</tbody></table>' : ui.empty(t('No rules yet.')));
    ui.$('#nr').addEventListener('submit', (e) => { e.preventDefault(); try { const f = ui.formData(ui.$('#nr')); Buku.banking.addRule(db, { pattern: f.pattern, direction: f.direction, account_id: Number(f.account_id) || null }); ui.dispatch(); } catch (err) { ui.showError(err); } });
    ui.$$('[data-del]').forEach((b) => b.addEventListener('click', () => { db.tx(() => db.run('DELETE FROM bank_rules WHERE id=?', [Number(b.dataset.del)])); ui.dispatch(); }));
  }

  ui.route('/banking', overview);
  ui.route('/banking/:id', account);
})();
