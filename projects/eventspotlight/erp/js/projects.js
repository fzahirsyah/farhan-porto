/* Projects and events: list, create wizard (one project generates the full set of plans), event details. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const EST = { planning: ['Planning', ''], on_sale: ['On sale', 'g'], live: ['Live', 'b'], closed: ['Closed', ''] };

  function render(el, param) {
    if (param === 'new') return wizard(el);
    const ps = DB().all('SELECT * FROM projects ORDER BY id DESC'); const evs = DB().all('SELECT * FROM events ORDER BY date DESC');
    el.innerHTML = E.pageHead('Projects and events', 'A project holds the budget; each event has its own tickets, plans and books.', can('projects') ? '<a class="btn primary" href="#/projects/new">New project</a>' : '') +
      (ps.length ? ps.map((p) => { const es = evs.filter((e) => e.project_id === p.id); const bud = DB().val('SELECT COALESCE(SUM(planned),0) FROM budget_lines WHERE event_id IN (SELECT id FROM events WHERE project_id=?)', [p.id]) || 0;
        return `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>${esc(p.name)}</h3>${tag(p.status, p.status === 'active' ? 'g' : '')}<span class="hint">Budget ceiling ${F.rp(p.budget_ceiling)} · planned ${F.rp(bud)}</span></div>
          ${es.map((e) => { const sold = DB().val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status IN ('valid','used') AND rescue=0", [e.id]) || 0; return `<div class="list"><div class="it"><div style="flex:1"><b>${esc(e.name)}</b><div class="muted">${F.date(e.date, 'long')} · ${esc(e.venue || '')} · ${F.num(sold)} of ${F.num(e.capacity)} sold</div></div>${tag(...(EST[e.status] || [e.status]))}<button class="btn sm" data-open="${e.id}">Open</button>${can('projects') ? `<button class="btn sm" data-edit="${e.id}">Details</button>` : ''}</div></div>`; }).join('')}</div>`; }).join('') : ES.ui.empty('No projects yet', 'Create one to generate the budget, ticket waves, schedule and checklists.'));
    $$('[data-open]', el).forEach((b) => (b.onclick = () => { E.setEvent(Number(b.dataset.open)); location.hash = '#/home'; }));
    $$('[data-edit]', el).forEach((b) => (b.onclick = () => evForm(DB().get('SELECT * FROM events WHERE id=?', [Number(b.dataset.edit)]))));
  }

  function evForm(e) {
    const f = [{ name: 'name', label: 'Event name', required: true, full: true }, { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'status', label: 'Status', type: 'select', options: Object.entries(EST).map(([k, v]) => [k, v[0]]) }, { name: 'doors', label: 'Doors open', type: 'time' }, { name: 'start_time', label: 'Show starts', type: 'time' }, { name: 'end_time', label: 'Show ends', type: 'time' }, { name: 'capacity', label: 'Capacity', type: 'number', min: 1 },
      { name: 'venue', label: 'Venue', full: true }, { name: 'address', label: 'Address', full: true }, { name: 'city', label: 'City' }, { name: 'description', label: 'Description', type: 'textarea', full: true }];
    ES.ui.drawer.open({ title: e.name, wide: true, body: ES.ui.formHTML(f, e), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f, (v, fail) => { const sold = DB().val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status IN ('valid','used')", [e.id]); if (sold && v.date !== e.date && !ES.auth.can('ticketing.rules')) fail('date', 'Tickets are sold. Only a ticketing lead can move the date.'); if (v.capacity < sold) fail('capacity', 'Capacity is below the ' + sold + ' tickets already sold'); }); if (!v) return;
        await E.act('event', () => { DB().update('events', e.id, v); DB().log('event edited', 'events', e.id, v.name + (v.date !== e.date ? ' · date ' + e.date + ' → ' + v.date : '')); if (v.date !== e.date) DB().notify('all', 'Event date changed', v.name + ' is now on ' + F.date(v.date, 'long'), { link: '#/schedule' }); }, 'Saved'); ES.ui.drawer.close(); E.refreshAll(); }; } });
  }

  function wizard(el) {
    if (!can('projects')) { el.innerHTML = ES.ui.empty('No access'); return; }
    const f = [{ section: 'Project' }, { name: 'project', label: 'Project name', required: true, full: true, placeholder: 'Nusantara Sound Fest 2027' }, { name: 'ceiling', label: 'Budget ceiling (Rp)', type: 'money', required: true, help: 'The most you are willing to spend. Categories are split from this number and you can change them.' },
      { section: 'Event' }, { name: 'ename', label: 'Event name', required: true, full: true }, { name: 'date', label: 'Event date', type: 'date', required: true, min: F.today() }, { name: 'capacity', label: 'Capacity', type: 'number', required: true, min: 50 }, { name: 'doors', label: 'Doors open', type: 'time', default: '15:00' }, { name: 'start', label: 'Show starts', type: 'time', default: '16:00' }, { name: 'end', label: 'Show ends', type: 'time', default: '22:30' },
      { name: 'venue', label: 'Venue', required: true }, { name: 'city', label: 'City', required: true }, { name: 'address', label: 'Address', full: true }];
    const tt = [['General', 350000, 70], ['VIP', 850000, 25], ['Premium', 1500000, 5]];
    el.innerHTML = E.pageHead('New project', 'Creates the budget, ticket types and waves, gates, sponsor packages, milestones, checklists, venue layout and run of show.', '<a class="btn" href="#/projects">Cancel</a>') +
      `<div class="card" style="max-width:900px"><div id="wz">${ES.ui.formHTML(f, { doors: '15:00', start: '16:00', end: '22:30', date: F.addDays(F.today(), 120), capacity: 5000, city: (DB().get('SELECT city FROM org WHERE id=1') || {}).city })}</div>
      <div class="section-t" style="margin:18px 0 6px">Ticket types</div><div class="muted" style="margin-bottom:8px">Share is the percent of capacity. Shares must add up to 100.</div><div id="tts">${tt.map((t) => `<div class="row tt" style="gap:8px;margin-bottom:6px"><input class="input" data-n value="${t[0]}" style="flex:1" placeholder="Name"><input class="input" data-p value="${F.num(t[1])}" style="width:150px;text-align:right" inputmode="numeric"><input class="input" data-s value="${t[2]}" style="width:90px;text-align:right" inputmode="numeric"><span class="muted">%</span></div>`).join('')}</div>
      <div class="row" style="margin-top:18px"><span class="muted" id="wzSum"></span><span class="spacer"></span><button class="btn primary" id="wzGo">Create project and generate plans</button></div></div>`;
    ES.ui.bindMoney($('#wz'));
    const readTT = () => $$('.tt', el).map((r) => ({ name: $('[data-n]', r).value.trim(), price: F.parseNum($('[data-p]', r).value), pct: Number($('[data-s]', r).value) || 0 })).filter((t) => t.name);
    const sum = () => { const s = readTT().reduce((a, t) => a + t.pct, 0); $('#wzSum').innerHTML = `Shares add up to <b style="color:var(--${s === 100 ? 'green' : 'red'})">${s}%</b>`; }; el.addEventListener('input', sum); sum();
    $('#wzGo').onclick = async () => {
      const v = ES.ui.validate($('#wz'), f, (v, fail) => { if (v.ceiling <= 0) fail('ceiling', 'Enter a budget'); }); if (!v) return; const types = readTT(); if (!types.length || types.reduce((a, t) => a + t.pct, 0) !== 100) return toast('Ticket type shares must add up to 100%', 'err'); if (types.some((t) => t.price <= 0)) return toast('Every ticket type needs a price', 'err');
      const first = (role) => (DB().get("SELECT id FROM users WHERE role=? AND active=1 ORDER BY id", [role]) || {}).id; $('#wzGo').disabled = true;
      const id = await E.act('create project', () => {
        const pid = DB().insert('projects', { name: v.project, status: 'active', budget_ceiling: v.ceiling, created_at: F.nowStamp() });
        const eid = DB().insert('events', { project_id: pid, name: v.ename, type: 'Concert', date: v.date, doors: v.doors, start_time: v.start, end_time: v.end, venue: v.venue, address: v.address, city: v.city, capacity: v.capacity, status: 'planning', qr_secret: ES.tix.rand(8), created_at: F.nowStamp() });
        const tids = types.map((t, i) => DB().insert('ticket_types', { event_id: eid, name: t.name, price: t.price, quota: Math.round(v.capacity * t.pct / 100), tier: i === 0 ? 'general' : i === 1 ? 'vip' : 'pit', color: ['#2F5BEA', '#8A5A00', '#C8283D'][i % 3], sort: i }));
        ES.seed.concertTemplate(DB(), { eventId: eid, ceiling: v.ceiling, staffByRole: { producer: first('producer'), ticketing: first('ticketing'), finance: first('finance'), partnerships: first('partnerships') } });
        const pool = Math.round(v.capacity * ES.cfg.get('rescue.pool_pct', {}) / 100); const ev = DB().get('SELECT * FROM events WHERE id=?', [eid]);
        tids.forEach((tid, i) => { const n = Math.round(pool * types[i].pct / 100); for (let k = 0; k < n; k++) ES.tix.mintTicket(ev, { ticket_type_id: tid, status: 'pool', rescue: 1, price: types[i].price }); });
        DB().log('project created', 'projects', pid, v.project); DB().notify('all', 'New project: ' + v.project, v.ename + ' on ' + F.date(v.date, 'long'), { link: '#/schedule' }); return eid;
      }, 'Project created. Plans generated.');
      if (id) { sessionStorage.setItem('es-erp-event', String(id)); location.hash = '#/schedule'; E.refreshAll(); }
    };
  }

  E.register('projects', { label: 'Projects', icon: 'proj', section: 'Plan', perm: 'projects', render, keywords: 'project event create new wizard concert' });
})();
