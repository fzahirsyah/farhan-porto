/* Proposal generator: sponsor proposal, investor RAC (scenario model with break-even), vendor RFQ, promotor agreement.
   Live preview on real paper, PDF, tracked send (numbers lock), second-person approval for investor proposals, acceptance creates documents. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const TYPES = ES.biz.PROPOSAL_TYPES; const ST = { draft: ['Draft', ''], sent: ['Sent', 'b'], viewed: ['Opened', 'b'], accepted: ['Accepted', 'g'], superseded: ['Old version', ''] };

  function render(el, param) {
    const ev = E.ev(); if (!ev) { el.innerHTML = E.pageHead('Proposals') + ES.ui.empty('No event yet'); return; }
    if (param && /^\d+$/.test(param)) return editor(el, Number(param));
    const rows = DB().all('SELECT * FROM proposals WHERE event_id=? ORDER BY id DESC', [ev.id]); const pend = Object.fromEntries(DB().all("SELECT ref_id FROM approvals WHERE kind='proposal_send' AND status='pending'").map((a) => [a.ref_id, 1]));
    el.innerHTML = E.pageHead('Proposals', 'Sponsor, investor, vendor and promotor documents written from your real event numbers', can('proposals') ? '<button class="btn primary" id="newProp">New proposal</button>' : '') + '<div class="card"><div id="pl"></div></div>';
    ES.ui.dataTable($('#pl'), { rows, pageSize: 20, exportName: 'proposals', searchKeys: ['doc_no', 'title', 'recipient', 'type'], filters: [{ key: 'type', label: 'Type', options: Object.entries(TYPES) }, { key: 'status', label: 'Status', options: Object.entries(ST).map(([k, v]) => [k, v[0]]) }], columns: [{ key: 'doc_no', label: 'Number', render: (r) => `${esc(r.doc_no)} <span class="muted">v${r.version}</span>` }, { key: 'title', label: 'Title', render: (r) => `<b>${esc(r.title)}</b><div class="sub">${esc(TYPES[r.type])} · for ${esc(r.recipient || '')}</div>` },
      { key: 'status', label: 'Status', render: (r) => tag(...(ST[r.status] || [r.status])) + (pend[r.id] ? ' ' + tag('Waiting for approval', 'a') : '') }, { key: 'views', label: 'Opened', num: true, render: (r) => (r.views ? r.views + '×' : '') }, { key: 'last_viewed', label: 'Last opened', render: (r) => (r.last_viewed ? F.stamp(r.last_viewed) : '') }, { key: 'created_by', label: 'By' }], onRow: (r) => (location.hash = '#/proposals/' + r.id) });
    if ($('#newProp')) $('#newProp').onclick = () => newForm(ev);
  }
  function newForm(ev) {
    const deals = DB().all("SELECT id,company FROM sponsor_deals WHERE event_id=? AND stage NOT IN ('signed','lost')", [ev.id]); const pk = DB().all('SELECT * FROM sponsor_packages WHERE event_id=? ORDER BY sort', [ev.id]); const pr = DB().all('SELECT id,name FROM promotors WHERE event_id=?', [ev.id]);
    const f = [{ name: 'type', label: 'What do you need?', type: 'select', options: Object.entries(TYPES), full: true }, { name: 'deal', label: 'Sponsor lead', type: 'select', placeholder: 'Choose', options: deals.map((d) => [d.id, d.company]) }, { name: 'pkg', label: 'Package', type: 'select', options: pk.map((p) => [p.id, p.name + ' · ' + F.rp(p.price)]) }, { name: 'recipient', label: 'Recipient', full: true, placeholder: 'Company name' }];
    ES.ui.drawer.open({ title: 'New proposal', body: ES.ui.formHTML(f, { type: 'sponsor' }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Create draft</button>', onMount: (b, d) => {
      const sync = () => { const t = b.querySelector('[name=type]').value; b.querySelector('[data-f=deal]').style.display = b.querySelector('[data-f=pkg]').style.display = t === 'sponsor' ? '' : 'none'; }; b.querySelector('[name=type]').onchange = sync; sync();
      d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.readForm(b, f); let rec; const facts = ES.biz.eventFacts(ev.id);
        if (v.type === 'sponsor') { const deal = deals.find((x) => x.id === Number(v.deal)); const p = pk.find((x) => x.id === Number(v.pkg)) || pk[0]; const recipient = deal ? deal.company : v.recipient; if (!recipient) return toast('Choose a sponsor lead or type the recipient', 'err');
          rec = { type: 'sponsor', title: p.name + ' sponsorship for ' + recipient, recipient, recipient_ref: deal ? deal.id : null, data: { packageId: p.id, price: p.price, sections: { cover: 1, audience: 1, package: 1, booth: 1, numbers: 1, terms: 1 } } }; }
        else if (!v.recipient) return toast('Type the recipient', 'err');
        else if (v.type === 'rac') rec = { type: 'rac', title: 'Investor RAC: ' + ev.name, recipient: v.recipient, data: { assumptions: { sell: { low: 70, base: 85, high: 95 }, sponsorShare: { low: 0, base: 50, high: 100 }, investment: Math.round(facts.planned * 0.2 / 1e6) * 1e6, profitShare: 20 }, sections: { summary: 1, budget: 1, scenarios: 1, risks: 1 }, risks: 'Weather and venue changes\nArtist cancellation\nTicket demand below the low scenario\nSponsor payments arriving late' } };
        else if (v.type === 'rfq') rec = { type: 'rfq', title: 'RFQ: ', recipient: v.recipient, data: { category: 'Production', scope: '', deadline: F.addDays(F.today(), 10), items: '', criteria: 'Price, delivery date, references from similar events' } };
        else rec = { type: 'promotor', title: 'Promotor agreement: ' + v.recipient, recipient: v.recipient, data: { commission: 12000, quota: 1000, rules: 'Sell only through your own code\nNever sell above face value\nNever send screenshots of tickets\nBuyers receive tickets in their own wallet' } };
        const p = await E.act('proposal', () => ES.biz.createProposal(Object.assign({ eventId: ev.id }, rec)), 'Draft created'); ES.ui.drawer.close(); if (p) location.hash = '#/proposals/' + p.id; }; } });
  }

  // ---------- document models ----------
  const { model, factsFor, lines } = ES.propDoc;
  function fieldsFor(p, d) {
    const sec = (names) => names.map(([k, l]) => ({ name: 'sec_' + k, label: l, type: 'checkbox', default: 1 }));
    if (p.type === 'sponsor') { const pk = DB().all('SELECT * FROM sponsor_packages WHERE event_id=? ORDER BY sort', [p.event_id]); return [{ name: 'title', label: 'Title', required: true, full: true }, { name: 'packageId', label: 'Package', type: 'select', options: pk.map((x) => [x.id, x.name + ' · ' + F.rp(x.price)]) }, { name: 'price', label: 'Price (Rp)', type: 'money' }, { name: 'boothSize', label: 'Booth size', placeholder: '6 x 3 m' }, { name: 'intro', label: 'Opening note', type: 'textarea', full: true }, { name: 'paymentTerms', label: 'Payment terms', type: 'textarea', full: true, rows: 2 }, { name: 'extra', label: 'Anything else', type: 'textarea', full: true, rows: 2 }, { section: 'Sections' }].concat(sec([['cover', 'Cover'], ['audience', 'Audience'], ['package', 'Package'], ['booth', 'Booth'], ['numbers', 'Investment'], ['terms', 'How it works']])); }
    if (p.type === 'rac') return [{ name: 'title', label: 'Title', required: true, full: true }, { section: 'Sell-through scenarios (%)' }, { name: 'sell_low', label: 'Low', type: 'number', min: 0, max: 100 }, { name: 'sell_base', label: 'Base', type: 'number', min: 0, max: 100 }, { name: 'sell_high', label: 'High', type: 'number', min: 0, max: 100 }, { section: 'Share of the sponsor pipeline that closes (%)' }, { name: 'sp_low', label: 'Low', type: 'number', min: 0, max: 100 }, { name: 'sp_base', label: 'Base', type: 'number', min: 0, max: 100 }, { name: 'sp_high', label: 'High', type: 'number', min: 0, max: 100 }, { section: 'The ask' }, { name: 'investment', label: 'Investment sought (Rp)', type: 'money' }, { name: 'profitShare', label: 'Investor share of profit (%)', type: 'number', min: 0, max: 100 }, { name: 'risks', label: 'Risks (one per line)', type: 'textarea', full: true, rows: 4 }, { section: 'Sections' }].concat(sec([['summary', 'Summary'], ['budget', 'Budget'], ['scenarios', 'Scenarios'], ['risks', 'Risks']]));
    if (p.type === 'rfq') return [{ name: 'title', label: 'Title', required: true, full: true }, { name: 'category', label: 'Category', type: 'select', options: ES.ledger.CATEGORIES.map((c) => [c, c]) }, { name: 'deadline', label: 'Quote deadline', type: 'date' }, { name: 'scope', label: 'Scope of work', type: 'textarea', full: true, rows: 4 }, { name: 'items', label: 'Items (one per line, “item | qty”)', type: 'textarea', full: true, rows: 4 }, { name: 'criteria', label: 'How you will choose', type: 'textarea', full: true, rows: 2 }];
    return [{ name: 'title', label: 'Title', required: true, full: true }, { name: 'commission', label: 'Commission per scanned ticket (Rp)', type: 'money' }, { name: 'quota', label: 'Allocation (tickets)', type: 'number', min: 0 }, { name: 'rules', label: 'Rules (one per line)', type: 'textarea', full: true, rows: 5 }];
  }
  function toForm(p, d) {
    const v = Object.assign({ title: p.title }, d); (['cover', 'audience', 'package', 'booth', 'numbers', 'terms', 'summary', 'budget', 'scenarios', 'risks']).forEach((k) => (v['sec_' + k] = d.sections ? (d.sections[k] ? 1 : 0) : 1));
    if (d.assumptions) { const a = d.assumptions; ['low', 'base', 'high'].forEach((k) => { v['sell_' + k] = a.sell[k]; v['sp_' + k] = a.sponsorShare[k]; }); v.investment = a.investment; v.profitShare = a.profitShare; } return v;
  }
  function fromForm(p, d, fv) {
    const out = Object.assign({}, d); const keep = ['snapshot']; Object.keys(out).forEach((k) => { if (!keep.includes(k)) delete out[k]; });
    Object.entries(fv).forEach(([k, v]) => { if (!/^(sec_|sell_|sp_)/.test(k) && !['investment', 'profitShare', 'title'].includes(k)) out[k] = v; });
    if (p.type === 'sponsor') { out.packageId = Number(fv.packageId); out.price = fv.price || 0; }
    if (p.type === 'promotor') { out.commission = fv.commission || 0; out.quota = fv.quota || 0; }
    const sections = {}; Object.keys(fv).filter((k) => k.startsWith('sec_')).forEach((k) => (sections[k.slice(4)] = fv[k])); if (Object.keys(sections).length) out.sections = sections;
    if (p.type === 'rac') out.assumptions = { sell: { low: fv.sell_low, base: fv.sell_base, high: fv.sell_high }, sponsorShare: { low: fv.sp_low, base: fv.sp_base, high: fv.sp_high }, investment: fv.investment || 0, profitShare: fv.profitShare || 0 };
    return out;
  }
  function editor(el, id) {
    const p = DB().get('SELECT * FROM proposals WHERE id=?', [id]); if (!p) { el.innerHTML = ES.ui.empty('Proposal not found'); return; }
    const d = JSON.parse(p.data || '{}'); const locked = !!p.locked_at; const fields = fieldsFor(p, d); const pend = DB().get("SELECT * FROM approvals WHERE kind='proposal_send' AND ref_id=? AND status='pending'", [id]);
    const act = []; if (!locked && can('proposals')) act.push('<button class="btn" id="pSave">Save draft</button>');
    if (!locked && can('proposals.send') && !pend) act.push(p.type === 'rac' ? '<button class="btn primary" id="pSend">Ask for approval to send</button>' : '<button class="btn primary" id="pSend">Send</button>');
    if (locked && can('proposals')) act.push('<button class="btn" id="pVer">New version</button>');
    if (p.type === 'sponsor' && locked && p.status !== 'accepted' && p.status !== 'superseded' && can('accounting')) act.push('<button class="btn go" id="pAccept">Mark accepted</button>');
    el.innerHTML = E.pageHead(p.doc_no + ' v' + p.version, `${esc(TYPES[p.type])} for ${esc(p.recipient || '')} · ${tag(...(ST[p.status] || [p.status]))}${pend ? ' ' + tag('Waiting for approval', 'a') : ''}`, '<a class="btn" href="#/proposals">All proposals</a><button class="btn" id="pPdf">⬇ PDF</button>' + act.join('')) +
      `${locked ? `<div class="notice" style="margin-bottom:12px">Sent ${F.stamp(p.locked_at)}. The numbers in this version are locked at what the recipient saw${p.share_token ? ` · share link <code>share/${esc(p.share_token)}</code> · opened ${p.views} time${p.views === 1 ? '' : 's'}${p.last_viewed ? ', last ' + F.stamp(p.last_viewed) : ''}` : ''}. ${p.share_token && p.status === 'sent' ? '<button class="btn sm" id="pOpen">Simulate: recipient opens the link</button>' : ''}</div>` : ''}
      <div class="grid" style="grid-template-columns:minmax(300px,420px) 1fr;align-items:start"><div class="card" id="pForm">${ES.ui.formHTML(fields, toForm(p, d))}</div><div class="card" style="padding:8px"><div id="pView"></div></div></div>`;
    if (locked) $$('#pForm input,#pForm select,#pForm textarea').forEach((i) => (i.disabled = true));
    ES.ui.bindMoney($('#pForm'));
    let pages; let timer; const cur = () => { const fv = ES.ui.readForm($('#pForm'), fields); return { fv, data: fromForm(p, d, fv) }; };
    const draw = () => { const { fv, data } = cur(); const pp = Object.assign({}, p, { title: fv.title || p.title }); try { pages = ES.docs.build(model(pp, data)); ES.paper.viewer($('#pView'), pages, { label: 'A4 (210 × 297 mm)' }); } catch (e) { $('#pView').innerHTML = `<div class="notice">Preview failed: ${esc(e.message)}</div>`; } };
    draw(); $('#pForm').addEventListener('input', () => { ES.app.pageDirty = true; clearTimeout(timer); timer = setTimeout(draw, 300); });
    const save = async () => { const { fv, data } = cur(); const v = ES.ui.validate($('#pForm'), fields); if (!v) return false; const ok = await E.act('save proposal', () => ES.biz.saveProposal(id, data, fv.title), 'Saved'); ES.app.pageDirty = false; return ok !== undefined || true; };
    $('#pPdf').onclick = () => ES.paper.toPdf(pages, ES.exp.fileName(p.doc_no + ' ' + p.recipient, 'pdf'));
    if ($('#pSave')) $('#pSave').onclick = save;
    if ($('#pSend')) $('#pSend').onclick = async () => { if (!(await save())) return; const f = [{ name: 'email', label: 'Send to (email)', type: 'email', required: true, default: (p.recipient_ref && (DB().get('SELECT contact_email FROM sponsor_deals WHERE id=?', [p.recipient_ref]) || {}).contact_email) || '' }];
      ES.ui.drawer.open({ title: p.type === 'rac' ? 'Ask for approval to send' : 'Send proposal', body: `<div class="notice" style="margin-bottom:12px">${p.type === 'rac' ? 'Investor proposals need a second person to approve before they go out. ' : ''}Sending locks the numbers so the recipient and you always see the same figures. To change them later, make a new version.</div>` + ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>' + (p.type === 'rac' ? 'Request approval' : 'Send now') + '</button>', onMount: (b, dr) => { dr.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
        dr.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('send proposal', () => { if (p.type === 'rac') ES.biz.requestApproval({ eventId: p.event_id, kind: 'proposal_send', title: 'Send investor RAC proposal to ' + p.recipient, detail: 'Numbers lock when sent', ref_kind: 'proposal', ref_id: id, payload: { email: v.email } }); else ES.biz.sendProposal(id, v.email); }, p.type === 'rac' ? 'Sent for approval' : 'Sent. Numbers are locked.'); ES.ui.drawer.close(); }; } }); };
    if ($('#pVer')) $('#pVer').onclick = async () => { const nid = await E.act('new version', () => ES.biz.newProposalVersion(id), 'New version created'); if (nid) location.hash = '#/proposals/' + nid; };
    if ($('#pOpen')) $('#pOpen').onclick = () => E.act('proposal opened', () => ES.biz.markProposalViewed(p.share_token), 'Marked as opened');
    if ($('#pAccept')) $('#pAccept').onclick = async () => { if (!(await ES.ui.confirm('Mark as accepted?', 'This creates the quotation, the contract and the first invoice, and moves the sponsor to Signed.', { ok: 'Accept and create documents' }))) return; const r = await E.act('accept proposal', () => ES.biz.acceptSponsorProposal(id), 'Accepted'); if (r) { toast('Created ' + r.quotation.no + ', ' + r.contract.no + ', ' + r.invoice.no, 'ok'); location.hash = '#/accounting/doc/' + r.invoice.id; } };
  }

  E.register('proposals', { label: 'Proposals', icon: 'prop', section: 'Partners', perm: 'proposals', render, keywords: 'proposal generator sponsor investor rac rfq promotor agreement pdf', badge: () => DB().val("SELECT COUNT(*) FROM proposals WHERE status IN ('draft') AND event_id=?", [E.eventId()]) || 0 });
})();
