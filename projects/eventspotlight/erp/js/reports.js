/* Post-event reports for three audiences: investor (money), sponsor (booth visitors with margin of error), operations (entry, problems, vendors, checklists). */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const TABS = [['investor', 'Investor'], ['sponsor', 'Sponsor'], ['ops', 'Operations']]; let sponsorId = 0;

  function render(el, param) {
    const ev = E.ev(); if (!ev) { el.innerHTML = E.pageHead('Reports') + ES.ui.empty('No event yet'); return; }
    const [t0, sid] = (param || 'investor').split('/'); const tab = TABS.find((t) => t[0] === t0) ? t0 : 'investor'; if (sid) sponsorId = Number(sid);
    const deals = DB().all("SELECT id,company FROM sponsor_deals WHERE event_id=? AND stage='signed' ORDER BY company", [ev.id]); if (!sponsorId || !deals.some((d) => d.id === sponsorId)) sponsorId = deals[0] ? deals[0].id : 0;
    const prelim = ev.date > F.today();
    el.innerHTML = E.pageHead('Reports', esc(ev.name) + (prelim ? ' · the event has not happened yet, so these numbers are a preview' : ''), '<button class="btn" id="rPdf">⬇ PDF</button><button class="btn" id="rXls">⬇ Excel</button>') + '<div class="tabs" id="rt"></div>' +
      (tab === 'sponsor' ? `<div class="row" style="margin-bottom:12px;gap:8px"><span class="muted">Sponsor</span><select class="input" id="rSp" style="width:auto">${deals.map((d) => `<option value="${d.id}" ${d.id === sponsorId ? 'selected' : ''}>${esc(d.company)}</option>`).join('')}</select></div>` : '') + '<div class="card" style="padding:8px"><div id="rv"></div></div>';
    ES.ui.tabs($('#rt'), TABS.map((t) => ({ id: t[0], label: t[1] })), tab, (t) => (location.hash = '#/reports/' + t)); if ($('#rSp')) $('#rSp').onchange = (e) => { sponsorId = Number(e.target.value); E.refresh(); };
    const m = ({ investor, sponsor, ops })[tab](ev, prelim); let pages;
    try { pages = ES.docs.build(m.doc); ES.paper.viewer($('#rv'), pages, { label: 'A4 (210 × 297 mm)' }); } catch (e) { $('#rv').innerHTML = `<div class="notice">Could not build the report: ${esc(e.message)}</div>`; }
    $('#rPdf').onclick = () => pages && ES.paper.toPdf(pages, ES.exp.fileName(m.doc.title + ' ' + ev.name, 'pdf'));
    $('#rXls').onclick = () => ES.exp.download('xlsx', m.doc.title + ' ' + ev.name, m.sheet.head, m.sheet.rows, { title: m.doc.title, numCols: m.sheet.head.map((h, i) => i > 0) });
  }
  const base = (ev, title, to, prelim) => { const o = DB().get('SELECT * FROM org WHERE id=1') || {}; return { title, no: (prelim ? 'PREVIEW · ' : '') + F.date(F.today()), to: { label: 'Prepared for', lines: [to] }, meta: [['Event', ev.name], ['Date', F.date(ev.date, 'long')], ['Venue', [ev.venue, ev.city].filter(Boolean).join(', ')]], blocks: [], notes: prelim ? ['Preview: the event has not taken place. Figures will change.'] : [], sign: { city: o.city, date: F.today(), title: o.name, name: o.signatory } }; };

  function investor(ev, prelim) {
    const d = base(ev, 'Investor report', 'Investors', prelim); const is = ES.ledger.incomeStatement(ev.id); const t = ES.ledger.trial(ev.id); const g = (c) => (t.find((r) => r.code === c) || { net: 0 }).net;
    const sold = DB().val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status IN ('valid','used') AND rescue=0", [ev.id]) || 0, used = DB().val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='used'", [ev.id]) || 0; const rev = DB().val("SELECT COALESCE(SUM(subtotal),0) FROM orders WHERE event_id=? AND status='paid'", [ev.id]) || 0;
    const spon = DB().val("SELECT COALESCE(SUM(value),0) FROM sponsor_deals WHERE event_id=? AND stage='signed'", [ev.id]) || 0; const bl = ES.ledger.budgetStatus(ev.id); const planned = bl.reduce((a, b) => a + b.planned, 0), committed = bl.reduce((a, b) => a + b.committed, 0);
    const cats = {}; bl.forEach((b) => { const c = (cats[b.category] = cats[b.category] || { p: 0, c: 0 }); c.p += b.planned; c.c += b.committed; }); const proj = rev + spon - committed;
    d.blocks = [{ t: 'h2', text: 'Result' }, { t: 'p', text: `${F.num(sold)} tickets sold${used ? ', ' + F.num(used) + ' scanned at the gate (' + Math.round(used / Math.max(sold, 1) * 100) + '%)' : ''}. Ticket revenue ${F.rp(rev)} and sponsorship ${F.rp(spon)}. Costs committed ${F.rp(committed)} of ${F.rp(planned)} planned. ${prelim ? 'Projected' : 'Final'} result ${F.rp(proj)}.` },
      { t: 'table', head: ['Money', 'Amount'], rows: [['Ticket revenue (to the organiser)', F.rp(rev)], ['Sponsorship signed', F.rp(spon)], ['Costs committed', F.rp(committed)], ['Result', F.rp(proj)], ['Held as deposits until the show', F.rp(g('2100') + g('2110'))], ['Recognised revenue', F.rp(is.totalRevenue)]], numCols: [1], colW: [65, 35] },
      { t: 'h2', text: 'Budget against actual' }, { t: 'table', head: ['Category', 'Planned', 'Committed', 'Difference'], rows: Object.entries(cats).map(([k, v]) => [k, F.rp(v.p), F.rp(v.c), F.rp(v.p - v.c)]), numCols: [1, 2, 3], colW: [34, 22, 22, 22] }];
    return { doc: d, sheet: { head: ['Category', 'Planned', 'Committed'], rows: Object.entries(cats).map(([k, v]) => [k, v.p, v.c]) } };
  }

  function sponsor(ev, prelim) {
    const deal = DB().get('SELECT s.*, p.name pkg, p.benefits FROM sponsor_deals s LEFT JOIN sponsor_packages p ON p.id=s.package_id WHERE s.id=?', [sponsorId]); const d = base(ev, 'Sponsor report', deal ? deal.company : 'Sponsor', prelim);
    if (!deal) { d.blocks = [{ t: 'p', text: 'No signed sponsor yet.' }]; return { doc: d, sheet: { head: ['Hour', 'In'], rows: [] } }; }
    const dev = DB().get('SELECT * FROM booth_devices WHERE deal_id=?', [deal.id]); const rows = DB().all('SELECT hour, SUM(in_count) n FROM booth_counts WHERE deal_id=? GROUP BY hour ORDER BY hour', [deal.id]); const total = rows.reduce((a, r) => a + r.n, 0); const peak = rows.reduce((a, r) => (r.n > a.n ? r : a), { n: 0, hour: '' });
    const err = dev && dev.calibrated && dev.calib_hand ? Math.round(Math.abs(dev.calib_ai - dev.calib_hand) / dev.calib_hand * 100) : null; const entered = DB().val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='used'", [ev.id]) || 0;
    d.blocks = [{ t: 'h2', text: (deal.pkg || 'Sponsorship') + ' · booth ' + (deal.booth_code || '—') }, { t: 'p', text: `Visitors counted at your booth: ${F.num(total)}${entered ? ', about ' + (total / entered * 100).toFixed(0) + '% of the ' + F.num(entered) + ' guests who entered' : ''}. ${peak.n ? 'Busiest hour: ' + peak.hour + ' with ' + F.num(peak.n) + ' visitors.' : ''}` },
      { t: 'p', text: err !== null ? `Counting method: camera head-count, checked against a hand count at the booth. The camera was ${err}% away from the hand count, so please read every number as plus or minus ${Math.max(err, 5)}%. These are estimates, not a guarantee.` : 'Counting method: camera head-count. The counter was not calibrated against a hand count, so please read every number as plus or minus 15%. These are estimates, not a guarantee.' },
      { t: 'table', head: ['Hour', 'Visitors in'], rows: rows.map((r) => [r.hour + ':00', F.num(r.n)]).concat(rows.length ? [['Total', F.num(total)]] : []), numCols: [1], colW: [60, 40] }, { t: 'h2', text: 'What was included' }, { t: 'table', head: ['No', 'Benefit'], rows: String(deal.benefits || '').split('|').filter(Boolean).map((x, i) => [i + 1, x]), colW: [8, 92] }];
    return { doc: d, sheet: { head: ['Hour', 'Visitors in'], rows: rows.map((r) => [r.hour + ':00', r.n]) } };
  }

  function ops(ev, prelim) {
    const d = base(ev, 'Operations report', 'Operations team', prelim); const s = ES.biz.liveStats(ev.id); const hrs = DB().all("SELECT substr(at,12,2) h, COUNT(*) n FROM scans WHERE event_id=? AND result='valid' GROUP BY h ORDER BY h", [ev.id]); const peak = hrs.reduce((a, r) => (r.n > a.n ? r : a), { n: 0, h: '' });
    const gates = DB().all("SELECT g.name, (SELECT COUNT(*) FROM scans s WHERE s.gate_id=g.id AND s.result='valid') n, (SELECT COUNT(*) FROM scans s WHERE s.gate_id=g.id AND s.result!='valid') bad FROM gates g WHERE g.event_id=? AND g.kind!='exit'", [ev.id]);
    const pos = DB().all("SELECT p.*, v.name vendor FROM purchase_orders p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.event_id=? AND p.status!='draft' ORDER BY p.id", [ev.id]); const late = pos.filter((p) => p.due_date && (p.delivered_at ? p.delivered_at.slice(0, 10) > p.due_date : p.due_date < F.today()));
    const cl = DB().all('SELECT c.title, (SELECT COUNT(*) FROM checklist_items i WHERE i.checklist_id=c.id) n, (SELECT COUNT(*) FROM checklist_items i WHERE i.checklist_id=c.id AND i.done=1) done FROM checklists c WHERE c.event_id=?', [ev.id]); const inc = DB().all('SELECT * FROM incidents WHERE event_id=? ORDER BY at', [ev.id]);
    d.blocks = [{ t: 'h2', text: 'Entry' }, { t: 'p', text: `${F.num(s.entered)} of ${F.num(s.sold)} ticket holders entered.${peak.n ? ' Peak hour ' + peak.h + ':00 with ' + F.num(peak.n) + ' admitted.' : ''} Blocked: ${s.dup} duplicate scans and ${s.expired} expired (screenshot) codes. Disputes: ${s.resolvedDisputes + s.openDisputes} (${s.openDisputes} still open).` },
      { t: 'table', head: ['Gate', 'Admitted', 'Problems'], rows: gates.map((g) => [g.name, F.num(g.n), F.num(g.bad)]), numCols: [1, 2], colW: [50, 25, 25] }, { t: 'h2', text: 'Vendors' }, { t: 'p', text: `${pos.length} orders, ${late.length} late or still waiting past their date.` },
      { t: 'table', head: ['Vendor', 'Order', 'Due', 'Delivered'], rows: pos.slice(0, 40).map((p) => [p.vendor || '', p.description, p.due_date ? F.date(p.due_date) : '', p.delivered_at ? F.date(p.delivered_at.slice(0, 10)) : 'No']), colW: [24, 44, 16, 16] }, { t: 'h2', text: 'Checklists' },
      { t: 'table', head: ['Checklist', 'Done'], rows: cl.map((c) => [c.title, c.done + ' of ' + c.n]), numCols: [1], colW: [70, 30] }, { t: 'h2', text: 'Incidents' }, { t: 'table', head: ['When', 'Kind', 'Where', 'Result'], rows: inc.map((i) => [F.stamp(i.at), i.kind, i.location, i.resolution || i.status]), colW: [20, 15, 25, 40] }];
    return { doc: d, sheet: { head: ['Gate', 'Admitted', 'Problems'], rows: gates.map((g) => [g.name, g.n, g.bad]) } };
  }

  E.register('reports', { label: 'Reports', icon: 'rep', section: 'After', perm: 'reports', render, keywords: 'post event report investor sponsor operations pdf' });
})();
