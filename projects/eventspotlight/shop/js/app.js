/* Event Spotlight ticket shop and wallet (buyer side).
   Routes: #/ event page · #/community · #/lottery · #/queue · #/buy/TOKEN (lottery winner link) · #/checkout · #/done/ORDERNO · #/wallet */
(function () {
  const ES = window.ES, F = ES.fmt, DB = () => ES.db, { $, $$, esc, toast } = ES.ui;
  let timers = [], co = null;
  const SS = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
  const buyer = () => SS.get('es-shop-phone');

  function ev() {
    const q = Number(SS.get('es-shop-event')) || 0; if (q && DB().get('SELECT 1 FROM events WHERE id=?', [q])) return DB().get('SELECT * FROM events WHERE id=?', [q]);
    return DB().get("SELECT * FROM events WHERE status IN ('on_sale','live') ORDER BY date LIMIT 1") || DB().get('SELECT * FROM events ORDER BY date DESC LIMIT 1');
  }
  const wave = (e, k) => ES.tix.waveFor(e.id, k);
  const types = (e) => DB().all('SELECT * FROM ticket_types WHERE event_id=? AND active=1 ORDER BY sort,id', [e.id]);
  const feeFor = (e, tt, qty) => { const c = { eventId: e.id, ticketTypeId: tt.id }; const sub = tt.price * qty; const fee = Math.round(sub * ES.cfg.get('fees.admin_pct', c) / 100 + ES.cfg.get('fees.admin_flat', c)); const payer = ES.cfg.get('fees.admin_payer', c); return { sub, fee, payer, total: sub + (payer === 'buyer' ? fee : 0) }; };

  async function boot() {
    document.body.innerHTML = '<div class="screen"><div class="box" style="text-align:center"><div class="logo">Event Spotlight</div><div class="strip logo-s"></div><p class="muted"><span class="spin"></span> Loading…</p></div></div>';
    try { await ES.db.init('shop'); } catch (e) { document.body.innerHTML = `<div class="screen"><div class="card"><h2>The shop could not start</h2><p class="muted">${esc(e.message)}</p></div></div>`; return; }
    ES.db.onChange((m) => { if (m && !m.remote) return; if (/^#\/(wallet|)$/.test(location.hash) || location.hash === '') { if (location.hash === '#/wallet' && !buyer()) return; const a = document.activeElement; if (!(a && a.matches('input,textarea,select')) && !ES.ui.drawer.isOpen()) route(); } });
    window.addEventListener('hashchange', route); route();
  }

  function shell(inner, active) {
    const e = ev(); const p = buyer();
    document.body.innerHTML = `<header class="sh-top"><div class="in"><a class="brand" href="#/">Event Spotlight</a><span style="flex:1"></span><a class="nav ${active === 'home' ? 'on' : ''}" href="#/">Tickets</a><a class="nav ${active === 'wallet' ? 'on' : ''}" href="#/wallet">${p ? 'My wallet' : 'Sign in'}</a></div></header><main class="sh-wrap" id="main">${inner}</main>`; void e;
  }

  function route() {
    clearTimers();
    if (ES.db.state !== 'ready') { document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:480px;text-align:center"><div class="logo" style="font-size:34px">Event Spotlight Tickets</div><div class="strip logo-s"></div><p class="muted" style="margin:10px 0">No database in this browser yet. Open erp/index.html in this same browser, create or load a database, then come back.</p><button class="btn primary" onclick="location.reload()">Check again</button></div></div>`; return; }
    const e = ev(); if (!e) { shell('<div class="card">No event is on sale yet.</div>', 'home'); return; }
    const [, r, a] = location.hash.split('/'); const arg = decodeURIComponent(a || '');
    ({ '': home, community, lottery, queue, buy, checkout, done, wallet }[r || ''] || home)(e, arg);
  }

  // ---------- event page ----------
  function stageState(w) { if (!w) return { s: 'none', label: 'Not planned' }; if (w.status === 'open') return { s: 'open', label: 'Open now' }; if (w.status === 'scheduled') return { s: 'soon', label: 'Opens ' + (w.opens_at ? F.stamp(w.opens_at) : 'soon') }; return { s: 'closed', label: w.status === 'drawn' ? 'Entries closed. Winners drawn' : 'Closed' }; }
  function home(e) {
    const ts = types(e); const wc = wave(e, 'community'), wl = wave(e, 'lottery'), wo = wave(e, 'open'); const lineup = DB().all("SELECT * FROM artists WHERE event_id=? AND status IN ('confirmed','contracted','signed') ORDER BY set_time", [e.id]);
    const left = (k, tt) => ES.tix.waveLeft(e.id, k, tt.id); const stg = [['community', wc, 'Community presale', 'Members of partner communities buy first with a personal code.', '#/community', 'Use my code'], ['lottery', wl, 'Public lottery', 'Enter once. Winners are drawn fairly and get a personal purchase link.', '#/lottery', 'Enter the lottery'], ['open', wo, 'Open sale', 'Everyone joins a random queue. Nobody gains from refreshing early.', '#/queue', 'Join the queue']];
    shell(`<section class="hero"><div class="muted" style="color:#A3AECB;font:700 16px var(--display);letter-spacing:.08em;text-transform:uppercase">${esc(e.type || 'Concert')}</div><h1>${esc(e.name)}</h1><div class="meta"><span>${F.date(e.date, 'long')}</span><span>Doors ${esc(e.doors || '')} · Show ${esc(e.start_time || '')}</span><span>${esc(e.venue || '')}, ${esc(e.city || '')}</span></div><div class="strip"></div></section>
      <div class="notice" style="margin-top:14px"><b>Every ticket is personal.</b> The QR code in your wallet changes every ${ES.cfg.get('qr.rotate_seconds', { eventId: e.id })} seconds, so a screenshot is useless to a scalper. If you cannot attend, transfer the ticket inside the wallet for Rp${F.num(ES.cfg.get('transfer.fee', { eventId: e.id }))}, at face value at most.</div>
      <h2 style="margin-top:22px">How to get a ticket</h2><div class="stages">${stg.map(([k, w, n, d, href, cta], i) => { const st = stageState(w); return `<div class="stage ${st.s}"><div class="n">Stage ${i + 1}</div><h3>${n}</h3><div>${d}</div><div class="tag ${st.s === 'open' ? 'g' : st.s === 'soon' ? 'a' : ''}" style="align-self:flex-start">${esc(st.label)}</div>${st.s === 'open' ? `<a class="btn primary" href="${href}">${cta}</a>` : `<button class="btn" disabled>${cta}</button>`}</div>`; }).join('')}</div>
      ${wl && wl.status === 'drawn' || wl && wl.status === 'closed' ? '<div class="notice" style="margin-top:12px">Entered the lottery? <a href="#/lottery">Check your result</a>.</div>' : ''}
      <h2 style="margin-top:24px">Tickets</h2><div class="card">${ts.map((t) => { const L = { community: left('community', t), lottery: left('lottery', t), open: left('open', t) }; const any = Math.max(L.community, L.lottery, L.open); return `<div class="tt-row"><div class="nm"><b style="font-size:19px">${esc(t.name)}</b><div class="muted">${esc(t.perks || '')}${t.requires_id ? ' · ID check at the gate' : ''}</div></div><div class="pr">${F.rp(t.price)}</div>${any ? '' : '<span class="tag r">Sold out for now</span>'}</div>`; }).join('')}<div class="muted" style="margin-top:10px">Up to ${ES.cfg.get('tickets.per_buyer_cap', { eventId: e.id })} tickets per person for each type. Prices include the show; a small payment fee may be added at checkout.</div></div>
      ${lineup.length ? `<h2 style="margin-top:24px">Line-up</h2><div class="card">${lineup.map((a) => `<div class="tt-row"><div class="nm"><b>${esc(a.name)}</b></div><span class="muted">${esc(a.stage)} · ${esc(a.set_time || '')}</span></div>`).join('')}</div>` : ''}
      ${e.description ? `<h2 style="margin-top:24px">About</h2><p>${esc(e.description)}</p>` : ''}`, 'home');
  }

  // ---------- lottery ----------
  function lottery(e) {
    const w = wave(e, 'lottery'); const ts = types(e); const f = [{ name: 'name', label: 'Full name (as on your ID)', required: true, full: true }, { name: 'phone', label: 'Mobile number', required: true, placeholder: '0812…' }, { name: 'typeId', label: 'Ticket type', type: 'select', options: ts.map((t) => [t.id, t.name + ' · ' + F.rp(t.price)]) }, { name: 'qty', label: 'How many', type: 'number', min: 1, max: ES.cfg.get('tickets.per_buyer_cap', { eventId: e.id }), default: 2 }];
    const mine = LS.get('es-shop-lot-' + e.id); const entry = mine ? DB().get('SELECT * FROM lottery_entries WHERE event_id=? AND phone=?', [e.id, mine]) : null;
    const status = (en) => { const tt = DB().get('SELECT name FROM ticket_types WHERE id=?', [en.ticket_type_id]); const t = tt ? tt.name : ''; if (en.status === 'entered') return w.status === 'open' ? `<div class="notice ok"><b>You are in.</b> ${en.qty} × ${esc(t)}. The draw happens after entries close${w.closes_at ? ' (' + esc(F.stamp(w.closes_at)) + ')' : ''}. Come back here to check.</div>` : '<div class="notice warn">Entries are closed. The draw has not happened yet. Check back soon.</div>';
      if (en.status === 'won') { const mins = Math.round((new Date(en.link_expires_at) - new Date()) / 60000); return `<div class="notice ok"><b>You won ${en.qty} × ${esc(t)}.</b> ${mins > 0 ? 'Buy within <b>' + mins + ' minutes</b>. After that the seats go to other people.' : ''}</div>${mins > 0 ? `<a class="btn primary" style="margin-top:10px;min-height:52px" href="#/buy/${en.link_token}">Buy my tickets</a>` : '<div class="notice err">Your link has expired.</div>'}`; }
      if (en.status === 'purchased') return '<div class="notice ok">You bought your tickets. Open your <a href="#/wallet">wallet</a>.</div>'; if (en.status === 'expired') return '<div class="notice err">Your purchase link expired before you bought. The seats were released.</div>'; return '<div class="notice">Sorry, you were not selected in this draw. Watch for the open sale.</div>'; };
    shell(`<a href="#/" class="muted">← Event</a><h1 style="margin:8px 0">Public lottery</h1><p class="muted">One entry per phone number. Winners are drawn by a published method: the seed fingerprint is shown before the draw so nobody can change the result.</p>
      ${entry ? `<div class="card" style="margin:12px 0"><h3>Your entry · ${esc(entry.name)}</h3>${status(entry)}</div>` : ''}
      ${w && w.status === 'open' && !entry ? `<div class="card" style="margin-top:12px" id="lf">${ES.ui.formHTML(f, { qty: 2 })}<button class="btn primary" id="lgo" style="margin-top:14px;min-height:52px;width:100%">Enter the lottery</button></div>` : ''}
      ${!entry ? `<div class="card" style="margin-top:12px"><h3>Check an entry</h3><div class="row" style="gap:8px"><input class="input" id="chk" placeholder="Mobile number" style="flex:1;min-height:48px"><button class="btn" id="cgo" style="min-height:48px">Check</button></div></div>` : ''}
      ${w && w.draw_hash ? `<div class="demo"><b>Fairness check.</b> Seed fingerprint (published before the draw): <code style="word-break:break-all">${esc(w.draw_hash)}</code></div>` : ''}`, 'home');
    const go = $('#lgo'); if (go) go.onclick = async () => { const v = ES.ui.validate($('#lf'), f); if (!v) return; try { await ES.db.write('lottery entry', () => ES.tix.lotteryEnter(e.id, { name: v.name, phone: v.phone, qty: v.qty, typeId: Number(v.typeId) })); LS.set('es-shop-lot-' + e.id, F.normPhone(v.phone)); toast('You are in the lottery', 'ok'); route(); } catch (err) { toast(err.message, 'err'); } };
    const cg = $('#cgo'); if (cg) cg.onclick = () => { const p = F.normPhone($('#chk').value); if (!DB().get('SELECT 1 FROM lottery_entries WHERE event_id=? AND phone=?', [e.id, p])) return toast('No entry with that number', 'err'); LS.set('es-shop-lot-' + e.id, p); route(); };
  }

  // ---------- winner link ----------
  function buy(e, token) {
    const en = DB().get('SELECT * FROM lottery_entries WHERE link_token=? AND event_id=?', [token, e.id]);
    if (!en) { shell('<div class="card"><h2>Link not recognised</h2><p class="muted">Check the link in your message, or <a href="#/lottery">check your lottery result</a>.</p></div>', 'home'); return; }
    if (en.status === 'purchased') { shell('<div class="card"><h2>Already bought</h2><p>This link was used. Open your <a href="#/wallet">wallet</a>.</p></div>', 'home'); return; }
    if (en.status !== 'won' || new Date(en.link_expires_at) < new Date()) { shell('<div class="card"><h2>This link has expired</h2><p class="muted">Winners have a short time to buy so that unclaimed seats can go to other people.</p></div>', 'home'); return; }
    co = { kind: 'lottery', entry: en, typeId: en.ticket_type_id, qty: en.qty, maxQty: en.qty, name: en.name, phone: en.phone, lockedPhone: true }; location.hash = '#/checkout';
  }

  // ---------- community ----------
  function community(e) {
    const ts = types(e); const f = [{ name: 'code', label: 'Your community code', required: true, placeholder: 'e.g. SENJA-2410' }, { name: 'name', label: 'Full name', required: true, full: true }, { name: 'phone', label: 'Mobile number', required: true }, { name: 'typeId', label: 'Ticket type', type: 'select', options: ts.map((t) => [t.id, t.name + ' · ' + F.rp(t.price)]) }, { name: 'qty', label: 'How many', type: 'number', min: 1, default: 2 }];
    const w = wave(e, 'community');
    shell(`<a href="#/" class="muted">← Event</a><h1 style="margin:8px 0">Community presale</h1><p class="muted">Each code is for one purchase and is tied to the phone number that first uses it.</p>${w && w.status === 'open' ? `<div class="card" id="cf">${ES.ui.formHTML(f, { qty: 2 })}<button class="btn primary" id="cgo" style="margin-top:14px;min-height:52px;width:100%">Continue to checkout</button></div>` : `<div class="notice warn">${esc(stageState(w).label)}. The community presale is not open right now.</div>`}`, 'home');
    const g = $('#cgo'); if (g) g.onclick = () => { const v = ES.ui.validate($('#cf'), f); if (!v) return; const c = DB().get('SELECT * FROM community_codes WHERE event_id=? AND upper(code)=upper(?)', [e.id, v.code.trim()]); if (!c) return toast('That code is not recognised', 'err'); if (c.used) return toast('That code has already been used', 'err');
      co = { kind: 'community', code: v.code.trim(), typeId: c.ticket_type_id || Number(v.typeId), qty: Math.min(v.qty, c.max_qty), maxQty: c.max_qty, name: v.name, phone: F.normPhone(v.phone) }; location.hash = '#/checkout'; };
  }

  // ---------- open sale queue ----------
  function queue(e) {
    const w = wave(e, 'open'); const phone = LS.get('es-shop-q-' + e.id);
    if (!w || w.status !== 'open') { shell(`<a href="#/" class="muted">← Event</a><h1 style="margin:8px 0">Open sale</h1><div class="notice warn">${esc(stageState(w).label)}. The queue opens with the sale. Everyone who joins during the first ${ES.cfg.get('sales.open_queue_minutes', { eventId: e.id })} minutes gets a random place, so there is no advantage in being early.</div>`, 'home'); return; }
    const q = phone ? DB().get('SELECT * FROM queue_entries WHERE event_id=? AND phone=?', [e.id, phone]) : null;
    if (!q) { const f = [{ name: 'name', label: 'Full name', required: true, full: true }, { name: 'phone', label: 'Mobile number', required: true }];
      shell(`<a href="#/" class="muted">← Event</a><h1 style="margin:8px 0">Join the queue</h1><p class="muted">One place per phone number. Keep this page open; it updates by itself.</p><div class="card" id="qf">${ES.ui.formHTML(f)}<button class="btn primary" id="qgo" style="margin-top:14px;min-height:52px;width:100%">Join the queue</button></div>`, 'home');
      $('#qgo').onclick = async () => { const v = ES.ui.validate($('#qf'), f); if (!v) return; const p = F.normPhone(v.phone); if (!/^0\d{8,13}$/.test(p)) return toast('Enter a valid mobile number', 'err'); await ES.db.write('join queue', () => ES.tix.queueJoin(e.id, p, v.name)); LS.set('es-shop-q-' + e.id, p); LS.set('es-shop-qn-' + e.id, v.name); route(); }; return; }
    const draw = () => { const qq = DB().get('SELECT * FROM queue_entries WHERE event_id=? AND phone=?', [e.id, q.phone]); const pos = ES.tix.queuePosition(qq, e); const main = $('#main'); if (!main) return;
      main.innerHTML = `<a href="#/" class="muted">← Event</a><div class="card wait">${pos.admitted ? `<h1 style="color:var(--green)">It is your turn</h1><p style="margin:10px 0">Choose your tickets now.</p><a class="btn primary" style="min-height:56px" href="#/checkout" id="qgoto">Choose tickets</a>` : `<div class="muted">Your place in the queue</div><div class="pos">${F.num(pos.position)}</div><p class="muted">About ${pos.etaMin} min to go. ${F.num(pos.ahead)} people ahead of you. Do not refresh; you will not lose your place if you do.</p>`}</div>`;
      const g = $('#qgoto'); if (g) g.onclick = () => { co = { kind: 'open', typeId: null, qty: 1, maxQty: ES.cfg.get('tickets.per_buyer_cap', { eventId: e.id }), name: LS.get('es-shop-qn-' + e.id) || q.name, phone: q.phone, lockedPhone: true }; }; };
    shell('', 'home'); draw(); timers.push(setInterval(draw, 2500));
  }

  // ---------- checkout ----------
  function checkout(e) {
    if (!co) { location.hash = '#/'; return; } const ts = types(e); const tsel = co.kind === 'open' || !co.typeId;
    if (!co.typeId) co.typeId = ts[0].id; const tt = ts.find((t) => t.id === co.typeId) || ts[0];
    const f = [{ name: 'name', label: 'Name on the ticket', required: true, full: true }, { name: 'phone', label: 'Mobile number', required: true }, { name: 'email', label: 'Email for your receipt', required: true }];
    const fs = (typeId, qty) => feeFor(e, ts.find((t) => t.id === typeId), qty);
    const sum = () => { const s = fs(co.typeId, co.qty); const t2 = ts.find((t) => t.id === co.typeId); $('#sum').innerHTML = `<div class="sum-row"><span>${co.qty} × ${esc(t2.name)}</span><span>${F.rp(s.sub)}</span></div>${s.payer === 'buyer' ? `<div class="sum-row"><span>Payment fee</span><span>${F.rp(s.fee)}</span></div>` : ''}<div class="sum-row tot"><span>Total</span><span>${F.rp(s.total)}</span></div>`; };
    shell(`<a href="#/" class="muted">← Event</a><h1 style="margin:8px 0">Checkout</h1>${co.kind === 'lottery' ? `<div class="notice warn" id="cd" style="margin-bottom:12px"></div>` : ''}<div class="co"><div class="card"><div class="stack"><div id="cof">${ES.ui.formHTML(f, { name: co.name, phone: co.phone })}</div>
      ${tsel ? `<label class="field"><span>Ticket type</span><select class="input" id="ctt">${ts.map((t) => `<option value="${t.id}" ${t.id === co.typeId ? 'selected' : ''}>${esc(t.name)} · ${F.rp(t.price)}</option>`).join('')}</select></label>` : `<div><b>${esc(tt.name)}</b></div>`}
      <label class="field"><span>How many</span><input class="input" id="cq" type="number" min="1" max="${co.maxQty}" value="${co.qty}" style="max-width:120px"></label>
      <label class="field"><span>Pay with</span><select class="input" id="cm"><option>QRIS</option><option>BCA Virtual Account</option><option>Mandiri Virtual Account</option><option>Credit card</option></select></label></div></div>
      <div class="card" style="align-self:start"><h3>Your order</h3><div id="sum"></div><button class="btn primary" id="pay" style="margin-top:14px;min-height:56px;width:100%;font-size:18px">Pay now</button><div class="muted" style="margin-top:8px">Demo payment: nothing is charged. In production this opens the payment gateway.</div></div></div>`, 'home');
    if (co.lockedPhone) { const p = $('[name=phone]'); if (p) p.readOnly = true; } sum();
    if (co.kind === 'lottery') { const tick = () => { const ms = new Date(co.entry.link_expires_at) - new Date(); const el = $('#cd'); if (!el) return; if (ms <= 0) { el.className = 'notice err'; el.textContent = 'Your link has expired.'; $('#pay').disabled = true; return; } el.innerHTML = `Reserved for you: <b>${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}</b> left to pay.`; }; tick(); timers.push(setInterval(tick, 1000)); }
    const ctt = $('#ctt'); if (ctt) ctt.onchange = () => { co.typeId = Number(ctt.value); sum(); }; $('#cq').oninput = () => { co.qty = Math.max(1, Math.min(co.maxQty, Number($('#cq').value) || 1)); sum(); };
    $('#pay').onclick = async () => { const v = ES.ui.validate($('#cof'), f, (v, fail) => { if (!/^\S+@\S+\.\S+$/.test(v.email)) fail('email', 'Enter a valid email'); }); if (!v) return; $('#pay').disabled = true; $('#pay').innerHTML = '<span class="spin"></span> Processing…';
      try { await new Promise((r) => setTimeout(r, 900)); const out = await ES.db.write('shop order', () => ES.tix.buy({ eventId: e.id, typeId: co.typeId, qty: co.qty, name: v.name, phone: v.phone, email: v.email, wave: co.kind, code: co.code, entryId: co.entry && co.entry.id, method: $('#cm').value }));
        SS.set('es-shop-phone', out.order.buyer_phone); LS.set('es-shop-email-' + out.order.buyer_phone, v.email); co = null; location.hash = '#/done/' + out.order.no; } catch (err) { $('#pay').disabled = false; $('#pay').textContent = 'Pay now'; toast(err.message, 'err'); } };
  }
  function done(e, no) {
    const o = DB().get('SELECT * FROM orders WHERE no=?', [no]); if (!o) { location.hash = '#/'; return; } const tk = DB().all('SELECT t.*, tt.name tname FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.order_id=?', [o.id]);
    shell(`<div class="card" style="text-align:center;padding:30px"><div class="strip" style="height:14px;max-width:260px;margin:0 auto 14px"></div><h1 style="color:var(--green)">Payment received</h1><p style="margin:8px 0">Order <b>${esc(o.no)}</b> · ${tk.length} × ${esc(tk[0] ? tk[0].tname : '')} · ${F.rp(o.total)}</p><p class="muted">A receipt was sent to ${esc(o.buyer_email || 'your email')}. Your tickets are in your wallet. Open it on the day, on this phone.</p><a class="btn primary" href="#/wallet" style="margin-top:14px;min-height:52px">Open my wallet</a></div>`, 'wallet');
  }

  // ---------- wallet ----------
  function wallet(e) {
    const phone = buyer(); if (!phone) return walletLogin(e);
    const tks = DB().all(`SELECT t.*, tt.name tname, tt.color, tt.requires_id FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.holder_phone=? AND t.event_id=? AND t.status IN ('valid','used') ORDER BY t.id`, [phone, e.id]);
    const gone = DB().all("SELECT t.*, tt.name tname FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.holder_phone=? AND t.event_id=? AND t.status IN ('void','refunded') ORDER BY t.id DESC", [phone, e.id]);
    const orders = DB().all('SELECT * FROM orders WHERE buyer_phone=? AND event_id=? ORDER BY id DESC', [phone, e.id]); const rot = ES.cfg.get('qr.rotate_seconds', { eventId: e.id });
    shell(`<div class="row"><div><h1>My tickets</h1><div class="muted">${esc(F.mask(phone))} · ${esc(e.name)} · ${F.date(e.date, 'long')}</div></div><span class="spacer"></span><button class="btn" id="out">Sign out</button></div><div style="margin-top:14px">${tks.map((t) => `<div class="tk ${t.status === 'used' ? 'dead' : ''}"><div class="top"><h3>${esc(t.tname)}</h3><div style="color:#C9D2EA">${esc(t.holder_name)} · ${esc(t.serial)}${t.generation > 1 ? ' · transferred to you' : ''}</div></div>
      ${t.status === 'used' ? `<div class="qrbox"><h2 style="color:var(--green)">Used</h2><div class="muted">Scanned ${esc(F.stamp(t.used_at))}</div></div>` : `<div class="strip"></div><div class="qrbox" data-q="${t.id}"></div><div style="text-align:center;padding-bottom:10px" class="muted">Code refreshes every ${rot} s. Screenshots do not work. ${t.requires_id ? '<b>Bring your ID.</b>' : ''}</div><div class="strip"></div><div class="foot"><button class="btn" data-tr="${t.id}">Transfer to someone</button></div>`}</div>`).join('') || '<div class="notice">You have no tickets for this event yet. <a href="#/">See how to get one</a>.</div>'}</div>
      ${orders.length ? `<h2 style="margin-top:22px">Orders</h2><div class="card">${orders.map((o) => `<div class="tt-row"><div class="nm"><b>${esc(o.no)}</b><div class="muted">${esc(F.stamp(o.created_at))} · ${o.qty} ticket(s) · ${esc(o.payment_method || '')}</div></div><b>${F.rp(o.total)}</b>${o.status === 'refunded' ? '<span class="tag r">Refunded</span>' : ''}</div>`).join('')}</div>` : ''}
      ${gone.length ? `<h2 style="margin-top:22px">Transferred or refunded</h2><div class="card">${gone.map((t) => `<div class="tt-row"><div class="nm">${esc(t.serial)} · ${esc(t.tname)}</div><span class="tag">${esc(t.status === 'void' ? 'Transferred away' : t.status)}</span></div>`).join('')}</div>` : ''}`, 'wallet');
    $('#out').onclick = () => { SS.set('es-shop-phone', null); route(); };
    const paint = () => { $$('[data-q]').forEach((b) => { const t = tks.find((x) => x.id === Number(b.dataset.q)); const w = Math.floor(Date.now() / 1000 / rot); if (b.dataset.w === String(w)) return; b.dataset.w = String(w); b.innerHTML = ESQR.svg(ES.tix.qrToken(t, Date.now(), rot), { size: 260, label: 'Entry code for ' + t.serial }) + `<div class="bar2"><i></i></div>`; }); const left = rot - ((Date.now() / 1000) % rot); $$('.bar2 i').forEach((i) => (i.style.width = (left / rot * 100) + '%')); };
    paint(); timers.push(setInterval(paint, 500));
    $$('[data-tr]').forEach((b) => (b.onclick = () => transferForm(e, tks.find((x) => x.id === Number(b.dataset.tr)))));
  }
  function transferForm(e, t) {
    const ctx = { eventId: e.id, ticketTypeId: t.ticket_type_id }; const fee = ES.cfg.get('transfer.fee', ctx); const cap = ES.cfg.get('resale.cap_pct', ctx); const max = Math.floor(t.price * cap / 100);
    const f = [{ name: 'toName', label: 'New holder’s full name', required: true, full: true }, { name: 'toPhone', label: 'New holder’s mobile number', required: true, help: 'They will sign in with this number.' }, { name: 'askPrice', label: 'Price you agree with them (Rp)', type: 'money', default: t.price, help: 'The most allowed is ' + F.rp(max) + ' (' + cap + '% of face value). Payment between you is outside this app.' }];
    ES.ui.drawer.open({ title: 'Transfer ' + t.serial, body: `<div class="notice warn" style="margin-bottom:12px">Your ticket stops working the moment you transfer it. The new holder gets a fresh one. Fee <b>${F.rp(fee)}</b>, paid by you.</div>` + ES.ui.formHTML(f, { askPrice: t.price }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Transfer and pay ' + F.rp(fee) + '</button>',
      onMount: (b, d) => { ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f, (v, fail) => { if (v.askPrice > max) fail('askPrice', 'Above the ' + cap + '% cap (' + F.rp(max) + ')'); }); if (!v) return;
        if (!(await ES.ui.confirm('Transfer this ticket?', 'You cannot undo this. ' + v.toName + ' will receive the ticket and yours will stop working.', { ok: 'Transfer', danger: true }))) return;
        try { await ES.db.write('transfer', () => ES.tix.transfer(t.id, { toPhone: v.toPhone, toName: v.toName, askPrice: v.askPrice })); ES.ui.drawer.close(); toast('Transferred. They can sign in with their number.', 'ok'); route(); } catch (err) { toast(err.message, 'err'); } }; } });
  }
  function walletLogin(e) {
    const f = [{ name: 'phone', label: 'Mobile number used to buy', required: true, placeholder: '0812…' }];
    shell(`<div class="card" style="max-width:480px;margin:20px auto"><h2>Sign in to your wallet</h2><p class="muted">We send a 6-digit code to your phone number and to your email.</p><div id="lf">${ES.ui.formHTML(f)}</div><button class="btn primary" id="go" style="margin-top:12px;min-height:52px;width:100%">Send code</button><div id="step2" style="display:none"><label class="field" style="margin-top:14px"><span>Code</span><input class="input" id="otp" inputmode="numeric" maxlength="6" style="min-height:52px;font-size:22px;letter-spacing:.3em"></label><button class="btn go" id="vf" style="margin-top:10px;min-height:52px;width:100%">Open my wallet</button></div><div class="demo" id="demo" style="display:none"></div></div>`, 'wallet');
    let phone = '';
    $('#go').onclick = async () => { const v = ES.ui.validate($('#lf'), f); if (!v) return; phone = F.normPhone(v.phone); const known = DB().get('SELECT * FROM tickets WHERE holder_phone=? LIMIT 1', [phone]); if (!known) return toast('No tickets are held by this number. Use the number you bought with.', 'err');
      const o = DB().get("SELECT buyer_email, buyer_name FROM orders WHERE buyer_phone=? AND buyer_email IS NOT NULL ORDER BY id DESC", [phone]); const email = (o && o.buyer_email) || (LS.get('es-shop-email-' + phone)) || (phone + '@sms.local');
      await ES.db.write('buyer code', () => ES.auth.issueCode('buyer', phone, email, known.holder_name, 'Your wallet sign-in code', 'Use this code to open your tickets.'));
      $('#step2').style.display = ''; $('#otp').focus(); const dm = $('#demo'); dm.style.display = ''; const last = DB().get("SELECT body FROM outbox WHERE kind='login-code' AND to_email=? ORDER BY id DESC", [email]); const m = last && /code: (\d{6})/.exec(last.body); dm.innerHTML = '<b>Demo only.</b> In production the code arrives by SMS/email. Here it is in the ERP “Outbox”' + (m ? ': <b>' + m[1] + '</b> <button class="btn sm" id="fill">Fill it in</button>' : '.'); const fl = $('#fill'); if (fl) fl.onclick = () => ($('#otp').value = m[1]); };
    $('#vf').onclick = async () => { const r = ES.auth.verifyCode('buyer', phone, $('#otp').value); if (!r) return toast('That code is wrong or expired', 'err'); await ES.db.write('code used', () => DB().run('UPDATE login_codes SET used=1 WHERE id=?', [r.id])); SS.set('es-shop-phone', phone); route(); };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
