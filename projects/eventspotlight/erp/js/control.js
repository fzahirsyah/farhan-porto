/* Event-day control room: live entry numbers (wall display or laptop), gates, scan feed, dispute desk, incidents, ticket lookup, gate-traffic simulator. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const TABS = [['live', 'Live'], ['disputes', 'Dispute desk'], ['incidents', 'Incidents'], ['gates', 'Gates'], ['lookup', 'Ticket lookup']];
  const RES = { valid: ['Admitted', 'g'], duplicate: ['Duplicate', 'r'], expired: ['Screenshot', 'a'], void: ['Transferred', 'r'], invalid: ['Invalid', 'r'], wrong_event: ['Wrong event', 'r'], refunded: ['Refunded', 'r'], not_open: ['Too early', 'a'] };
  let timer = null, big = false;

  function render(el, param) {
    clearInterval(timer); const ev = E.ev(); if (!ev) { el.innerHTML = E.pageHead('Control room') + ES.ui.empty('No event yet'); return; }
    const tab = TABS.find((t) => t[0] === param) ? param : 'live'; const open = DB().val("SELECT COUNT(*) FROM disputes WHERE event_id=? AND status!='resolved'", [ev.id]); const inc = DB().val("SELECT COUNT(*) FROM incidents WHERE event_id=? AND status='open'", [ev.id]);
    el.innerHTML = '<div id="crHead"></div><div class="tabs" id="ct"></div><div id="cb"></div>';
    $('#crHead').innerHTML = E.pageHead('Control room', `${esc(ev.name)} · ${F.date(ev.date, 'long')}${ev.date === F.today() ? ' · <b>today</b>' : ''}`, `<button class="btn" id="bigBtn">${big ? 'Laptop view' : 'Wall display'}</button>`);
    ES.ui.tabs($('#ct'), TABS.map((t) => ({ id: t[0], label: t[1], count: t[0] === 'disputes' && open ? open : t[0] === 'incidents' && inc ? inc : null, countClass: 'a' })), tab, (t) => (location.hash = '#/control/' + t));
    $('#bigBtn').onclick = () => { big = !big; if (big && el.requestFullscreen) el.requestFullscreen().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen(); render(el, param); };
    ({ live, disputes, incidents, gates, lookup })[tab]($('#cb'), ev);
  }

  // ---------- live ----------
  function live(el, ev) {
    const draw = () => {
      if (!$('#cb')) return clearInterval(timer);
      const s = ES.biz.liveStats(ev.id); const pct = s.sold ? Math.round(s.entered / s.sold * 100) : 0;
      const gs = DB().all("SELECT g.*, (SELECT COUNT(*) FROM scans s WHERE s.gate_id=g.id AND s.result='valid') n, (SELECT COUNT(*) FROM scans s WHERE s.gate_id=g.id AND s.result IN ('duplicate','expired','void','invalid')) bad FROM gates g WHERE g.event_id=?", [ev.id]);
      const hours = DB().all("SELECT substr(at,12,2) h, COUNT(*) n FROM scans WHERE event_id=? AND result='valid' GROUP BY h ORDER BY h", [ev.id]); const hmax = Math.max(1, ...hours.map((h) => h.n));
      const feed = DB().all("SELECT s.*, g.name gate, t.holder_name, tt.name type FROM scans s LEFT JOIN gates g ON g.id=s.gate_id LEFT JOIN tickets t ON t.id=s.ticket_id LEFT JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE s.event_id=? ORDER BY s.id DESC LIMIT 14", [ev.id]);
      const kp = (l, n, d, cls) => `<div class="card kpi"><div class="l">${l}</div><div class="n" ${cls ? `style="color:var(--${cls})"` : ''}>${n}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
      $('#cb').innerHTML = `<div class="cr ${big ? 'big' : ''}"><div class="grid g4">${kp('Inside', F.num(s.entered), `${pct}% of ${F.num(s.sold)} sold`, 'green')}${kp('Last 5 minutes', F.num(s.last5), 'people admitted')}${kp('Duplicates blocked', F.num(s.dup), 'same ticket scanned again', s.dup ? 'red' : '')}${kp('Screenshots blocked', F.num(s.expired), 'expired codes', s.expired ? 'red' : '')}</div>
        <div class="grid g4">${kp('Open disputes', F.num(s.openDisputes), `${s.resolvedDisputes} resolved · rescue pool ${s.pool}`, s.openDisputes ? 'red' : '')}${kp('Open incidents', F.num(s.openIncidents), '', s.openIncidents ? 'red' : '')}${kp('Invalid scans', F.num(s.invalid), 'forged, void, wrong event')}<div class="card kpi"><div class="l">Entry progress</div><div class="bar" style="height:22px;margin-top:14px"><i style="width:${pct}%"></i></div><div class="d">${F.num(s.sold - s.entered)} still to arrive</div></div></div>
        <div class="grid g2"><div class="card"><div class="card-h"><h3>Gates</h3></div>${gs.map((g) => `<div style="margin-bottom:12px"><div class="row"><b>${esc(g.name)}</b> ${g.open ? '' : tag('Closed', 'r')}<span class="spacer"></span><span>${F.num(g.n)} in${g.bad ? ' · ' + g.bad + ' problems' : ''}</span></div><div class="bar g"><i style="width:${s.entered ? g.n / s.entered * 100 : 0}%"></i></div></div>`).join('') || '<div class="muted">No gates</div>'}
          <div class="card-h" style="margin-top:14px"><h3>Entries per hour</h3></div>${hours.length ? `<div class="bars" style="height:90px">${hours.map((h) => `<div title="${h.h}:00 · ${h.n}" style="height:${Math.max(4, h.n / hmax * 100)}%"></div>`).join('')}</div><div class="legend"><span>${hours[0].h}:00</span><span style="margin-left:auto">${hours[hours.length - 1].h}:00</span></div>` : '<div class="muted">No entries yet</div>'}</div>
        <div class="card"><div class="card-h"><h3>Scan feed</h3><span class="hint">refreshes every ${ES.cfg.get('control.refresh_seconds', E.ctx())} s and on every change</span></div><div class="feed">${feed.map((f) => `<div class="it row" style="gap:8px"><span class="muted" style="width:52px">${esc((f.at || '').slice(11, 16))}</span>${tag(...(RES[f.result] || [f.result]))}<span style="flex:1">${esc(f.serial || '?')} ${f.holder_name ? '· ' + esc(f.holder_name) : ''}${f.offline ? ' ' + tag('offline sync') : ''}<div class="muted">${esc(f.gate || '')} ${f.detail ? '· ' + esc(f.detail) : ''}</div></span></div>`).join('') || '<div class="muted">No scans yet</div>'}</div></div></div></div>
        ${can('control') && !big ? '<div class="card" style="margin-top:14px"><div class="card-h"><h3>Rehearse</h3><span class="hint">Demo tool: creates realistic gate traffic from real tickets, including duplicates and screenshots</span></div><div class="row" style="gap:8px"><button class="btn" data-sim="25">Simulate 25 arrivals</button><button class="btn" data-sim="150">Simulate 150 arrivals</button></div></div>' : ''}`;
      $$('[data-sim]').forEach((b) => (b.onclick = () => simulate(ev, Number(b.dataset.sim))));
    };
    draw(); timer = setInterval(() => { if (location.hash.startsWith('#/control') && !ES.ui.drawer.isOpen()) draw(); }, Math.max(2, ES.cfg.get('control.refresh_seconds', E.ctx())) * 1000);
  }
  async function simulate(ev, n) {
    const g = DB().all("SELECT * FROM gates WHERE event_id=? AND kind!='exit'", [ev.id]); const tix = DB().all("SELECT * FROM tickets WHERE event_id=? AND status='valid' AND rescue=0 ORDER BY RANDOM() LIMIT ?", [ev.id, n]);
    if (!tix.length) return toast('No valid tickets to scan', 'err'); const rot = ES.cfg.get('qr.rotate_seconds', E.ctx());
    const r = await E.act('simulated gate traffic', () => { const c = { ok: 0, dup: 0, shot: 0, bad: 0 };
      tix.forEach((t, i) => { const gate = g[i % g.length]; const o = { eventId: ev.id, gateId: gate.id, device: 'SIM-' + gate.id, userName: 'Simulator' };
        const roll = Math.random(); let res;
        if (roll < 0.04) { res = ES.tix.scan(ES.tix.qrToken(t, Date.now() - 5 * 60000, rot), o); c.shot++; } // screenshot from five minutes ago
        else if (roll < 0.06) { res = ES.tix.scan('ES1.' + t.serial + '.' + Math.floor(Date.now() / 1000 / rot) + '.0000000000', o); c.bad++; } // forged
        else { res = ES.tix.scan(ES.tix.qrToken(t, Date.now(), rot), o); if (res.result === 'valid') { c.ok++; if (Math.random() < 0.05) { ES.tix.scan(ES.tix.qrToken(t, Date.now(), rot), Object.assign({}, o, { gateId: g[(i + 1) % g.length].id })); c.dup++; } } } });
      return c; });
    if (r) toast(`${r.ok} admitted, ${r.dup} duplicates, ${r.shot} screenshots, ${r.bad} forged`, 'ok');
  }

  // ---------- disputes ----------
  const DST = { open: ['Open', 'a'], otp_sent: ['Code sent', 'b'], verified: ['Verified', 'g'], resolved: ['Resolved', ''] };
  function disputes(el, ev) {
    const rows = DB().all("SELECT d.*, t.holder_name, t.holder_phone, t.status tstatus, t.used_at, tt.name type, g.name gate FROM disputes d LEFT JOIN tickets t ON t.id=d.ticket_id LEFT JOIN ticket_types tt ON tt.id=t.ticket_type_id LEFT JOIN gates g ON g.id=d.gate_id WHERE d.event_id=? ORDER BY CASE d.status WHEN 'resolved' THEN 1 ELSE 0 END, d.id DESC", [ev.id]);
    const pool = DB().val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='pool'", [ev.id]);
    el.innerHTML = `<div class="notice" style="margin-bottom:12px">A guest at the gate says their ticket was already used. Everyone who bought from a scalper can still get in <b>if they are the real buyer of record</b>: send a one-time code to the phone that bought the ticket, check it, then issue a rescue ticket from the pool. Rescue pool left: <b>${pool}</b>.</div><div class="card"><div id="dp"></div></div>`;
    ES.ui.dataTable($('#dp'), { rows, noSearch: true, emptyTitle: 'No disputes', columns: [{ key: 'created_at', label: 'Opened', render: (r) => F.stamp(r.created_at) }, { key: 'serial', label: 'Ticket', render: (r) => `<b>${esc(r.serial)}</b><div class="sub">${esc(r.type || '')}</div>` }, { key: 'claimant_name', label: 'Claimant', render: (r) => esc(r.claimant_name || '—') }, { key: 'holder_name', label: 'Buyer of record', render: (r) => esc(r.holder_name ? r.holder_name + ' · ' + F.mask(r.holder_phone) : '—') }, { key: 'gate', label: 'Gate' },
      { key: 'status', label: 'Status', render: (r) => tag(...(DST[r.status] || [r.status])) + (r.resolution ? `<div class="sub">${esc(r.resolution)}</div>` : '') }], onRow: dispDrawer });
  }
  function dispDrawer(r0) {
    const d = DB().get("SELECT d.*, t.holder_name, t.holder_phone, t.used_at, t.used_gate, tt.name type, tt.id type_id FROM disputes d LEFT JOIN tickets t ON t.id=d.ticket_id LEFT JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE d.id=?", [r0.id]); const first = DB().get("SELECT s.*, g.name gate FROM scans s LEFT JOIN gates g ON g.id=s.gate_id WHERE s.serial=? AND s.result='valid' ORDER BY s.at LIMIT 1", [d.serial]);
    const done = d.status === 'resolved'; const dp = can('disputes');
    ES.ui.drawer.open({ title: 'Dispute · ' + d.serial, wide: true, body: `<div class="kv"><span>Ticket</span><span>${esc(d.serial)} · ${esc(d.type || '')}</span><span>Buyer of record</span><span>${esc(d.holder_name || '—')} · ${esc(d.holder_phone ? F.mask(d.holder_phone) : '')}</span><span>First scan</span><span>${first ? F.stamp(first.at) + ' at ' + esc(first.gate || '?') : 'Not scanned'}</span><span>Claimant</span><span>${esc(d.claimant_name || '—')} ${d.claimant_phone ? '· ' + esc(d.claimant_phone) : ''}</span><span>Status</span><span>${tag(...(DST[d.status] || [d.status]))}</span>${d.resolution ? `<span>Result</span><span>${esc(d.resolution)} ${d.notes ? '· ' + esc(d.notes) : ''}</span>` : ''}</div>
      ${done ? '' : `<div class="section-t" style="margin:18px 0 6px">1. Verify the buyer</div><p class="muted" style="margin-bottom:8px">A text with a 6-digit code is sent to the phone that bought the ticket. The guest must read it out. A scalper cannot.</p><div class="row" style="gap:8px"><button class="btn" id="dOtp" ${dp && d.holder_phone ? '' : 'disabled'}>Send code to ${esc(d.holder_phone ? F.mask(d.holder_phone) : 'buyer')}</button><input class="input" id="dCode" placeholder="Code the guest reads out" style="max-width:220px" ${d.status === 'verified' ? 'disabled' : ''}><button class="btn" id="dVer" ${d.status === 'otp_sent' && dp ? '' : 'disabled'}>Check code</button></div>
        <div class="section-t" style="margin:18px 0 6px">2. Decide</div><div class="row" style="gap:8px"><button class="btn go" id="dRescue" ${d.status === 'verified' && dp ? '' : 'disabled'}>Issue rescue ticket at face value</button><button class="btn" id="dFree" ${d.status === 'verified' && dp ? '' : 'disabled'}>Issue free (our mistake)</button><button class="btn danger" id="dRej" ${dp ? '' : 'disabled'}>Reject</button></div><div class="muted" style="margin-top:8px">The code is sent to the Outbox as a text message in this demo.</div>`}`,
      onMount: (b, dr) => {
        const on = (id, fn) => { const x = $(id, dr); if (x) x.onclick = fn; };
        on('#dOtp', async () => { const r = await E.act('dispute otp', () => ES.tix.disputeOtp(d.id), null); if (r) { toast('Code sent to ' + r.sentTo, 'ok'); dispDrawer(d); } });
        on('#dVer', async () => { try { await ES.db.write('dispute verify', () => ES.tix.disputeVerify(d.id, $('#dCode', dr).value)); toast('Buyer verified', 'ok'); E.refresh(); dispDrawer(d); } catch (e) { toast(e.message, 'err'); } });
        const rescue = (free) => async () => { const t = await E.act('dispute rescue', () => ES.tix.disputeRescue(d.id, { typeId: d.type_id, free, method: free ? 'Waived' : 'Cash at desk' })); if (t) { toast('Rescue ticket ' + t.serial + ' issued', 'ok'); ES.ui.drawer.close(); } };
        on('#dRescue', rescue(false)); on('#dFree', rescue(true));
        on('#dRej', async () => { if (!(await ES.ui.confirm('Reject this dispute?', 'The guest is not admitted on this ticket.', { danger: true, ok: 'Reject' }))) return; await E.act('dispute reject', () => ES.tix.disputeReject(d.id, 'Buyer could not be verified'), 'Rejected'); ES.ui.drawer.close(); });
      } });
  }

  // ---------- incidents ----------
  function incidents(el, ev) {
    const rows = DB().all('SELECT i.*, u.short assignee FROM incidents i LEFT JOIN users u ON u.id=i.assigned_to WHERE i.event_id=? ORDER BY CASE i.status WHEN \'open\' THEN 0 ELSE 1 END, i.id DESC', [ev.id]);
    el.innerHTML = `<div class="card"><div class="card-h"><h3>Incident log</h3>${can('control') || can('crew') ? '<button class="btn primary sm" style="margin-left:auto" id="addI">Report incident</button>' : ''}</div><div id="ic"></div></div>`;
    ES.ui.dataTable($('#ic'), { rows, exportName: 'incidents', searchKeys: ['kind', 'description', 'location'], filters: [{ key: 'status', label: 'Status', options: [['open', 'Open'], ['resolved', 'Resolved']] }], columns: [{ key: 'at', label: 'When', render: (r) => F.stamp(r.at) }, { key: 'kind', label: 'Kind' }, { key: 'severity', label: 'Severity', render: (r) => tag(r.severity, r.severity === 'high' ? 'r' : r.severity === 'low' ? '' : 'a') }, { key: 'location', label: 'Where' }, { key: 'description', label: 'What happened' }, { key: 'assignee', label: 'Assigned' }, { key: 'status', label: 'Status', render: (r) => tag(r.status, r.status === 'open' ? 'a' : 'g') }], onRow: incDrawer });
    if ($('#addI')) $('#addI').onclick = () => incForm(ev);
  }
  function incForm(ev) {
    const us = DB().all('SELECT id,name FROM users WHERE active=1');
    const f = [{ name: 'kind', label: 'Kind', type: 'select', options: ['Medical', 'Security', 'Crowd', 'Technical', 'Weather', 'Lost child', 'Other'].map((x) => [x, x]) }, { name: 'severity', label: 'Severity', type: 'select', options: [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], default: 'normal' }, { name: 'location', label: 'Where', required: true }, { name: 'assigned_to', label: 'Assign to', type: 'select', placeholder: 'Nobody yet', options: us.map((u) => [u.id, u.name]) }, { name: 'description', label: 'What happened', type: 'textarea', required: true, full: true }];
    ES.ui.drawer.open({ title: 'Report incident', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Report</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('incident', () => { DB().insert('incidents', { event_id: ev.id, kind: v.kind, severity: v.severity, location: v.location, description: v.description, reported_by: ES.session.name, status: 'open', at: F.nowStamp(), assigned_to: v.assigned_to ? Number(v.assigned_to) : null }); if (v.severity === 'high') DB().notify('all', 'High severity incident', v.kind + ' · ' + v.location, { link: '#/control/incidents' }); DB().log('incident', 'incidents', 0, v.kind + ' · ' + v.location); }, 'Reported'); ES.ui.drawer.close(); }; } });
  }
  function incDrawer(i) {
    ES.ui.drawer.open({ title: i.kind + ' · ' + i.location, body: `<div class="kv"><span>When</span><span>${F.stamp(i.at)}</span><span>Severity</span><span>${tag(i.severity, i.severity === 'high' ? 'r' : 'a')}</span><span>Reported by</span><span>${esc(i.reported_by || '')}</span><span>Assigned</span><span>${esc(i.assignee || 'Nobody')}</span><span>Status</span><span>${tag(i.status, i.status === 'open' ? 'a' : 'g')}</span></div><p style="margin-top:14px">${esc(i.description)}</p>${i.resolution ? `<div class="notice ok" style="margin-top:12px">Resolved ${F.stamp(i.resolved_at)}: ${esc(i.resolution)}</div>` : ''}
      ${i.status === 'open' && (can('control') || can('crew')) ? ES.ui.formHTML([{ name: 'resolution', label: 'How was it resolved?', type: 'textarea', full: true }]) : ''}`, footer: i.status === 'open' && (can('control') || can('crew')) ? '<button class="btn go" data-s>Mark resolved</button>' : '', onMount: (b, d) => { const s = d.querySelector('[data-s]'); if (s) s.onclick = async () => { const v = ES.ui.readForm(b, [{ name: 'resolution' }]); if (!v.resolution) return toast('Write how it was resolved', 'err'); await E.act('incident resolved', () => DB().update('incidents', i.id, { status: 'resolved', resolved_at: F.nowStamp(), resolution: v.resolution }), 'Resolved'); ES.ui.drawer.close(); }; } });
  }

  // ---------- gates ----------
  function gates(el, ev) {
    const gs = DB().all("SELECT g.*, (SELECT COUNT(*) FROM scans s WHERE s.gate_id=g.id AND s.result='valid') n FROM gates g WHERE g.event_id=?", [ev.id]); const cx = E.ctx();
    el.innerHTML = `<div class="grid g2"><div class="card"><div class="card-h"><h3>Gates</h3></div>${gs.map((g) => `<div class="list"><div class="it"><div style="flex:1"><b>${esc(g.name)}</b><div class="muted">${esc(g.kind)} · ${g.lanes} lanes · ${F.num(g.n)} admitted</div></div>${g.open ? tag('Open', 'g') : tag('Closed', 'r')}${can('control') ? `<button class="btn sm" data-g="${g.id}">${g.open ? 'Close gate' : 'Open gate'}</button>` : ''}</div></div>`).join('')}</div>
      <div class="card"><div class="card-h"><h3>Scanning rules in force</h3></div><div class="kv"><span>QR refresh</span><span>every ${ES.cfg.get('qr.rotate_seconds', cx)} seconds</span><span>Grace</span><span>${ES.cfg.get('qr.grace_windows', cx)} window</span><span>Event-day only</span><span>${ES.cfg.get('scan.event_day_only', cx) ? 'Yes' : 'No (rehearsal mode)'}</span><span>Offline scanning</span><span>${ES.cfg.get('scan.offline_allowed', cx) ? 'Allowed' : 'Off'}</span><span>Re-entry</span><span>${ES.cfg.get('scan.allow_reentry', cx) ? 'Allowed' : 'Not allowed'}</span></div><div class="muted" style="margin-top:10px">Change these in Ticketing → Rules.</div></div></div>`;
    $$('[data-g]', el).forEach((b) => (b.onclick = () => E.act('gate', () => { const g = gs.find((x) => x.id === Number(b.dataset.g)); DB().update('gates', g.id, { open: g.open ? 0 : 1 }); DB().log('gate ' + (g.open ? 'closed' : 'opened'), 'gates', g.id, g.name); })));
  }

  // ---------- lookup ----------
  function lookup(el, ev) {
    el.innerHTML = `<div class="card" style="max-width:720px"><div class="card-h"><h3>Find a ticket</h3></div><div class="row" style="gap:8px"><input class="input" id="lq" placeholder="Serial number, name or phone" style="flex:1"><button class="btn primary" id="lgo">Search</button></div><div id="lr" style="margin-top:14px"></div></div>`;
    const go = () => { const q = $('#lq').value.trim(); if (q.length < 2) return; const like = '%' + q + '%'; const rows = DB().all("SELECT t.*, tt.name type FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.event_id=? AND (t.serial LIKE ? OR t.holder_name LIKE ? OR t.holder_phone LIKE ?) LIMIT 12", [ev.id, like, like, like]);
      $('#lr').innerHTML = rows.map((t) => `<div class="list"><div class="it"><b>${esc(t.serial)}</b><span>${esc(t.type)}</span><span>${esc(t.holder_name || '')}</span><span class="spacer"></span>${tag(t.status, t.status === 'valid' ? 'g' : t.status === 'used' ? 'b' : 'r')}<span class="muted">${t.used_at ? F.stamp(t.used_at) : ''}</span></div></div>`).join('') || '<div class="muted">No ticket found</div>'; };
    $('#lgo').onclick = go; $('#lq').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }

  E.register('control', { label: 'Control room', icon: 'live', section: 'Event day', perm: 'control', render, keywords: 'live gates scans disputes incidents entry', badge: () => { const e = E.eventId(); return e ? DB().val("SELECT COUNT(*) FROM disputes WHERE event_id=? AND status!='resolved'", [e]) || 0 : 0; } });
  E.register('disputes', { label: 'Dispute desk', icon: 'check', perm: 'disputes', render: (el) => { location.replace('#/control/disputes'); } });
})();
