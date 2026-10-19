/* Home: decision queue (what needs a person today), key numbers, sales trend. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, { esc, tag } = ES.ui;
  const DB = () => ES.db;

  /* Each item: {id, who:[roles that can act], perm, title, body, tone, link, action?} */
  function queue(eid) {
    const q = []; const d = DB(); const today = F.today();
    d.all("SELECT * FROM approvals WHERE status='pending' AND (event_id=? OR event_id IS NULL) ORDER BY id", [eid]).forEach((a) => {
      const mine = ES.session && a.requested_by_id === ES.session.id;
      q.push({ perm: 'accounting', who: 'Owner or director', tone: 'a', title: a.title, body: a.detail + ' · requested by ' + a.requested_by, link: '#/settings/approvals', tag: mine ? 'Waiting for a second person' : 'Needs your decision', waiting: mine });
    });
    d.all("SELECT p.*, v.name vendor FROM purchase_orders p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.event_id=? AND p.status='invoiced' ORDER BY p.id", [eid]).forEach((p) => {
      const m = ES.biz.match(p);
      q.push({ perm: 'pay.approve', who: 'Finance', tone: m.ok ? 'g' : 'r', title: (m.ok ? 'Ready to pay: ' : 'Does not match: ') + p.vendor, body: p.description + ' · ' + F.rp(p.invoice_amount) + (m.ok ? '' : ' · ' + m.reasons.join('; ')), link: '#/vendors/po/' + p.id, tag: m.ok ? 'Matched' : 'Mismatch' });
    });
    d.all("SELECT r.*, a.name artist FROM artist_requests r JOIN artists a ON a.id=r.artist_id WHERE a.event_id=? AND r.status IN ('costed','requested') ORDER BY r.id", [eid]).forEach((r) => {
      q.push({ perm: 'artists.approve', who: 'Producer', tone: 'a', title: r.artist + ': ' + r.request, body: r.status === 'costed' ? 'Costed at ' + F.rp(r.est_cost) + ' · approve or decline' : 'Needs a cost from the vendor', link: '#/artists', tag: r.status === 'costed' ? 'Decide' : 'Needs cost' });
    });
    const od = d.val("SELECT COUNT(*) FROM disputes WHERE event_id=? AND status!='resolved'", [eid]);
    if (od) q.push({ perm: 'disputes', who: 'Ticketing lead', tone: 'r', title: od + ' open ticket dispute' + (od > 1 ? 's' : ''), body: 'Verify the buyer by one-time code, then issue a rescue ticket or reject.', link: '#/control/disputes', tag: 'Gate' });
    d.all("SELECT * FROM waves WHERE event_id=? AND kind='lottery' AND status IN ('open','closed','scheduled')", [eid]).forEach((w) => {
      const entries = d.val("SELECT COUNT(*) FROM lottery_entries WHERE wave_id=?", [w.id]);
      if (w.status === 'open' && !w.draw_hash) q.push({ perm: 'ticketing.draw', who: 'Ticketing lead', tone: 'a', title: 'Lottery is open: ' + F.num(entries) + ' entries', body: 'Closes ' + F.stamp(w.closes_at) + '. Commit the seed hash before it closes so the draw can be audited.', link: '#/ticketing/lottery', tag: 'Commit hash' });
      if (w.status === 'closed' && !w.drawn_at) q.push({ perm: 'ticketing.draw', who: 'Ticketing lead', tone: 'r', title: 'Lottery closed: run the draw', body: F.num(entries) + ' entries are waiting for a draw.', link: '#/ticketing/lottery', tag: 'Draw' });
    });
    d.all("SELECT p.*, v.name vendor FROM purchase_orders p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.event_id=? AND p.status='ordered' AND p.due_date IS NOT NULL AND p.due_date<? AND p.delivered_at IS NULL", [eid, today]).forEach((p) => {
      q.push({ perm: 'vendors.confirm', who: 'Producer', tone: 'r', title: 'Delivery overdue: ' + p.vendor, body: p.description + ' was due ' + F.date(p.due_date), link: '#/vendors/po/' + p.id, tag: 'Overdue' });
    });
    d.all("SELECT * FROM documents WHERE event_id=? AND type='invoice' AND status IN ('issued','partial') AND due_date<?", [eid, today]).forEach((x) => {
      q.push({ perm: 'accounting', who: 'Finance', tone: 'r', title: 'Invoice overdue: ' + x.party_name, body: x.no + ' · balance ' + F.rp(x.total - x.paid) + ' · due ' + F.date(x.due_date), link: '#/accounting/doc/' + x.id, tag: 'Chase' });
    });
    d.all("SELECT c.*, u.name pic, (SELECT COUNT(*) FROM checklist_items i WHERE i.checklist_id=c.id AND i.done=0) n_open FROM checklists c LEFT JOIN users u ON u.id=c.pic_id WHERE c.event_id=? AND c.due<? ", [eid, today]).filter((c) => c.n_open > 0).forEach((c) => {
      q.push({ perm: 'checklists', who: c.pic || 'PIC', tone: 'a', title: 'Checklist overdue: ' + c.title, body: c.n_open + ' items open · was due ' + F.date(c.due) + ' · PIC ' + (c.pic || 'not set'), link: '#/schedule/checklists', tag: 'Overdue' });
    });
    d.all("SELECT s.*, u.name owner FROM sponsor_deals s LEFT JOIN users u ON u.id=s.owner_id WHERE s.event_id=? AND s.stage NOT IN ('signed','lost') AND s.next_step_date IS NOT NULL AND s.next_step_date<=?", [eid, F.addDays(today, 2)]).forEach((s) => {
      q.push({ perm: 'sponsors', who: s.owner || 'Partnerships', tone: s.next_step_date < today ? 'r' : 'a', title: s.company + ': ' + (s.next_step || 'follow up'), body: 'Due ' + F.date(s.next_step_date) + ' · stage ' + s.stage, link: '#/sponsors/' + s.id, tag: s.next_step_date < today ? 'Overdue' : 'Soon' });
    });
    return q;
  }

  function badge() { const e = E.eventId(); if (!e || !ES.session) return 0; return queue(e).filter((x) => ES.auth.can(x.perm) && !x.waiting).length; }

  function render(el) {
    const ev = E.ev();
    if (!ev) {
      el.innerHTML = E.pageHead('Welcome to Event Spotlight', 'Create your first project and the full set of plans is generated for you.') +
        `<div class="card" style="max-width:640px"><h3>Start with a concert</h3><p class="muted" style="margin:6px 0 14px">One project creates the budget, ticket waves, gates, sponsor packages, schedule, checklists, layout and run of show. You can edit all of it.</p>${ES.auth.can('projects') ? '<a class="btn primary" href="#/projects/new">Create a project</a>' : '<span class="muted">Ask the owner to create a project.</span>'}</div>`;
      return;
    }
    const s = ES.biz.salesSummary(ev.id); const ts = ES.tix.typeStats(ev.id);
    const sold = ts.reduce((a, t) => a + t.sold, 0), cap = ts.reduce((a, t) => a + t.quota, 0);
    const daysTo = F.daysFromToday(ev.date);
    const budget = ES.ledger.budgetStatus(ev.id); const planned = budget.reduce((a, b) => a + b.planned, 0), spent = budget.reduce((a, b) => a + b.committed, 0);
    const items = queue(ev.id); const mine = items.filter((x) => ES.auth.can(x.perm) && !x.waiting); const other = items.filter((x) => !ES.auth.can(x.perm) || x.waiting);
    const sponsorsSigned = DB().val("SELECT COALESCE(SUM(value),0) FROM sponsor_deals WHERE event_id=? AND stage='signed'", [ev.id]) || 0;
    const sponsorsPipe = DB().val("SELECT COALESCE(SUM(value),0) FROM sponsor_deals WHERE event_id=? AND stage NOT IN ('signed','lost')", [ev.id]) || 0;
    const days = {}; s.byDay.forEach((r) => (days[r.d] = (days[r.d] || 0) + r.n)); const keys = Object.keys(days).sort().slice(-30); const max = Math.max(1, ...keys.map((k) => days[k]));
    const item = (x) => `<a class="q-item ${x.waiting ? 'wait' : ''}" href="${esc(x.link)}"><span class="tag ${x.tone}">${esc(x.tag)}</span><div style="flex:1"><b>${esc(x.title)}</b><div class="muted">${esc(x.body)}</div></div><span class="muted">${x.waiting ? 'Waiting' : esc(x.who)}</span></a>`;
    el.innerHTML = E.pageHead(ev.name, `${esc(ev.venue || 'Venue to be set')} · ${F.date(ev.date, 'long')} · ${daysTo > 0 ? daysTo + ' days to go' : daysTo === 0 ? 'Today' : 'Finished'}`, ES.auth.can('projects') ? '<a class="btn" href="#/projects">Projects and events</a>' : '') +
      `<div class="grid g4" style="margin-bottom:16px">
        <a class="card kpi link" href="#/ticketing"><div class="l">Tickets sold</div><div class="n">${F.num(sold)}</div><div class="d">of ${F.num(cap)} · ${cap ? Math.round(sold / cap * 100) : 0}%</div><div class="bar" style="margin-top:6px"><i style="width:${cap ? sold / cap * 100 : 0}%"></i></div></a>
        <a class="card kpi link" href="#/ticketing"><div class="l">Ticket revenue</div><div class="n">${F.rpShort(s.revenue)}</div><div class="d">held as deposits until the show</div></a>
        <a class="card kpi link" href="#/sponsors"><div class="l">Sponsors signed</div><div class="n">${F.rpShort(sponsorsSigned)}</div><div class="d">${F.rpShort(sponsorsPipe)} still in the pipeline</div></a>
        <a class="card kpi link" href="#/accounting/budget"><div class="l">Budget spent</div><div class="n">${planned ? Math.round(spent / planned * 100) : 0}%</div><div class="d">${F.rpShort(spent)} of ${F.rpShort(planned)}</div><div class="bar ${spent > planned ? 'r' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, planned ? spent / planned * 100 : 0)}%"></i></div></a></div>
      <div class="grid g21"><div class="stack">
        <div class="card"><div class="card-h"><h3>Needs a decision</h3><span class="hint">${mine.length} for you · ${other.length} for others</span></div>
          ${mine.length ? mine.map(item).join('') : ES.ui.empty('Nothing waiting for you', 'Decisions and overdue items for your role will show up here.')}
          ${other.length ? `<div class="section-t" style="margin:14px 0 6px">Waiting for someone else</div>${other.slice(0, 8).map(item).join('')}` : ''}</div>
        <div class="card"><div class="card-h"><h3>Tickets sold per day</h3><span class="hint">last ${keys.length} days with sales</span></div>
          ${keys.length ? `<div class="bars">${keys.map((k) => `<div title="${k}: ${days[k]}" style="height:${Math.max(3, days[k] / max * 100)}%"></div>`).join('')}</div><div class="legend"><span>${F.date(keys[0])}</span><span>${F.date(keys[keys.length - 1])}</span></div>` : ES.ui.empty('No sales yet')}</div></div>
        <div class="stack">
          <div class="card"><div class="card-h"><h3>Ticket types</h3></div>${ts.map((t) => `<div style="margin-bottom:12px"><div class="row"><b>${esc(t.name)}</b><span class="spacer"></span><span>${F.num(t.sold)} / ${F.num(t.quota)}</span></div><div class="bar"><i style="width:${t.quota ? t.sold / t.quota * 100 : 0}%"></i></div></div>`).join('')}</div>
          <div class="card"><div class="card-h"><h3>Coming up</h3></div>${DB().all("SELECT * FROM milestones WHERE event_id=? AND status!='done' AND ends>=? ORDER BY starts LIMIT 5", [ev.id, F.today()]).map((m) => `<div class="list"><div class="it"><div style="flex:1"><b>${esc(m.name)}</b><div class="muted">${F.date(m.starts)}${m.ends !== m.starts ? ' to ' + F.date(m.ends) : ''}</div></div>${ES.ui.dueTag(m.starts)}</div></div>`).join('') || '<div class="muted">No upcoming milestones</div>'}</div>
        </div></div>`;
  }
  E.register('home', { label: 'Home', icon: 'home', section: 'Overview', perm: 'home', render, badge, keywords: 'decisions dashboard today' });
  ES.homeQueue = queue;
})();
