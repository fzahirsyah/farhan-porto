/* Buku — SaaS subscriptions: list & detail (handover, cancel, renew), renewals, monthly revenue recognition, MRR. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const U2 = () => Buku.ui2;

  const TABS = [['', 'All'], ['pending_payment', 'Awaiting payment'], ['pending_handover', 'Awaiting handover'], ['active', 'Active'], ['expiring', 'Expiring'], ['expired', 'Expired'], ['cancelled', 'Cancelled']];

  function list(params, q) {
    const db = Buku.db;
    const tab = q.status || '';
    const all = Buku.subscriptions.list(db);
    const rows = all.filter((s) => !tab || s.display === tab || (tab === 'active' && s.display === 'renewed_active') || (tab === 'expired' && s.display === 'renewed'));
    const count = (k) => all.filter((s) => s.display === k).length;
    const mrr = Buku.subscriptions.mrr(db, Buku.util.today());
    ui.page({
      title: t('Subscriptions'),
      actions: '<a class="btn ghost" href="#/renewals">' + h(t('Renewals')) + (count('expiring') + count('expired') ? ' <span class="badge">' + (count('expiring') + count('expired')) + '</span>' : '') + '</a><a class="btn" href="#/recognition">' + h(t('Recognize revenue')) + '</a>',
      body:
        '<div class="kpis kpis-3">' +
        '<div class="kpi"><span class="kpi-label">' + h(t('MRR today')) + '</span><span class="kpi-value num">' + h(ui.idr(mrr.total, { code: true })) + '</span><span class="kpi-sub">' + h(t('{n} active subscriptions', { n: mrr.count })) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label">' + h(t('Awaiting handover')) + '</span><span class="kpi-value num">' + count('pending_handover') + '</span><span class="kpi-sub">' + h(t('Paid, period not started')) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label">' + h(t('Expiring in 30 days')) + '</span><span class="kpi-value num">' + count('expiring') + '</span><span class="kpi-sub">' + h(t('{n} expired, not renewed', { n: count('expired') })) + '</span></div></div>' +
        '<nav class="tabs toolbar">' + TABS.map(([v, l]) => '<a class="' + (tab === v ? 'active' : '') + '" href="#/subscriptions' + ui.qs({ status: v }) + '">' + h(t(l)) + '</a>').join('') + '</nav>' +
        (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Customer')) + '</th><th>' + h(t('Plan')) + '</th><th>' + h(t('Period')) + '</th><th class="num">' + h(t('Amount')) + '</th><th>' + h(t('Recognized')) + '</th><th>' + h(t('Status')) + '</th></tr></thead><tbody>' +
          rows.map((s) => '<tr class="link" data-sub="' + s.id + '"><td><strong>' + h(s.contact_name) + '</strong>' + (s.rep_code ? '<div class="sub">' + h(t('Sales')) + ' ' + h(s.rep_code) + '</div>' : '') + '</td>' +
            '<td>' + h(s.product_name || s.description || '') + '<div class="sub">' + h(t('{n} months', { n: s.months })) + (s.quota_text ? ' · ' + h(s.quota_text) : '') + '</div></td>' +
            '<td class="nowrap">' + (s.start_date ? h(ui.date(s.start_date) + ' – ' + ui.date(s.end_date)) : '<span class="muted">' + h(s.planned_start ? t('planned {d}', { d: ui.date(s.planned_start) }) : t('starts at handover')) + '</span>') + '</td>' +
            '<td class="num">' + h(U2().money(s.amount, s.currency)) + '<div class="sub">' + h(s.invoice_number || '') + '</div></td>' +
            '<td>' + (s.deferred_account_id ? progress(s.recognized_base, s.amount_base) : '<span class="muted">' + h(t('Not deferred')) + '</span>') + '</td>' +
            '<td>' + U2().chip(s.display) + '</td></tr>').join('') + '</tbody></table></div>'
          : ui.empty(tab ? t('Nothing here.') : t('Subscriptions appear when you approve an invoice for a SaaS plan.'), '<a class="btn primary" href="#/doc/new/sales_order">' + h(t('New sales order')) + '</a>')),
    });
    ui.$$('tr[data-sub]').forEach((tr) => tr.addEventListener('click', () => detail(Number(tr.dataset.sub))));
    if (q.open) detail(Number(q.open));
  }

  function progress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return '<div class="progress" title="' + pct + '%"><span style="width:' + pct + '%"></span></div><div class="sub">' + h(ui.idr(done)) + ' / ' + h(ui.idr(total)) + '</div>';
  }

  function detail(id) {
    const db = Buku.db;
    const s = Buku.subscriptions.list(db).find((x) => x.id === id);
    if (!s) return;
    const sched = db.all('SELECT r.*, e.number FROM revenue_schedules r LEFT JOIN journal_entries e ON e.id=r.journal_entry_id WHERE r.subscription_id=? ORDER BY period', [id]);
    const renewal = s.renewed_by_id ? db.get('SELECT * FROM subscriptions WHERE id=?', [s.renewed_by_id]) : null;
    const prev = s.renews_id ? db.get('SELECT * FROM subscriptions WHERE id=?', [s.renews_id]) : null;
    const canHandover = s.status === 'pending_handover';
    const actions = [{ label: t('Close'), kind: 'ghost' }];
    if (s.status !== 'cancelled') actions.unshift({ label: t('Cancel subscription'), kind: 'danger', onClick: () => { cancelModal(s); } });
    if (!s.renewed_by_id && s.status === 'active') actions.push({ label: t('Renew'), onClick: () => renewOne(s.id, 'sales_order') });
    if (canHandover) actions.push({ label: t('Mark handover'), kind: 'primary', onClick: () => handoverModal(s) });
    ui.modal({
      title: s.contact_name + ' · ' + (s.product_name || ''),
      wide: true,
      body: '<dl class="facts">' +
        [[t('Status'), null, U2().chip(s.display)], [t('Months'), String(s.months)], [t('Amount'), U2().money(s.amount, s.currency)], [t('Invoice'), null, s.invoice_id ? '<a href="#/doc/' + s.invoice_id + '">' + h(s.invoice_number) + '</a>' : '—'],
          [t('Start'), s.start_date ? ui.date(s.start_date) : '—'], [t('End'), s.end_date ? ui.date(s.end_date) : '—'], [t('Quota'), s.quota_text || '—'], [t('Handover ref.'), s.handover_ref || '—']]
          .map(([k, v, html]) => '<div><dt>' + h(k) + '</dt><dd>' + (html || h(v)) + '</dd></div>').join('') + '</dl>' +
        (s.status === 'pending_payment' ? '<div class="banner warn"><div>' + h(t('The invoice must be fully settled before handover.')) + '</div></div>' : '') +
        (renewal ? '<p class="note">' + h(t('Renewed by a new subscription starting {d}.', { d: renewal.start_date ? ui.date(renewal.start_date) : t('after handover') })) + '</p>' : '') +
        (prev ? '<p class="note">' + h(t('This renews the subscription that ended {d}.', { d: prev.end_date ? ui.date(prev.end_date) : '' })) + '</p>' : '') +
        (s.cancel_reason ? '<p class="note">' + h(t('Cancelled: {r}', { r: s.cancel_reason })) + '</p>' : '') +
        (sched.length ? '<h3 class="section-title">' + h(t('Revenue schedule')) + '</h3><table class="data"><thead><tr><th>' + h(t('Month')) + '</th><th class="num">' + h(t('Amount (IDR)')) + '</th><th>' + h(t('Recognized')) + '</th></tr></thead><tbody>' +
          sched.map((r) => '<tr><td>' + h(Buku.i18n.formatDate(r.period + '-01', 'monthLong')) + '</td><td class="num">' + h(ui.idr(r.amount_base)) + '</td><td>' + (r.recognized ? '<span class="chip ok">' + h(t('Yes')) + '</span> ' + (r.journal_entry_id ? '<a href="#/journal/' + r.journal_entry_id + '">' + h(r.number || '') + '</a>' : '') : '<span class="chip">' + h(t('Not yet')) + '</span>') + '</td></tr>').join('') + '</tbody></table>'
          : s.deferred_account_id ? '<p class="note">' + h(t('The monthly schedule is created at handover.')) + '</p>' : ''),
      actions,
    });
  }

  function handoverModal(s) {
    ui.modal({
      title: t('Mark handover'),
      body: '<p>' + h(t('The subscription period starts on the go-live date. Revenue is recognized month by month from then.')) + '</p>' +
        ui.field(t('Go-live date'), ui.input('date', s.planned_start && s.planned_start > Buku.util.today() ? s.planned_start : Buku.util.today(), { type: 'date' })) +
        ui.field(t('Handover reference'), ui.input('ref', '', { placeholder: 'BAST-…' }), { optional: true }) +
        ui.field('Revenue allocation', ui.select('method', [{ value:'equal',label:'Equal months' },{value:'daily',label:'Daily proration'}], 'equal')),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Start subscription'), kind: 'primary', onClick: (m) => {
        const f = ui.formData(m.body);
        const end = Buku.subscriptions.handover(Buku.db, s.id, f.date, f.ref, f.method);
        ui.toast(t('Active until {d}', { d: ui.date(end) }));
        ui.dispatch();
      } }],
    });
  }

  function cancelModal(s) {
    ui.modal({
      title: t('Cancel subscription'),
      body: ui.field(t('Reason'), ui.input('reason', '')) +
        '<label class="choice"><input type="radio" name="mode" value="refund" checked><span><strong>' + h(t('Refund the unused months')) + '</strong>' + h(t('Creates an exact unused-service credit note. Deferred revenue changes only on approval.')) + '</span></label>' +
        '<label class="choice"><input type="radio" name="mode" value="recognize"><span><strong>' + h(t('No refund')) + '</strong>' + h(t('Recognizes the remaining deferred revenue now.')) + '</span></label>',
      actions: [{ label: t('Keep it'), kind: 'ghost' }, { label: t('Cancel subscription'), kind: 'danger', onClick: (m) => {
        const f = ui.formData(m.body);
        const result = Buku.subscriptions.cancel(Buku.db, s.id, f.mode, f.reason, Buku.util.today());
        ui.toast(t('Subscription cancelled'));
        if (result.credit_note_id) { location.hash = '#/doc/' + result.credit_note_id; return; }
        ui.dispatch();
      } }],
    });
  }

  function renewOne(id, as) {
    try {
      const docId = Buku.subscriptions.renew(Buku.db, id, { as });
      ui.toast(t('Renewal draft created'));
      location.hash = '#/doc/' + docId;
    } catch (e) {
      if (e.code === 'renewal_exists' && e.details && e.details.document_id) { location.hash = '#/doc/' + e.details.document_id; return; }
      ui.showError(e);
    }
  }

  // ---------------- Renewals ----------------
  function renewals() {
    const db = Buku.db;
    const win = db.setting('renewal_window_days') || 30;
    const subs = Buku.subscriptions.list(db).filter((s) => ['expiring', 'expired'].includes(s.display) || (s.display === 'active' && s.end_date <= Buku.util.addDays(Buku.util.today(), 60)));
    const pending = new Map(db.all(`SELECT l.renews_subscription_id sid, d.id, d.number, d.doc_type, d.status FROM document_lines l JOIN documents d ON d.id=l.document_id
      WHERE l.renews_subscription_id IS NOT NULL AND d.status NOT IN ('void','cancelled','closed')`).map((r) => [r.sid, r]));
    ui.page({
      title: t('Renewals'),
      actions: '<a class="btn ghost" href="#/subscriptions">' + h(t('All subscriptions')) + '</a>',
      body: '<p class="intro">' + h(t('Subscriptions ending soon. “Renew” creates a sales order with the same plan, months and price, starting the day after the current period ends.')) + '</p>' +
        (subs.length ? '<form id="rf"><div class="table-wrap"><table class="data"><thead><tr><th><input type="checkbox" id="all" aria-label="' + h(t('Select all')) + '"></th><th>' + h(t('Customer')) + '</th><th>' + h(t('Plan')) + '</th><th>' + h(t('Ends')) + '</th><th class="num">' + h(t('Amount')) + '</th><th>' + h(t('Status')) + '</th><th>' + h(t('Renewal')) + '</th></tr></thead><tbody>' +
          subs.map((s) => { const p = pending.get(s.id); return '<tr><td>' + (p ? '' : '<input type="checkbox" name="s" value="' + s.id + '">') + '</td><td>' + h(s.contact_name) + '</td><td>' + h(s.product_name || '') + ' · ' + h(t('{n} months', { n: s.months })) + '</td>' +
            '<td class="nowrap">' + h(ui.date(s.end_date)) + '</td><td class="num">' + h(U2().money(s.amount, s.currency)) + '</td><td>' + U2().chip(s.display) + '</td>' +
            '<td>' + (p ? '<a href="#/doc/' + p.id + '">' + h(p.number || t('Draft')) + '</a> ' + U2().chip(U2().docStatus(p)) : '<button type="button" class="btn small" data-renew="' + s.id + '">' + h(t('Renew')) + '</button>') + '</td></tr>'; }).join('') +
          '</tbody></table></div><div class="form-actions"><span class="hint">' + h(t('Window: {n} days (change in Settings → Documents).', { n: win })) + '</span><button type="button" class="btn" id="bulk-inv">' + h(t('Renew selected as invoices')) + '</button><button type="button" class="btn primary" id="bulk-so">' + h(t('Renew selected as sales orders')) + '</button></div></form>'
          : ui.empty(t('Nothing ends in the next 60 days.'))),
    });
    const all = ui.$('#all');
    if (all) all.addEventListener('change', () => ui.$$('[name=s]').forEach((c) => { c.checked = all.checked; }));
    ui.$$('[data-renew]').forEach((b) => b.addEventListener('click', () => renewOne(Number(b.dataset.renew), 'sales_order')));
    const bulk = (as) => {
      const ids = ui.$$('[name=s]:checked').map((c) => Number(c.value));
      if (!ids.length) return ui.toast(t('Select at least one subscription.'), 'error');
      let n = 0;
      try { Buku.db.tx(() => { ids.forEach((id) => { Buku.subscriptions.renew(Buku.db, id, { as }); n++; }); }); ui.toast(t('{n} renewal draft(s) created', { n })); location.hash = as === 'invoice' ? '#/invoices?status=draft' : '#/sales-orders?status=draft'; }
      catch (e) { ui.showError(e); }
    };
    const bs = ui.$('#bulk-so'); if (bs) bs.addEventListener('click', () => bulk('sales_order'));
    const bi = ui.$('#bulk-inv'); if (bi) bi.addEventListener('click', () => bulk('invoice'));
  }

  // ---------------- Recognition ----------------
  function recognition(params, q) {
    const db = Buku.db;
    const month = q.month || Buku.util.today().slice(0, 7);
    const due = Buku.subscriptions.due(db, month);
    const byPeriod = new Map();
    due.forEach((r) => { if (!byPeriod.has(r.period)) byPeriod.set(r.period, []); byPeriod.get(r.period).push(r); });
    const total = due.reduce((s, r) => s + r.amount_base, 0);
    const history = db.all("SELECT * FROM journal_entries WHERE source_type='recognition' AND status='posted' ORDER BY date DESC LIMIT 12");
    const deferredOn = db.setting('deferred_revenue') !== false;
    ui.page({
      title: t('Recognize revenue'),
      cls: 'narrow',
      body: (!deferredOn ? '<div class="banner warn"><div>' + h(t('Deferred revenue is switched off in Settings → Documents. New SaaS invoices go straight to revenue.')) + '</div></div>' : '') +
        '<p class="intro">' + h(t('Each month of an active subscription moves from Pendapatan Diterima di Muka to revenue. Run this at month end; running it again never doubles anything.')) + '</p>' +
        '<form id="mf" class="filters">' + ui.field(t('Up to and including'), ui.input('month', month, { type: 'month' })) + '<button class="btn" type="submit">' + h(t('Show')) + '</button></form>' +
        (due.length ? '<section class="panel"><header><h2>' + h(t('Ready to recognize: {a}', { a: ui.idr(total, { code: true }) })) + '</h2></header>' +
          Array.from(byPeriod).map(([p, rows]) => '<h3 class="section-title">' + h(Buku.i18n.formatDate(p + '-01', 'monthLong')) + '</h3><table class="data"><tbody>' +
            rows.map((r) => '<tr><td>' + h(r.contact_name) + '<div class="sub">' + h(r.description || '') + '</div></td><td class="num">' + h(ui.idr(r.amount_base)) + '</td></tr>').join('') + '</tbody></table>').join('') +
          '<div class="form-actions"><button type="button" class="btn primary" id="run">' + h(t('Post {n} month(s)', { n: byPeriod.size })) + '</button></div></section>'
          : ui.empty(t('Nothing to recognize up to this month.'))) +
        (history.length ? '<section class="panel"><header><h2>' + h(t('Recent recognition entries')) + '</h2></header><table class="data"><tbody>' +
          history.map((e) => '<tr class="link" data-href="#/journal/' + e.id + '"><td>' + h(ui.date(e.date)) + '</td><td class="mono">' + h(e.number) + '</td><td>' + h(e.memo || '') + '</td><td class="num">' + h(ui.idr(e.total_base)) + '</td></tr>').join('') + '</tbody></table></section>' : ''),
    });
    ui.$('#mf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/recognition' + ui.qs(ui.formData(ui.$('#mf'))); });
    const run = ui.$('#run');
    if (run) run.addEventListener('click', () => {
      try { const r = Buku.subscriptions.recognize(db, month); ui.toast(t('{n} entr(ies) posted', { n: r.length })); ui.dispatch(); } catch (e) { ui.showError(e); }
    });
    U2().rowLinks();
  }

  ui.route('/subscriptions', list);
  ui.route('/renewals', renewals);
  ui.route('/recognition', recognition);
})();
