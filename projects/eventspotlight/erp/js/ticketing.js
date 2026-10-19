/* Ticketing: overview, ticket types, sales waves, fair-lottery (commit, draw, verify), orders, tickets, transfers, rules. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const TABS = [['overview', 'Overview'], ['types', 'Ticket types'], ['waves', 'Sales waves'], ['lottery', 'Lottery'], ['orders', 'Orders'], ['tickets', 'Tickets'], ['transfers', 'Transfers'], ['rules', 'Rules']];
  const WAVE_TAG = { community: 'Community', lottery: 'Lottery', open: 'Open sale', held: 'Held back', rescue: 'Rescue', reseller: 'Reseller' };
  const ST_TAG = { valid: ['Valid', 'g'], used: ['Entered', 'b'], void: ['Transferred', ''], refunded: ['Refunded', 'r'], pool: ['Rescue pool', 'a'] };
  const can = (p) => ES.auth.can(p);

  function render(el, param) {
    const [tab0, id] = (param || 'overview').split('/'); const tab = TABS.find((t) => t[0] === tab0) ? tab0 : 'overview'; const ev = E.ev();
    if (!ev) { el.innerHTML = E.pageHead('Ticketing') + ES.ui.empty('No event yet', 'Create a project first.'); return; }
    el.innerHTML = E.pageHead('Ticketing', esc(ev.name) + ' · one yearly plan, no per-ticket software fee') + '<div class="tabs" id="tb"></div><div id="tbody"></div>';
    ES.ui.tabs($('#tb'), TABS.map((t) => ({ id: t[0], label: t[1] })), tab, (t) => (location.hash = '#/ticketing/' + t));
    const body = $('#tbody'); const fn = { overview, types, waves, lottery, orders, tickets, transfers, rules }[tab]; fn(body, ev, id);
    if (tab0 === 'ticket' && id) { location.hash = '#/ticketing/tickets'; }
  }

  // ---------- overview ----------
  function overview(el, ev) {
    const ts = ES.tix.typeStats(ev.id); const sold = ts.reduce((a, t) => a + t.sold, 0), cap = ts.reduce((a, t) => a + t.quota, 0), pool = ts.reduce((a, t) => a + t.pool, 0);
    const rev = DB().val("SELECT COALESCE(SUM(subtotal),0) FROM orders WHERE event_id=? AND status='paid'", [ev.id]) || 0;
    const fees = DB().val("SELECT COALESCE(SUM(fee),0) FROM transfers WHERE event_id=?", [ev.id]) || 0;
    const orders = DB().val('SELECT COUNT(*) FROM orders WHERE event_id=?', [ev.id]);
    const ws = DB().all('SELECT * FROM waves WHERE event_id=? ORDER BY id', [ev.id]);
    const byChan = DB().all("SELECT wave_kind k, COUNT(t.id) n, COALESCE(SUM(t.price),0) v FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.event_id=? AND t.transferred_from IS NULL AND t.rescue=0 GROUP BY wave_kind", [ev.id]);
    el.innerHTML = `<div class="grid g4" style="margin-bottom:16px">
      <div class="card kpi"><div class="l">Tickets sold</div><div class="n">${F.num(sold)}</div><div class="d">${cap ? Math.round(sold / cap * 100) : 0}% of ${F.num(cap)}</div></div>
      <div class="card kpi"><div class="l">Ticket revenue</div><div class="n">${F.rpShort(rev)}</div><div class="d">${F.num(orders)} orders · 100% to the organiser except the payment admin fee</div></div>
      <div class="card kpi"><div class="l">Transfer fees</div><div class="n">${F.rp(fees)}</div><div class="d">flat ${F.rp(ES.cfg.get('transfer.fee', E.ctx()))} each, paid by the seller</div></div>
      <div class="card kpi"><div class="l">Rescue pool</div><div class="n">${F.num(pool)}</div><div class="d">held for gate disputes, at face value</div></div></div>
      <div class="grid g2"><div class="card"><div class="card-h"><h3>By ticket type</h3></div>
        <table class="tbl"><thead><tr><th>Type</th><th class="num">Price</th><th class="num">Sold</th><th class="num">Left</th><th></th></tr></thead><tbody>${ts.map((t) => `<tr><td><b>${esc(t.name)}</b>${t.requires_id ? ' ' + tag('ID check', 'a') : ''}</td><td class="num">${F.rp(t.price)}</td><td class="num">${F.num(t.sold)}</td><td class="num">${F.num(t.left)}</td><td style="width:120px"><div class="bar"><i style="width:${t.quota ? t.sold / t.quota * 100 : 0}%"></i></div></td></tr>`).join('')}</tbody></table></div>
      <div class="card"><div class="card-h"><h3>By channel</h3></div><table class="tbl"><thead><tr><th>Channel</th><th class="num">Tickets</th><th class="num">Value</th></tr></thead><tbody>${byChan.map((c) => `<tr><td>${esc(WAVE_TAG[c.k] || c.k)}</td><td class="num">${F.num(c.n)}</td><td class="num">${F.rp(c.v)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No sales yet</td></tr>'}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Release plan</h3><span class="hint">Fair sales: community first, a public lottery next, then an open sale with a random queue</span></div>
        <div class="grid g4">${ws.map((w) => `<div style="border:2px solid var(--line);padding:12px;border-radius:4px"><b>${esc(w.name)}</b><div class="muted">${w.opens_at ? F.stamp(w.opens_at) + ' to ' + F.stamp(w.closes_at) : 'Not on public sale'}</div><div class="row" style="margin-top:6px">${tag(w.status, w.status === 'open' ? 'g' : w.status === 'drawn' || w.status === 'closed' ? '' : 'a')}<span class="muted">${w.pct}% of seats</span></div></div>`).join('')}</div></div>`;
  }

  // ---------- ticket types ----------
  function types(el, ev) {
    const ts = ES.tix.typeStats(ev.id);
    el.innerHTML = `<div class="card"><div class="card-h"><h3>Ticket types</h3>${can('ticketing.rules') ? '<button class="btn primary sm" style="margin-left:auto" id="addT">Add ticket type</button>' : ''}</div><div id="tt"></div></div>`;
    ES.ui.dataTable($('#tt'), { rows: ts, noSearch: true, exportName: 'ticket-types', columns: [
      { key: 'name', label: 'Name', render: (r) => `<b>${esc(r.name)}</b><div class="sub">${esc(r.perks || '')}</div>` }, { key: 'tier', label: 'Tier' }, { key: 'price', label: 'Price', num: true, render: (r) => F.rp(r.price) },
      { key: 'quota', label: 'Quota', num: true, render: (r) => F.num(r.quota) }, { key: 'sold', label: 'Sold', num: true, render: (r) => F.num(r.sold) }, { key: 'pool', label: 'Pool', num: true }, { key: 'left', label: 'Left', num: true },
      { key: 'requires_id', label: 'ID check', render: (r) => (r.requires_id ? 'Yes' : 'No') }, { key: 'active', label: 'Status', render: (r) => (r.active ? tag('On sale', 'g') : tag('Off')) }], onRow: can('ticketing.rules') ? (r) => typeForm(ev, r) : null });
    if ($('#addT')) $('#addT').onclick = () => typeForm(ev, null);
  }
  function typeForm(ev, r) {
    const locked = r && r.sold > 0; const f = [{ name: 'name', label: 'Name', required: true, full: true }, { name: 'tier', label: 'Tier', type: 'select', options: [['general', 'General'], ['vip', 'VIP'], ['pit', 'Pit']] },
      { name: 'price', label: 'Price (Rp)', type: 'money', required: true, readonly: locked, help: locked ? 'Price is locked once tickets are sold. Add a new ticket type instead.' : '' }, { name: 'quota', label: 'Quota', type: 'number', required: true, min: 0, help: locked ? 'Cannot go below ' + (r.sold + r.pool) + ' (sold plus pool)' : '' },
      { name: 'perks', label: 'What is included', full: true }, { name: 'requires_id', label: 'Check ID at the gate', type: 'checkbox' }, { name: 'active', label: 'On sale', type: 'checkbox', default: 1 }];
    ES.ui.drawer.open({ title: r ? 'Edit ' + r.name : 'New ticket type', body: ES.ui.formHTML(f, r || { tier: 'general', quota: 100, active: 1 }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, d) => {
      ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => {
        const v = ES.ui.validate(b, f, (v, fail) => { if (r && v.quota < r.sold + r.pool) fail('quota', 'Cannot go below ' + (r.sold + r.pool)); if (v.price < 0) fail('price', 'Cannot be negative'); }); if (!v) return;
        const ok = await E.act('ticket type', () => {
          if (r) { DB().update('ticket_types', r.id, { name: v.name, tier: v.tier, quota: v.quota, perks: v.perks, requires_id: v.requires_id, active: v.active }); if (!locked) DB().update('ticket_types', r.id, { price: v.price }); DB().log('ticket type edited', 'ticket_types', r.id, v.name); }
          else { const id = DB().insert('ticket_types', { event_id: ev.id, name: v.name, tier: v.tier, price: v.price, quota: v.quota, perks: v.perks, requires_id: v.requires_id, active: v.active, sort: 9, color: '#2F5BEA' });
            DB().all('SELECT * FROM waves WHERE event_id=?', [ev.id]).forEach((w) => DB().insert('wave_alloc', { wave_id: w.id, ticket_type_id: id, qty: Math.round(v.quota * w.pct / 100) })); DB().log('ticket type added', 'ticket_types', id, v.name); }
        }, 'Saved'); if (ok !== undefined || true) ES.ui.drawer.close();
      };
    } });
  }

  // ---------- waves ----------
  function waves(el, ev) {
    const ws = DB().all('SELECT * FROM waves WHERE event_id=? ORDER BY id', [ev.id]); const ts = DB().all('SELECT * FROM ticket_types WHERE event_id=? ORDER BY sort,id', [ev.id]);
    el.innerHTML = `<div class="notice" style="margin-bottom:14px">Allocations decide how many seats of each type go into each release. Unsold community and lottery seats move to the open sale when those releases close.</div>
      ${ws.map((w) => {
        const al = Object.fromEntries(DB().all('SELECT * FROM wave_alloc WHERE wave_id=?', [w.id]).map((a) => [a.ticket_type_id, a.qty]));
        return `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>${esc(w.name)}</h3>${tag(w.status, w.status === 'open' ? 'g' : 'a')}<span class="hint">${w.opens_at ? F.stamp(w.opens_at) + ' to ' + F.stamp(w.closes_at) : 'Not on public sale'} · ${w.pct}%</span></div>
        <table class="tbl"><thead><tr><th>Ticket type</th><th class="num">Allocated</th><th class="num">Sold here</th><th class="num">Left</th></tr></thead><tbody>${ts.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${can('ticketing.rules') && ['scheduled', 'held'].includes(w.status) ? `<input class="input" style="width:110px;text-align:right" data-al="${w.id}:${t.id}" value="${al[t.id] || 0}" type="number" min="0">` : F.num(al[t.id] || 0)}</td><td class="num">${F.num(ES.tix.waveSold(w.kind, t.id))}</td><td class="num">${F.num(w.kind === 'held' ? 0 : ES.tix.waveLeft(ev.id, w.kind, t.id))}</td></tr>`).join('')}</tbody></table>
        <div class="row" style="margin-top:10px;gap:8px">${can('ticketing.rules') && w.kind !== 'held' ? `${w.status === 'scheduled' ? `<button class="btn go sm" data-w="open:${w.id}">Open now</button>` : ''}${w.status === 'open' && w.kind !== 'lottery' ? `<button class="btn sm" data-w="close:${w.id}">Close this release</button>` : ''}` : ''}${can('ticketing.rules') && ['scheduled', 'held'].includes(w.status) ? `<button class="btn sm" data-w="save:${w.id}">Save allocation</button>` : ''}</div></div>`;
      }).join('')}`;
    $$('[data-w]', el).forEach((b) => (b.onclick = async () => {
      const [a, id] = b.dataset.w.split(':'); const wid = Number(id);
      if (a === 'save') { const rows = $$(`[data-al^="${wid}:"]`, el).map((i) => [Number(i.dataset.al.split(':')[1]), Number(i.value) || 0]);
        for (const [tid, q] of rows) { const quota = ts.find((t) => t.id === tid).quota; const other = DB().val('SELECT COALESCE(SUM(qty),0) FROM wave_alloc WHERE ticket_type_id=? AND wave_id!=?', [tid, wid]); if (other + q > quota) return toast(ts.find((t) => t.id === tid).name + ': total allocation ' + F.num(other + q) + ' would exceed the quota of ' + F.num(quota), 'err'); }
        return E.act('wave allocation', () => { rows.forEach(([tid, q]) => DB().run('UPDATE wave_alloc SET qty=? WHERE wave_id=? AND ticket_type_id=?', [q, wid, tid])); DB().log('wave allocation', 'waves', wid, ''); }, 'Allocation saved'); }
      if (a === 'open') { if (!(await ES.ui.confirm('Open this release now?', 'Buyers can start purchasing straight away.', { ok: 'Open now' }))) return; return E.act('open wave', () => { DB().update('waves', wid, { status: 'open' }); DB().log('wave opened', 'waves', wid, ''); }, 'Release opened'); }
      if (a === 'close') { if (!(await ES.ui.confirm('Close this release?', 'Unsold seats move to the open sale.', { ok: 'Close' }))) return; return E.act('close wave', () => { DB().update('waves', wid, { status: 'closed' }); DB().log('wave closed', 'waves', wid, ''); }, 'Release closed'); }
    }));
  }

  // ---------- lottery ----------
  function lottery(el, ev) {
    const w = ES.tix.waveFor(ev.id, 'lottery'); if (!w) { el.innerHTML = ES.ui.empty('No lottery for this event'); return; }
    const entries = DB().val('SELECT COUNT(*) FROM lottery_entries WHERE wave_id=?', [w.id]); const seats = DB().val('SELECT COALESCE(SUM(qty),0) FROM wave_alloc WHERE wave_id=?', [w.id]);
    const wanted = DB().val('SELECT COALESCE(SUM(qty),0) FROM lottery_entries WHERE wave_id=?', [w.id]);
    const byStatus = Object.fromEntries(DB().all('SELECT status, COUNT(*) n FROM lottery_entries WHERE wave_id=? GROUP BY status', [w.id]).map((r) => [r.status, r.n]));
    const drawn = !!w.drawn_at; const closes = w.closes_at ? new Date(w.closes_at.replace(' ', 'T')) : null; const isClosed = closes && closes < new Date();
    const ver = drawn ? ES.tix.lotteryVerify(w.id) : null; const dr = can('ticketing.draw');
    const step = (n, title, state, body) => `<div class="card" style="margin-bottom:12px"><div class="row"><b style="font:700 28px var(--display);width:36px">${n}</b><div style="flex:1"><b>${title}</b><div class="muted">${body}</div></div>${state}</div></div>`;
    el.innerHTML = `<div class="grid g4" style="margin-bottom:16px"><div class="card kpi"><div class="l">Entries</div><div class="n">${F.num(entries)}</div><div class="d">${F.num(wanted)} tickets wanted</div></div>
      <div class="card kpi"><div class="l">Seats in the lottery</div><div class="n">${F.num(seats)}</div><div class="d">${wanted > seats ? (wanted / seats).toFixed(1) + '× oversubscribed' : 'not oversubscribed'}</div></div>
      <div class="card kpi"><div class="l">Entry window</div><div class="n" style="font-size:22px">${closes ? (isClosed ? 'Closed' : Math.max(0, Math.round((closes - new Date()) / 3600000)) + ' hours left') : '—'}</div><div class="d">closes ${F.stamp(w.closes_at)}</div></div>
      <div class="card kpi"><div class="l">Winners / bought</div><div class="n">${F.num(byStatus.won || 0)} / ${F.num(byStatus.purchased || 0)}</div><div class="d">${F.num(byStatus.lost || 0)} not drawn · ${F.num(byStatus.expired || 0)} expired</div></div></div>
      ${step(1, 'Commit the seed hash', w.draw_hash ? tag('Committed', 'g') : (dr ? '<button class="btn primary" id="lcommit">Commit seed hash</button>' : tag('Ticketing lead', 'a')), w.draw_hash ? `Published hash: <code style="word-break:break-all">${w.draw_hash}</code><br>Publish this on your social media before the draw. The secret seed stays hidden until the draw is done.` : 'A random secret seed is created and only its hash is shown. This proves you did not pick winners after seeing the entries.')}
      ${step(2, 'Run the draw', drawn ? tag('Done ' + F.stamp(w.drawn_at), 'g') : (dr ? `<button class="btn primary" id="ldraw" ${w.draw_hash ? '' : 'disabled'}>${isClosed ? 'Run the draw' : 'Close entries and draw'}</button>` : tag('Ticketing lead', 'a')), 'Entries are shuffled with the secret seed. Winners fill each ticket type until its seats run out. Winners get a purchase link that expires.')}
      ${step(3, 'Verify the draw', drawn ? (ver.ok ? tag('Verified', 'g') : tag('Mismatch', 'r')) : tag('After the draw'), drawn ? `Seed revealed: <code>${esc(w.draw_seed)}</code>. Hash check: <b>${ver.hashOk ? 'matches' : 'DOES NOT MATCH'}</b>. Re-running the shuffle gives the same order for ${F.num(ver.entries)} entries: <b>${ver.orderOk ? 'yes' : 'NO'}</b>.` : 'Anyone can re-run the shuffle from the revealed seed and check the same result.')}
      ${step(4, 'Send links and release the rest', drawn ? `${dr ? '<button class="btn" id="lsend">Send purchase links</button> <button class="btn" id="lrelease">Release unclaimed seats</button>' : ''}` : tag('After the draw'), 'Winners buy within ' + ES.cfg.get('sales.purchase_link_minutes', E.ctx()) + ' minutes. After that, unclaimed seats move to the open sale.')}
      <div class="card"><div class="card-h"><h3>Entries</h3></div><div id="le"></div></div>`;
    const rows = DB().all("SELECT e.*, t.name type FROM lottery_entries e LEFT JOIN ticket_types t ON t.id=e.ticket_type_id WHERE e.wave_id=? ORDER BY COALESCE(e.draw_rank, 1e9), e.id LIMIT 3000", [w.id]);
    ES.ui.dataTable($('#le'), { rows, exportName: 'lottery-entries', pageSize: 15, searchKeys: ['name', 'phone', 'type', 'status'], filters: [{ key: 'status', label: 'Status', options: ['entered', 'won', 'lost', 'purchased', 'expired'].map((s) => [s, s]) }], columns: [
      { key: 'draw_rank', label: 'Rank', num: true, render: (r) => r.draw_rank || '—' }, { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone', render: (r) => (can('data.export') ? esc(r.phone) : F.mask(r.phone)), value: (r) => F.mask(r.phone) }, { key: 'type', label: 'Type' }, { key: 'qty', label: 'Qty', num: true },
      { key: 'status', label: 'Status', render: (r) => tag(r.status, r.status === 'won' || r.status === 'purchased' ? 'g' : r.status === 'expired' ? 'r' : '') }, { key: 'link_expires_at', label: 'Link expires', render: (r) => (r.status === 'won' ? F.stamp(r.link_expires_at) : '') }] });
    const on = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
    on('#lcommit', () => E.act('lottery commit', () => ES.tix.lotteryCommit(w.id), 'Seed hash committed. Publish it now.'));
    on('#ldraw', async () => { if (!(await ES.ui.confirm('Run the lottery draw?', `${F.num(entries)} entries compete for ${F.num(seats)} seats. This cannot be repeated.`, { ok: 'Run the draw' }))) return; E.act('lottery draw', () => { if (w.status === 'open' && !isClosed) DB().update('waves', w.id, { closes_at: F.nowStamp() }); const r = ES.tix.lotteryDraw(w.id); DB().notify('role:ticketing', 'Lottery drawn', r.won + ' winners', { link: '#/ticketing/lottery' }); return r; }, 'Draw complete'); });
    on('#lsend', () => E.act('send lottery links', () => { const ws = DB().all("SELECT * FROM lottery_entries WHERE wave_id=? AND status='won'", [w.id]); ws.forEach((e) => DB().email('sms:' + e.phone, e.name, 'SMS to ' + F.mask(e.phone), `You won ${e.qty} ticket(s) for ${ev.name}! Buy within ${ES.cfg.get('sales.purchase_link_minutes', E.ctx())} minutes: shop/index.html#/buy/${e.link_token}`, 'sms')); return ws.length; }, 'Purchase links sent to the Outbox'));
    on('#lrelease', async () => { if (!(await ES.ui.confirm('Release unclaimed seats?', 'Winners who did not buy in time lose their seats, and the rest go to the open sale.', { ok: 'Release' }))) return;
      E.act('release lottery', () => { DB().run("UPDATE lottery_entries SET status='expired' WHERE wave_id=? AND status='won' AND link_expires_at<?", [w.id, new Date().toISOString()]); const still = DB().val("SELECT COUNT(*) FROM lottery_entries WHERE wave_id=? AND status='won'", [w.id]); if (still) throw new Error(still + ' winners still have time left on their links'); DB().update('waves', w.id, { status: 'closed' }); DB().log('lottery released', 'waves', w.id, ''); }, 'Unclaimed seats moved to the open sale'); });
  }

  // ---------- orders ----------
  function orders(el, ev, id) {
    el.innerHTML = '<div class="card"><div id="od"></div></div>';
    const rows = DB().all("SELECT o.*, p.name promotor FROM orders o LEFT JOIN promotors p ON p.id=o.promotor_id WHERE o.event_id=? ORDER BY o.id DESC LIMIT 4000", [ev.id]);
    ES.ui.dataTable($('#od'), { rows, pageSize: 20, exportName: 'orders', searchKeys: ['no', 'buyer_name', 'buyer_phone', 'promotor'], filters: [{ key: 'wave_kind', label: 'Release', options: Object.entries(WAVE_TAG) }, { key: 'status', label: 'Status', options: [['paid', 'Paid'], ['refunded', 'Refunded']] }], columns: [
      { key: 'no', label: 'Order' }, { key: 'created_at', label: 'Date', render: (r) => F.stamp(r.created_at) }, { key: 'buyer_name', label: 'Buyer', render: (r) => `<b>${esc(r.buyer_name)}</b><div class="sub">${esc(can('data.export') ? r.buyer_phone : F.mask(r.buyer_phone))}</div>`, value: (r) => r.buyer_name }, { key: 'wave_kind', label: 'Release', render: (r) => esc(WAVE_TAG[r.wave_kind] || r.wave_kind) },
      { key: 'promotor', label: 'Promotor' }, { key: 'qty', label: 'Qty', num: true }, { key: 'total', label: 'Total', num: true, render: (r) => F.rp(r.total) }, { key: 'status', label: 'Status', render: (r) => tag(r.status, r.status === 'paid' ? 'g' : 'r') }], onRow: (r) => orderDrawer(r.id) });
    if (id) orderDrawer(Number(id));
  }
  function orderDrawer(id) {
    const o = DB().get('SELECT * FROM orders WHERE id=?', [id]); if (!o) return; const ts = DB().all("SELECT t.*, tt.name type FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.order_id=?", [id]);
    ES.ui.drawer.open({ title: 'Order ' + o.no, body: `<div class="kv"><span>Buyer</span><span>${esc(o.buyer_name)}</span><span>Phone</span><span>${esc(can('data.export') ? o.buyer_phone : F.mask(o.buyer_phone))}</span><span>Release</span><span>${esc(WAVE_TAG[o.wave_kind] || o.wave_kind)}</span><span>Paid with</span><span>${esc(o.payment_method || '')}</span><span>Subtotal</span><span>${F.rp(o.subtotal)}</span><span>Payment admin fee</span><span>${F.rp(o.admin_fee)}</span><span>Total</span><span><b>${F.rp(o.total)}</b></span><span>Status</span><span>${tag(o.status, o.status === 'paid' ? 'g' : 'r')}</span></div>
      <div class="section-t" style="margin:16px 0 6px">Tickets</div>${ts.map((t) => `<div class="list"><div class="it"><b>${esc(t.serial)}</b><span>${esc(t.type)}</span><span class="spacer"></span>${tag(...(ST_TAG[t.status] || [t.status]))}</div></div>`).join('')}`,
      footer: can('ticketing.refund') && o.status === 'paid' ? '<button class="btn danger" id="refund">Refund this order</button>' : '', onMount: (b, d) => { const r = d.querySelector('#refund'); if (r) r.onclick = async () => {
        if (ts.some((t) => t.status === 'used')) return toast('Some tickets were already used. Refund is not possible.', 'err');
        if (!(await ES.ui.confirm('Refund ' + o.no + '?', 'All ' + ts.length + ' tickets are cancelled and ' + F.rp(o.subtotal) + ' is returned to the buyer.', { danger: true, ok: 'Refund' }))) return;
        E.act('refund', () => { DB().run("UPDATE tickets SET status='refunded' WHERE order_id=? AND status IN ('valid','void')", [id]); DB().update('orders', id, { status: 'refunded' }); ES.ledger.refund({ event_id: o.event_id, date: F.today(), amount: o.subtotal, ref: o.no, id }); DB().log('order refunded', 'orders', id, o.no + ' ' + F.rp(o.subtotal)); }, 'Refunded'); ES.ui.drawer.close(); }; } });
  }

  // ---------- tickets ----------
  function tickets(el, ev) {
    const allowed = ES.biz.exportAllowed(ev.id); const pend = DB().get("SELECT * FROM approvals WHERE kind='data_export' AND status='pending' AND event_id=? ORDER BY id DESC", [ev.id]);
    el.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row" style="gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:240px"><b>Attendee list with names and phone numbers</b><div class="muted">Personal data. A second person must approve each download. The approval works once. Phone numbers in the table below stay hidden.</div></div>${allowed ? '<span class="tag g">Approved</span><button class="btn primary" id="exGo">Download now (uses the approval)</button>' : pend ? `<span class="tag a">Waiting for ${esc(pend.requested_by === (ES.session && ES.session.name) ? 'a second person' : 'approval')}</span><a class="btn" href="#/settings/approvals">Open approvals</a>` : can('data.export') ? '<button class="btn" id="exReq">Request approval to export</button>' : ''}</div></div><div class="card"><div id="tk"></div></div>`;
    if ($('#exReq')) $('#exReq').onclick = () => { const f = [{ name: 'why', label: 'Why do you need the list?', type: 'textarea', required: true, full: true }]; ES.ui.drawer.open({ title: 'Request attendee data export', body: ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Send for approval</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('export request', () => { ES.biz.requestApproval({ eventId: ev.id, kind: 'data_export', title: 'Export attendee list: ' + v.why.slice(0, 60), detail: v.why, payload: { scope: 'attendees' } }); DB().notify('role:owner', 'Attendee data export needs approval', v.why.slice(0, 90), { link: '#/settings/approvals' }); }, 'Sent for approval'); ES.ui.drawer.close(); E.refreshAll(); }; } }); };
    if ($('#exGo')) $('#exGo').onclick = async () => { const all = DB().all("SELECT t.serial, tt.name type, t.holder_name, t.holder_phone, t.status FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.event_id=? AND t.status IN ('valid','used') AND t.rescue=0 ORDER BY t.id", [ev.id]); await E.act('attendee export', () => { ES.biz.consumeExport(ev.id); DB().log('attendee data exported', 'events', ev.id, F.num(all.length) + ' rows'); }, 'Approval used. Downloading.'); ES.exp.download('xlsx', 'attendees-' + ev.name.replace(/\W+/g, '-'), ['Serial', 'Type', 'Name', 'Phone', 'Status'], all.map((r) => [r.serial, r.type, r.holder_name, r.holder_phone, r.status]), { title: 'Attendee list: ' + ev.name }); E.refreshAll(); };
    const rows = DB().all("SELECT t.*, tt.name type FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.event_id=? ORDER BY t.id DESC LIMIT 6000", [ev.id]);
    ES.ui.dataTable($('#tk'), { rows, pageSize: 20, exportName: 'tickets', searchKeys: ['serial', 'holder_name', 'holder_phone', 'type'], filters: [{ key: 'status', label: 'Status', options: Object.entries(ST_TAG).map(([k, v]) => [k, v[0]]) }, { key: 'type', label: 'Type', options: DB().all('SELECT name FROM ticket_types WHERE event_id=?', [ev.id]).map((t) => [t.name, t.name]) }], columns: [
      { key: 'serial', label: 'Serial' }, { key: 'type', label: 'Type' }, { key: 'holder_name', label: 'Holder', render: (r) => esc(r.holder_name || '—') }, { key: 'holder_phone', label: 'Phone', render: (r) => esc(can('data.export') ? r.holder_phone || '' : F.mask(r.holder_phone || '')), value: (r) => F.mask(r.holder_phone || '') },
      { key: 'generation', label: 'Gen.', num: true }, { key: 'status', label: 'Status', render: (r) => tag(...(ST_TAG[r.status] || [r.status])) }, { key: 'used_at', label: 'Entered', render: (r) => (r.used_at ? F.stamp(r.used_at) : '') }], onRow: ticketDrawer });
    if (can('data.export')) $$('.tbl-toolbar', el)[0].insertAdjacentHTML('beforeend', '');
  }
  function ticketDrawer(t) {
    const hist = DB().all('SELECT s.*, g.name gate FROM scans s LEFT JOIN gates g ON g.id=s.gate_id WHERE s.serial=? ORDER BY s.at', [t.serial]); const tr = DB().all('SELECT * FROM transfers WHERE ticket_id=? OR new_ticket_id=? ORDER BY id', [t.id, t.id]);
    ES.ui.drawer.open({ title: t.serial, body: `<div class="kv"><span>Type</span><span>${esc(t.type)}</span><span>Holder</span><span>${esc(t.holder_name || '—')}</span><span>Phone</span><span>${esc(can('data.export') ? t.holder_phone || '' : F.mask(t.holder_phone || ''))}</span><span>Status</span><span>${tag(...(ST_TAG[t.status] || [t.status]))}</span><span>Generation</span><span>${t.generation}${t.transferred_from ? ' (transferred)' : ''}</span><span>Price</span><span>${F.rp(t.price)}</span></div>
      <div class="section-t" style="margin:16px 0 6px">Transfers</div>${tr.map((x) => `<div class="list"><div class="it"><span>${esc(x.from_name)} → ${esc(x.to_name)}</span><span class="spacer"></span><span class="muted">${F.stamp(x.created_at)} · ${F.rp(x.fee)}</span></div></div>`).join('') || '<div class="muted">None</div>'}
      <div class="section-t" style="margin:16px 0 6px">Scan history</div>${hist.map((x) => `<div class="list"><div class="it"><b>${esc(x.result)}</b><span>${esc(x.gate || '')}</span><span class="spacer"></span><span class="muted">${F.stamp(x.at)}</span></div></div>`).join('') || '<div class="muted">Never scanned</div>'}` });
  }

  // ---------- transfers ----------
  function transfers(el, ev) {
    const rows = DB().all('SELECT x.*, t.serial, n.serial new_serial FROM transfers x JOIN tickets t ON t.id=x.ticket_id LEFT JOIN tickets n ON n.id=x.new_ticket_id WHERE x.event_id=? ORDER BY x.id DESC', [ev.id]);
    const fees = rows.reduce((a, r) => a + r.fee, 0);
    el.innerHTML = `<div class="notice" style="margin-bottom:14px">An official transfer cancels the old code and issues a new one to the new holder. The seller pays a flat ${F.rp(ES.cfg.get('transfer.fee', E.ctx()))} and the resale price is capped at ${ES.cfg.get('resale.cap_pct', E.ctx())}% of face value. A screenshot of the old code stops working at once. Fees collected: <b>${F.rp(fees)}</b>.</div><div class="card"><div id="tr"></div></div>`;
    ES.ui.dataTable($('#tr'), { rows, exportName: 'transfers', searchKeys: ['serial', 'new_serial', 'from_name', 'to_name'], columns: [{ key: 'created_at', label: 'Date', render: (r) => F.stamp(r.created_at) }, { key: 'serial', label: 'Old ticket' }, { key: 'new_serial', label: 'New ticket' },
      { key: 'from_name', label: 'From' }, { key: 'to_name', label: 'To' }, { key: 'kind', label: 'Kind' }, { key: 'fee', label: 'Fee', num: true, render: (r) => F.rp(r.fee) }] });
  }

  // ---------- rules (config) ----------
  function rules(el, ev) {
    const groups = {}; Object.entries(ES.cfg.REG).forEach(([k, r]) => { if (['Ticket rules', 'Fair sales', 'Anti-calo', 'Gate'].includes(r.group)) (groups[r.group] = groups[r.group] || []).push(k); });
    ES.settingsUI.configEditor(el, { groups, ev, title: 'Ticket rules for ' + ev.name, level: 'event', note: 'Rules here apply to this event. Anything set by the platform is locked. Changes to the rules marked "needs a second person" after sales open wait for another person to approve.' });
  }

  E.register('ticketing', { label: 'Ticketing', icon: 'tix', section: 'Sell', perm: 'ticketing', render, keywords: 'tickets orders lottery waves transfers qr' });
})();
