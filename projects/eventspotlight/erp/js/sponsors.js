/* Sponsors: pipeline board (drag between stages), deal detail with documents and next step, packages, booth assignment. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const STAGES = [['lead', 'Lead'], ['proposal', 'Proposal sent'], ['negotiating', 'Negotiating'], ['signed', 'Signed'], ['lost', 'Lost']];
  const TABS = [['pipeline', 'Pipeline'], ['packages', 'Packages'], ['booths', 'Booths']];

  function render(el, param) {
    const [a, id] = (param || 'pipeline').split('/'); const tab = TABS.find((t) => t[0] === a) ? a : 'pipeline'; const ev = E.ev();
    if (!ev) { el.innerHTML = E.pageHead('Sponsors') + ES.ui.empty('No event yet'); return; }
    const deals = DB().all('SELECT * FROM sponsor_deals WHERE event_id=?', [ev.id]); const signed = deals.filter((d) => d.stage === 'signed').reduce((s, d) => s + d.value, 0), pipe = deals.filter((d) => !['signed', 'lost'].includes(d.stage)).reduce((s, d) => s + d.value, 0);
    el.innerHTML = E.pageHead('Sponsors', `${F.rp(signed)} signed · ${F.rp(pipe)} in the pipeline`, can('sponsors') ? '<button class="btn primary" id="newDeal">Add sponsor lead</button>' : '') + '<div class="tabs" id="st"></div><div id="sb"></div>';
    ES.ui.tabs($('#st'), TABS.map((t) => ({ id: t[0], label: t[1] })), tab, (t) => (location.hash = '#/sponsors/' + t));
    ({ pipeline, packages, booths })[tab]($('#sb'), ev, deals);
    if ($('#newDeal')) $('#newDeal').onclick = () => dealForm(ev, null);
    if (/^\d+$/.test(a)) dealDrawer(Number(a));
  }

  function pipeline(el, ev, deals) {
    const owners = Object.fromEntries(DB().all('SELECT id,short FROM users').map((u) => [u.id, u.short]));
    el.innerHTML = `<div class="kanban" style="grid-template-columns:repeat(5,minmax(220px,1fr))">${STAGES.map(([k, l]) => { const ds = deals.filter((d) => d.stage === k); return `<div class="kcol" data-stage="${k}"><h4>${l}<span>${ds.length}</span></h4><div class="muted" style="margin:-4px 4px 8px">${F.rpShort(ds.reduce((s, d) => s + d.value, 0))}</div>${ds.map((d) => `<div class="kcard" draggable="${can('sponsors') && k !== 'signed'}" data-id="${d.id}" style="border-left-color:${k === 'signed' ? 'var(--green)' : k === 'lost' ? 'var(--red)' : 'var(--blue)'}"><b>${esc(d.company)}</b><div class="muted">${esc(d.category || '')} · ${F.rp(d.value)}</div>${d.next_step ? `<div style="margin-top:6px;font-size:14px">${esc(d.next_step)} ${d.next_step_date && k !== 'signed' ? ES.ui.dueTag(d.next_step_date) : ''}</div>` : ''}<div class="row" style="margin-top:6px"><span class="muted">${esc(owners[d.owner_id] || 'No owner')}</span><span class="spacer"></span>${d.booth_code ? tag('Booth ' + d.booth_code, 'g') : ''}</div></div>`).join('')}</div>`; }).join('')}</div>
      <div class="muted" style="margin-top:10px">Drag a card to change its stage. A deal becomes “Signed” only when its contract is made, so the documents always agree with the board.</div>`;
    $$('.kcard', el).forEach((c) => { c.onclick = () => dealDrawer(Number(c.dataset.id)); c.ondragstart = (e) => e.dataTransfer.setData('text/plain', c.dataset.id); });
    $$('.kcol', el).forEach((col) => { col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
      col.ondrop = (e) => { e.preventDefault(); col.classList.remove('over'); const id = Number(e.dataTransfer.getData('text/plain')); const st = col.dataset.stage; if (st === 'signed') return toast('Make the contract from the deal to sign it', 'err'); E.act('deal stage', () => { DB().update('sponsor_deals', id, { stage: st }); DB().log('deal moved', 'sponsor_deals', id, st); }); }; });
  }

  function dealForm(ev, d) {
    const pk = DB().all('SELECT * FROM sponsor_packages WHERE event_id=? ORDER BY sort', [ev.id]); const us = DB().all("SELECT id,name FROM users WHERE active=1 AND role IN ('owner','director','partnerships','producer')");
    const f = [{ name: 'company', label: 'Company', required: true, full: true }, { name: 'category', label: 'Industry' }, { name: 'package_id', label: 'Package', type: 'select', placeholder: 'Not chosen yet', options: pk.map((p) => [p.id, p.name + ' · ' + F.rp(p.price)]) }, { name: 'value', label: 'Deal value (Rp)', type: 'money' },
      { name: 'owner_id', label: 'Owner', type: 'select', placeholder: 'Choose', options: us.map((u) => [u.id, u.name]) }, { name: 'contact_name', label: 'Contact person' }, { name: 'contact_email', label: 'Contact email', type: 'email' }, { name: 'contact_phone', label: 'Contact phone' },
      { name: 'next_step', label: 'Next step', full: true }, { name: 'next_step_date', label: 'Next step date', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }];
    ES.ui.drawer.open({ title: d ? d.company : 'Add sponsor lead', wide: true, body: ES.ui.formHTML(f, d || {}), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, dr) => { ES.ui.bindMoney(b);
      const ps = b.querySelector('[name=package_id]'); ps.onchange = () => { const p = pk.find((x) => x.id === Number(ps.value)); if (p) b.querySelector('[name=value]').value = F.num(p.price); };
      dr.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      dr.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; const rec = Object.assign({}, v, { package_id: v.package_id ? Number(v.package_id) : null, owner_id: v.owner_id ? Number(v.owner_id) : null, value: v.value || 0, next_step_date: v.next_step_date || null });
        const id = await E.act('sponsor deal', () => { if (d) { DB().update('sponsor_deals', d.id, rec); DB().log('deal edited', 'sponsor_deals', d.id, v.company); return d.id; } const nid = DB().insert('sponsor_deals', Object.assign(rec, { event_id: ev.id, stage: 'lead', created_at: F.nowStamp() })); DB().log('deal added', 'sponsor_deals', nid, v.company); return nid; }, 'Saved'); ES.ui.drawer.close(); if (id && !d) dealDrawer(id); }; } });
  }

  function dealDrawer(id) {
    const d = DB().get('SELECT s.*, p.name pkg, u.name owner FROM sponsor_deals s LEFT JOIN sponsor_packages p ON p.id=s.package_id LEFT JOIN users u ON u.id=s.owner_id WHERE s.id=?', [id]); if (!d) return;
    const docs = DB().all('SELECT * FROM documents WHERE deal_id=? ORDER BY id', [id]); const props = DB().all("SELECT * FROM proposals WHERE type='sponsor' AND recipient_ref=? ORDER BY id DESC", [id]);
    const booth = DB().get('SELECT * FROM booth_devices WHERE deal_id=?', [id]); const counts = DB().get('SELECT COALESCE(SUM(in_count),0) n FROM booth_counts WHERE deal_id=?', [id]);
    const act = [];
    if (can('proposals') && d.stage !== 'signed') act.push('<button class="btn primary" data-a="proposal">Write a proposal</button>');
    if (can('accounting') && d.stage !== 'signed' && !docs.some((x) => x.type === 'quotation')) act.push('<button class="btn" data-a="quote">Make a quotation</button>');
    if (can('sponsors')) act.push('<button class="btn" data-a="edit">Edit</button>');
    if (can('sponsors') && !['signed', 'lost'].includes(d.stage)) act.push('<button class="btn" data-a="lost">Mark lost</button>');
    ES.ui.drawer.open({ title: d.company, wide: true, body: `<div class="kv"><span>Stage</span><span>${tag(d.stage, d.stage === 'signed' ? 'g' : d.stage === 'lost' ? 'r' : 'b')}</span><span>Package</span><span>${esc(d.pkg || 'Not chosen')}</span><span>Value</span><span><b>${F.rp(d.value)}</b></span><span>Owner</span><span>${esc(d.owner || 'None')}</span><span>Contact</span><span>${esc(d.contact_name || '')} ${d.contact_email ? '· ' + esc(d.contact_email) : ''} ${d.contact_phone ? '· ' + esc(d.contact_phone) : ''}</span><span>Next step</span><span>${esc(d.next_step || '—')} ${d.next_step_date ? ES.ui.dueTag(d.next_step_date) : ''}</span>${d.signed_at ? `<span>Signed</span><span>${F.stamp(d.signed_at)}</span>` : ''}${d.booth_code ? `<span>Booth</span><span>${esc(d.booth_code)}${counts.n ? ' · ' + F.num(counts.n) + ' visitors counted' : ''}</span>` : ''}</div>
      ${d.notes ? `<div class="notice" style="margin-top:12px">${esc(d.notes)}</div>` : ''}
      <div class="section-t" style="margin:18px 0 6px">Proposals</div>${props.map((p) => `<div class="list"><div class="it"><a href="#/proposals/${p.id}"><b>${esc(p.doc_no)} v${p.version}</b></a><span>${esc(p.title)}</span><span class="spacer"></span>${tag(p.status, p.status === 'accepted' ? 'g' : p.status === 'viewed' ? 'b' : '')}<span class="muted">${p.views ? p.views + ' views' : ''}</span></div></div>`).join('') || '<div class="muted">None yet</div>'}
      <div class="section-t" style="margin:18px 0 6px">Documents</div>${docs.map((x) => `<div class="list"><div class="it"><a href="#/accounting/doc/${x.id}"><b>${esc(x.no)}</b></a><span>${esc(x.type)}</span><span class="spacer"></span><span>${F.rp(x.total)}</span>${tag(x.status, x.status === 'paid' || x.status === 'accepted' ? 'g' : '')}</div></div>`).join('') || '<div class="muted">None yet</div>'}`, footer: act.join(''),
      onMount: (b, dr) => $$('[data-a]', dr).forEach((x) => (x.onclick = async () => { const a = x.dataset.a; if (a === 'edit') dealForm(E.ev(), d);
        else if (a === 'proposal') { const pid = await E.act('proposal', () => ES.biz.createProposal({ eventId: d.event_id, type: 'sponsor', title: (d.pkg || 'Sponsorship') + ' sponsorship for ' + d.company, recipient: d.company, recipient_ref: d.id, data: { packageId: d.package_id, price: d.value, sections: { cover: 1, audience: 1, package: 1, booth: 1, numbers: 1, terms: 1 } } }).id); ES.ui.drawer.close(); if (pid) location.hash = '#/proposals/' + pid; }
        else if (a === 'quote') { const q = await E.act('quotation', () => ES.biz.quotationFor(d), 'Quotation created'); ES.ui.drawer.close(); if (q) location.hash = '#/accounting/doc/' + q.id; }
        else if (a === 'lost') { if (!(await ES.ui.confirm('Mark ' + d.company + ' as lost?', 'It leaves the pipeline total. You can move it back later.', { ok: 'Mark lost' }))) return; E.act('deal lost', () => DB().update('sponsor_deals', d.id, { stage: 'lost' }), 'Marked lost'); ES.ui.drawer.close(); } })) });
    void booth;
  }

  function packages(el, ev) {
    const pk = DB().all('SELECT * FROM sponsor_packages WHERE event_id=? ORDER BY sort', [ev.id]);
    el.innerHTML = `<div class="grid g4">${pk.map((p) => { const used = DB().val("SELECT COUNT(*) FROM sponsor_deals WHERE package_id=? AND stage='signed'", [p.id]); return `<div class="card"><div class="card-h"><h3>${esc(p.name)}</h3></div><div class="kpi"><div class="n">${F.rpShort(p.price)}</div><div class="d">${used} of ${p.slots} slots signed</div></div><div class="bar" style="margin:8px 0"><i style="width:${p.slots ? used / p.slots * 100 : 0}%"></i></div><ul style="padding-left:18px">${(p.benefits || '').split('|').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${can('sponsors') ? `<button class="btn sm" style="margin-top:10px" data-p="${p.id}">Edit</button>` : ''}</div>`; }).join('')}</div>${can('sponsors') ? '<button class="btn" style="margin-top:14px" id="addPk">Add a package</button>' : ''}`;
    const form = (p) => { const f = [{ name: 'name', label: 'Name', required: true }, { name: 'price', label: 'Price (Rp)', type: 'money', required: true }, { name: 'slots', label: 'Slots', type: 'number', min: 1 }, { name: 'benefits', label: 'Benefits (one per line)', type: 'textarea', full: true, rows: 6 }];
      ES.ui.drawer.open({ title: p ? p.name : 'New package', body: ES.ui.formHTML(f, p ? Object.assign({}, p, { benefits: (p.benefits || '').split('|').join('\n') }) : { slots: 4 }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, d) => { ES.ui.bindMoney(b); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
        d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; const rec = { name: v.name, price: v.price, slots: v.slots || 1, benefits: v.benefits.split('\n').map((x) => x.trim()).filter(Boolean).join('|') }; await E.act('package', () => { if (p) DB().update('sponsor_packages', p.id, rec); else DB().insert('sponsor_packages', Object.assign(rec, { event_id: ev.id, sort: 9 })); }, 'Saved'); ES.ui.drawer.close(); }; } }); };
    $$('[data-p]', el).forEach((b) => (b.onclick = () => form(pk.find((x) => x.id === Number(b.dataset.p))))); if ($('#addPk')) $('#addPk').onclick = () => form(null);
  }

  function booths(el, ev, deals) {
    const signed = deals.filter((d) => d.stage === 'signed'); const items = DB().all("SELECT * FROM layout_items WHERE event_id=? AND kind='booth'", [ev.id]);
    el.innerHTML = `<div class="notice" style="margin-bottom:12px">Signed sponsors get a booth code. Place booths on the <a href="#/layout">layout</a>. The booth counter app counts visitors with a camera and the numbers go into the sponsor’s report with a stated margin of error.</div><div class="card"><div id="bt"></div></div>`;
    const rows = signed.map((d) => { const dev = DB().get('SELECT * FROM booth_devices WHERE deal_id=?', [d.id]); const n = DB().val('SELECT COALESCE(SUM(in_count),0) FROM booth_counts WHERE deal_id=?', [d.id]) || 0; return Object.assign({}, d, { dev, n, placed: items.some((i) => i.ref_id === d.id) }); });
    ES.ui.dataTable($('#bt'), { rows, noSearch: true, columns: [{ key: 'booth_code', label: 'Booth', render: (r) => `<b>${esc(r.booth_code || '—')}</b>` }, { key: 'company', label: 'Sponsor' }, { key: 'pkg', label: 'Package', render: (r) => esc((DB().get('SELECT name FROM sponsor_packages WHERE id=?', [r.package_id]) || {}).name || '') }, { key: 'placed', label: 'On layout', render: (r) => (r.placed ? tag('Placed', 'g') : tag('Not placed', 'a')) },
      { key: 'dev', label: 'Counter', render: (r) => (r.dev ? tag(r.dev.calibrated ? 'Calibrated' : 'Set up', r.dev.calibrated ? 'g' : 'a') : tag('No device')), value: (r) => (r.dev ? 'Set up' : 'No device') }, { key: 'n', label: 'Visitors counted', num: true, render: (r) => F.num(r.n) }], onRow: (r) => dealDrawer(r.id) });
  }

  E.register('sponsors', { label: 'Sponsors', icon: 'spon', section: 'Partners', perm: 'sponsors', render, keywords: 'sponsor pipeline packages booths deals' });
})();
