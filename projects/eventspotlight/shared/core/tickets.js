/* Event Spotlight — ticketing engine: dynamic QR, purchase rules, fair-sales waves, lottery, queue, transfers, scanning,
   offline sync and the dispute desk. Functions that write must be called inside ES.db.write(). */
(function () {
  const ES = (window.ES = window.ES || {});
  const F = () => ES.fmt;
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const nowIso = () => ES.fmt.nowStamp();

  // ---------- dynamic QR ----------
  const windowOf = (ms, rot) => Math.floor(ms / 1000 / rot);
  const sig = (secret, serial, win) => ES.auth.sha256('qr|' + secret + '|' + serial + '|' + win).slice(0, 10);
  function qrToken(ticket, ms, rot) {
    rot = rot || 30; const w = windowOf(ms || Date.now(), rot);
    return 'ES1.' + ticket.serial + '.' + w + '.' + sig(ticket.secret, ticket.serial, w);
  }
  function parseToken(t) {
    const m = /^ES1\.([A-Z0-9-]+)\.(\d+)\.([0-9a-f]{10})$/.exec(String(t || '').trim());
    return m ? { serial: m[1], win: Number(m[2]), sig: m[3] } : null;
  }
  /* Pure check of a token against a ticket row (no writes).
     Returns {result: 'valid'|'invalid'|'expired'|'void'|'used'|'refunded'|'wrong_event'|'not_open', ticket, detail} */
  function check(token, ctx) {
    ctx = ctx || {}; const p = parseToken(token);
    if (!p) return { result: 'invalid', detail: 'Not an Event Spotlight code' };
    const t = ctx.lookup ? ctx.lookup(p.serial) : ES.db.get('SELECT * FROM tickets WHERE serial=?', [p.serial]);
    if (!t) return { result: 'invalid', detail: 'No such ticket' };
    if (sig(t.secret, t.serial, p.win) !== p.sig) return { result: 'invalid', detail: 'Code signature does not match (forged or edited)', ticket: t };
    if (ctx.eventId && t.event_id !== ctx.eventId) return { result: 'wrong_event', detail: 'Ticket is for another event', ticket: t };
    const rot = ctx.rotate || 30, grace = ctx.grace === undefined ? 1 : ctx.grace;
    const cur = windowOf(ctx.now || Date.now(), rot), diff = cur - p.win;
    if (t.status === 'void') return { result: 'void', detail: 'This ticket was transferred. The new holder has a new code.', ticket: t };
    if (t.status === 'refunded') return { result: 'refunded', detail: 'Refunded', ticket: t };
    if (diff > grace || diff < -1) return { result: 'expired', detail: 'Code is ' + Math.max(0, diff * rot) + ' seconds old. Likely a screenshot. Ask for a refresh from the wallet.', ticket: t };
    if (t.status === 'used') return { result: 'used', detail: 'Already used', ticket: t };
    return { result: 'valid', ticket: t };
  }

  // ---------- inventory ----------
  const eventOf = (id) => ES.db.get('SELECT * FROM events WHERE id=?', [id]);
  function typeStats(eventId) {
    return ES.db.all(`SELECT tt.*, (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id=tt.id AND t.status IN ('valid','used') AND t.rescue=0) sold,
      (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id=tt.id AND t.status='pool') pool,
      (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id=tt.id AND t.status='used') used
      FROM ticket_types tt WHERE tt.event_id=? ORDER BY sort,id`, [eventId]).map((r) => Object.assign(r, { left: Math.max(0, r.quota - r.sold - r.pool) }));
  }
  function waveSold(waveKind, typeId) {
    return ES.db.val("SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.wave_kind=? AND t.ticket_type_id=? AND t.status IN ('valid','used','void') AND t.transferred_from IS NULL", [waveKind, typeId]) || 0;
  }
  function waveFor(eventId, kind) { return ES.db.get('SELECT * FROM waves WHERE event_id=? AND kind=?', [eventId, kind]); }
  /* How many tickets of a type can still be bought in a wave (open sale inherits unsold community and lottery seats). */
  function waveLeft(eventId, kind, typeId) {
    const w = waveFor(eventId, kind); if (!w) return 0;
    const a = ES.db.val('SELECT qty FROM wave_alloc WHERE wave_id=? AND ticket_type_id=?', [w.id, typeId]) || 0;
    let left = a - waveSold(kind, typeId);
    if (kind === 'open') ['community', 'lottery'].forEach((k) => {
      const ww = waveFor(eventId, k); if (ww && ww.status === 'closed') { const aa = ES.db.val('SELECT qty FROM wave_alloc WHERE wave_id=? AND ticket_type_id=?', [ww.id, typeId]) || 0; left += Math.max(0, aa - waveSold(k, typeId)); }
    });
    const tt = ES.db.get('SELECT quota FROM ticket_types WHERE id=?', [typeId]);
    const sold = ES.db.val("SELECT COUNT(*) FROM tickets WHERE ticket_type_id=? AND status IN ('valid','used') AND rescue=0", [typeId]);
    const pool = ES.db.val("SELECT COUNT(*) FROM tickets WHERE ticket_type_id=? AND status='pool'", [typeId]) || 0;
    return Math.max(0, Math.min(left, (tt ? tt.quota : 0) - sold - pool));
  }
  const heldBy = (eventId, phone, typeId) => ES.db.val("SELECT COUNT(*) FROM tickets WHERE event_id=? AND holder_phone=? AND ticket_type_id=? AND status IN ('valid','used')", [eventId, phone, typeId]) || 0;
  function serialPrefix(ev) { return (ev.name.match(/\b[A-Z]/g) || ['E', 'S']).join('').slice(0, 4); }
  function nextSerial(ev) {
    const n = (ES.db.val('SELECT COUNT(*) FROM tickets WHERE event_id=?', [ev.id]) || 0) + 1;
    return serialPrefix(ev) + '-' + String(n).padStart(6, '0');
  }
  function mintTicket(ev, o) {
    const serial = o.serial || nextSerial(ev);
    const id = ES.db.insert('tickets', { event_id: ev.id, order_id: o.order_id || null, ticket_type_id: o.ticket_type_id, serial, holder_name: o.holder_name || null, holder_phone: o.holder_phone || null,
      status: o.status || 'valid', secret: rand(8), price: o.price || 0, issued_at: o.issued_at || nowIso(), transferred_from: o.transferred_from || null, rescue: o.rescue ? 1 : 0, generation: o.generation || 1 });
    return ES.db.get('SELECT * FROM tickets WHERE id=?', [id]);
  }

  // ---------- buying ----------
  /* o: {eventId, wave:'community'|'lottery'|'open'|'reseller'|'rescue', typeId, qty, name, phone, email, code?, entryId?, promotorId?, method}
     Enforces every rule and returns {order, tickets}. Throws Error with a buyer-readable message. */
  function buy(o) {
    const ev = eventOf(o.eventId); if (!ev) throw new Error('Event not found');
    const tt = ES.db.get('SELECT * FROM ticket_types WHERE id=? AND event_id=?', [o.typeId, ev.id]); if (!tt || !tt.active) throw new Error('That ticket type is not on sale');
    const qty = Number(o.qty) || 1; if (qty < 1) throw new Error('Choose at least one ticket');
    const phone = F().normPhone(o.phone); if (!/^0\d{8,13}$/.test(phone)) throw new Error('Enter a valid mobile number');
    if (!o.name || String(o.name).trim().length < 2) throw new Error('Enter the name that will be printed on the ticket');
    const ctx = { eventId: ev.id, ticketTypeId: tt.id };
    const cap = ES.cfg.get('tickets.per_buyer_cap', ctx);
    const already = heldBy(ev.id, phone, tt.id);
    let kind = o.wave;
    if (kind !== 'rescue' && already + qty > cap) throw new Error('Limit is ' + cap + ' per buyer for ' + tt.name + '. This number already holds ' + already + '.');
    if (kind === 'community') {
      const c = ES.db.get('SELECT * FROM community_codes WHERE event_id=? AND upper(code)=upper(?)', [ev.id, o.code || '']);
      if (!c) throw new Error('That community code is not recognised'); if (c.used) throw new Error('That code has already been used');
      if (c.bound_phone && c.bound_phone !== phone) throw new Error('That code is bound to another phone number');
      if (c.ticket_type_id && c.ticket_type_id !== tt.id) throw new Error('That code is for a different ticket type');
      if (qty > c.max_qty) throw new Error('That code allows up to ' + c.max_qty + ' tickets');
      if (waveFor(ev.id, 'community').status !== 'open') throw new Error('The community presale is not open');
    } else if (kind === 'lottery') {
      const e = ES.db.get("SELECT * FROM lottery_entries WHERE id=? AND event_id=?", [o.entryId, ev.id]);
      if (!e || e.status !== 'won') throw new Error('This purchase link is not valid');
      if (e.phone !== phone) throw new Error('This link belongs to another phone number');
      if (new Date(e.link_expires_at) < new Date()) { ES.db.update('lottery_entries', e.id, { status: 'expired' }); throw new Error('This link has expired. Winners have ' + ES.cfg.get('sales.purchase_link_minutes', ctx) + ' minutes to buy.'); }
      if (e.ticket_type_id !== tt.id) throw new Error('This link is for a different ticket type'); if (qty > e.qty) throw new Error('You won ' + e.qty + ' tickets');
    } else if (kind === 'open') {
      const w = waveFor(ev.id, 'open'); if (!w || w.status !== 'open') throw new Error('Open sale has not started');
      const q = ES.db.get("SELECT * FROM queue_entries WHERE event_id=? AND phone=? ORDER BY id DESC", [ev.id, phone]);
      if (q && q.status !== 'admitted' && !queueAdmitted(q, ev)) throw new Error('You are still in the queue');
    } else if (kind === 'rescue') {
      /* handled by dispute desk issueRescue */
    } else if (kind === 'reseller') {
      /* reseller sales draw from the open wave allocation */
      kind = 'open';
    } else throw new Error('Unknown sales channel');
    if (kind !== 'rescue') { const left = waveLeft(ev.id, kind, tt.id); if (qty > left) throw new Error(left ? 'Only ' + left + ' left in this release' : tt.name + ' is sold out in this release'); }

    const subtotal = tt.price * qty;
    const payer = ES.cfg.get('fees.admin_payer', ctx);
    const fee = Math.round(subtotal * ES.cfg.get('fees.admin_pct', ctx) / 100 + ES.cfg.get('fees.admin_flat', ctx));
    const total = subtotal + (payer === 'buyer' ? fee : 0);
    const date = F().today();
    const no = ES.num.next('ORD', date);
    const orderId = ES.db.insert('orders', { event_id: ev.id, no, buyer_name: o.name.trim(), buyer_phone: phone, buyer_email: o.email || null, verified: o.verified === false ? 0 : 1,
      channel: o.wave === 'reseller' ? 'reseller' : (o.wave === 'rescue' ? 'rescue' : 'direct'), wave_kind: kind, promotor_id: o.promotorId || null, qty, subtotal, admin_fee: fee, total, status: 'paid',
      payment_method: o.method || 'QRIS', created_at: nowIso(), paid_at: nowIso() });
    const tickets = [];
    for (let i = 0; i < qty; i++) tickets.push(mintTicket(ev, { order_id: orderId, ticket_type_id: tt.id, holder_name: o.name.trim(), holder_phone: phone, price: tt.price }));
    const eid = ES.ledger.ticketSale({ event_id: ev.id, date, no, id: orderId }, { subtotal, admin_fee: fee, total, payer });
    ES.db.update('orders', orderId, { ledger_entry_id: eid });
    if (kind === 'community') { const c = ES.db.get('SELECT id FROM community_codes WHERE event_id=? AND upper(code)=upper(?)', [ev.id, o.code]); ES.db.update('community_codes', c.id, { used: 1, used_at: nowIso(), order_id: orderId, bound_phone: phone }); }
    if (kind === 'lottery') ES.db.update('lottery_entries', o.entryId, { status: 'purchased', order_id: orderId });
    ES.db.log('ticket order', 'orders', orderId, no + ' · ' + qty + ' × ' + tt.name + ' · ' + phone);
    if (o.email) ES.db.email(o.email, o.name, 'Your tickets for ' + ev.name + ' (' + no + ')', 'Thank you ' + o.name + '.\n\nOrder ' + no + ': ' + qty + ' × ' + tt.name + '.\nOpen your wallet in the ticket shop and sign in with this phone number to show your ticket. The QR code refreshes every ' + ES.cfg.get('qr.rotate_seconds', ctx) + ' seconds, so screenshots will not work.', 'order');
    return { order: ES.db.get('SELECT * FROM orders WHERE id=?', [orderId]), tickets };
  }

  // ---------- queue (open sale) ----------
  function queueJoin(eventId, phone, name) {
    phone = F().normPhone(phone);
    const ex = ES.db.get('SELECT * FROM queue_entries WHERE event_id=? AND phone=?', [eventId, phone]); if (ex) return ex;
    const w = waveFor(eventId, 'open'); const joined = nowIso();
    const win = ES.cfg.get('sales.open_queue_minutes', { eventId });
    const minutesSinceOpen = w && w.opens_at ? (Date.now() - new Date(w.opens_at.replace(' ', 'T')).getTime()) / 60000 : 0;
    // Inside the random window everybody gets a random place; afterwards places are first come, first served.
    const base = ES.db.val('SELECT COUNT(*) FROM queue_entries WHERE event_id=?', [eventId]) || 0;
    const rank = minutesSinceOpen <= win ? Math.max(1, Math.floor(Math.random() * (base + 50)) + 1) : base + 1000;
    const id = ES.db.insert('queue_entries', { event_id: eventId, wave_id: w ? w.id : null, phone, name, rank, joined_at: joined });
    return ES.db.get('SELECT * FROM queue_entries WHERE id=?', [id]);
  }
  function queueAdmitted(q, ev) {
    const w = waveFor(ev.id, 'open'); const rate = ES.cfg.get('sales.queue_rate_per_min', { eventId: ev.id });
    const t0 = new Date((w && w.opens_at ? w.opens_at : q.joined_at).replace(' ', 'T')).getTime();
    const admitted = Math.floor(((Date.now() - t0) / 60000) * rate);
    const ahead = ES.db.val('SELECT COUNT(*) FROM queue_entries WHERE event_id=? AND (rank<? OR (rank=? AND id<?))', [ev.id, q.rank, q.rank, q.id]) || 0;
    return ahead < admitted;
  }
  function queuePosition(q, ev) {
    const ahead = ES.db.val('SELECT COUNT(*) FROM queue_entries WHERE event_id=? AND (rank<? OR (rank=? AND id<?))', [ev.id, q.rank, q.rank, q.id]) || 0;
    const w = waveFor(ev.id, 'open'); const rate = ES.cfg.get('sales.queue_rate_per_min', { eventId: ev.id });
    const t0 = new Date((w && w.opens_at ? w.opens_at : q.joined_at).replace(' ', 'T')).getTime();
    const admitted = Math.floor(((Date.now() - t0) / 60000) * rate);
    return { position: ahead + 1, ahead, admitted: ahead < admitted, etaMin: Math.max(0, Math.ceil((ahead - admitted) / rate)) };
  }

  // ---------- lottery ----------
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const seedNum = (hex) => parseInt(hex.slice(0, 8), 16);
  function lotteryEnter(eventId, o) {
    const w = waveFor(eventId, 'lottery'); if (!w || w.status !== 'open') throw new Error('The lottery is not open for entries');
    const phone = F().normPhone(o.phone); if (!/^0\d{8,13}$/.test(phone)) throw new Error('Enter a valid mobile number');
    if (ES.db.get('SELECT id FROM lottery_entries WHERE wave_id=? AND phone=?', [w.id, phone])) throw new Error('This number has already entered');
    const id = ES.db.insert('lottery_entries', { event_id: eventId, wave_id: w.id, phone, name: o.name, qty: Number(o.qty) || 1, ticket_type_id: o.typeId, created_at: nowIso() });
    return ES.db.get('SELECT * FROM lottery_entries WHERE id=?', [id]);
  }
  // Step 1: commit to a secret seed before the draw by publishing only its hash.
  function lotteryCommit(waveId) {
    const w = ES.db.get('SELECT * FROM waves WHERE id=?', [waveId]); if (w.draw_hash) throw new Error('A seed hash is already published');
    const seed = rand(16); ES.db.update('waves', waveId, { draw_seed: seed, draw_hash: ES.auth.sha256('seed|' + seed) });
    return ES.db.get('SELECT * FROM waves WHERE id=?', [waveId]);
  }
  function drawOrder(entryIds, seed) {
    const ids = entryIds.slice().sort((a, b) => a - b); const rnd = mulberry(seedNum(ES.auth.sha256(seed + '|' + ids.join(','))));
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids;
  }
  // Step 2: run the draw. Winners fill each ticket type's allocation; link lifetime comes from config.
  function lotteryDraw(waveId) {
    const w = ES.db.get('SELECT * FROM waves WHERE id=?', [waveId]); if (w.status === 'closed') throw new Error('This draw is already done');
    if (!w.draw_hash) throw new Error('Publish the seed hash first so entrants can verify the draw later');
    const entries = ES.db.all("SELECT * FROM lottery_entries WHERE wave_id=? AND status='entered'", [waveId]);
    const order = drawOrder(entries.map((e) => e.id), w.draw_seed); const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    const left = {}; ES.db.all('SELECT * FROM wave_alloc WHERE wave_id=?', [waveId]).forEach((a) => (left[a.ticket_type_id] = a.qty));
    const mins = ES.cfg.get('sales.purchase_link_minutes', { eventId: w.event_id }); const exp = new Date(Date.now() + mins * 60000).toISOString();
    let won = 0, lost = 0;
    order.forEach((id, i) => {
      const e = byId[id];
      if ((left[e.ticket_type_id] || 0) >= e.qty) { left[e.ticket_type_id] -= e.qty; ES.db.update('lottery_entries', id, { status: 'won', draw_rank: i + 1, link_token: rand(6), link_expires_at: exp }); won++;
        const em = ES.db.get('SELECT 1'); void em; }
      else { ES.db.update('lottery_entries', id, { status: 'lost', draw_rank: i + 1 }); lost++; }
    });
    ES.db.update('waves', waveId, { status: 'drawn', drawn_at: nowIso() });
    ES.db.log('lottery draw', 'waves', waveId, won + ' winners of ' + entries.length + ' entries');
    return { won, lost, entries: entries.length };
  }
  function lotteryVerify(waveId) {
    const w = ES.db.get('SELECT * FROM waves WHERE id=?', [waveId]); if (!w.draw_seed || w.status === 'scheduled' || w.status === 'open') return { ok: null, note: 'Not drawn yet' };
    const hashOk = ES.auth.sha256('seed|' + w.draw_seed) === w.draw_hash;
    const entries = ES.db.all('SELECT * FROM lottery_entries WHERE wave_id=? AND draw_rank IS NOT NULL ORDER BY draw_rank', [waveId]);
    const order = drawOrder(entries.map((e) => e.id), w.draw_seed);
    const orderOk = order.every((id, i) => entries[i] && entries[i].id === id);
    return { ok: hashOk && orderOk, hashOk, orderOk, entries: entries.length };
  }

  // ---------- transfers ----------
  function transfer(ticketId, o) {
    const t = ES.db.get('SELECT * FROM tickets WHERE id=?', [ticketId]); if (!t) throw new Error('Ticket not found');
    const ev = eventOf(t.event_id); const ctx = { eventId: ev.id, ticketTypeId: t.ticket_type_id };
    if (!ES.cfg.get('transfer.allowed', ctx)) throw new Error('Transfers are turned off for this event');
    if (ev.date && F().daysFromToday(ev.date) < ES.cfg.get('transfer.closes_days_before', ctx)) throw new Error('Transfers closed ' + ES.cfg.get('transfer.closes_days_before', ctx) + ' days before the event');
    if (t.status !== 'valid') throw new Error(t.status === 'used' ? 'This ticket has already been used' : 'This ticket cannot be transferred');
    const to = F().normPhone(o.toPhone); if (!/^0\d{8,13}$/.test(to)) throw new Error('Enter a valid mobile number for the new holder');
    if (to === t.holder_phone) throw new Error('That is already your number');
    if (!o.toName || o.toName.trim().length < 2) throw new Error('Enter the new holder\'s name');
    const cap = ES.cfg.get('tickets.per_buyer_cap', ctx);
    if (!o.free && heldBy(ev.id, to, t.ticket_type_id) + 1 > cap) throw new Error('The new holder would exceed the limit of ' + cap + ' for this ticket type');
    const fee = o.free ? 0 : ES.cfg.get('transfer.fee', ctx);
    const price = o.askPrice === undefined ? t.price : Number(o.askPrice); const capPct = ES.cfg.get('resale.cap_pct', ctx);
    if (price > t.price * capPct / 100) throw new Error('Price is above the ' + capPct + '% resale cap (face value ' + F().rp(t.price) + ')');
    const nt = mintTicket(ev, { order_id: t.order_id, ticket_type_id: t.ticket_type_id, holder_name: o.toName.trim(), holder_phone: to, price: t.price, transferred_from: t.id, generation: t.generation + 1 });
    ES.db.update('tickets', t.id, { status: 'void' });
    const id = ES.db.insert('transfers', { event_id: ev.id, ticket_id: t.id, new_ticket_id: nt.id, from_phone: t.holder_phone, from_name: t.holder_name, to_phone: to, to_name: o.toName.trim(), fee, kind: o.kind || 'transfer', created_at: nowIso() });
    if (fee) { const le = ES.ledger.transferFee({ event_id: ev.id, date: F().today(), fee, ref: t.serial, id }); ES.db.update('transfers', id, { ledger_entry_id: le }); }
    ES.db.log('ticket transfer', 'tickets', t.id, t.serial + ' → ' + to + (fee ? ' · fee ' + F().rp(fee) : ''));
    return { oldTicket: t, newTicket: nt, fee, transferId: id };
  }

  // ---------- scanning ----------
  function gateCtx(ev, dev) {
    const c = { eventId: ev.id };
    return { eventId: ev.id, rotate: ES.cfg.get('qr.rotate_seconds', c), grace: ES.cfg.get('qr.grace_windows', c), eventDayOnly: ES.cfg.get('scan.event_day_only', c), reentry: ES.cfg.get('scan.allow_reentry', c), device: dev };
  }
  /* Process one scan. opts: {eventId, gateId, device, userId, offlineAt?}. Writes a scan row and, on first valid scan, marks the ticket used. */
  function scan(token, opts) {
    const ev = eventOf(opts.eventId); const g = gateCtx(ev, opts.device);
    const at = opts.offlineAt || nowIso();
    let r;
    if (g.eventDayOnly && ev.date !== F().today() && !opts.offlineAt) r = { result: 'not_open', detail: 'Gates scan only on ' + F().date(ev.date) };
    else r = check(token, { eventId: ev.id, rotate: g.rotate, grace: g.grace, now: opts.offlineAt ? new Date(opts.offlineAt.replace(' ', 'T')).getTime() : Date.now() });
    const t = r.ticket;
    let result = r.result, detail = r.detail || '', first = null;
    if (result === 'valid') {
      // First scan wins. If the ticket was marked used meanwhile (offline sync), this one becomes a duplicate.
      if (t.status === 'used') result = 'used';
      else ES.db.update('tickets', t.id, { status: 'used', used_at: at, used_gate: opts.gateId || null, used_by: opts.userName || null, used_device: opts.device || null });
    }
    if (result === 'used') {
      first = ES.db.get("SELECT s.*, g.name gate FROM scans s LEFT JOIN gates g ON g.id=s.gate_id WHERE s.ticket_id=? AND s.result='valid' ORDER BY s.at LIMIT 1", [t.id]);
      detail = first ? 'Entered ' + F().stamp(first.at).slice(-5) + (first.gate ? ' at ' + first.gate : '') : 'Already used';
    }
    const id = ES.db.insert('scans', { event_id: ev.id, ticket_id: t ? t.id : null, serial: t ? t.serial : null, gate_id: opts.gateId || null, device: opts.device || null, user_id: opts.userId || null,
      result: result === 'used' ? 'duplicate' : result, detail, at, offline: opts.offlineAt ? 1 : 0, synced_at: nowIso() });
    return { id, result, detail, ticket: t ? ES.db.get('SELECT * FROM tickets WHERE id=?', [t.id]) : null, first };
  }
  /* Sync a device's offline queue: [{token, at, gateId}] processed in time order, so the earliest scan wins. */
  function syncOffline(queue, opts) {
    const out = { admitted: 0, duplicates: 0, rejected: 0, conflicts: [] };
    queue.slice().sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((q) => {
      const r = scan(q.token, Object.assign({}, opts, { offlineAt: q.at, gateId: q.gateId || opts.gateId }));
      if (r.result === 'valid') out.admitted++; else if (r.result === 'used') { out.duplicates++; out.conflicts.push({ serial: r.ticket && r.ticket.serial, at: q.at, detail: r.detail }); } else out.rejected++;
    });
    return out;
  }

  // ---------- dispute desk ----------
  function openDispute(o) {
    const t = ES.db.get('SELECT * FROM tickets WHERE serial=?', [o.serial]);
    const id = ES.db.insert('disputes', { event_id: o.eventId, ticket_id: t ? t.id : null, serial: o.serial, gate_id: o.gateId || null, opened_by: o.userId || null, claimant_name: o.claimantName || null, claimant_phone: F().normPhone(o.claimantPhone || ''),
      status: 'open', notes: o.notes || '', created_at: nowIso() });
    ES.db.notify('role:ticketing', 'Dispute opened at the gate', o.serial + (o.claimantName ? ' · ' + o.claimantName : ''), { link: '#/disputes' });
    return id;
  }
  // Send a one-time code to the buyer of record by text message (simulated in the Outbox as an SMS).
  function disputeOtp(id) {
    const d = ES.db.get('SELECT * FROM disputes WHERE id=?', [id]); const t = ES.db.get('SELECT * FROM tickets WHERE id=?', [d.ticket_id]);
    if (!t || !t.holder_phone) throw new Error('No buyer of record for this ticket');
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    ES.db.update('disputes', id, { otp, status: 'otp_sent' });
    ES.db.email('sms:' + t.holder_phone, t.holder_name, 'SMS to ' + F().mask(t.holder_phone), 'Event Spotlight: code ' + otp + ' confirms you are at the gate for ticket ' + t.serial + '. Share it only with the dispute desk.', 'sms');
    return { sentTo: F().mask(t.holder_phone) };
  }
  function disputeVerify(id, code) {
    const d = ES.db.get('SELECT * FROM disputes WHERE id=?', [id]);
    if (!d.otp || String(code).trim() !== d.otp) throw new Error('That code does not match'); ES.db.update('disputes', id, { status: 'verified' }); return true;
  }
  // The buyer of record is verified at the gate and the ticket has been used by someone else: admit the real buyer on a rescue ticket.
  function disputeRescue(id, o) {
    const d = ES.db.get('SELECT * FROM disputes WHERE id=?', [id]); const t = ES.db.get('SELECT * FROM tickets WHERE id=?', [d.ticket_id]);
    const ev = eventOf(d.event_id); const pool = ES.db.get("SELECT * FROM tickets WHERE event_id=? AND status='pool' AND ticket_type_id=? ORDER BY id LIMIT 1", [ev.id, o.typeId || (t && t.ticket_type_id)]);
    if (!pool) throw new Error('The rescue pool is empty for this ticket type');
    const name = o.name || d.claimant_name || (t && t.holder_name) || 'Guest', phone = F().normPhone(o.phone || d.claimant_phone || (t && t.holder_phone) || '');
    const tt = ES.db.get('SELECT * FROM ticket_types WHERE id=?', [pool.ticket_type_id]);
    const price = o.free ? 0 : tt.price; const date = F().today(); const no = ES.num.next('ORD', date);
    const oid = ES.db.insert('orders', { event_id: ev.id, no, buyer_name: name, buyer_phone: phone, verified: 1, channel: 'rescue', wave_kind: 'rescue', qty: 1, subtotal: price, admin_fee: 0, total: price, status: 'paid', payment_method: o.method || 'Cash at desk', created_at: nowIso(), paid_at: nowIso() });
    ES.db.update('tickets', pool.id, { status: 'valid', order_id: oid, holder_name: name, holder_phone: phone, price, issued_at: nowIso(), rescue: 1 });
    if (price) ES.db.update('orders', oid, { ledger_entry_id: ES.ledger.ticketSale({ event_id: ev.id, date, no, id: oid }, { subtotal: price, admin_fee: 0, total: price, payer: 'buyer' }) });
    ES.db.update('disputes', id, { status: 'resolved', resolution: 'rescue', resolved_at: nowIso(), new_ticket_id: pool.id, claimant_name: name, claimant_phone: phone });
    ES.db.log('dispute rescue', 'disputes', id, 'Rescue ticket ' + pool.serial + ' for ' + name);
    return ES.db.get('SELECT * FROM tickets WHERE id=?', [pool.id]);
  }
  function disputeReject(id, note) { ES.db.update('disputes', id, { status: 'resolved', resolution: 'rejected', resolved_at: nowIso(), notes: note || '' }); }

  ES.tix = { rand, windowOf, sig, qrToken, parseToken, check, typeStats, waveSold, waveFor, waveLeft, heldBy, mintTicket, nextSerial, buy, queueJoin, queueAdmitted, queuePosition, lotteryEnter, lotteryCommit, lotteryDraw, lotteryVerify, drawOrder, transfer, scan, syncOffline, gateCtx, openDispute, disputeOtp, disputeVerify, disputeRescue, disputeReject, eventOf };
})();
