/* Event Spotlight partner portal: sponsors, vendors and artist teams. Email code login. Public proposal links: #/p/TOKEN */
(function () {
  const ES = window.ES, F = ES.fmt, DB = () => ES.db, { $, $$, esc, toast } = ES.ui;
  const SS = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  let tab = 'overview';
  const me = () => { const id = Number(SS.get('es-partner-id')); return id ? DB().get('SELECT * FROM partner_accounts WHERE id=? AND active=1', [id]) : null; };
  const KIND = { sponsor: 'Sponsor', vendor: 'Vendor', artist: 'Artist team' };

  async function boot() {
    document.body.innerHTML = '<div class="screen"><div class="box" style="text-align:center"><div class="logo">Event Spotlight</div><div class="strip logo-s"></div><p class="muted"><span class="spin"></span> Loading…</p></div></div>';
    try { await ES.db.init('partner'); } catch (e) { document.body.innerHTML = `<div class="screen"><div class="card"><h2>The portal could not start</h2><p class="muted">${esc(e.message)}</p></div></div>`; return; }
    ES.db.onChange((m) => { if (m && !m.remote) return; const a = document.activeElement; if (location.hash.startsWith('#/p/') || (a && a.matches('input,textarea,select')) || ES.ui.drawer.isOpen() || document.querySelector('.docview.open')) return; route(); });
    window.addEventListener('hashchange', route); route();
  }
  function route() {
    if (ES.db.state !== 'ready') { document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:480px;text-align:center"><div class="logo" style="font-size:32px">Partner portal</div><div class="strip logo-s"></div><p class="muted" style="margin:10px 0">No database in this browser yet. Open erp/index.html in this same browser, create or load a database, then come back.</p><button class="btn primary" onclick="location.reload()">Check again</button></div></div>`; return; }
    const m = /^#\/p\/(\w+)/.exec(location.hash); if (m) return proposalPage(m[1]);
    const a = me(); if (!a) return login(); shell(a);
  }

  // ---------- login ----------
  function login() {
    const f = [{ name: 'email', label: 'Work email', required: true, placeholder: 'you@company.example', full: true }];
    document.body.innerHTML = `<div class="screen"><div class="box" style="max-width:460px"><div class="logo" style="font-size:36px">Partner portal</div><div class="strip logo-s"></div><p class="muted" style="text-align:center">Sponsors, vendors and artist teams. We email you a 6-digit code.</p><div class="card" style="margin-top:14px"><div id="lf">${ES.ui.formHTML(f)}</div><button class="btn primary" id="go" style="margin-top:12px;min-height:52px;width:100%">Send code</button><div id="s2" style="display:none"><label class="field" style="margin-top:14px"><span>Code</span><input class="input" id="otp" inputmode="numeric" maxlength="6" style="min-height:52px;font-size:22px;letter-spacing:.3em"></label><button class="btn go" id="vf" style="margin-top:10px;min-height:52px;width:100%">Sign in</button></div><div class="demo" id="demo" style="display:none;background:var(--yellow-soft);border:1px dashed var(--line);padding:10px;margin-top:12px;font-size:14px"></div></div></div></div>`;
    let acc = null;
    $('#go').onclick = async () => { const v = ES.ui.validate($('#lf'), f); if (!v) return; acc = DB().get('SELECT * FROM partner_accounts WHERE lower(email)=lower(?) AND active=1', [v.email.trim()]); if (!acc) return toast('This email is not registered for the event. Ask your contact at the organiser.', 'err');
      await ES.db.write('partner code', () => ES.auth.issueCode('partner', acc.id, acc.email, acc.name, 'Your partner portal code', 'Use this code to sign in to the partner portal.')); $('#s2').style.display = ''; $('#otp').focus();
      const last = DB().get("SELECT body FROM outbox WHERE kind='login-code' AND to_email=? ORDER BY id DESC", [acc.email]); const m = last && /code: (\d{6})/.exec(last.body); const d = $('#demo'); d.style.display = ''; d.innerHTML = '<b>Demo only.</b> In production the code arrives by email. Here it is in the ERP “Outbox”' + (m ? ': <b>' + m[1] + '</b> <button class="btn sm" id="fill">Fill it in</button>' : '.'); if ($('#fill')) $('#fill').onclick = () => ($('#otp').value = m[1]); };
    $('#vf').onclick = async () => { const r = acc && ES.auth.verifyCode('partner', acc.id, $('#otp').value); if (!r) return toast('That code is wrong or expired', 'err'); await ES.db.write('code used', () => DB().run('UPDATE login_codes SET used=1 WHERE id=?', [r.id])); SS.set('es-partner-id', String(acc.id)); tab = 'overview'; route(); };
  }

  // ---------- shell ----------
  const unread = (a) => DB().val("SELECT COUNT(*) FROM messages WHERE partner_id=? AND from_kind='eo' AND read=0", [a.id]) || 0;
  function tabsFor(a) { const base = a.kind === 'sponsor' ? [['overview', 'Overview'], ['proposals', 'Proposals'], ['docs', 'Documents']] : a.kind === 'vendor' ? [['overview', 'Overview'], ['orders', 'Orders and invoices'], ['rfq', 'Requests for quotation']] : [['overview', 'Overview'], ['requests', 'Special requests']]; return base.concat([['messages', 'Messages']]); }
  function shell(a) {
    const tabs = tabsFor(a); if (!tabs.some((t) => t[0] === tab)) tab = 'overview'; const u = unread(a);
    document.body.innerHTML = `<header class="sh-top"><div class="in"><a class="brand" href="#/">Event Spotlight</a><span class="who">${esc(a.name)} · ${KIND[a.kind]}</span><span style="flex:1"></span><button class="btn sm" id="out" style="background:transparent;color:#fff;border-color:#8896B8">Sign out</button></div></header><main class="sh-wrap"><div class="ptabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}${k === 'messages' && u ? ` (${u})` : ''}</button>`).join('')}</div><div id="pv"></div></main>`;
    $('#out').onclick = () => { SS.set('es-partner-id', null); route(); }; $$('.ptabs [data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; shell(a); }));
    ({ overview, proposals, docs, orders, rfq, requests, messages }[tab])($('#pv'), a);
  }
  const ev = (a) => DB().get('SELECT * FROM events WHERE id=?', [a.event_id]) || DB().get('SELECT * FROM events ORDER BY date DESC LIMIT 1');
  const tag = (t, c) => `<span class="tag ${c || ''}">${esc(t)}</span>`;

  // ---------- overview ----------
  function overview(el, a) {
    const e = ev(a); let cards = '', body = '';
    if (a.kind === 'sponsor') { const d = DB().get('SELECT d.*, p.name pname, p.benefits FROM sponsor_deals d LEFT JOIN sponsor_packages p ON p.id=d.package_id WHERE d.id=?', [a.ref_id]); if (d) { const inv = DB().all("SELECT * FROM documents WHERE deal_id=? AND type='invoice'", [d.id]); const due = inv.reduce((s, x) => s + x.total - x.paid, 0);
      cards = `<div class="card"><div class="l">Package</div><div class="v">${esc(d.pname || 'Not chosen yet')}</div></div><div class="card"><div class="l">Stage</div><div class="v">${esc(d.stage)}</div></div><div class="card"><div class="l">Booth</div><div class="v">${esc(d.booth_code || 'Not assigned')}</div></div><div class="card"><div class="l">Open balance</div><div class="v">${F.rp(due)}</div></div>`;
      body = d.benefits ? `<h3 style="margin-top:18px">What you receive</h3><div class="card">${String(d.benefits).split('|').filter(Boolean).map((b) => `<div class="prow">${esc(b)}</div>`).join('')}</div>` : ''; } }
    if (a.kind === 'vendor') { const p = DB().all("SELECT * FROM purchase_orders WHERE vendor_id=? AND status!='draft' AND event_id=?", [a.ref_id, e.id]); const open = p.filter((x) => !x.paid_at); cards = `<div class="card"><div class="l">Orders</div><div class="v">${p.length}</div></div><div class="card"><div class="l">Waiting for payment</div><div class="v">${F.rp(open.reduce((s, x) => s + (x.invoice_amount || x.amount), 0))}</div></div><div class="card"><div class="l">Paid</div><div class="v">${p.filter((x) => x.paid_at).length}</div></div>`; }
    if (a.kind === 'artist') { const ar = DB().get('SELECT * FROM artists WHERE id=?', [a.ref_id]); if (ar) cards = `<div class="card"><div class="l">Set time</div><div class="v">${esc(ar.set_time || 'To be confirmed')}</div></div><div class="card"><div class="l">Stage</div><div class="v">${esc(ar.stage)}</div></div><div class="card"><div class="l">Length</div><div class="v">${ar.set_minutes} min</div></div><div class="card"><div class="l">Status</div><div class="v">${esc(ar.status)}</div></div>`; }
    el.innerHTML = `<h2>${esc(e.name)}</h2><div class="muted" style="margin-bottom:12px">${F.date(e.date, 'long')} · doors ${esc(e.doors || '')} · ${esc(e.venue || '')}, ${esc(e.city || '')}</div><div class="kv">${cards}</div>${body}<div class="notice" style="margin-top:18px">Questions? Use <b>Messages</b>. Your contact at ${esc((DB().get('SELECT name FROM org WHERE id=1') || {}).name || 'the organiser')} sees them straight away.</div>`;
  }

  // ---------- sponsor: proposals and documents ----------
  function proposals(el, a) {
    const ps = DB().all("SELECT * FROM proposals WHERE type='sponsor' AND recipient_ref=? AND status!='draft' ORDER BY id DESC", [a.ref_id]);
    el.innerHTML = `<h2>Proposals</h2>${ps.map((p) => `<div class="prow"><div class="nm"><b>${esc(p.title)}</b><div class="muted">${esc(p.doc_no)}${p.version > 1 ? ' v' + p.version : ''} · sent ${esc(F.stamp(p.locked_at))}</div></div>${tag(p.status === 'accepted' ? 'Accepted' : 'Waiting for your decision', p.status === 'accepted' ? 'g' : 'a')}<a class="btn" href="#/p/${p.share_token}">Open</a></div>`).join('') || '<div class="muted">No proposals sent to you yet.</div>'}`;
  }
  function docs(el, a) {
    const ds = DB().all("SELECT * FROM documents WHERE deal_id=? AND type IN ('quotation','contract','invoice','receipt') ORDER BY id DESC", [a.ref_id]);
    el.innerHTML = `<h2>Documents</h2>${ds.map((d) => { const bal = d.total - d.paid; return `<div class="prow"><div class="nm"><b>${esc(d.type[0].toUpperCase() + d.type.slice(1))} ${esc(d.no)}</b><div class="muted">${F.date(d.issue_date)} · ${F.rp(d.total)}${d.type === 'invoice' ? ' · balance ' + F.rp(bal) + (d.due_date ? ' · due ' + F.date(d.due_date) : '') : ''}</div></div>${d.type === 'invoice' ? (bal <= 0 ? tag('Paid', 'g') : tag('Unpaid', 'a')) : ''}<button class="btn" data-v="${d.id}">View</button>${d.type === 'invoice' && bal > 0 ? `<button class="btn primary" data-p="${d.id}">I have paid</button>` : ''}</div>`; }).join('') || '<div class="muted">No documents yet. Accept a proposal to receive a quotation, contract and invoice.</div>'}`;
    $$('[data-v]', el).forEach((b) => (b.onclick = () => ES.docs.show(ES.docs.fromDocument(DB().get('SELECT * FROM documents WHERE id=?', [Number(b.dataset.v)])))));
    $$('[data-p]', el).forEach((b) => (b.onclick = () => { const d = DB().get('SELECT * FROM documents WHERE id=?', [Number(b.dataset.p)]); const f = [{ name: 'date', label: 'Date you paid', type: 'date', default: F.today() }, { name: 'ref', label: 'Transfer reference', help: 'The reference on your bank receipt helps finance match it.' }];
      ES.ui.drawer.open({ title: 'Tell us you paid ' + d.no, body: '<div class="notice" style="margin-bottom:10px">Finance checks the bank and records the payment. Your balance updates once they confirm.</div>' + ES.ui.formHTML(f, { date: F.today() }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Send</button>', onMount: (bb, dr) => { dr.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); dr.querySelector('[data-s]').onclick = async () => { const v = ES.ui.readForm(bb, f);
        await ES.db.write('payment notice', () => { DB().insert('messages', { partner_id: a.id, from_kind: 'partner', body: 'Payment notice for invoice ' + d.no + ' (' + F.rp(d.total - d.paid) + '): paid on ' + F.date(v.date) + (v.ref ? ', reference ' + v.ref : '') + '.', created_at: F.nowStamp(), read: 0 }); DB().notify('role:finance', a.name + ' says invoice ' + d.no + ' is paid', 'Check the bank and record the payment' + (v.ref ? ' · ref ' + v.ref : ''), { link: '#/accounting' }); }); ES.ui.drawer.close(); toast('Sent to finance', 'ok'); }; } }); }));
  }

  // ---------- public proposal page ----------
  function proposalPage(token) {
    const p = DB().get('SELECT * FROM proposals WHERE share_token=? AND status!=?', [token, 'draft']);
    if (!p) { document.body.innerHTML = '<div class="screen"><div class="card" style="max-width:480px"><h2>Link not recognised</h2><p class="muted">This proposal link is not valid. Ask the organiser to send it again.</p></div></div>'; return; }
    if (!sessionStorage.getItem('es-viewed-' + token)) { SS.set('es-viewed-' + token, '1'); ES.db.write('proposal viewed', () => ES.biz.markProposalViewed(token)); }
    const d = JSON.parse(p.data || '{}'); const org = DB().get('SELECT * FROM org WHERE id=1') || {}; const acc = p.type === 'sponsor' && p.status !== 'accepted' && p.recipient_ref;
    document.body.innerHTML = `<header class="sh-top"><div class="in"><a class="brand" href="#/">${esc(org.name || 'Event Spotlight')}</a><span class="who">${esc(p.title)}</span></div></header><main class="sh-wrap"><div class="row" style="gap:10px;flex-wrap:wrap"><div><h2>${esc(p.title)}</h2><div class="muted">For ${esc(p.recipient)} · ${esc(p.doc_no)}</div></div><span style="flex:1"></span>${p.status === 'accepted' ? tag('Accepted', 'g') : ''}${acc ? '<button class="btn go" id="acc" style="min-height:48px">Accept this proposal</button>' : ''}<button class="btn" id="pdf" style="min-height:48px">Download PDF</button></div><div id="pw" class="pv-wrap"></div></main>`;
    let pages = []; try { pages = ES.docs.build(ES.propDoc.model(p, d)); ES.paper.viewer($('#pw'), pages, { label: 'A4' }); } catch (e) { $('#pw').innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; }
    $('#pdf').onclick = () => ES.paper.toPdf(pages, p.doc_no);
    if ($('#acc')) $('#acc').onclick = () => { const f = [{ name: 'name', label: 'Your full name', required: true, full: true }]; ES.ui.drawer.open({ title: 'Accept this proposal', body: '<div class="notice" style="margin-bottom:10px">Accepting creates a quotation, a contract and the first invoice. You will find them in the partner portal.</div>' + ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn go" data-s>Accept</button>', onMount: (b, dr) => { dr.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); dr.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return;
      try { await ES.db.write('accept proposal', () => { const r = ES.biz.acceptSponsorProposal(p.id); DB().log('proposal accepted by partner', 'proposals', p.id, v.name + ' · ' + p.doc_no); return r; }); ES.ui.drawer.close(); toast('Accepted. Documents are ready in the portal.', 'ok'); proposalPage(token); } catch (e) { toast(e.message, 'err'); } }; } }); };
  }

  // ---------- vendor ----------
  function orders(el, a) {
    const e = ev(a); const ps = DB().all("SELECT * FROM purchase_orders WHERE vendor_id=? AND event_id=? AND status!='draft' ORDER BY id DESC", [a.ref_id, e.id]);
    const st = (p) => p.paid_at ? tag('Paid ' + F.date(p.paid_at.slice(0, 10)), 'g') : p.status === 'invoiced' ? tag('Invoice with finance', 'b') : p.delivered_at ? tag('Delivered. Send your invoice', 'a') : tag('Ordered', '');
    el.innerHTML = `<h2>Orders and invoices</h2>${ps.map((p) => `<div class="prow"><div class="nm"><b>${esc(p.no)}</b> ${esc(p.description)}<div class="muted">${F.rp(p.amount)}${p.due_date ? ' · deliver by ' + F.date(p.due_date) : ''}${p.invoice_no ? ' · your invoice ' + esc(p.invoice_no) + ' ' + F.rp(p.invoice_amount) : ''}</div></div>${st(p)}${p.status === 'ordered' ? `<button class="btn primary" data-i="${p.id}">Send invoice</button>` : ''}</div>`).join('') || '<div class="muted">No orders yet.</div>'}<div class="notice" style="margin-top:14px">Payment is released after our crew confirms delivery and the invoice matches the order.</div>`;
    $$('[data-i]', el).forEach((b) => (b.onclick = () => { const p = ps.find((x) => x.id === Number(b.dataset.i)); const f = [{ name: 'no', label: 'Your invoice number', required: true }, { name: 'amount', label: 'Invoice amount (Rp)', type: 'money', required: true, default: p.amount }, { name: 'date', label: 'Invoice date', type: 'date', default: F.today() }];
      ES.ui.drawer.open({ title: 'Send invoice for ' + p.no, body: ES.ui.formHTML(f, { amount: p.amount, date: F.today() }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Send invoice</button>', onMount: (bb, dr) => { ES.ui.bindMoney(bb); dr.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); dr.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(bb, f, (v, fail) => { if (v.amount <= 0) fail('amount', 'Enter the amount'); }); if (!v) return;
        await ES.db.write('vendor invoice', () => { ES.biz.recordVendorInvoice(p.id, { no: v.no, amount: v.amount, date: v.date }); DB().notify('role:finance', a.name + ' sent invoice ' + v.no, p.no + ' · ' + F.rp(v.amount) + (v.amount !== p.amount ? ' (order was ' + F.rp(p.amount) + ')' : ''), { link: '#/vendors' }); }); ES.ui.drawer.close(); toast('Invoice sent to finance', 'ok'); shell(a); }; } }); }));
  }
  function rfq(el, a) {
    const v = DB().get('SELECT name FROM vendors WHERE id=?', [a.ref_id]); const ps = DB().all("SELECT * FROM proposals WHERE type='rfq' AND status!='draft' AND lower(recipient)=lower(?) ORDER BY id DESC", [v ? v.name : '']);
    el.innerHTML = `<h2>Requests for quotation</h2>${ps.map((p) => `<div class="prow"><div class="nm"><b>${esc(p.title)}</b><div class="muted">${esc(p.doc_no)} · sent ${esc(F.stamp(p.locked_at))}</div></div><a class="btn" href="#/p/${p.share_token}">Open</a></div>`).join('') || '<div class="muted">No requests for quotation right now.</div>'}<div class="notice" style="margin-top:14px">Reply with your quote by message. Include price, delivery date and terms.</div>`;
  }

  // ---------- artist ----------
  function requests(el, a) {
    const rs = DB().all('SELECT * FROM artist_requests WHERE artist_id=? ORDER BY id DESC', [a.ref_id]); const ST = { requested: ['Received', ''], costed: ['Being reviewed', 'a'], approved: ['Approved', 'g'], confirmed: ['Confirmed', 'g'], declined: ['Declined', 'r'], rejected: ['Declined', 'r'] };
    el.innerHTML = `<div class="row"><h2>Special requests</h2><span class="spacer"></span><button class="btn primary" id="nr" style="min-height:48px">New request</button></div><div class="notice" style="margin:8px 0">Rider items, hospitality and travel. The organiser prices each item and tells you what is approved. Nothing is committed until you see “Confirmed”.</div>${rs.map((r) => { const s = ST[r.status] || [r.status, '']; return `<div class="prow"><div class="nm"><b>${esc(r.category)}</b> · ${esc(r.request)}${r.qty > 1 ? ' × ' + r.qty : ''}<div class="muted">${esc(F.stamp(r.created_at))}${r.note ? ' · ' + esc(r.note) : ''}</div></div>${tag(s[0], s[1])}</div>`; }).join('') || '<div class="muted">No requests yet.</div>'}`;
    $('#nr').onclick = () => { const f = [{ name: 'category', label: 'Category', type: 'select', options: ['Green room', 'Catering', 'Transport', 'Accommodation', 'Equipment', 'Security', 'Other'].map((x) => [x, x]) }, { name: 'request', label: 'What do you need?', type: 'textarea', required: true, full: true }, { name: 'qty', label: 'Quantity', type: 'number', min: 1, default: 1 }];
      ES.ui.drawer.open({ title: 'New special request', body: ES.ui.formHTML(f, { qty: 1 }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Send request</button>', onMount: (b, dr) => { dr.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); dr.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await ES.db.write('artist request', () => { ES.biz.addArtistRequest(a.ref_id, { category: v.category, request: v.request, qty: v.qty, by: a.name }); DB().notify('role:producer', 'New request from ' + a.name, v.category + ': ' + v.request.slice(0, 80), { link: '#/artists' }); }); ES.ui.drawer.close(); toast('Request sent', 'ok'); shell(a); }; } }); };
  }

  // ---------- messages ----------
  function messages(el, a) {
    const ms = DB().all('SELECT * FROM messages WHERE partner_id=? ORDER BY id', [a.id]);
    el.innerHTML = `<h2>Messages</h2><div id="th" style="margin:10px 0">${ms.map((m) => `<div class="msg ${m.from_kind === 'partner' ? 'me' : ''}">${esc(m.body)}<div class="t">${m.from_kind === 'partner' ? 'You' : 'Organiser'} · ${esc(F.stamp(m.created_at))}</div></div>`).join('') || '<div class="muted">No messages yet.</div>'}</div><div class="row" style="gap:8px;align-items:flex-end"><textarea class="input" id="mb" rows="2" placeholder="Write a message" style="flex:1"></textarea><button class="btn primary" id="ms" style="min-height:52px">Send</button></div>`;
    if (ms.some((m) => m.from_kind === 'eo' && !m.read)) ES.db.write('read', () => DB().run("UPDATE messages SET read=1 WHERE partner_id=? AND from_kind='eo'", [a.id]));
    $('#ms').onclick = async () => { const body = $('#mb').value.trim(); if (!body) return; await ES.db.write('message', () => { DB().insert('messages', { partner_id: a.id, from_kind: 'partner', body, created_at: F.nowStamp(), read: 0 }); DB().notify('role:partnerships', 'Message from ' + a.name, body.slice(0, 90), { link: '#/inbox' }); }); shell(a); };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
