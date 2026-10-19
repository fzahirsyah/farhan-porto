/* Event Spotlight — demo database: a fictional organiser, one concert on sale (lottery open right now) and one finished show with
   scans, disputes, booth counts and a closed ledger. All names and numbers are invented. Dates are relative to today. */
(function () {
  const ES = (window.ES = window.ES || {});
  const F = () => ES.fmt;

  function prng(seed) { let a = seed; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const FIRST = ['Adi', 'Agus', 'Ahmad', 'Aisyah', 'Andini', 'Anisa', 'Bagas', 'Bayu', 'Bella', 'Citra', 'Dewi', 'Dimas', 'Dita', 'Eko', 'Fajar', 'Farah', 'Gita', 'Hana', 'Hendra', 'Indah', 'Intan', 'Joko', 'Kevin', 'Lestari', 'Maya', 'Nadia', 'Putra', 'Putri', 'Rani', 'Reza', 'Rizky', 'Sari', 'Siti', 'Tegar', 'Tiara', 'Vina', 'Wahyu', 'Yoga', 'Yuni', 'Zahra'];
  const LAST = ['Pratama', 'Saputra', 'Wijaya', 'Lestari', 'Hidayat', 'Kusuma', 'Nugroho', 'Santoso', 'Rahayu', 'Setiawan', 'Susanto', 'Wulandari', 'Permata', 'Maulana', 'Ramadhan', 'Anggraini', 'Firmansyah', 'Gunawan', 'Halim', 'Siregar', 'Tanjung', 'Simanjuntak', 'Lubis', 'Hutapea'];
  const COMMUNITIES = ['Komunitas Gitar Jakarta', 'Jakarta Indie Collective', 'Kampus Musik UI', 'Bandung Rock Crew', 'Depok Bass Club', 'Tangerang Jam Session', 'Bekasi Folk Society', 'Anak Senja Fans', 'Fans Dewi Arka ID', 'Lantai Dansa Crew'];

  function demo(DB) {
    const R = prng(20261212); const pick = (a) => a[Math.floor(R() * a.length)]; const int = (a, b) => a + Math.floor(R() * (b - a + 1));
    const name = () => pick(FIRST) + ' ' + pick(LAST); const phone = () => '08' + pick(['11', '12', '13', '17', '19', '21', '22', '31', '52', '56', '77', '81', '82', '85', '87', '95', '96']) + String(int(1000000, 9999999));
    const today = F().today(), nowTs = Date.now();
    const ts = (daysAgo, h, m) => F().addDays(today, -daysAgo) + ' ' + String(h).padStart(2, '0') + ':' + String(m === undefined ? int(0, 59) : m).padStart(2, '0') + ':' + String(int(0, 59)).padStart(2, '0');
    ES.seed.base(DB);

    // ----- organisation, staff -----
    DB.run('INSERT INTO org(id,name,legal_name,npwp,address,city,phone,email,bank_name,bank_acc,bank_holder,signatory,signatory_title) VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?)',
      ['Lentera Live', 'PT Lentera Live Produksi', '01.234.567.8-012.000', 'Jl. Tebet Barat Dalam IV No. 12', 'Jakarta', '+62 21 555 0142', 'hello@lenteralive.example', 'Bank Nusantara', '123-456-7890', 'PT Lentera Live Produksi', 'Rina Wulandari', 'Director']);
    const pin = (p) => ES.auth.hashPin(p); const mk = (n, short, role, title, p, color, extra) => DB.insert('users', Object.assign({ name: n, short, role, title, email: short.toLowerCase() + '@lenteralive.example', phone: phone(), pin_hash: pin(p), color, created_at: F().nowStamp() }, extra || {}));
    const U = {};
    U.rina = mk('Rina Wulandari', 'Rina', 'owner', 'Owner and director', '1234', '#2F5BEA');
    U.hendra = mk('Hendra Saputra', 'Hendra', 'director', 'Director of operations', '2345', '#0B8A5F');
    U.siti = mk('Siti Marlina', 'Siti', 'finance', 'Finance manager', '4444', '#C8283D');
    U.bagas = mk('Bagas Wirawan', 'Bagas', 'producer', 'Producer', '3333', '#7A4FD0');
    U.maya = mk('Maya Kartika', 'Maya', 'ticketing', 'Ticketing lead', '5555', '#D07A1F');
    U.andre = mk('Andre Lim', 'Andre', 'partnerships', 'Partnerships lead', '6666', '#1F8FD0');
    const gates = {};
    U.joko = mk('Joko Prasetyo', 'Joko', 'crew', 'Gate A lead', '7777', '#101B33'); U.putri = mk('Putri Anggraini', 'Putri', 'crew', 'Gate B lead', '8888', '#4A5573');
    U.wayan = mk('Wayan Sudarta', 'Wayan', 'crew', 'Safety and medical PIC', '9999', '#C8283D'); U.dewi = mk('Dewi Lestari', 'Dewi', 'crew', 'Stage manager', '1111', '#0B8A5F');
    U.rudi = mk('Rudi Hartono', 'Rudi', 'crew', 'Sponsor booth PIC', '2222', '#D07A1F'); void gates;

    // ----- tenants (platform admin view) -----
    [['Lentera Live', 'Rina Wulandari', 'hello@lenteralive.example', F().addDays(today, -200), F().addDays(today, 165), 'active', 2, 3180, 1], ['Cakra Live', 'Bimo Adityo', 'bimo@cakralive.example', F().addDays(today, -330), F().addDays(today, 34), 'active', 4, 11200, 0],
      ['Soundwave ID', 'Tasya Putri', 'tasya@soundwave.example', F().addDays(today, -120), F().addDays(today, 245), 'active', 1, 2400, 0], ['Mega Event Indonesia', 'Rahmat Hidayat', 'rahmat@megaevent.example', F().addDays(today, -380), F().addDays(today, -14), 'overdue', 3, 8900, 0],
      ['Kopi dan Konser Co', 'Laras Ayu', 'laras@kopikonser.example', F().addDays(today, -40), F().addDays(today, 325), 'active', 1, 640, 0]]
      .forEach(([n, c, e, st, rn, status, ev, tk, cur]) => DB.insert('tenants', { name: n, contact: c, email: e, plan: 'Annual', plan_fee: 5000000, started: st, renews: rn, status, events: ev, tickets: tk, is_current: cur }));
    DB.insert('support_requests', { tenant_id: 2, reason: 'Help setting up the lottery for our August festival', requested_by: 'Bimo Adityo', created_at: ts(1, 14, 5) });

    // ----- vendors -----
    const V = {};
    [['Sonic Hall Audio', 'Production', 'Hadi Wibowo', 'sales@sonichall.example', 'PPN+PPh23'], ['Lumen Lighting', 'Production', 'Yoga Prakoso', 'bid@lumen.example', 'PPN+PPh23'], ['Panggung Mega Stage', 'Production', 'Roni S.', 'roni@megastage.example', 'PPN'],
      ['Safe Gate Security', 'Security', 'Komang Arta', 'ops@safegate.example', 'PPN+PPh23'], ['Medika Siaga', 'Security', 'dr. Lina', 'lina@medikasiaga.example', 'PPh23'], ['Radio Jaya Jakarta', 'Marketing', 'Tia', 'ads@radiojaya.example', 'PPN'],
      ['Reklame Prima', 'Marketing', 'Doni', 'doni@reklameprima.example', 'PPN'], ['Arena Senayan Management', 'Venue', 'Ibu Sari', 'booking@arena.example', 'PPN'], ['Gizi Boga Catering', 'Logistics', 'Chef Anton', 'order@gizi.example', 'none'],
      ['Tiket Print Indonesia', 'Logistics', 'Eko', 'eko@tiketprint.example', 'PPN'], ['Wristband Pro', 'Logistics', 'Lisa', 'lisa@wristband.example', 'PPN']]
      .forEach(([n, cat, c, e, tax]) => (V[n] = DB.insert('vendors', { name: n, category: cat, contact: c, email: e, phone: phone(), npwp: '0' + int(1, 9) + '.' + int(100, 999) + '.' + int(100, 999) + '.' + int(1, 9) + '-' + int(100, 999) + '.000', bank: 'Bank Nusantara ' + int(1000000, 9999999), status: 'active' })));
    const VTAX = { 'Sonic Hall Audio': 'PPN+PPh23', 'Lumen Lighting': 'PPN+PPh23', 'Panggung Mega Stage': 'PPN', 'Safe Gate Security': 'PPN+PPh23', 'Medika Siaga': 'PPh23', 'Radio Jaya Jakarta': 'PPN', 'Reklame Prima': 'PPN', 'Arena Senayan Management': 'PPN', 'Gizi Boga Catering': 'none', 'Tiket Print Indonesia': 'PPN', 'Wristband Pro': 'PPN' };

    // =============== FINISHED SHOW: Lentera Acoustic Night ===============
    const pastDate = F().addDays(today, -62);
    const pProj = DB.insert('projects', { name: 'Lentera Acoustic Night 2026', status: 'closed', budget_ceiling: 420000000, notes: 'Pilot show in Tebet.', created_at: ts(160, 10, 0) });
    const pEv = DB.insert('events', { project_id: pProj, name: 'Lentera Acoustic Night', type: 'Concert', date: pastDate, doors: '17:00', start_time: '18:00', end_time: '22:30', venue: 'Taman Tebet Amphitheatre', address: 'Jl. Tebet Raya', city: 'Jakarta', capacity: 1200, status: 'closed', qr_secret: ES.tix.rand(8), description: 'Acoustic evening with three artists.', created_at: ts(160, 10, 0) });
    const pTypes = [DB.insert('ticket_types', { event_id: pEv, name: 'General', price: 175000, quota: 1000, tier: 'general', color: '#2F5BEA', sort: 0 }), DB.insert('ticket_types', { event_id: pEv, name: 'VIP', price: 400000, quota: 200, tier: 'vip', color: '#FFC93C', sort: 1 })];
    ES.seed.concertTemplate(DB, { eventId: pEv, ceiling: 420000000, staffByRole: { producer: U.bagas, ticketing: U.maya, finance: U.siti, partnerships: U.andre } });
    DB.run("UPDATE waves SET status='closed' WHERE event_id=? AND kind<>'held'", [pEv]); DB.run("UPDATE milestones SET pct=100,status='done' WHERE event_id=?", [pEv]);
    DB.run("UPDATE checklist_items SET done=1,done_by='Crew',done_at=? WHERE checklist_id IN (SELECT id FROM checklists WHERE event_id=?)", [pastDate + ' 16:00:00', pEv]);
    const pGates = DB.all('SELECT id FROM gates WHERE event_id=? ORDER BY id', [pEv]).map((g) => g.id);
    const pPromo = DB.insert('promotors', { event_id: pEv, name: 'Kampus Musik UI', kind: 'community', code: 'KMUI', commission: 8000, quota: 200, contact: 'Arya', phone: phone() });
    const evRow = DB.get('SELECT * FROM events WHERE id=?', [pEv]);
    const pTickets = []; let sold = 0;
    const seedOrder = (ev, o) => {
      const date = o.date, no = ES.num.next('ORD', date);
      const sub = o.qty * o.price; const oid = DB.insert('orders', { event_id: ev.id, no, buyer_name: o.name, buyer_phone: o.phone, buyer_email: o.email || null, verified: 1, channel: o.channel || 'direct', wave_kind: o.wave, promotor_id: o.promotor || null, qty: o.qty,
        subtotal: sub, admin_fee: 0, total: sub, status: 'paid', payment_method: pick(['QRIS', 'Virtual account', 'Card', 'QRIS']), created_at: o.at, paid_at: o.at });
      const tk = []; for (let i = 0; i < o.qty; i++) tk.push(ES.tix.mintTicket(ev, { order_id: oid, ticket_type_id: o.typeId, holder_name: o.name, holder_phone: o.phone, price: o.price, issued_at: o.at }));
      DB.update('orders', oid, { ledger_entry_id: ES.ledger.ticketSale({ event_id: ev.id, date, no, id: oid }, { subtotal: sub, admin_fee: 0, total: sub, payer: 'eo' }) }); return { oid, tk };
    };
    for (let i = 0; i < 430 && sold < 1010; i++) {
      const vip = R() < 0.15; const qty = int(1, 4); const day = int(60, 150);
      const r = seedOrder(evRow, { date: F().addDays(today, -day), at: ts(day, int(8, 22)), name: name(), phone: phone(), qty, typeId: pTypes[vip ? 1 : 0], price: vip ? 400000 : 175000, wave: pick(['community', 'lottery', 'open', 'open']), promotor: R() < 0.12 ? pPromo : null });
      pTickets.push(...r.tk); sold += qty;
    }
    // scans: most tickets enter, with duplicates, screenshots, and a few disputes
    const pOpen = pastDate + ' 17:00:00';
    pTickets.slice().sort(() => R() - 0.5).slice(0, Math.round(pTickets.length * 0.93)).forEach((t, i) => {
      const min = int(0, 150), h = 17 + Math.floor(min / 60), m = min % 60; const at = pastDate + ' ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(int(0, 59)).padStart(2, '0'); const g = pGates[i % 3 === 2 ? 2 : (i % 2)];
      DB.update('tickets', t.id, { status: 'used', used_at: at, used_gate: g, used_by: 'Crew', used_device: 'PH-' + (1 + (i % 4)) });
      DB.insert('scans', { event_id: pEv, ticket_id: t.id, serial: t.serial, gate_id: g, device: 'PH-' + (1 + (i % 4)), user_id: U.joko, result: 'valid', at, offline: R() < 0.04 ? 1 : 0, synced_at: at });
    });
    const usedP = DB.all("SELECT * FROM tickets WHERE event_id=? AND status='used' LIMIT 40", [pEv]);
    usedP.slice(0, 14).forEach((t, i) => DB.insert('scans', { event_id: pEv, ticket_id: t.id, serial: t.serial, gate_id: pGates[i % 2], device: 'PH-2', user_id: U.putri, result: 'duplicate', detail: 'Entered earlier', at: pastDate + ' 18:' + String(10 + i).padStart(2, '0') + ':10' }));
    usedP.slice(14, 36).forEach((t, i) => DB.insert('scans', { event_id: pEv, ticket_id: t.id, serial: t.serial, gate_id: pGates[i % 2], device: 'PH-1', user_id: U.joko, result: 'expired', detail: 'Likely a screenshot', at: pastDate + ' 18:' + String(5 + i).padStart(2, '0') + ':40' }));
    [['Rafi Maulana', 'Bought from a stranger on social media', 'rescue'], ['Salsa Putri', 'Friend sent a photo of the ticket', 'rescue'], ['Dodi Hartanto', 'Ticket scanned by someone else', 'rescue'], ['Mita Anggraini', 'Wrong gate, resolved on site', 'transferred'], ['Yusuf Rahman', 'Could not verify', 'rejected'], ['Lia Susanti', 'Bought from reseller account', 'rescue']].forEach(([n, note, res], i) => {
      const t = usedP[36 - i - 1]; DB.insert('disputes', { event_id: pEv, ticket_id: t.id, serial: t.serial, gate_id: pGates[0], opened_by: U.joko, claimant_name: n, claimant_phone: phone(), status: 'resolved', otp: '000000', notes: note, created_at: pastDate + ' 18:' + (20 + i * 3) + ':00', resolved_at: pastDate + ' 18:' + (28 + i * 3) + ':00', resolution: res });
    });
    // sponsors for the finished show, signed and paid, with booth head-counts
    const pPk = DB.all('SELECT * FROM sponsor_packages WHERE event_id=? ORDER BY sort', [pEv]);
    const pDeals = [];
    [['Kopi Senja', 'Gold', 'Food and drink'], ['Telko One', 'Silver', 'Telecom'], ['Gadget Hub', 'Silver', 'Retail']].forEach(([co, pk, cat]) => {
      const pack = pPk.find((p) => p.name === pk); const val = Math.round(pack.price * 0.4);
      const d = DB.insert('sponsor_deals', { event_id: pEv, company: co, contact_name: name(), contact_email: 'partner@' + co.toLowerCase().replace(/\W/g, '') + '.example', package_id: pack.id, value: val, stage: 'signed', owner_id: U.andre, booth_code: 'B0' + (pDeals.length + 1), created_at: ts(150, 10), signed_at: ts(110, 11), category: cat }); pDeals.push(d);
      const deal = DB.get('SELECT * FROM sponsor_deals WHERE id=?', [d]); const q = ES.biz.quotationFor(deal, { issue_date: F().addDays(today, -120) }); const c = ES.biz.contractFrom(q); const inv = ES.biz.invoiceFrom(c, { due_date: F().addDays(today, -100) });
      DB.update('documents', inv.id, { issue_date: F().addDays(today, -110) });
      ES.biz.recordPayment(inv.id, { amount: inv.total, date: F().addDays(today, -105), method: 'Bank transfer', reference: 'TRF' + int(10000, 99999) });
      const dev = DB.insert('booth_devices', { event_id: pEv, deal_id: d, name: co + ' booth camera', line_y: 0.55, sensitivity: 55, calibrated: 1, calib_ai: 96, calib_hand: 100, status: 'live', last_seen: pastDate + ' 22:00:00' });
      const base = { 'Kopi Senja': 38, 'Telko One': 22, 'Gadget Hub': 27 }[co];
      for (let h = 17; h <= 21; h++) DB.insert('booth_counts', { event_id: pEv, deal_id: d, device_id: dev, ts: pastDate + ' ' + h + ':59:00', hour: String(h).padStart(2, '0') + ':00', in_count: Math.round(base * (h === 19 || h === 20 ? 2.4 : h === 18 ? 1.6 : 1) * (0.85 + R() * 0.3)), out_count: 0, source: 'ai' });
    });
    // vendor spend, all paid
    [['Sonic Hall Audio', 'Production', 'Sound system and engineer', 38000000], ['Lumen Lighting', 'Production', 'Lighting package', 22000000], ['Safe Gate Security', 'Security', 'Security team (24 people)', 18000000], ['Medika Siaga', 'Security', 'Medical team', 6500000],
      ['Arena Senayan Management', 'Venue', 'Amphitheatre rental', 30000000], ['Radio Jaya Jakarta', 'Marketing', 'Radio spots', 12000000], ['Gizi Boga Catering', 'Logistics', 'Crew and artist catering', 8200000]].forEach(([vn, cat, desc, amt]) => {
      const line = DB.get('SELECT id FROM budget_lines WHERE event_id=? AND category=?', [pEv, cat]);
      const po = ES.biz.createPO({ eventId: pEv, vendor_id: V[vn], category: cat, description: desc, amount: amt, tax_code: VTAX[vn], budget_line_id: line.id, status: 'ordered', due_date: pastDate });
      DB.update('purchase_orders', po.id, { delivered_at: pastDate + ' 12:00:00', delivered_by: 'Bagas Wirawan' });
      ES.biz.recordVendorInvoice(po.id, { no: 'INV-' + int(1000, 9999), amount: amt, date: F().addDays(pastDate, 1) }); ES.biz.approvePayment(po.id, { date: F().addDays(pastDate, 5) });
    });
    [[1, 'Parking congestion at the north gate', 'normal'], [2, 'Guest fainted near the pit, medic attended', 'high'], [3, 'Power dip at the food court, restored in 4 minutes', 'normal']].forEach(([i, d, sev]) => DB.insert('incidents', { event_id: pEv, kind: i === 2 ? 'Medical' : i === 3 ? 'Technical' : 'Crowd', severity: sev, location: 'Venue', description: d, reported_by: 'Wayan Sudarta', status: 'resolved', at: pastDate + ' 19:' + (10 + i * 7) + ':00', resolved_at: pastDate + ' 19:' + (30 + i * 7) + ':00', resolution: 'Resolved on site' }));
    ES.biz.recogniseRevenue(pEv); try { ES.biz.settleCommission(pPromo); } catch (e) { /* nothing to settle */ }
    DB.run("UPDATE events SET status='closed' WHERE id=?", [pEv]);

    // =============== MAIN EVENT: Nusantara Sound Fest ===============
    const evDate = F().addDays(today, 58);
    const proj = DB.insert('projects', { name: 'Nusantara Sound Fest 2026', status: 'active', budget_ceiling: 2100000000, notes: 'Flagship outdoor concert. 10,000 capacity.', created_at: ts(120, 9, 30) });
    const evId = DB.insert('events', { project_id: proj, name: 'Nusantara Sound Fest', type: 'Concert', date: evDate, doors: '15:00', start_time: '16:00', end_time: '22:30', venue: 'Lapangan Merdeka Arena', address: 'Jl. Medan Merdeka Selatan', city: 'Jakarta', capacity: 10000, tz: 'WIB', status: 'on_sale',
      qr_secret: ES.tix.rand(8), description: 'One-day outdoor concert with nine artists across the main stage.', created_at: ts(120, 9, 30) });
    const T = {
      fest: DB.insert('ticket_types', { event_id: evId, name: 'Festival', price: 350000, quota: 7800, tier: 'general', color: '#2F5BEA', perks: 'General standing area', sort: 0 }),
      vip: DB.insert('ticket_types', { event_id: evId, name: 'VIP', price: 850000, quota: 1700, tier: 'vip', color: '#FFC93C', perks: 'Raised deck, lounge, fast lane', sort: 1 }),
      pit: DB.insert('ticket_types', { event_id: evId, name: 'Pit Experience', price: 1500000, quota: 500, tier: 'premium', color: '#C8283D', perks: 'Front pit, merchandise pack, meet and greet draw', requires_id: 1, sort: 2 })
    };
    ES.seed.concertTemplate(DB, { eventId: evId, ceiling: 2100000000, staffByRole: { producer: U.bagas, ticketing: U.maya, finance: U.siti, partnerships: U.andre }, picByArea: { Gate: U.joko, Stage: U.dewi, Sponsors: U.rudi, Vendors: U.bagas, Safety: U.wayan, Ticketing: U.maya, Reports: U.siti } });
    const evR = DB.get('SELECT * FROM events WHERE id=?', [evId]);
    const gateIds = DB.all('SELECT id FROM gates WHERE event_id=? ORDER BY id', [evId]).map((g) => g.id);
    DB.update('users', U.joko, { gate_id: gateIds[0] }); DB.update('users', U.putri, { gate_id: gateIds[1] });
    // wave states
    const w = {}; DB.all('SELECT * FROM waves WHERE event_id=?', [evId]).forEach((x) => (w[x.kind] = x));
    DB.update('waves', w.community.id, { status: 'closed' });
    const nowD = new Date(nowTs); const fmtT = (d) => F().iso(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':00';
    DB.update('waves', w.lottery.id, { status: 'open', opens_at: fmtT(new Date(nowTs - 18 * 3600e3)), closes_at: fmtT(new Date(nowTs + 30 * 3600e3)) });
    DB.update('waves', w.open.id, { opens_at: F().addDays(today, 13) + ' 10:00:00', closes_at: F().addDays(today, 28) + ' 10:00:00' });
    DB.run("UPDATE milestones SET pct=100,status='done' WHERE event_id=? AND ends < ?", [evId, today]);
    DB.run("UPDATE milestones SET pct=60,status='open' WHERE event_id=? AND starts <= ? AND ends >= ?", [evId, today, today]);
    DB.run("UPDATE milestones SET pct=100,status='done' WHERE event_id=? AND name LIKE 'Lottery entries%'", [evId]); DB.run("UPDATE milestones SET pct=50 WHERE event_id=? AND name LIKE 'Lottery entries%'", [evId]); DB.run("UPDATE milestones SET status='open' WHERE event_id=? AND name LIKE 'Lottery entries%'", [evId]);
    // promotors and community codes
    const PR = {};
    [['Radio Jaya Jakarta', 'promotor', 'RADIOJ', 12000, 1500], ['Campus Ambassadors', 'promotor', 'CAMPUS', 10000, 900], ['Tiket Sahabat', 'reseller', 'SAHABAT', 15000, 600], ['Lentera Street Team', 'reseller', 'STREET', 15000, 400]].forEach(([n, k, c, com, q]) => (PR[n] = DB.insert('promotors', { event_id: evId, name: n, kind: k, code: c, commission: com, quota: q, contact: name(), phone: phone() })));
    const commIds = COMMUNITIES.map((c, i) => DB.insert('promotors', { event_id: evId, name: c, kind: 'community', code: 'COM' + (i + 1), commission: 8000, quota: 250, contact: name(), phone: phone() }));
    // community presale orders (wave closed): 1,860 tickets
    const targets = { [T.fest]: 1480, [T.vip]: 300, [T.pit]: 80 }; const price = { [T.fest]: 350000, [T.vip]: 850000, [T.pit]: 1500000 }; const sums = { [T.fest]: 0, [T.vip]: 0, [T.pit]: 0 };
    const dayShape = [150, 200, 240, 230, 210, 310, 280, 260, 230, 200]; const dsum = dayShape.reduce((a, b) => a + b, 0);
    let codeN = 0; const buyers = [];
    Object.keys(targets).forEach((tid) => {
      tid = Number(tid);
      while (sums[tid] < targets[tid]) {
        const qty = Math.min(targets[tid] - sums[tid], tid === T.pit ? int(1, 2) : int(1, 4)); let r = R() * dsum, di = 0; while (r > dayShape[di]) { r -= dayShape[di]; di++; }
        const date = F().addDays(F().addDays(evDate, -75), di); const ph = phone(); const nm = name(); const comm = pick(commIds); const code = 'S' + String(++codeN).padStart(4, '0') + '-' + pick(['JKT', 'BDG', 'DPK', 'TNG']);
        const at = date + ' ' + String(int(8, 22)).padStart(2, '0') + ':' + String(int(0, 59)).padStart(2, '0') + ':' + String(int(0, 59)).padStart(2, '0');
        const rr = seedOrder(evR, { date, at, name: nm, phone: ph, email: nm.split(' ')[0].toLowerCase() + int(1, 99) + '@mail.example', qty, typeId: tid, price: price[tid], wave: 'community', promotor: comm });
        DB.insert('community_codes', { event_id: evId, code, community: DB.val('SELECT name FROM promotors WHERE id=?', [comm]), ticket_type_id: tid, max_qty: tid === T.pit ? 2 : 4, bound_phone: ph, used: 1, used_at: at, order_id: rr.oid });
        sums[tid] += qty; buyers.push(ph);
      }
    });
    ['SENJA-2410', 'GITAR-001', 'INDIE-777', 'DEPOK-BASS'].forEach((c, i) => DB.insert('community_codes', { event_id: evId, code: c, community: COMMUNITIES[i], ticket_type_id: T.fest, max_qty: 4 })); // unused, for the demo
    // a handful of transfers
    const some = DB.all("SELECT * FROM tickets WHERE event_id=? AND status='valid' AND ticket_type_id=? ORDER BY id LIMIT 12", [evId, T.fest]);
    some.slice(0, 7).forEach((t, i) => { const nt = ES.tix.mintTicket(evR, { order_id: t.order_id, ticket_type_id: t.ticket_type_id, holder_name: name(), holder_phone: phone(), price: t.price, transferred_from: t.id, generation: 2 });
      DB.update('tickets', t.id, { status: 'void' }); const tid = DB.insert('transfers', { event_id: evId, ticket_id: t.id, new_ticket_id: nt.id, from_phone: t.holder_phone, from_name: t.holder_name, to_phone: nt.holder_phone, to_name: nt.holder_name, fee: 5000, kind: 'transfer', created_at: ts(int(1, 6), int(9, 21)) });
      DB.update('transfers', tid, { ledger_entry_id: ES.ledger.transferFee({ event_id: evId, date: today, fee: 5000, ref: t.serial, id: tid }) }); void i; });
    // rescue pool (1.5% of capacity = 150): held back, status 'pool'
    [[T.fest, 100], [T.vip, 35], [T.pit, 15]].forEach(([tid, n]) => { for (let i = 0; i < n; i++) ES.tix.mintTicket(evR, { ticket_type_id: tid, status: 'pool', rescue: 1, price: price[tid] }); });
    // lottery entries: 8,420 (oversubscribed against 5,500 seats)
    const mix = [[T.fest, 5900, 4], [T.vip, 1950, 3], [T.pit, 570, 2]]; const seenPhone = new Set();
    mix.forEach(([tid, n, maxq]) => { for (let i = 0; i < n; i++) { let ph = phone(); while (seenPhone.has(ph)) ph = phone(); seenPhone.add(ph);
      DB.insert('lottery_entries', { event_id: evId, wave_id: w.lottery.id, phone: ph, name: name(), qty: int(1, maxq), ticket_type_id: tid, created_at: fmtT(new Date(nowTs - int(1, 18 * 60) * 60e3)) }); } });
    // sponsors
    const PK = DB.all('SELECT * FROM sponsor_packages WHERE event_id=? ORDER BY sort', [evId]); const pk = (n) => PK.find((p) => p.name === n);
    const deals = {};
    [['Bank Nusa', 'Platinum', 'Banking', 'signed'], ['Gadget Hub', 'Gold', 'Retail', 'signed'], ['Aqua Segar', 'Silver', 'Beverage', 'signed'], ['Telko One', 'Platinum', 'Telecom', 'negotiating'], ['Kopi Senja', 'Gold', 'Food and drink', 'proposal'],
      ['Teh Pelita', 'Silver', 'Beverage', 'lead'], ['Motor Maju', 'Gold', 'Automotive', 'lead'], ['Sehat Farma', 'Booth only', 'Health', 'lead'], ['Rasa Nusantara', 'Booth only', 'Food and drink', 'proposal'], ['Ruang Kerja Co', 'Silver', 'Workspace', 'negotiating']]
      .forEach(([co, p, cat, stage], i) => {
        const pack = pk(p); deals[co] = DB.insert('sponsor_deals', { event_id: evId, company: co, contact_name: name(), contact_email: 'partner@' + co.toLowerCase().replace(/\W/g, '') + '.example', contact_phone: phone(), package_id: pack.id, value: pack.price, stage, owner_id: U.andre, category: cat, created_at: ts(100 - i * 6, 10),
          next_step: stage === 'lead' ? 'Intro call' : stage === 'proposal' ? 'Follow up on proposal' : stage === 'negotiating' ? 'Agree payment terms' : null, next_step_date: stage === 'signed' ? null : F().addDays(today, int(1, 9)) });
      });
    ['Bank Nusa', 'Gadget Hub', 'Aqua Segar'].forEach((co, i) => {
      const deal = DB.get('SELECT * FROM sponsor_deals WHERE id=?', [deals[co]]); const q = ES.biz.quotationFor(deal, { issue_date: F().addDays(today, -40 + i * 3) }); const c = ES.biz.contractFrom(q); const inv = ES.biz.invoiceFrom(c);
      DB.update('documents', inv.id, { issue_date: F().addDays(today, -35 + i * 3), due_date: F().addDays(today, -21 + i * 3) });
      if (i === 0) ES.biz.recordPayment(inv.id, { amount: Math.round(inv.total / 2), date: F().addDays(today, -20), method: 'Bank transfer', reference: 'TRF77123' });
      if (i === 1) ES.biz.recordPayment(inv.id, { amount: inv.total, date: F().addDays(today, -12), method: 'Bank transfer', reference: 'TRF77455' });
      DB.insert('booth_devices', { event_id: evId, deal_id: deals[co], name: co + ' booth camera', status: 'setup' });
    });
    // proposals
    const facts = ES.biz.eventFacts(evId);
    const p1 = ES.biz.createProposal({ eventId: evId, type: 'sponsor', title: 'Gold sponsorship for Kopi Senja', recipient: 'Kopi Senja', recipient_ref: deals['Kopi Senja'], data: { packageId: pk('Gold').id, price: pk('Gold').price, sections: { cover: 1, audience: 1, package: 1, booth: 1, numbers: 1, terms: 1 } } });
    ES.biz.sendProposal(p1.id, 'partner@kopisenja.example'); DB.update('proposals', p1.id, { status: 'viewed', views: 3, last_viewed: ts(1, 11, 20) });
    ES.biz.createProposal({ eventId: evId, type: 'rac', title: 'Investor RAC: Nusantara Sound Fest', recipient: 'Prima Capital', data: { assumptions: { sell: { low: 70, base: 85, high: 95 }, sponsorShare: { low: 0, base: 50, high: 100 }, investment: 400000000, profitShare: 20 }, sections: { summary: 1, budget: 1, scenarios: 1, risks: 1 } } });
    ES.biz.createProposal({ eventId: evId, type: 'rfq', title: 'RFQ: Main stage and rigging', recipient: 'Panggung Mega Stage', data: { category: 'Production', scope: 'Main stage 18 x 12 m, roof, rigging for line array and lighting, 2 FOH platforms.', deadline: F().addDays(today, 10) } });
    ES.biz.createProposal({ eventId: evId, type: 'promotor', title: 'Promotor agreement: Radio Jaya Jakarta', recipient: 'Radio Jaya Jakarta', recipient_ref: PR['Radio Jaya Jakarta'], data: { commission: 12000, quota: 1500 } });
    void facts;
    // artists and special requests
    const A = {};
    [['Dewi Arka', 'headliner', 450000000, 'confirmed', '20:00', 90], ['The Lanterns', 'support', 180000000, 'confirmed', '18:35', 60], ['Marlo', 'support', 95000000, 'confirmed', '17:15', 45], ['Senja di Kota', 'support', 60000000, 'contracted', '16:00', 45], ['Rintik Hujan', 'support', 45000000, 'negotiating', null, 40]].forEach(([n, role, fee, st, t, m]) =>
      (A[n] = DB.insert('artists', { event_id: evId, name: n, role, fee, status: st, contact: name(), email: n.toLowerCase().replace(/\W/g, '') + '@mgmt.example', phone: phone(), set_time: t, set_minutes: m })));
    [['Dewi Arka', 'Hotel', 'Two extra hotel rooms for the band', 2, 9600000, 'costed'], ['Dewi Arka', 'Hospitality', 'Private green room with sofa and tea service', 1, 4500000, 'requested'], ['Dewi Arka', 'Transport', 'Airport pickup for 8 people', 1, 3200000, 'approved'],
      ['The Lanterns', 'Backline', 'Two guitar amplifiers and a drum kit', 1, 6500000, 'costed'], ['The Lanterns', 'Food', 'Vegetarian catering for 6', 1, 1800000, 'confirmed'], ['Marlo', 'Hospitality', 'Private green room', 1, 3000000, 'approved'], ['Marlo', 'Technical', 'Extra monitor wedges (4)', 1, 0, 'requested']]
      .forEach(([n, cat, req, q, cost, st]) => { const rid = ES.biz.addArtistRequest(A[n], { category: cat, request: req, qty: q, est_cost: st === 'requested' ? 0 : cost, by: 'Artist team' });
        if (st === 'approved' || st === 'confirmed') { DB.update('artist_requests', rid, { status: 'costed', est_cost: cost }); ES.biz.decideArtistRequest(rid, true, 'OK'); if (st === 'confirmed') ES.biz.confirmArtistRequest(rid); } });
    // artist fees as orders (deposit paid for headliner)
    const fl = DB.get("SELECT id FROM budget_lines WHERE event_id=? AND category='Artists'", [evId]);
    ['Dewi Arka', 'The Lanterns', 'Marlo', 'Senja di Kota'].forEach((n) => { const a = DB.get('SELECT * FROM artists WHERE id=?', [A[n]]); const po = ES.biz.createPO({ eventId: evId, category: 'Artists', description: 'Artist fee: ' + n, amount: a.fee, tax_code: 'PPh23', budget_line_id: fl.id, status: 'ordered', source: 'artist_fee', source_id: a.id }); DB.update('artists', a.id, { fee_po_id: po.id }); });
    // vendor purchase orders in every state
    const bl = (cat) => DB.get('SELECT id FROM budget_lines WHERE event_id=? AND category=?', [evId, cat]).id;
    const po = (vn, cat, desc, amt, st, pic, extra) => { const p = ES.biz.createPO({ eventId: evId, vendor_id: V[vn], category: cat, description: desc, amount: amt, tax_code: VTAX[vn], budget_line_id: bl(cat), status: st === 'draft' ? 'draft' : 'ordered', pic_id: pic, due_date: F().addDays(evDate, -(extra && extra.dueBefore || 5)) }); return p; };
    const p1o = po('Arena Senayan Management', 'Venue', 'Venue rental and permits (3 days)', 210000000, 'ordered', U.bagas); DB.update('purchase_orders', p1o.id, { delivered_at: ts(10, 10), delivered_by: 'Bagas Wirawan' }); ES.biz.recordVendorInvoice(p1o.id, { no: 'AS-2210', amount: 210000000, date: F().addDays(today, -9) }); ES.biz.approvePayment(p1o.id, { date: F().addDays(today, -7) });
    const p2o = po('Sonic Hall Audio', 'Production', 'Main PA, monitors and engineers', 185000000, 'ordered', U.dewi); DB.update('purchase_orders', p2o.id, { delivered_at: ts(1, 15), delivered_by: 'Dewi Lestari · site test passed' }); ES.biz.recordVendorInvoice(p2o.id, { no: 'SH-0441', amount: 185000000, date: F().addDays(today, -1) });
    const p3o = po('Lumen Lighting', 'Production', 'Lighting rig and operators', 120000000, 'ordered', U.dewi); ES.biz.recordVendorInvoice(p3o.id, { no: 'LL-882', amount: 120000000, date: F().addDays(today, -2) }); // not delivered: mismatch
    const p4o = po('Safe Gate Security', 'Security', 'Security team (140 people)', 96000000, 'ordered', U.joko); DB.update('purchase_orders', p4o.id, { delivered_at: ts(2, 9), delivered_by: 'Joko Prasetyo' }); ES.biz.recordVendorInvoice(p4o.id, { no: 'SG-1190', amount: 99500000, date: F().addDays(today, -2) }); // amount differs
    po('Panggung Mega Stage', 'Production', 'Main stage 18 x 12 m with roof', 240000000, 'ordered', U.bagas); po('Medika Siaga', 'Security', 'Medical posts and ambulance', 38000000, 'draft', U.wayan); po('Wristband Pro', 'Logistics', 'Wristbands (11,000) and lanyards', 22000000, 'ordered', U.joko);
    po('Gizi Boga Catering', 'Logistics', 'Crew and artist catering', 64000000, 'draft', U.bagas); const p5o = po('Tiket Print Indonesia', 'Logistics', 'Printed signage and gate banners', 18000000, 'ordered', U.joko); DB.update('purchase_orders', p5o.id, { delivered_at: ts(3, 14), delivered_by: 'Joko Prasetyo' });
    // media placements
    [['Radio Jaya Jakarta', 'Radio spots, 6 weeks', 'media', 45000000, 1500, 'booked', 'Radio Jaya Jakarta'], ['Billboard Sudirman', 'Billboard', 'media', 90000000, 1000, 'planned', 'Reklame Prima'], ['Instagram and TikTok ads', 'Social', 'media', 60000000, 2400, 'running', 'In-house'], ['Campus roadshow', 'Campus', 'promotor', 18000000, 900, 'planned', 'Campus Ambassadors'], ['Commuter line posters', 'Print', 'media', 28000000, 600, 'planned', 'Reklame Prima']]
      .forEach(([ch, desc, kind, cost, ex, st, vn]) => DB.insert('media_placements', { event_id: evId, channel: ch, kind, vendor: vn, starts: F().addDays(today, 5), ends: F().addDays(evDate, -2), cost, expected_tickets: ex, status: st, notes: desc }));
    // checklists in progress
    DB.all('SELECT * FROM checklists WHERE event_id=?', [evId]).forEach((c) => { if (c.area === 'Ticketing' || c.area === 'Vendors') DB.run('UPDATE checklist_items SET done=1,done_by=?,done_at=? WHERE checklist_id=? AND sort<2', ['Maya Kartika', ts(1, 10), c.id]); });
    // approvals queue
    ES.session = { id: U.maya, name: 'Maya Kartika' };
    ES.biz.requestApproval({ eventId: evId, kind: 'data_export', title: 'Export attendee list for the security briefing', detail: 'Names and phone numbers of 1,860 ticket holders', payload: { scope: 'attendees' } });
    ES.session = { id: U.andre, name: 'Andre Lim' };
    ES.biz.requestApproval({ eventId: evId, kind: 'proposal_send', title: 'Send investor RAC proposal to Prima Capital', detail: 'Numbers lock when sent', ref_kind: 'proposal', ref_id: DB.val("SELECT id FROM proposals WHERE type='rac' AND event_id=?", [evId]), payload: { email: 'invest@primacapital.example' } });
    ES.session = null;
    // partner accounts and messages
    [['sponsor', deals['Bank Nusa'], 'Bank Nusa', 'partner@banknusa.example'], ['sponsor', deals['Gadget Hub'], 'Gadget Hub', 'partner@gadgethub.example'], ['sponsor', deals['Aqua Segar'], 'Aqua Segar', 'partner@aquasegar.example'], ['vendor', V['Sonic Hall Audio'], 'Sonic Hall Audio', 'sales@sonichall.example'],
      ['vendor', V['Lumen Lighting'], 'Lumen Lighting', 'bid@lumen.example'], ['artist', A['Dewi Arka'], 'Dewi Arka (management)', 'dewiarka@mgmt.example'], ['artist', A['The Lanterns'], 'The Lanterns (management)', 'thelanterns@mgmt.example']]
      .forEach(([k, ref, n, e]) => { const pid = DB.insert('partner_accounts', { kind: k, ref_id: ref, name: n, email: e, event_id: evId }); if (k === 'artist' && n.startsWith('Dewi')) DB.insert('messages', { partner_id: pid, from_kind: 'partner', body: 'Could we get a private green room with a sofa and tea service? Thank you.', created_at: ts(2, 16, 20) }); });
    DB.notify('role:ticketing', 'Lottery closes in 30 hours', '8,420 entries so far for 5,500 seats', { link: '#/ticketing' }); DB.notify('role:finance', '2 vendor invoices need attention', 'One invoice has no delivery confirmation, one differs from the order', { link: '#/vendors' });
    DB.setSetting('demo_pins', JSON.stringify({ Rina: '1234', Hendra: '2345', Bagas: '3333', Siti: '4444', Maya: '5555', Andre: '6666', Joko: '7777', Putri: '8888', Wayan: '9999', Dewi: '1111', Rudi: '2222' }));
    DB.setSetting('current_event', String(evId)); DB.setSetting('data_version', '1'); DB.setSetting('demo', '1');
    // overrides to show layered configuration
    ES.cfg.seed('tickets.per_buyer_cap', 'ticket_type', T.pit, 2, false); ES.cfg.seed('tickets.require_id', 'ticket_type', T.pit, true, false); ES.cfg.seed('sales.purchase_link_minutes', 'event', evId, 30, false); ES.cfg.seed('finance.match_tolerance_pct', 'project', proj, 0, false);
    ES.cfg.seed('qr.rotate_seconds', 'eo', 0, 30, false); ES.cfg.seed('finance.batch_days', 'eo', 0, 'Tuesday, Thursday', false);
    DB.log('database created', 'system', null, 'Demo database');
  }

  function empty(DB, v) {
    ES.seed.base(DB);
    DB.run('INSERT INTO org(id,name,legal_name,city,email,phone,address,signatory,signatory_title) VALUES(1,?,?,?,?,?,?,?,?)', [v.orgName, v.legalName || v.orgName, v.city, v.email || '', v.phone || '', v.address || '', v.ownerName, 'Director']);
    DB.insert('users', { name: v.ownerName, short: v.ownerName.split(' ')[0], role: 'owner', title: 'Owner', pin_hash: ES.auth.hashPin(v.pin), color: '#2F5BEA', created_at: F().nowStamp() });
    DB.insert('tenants', { name: v.orgName, plan: 'Annual', plan_fee: 5000000, started: F().today(), renews: F().addDays(F().today(), 365), status: 'active', is_current: 1 });
    DB.setSetting('data_version', '1');
  }
  ES.seed.demo = demo; ES.seed.empty = empty;
})();
