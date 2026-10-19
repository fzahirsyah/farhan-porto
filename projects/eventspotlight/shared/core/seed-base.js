/* Event Spotlight — base data for every new database (empty or demo): chart of accounts, platform configuration locks,
   and the concert template that turns one new project into a full set of plans. */
(function () {
  const ES = (window.ES = window.ES || {});
  const F = () => ES.fmt;

  const CHECKLIST_TEMPLATES = [
    // [title, area, phase, daysBeforeEvent, items[]]
    ['Gate readiness', 'Gate', 'pre-event', 1, ['Scanner phones charged above 80%', 'Offline ticket list synced on every device', 'Barriers and queue lanes placed', 'Wristband stock counted', 'Radio check with control room', 'Dispute desk staffed and rescue pool unlocked']],
    ['Stage and sound check', 'Stage', 'pre-event', 0, ['Line check complete', 'Monitor mix approved by headliner', 'Backline matches the riders', 'Stage hands briefed on changeover times', 'Emergency stop procedure tested']],
    ['Sponsor booths', 'Sponsors', 'pre-event', 1, ['Every booth is in its mapped position', 'Power and branding confirmed per booth', 'Head-count camera mounted and calibrated', 'Booth contact has the event-day schedule']],
    ['Vendor deliveries', 'Vendors', 'pre-event', 2, ['Delivery windows confirmed with each vendor', 'Receiving PIC named for each delivery', 'Delivery photos uploaded and signed off']],
    ['Medical and safety', 'Safety', 'pre-event', 1, ['Medic posts staffed', 'Exit routes clear and signed', 'Fire equipment checked', 'Lost child point briefed']],
    ['Ticketing operations', 'Ticketing', 'pre-event', 3, ['Lottery draw archived and seed published', 'Rescue pool counted and locked', 'Transfer window closes on schedule', 'Reseller commission sheet reconciled']],
    ['Show close and report', 'Reports', 'post-event', -1, ['All gate devices synced', 'Vendor delivery confirmations complete', 'Booth head-counts exported', 'Incident log reviewed', 'Settlement meeting scheduled']]
  ];
  const MILESTONES = [
    // [name, category, startOffset, endOffset, pct-if-past, role]
    ['Venue held and permits applied', 'Planning', -120, -90, 'producer'], ['Budget approved', 'Planning', -118, -105, 'finance'], ['Ticket rules published', 'Ticketing', -95, -90, 'ticketing'],
    ['Sponsor packages and proposals out', 'Sponsors', -100, -75, 'partnerships'], ['Community presale', 'Ticketing', -75, -66, 'ticketing'], ['Lottery entries open (48 hours)', 'Ticketing', -64, -62, 'ticketing'],
    ['Lottery draw and purchase links', 'Ticketing', -62, -60, 'ticketing'], ['Open sale with random queue', 'Ticketing', -45, -30, 'ticketing'], ['Artist riders approved', 'Artists', -60, -30, 'producer'],
    ['Vendor orders placed', 'Vendors', -50, -30, 'producer'], ['Layout frozen', 'Operations', -35, -30, 'producer'], ['Crew assigned and checklists issued', 'Operations', -20, -14, 'producer'],
    ['Transfer window closes', 'Ticketing', -2, -2, 'ticketing'], ['Build-up and load-in', 'Production', -3, -1, 'producer'], ['Event day', 'Show', 0, 0, 'producer'], ['Settlement and report', 'Finance', 1, 10, 'finance']
  ];
  const BUDGET_SPLIT = [['Artists', 'Artist fees and riders', 0.42], ['Production', 'Sound, lighting and stage', 0.18], ['Venue', 'Venue rental and permits', 0.10], ['Security', 'Security and medical', 0.07],
    ['Marketing', 'Media and advertising', 0.12], ['Promotors', 'Promotor commissions', 0.03], ['Logistics', 'Hospitality and logistics', 0.05], ['Other', 'Contingency', 0.03]];
  const PACKAGES = [['Platinum', 250000000, 2, 'Naming rights on stage banner|Largest booth (6 x 6 m)|Logo on every ticket|Six announcements|Booth head-count report'],
    ['Gold', 150000000, 4, 'Booth (6 x 3 m)|Logo on the stage screen|Four announcements|Booth head-count report'], ['Silver', 75000000, 6, 'Booth (3 x 3 m)|Logo on the website|Two announcements'], ['Booth only', 30000000, 8, 'Booth (3 x 3 m)']];
  const LAYOUT = [['stage', 'Main stage', 30, 3, 40, 14, '#101B33'], ['foh', 'Front of house', 42, 40, 16, 8, '#4A5573'], ['pit', 'Pit', 33, 18, 34, 14, '#C8283D'], ['gate', 'Gate A', 8, 92, 12, 5, '#2F5BEA'],
    ['gate', 'Gate B', 40, 92, 12, 5, '#2F5BEA'], ['gate', 'Gate C (VIP)', 80, 92, 12, 5, '#2F5BEA'], ['food', 'Food court', 5, 55, 18, 14, '#FFC93C'], ['medic', 'Medic', 78, 30, 10, 8, '#C8283D'],
    ['toilet', 'Toilets', 78, 60, 12, 8, '#4A5573'], ['merch', 'Merchandise', 5, 75, 16, 8, '#0B8A5F'], ['dispute', 'Dispute desk', 24, 86, 12, 5, '#FFC93C'], ['exit', 'Exit', 92, 50, 6, 10, '#0B8A5F']];

  function base(DB) {
    ES.ledger.seedAccounts(DB);
    const S = ES.cfg.seed;
    S('transfer.fee', 'platform', 0, 5000, true); S('resale.cap_pct', 'platform', 0, 100, true);
    S('tickets.per_buyer_cap', 'platform', 0, 4, false); S('qr.rotate_seconds', 'platform', 0, 30, false); S('qr.grace_windows', 'platform', 0, 1, false);
    S('rescue.pool_pct', 'platform', 0, 1.5, false); S('sales.lottery_window_hours', 'platform', 0, 48, false); S('sales.purchase_link_minutes', 'platform', 0, 30, false);
    S('fees.admin_payer', 'eo', 0, 'buyer', false); S('tax.ppn_rate', 'eo', 0, 11, false); S('tax.pph23_rate', 'eo', 0, 2, false);
    DB.setSetting('platform_pin_hash', ES.auth.hashPin('0000'));
    DB.setSetting('books_locked_until', '');
  }

  /* Generates the full set of plans for a new event. o: {eventId, ceiling, capacity, ticketTypes:[{name,price,pct,tier}], staffByRole:{producer,...}} */
  function concertTemplate(DB, o) {
    const ev = DB.get('SELECT * FROM events WHERE id=?', [o.eventId]); const date = ev.date;
    // waves: community 25, lottery 55, open 14, held 6
    const wv = [['community', 'Community presale', -75, -66, 25], ['lottery', 'Public lottery', -64, -62, 55], ['open', 'Open sale', -45, -30, 14], ['held', 'Held back (rescue, partners)', 0, 0, 6]];
    const types = DB.all('SELECT * FROM ticket_types WHERE event_id=? ORDER BY sort,id', [ev.id]);
    wv.forEach(([kind, name, a, b, pct]) => {
      const wid = DB.insert('waves', { event_id: ev.id, kind, name, opens_at: kind === 'held' ? null : F().addDays(date, a) + ' 09:00:00', closes_at: kind === 'held' ? null : F().addDays(date, b) + ' 09:00:00', pct, status: kind === 'held' ? 'held' : 'scheduled' });
      types.forEach((t) => DB.insert('wave_alloc', { wave_id: wid, ticket_type_id: t.id, qty: Math.round(t.quota * pct / 100) }));
    });
    // gates
    [['Gate A', 'entry', 3], ['Gate B', 'entry', 3], ['Gate C (VIP and Pit)', 'vip', 2], ['Exit', 'exit', 2]].forEach(([n, k, l]) => DB.insert('gates', { event_id: ev.id, name: n, kind: k, lanes: l }));
    // budget
    BUDGET_SPLIT.forEach(([cat, name, pct]) => DB.insert('budget_lines', { event_id: ev.id, category: cat, name, planned: Math.round(o.ceiling * pct / 1000) * 1000 }));
    // sponsor packages
    PACKAGES.forEach(([name, price, slots, ben], i) => DB.insert('sponsor_packages', { event_id: ev.id, name, price, slots, benefits: ben, sort: i }));
    // milestones
    MILESTONES.forEach(([name, cat, a, b, role]) => DB.insert('milestones', { event_id: ev.id, name, category: cat, starts: F().addDays(date, a), ends: F().addDays(date, b), owner_id: (o.staffByRole && o.staffByRole[role]) || null, pct: 0, status: 'open' }));
    // checklists
    CHECKLIST_TEMPLATES.forEach(([title, area, phase, before, items]) => {
      const cid = DB.insert('checklists', { event_id: ev.id, title, area, phase, due: F().addDays(date, -before), pic_id: (o.picByArea && o.picByArea[area]) || null });
      items.forEach((t, i) => DB.insert('checklist_items', { checklist_id: cid, text: t, sort: i, required: 1 }));
    });
    // layout
    LAYOUT.forEach(([kind, label, x, y, w, h, color]) => DB.insert('layout_items', { event_id: ev.id, kind, label, x, y, w, h, color }));
    // rundown skeleton
    [['15:00', 20, 'Gates open', 'Gate', 'ops'], ['16:00', 45, 'Opening act', 'Main stage', 'program'], ['17:00', 15, 'Changeover', 'Main stage', 'changeover'], ['17:15', 45, 'Support act', 'Main stage', 'program'],
      ['18:15', 20, 'Changeover', 'Main stage', 'changeover'], ['18:35', 60, 'Special guest', 'Main stage', 'program'], ['19:35', 25, 'Changeover and sound check', 'Main stage', 'changeover'], ['20:00', 90, 'Headliner', 'Main stage', 'program'], ['22:00', 30, 'Clear the venue', 'Gate', 'ops']]
      .forEach(([t, m, title, stage, kind]) => DB.insert('rundown_items', { event_id: ev.id, at_time: t, minutes: m, title, stage, kind }));
  }

  ES.seed = Object.assign(ES.seed || {}, { base, concertTemplate, CHECKLIST_TEMPLATES, MILESTONES, BUDGET_SPLIT, PACKAGES, LAYOUT });
})();
