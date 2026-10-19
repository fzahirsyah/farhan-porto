/* Artists: line-up, fee order, and the special-request flow (requested, costed, approved, confirmed) that feeds the budget. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const AST = { negotiating: ['Negotiating', 'a'], contracted: ['Contracted', 'b'], confirmed: ['Confirmed', 'g'], cancelled: ['Cancelled', 'r'] };
  const RST = { requested: ['Needs cost', 'a'], costed: ['Waiting for decision', 'b'], approved: ['Approved', 'g'], confirmed: ['Confirmed with artist', 'g'], declined: ['Declined', 'r'] };
  const CATS = ['Hotel', 'Transport', 'Hospitality', 'Food', 'Backline', 'Technical', 'Security', 'Other'];

  function render(el, param) {
    const ev = E.ev(); if (!ev) { el.innerHTML = E.pageHead('Artists') + ES.ui.empty('No event yet'); return; }
    const as = DB().all('SELECT a.*, (SELECT COUNT(*) FROM artist_requests r WHERE r.artist_id=a.id) nreq, (SELECT COUNT(*) FROM artist_requests r WHERE r.artist_id=a.id AND r.status IN (\'requested\',\'costed\')) nopen, (SELECT COALESCE(SUM(approved_cost),0) FROM artist_requests r WHERE r.artist_id=a.id AND r.status IN (\'approved\',\'confirmed\')) extras FROM artists a WHERE a.event_id=? ORDER BY CASE role WHEN \'headliner\' THEN 0 ELSE 1 END, set_time', [ev.id]);
    const fees = as.reduce((a, r) => a + r.fee, 0), extras = as.reduce((a, r) => a + r.extras, 0); const line = DB().val("SELECT COALESCE(SUM(planned),0) FROM budget_lines WHERE event_id=? AND category='Artists'", [ev.id]) || 0;
    el.innerHTML = E.pageHead('Artists', 'Line-up, fees and special requests. Every approved request becomes an order, so the budget is always current.', can('artists') ? '<button class="btn primary" id="addA">Add artist</button>' : '') +
      `<div class="grid g4" style="margin-bottom:14px"><div class="card kpi"><div class="l">Fees</div><div class="n">${F.rpShort(fees)}</div></div><div class="card kpi"><div class="l">Approved extras</div><div class="n">${F.rpShort(extras)}</div></div><div class="card kpi"><div class="l">Artist budget used</div><div class="n">${line ? Math.round((fees + extras) / line * 100) : 0}%</div><div class="bar ${fees + extras > line ? 'r' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, line ? (fees + extras) / line * 100 : 0)}%"></i></div></div><div class="card kpi"><div class="l">Requests waiting</div><div class="n">${as.reduce((a, r) => a + r.nopen, 0)}</div></div></div>
      <div class="card"><div id="al"></div></div>`;
    ES.ui.dataTable($('#al'), { rows: as, noSearch: true, columns: [{ key: 'name', label: 'Artist', render: (r) => `<b>${esc(r.name)}</b><div class="sub">${esc(r.role)} · ${esc(r.stage || '')}</div>`, value: (r) => r.name }, { key: 'set_time', label: 'Set', render: (r) => (r.set_time ? esc(r.set_time) + ' · ' + r.set_minutes + ' min' : 'Not scheduled'), value: (r) => r.set_time || '' },
      { key: 'fee', label: 'Fee', num: true, render: (r) => F.rp(r.fee) }, { key: 'status', label: 'Status', render: (r) => tag(...(AST[r.status] || [r.status])) }, { key: 'nreq', label: 'Requests', num: true, render: (r) => `${r.nreq}${r.nopen ? ' ' + tag(r.nopen + ' open', 'a') : ''}` }, { key: 'extras', label: 'Extras approved', num: true, render: (r) => F.rp(r.extras) }], onRow: (r) => drawer(r.id) });
    if ($('#addA')) $('#addA').onclick = () => artistForm(ev, null);
    if (param && /^\d+$/.test(param)) drawer(Number(param));
  }

  function artistForm(ev, a) {
    const f = [{ name: 'name', label: 'Artist or band', required: true, full: true }, { name: 'role', label: 'Role', type: 'select', options: [['headliner', 'Headliner'], ['support', 'Support'], ['guest', 'Special guest']] }, { name: 'status', label: 'Status', type: 'select', options: Object.entries(AST).map(([k, v]) => [k, v[0]]) }, { name: 'fee', label: 'Fee (Rp)', type: 'money' },
      { name: 'set_time', label: 'Set time', type: 'time' }, { name: 'set_minutes', label: 'Minutes', type: 'number', min: 10 }, { name: 'stage', label: 'Stage' }, { name: 'contact', label: 'Manager' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }];
    ES.ui.drawer.open({ title: a ? a.name : 'Add artist', body: ES.ui.formHTML(f, a || { role: 'support', status: 'negotiating', set_minutes: 45, stage: 'Main stage' }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, d) => { ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; const rec = Object.assign({}, v, { fee: v.fee || 0, set_minutes: v.set_minutes || 45, set_time: v.set_time || null }); const id = await E.act('artist', () => { if (a) { DB().update('artists', a.id, rec); DB().log('artist edited', 'artists', a.id, v.name); return a.id; } const nid = DB().insert('artists', Object.assign(rec, { event_id: ev.id })); DB().log('artist added', 'artists', nid, v.name); return nid; }, 'Saved'); ES.ui.drawer.close(); if (id) drawer(id); }; } });
  }

  function drawer(id) {
    const a = DB().get('SELECT * FROM artists WHERE id=?', [id]); if (!a) return; const rs = DB().all('SELECT r.*, p.no po_no FROM artist_requests r LEFT JOIN purchase_orders p ON p.id=r.po_id WHERE artist_id=? ORDER BY r.id', [id]); const feePo = a.fee_po_id ? DB().get('SELECT * FROM purchase_orders WHERE id=?', [a.fee_po_id]) : null;
    const total = rs.filter((r) => ['approved', 'confirmed'].includes(r.status)).reduce((s, r) => s + r.approved_cost, 0);
    ES.ui.drawer.open({ title: a.name, wide: true, body: `<div class="kv"><span>Role</span><span>${esc(a.role)}</span><span>Status</span><span>${tag(...(AST[a.status] || [a.status]))}</span><span>Set</span><span>${a.set_time ? esc(a.set_time) + ' · ' + a.set_minutes + ' min · ' + esc(a.stage) : 'Not scheduled'}</span><span>Manager</span><span>${esc(a.contact || '')} ${a.email ? '· ' + esc(a.email) : ''}</span><span>Fee</span><span><b>${F.rp(a.fee)}</b> ${feePo ? '· order ' + esc(feePo.no) + ' ' + tag(feePo.status) : can('vendors') && a.fee > 0 ? '<button class="btn sm" id="feePo">Create fee order</button>' : ''}</span></div>
      <div class="section-t" style="margin:18px 0 6px">Special requests <span class="muted" style="text-transform:none;font:15px var(--font)">· approved extras ${F.rp(total)}</span></div>
      ${rs.length ? `<table class="tbl"><thead><tr><th>Request</th><th class="num">Cost</th><th>Status</th><th></th></tr></thead><tbody>${rs.map((r) => `<tr><td><b>${esc(r.request)}</b><div class="sub">${esc(r.category)}${r.qty > 1 ? ' × ' + r.qty : ''} · asked ${F.stamp(r.created_at)} by ${esc(r.by || '')}${r.note ? '<br>' + esc(r.note) : ''}${r.po_no ? '<br>Order ' + esc(r.po_no) : ''}</div></td><td class="num">${r.est_cost ? F.rp(r.status === 'approved' || r.status === 'confirmed' ? r.approved_cost : r.est_cost) : '—'}</td><td>${tag(...(RST[r.status] || [r.status]))}</td><td style="white-space:nowrap">${actions(r)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">No requests yet</div>'}
      ${can('artists') ? '<button class="btn" style="margin-top:12px" id="addReq">Add a special request</button>' : ''}`, footer: can('artists') ? '<button class="btn" id="editA">Edit artist</button>' : '',
      onMount: (b, d) => {
        if ($('#editA', d)) $('#editA', d).onclick = () => artistForm(E.ev(), a); if ($('#addReq', d)) $('#addReq', d).onclick = () => reqForm(a);
        if ($('#feePo', d)) $('#feePo', d).onclick = async () => { const bl = DB().get("SELECT id FROM budget_lines WHERE event_id=? AND category='Artists' ORDER BY id LIMIT 1", [a.event_id]); await E.act('artist fee order', () => { const po = ES.biz.createPO({ eventId: a.event_id, category: 'Artists', description: 'Performance fee: ' + a.name, amount: a.fee, tax_code: 'PPh23', budget_line_id: bl && bl.id, source: 'artist_fee', source_id: a.id, status: 'ordered' }); DB().update('artists', a.id, { fee_po_id: po.id }); }, 'Fee order created'); drawer(id); };
        $$('[data-r]', d).forEach((x) => (x.onclick = () => reqAction(x.dataset.r, Number(x.dataset.id), a)));
      } });
  }
  function actions(r) {
    const o = [];
    if (r.status === 'requested' && can('artists')) o.push(`<button class="btn sm" data-r="cost" data-id="${r.id}">Add cost</button>`);
    if (r.status === 'costed' && can('artists.approve')) o.push(`<button class="btn sm go" data-r="approve" data-id="${r.id}">Approve</button> <button class="btn sm" data-r="decline" data-id="${r.id}">Decline</button>`);
    if (r.status === 'approved' && can('artists')) o.push(`<button class="btn sm" data-r="confirm" data-id="${r.id}">Confirmed with artist</button>`);
    return o.join(' ');
  }
  async function reqAction(a, id, art) {
    if (a === 'cost') { const f = [{ name: 'cost', label: 'Quoted cost (Rp)', type: 'money', required: true }]; ES.ui.drawer.open({ title: 'Add cost', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save cost</button>', onMount: (b, d) => { ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => drawer(art.id);
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f, (v, fail) => { if (!(v.cost > 0)) fail('cost', 'Enter an amount'); }); if (!v) return; await E.act('cost request', () => ES.biz.costArtistRequest(id, v.cost), 'Costed. It now waits for a decision.'); drawer(art.id); }; } }); return; }
    if (a === 'approve') { const r = DB().get('SELECT * FROM artist_requests WHERE id=?', [id]); if (!(await ES.ui.confirm('Approve this request?', esc(r.request) + ' for ' + F.rp(r.est_cost) + '. An order is created and the amount counts against the Artists budget now.', { ok: 'Approve' }))) return; await E.act('approve request', () => ES.biz.decideArtistRequest(id, true), 'Approved. Order created.'); drawer(art.id); }
    if (a === 'decline') { const f = [{ name: 'note', label: 'Reason', type: 'textarea', required: true, full: true }]; ES.ui.drawer.open({ title: 'Decline request', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn danger" data-s>Decline</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => drawer(art.id);
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('decline request', () => ES.biz.decideArtistRequest(id, false, v.note), 'Declined'); drawer(art.id); }; } }); }
    if (a === 'confirm') { await E.act('confirm request', () => ES.biz.confirmArtistRequest(id), 'Marked as confirmed'); drawer(art.id); }
  }
  function reqForm(a) {
    const f = [{ name: 'category', label: 'Category', type: 'select', options: CATS.map((c) => [c, c]) }, { name: 'qty', label: 'Quantity', type: 'number', min: 1 }, { name: 'request', label: 'What does the artist need?', required: true, full: true }, { name: 'est_cost', label: 'Cost if already known (Rp)', type: 'money', help: 'Leave empty if it still needs a quote.' }];
    ES.ui.drawer.open({ title: 'Special request · ' + a.name, body: ES.ui.formHTML(f, { qty: 1 }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Add request</button>', onMount: (b, d) => { ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => drawer(a.id);
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('artist request', () => ES.biz.addArtistRequest(a.id, v), 'Request added'); drawer(a.id); }; } });
  }

  E.register('artists', { label: 'Artists', icon: 'art', section: 'Partners', perm: 'artists', render, keywords: 'artist rider hospitality special request lineup', badge: () => { const e = E.eventId(); return e ? DB().val("SELECT COUNT(*) FROM artist_requests r JOIN artists a ON a.id=r.artist_id WHERE a.event_id=? AND r.status IN ('requested','costed')", [e]) || 0 : 0; } });
})();
