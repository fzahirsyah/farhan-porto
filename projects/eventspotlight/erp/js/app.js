/* Event Spotlight ERP — app shell: boot, setup wizard, PIN login, layout, router, event switcher, search palette, live sync. */
(function () {
  const ES = window.ES;
  const { $, $$, esc, toast } = ES.ui;
  const F = ES.fmt;
  ES.auth.useSessionKey('es-erp-user');

  const I = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', proj: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M8 4v5"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>', layout: '<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M9 21V9"/>',
    tix: '<path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>', mkt: '<path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M15 9a4 4 0 010 6"/>',
    spon: '<path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"/>', prop: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    art: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', ven: '<path d="M6 2h12l2 4H4z"/><path d="M4 6v14a2 2 0 002 2h12a2 2 0 002-2V6M9 11h6"/>',
    acc: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>', live: '<circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0114 0M2 12a10 10 0 0120 0"/>', rep: '<path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/>', set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/>', bell: '<path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16z"/><path d="M10 21h4"/>', log: '<path d="M4 6h16M4 12h16M4 18h10"/>', db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">${I[k] || ''}</svg>`;

  const routes = {};
  /* def: {label, icon, perm, section, render(el, param), badge(), keywords} */
  function register(id, def) { routes[id] = Object.assign({ id }, def); }
  const SECTIONS = ['Overview', 'Plan', 'Sell', 'Partners', 'Money', 'Event day', 'After', 'Admin'];

  let current = { id: 'home', param: '' }; let pendingRemote = false; let upgrading = false;
  const parseHash = () => { const h = location.hash.replace(/^#\/?/, '').split('/'); return { id: h[0] || 'home', param: h.slice(1).join('/') }; };

  // ----- selected event -----
  function eventId() {
    let id = Number(sessionStorage.getItem('es-erp-event') || 0);
    if (!id || !ES.db.get('SELECT 1 FROM events WHERE id=?', [id])) id = Number(ES.db.setting('current_event', 0)) || ES.db.val('SELECT id FROM events ORDER BY date DESC LIMIT 1') || 0;
    return id;
  }
  const ev = () => ES.db.get('SELECT * FROM events WHERE id=?', [eventId()]);
  const setEvent = (id) => { sessionStorage.setItem('es-erp-event', String(id)); refreshAll(); };
  const ctx = () => { const e = ev(); return { eventId: e ? e.id : 0, projectId: e ? e.project_id : 0 }; };

  // ----- boot -----
  async function boot() {
    document.body.innerHTML = `<div class="screen"><div class="box" style="text-align:center"><div class="logo">Event Spotlight</div><div class="strip logo-s"></div><p class="muted"><span class="spin"></span>&nbsp; Preparing the database…</p></div></div>`;
    try { await ES.db.init('erp'); } catch (e) { return fatal(e); }
    ES.db.onChange(onDbChange); route(); window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });
  }
  function fatal(e) {
    console.error(e);
    document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:560px"><h2>The app could not start</h2><p class="muted" style="margin:8px 0 12px">${esc(e.message || e)}</p>
      <div class="notice warn">Open this file in a current Google Chrome or Edge. Keep the <code>shared/</code> folder next to the <code>erp/</code> folder.</div></div></div>`;
  }
  function route() {
    if (ES.db.state !== 'ready') return renderSetup();
    const susp = ES.db.get("SELECT * FROM tenants WHERE is_current=1 AND status='suspended'"); if (susp) { document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:520px;text-align:center"><div class="logo" style="font-size:34px">Event Spotlight</div><div class="strip logo-s"></div><h2 style="margin-top:12px">This account is suspended</h2><p class="muted" style="margin:8px 0">${esc(susp.name)} cannot be opened right now. Ticket buyers and gates are not affected by the shop and crew apps. Contact the platform to reactivate.</p></div></div>`; return; }
    if (!ES.auth.loadSession()) return renderLogin();
    current = parseHash(); if (!routes[current.id]) current.id = 'home'; renderShell();
  }

  // ----- setup -----
  function renderSetup() {
    document.body.innerHTML = `<div class="screen"><div class="box">
      <div class="logo">Event Spotlight</div><div class="strip logo-s"></div><p class="muted" style="text-align:center">Event management and ERP for event organisers · the database lives in this browser</p>
      <div class="choice">
        <div class="card" data-c="empty"><div class="big">🗂️</div><h3 style="margin:8px 0 4px">Empty database</h3><p class="muted">Start from nothing for your own company. Create your first project from the concert template.</p></div>
        <div class="card" data-c="demo"><div class="big">🎤</div><h3 style="margin:8px 0 4px">Demo database</h3><p class="muted">A fictional organiser with one finished show and one concert on sale. The ticket lottery is open right now.</p></div>
        <div class="card" data-c="file"><div class="big">📂</div><h3 style="margin:8px 0 4px">Open a .sqlite file</h3><p class="muted">Restore a backup downloaded from Settings → Database.</p><input type="file" accept=".sqlite,.db,.sqlite3" hidden></div>
      </div><p class="muted" style="text-align:center;margin-top:22px">Data is stored only in this browser. Download a backup now and then.</p></div></div>`;
    const fileInput = $('[data-c="file"] input');
    $$('[data-c]').forEach((c) => (c.onclick = async (e) => {
      const k = c.dataset.c;
      if (k === 'demo') { c.innerHTML = '<div style="text-align:center;padding:30px"><span class="spin"></span><p class="muted" style="margin-top:10px">Building the demo database…</p></div>'; await new Promise((r) => setTimeout(r, 50)); await ES.db.create('demo database', (DB) => ES.seed.demo(DB)); toast('Demo database ready', 'ok'); route(); }
      else if (k === 'empty') renderWizard(); else if (e.target !== fileInput) fileInput.click();
    }));
    fileInput.onchange = async () => { const f = fileInput.files[0]; if (!f) return; try { await ES.db.importBytes(new Uint8Array(await f.arrayBuffer())); toast('Database restored', 'ok'); route(); } catch (err) { toast(err.message, 'err'); } };
  }
  function renderWizard() {
    const fields = [{ section: 'Your company' }, { name: 'orgName', label: 'Brand name', required: true, full: true, placeholder: 'Lentera Live' }, { name: 'legalName', label: 'Legal name', placeholder: 'PT …' }, { name: 'city', label: 'City', required: true },
      { name: 'email', label: 'Company email', type: 'email' }, { name: 'phone', label: 'Phone' }, { name: 'address', label: 'Address', full: true },
      { section: 'Owner account' }, { name: 'ownerName', label: 'Your name', required: true }, { name: 'pin', label: 'PIN (4 to 6 digits)', type: 'password', required: true, pattern: /^\d{4,6}$/, patternMsg: 'The PIN must be 4 to 6 digits' }, { name: 'pin2', label: 'Repeat PIN', type: 'password', required: true }];
    document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:720px"><h2>Set up your empty database</h2><div class="muted">The chart of accounts, platform rules and the concert template are created for you. You can change all of it later.</div>
      <div style="margin-top:18px" id="wz">${ES.ui.formHTML(fields)}</div><div class="row" style="margin-top:18px"><button class="btn" id="wzBack">← Back</button><span class="spacer"></span><button class="btn primary" id="wzGo">Create database</button></div></div></div>`;
    $('#wzBack').onclick = renderSetup;
    $('#wzGo').onclick = async () => {
      const v = ES.ui.validate($('#wz'), fields, (v, fail) => { if (v.pin && v.pin !== v.pin2) fail('pin2', 'The PINs do not match'); }); if (!v) return;
      $('#wzGo').disabled = true; await ES.db.create('empty database', (DB) => ES.seed.empty(DB, v)); ES.auth.login(1, v.pin); toast('Database created. Welcome!', 'ok'); location.hash = '#/home'; route();
    };
  }

  // ----- login -----
  function renderLogin() {
    const users = ES.db.all('SELECT id,name,short,role,title,color FROM users WHERE active=1 ORDER BY id');
    const org = ES.db.get('SELECT * FROM org WHERE id=1') || {}; let pins = {}; try { pins = JSON.parse(ES.db.setting('demo_pins', '{}')); } catch (e) { /* ignore */ }
    document.body.innerHTML = `<div class="screen"><div class="box" style="max-width:860px"><div class="logo">Event Spotlight</div><div class="strip logo-s"></div><p class="muted" style="text-align:center">${esc(org.name || '')}</p>
      <h2 style="text-align:center;margin-top:20px">Who is signing in?</h2>
      <div class="users-grid">${users.map((u) => `<div class="user-card" tabindex="0" data-u="${u.id}"><span class="avatar" style="background:${u.color}">${esc(F.initials(u.name))}</span><b>${esc(u.short || u.name)}</b><div class="muted">${esc(u.title || ES.auth.ROLES[u.role].label)}</div>${pins[u.short] ? `<div class="muted" style="margin-top:4px">Demo PIN ${pins[u.short]}</div>` : ''}</div>`).join('')}</div>
      <p class="muted" style="text-align:center;margin-top:20px">Other apps in this suite: crew/index.html · shop/index.html · partner/index.html · booth/index.html · admin/index.html</p></div></div>`;
    $$('[data-u]').forEach((c) => { const go = () => pinPrompt(users.find((u) => u.id === Number(c.dataset.u))); c.onclick = go; c.onkeydown = (e) => { if (e.key === 'Enter') go(); }; });
  }
  function pinPrompt(u) {
    let pin = '';
    $('.screen .box').innerHTML = `<div class="card" style="max-width:380px;margin:0 auto;text-align:center"><span class="avatar" style="background:${u.color};width:56px;height:56px;font-size:22px;margin:0 auto">${esc(F.initials(u.name))}</span>
      <h3 style="margin-top:10px">${esc(u.name)}</h3><div class="muted">Enter your PIN</div><div class="pindots">${'<i></i>'.repeat(6)}</div><div id="pinErr" style="color:var(--red);height:22px;margin-top:6px;font-weight:600"></div>
      <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, 'OK'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div><button class="btn ghost" style="margin-top:12px" id="pinBack">← Choose someone else</button></div>`;
    const dots = () => $$('.pindots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const submit = () => { if (ES.auth.login(u.id, pin)) { document.removeEventListener('keydown', kd); ES.db.write('sign in', () => ES.db.log('sign in', 'users', u.id)).catch(() => {}); route(); } else { pin = ''; dots(); $('#pinErr').textContent = 'Wrong PIN'; } };
    const press = (k) => { $('#pinErr').textContent = ''; if (k === '←') pin = pin.slice(0, -1); else if (k === 'OK') return submit(); else if (pin.length < 6) pin += k; dots(); if (pin.length >= 4 && ES.auth.hashPin(pin) === ES.db.val('SELECT pin_hash FROM users WHERE id=?', [u.id])) submit(); };
    const kd = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('←'); else if (e.key === 'Enter') press('OK'); };
    document.addEventListener('keydown', kd); $$('[data-k]').forEach((b) => (b.onclick = () => press(b.dataset.k)));
    $('#pinBack').onclick = () => { document.removeEventListener('keydown', kd); renderLogin(); };
  }

  // ----- shell -----
  function renderShell() {
    const s = ES.session; const evs = ES.db.all('SELECT id,name,date FROM events ORDER BY date DESC'); const cur = eventId();
    document.body.innerHTML = `<div class="app"><aside class="side"><div class="brand"><b>Event Spotlight</b><small>${esc((ES.db.get('SELECT name FROM org WHERE id=1') || {}).name || '')}</small><div class="strip"></div></div><nav id="nav" aria-label="Main"></nav>
      <div class="me">${ES.ui.avatar(s.name, s.color)}<div><b>${esc(s.short || s.name)}</b>${esc(s.title || ES.auth.ROLES[s.role].label)}</div></div></aside>
      <div class="main"><div class="topbar"><span class="crumb" id="crumb"></span>
        ${evs.length ? `<select class="evsel" id="evsel" aria-label="Event">${evs.map((e) => `<option value="${e.id}" ${e.id === cur ? 'selected' : ''}>${esc(e.name)} · ${F.date(e.date)}</option>`).join('')}</select>` : ''}
        <span class="spacer"></span><button class="btn sm" id="tbSearch">Search · Ctrl K</button>
        <span class="sync" id="sync" title="Live sync with your other tabs"><span class="dot">●</span><span id="syncTxt">Synced</span></span>
        ${ES.theme.control()}
        ${ES.auth.can('outbox') ? `<button class="icon-btn" style="position:relative" title="Outbox (simulated email and SMS)" id="tbOutbox" aria-label="Outbox">${icon('mail')}<span class="badge-n hidden" id="cntOutbox"></span></button>` : ''}
        <button class="icon-btn" style="position:relative" title="Notifications" id="tbBell" aria-label="Notifications" data-popbtn>${icon('bell')}<span class="badge-n hidden" id="cntBell"></span></button>
        <button class="btn sm" id="tbUser" data-popbtn>${esc(s.short || s.name)} ▾</button></div>
      <div class="content" id="content" tabindex="-1"></div></div></div>
      <div class="pal" id="pal" role="dialog" aria-label="Search"><div><input class="input" id="palIn" placeholder="Search tickets, buyers, sponsors, vendors, documents, or go to a screen…"><div class="res" id="palRes"></div></div></div>`;
    if ($('#evsel')) $('#evsel').onchange = (e) => setEvent(Number(e.target.value));
    $('#tbUser').onclick = (e) => ES.ui.popMenu(e.currentTarget, [{ label: 'Switch user', onClick: () => { ES.auth.logout(); route(); } }, { label: 'Sign out', onClick: () => { ES.auth.logout(); route(); } }]);
    $('#tbBell').onclick = (e) => bellMenu(e.currentTarget); $('#tbSearch').onclick = openPalette;
    if ($('#tbOutbox')) $('#tbOutbox').onclick = () => (location.hash = '#/outbox');
    $('#palIn').oninput = palSearch; $('#pal').onclick = (e) => { if (e.target.id === 'pal') $('#pal').classList.remove('on'); };
    $('#palIn').onkeydown = (e) => { if (e.key === 'Escape') $('#pal').classList.remove('on'); if (e.key === 'Enter') { const b = $('#palRes button'); if (b) b.click(); } };
    renderNav(); renderRoute(); refreshChrome();
  }
  function renderNav() {
    const html = SECTIONS.map((sec) => {
      const items = Object.values(routes).filter((r) => r.section === sec && (!r.perm || ES.auth.can(r.perm))); if (!items.length) return '';
      return `<div class="sec">${sec}</div>` + items.map((r) => { const b = r.badge ? r.badge() : 0; return `<a class="nav ${current.id === r.id ? 'on' : ''}" href="#/${r.id}">${icon(r.icon)}${esc(r.label)}${b ? `<span class="cnt">${b}</span>` : ''}</a>`; }).join('');
    }).join('');
    $('#nav').innerHTML = html;
  }
  function renderRoute() {
    ES.app.pageDirty = false; pendingRemote = false; const r = routes[current.id]; const el = $('#content');
    if (!r || (r.perm && !ES.auth.can(r.perm))) { el.innerHTML = `<div class="card" style="max-width:560px;margin:40px auto;text-align:center"><h2>No access</h2><p class="muted">Your role does not include this screen. Ask the owner to change your permissions in Settings → Staff.</p></div>`; $('#crumb').textContent = 'No access'; return; }
    $('#crumb').textContent = r.label; document.title = r.label + ' · Event Spotlight';
    try { r.render(el, current.param, r); } catch (e) { console.error(e); el.innerHTML = `<div class="notice err">Something went wrong showing this screen: ${esc(e.message)}</div>`; }
  }
  function refreshChrome() {
    if (!$('#nav')) return; renderNav();
    const role = ES.session.role, uid = ES.session.id;
    const nb = ES.db.val("SELECT COUNT(*) FROM notifications WHERE read=0 AND (target='all' OR target=? OR target=?)", ['role:' + role, 'user:' + uid]) || 0; const ob = ES.db.val('SELECT COUNT(*) FROM outbox WHERE opened=0') || 0;
    const b = $('#cntBell'); if (b) { b.textContent = nb; b.classList.toggle('hidden', !nb); } const o = $('#cntOutbox'); if (o) { o.textContent = ob; o.classList.toggle('hidden', !ob); }
    $('#syncTxt').textContent = 'Synced · v' + ES.db.version;
  }
  function bellMenu(anchor) {
    const role = ES.session.role, uid = ES.session.id;
    const items = ES.db.all("SELECT * FROM notifications WHERE (target='all' OR target=? OR target=?) ORDER BY id DESC LIMIT 8", ['role:' + role, 'user:' + uid]);
    const m = ES.ui.popMenu(anchor, []); m.style.width = '380px';
    m.innerHTML = `<div class="row" style="padding:6px 8px"><b>Notifications</b><span class="spacer"></span><button class="btn sm ghost" id="nbAll">Mark all read</button></div>
      ${items.length ? items.map((n) => `<button data-link="${esc(n.link || '')}" style="display:block;${n.read ? '' : 'background:var(--yellow-soft)'}"><b>${esc(n.title)}</b><div class="muted">${esc(n.body || '')}</div><div class="muted">${esc(F.stamp(n.created_at))}</div></button>`).join('') : '<div class="muted" style="padding:10px">Nothing yet</div>'}`;
    m.onclick = async (e) => {
      if (e.target.id === 'nbAll') { await ES.db.write('notifications read', () => ES.db.run("UPDATE notifications SET read=1 WHERE target='all' OR target=? OR target=?", ['role:' + role, 'user:' + uid])); ES.ui.closePops(); refreshChrome(); return; }
      const b = e.target.closest('[data-link]'); if (b) { ES.ui.closePops(); if (b.dataset.link) location.hash = b.dataset.link; }
    };
  }

  // ----- search palette -----
  function openPalette() { const p = $('#pal'); if (!p) return; p.classList.add('on'); $('#palIn').value = ''; palSearch(); $('#palIn').focus(); }
  function palSearch() {
    const q = $('#palIn').value.trim(); const out = []; const e = eventId();
    Object.values(routes).filter((r) => (!r.perm || ES.auth.can(r.perm)) && (!q || (r.label + ' ' + (r.keywords || '')).toLowerCase().includes(q.toLowerCase()))).slice(0, q ? 4 : 12).forEach((r) => out.push({ k: 'Go to', t: r.label, go: '#/' + r.id }));
    if (q.length >= 2) {
      const like = '%' + q + '%'; const p = (sql, args, f) => ES.db.all(sql, args).forEach((r) => out.push(f(r)));
      p("SELECT t.id,t.serial,t.holder_name,t.holder_phone,t.status FROM tickets t WHERE t.event_id=? AND (t.serial LIKE ? OR t.holder_name LIKE ? OR t.holder_phone LIKE ?) LIMIT 6", [e, like, like, like], (r) => ({ k: 'Ticket', t: r.serial + ' · ' + r.holder_name, s: r.status, go: '#/ticketing/ticket/' + r.id }));
      p("SELECT id,no,buyer_name,total FROM orders WHERE event_id=? AND (no LIKE ? OR buyer_name LIKE ? OR buyer_phone LIKE ?) LIMIT 4", [e, like, like, like], (r) => ({ k: 'Order', t: r.no + ' · ' + r.buyer_name, s: F.rp(r.total), go: '#/ticketing/order/' + r.id }));
      p("SELECT id,company,stage FROM sponsor_deals WHERE event_id=? AND company LIKE ? LIMIT 4", [e, like], (r) => ({ k: 'Sponsor', t: r.company, s: r.stage, go: '#/sponsors/' + r.id }));
      p("SELECT id,name,category FROM vendors WHERE name LIKE ? LIMIT 4", [like], (r) => ({ k: 'Vendor', t: r.name, s: r.category, go: '#/vendors/vendor/' + r.id }));
      p("SELECT id,no,description FROM purchase_orders WHERE event_id=? AND (no LIKE ? OR description LIKE ?) LIMIT 4", [e, like, like], (r) => ({ k: 'Order (PO)', t: r.no + ' · ' + r.description, go: '#/vendors/po/' + r.id }));
      p("SELECT id,no,type,party_name FROM documents WHERE event_id=? AND (no LIKE ? OR party_name LIKE ?) LIMIT 4", [e, like, like], (r) => ({ k: r.type, t: r.no + ' · ' + r.party_name, go: '#/accounting/doc/' + r.id }));
      p("SELECT id,name,role FROM artists WHERE event_id=? AND name LIKE ? LIMIT 3", [e, like], (r) => ({ k: 'Artist', t: r.name, s: r.role, go: '#/artists' }));
    }
    $('#palRes').innerHTML = out.length ? out.map((o, i) => `<button data-go="${esc(o.go)}" class="${i === 0 ? 'on' : ''}"><span class="tag">${esc(o.k)}</span>${esc(o.t)}<small>${esc(o.s || '')}</small></button>`).join('') : '<div class="muted" style="padding:10px">No matches</div>';
    $$('#palRes [data-go]').forEach((b) => (b.onclick = () => { $('#pal').classList.remove('on'); location.hash = b.dataset.go; }));
  }

  // ----- live sync -----
  function onDbChange(msg) {
    if (msg.type === 'reset' || msg.type === 'created') { if (msg.remote) { toast(msg.type === 'reset' ? 'Database deleted from another tab' : 'Database replaced from another tab'); setTimeout(() => location.reload(), 600); } return; }
    if (!$('#content')) return; if (!ES.auth.loadSession()) return route();
    const sync = $('#sync'); if (sync) { sync.classList.add('busy'); setTimeout(() => sync.classList.remove('busy'), 600); }
    refreshChrome();
    if (msg.remote) {
      toast((msg.who && msg.who !== 'erp' ? msg.who.toUpperCase() + ': ' : msg.by + ': ') + msg.label);
      if ((ES.ui.drawer.isOpen() && ES.ui.drawer.dirty) || ES.app.pageDirty || $('.docview.open')) {
        if (!pendingRemote) { pendingRemote = true; const ban = document.createElement('div'); ban.className = 'refresh-banner'; ban.innerHTML = 'Data changed in another tab. <button class="btn sm">Reload this view</button>';
          ban.querySelector('button').onclick = () => { ban.remove(); renderRoute(); }; $('#content').prepend(ban); }
      } else refresh();
    }
  }
  function refresh() { const y = window.scrollY; renderRoute(); window.scrollTo(0, y); }
  function refreshAll() { renderShell(); }
  const pageHead = (title, sub, actions) => `<div class="page-h"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
  /* run a DB write with error toast; refreshes the view. */
  async function act(label, fn, okMsg) {
    try { const r = await ES.db.write(label, fn); if (okMsg) toast(okMsg, 'ok'); refresh(); refreshChrome(); return r; } catch (e) { toast(e.message || String(e), 'err'); return undefined; }
  }

  ES.erp = { register, routes, boot, route, refresh, refreshChrome, refreshAll, pageHead, icon, eventId, ev, ctx, setEvent, act, go: (h) => (location.hash = h) };
  ES.app = ES.erp; ES.app.pageDirty = false;
  window.addEventListener('unhandledrejection', (e) => { const m = e.reason && e.reason.message; if (m && ES.ui) ES.ui.toast(m, 'err'); });
  document.addEventListener('DOMContentLoaded', boot);
})();
