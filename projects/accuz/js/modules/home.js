/* Buku — overview page: cash, revenue, receivables, MRR, and what needs attention. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;

  function home() {
    const db = Buku.db;
    const U = Buku.util;
    const U2 = Buku.ui2;
    const today = U.today();
    const company = db.get('SELECT * FROM company WHERE id=1');
    const balances = Buku.ledger.accountBalances(db);
    const cashAccs = db.all("SELECT * FROM accounts WHERE subtype IN ('cash','bank') AND is_active=1 ORDER BY code");
    const cashTotal = cashAccs.reduce((s, a) => s + (balances.get(a.id)?.base || 0), 0);
    const mFrom = U.monthStart(today), mTo = U.monthEnd(today);
    const fy = U.fiscalYearStart(today, company.fiscal_year_start_month);
    const pl = Buku.ledger.profitLoss(db, [{ from: mFrom, to: mTo }]);
    const sectionTotal = (s) => pl.blocks.filter((b) => b.type === 'section' && b.section === s).reduce((x, b) => x + b.total[0], 0);
    const revenue = sectionTotal('pl_revenue');
    const monthNet = pl.net[0];
    const ytd = Buku.ledger.netProfit(db, fy, today);
    const ar = db.all("SELECT id FROM accounts WHERE subtype='ar'").reduce((s, a) => s + (balances.get(a.id)?.base || 0), 0);
    const overdue = db.all("SELECT d.*, c.name contact_name FROM documents d JOIN contacts c ON c.id=d.contact_id WHERE d.doc_type='invoice' AND d.status IN ('open','partial') AND d.due_date<? ORDER BY d.due_date", [today]);
    const mrr = Buku.subscriptions.mrr(db, today);
    const subs = Buku.subscriptions.list(db);
    const expiring = subs.filter((s) => s.display === 'expiring');
    const handover = subs.filter((s) => s.display === 'pending_handover');
    const toReview = db.scalar("SELECT count(*) FROM bank_import_lines WHERE status='new'");
    const drafts = db.scalar("SELECT count(*) FROM documents WHERE status='draft'") + db.scalar("SELECT count(*) FROM journal_entries WHERE status='draft'");
    const recog = Buku.subscriptions.due(db, U.monthStart(today, -1).slice(0, 7));
    const entries = db.scalar("SELECT count(*) FROM journal_entries WHERE status='posted'");

    const st = Buku.store.status();
    const reminderDays = db.setting('backup_reminder_days') || 7;
    const newest = [st.lastFileSave || db.meta('last_file_save'), db.meta('last_backup_at')].filter(Boolean).sort().pop();
    const daysSince = newest ? Math.floor((Date.now() - new Date(newest).getTime()) / 86400000) : null;
    let banner = '';
    if (st.fileDirty && (daysSince === null || daysSince >= reminderDays)) {
      banner = '<div class="banner warn"><div><strong>' + h(daysSince === null ? t('These books have never been saved to a file.') : t('Last saved to a file {n} days ago.', { n: daysSince })) + '</strong> ' +
        h(t('Your work is kept in this browser, but clearing browser data would erase it.')) + '</div><button type="button" class="btn small primary" id="save-now">' + h(t('Save to file')) + '</button></div>';
    }
    const kpi = (label, value, sub, href) => '<a class="kpi" href="' + href + '"><span class="kpi-label">' + h(label) + '</span><span class="kpi-value num">' + h(value) + '</span>' + (sub ? '<span class="kpi-sub">' + h(sub) + '</span>' : '') + '</a>';
    const monthName = Buku.i18n.formatDate(today, 'month');
    const overdueAmt = overdue.reduce((s, d) => s + Buku.money.toBase(Buku.docs.balance(d), ui.curDecimals(d.currency), d.rate), 0);

    const todo = [];
    if (overdue.length) todo.push(['#/invoices?status=overdue', t('{n} overdue invoice(s)', { n: overdue.length }), ui.idr(overdueAmt, { code: true })]);
    if (toReview) todo.push(['#/banking', t('{n} bank statement line(s) to review', { n: toReview }), '']);
    if (handover.length) todo.push(['#/subscriptions?status=pending_handover', t('{n} paid subscription(s) waiting for handover', { n: handover.length }), '']);
    if (expiring.length) todo.push(['#/renewals', t('{n} subscription(s) ending soon', { n: expiring.length }), '']);
    if (recog.length) todo.push(['#/recognition?month=' + U.monthStart(today, -1).slice(0, 7), t('Revenue to recognize for {m}', { m: Buku.i18n.formatDate(U.monthStart(today, -1), 'monthLong') }), ui.idr(recog.reduce((s, r) => s + r.amount_base, 0), { code: true })]);
    if (drafts) todo.push(['#/invoices?status=draft', t('{n} draft(s) not finished', { n: drafts }), '']);

    const recentDocs = db.all("SELECT d.*, c.name contact_name FROM documents d LEFT JOIN contacts c ON c.id=d.contact_id ORDER BY d.updated_at DESC LIMIT 7");

    ui.page({
      title: t('Overview'),
      actions: '<a class="btn ghost" href="#/doc/new/sales_order">' + h(t('New sales order')) + '</a><a class="btn primary" href="#/doc/new/invoice">' + h(t('New invoice')) + '</a>',
      body:
        banner +
        (entries === 0 ? '<div class="banner info"><div><strong>' + h(t('Start with your opening balances.')) + '</strong> ' + h(t('Enter what you had in the bank, owed and were owed on the day you start using Accu-Z Accounting.')) + '</div><a class="btn small primary" href="#/accounts/opening">' + h(t('Enter opening balances')) + '</a></div>' : '') +
        '<div class="kpis">' +
        kpi(t('Cash and bank'), ui.idr(cashTotal, { code: true }), t('{n} accounts', { n: cashAccs.length }), '#/banking') +
        kpi(t('Revenue in {month}', { month: monthName }), ui.idr(revenue, { code: true }), t('Profit {amount}', { amount: ui.idr(monthNet) }) + ' · ' + t('Year to date {amount}', { amount: ui.idr(ytd) }), '#/reports/pl' + ui.qs({ from: mFrom, to: mTo })) +
        kpi(t('Receivables'), ui.idr(ar, { code: true }), overdue.length ? t('{n} overdue · {a}', { n: overdue.length, a: ui.idr(overdueAmt) }) : t('Nothing overdue'), '#/reports/ar') +
        kpi(t('MRR'), ui.idr(mrr.total, { code: true }), t('{n} active subscriptions', { n: mrr.count }), '#/reports/deferred') +
        '</div>' +
        '<div class="cols">' +
        '<section class="panel"><header><h2>' + h(t('Needs attention')) + '</h2></header>' +
        (todo.length ? '<ul class="todo">' + todo.map(([href, label, amt]) => '<li><a href="' + href + '"><span>' + h(label) + '</span>' + (amt ? '<strong class="num">' + h(amt) + '</strong>' : '') + '</a></li>').join('') + '</ul>' : '<p class="check-line ok">' + h(t('All caught up.')) + '</p>') +
        '</section>' +
        '<section class="panel"><header><h2>' + h(t('Cash and bank')) + '</h2><a href="#/banking">' + h(t('See all')) + '</a></header>' +
        (cashAccs.length ? '<table class="data"><tbody>' + cashAccs.map((a) => {
          const b = balances.get(a.id) || { base: 0, foreign: 0 };
          const foreign = a.currency && a.currency !== 'IDR';
          return '<tr class="link" data-href="#/banking/' + a.id + '"><td>' + h(Buku.i18n.accName(a)) + '</td><td class="num">' + (foreign ? h(ui.money(b.foreign, a.currency)) + '<div class="sub">' + h(ui.idr(b.base, { code: true })) + '</div>' : h(ui.idr(b.base))) + '</td></tr>';
        }).join('') + '</tbody></table>' : ui.empty(t('No cash or bank accounts yet.'))) + '</section></div>' +
        '<section class="panel"><header><h2>' + h(t('Recent documents')) + '</h2></header>' +
        (recentDocs.length ? '<table class="data"><tbody>' + recentDocs.map((d) => '<tr class="link" data-href="#/doc/' + d.id + '"><td class="nowrap">' + h(ui.date(d.date)) + '</td><td>' + h(t(U2.DOC[d.doc_type].label)) + ' <span class="mono">' + h(d.number || '') + '</span><div class="sub">' + h(d.contact_name || d.subject || '') + '</div></td><td>' + U2.chip(U2.docStatus(d)) + '</td><td class="num">' + h(U2.money(d.total, d.currency)) + '</td></tr>').join('') + '</tbody></table>'
          : ui.empty(t('No documents yet. Create your first sales order or invoice.'), '<a class="btn primary" href="#/doc/new/invoice">' + h(t('New invoice')) + '</a>')) + '</section>',
    });
    ui.$$('#main tr.link').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const sn = ui.$('#save-now');
    if (sn) sn.addEventListener('click', () => Buku.app.saveFile(false));
  }

  ui.route('/home', home);
})();
