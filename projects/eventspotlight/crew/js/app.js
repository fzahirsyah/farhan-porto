/* Event Spotlight Crew: phone app for gate crew and PICs. Scan (camera or typed), offline queue and sync, tasks, run of show, dispute desk, incidents. */
(function () {
  const ES = window.ES, F = ES.fmt, DB = () => ES.db, { $, $$, esc, toast } = ES.ui; const can = (p) => ES.auth.can(p);
  ES.auth.useSessionKey('es-crew-user');
  const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } } };
  let tab = 'scan', stream = null, loop = null, busy = false, det = null;
  const device = (() => { let d = LS.get('es-crew-device', null); if (!d) { d = 'PH-' + Math.random().toString(36).slice(2, 6).toUpperCase(); LS.set('es-crew-device', d); } return d; })();
  const isOffline = () => !!LS.get('es-crew-offline', false) || !navigator.onLine;
  const queue = () => LS.get('es-crew-queue', []);
  const ICON = { scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 12h10"/>', tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>', show: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', desk: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>' };
  const ic = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">${ICON[k]}</svg>`;

  function eventId() { const s = Number(DB().setting('current_event', 0)); if (s && DB().get('SELECT 1 FROM events WHERE id=?', [s])) return s; return DB().val("SELECT id FROM events WHERE status IN ('on_sale','live') ORDER BY date LIMIT 1") || DB().val('SELECT id FROM events ORDER BY date DESC LIMIT 1') || 0; }
  const ev = () => DB().get('SELECT * FROM events WHERE id=?', [eventId()]);

  async function boot() {
    document.body.innerHTML = '<div class="screen"><div class="box" style="text-align:center"><div class="logo">Event Spotlight</div><div class="strip logo-s"></div><p class="muted"><span class="spin"></span> Loading…</p></div></div>';
    try { await ES.db.init('crew'); } catch (e) { document.body.innerHTML = `<div class="screen"><div class="card"><h2>The app could not start</h2><p class="muted">${esc(e.message)}</p></div></div>`; return; }
    ES.db.onChange(onChange); window.addEventListener('online', () => route()); window.addEventListener('offline', () => route());
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    route();
  }
  function route() {
    if (ES.db.state !== 'ready') { document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:480px;text-align:center"><div class="logo" style="font-size:34px">Event Spotlight Crew</div><div class="strip logo-s"></div><p class="muted" style="margin:10px 0">There is no database in this browser yet. Open the ERP app (erp/index.html) in this same browser, create or load a database, then come back.</p><button class="btn primary" onclick="location.reload()">Check again</button></div></div>`; return; }
    if (!ES.auth.loadSession()) return login(); shell();
  }
  function login() {
    const users = DB().all('SELECT * FROM users WHERE active=1 ORDER BY id').filter((u) => ES.auth.permsOf(u).has('crew')); let pins = {}; try { pins = JSON.parse(DB().setting('demo_pins', '{}')); } catch (e) { /* ignore */ }
    document.body.innerHTML = `<div class="screen"><div class="box" style="max-width:520px"><div class="logo" style="font-size:36px">Crew</div><div class="strip logo-s"></div><p class="muted" style="text-align:center">Device ${esc(device)} · who is on shift?</p><div class="users-grid" style="grid-template-columns:1fr 1fr">${users.map((u) => `<div class="user-card" data-u="${u.id}" tabindex="0"><span class="avatar" style="background:${u.color}">${esc(F.initials(u.name))}</span><b>${esc(u.short || u.name)}</b><div class="muted">${esc(u.title || '')}</div>${pins[u.short] ? `<div class="muted">PIN ${pins[u.short]}</div>` : ''}</div>`).join('')}</div></div></div>`;
    $$('[data-u]').forEach((c) => (c.onclick = () => pin(users.find((u) => u.id === Number(c.dataset.u)))));
  }
  function pin(u) {
    let p = ''; $('.box').innerHTML = `<div class="card" style="text-align:center"><span class="avatar" style="background:${u.color};width:56px;height:56px;margin:0 auto">${esc(F.initials(u.name))}</span><h3 style="margin-top:8px">${esc(u.name)}</h3><div class="pindots">${'<i></i>'.repeat(6)}</div><div id="pe" style="color:var(--red);height:24px;font-weight:600"></div><div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, 'OK'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div><button class="btn ghost" id="pb" style="margin-top:10px">← Back</button></div>`;
    const dots = () => $$('.pindots i').forEach((d, i) => d.classList.toggle('on', i < p.length));
    const submit = () => { if (ES.auth.login(u.id, p)) route(); else { p = ''; dots(); $('#pe').textContent = 'Wrong PIN'; } };
    $$('[data-k]').forEach((b) => (b.onclick = () => { const k = b.dataset.k; $('#pe').textContent = ''; if (k === '←') p = p.slice(0, -1); else if (k === 'OK') return submit(); else if (p.length < 6) p += k; dots(); if (p.length >= 4 && ES.auth.hashPin(p) === DB().val('SELECT pin_hash FROM users WHERE id=?', [u.id])) submit(); }));
    $('#pb').onclick = login;
  }

  // ---------- shell ----------
  function gates() { return DB().all("SELECT * FROM gates WHERE event_id=? AND kind!='exit' ORDER BY id", [eventId()]); }
  function gateId() { const k = 'es-crew-gate-' + ES.session.id; let g = LS.get(k, null); const gs = gates(); if (!gs.some((x) => x.id === g)) g = ES.session.gate_id && gs.some((x) => x.id === ES.session.gate_id) ? ES.session.gate_id : (gs[0] && gs[0].id); return g; }
  function myOpen() { return (DB().val("SELECT COUNT(*) FROM checklist_items i JOIN checklists c ON c.id=i.checklist_id WHERE c.pic_id=? AND c.event_id=? AND i.done=0", [ES.session.id, eventId()]) || 0) + (DB().val("SELECT COUNT(*) FROM purchase_orders WHERE pic_id=? AND event_id=? AND status IN ('ordered','invoiced') AND delivered_at IS NULL", [ES.session.id, eventId()]) || 0); }
  function shell() {
    const e = ev(); const off = isOffline(); const q = queue().length; const tabs = [['scan', 'Scan'], ['tasks', 'Tasks'], ['show', 'Show']].concat(can('disputes') ? [['desk', 'Desk']] : []).concat([['more', 'More']]); const open = myOpen();
    document.body.innerHTML = `<div class="chead"><div style="flex:1;min-width:0"><b>${esc(e ? e.name : 'No event')}</b><small>${esc(ES.session.short || ES.session.name)} · ${esc(device)}${e ? ' · ' + F.date(e.date) : ''}</small></div><span class="pill ${off ? 'off' : 'on'}" id="mode">${off ? 'Offline' : 'Online'}${q ? ' · ' + q : ''}</span></div><div class="cview" id="cv"></div>
      <nav class="tabbar">${tabs.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${ic(k)}${l}${k === 'tasks' && open ? `<span class="cnt">${open}</span>` : ''}${k === 'desk' && DB().val("SELECT COUNT(*) FROM disputes WHERE event_id=? AND status!='resolved'", [eventId()]) ? `<span class="cnt">${DB().val("SELECT COUNT(*) FROM disputes WHERE event_id=? AND status!='resolved'", [eventId()])}</span>` : ''}</button>`).join('')}</nav>`;
    $$('.tabbar [data-t]').forEach((b) => (b.onclick = () => { stopCam(); tab = b.dataset.t; shell(); }));
    ({ scan, tasks, show, desk, more })[tab]($('#cv'), e);
  }
  function onChange(m) { if (!ES.auth.loadSession()) return; if (m.remote && ['tasks', 'show', 'desk'].includes(tab) && !$('.res') && !ES.ui.drawer.isOpen() && !document.activeElement.matches('input,textarea,select')) shell(); }

  // ---------- scan ----------
  function snapshot() {
    const e = ev(); const t = {}; DB().all("SELECT t.serial,t.secret,t.status,t.event_id,t.holder_name,tt.name type,tt.requires_id FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.event_id=? AND t.status IN ('valid','used','void','refunded')", [e.id]).forEach((r) => (t[r.serial] = r));
    const c = { eventId: e.id }; const s = { at: F.nowStamp(), eventId: e.id, count: Object.keys(t).length, rotate: ES.cfg.get('qr.rotate_seconds', c), grace: ES.cfg.get('qr.grace_windows', c), t }; LS.set('es-crew-snap', s); return s;
  }
  function scan(el, e) {
    if (!e) { el.innerHTML = '<div class="notice">No event in the database.</div>'; return; }
    const gs = gates(); const gid = gateId(); const off = isOffline(); const snap = LS.get('es-crew-snap', null); const q = queue();
    el.innerHTML = `<div class="row" style="gap:8px;margin-bottom:10px"><select class="input" id="gate" style="flex:1;min-height:48px">${gs.map((g) => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select><button class="btn" id="tgl" style="min-height:48px">${LS.get('es-crew-offline', false) ? 'Go online' : 'Work offline'}</button></div>
      ${off ? `<div class="notice warn" style="margin-bottom:10px">Offline mode. Scans use the ticket list saved on this phone${snap ? ' (' + F.num(snap.count) + ' tickets, saved ' + esc(F.stamp(snap.at)) + ')' : '. <b>No list saved yet: tap “Save ticket list” while online.</b>'}. ${q.length} scans wait to be sent.</div>` : ''}
      <div class="cam" id="cam"><div id="camMsg" style="padding:20px"><b>Camera is off</b><div class="muted" style="color:#ddd">Point the camera at the guest’s QR code</div></div></div>
      <button class="btn primary big-btn" id="camBtn" style="margin-top:10px">Start camera</button>
      <div class="section-t" style="margin:16px 0 6px;display:block">Or type the code</div><div class="row" style="gap:8px"><input class="input" id="code" placeholder="ES1.…" autocapitalize="characters" autocomplete="off" style="flex:1;min-height:52px"><button class="btn primary" id="chk" style="min-height:52px">Check</button></div>
      <div class="row" style="gap:8px;margin-top:12px">${!off ? '<button class="btn" id="snap" style="flex:1;min-height:48px">Save ticket list for offline</button>' : ''}${q.length && navigator.onLine ? `<button class="btn go" id="sync" style="flex:1;min-height:48px">Send ${q.length} offline scans</button>` : ''}</div>
      <details style="margin-top:16px"><summary class="muted" style="cursor:pointer;min-height:40px">Practice tools (demo only)</summary><div class="notice" style="margin:8px 0">Fills the box with a code from a real ticket, so you can rehearse without a camera.</div><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-p="fresh">Fresh code</button><button class="btn sm" data-p="old">Screenshot (old code)</button><button class="btn sm" data-p="used">Already used ticket</button><button class="btn sm" data-p="forged">Forged code</button></div></details>`;
    $('#gate').onchange = (x) => LS.set('es-crew-gate-' + ES.session.id, Number(x.target.value));
    $('#tgl').onclick = async () => { const nowOff = !LS.get('es-crew-offline', false); if (nowOff && !LS.get('es-crew-snap', null)) { try { snapshot(); toast('Ticket list saved on this phone', 'ok'); } catch (err) { /* ignore */ } } LS.set('es-crew-offline', nowOff); if (!nowOff && queue().length && navigator.onLine) { await syncNow(); return; } shell(); };
    $('#camBtn').onclick = startCam; $('#chk').onclick = () => onCode($('#code').value); $('#code').onkeydown = (x) => { if (x.key === 'Enter') onCode($('#code').value); };
    if ($('#snap')) $('#snap').onclick = () => { const s = snapshot(); toast(F.num(s.count) + ' tickets saved on this phone', 'ok'); shell(); };
    if ($('#sync')) $('#sync').onclick = () => syncNow();
    $$('[data-p]').forEach((b) => (b.onclick = () => practice(b.dataset.p)));
  }
  function practice(kind) {
    const e = ev(); const rot = ES.cfg.get('qr.rotate_seconds', { eventId: e.id });
    const t = DB().get(kind === 'used' ? "SELECT * FROM tickets WHERE event_id=? AND status='used' ORDER BY RANDOM() LIMIT 1" : "SELECT * FROM tickets WHERE event_id=? AND status='valid' AND rescue=0 ORDER BY RANDOM() LIMIT 1", [e.id]);
    if (!t) return toast('No ticket of that kind in the database', 'err'); const win = Math.floor(Date.now() / 1000 / rot);
    $('#code').value = kind === 'old' ? ES.tix.qrToken(t, Date.now() - 5 * 60000, rot) : kind === 'forged' ? 'ES1.' + t.serial + '.' + win + '.0123456789' : ES.tix.qrToken(t, Date.now(), rot);
  }
  async function startCam() {
    const m = $('#camMsg'); try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { m.innerHTML = '<b>Camera not available</b><div style="color:#ddd">Allow camera access, or type the code below.</div>'; return; }
    const cam = $('#cam'); cam.innerHTML = '<video playsinline muted></video><div class="frame"></div>'; const v = $('video', cam); v.srcObject = stream; await v.play(); $('#camBtn').textContent = 'Stop camera'; $('#camBtn').onclick = () => { stopCam(); shell(); };
    if (!('BarcodeDetector' in window)) { cam.insertAdjacentHTML('beforeend', '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);padding:8px;font-size:15px">This browser cannot read QR codes. Use Chrome on Android, or type the code.</div>'); return; }
    det = new BarcodeDetector({ formats: ['qr_code'] }); loop = setInterval(async () => { if (busy) return; try { const c = await det.detect(v); if (c[0] && c[0].rawValue) { busy = true; await onCode(c[0].rawValue); } } catch (e) { /* ignore */ } }, 300);
  }
  function stopCam() { clearInterval(loop); loop = null; if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; busy = false; }
  function beep(ok) { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); const g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = ok ? 880 : 180; g.gain.value = 0.15; o.start(); setTimeout(() => { o.stop(); a.close(); }, ok ? 140 : 380); if (navigator.vibrate) navigator.vibrate(ok ? 60 : [120, 60, 120]); } catch (e) { /* ignore */ } }

  async function onCode(raw) {
    raw = String(raw || '').trim(); if (!raw) { busy = false; return; } const e = ev(); const gid = gateId(); let r;
    try {
      if (isOffline()) r = offlineScan(raw, e, gid);
      else r = await ES.db.write('scan', () => ES.tix.scan(raw, { eventId: e.id, gateId: gid, device, userId: ES.session.id, userName: ES.session.name }));
    } catch (err) { toast(err.message, 'err'); busy = false; return; }
    showResult(r, raw, e, gid);
  }
  function offlineScan(raw, e, gid) {
    const snap = LS.get('es-crew-snap', null); if (!snap || snap.eventId !== e.id) throw new Error('No ticket list saved on this phone. Go online and tap “Save ticket list for offline”.');
    const r = ES.tix.check(raw, { eventId: e.id, rotate: snap.rotate, grace: snap.grace, lookup: (s) => snap.t[s] }); let result = r.result; let detail = r.detail || '';
    if (result === 'used') { result = 'duplicate'; detail = 'Already scanned (on this phone)'; }
    if (result === 'valid') { snap.t[r.ticket.serial].status = 'used'; LS.set('es-crew-snap', snap); const q = queue(); q.push({ token: raw, at: F.nowStamp(), gateId: gid }); LS.set('es-crew-queue', q); }
    return { result, detail, ticket: r.ticket ? Object.assign({}, r.ticket, { type_name: r.ticket.type }) : null, offline: true };
  }
  function showResult(r, raw, e, gid) {
    stopCamLoopOnly(); const t = r.ticket; const res = r.result === 'valid' ? 'valid' : r.result === 'expired' || r.result === 'not_open' ? 'warn' : 'bad';
    const LABEL = { valid: 'Admitted', duplicate: 'Already used', used: 'Already used', expired: 'Old code', void: 'Transferred', invalid: 'Invalid', wrong_event: 'Wrong event', refunded: 'Refunded', not_open: 'Too early' };
    let type = t && (t.type_name || t.type); if (t && !type && t.ticket_type_id) { const tt = DB().get('SELECT * FROM ticket_types WHERE id=?', [t.ticket_type_id]); type = tt && tt.name; }
    const needId = t && (t.requires_id || (t.ticket_type_id && (DB().get('SELECT requires_id FROM ticket_types WHERE id=?', [t.ticket_type_id]) || {}).requires_id));
    const d = document.createElement('div'); d.className = 'res ' + res; d.setAttribute('role', 'alert');
    d.innerHTML = `${res === 'valid' ? '<div class="strip"></div>' : ''}<h1>${esc(LABEL[r.result] || r.result)}</h1>${t ? `<div class="sub">${esc(type || '')}${t.holder_name ? ' · ' + esc(t.holder_name) : ''}</div>` : ''}${needId && res === 'valid' ? '<div class="det" style="font-weight:700;font-size:24px">Check the guest’s ID. The name must match.</div>' : ''}<div class="det">${esc(r.detail || '')}${r.offline ? '<br>Saved offline. It will be sent when you are back online.' : ''}</div>${res === 'valid' ? '<div class="strip"></div>' : ''}
      <div class="btns"><button class="btn" data-n>${res === 'valid' ? 'Next guest' : 'Close'}</button>${res !== 'valid' && t ? '<button class="btn line" data-d>Send to dispute desk</button>' : ''}</div>`;
    document.body.appendChild(d); beep(res === 'valid'); const done = () => { d.remove(); busy = false; const c = $('#code'); if (c) { c.value = ''; } if (stream) loop = loop || setInterval(() => {}, 1000); };
    d.querySelector('[data-n]').onclick = () => { done(); if (tab === 'scan') shell(); }; if (res === 'valid') setTimeout(() => { if (d.isConnected) d.querySelector('[data-n]').click(); }, 2600);
    const dd = d.querySelector('[data-d]'); if (dd) dd.onclick = () => { done(); disputeForm(t.serial, e, gid); };
  }
  function stopCamLoopOnly() { /* keep the stream on, but the busy flag pauses detection while the result is shown */ busy = true; }
  function disputeForm(serial, e, gid) {
    const f = [{ name: 'name', label: 'Guest name', full: true }, { name: 'phone', label: 'Guest phone (optional)' }, { name: 'notes', label: 'What the guest says', type: 'textarea', full: true }];
    ES.ui.drawer.open({ title: 'Send to dispute desk · ' + serial, body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Send to desk</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.readForm(b, f); if (isOffline()) return toast('Go online to send this to the desk', 'err'); await ES.db.write('open dispute', () => ES.tix.openDispute({ eventId: e.id, serial, gateId: gid, userId: ES.session.id, claimantName: v.name, claimantPhone: v.phone, notes: v.notes })); ES.ui.drawer.close(); toast('Sent to the dispute desk. Ask the guest to wait there.', 'ok'); }; } });
  }
  async function syncNow() {
    const q = queue(); if (!q.length) return; const e = ev(); let out;
    try { out = await ES.db.write('offline sync', () => ES.tix.syncOffline(q, { eventId: e.id, gateId: gateId(), device, userId: ES.session.id, userName: ES.session.name })); } catch (err) { return toast(err.message, 'err'); }
    LS.set('es-crew-queue', []); try { snapshot(); } catch (x) { /* ignore */ }
    const d = document.createElement('div'); d.className = 'res ' + (out.conflicts.length ? 'warn' : 'valid'); d.innerHTML = `<h1>${out.conflicts.length ? 'Sent, with conflicts' : 'All sent'}</h1><div class="sub">${out.admitted} accepted · ${out.duplicates} already used elsewhere · ${out.rejected} rejected</div>${out.conflicts.length ? `<div class="det">Someone else scanned these first (earliest scan wins):<br>${out.conflicts.map((c) => esc(c.serial) + ' · ' + esc(c.detail)).join('<br>')}</div>` : ''}<div class="btns"><button class="btn">OK</button></div>`; document.body.appendChild(d); d.querySelector('button').onclick = () => { d.remove(); shell(); };
  }

  // ---------- tasks ----------
  function tasks(el, e) {
    const all = can('schedule'); const cl = DB().all(`SELECT c.*, u.short pic FROM checklists c LEFT JOIN users u ON u.id=c.pic_id WHERE c.event_id=? ${all ? '' : 'AND c.pic_id=?'} ORDER BY c.due, c.id`, all ? [e.id] : [e.id, ES.session.id]);
    const po = DB().all("SELECT p.*, v.name vendor FROM purchase_orders p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.event_id=? AND p.pic_id=? AND p.status IN ('ordered','invoiced') AND p.delivered_at IS NULL ORDER BY p.due_date", [e.id, ES.session.id]);
    el.innerHTML = `<h2>Deliveries to confirm</h2>${po.map((p) => `<div class="card" style="margin:10px 0"><b>${esc(p.vendor || '')}</b><div class="muted">${esc(p.description)}${p.due_date ? ' · due ' + F.date(p.due_date) : ''}</div><button class="btn go big-btn" data-dl="${p.id}" style="margin-top:10px">It arrived: confirm</button></div>`).join('') || '<div class="muted" style="margin:8px 0 16px">Nothing to confirm</div>'}
      <h2 style="margin-top:18px">${all ? 'All checklists' : 'My checklists'}</h2>${cl.map((c) => { const it = DB().all('SELECT * FROM checklist_items WHERE checklist_id=? ORDER BY sort,id', [c.id]); const done = it.filter((i) => i.done).length; return `<div class="card" style="margin:10px 0"><div class="row"><b>${esc(c.title)}</b><span class="spacer"></span>${c.due < F.today() && done < it.length ? '<span class="tag r">Overdue</span>' : ES.ui.dueTag(c.due)}</div><div class="bar ${done === it.length ? 'g' : ''}" style="margin:8px 0"><i style="width:${it.length ? done / it.length * 100 : 0}%"></i></div>${all ? `<div class="muted">PIC ${esc(c.pic || 'none')}</div>` : ''}${it.map((i) => `<label class="cl-item"><input type="checkbox" data-i="${i.id}" ${i.done ? 'checked' : ''}><span style="${i.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(i.text)}${i.done && i.done_by ? `<div class="muted">${esc(i.done_by)} · ${esc(F.stamp(i.done_at))}</div>` : ''}</span></label>`).join('')}</div>`; }).join('') || '<div class="muted">No checklists assigned to you</div>'}`;
    $$('[data-i]', el).forEach((c) => (c.onchange = async () => { const id = Number(c.dataset.i); await ES.db.write('checklist item', () => DB().update('checklist_items', id, c.checked ? { done: 1, done_by: ES.session.name, done_at: F.nowStamp() } : { done: 0, done_by: null, done_at: null })); shell(); }));
    $$('[data-dl]', el).forEach((b) => (b.onclick = () => { const f = [{ name: 'note', label: 'Note (what arrived, condition)', type: 'textarea', full: true }]; ES.ui.drawer.open({ title: 'Confirm delivery', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn go" data-s>Confirm</button>', onMount: (bb, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.readForm(bb, f); try { await ES.db.write('confirm delivery', () => ES.biz.confirmDelivery(Number(b.dataset.dl), v.note)); ES.ui.drawer.close(); toast('Delivery confirmed. Finance can now pay.', 'ok'); shell(); } catch (err) { toast(err.message, 'err'); } }; } }); }));
  }

  // ---------- show ----------
  function show(el, e) {
    const rs = DB().all('SELECT r.*, u.short owner FROM rundown_items r LEFT JOIN users u ON u.id=r.owner_id WHERE r.event_id=? ORDER BY r.at_time, r.id', [e.id]); const today = e.date === F.today(); const now = new Date().toTimeString().slice(0, 5);
    const cur = today ? rs.filter((r) => r.at_time <= now).pop() : null; const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    el.innerHTML = `<h2>Run of show</h2><div class="muted" style="margin-bottom:8px">${F.date(e.date, 'long')}${today ? ' · now ' + now : ''}</div>${rs.map((r) => `<div class="ru ${cur && cur.id === r.id ? 'now' : ''}"><div class="t">${esc(r.at_time)}</div><div><b>${esc(r.title)}</b><div class="muted">${esc(r.stage)} · ${r.minutes} min${r.owner ? ' · cue ' + esc(r.owner) : ''}${r.status !== 'pending' ? ' · ' + esc(r.status) : ''}</div></div><div>${r.owner_id === ES.session.id || can('control') ? (r.status === 'pending' ? `<button class="btn sm go" data-c="live:${r.id}">Start</button>` : r.status === 'live' ? `<button class="btn sm" data-c="done:${r.id}">Done</button>` : '') : ''}</div></div>`).join('') || '<div class="muted">No run of show yet</div>'}`;
    $$('[data-c]', el).forEach((b) => (b.onclick = async () => { const [s, id] = b.dataset.c.split(':'); await ES.db.write('cue', () => DB().update('rundown_items', Number(id), s === 'live' ? { status: 'live', started_at: F.nowStamp() } : { status: 'done', ended_at: F.nowStamp() })); shell(); })); void toMin;
  }

  // ---------- dispute desk ----------
  function desk(el, e) {
    const ds = DB().all("SELECT d.*, t.holder_name, t.holder_phone, t.ticket_type_id FROM disputes d LEFT JOIN tickets t ON t.id=d.ticket_id WHERE d.event_id=? ORDER BY CASE d.status WHEN 'resolved' THEN 1 ELSE 0 END, d.id DESC LIMIT 30", [e.id]); const pool = DB().val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='pool'", [e.id]);
    el.innerHTML = `<h2>Dispute desk</h2><div class="notice" style="margin:8px 0 12px">Rescue pool left: <b>${pool}</b>. Verify the real buyer with a code, then issue a rescue ticket.</div>${ds.map((d) => `<div class="card" style="margin-bottom:10px"><div class="row"><b>${esc(d.serial)}</b><span class="spacer"></span><span class="tag ${d.status === 'resolved' ? '' : 'a'}">${esc(d.status)}</span></div><div class="muted">Claimant ${esc(d.claimant_name || '—')} · buyer of record ${esc(d.holder_name ? d.holder_name + ' ' + F.mask(d.holder_phone) : '—')}</div>
      ${d.status === 'resolved' ? `<div class="muted">Result: ${esc(d.resolution || '')}</div>` : `<div class="stack" style="margin-top:10px">${d.status === 'open' || d.status === 'otp_sent' ? `<button class="btn big-btn" data-o="${d.id}">Send code to the buyer</button>` : ''}${d.status === 'otp_sent' ? `<div class="row" style="gap:8px"><input class="input" data-cd="${d.id}" placeholder="Code the guest reads out" inputmode="numeric" style="flex:1;min-height:52px"><button class="btn primary" data-v="${d.id}" style="min-height:52px">Check</button></div>` : ''}${d.status === 'verified' ? `<button class="btn go big-btn" data-r="${d.id}:0">Issue rescue ticket</button><button class="btn big-btn" data-r="${d.id}:1">Issue free (our mistake)</button>` : ''}<button class="btn big-btn" data-j="${d.id}">Reject</button></div>`}</div>`).join('') || '<div class="muted">No disputes</div>'}`;
    const w = (label, fn, ok) => async () => { try { await ES.db.write(label, fn); if (ok) toast(ok, 'ok'); shell(); } catch (err) { toast(err.message, 'err'); } };
    $$('[data-o]', el).forEach((b) => (b.onclick = w('dispute otp', () => ES.tix.disputeOtp(Number(b.dataset.o)), 'Code sent to the buyer’s phone')));
    $$('[data-v]', el).forEach((b) => (b.onclick = w('dispute verify', () => ES.tix.disputeVerify(Number(b.dataset.v), $(`[data-cd="${b.dataset.v}"]`, el).value), 'Verified')));
    $$('[data-r]', el).forEach((b) => (b.onclick = () => { const [id, free] = b.dataset.r.split(':'); const d = ds.find((x) => x.id === Number(id)); w('dispute rescue', () => ES.tix.disputeRescue(Number(id), { typeId: d.ticket_type_id, free: free === '1', method: free === '1' ? 'Waived' : 'Cash at desk' }), 'Rescue ticket issued')(); }));
    $$('[data-j]', el).forEach((b) => (b.onclick = async () => { if (!(await ES.ui.confirm('Reject this dispute?', 'The guest is not admitted on this ticket.', { danger: true, ok: 'Reject' }))) return; w('dispute reject', () => ES.tix.disputeReject(Number(b.dataset.j), 'Could not verify the buyer'), 'Rejected')(); }));
  }

  // ---------- more ----------
  function more(el, e) {
    const snap = LS.get('es-crew-snap', null);
    el.innerHTML = `<h2>${esc(ES.session.name)}</h2><div class="muted">${esc(ES.session.title || '')} · device ${esc(device)}</div><div class="stack" style="margin-top:14px"><button class="btn big-btn" id="inc">Report an incident</button><button class="btn big-btn" id="man">Open a ticket dispute by serial number</button>
      <div class="card"><b>Offline ticket list</b><div class="muted" style="margin:4px 0 10px">${snap ? F.num(snap.count) + ' tickets saved ' + esc(F.stamp(snap.at)) : 'Not saved yet'}. ${queue().length} scans waiting to be sent.</div><button class="btn" id="sv" ${navigator.onLine ? '' : 'disabled'}>Save ticket list now</button></div>
      <div class="card"><b>Theme</b><div style="margin-top:8px">${ES.theme.control()}</div></div><button class="btn big-btn" id="out">Sign out</button></div>`;
    $('#sv').onclick = () => { const s = snapshot(); toast(F.num(s.count) + ' tickets saved', 'ok'); shell(); }; $('#out').onclick = () => { ES.auth.logout(); route(); }; $('#man').onclick = () => manualDispute(e);
    $('#inc').onclick = () => { const f = [{ name: 'kind', label: 'Kind', type: 'select', options: ['Medical', 'Security', 'Crowd', 'Technical', 'Weather', 'Lost child', 'Other'].map((x) => [x, x]) }, { name: 'severity', label: 'Severity', type: 'select', options: [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], default: 'normal' }, { name: 'location', label: 'Where', required: true, full: true }, { name: 'description', label: 'What happened', type: 'textarea', required: true, full: true }];
      ES.ui.drawer.open({ title: 'Report incident', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Report</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; if (isOffline()) return toast('Go online to report', 'err'); await ES.db.write('incident', () => { DB().insert('incidents', { event_id: e.id, kind: v.kind, severity: v.severity, location: v.location, description: v.description, reported_by: ES.session.name, status: 'open', at: F.nowStamp() }); if (v.severity === 'high') DB().notify('all', 'High severity incident', v.kind + ' · ' + v.location, { link: '#/control/incidents' }); }); ES.ui.drawer.close(); toast('Reported to the control room', 'ok'); }; } }); };
  }
  function manualDispute(e) {
    const f = [{ name: 'serial', label: 'Ticket serial number', required: true, full: true }, { name: 'name', label: 'Guest name' }, { name: 'phone', label: 'Guest phone' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }];
    ES.ui.drawer.open({ title: 'Open dispute', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Open</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f, (v, fail) => { if (!DB().get('SELECT 1 FROM tickets WHERE serial=? AND event_id=?', [v.serial.toUpperCase(), e.id])) fail('serial', 'No such ticket for this event'); }); if (!v) return; await ES.db.write('open dispute', () => ES.tix.openDispute({ eventId: e.id, serial: v.serial.toUpperCase(), gateId: gateId(), userId: ES.session.id, claimantName: v.name, claimantPhone: v.phone, notes: v.notes })); ES.ui.drawer.close(); toast('Dispute opened', 'ok'); }; } });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
