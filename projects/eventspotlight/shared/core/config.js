/* Event Spotlight — layered configuration.
   Levels (most general first): platform > eo > project > event > ticket_type > device.
   A value set at a lower level overrides the one above it, unless a higher level locked the key.
   Changes are saved as drafts, previewed, then published; every publish is written to the change log and can be rolled back. */
(function () {
  const ES = (window.ES = window.ES || {});
  const LEVELS = ['platform', 'eo', 'project', 'event', 'ticket_type', 'device'];
  const LEVEL_LABEL = { platform: 'Platform', eo: 'EO account', project: 'Project', event: 'Event', ticket_type: 'Ticket type', device: 'Device' };

  // key -> {label, group, type, unit, def, levels, help, options, sensitive, min, max}
  const REG = {
    'tickets.per_buyer_cap': { label: 'Tickets per buyer', group: 'Ticket rules', type: 'number', unit: 'tickets', def: 4, levels: ['platform', 'eo', 'event', 'ticket_type'], min: 1, max: 10, help: 'The most tickets one verified phone number can hold for this ticket type.', sensitive: true },
    'tickets.require_id': { label: 'Require ID check at the gate', group: 'Ticket rules', type: 'bool', def: false, levels: ['event', 'ticket_type'], help: 'Gate crew must compare the holder name with an ID. Use it for high-demand tiers.' },
    'sales.lottery_window_hours': { label: 'Lottery entry window', group: 'Fair sales', type: 'number', unit: 'hours', def: 48, levels: ['platform', 'eo', 'event'], min: 12, max: 168, sensitive: true },
    'sales.purchase_link_minutes': { label: 'Purchase link lifetime for lottery winners', group: 'Fair sales', type: 'number', unit: 'minutes', def: 30, levels: ['platform', 'eo', 'event'], min: 10, max: 240, sensitive: true },
    'sales.queue_rate_per_min': { label: 'People admitted from the queue per minute', group: 'Fair sales', type: 'number', unit: 'people', def: 30, levels: ['platform', 'eo', 'event'], min: 1, max: 500 },
    'sales.open_queue_minutes': { label: 'Random queue length at open sale', group: 'Fair sales', type: 'number', unit: 'minutes', def: 10, levels: ['platform', 'eo', 'event'], min: 0, max: 60, sensitive: true },
    'qr.rotate_seconds': { label: 'QR code refresh interval', group: 'Anti-calo', type: 'number', unit: 'seconds', def: 30, levels: ['platform', 'eo', 'event'], min: 15, max: 60, help: 'A screenshot stops working after this interval plus one grace window.' },
    'qr.grace_windows': { label: 'Grace windows accepted', group: 'Anti-calo', type: 'number', unit: 'windows', def: 1, levels: ['platform', 'event'], min: 0, max: 2, help: 'How many past intervals a scanner still accepts, to forgive slow phones.' },
    'transfer.allowed': { label: 'Official transfers allowed', group: 'Anti-calo', type: 'bool', def: true, levels: ['platform', 'eo', 'event'] },
    'transfer.fee': { label: 'Transfer fee (paid by the seller to the EO)', group: 'Anti-calo', type: 'money', unit: 'Rp', def: 5000, levels: ['platform'], help: 'Flat fee. Locked by the platform so every EO plays by the same rule.' },
    'transfer.closes_days_before': { label: 'Transfers close before the event', group: 'Anti-calo', type: 'number', unit: 'days', def: 2, levels: ['platform', 'eo', 'event'], min: 0, max: 30 },
    'resale.cap_pct': { label: 'Resale price cap (percent of face value)', group: 'Anti-calo', type: 'number', unit: '%', def: 100, levels: ['platform'], help: 'Resale above face value is refused. Locked by the platform.' },
    'rescue.pool_pct': { label: 'Rescue pool (percent of capacity held back)', group: 'Anti-calo', type: 'number', unit: '%', def: 1.5, levels: ['platform', 'eo', 'event'], min: 0, max: 5, help: 'Tickets at face value used to fix a stranded buyer on the spot.' },
    'scan.event_day_only': { label: 'Accept scans only on the event date', group: 'Gate', type: 'bool', def: false, levels: ['platform', 'eo', 'event'], help: 'Turn this on for real events. It is off in the demo so you can rehearse today.' },
    'scan.allow_reentry': { label: 'Allow re-entry', group: 'Gate', type: 'bool', def: false, levels: ['event', 'ticket_type'] },
    'scan.offline_allowed': { label: 'Allow offline scanning', group: 'Gate', type: 'bool', def: true, levels: ['platform', 'event', 'device'] },
    'device.large_result': { label: 'Full-screen scan result', group: 'Gate', type: 'bool', def: true, levels: ['event', 'device'] },
    'fees.admin_payer': { label: 'Who pays the payment admin fee', group: 'Money', type: 'select', options: [['buyer', 'Buyer, added at checkout'], ['eo', 'EO, taken from sales']], def: 'buyer', levels: ['eo', 'event'], help: 'The software fee is separate: one yearly plan.' },
    'fees.admin_pct': { label: 'Payment admin fee (percent)', group: 'Money', type: 'number', unit: '%', def: 2.5, levels: ['eo', 'event'], min: 0, max: 10, help: 'Placeholder. Use the rate in your payment gateway contract.' },
    'fees.admin_flat': { label: 'Payment admin fee (flat per order)', group: 'Money', type: 'money', unit: 'Rp', def: 2000, levels: ['eo', 'event'], help: 'Placeholder. Use the rate in your payment gateway contract.' },
    'finance.match_tolerance_pct': { label: 'Invoice tolerance for three-way match', group: 'Finance', type: 'number', unit: '%', def: 0, levels: ['eo', 'project'], min: 0, max: 10, help: 'Invoice may differ from the order by this much and still match.' },
    'finance.require_delivery': { label: 'Require PIC delivery confirmation before paying', group: 'Finance', type: 'bool', def: true, levels: ['eo', 'project'] },
    'finance.batch_days': { label: 'Payment batch days', group: 'Finance', type: 'text', def: 'Tuesday, Thursday', levels: ['eo'] },
    'tax.ppn_rate': { label: 'VAT rate (PPN)', group: 'Tax', type: 'number', unit: '%', def: 11, levels: ['eo'], help: 'Set by your accountant. Confirm the current rate before use.' },
    'tax.pph23_rate': { label: 'Withholding rate on services (PPh 23)', group: 'Tax', type: 'number', unit: '%', def: 2, levels: ['eo'], help: 'Set by your accountant.' },
    'tax.stamp_threshold': { label: 'Stamp duty applies above', group: 'Tax', type: 'money', unit: 'Rp', def: 5000000, levels: ['eo'], help: 'Unverified. Confirm with your accountant.' },
    'tax.stamp_amount': { label: 'Stamp duty amount', group: 'Tax', type: 'money', unit: 'Rp', def: 10000, levels: ['eo'], help: 'Unverified. Confirm with your accountant.' },
    'control.refresh_seconds': { label: 'Control room refresh', group: 'Event day', type: 'number', unit: 'seconds', def: 5, levels: ['eo', 'event', 'device'], min: 2, max: 60 },
    'booth.sensitivity': { label: 'Booth counter sensitivity', group: 'Event day', type: 'number', unit: '0-100', def: 50, levels: ['eo', 'event', 'device'], min: 0, max: 100 }
  };

  const nowBy = () => (ES.session && ES.session.name) || 'System';

  function rows(key) { return ES.db.all('SELECT * FROM config WHERE key=?', [key]); }
  function scopeFor(level, ctx) {
    ctx = ctx || {};
    return { platform: 0, eo: 0, project: ctx.projectId || 0, event: ctx.eventId || 0, ticket_type: ctx.ticketTypeId || 0, device: ctx.deviceId || 0 }[level];
  }
  /* resolve(key, ctx, {draft}) -> {value, level, by, at, locked, lockedBy, def, draft} */
  function resolve(key, ctx, opt) {
    const r = REG[key]; opt = opt || {};
    if (!r) return { value: undefined, level: 'default' };
    const rs = rows(key);
    let value = r.def, level = 'default', by = null, at = null, lockedBy = null, isDraft = false;
    for (const lv of LEVELS) {
      const scope = scopeFor(lv, ctx);
      const pub = rs.find((x) => x.level === lv && x.scope_id === scope && x.status === 'published');
      const dr = opt.draft ? rs.find((x) => x.level === lv && x.scope_id === scope && x.status === 'draft') : null;
      const row = dr || pub;
      if (!row) continue;
      if (lockedBy) continue; // a higher level locked this key
      value = row.value; level = lv; by = row.updated_by; at = row.updated_at; isDraft = !!dr;
      if (row.locked) lockedBy = lv;
    }
    return { value: coerce(r, value), level, by, at, lockedBy, def: r.def, draft: isDraft };
  }
  function coerce(r, v) {
    if (r.type === 'number') return Number(v);
    if (r.type === 'money') return Number(v);
    if (r.type === 'bool') return v === true || v === 1 || v === '1' || v === 'true';
    return v;
  }
  const get = (key, ctx) => resolve(key, ctx).value;

  // ---- writing (inside DB.write) ----
  function setDraft(key, level, scopeId, value, locked) {
    const r = REG[key]; if (!r) throw new Error('Unknown setting ' + key);
    if (!r.levels.includes(level)) throw new Error(r.label + ' cannot be set at the ' + LEVEL_LABEL[level] + ' level');
    const stored = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    if (r.type === 'number' || r.type === 'money') {
      const n = Number(stored); if (isNaN(n)) throw new Error('Enter a number for ' + r.label);
      if (r.min !== undefined && n < r.min) throw new Error(r.label + ' must be at least ' + r.min);
      if (r.max !== undefined && n > r.max) throw new Error(r.label + ' must be at most ' + r.max);
    }
    const ex = ES.db.get("SELECT * FROM config WHERE key=? AND level=? AND scope_id=? AND status='draft'", [key, level, scopeId || 0]);
    const o = { key, level, scope_id: scopeId || 0, value: stored, locked: locked ? 1 : 0, status: 'draft', updated_by: nowBy(), updated_at: ES.fmt.nowStamp() };
    if (ex) ES.db.update('config', ex.id, o); else ES.db.insert('config', o);
  }
  function discardDraft(key, level, scopeId) { ES.db.run("DELETE FROM config WHERE key=? AND level=? AND scope_id=? AND status='draft'", [key, level, scopeId || 0]); }
  function removeOverride(key, level, scopeId) {
    const ex = ES.db.get("SELECT * FROM config WHERE key=? AND level=? AND scope_id=? AND status='published'", [key, level, scopeId || 0]);
    if (ex) { ES.db.insert('config_log', { key, level, scope_id: scopeId || 0, old_value: ex.value, new_value: null, action: 'remove override', by: nowBy(), at: ES.fmt.nowStamp() }); ES.db.run('DELETE FROM config WHERE id=?', [ex.id]); }
  }
  function drafts() { return ES.db.all("SELECT * FROM config WHERE status='draft' ORDER BY id"); }
  // Publish all drafts. Sensitive keys on an event that already has sales go to a second-person approval instead.
  function publish(eventId) {
    const sold = eventId ? ES.db.val("SELECT COUNT(*) FROM tickets WHERE event_id=?", [eventId]) : 0;
    let published = 0, pending = 0;
    drafts().forEach((d) => {
      const r = REG[d.key];
      if (r && r.sensitive && sold > 0 && d.level !== 'platform') {
        ES.db.insert('approvals', { event_id: eventId, kind: 'rule_change', title: 'Change "' + r.label + '" after sales opened', detail: LEVEL_LABEL[d.level] + ' level: ' + d.value + (r.unit ? ' ' + r.unit : ''), needs_role: 'second_person', ref_kind: 'config', ref_id: d.id,
          requested_by: nowBy(), requested_by_id: ES.session ? ES.session.id : null, created_at: ES.fmt.nowStamp() });
        ES.db.update('config', d.id, { status: 'pending' }); pending++;
      } else { applyDraft(d); published++; }
    });
    return { published, pending };
  }
  function applyDraft(d) {
    const ex = ES.db.get("SELECT * FROM config WHERE key=? AND level=? AND scope_id=? AND status='published'", [d.key, d.level, d.scope_id]);
    ES.db.insert('config_log', { key: d.key, level: d.level, scope_id: d.scope_id, old_value: ex ? ex.value : null, new_value: d.value, action: 'publish', by: nowBy(), at: ES.fmt.nowStamp() });
    if (ex) ES.db.run('DELETE FROM config WHERE id=?', [ex.id]);
    ES.db.update('config', d.id, { status: 'published', published_at: ES.fmt.nowStamp() });
  }
  function applyApproved(configId) { const d = ES.db.get('SELECT * FROM config WHERE id=?', [configId]); if (d) applyDraft(d); }
  function rejectPending(configId) { ES.db.run('DELETE FROM config WHERE id=?', [configId]); }
  function rollback(logId) {
    const l = ES.db.get('SELECT * FROM config_log WHERE id=?', [logId]); if (!l || l.action !== 'publish') throw new Error('Nothing to roll back');
    const cur = ES.db.get("SELECT * FROM config WHERE key=? AND level=? AND scope_id=? AND status='published'", [l.key, l.level, l.scope_id]);
    if (l.old_value === null) { if (cur) ES.db.run('DELETE FROM config WHERE id=?', [cur.id]); }
    else if (cur) ES.db.update('config', cur.id, { value: l.old_value, updated_by: nowBy(), updated_at: ES.fmt.nowStamp() });
    ES.db.insert('config_log', { key: l.key, level: l.level, scope_id: l.scope_id, old_value: l.new_value, new_value: l.old_value, action: 'rollback', by: nowBy(), at: ES.fmt.nowStamp() });
  }
  // Direct publish used by seeding and by platform/admin (no draft step).
  function seed(key, level, scopeId, value, locked) {
    const stored = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    ES.db.insert('config', { key, level, scope_id: scopeId || 0, value: stored, locked: locked ? 1 : 0, status: 'published', updated_by: 'System', updated_at: ES.fmt.nowStamp(), published_at: ES.fmt.nowStamp() });
  }
  ES.cfg = { LEVELS, LEVEL_LABEL, REG, resolve, get, setDraft, discardDraft, removeOverride, drafts, publish, applyApproved, rejectPending, rollback, seed };
})();
