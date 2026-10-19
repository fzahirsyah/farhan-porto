/* Partner messages and portal access: one thread per partner account, plus invitations to the partner portal. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const KIND = { sponsor: 'Sponsor', vendor: 'Vendor', artist: 'Artist team' };
  let sel = 0;

  function render(el, param) {
    const ev = E.ev(); const accs = DB().all(`SELECT a.*, (SELECT COUNT(*) FROM messages m WHERE m.partner_id=a.id AND m.from_kind='partner' AND m.read=0) unread, (SELECT MAX(id) FROM messages m WHERE m.partner_id=a.id) last_id FROM partner_accounts a WHERE a.active=1 ORDER BY unread DESC, last_id DESC, a.name`);
    if (param && /^\d+$/.test(param)) sel = Number(param); if (!accs.some((a) => a.id === sel)) sel = accs[0] ? accs[0].id : 0; const cur = accs.find((a) => a.id === sel);
    el.innerHTML = E.pageHead('Partner messages', 'Sponsors, vendors and artist teams write to you from the partner portal', '<button class="btn primary" id="inv">Invite a partner</button>') +
      (accs.length ? `<div class="split" style="display:grid;grid-template-columns:300px 1fr;gap:14px"><div class="card" style="padding:0">${accs.map((a) => `<a href="#/inbox/${a.id}" style="display:block;padding:12px 14px;border-bottom:1px solid var(--line-2);text-decoration:none;color:inherit;${a.id === sel ? 'background:var(--blue-soft)' : ''}"><div class="row"><b>${esc(a.name)}</b><span class="spacer"></span>${a.unread ? `<span class="tag r">${a.unread}</span>` : ''}</div><div class="muted">${KIND[a.kind]} · ${esc(a.email)}</div></a>`).join('')}</div><div class="card" id="th"></div></div>` : ES.ui.empty('No partners have portal access yet', 'Invite a sponsor, vendor or artist team to give them a login.'));
    if (cur) thread(cur);
    $('#inv').onclick = () => invite(ev);
  }
  function thread(a) {
    const ms = DB().all('SELECT m.*, u.short ushort FROM messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.partner_id=? ORDER BY m.id', [a.id]);
    $('#th').innerHTML = `<div class="card-h"><h3>${esc(a.name)}</h3><span class="hint">${KIND[a.kind]} · ${esc(a.email)}</span></div><div style="min-height:200px;max-height:55vh;overflow:auto">${ms.map((m) => `<div style="max-width:80%;margin:8px 0;padding:10px 12px;border:1px solid ${m.from_kind === 'eo' ? 'var(--blue)' : 'var(--line)'};background:${m.from_kind === 'eo' ? 'var(--blue-soft)' : 'var(--panel)'};${m.from_kind === 'eo' ? 'margin-left:auto' : ''}">${esc(m.body)}<div class="muted" style="font-size:13px">${m.from_kind === 'eo' ? esc(m.ushort || 'Team') : esc(a.name)} · ${esc(F.stamp(m.created_at))}</div></div>`).join('') || '<div class="muted">No messages yet.</div>'}</div>
      <div class="row" style="gap:8px;margin-top:10px;align-items:flex-end"><textarea class="input" id="rb" rows="2" placeholder="Reply" style="flex:1"></textarea><button class="btn primary" id="rs">Send</button></div>`;
    if (ms.some((m) => m.from_kind === 'partner' && !m.read)) ES.db.write('read', () => DB().run("UPDATE messages SET read=1 WHERE partner_id=? AND from_kind='partner'", [a.id]));
    $('#rs').onclick = async () => { const body = $('#rb').value.trim(); if (!body) return; await E.act('reply', () => { DB().insert('messages', { partner_id: a.id, from_kind: 'eo', user_id: ES.session.id, body, created_at: F.nowStamp(), read: 0 }); DB().email(a.email, a.name, 'New message from the organiser', body + '\n\nReply in the partner portal.', 'message'); }, 'Sent'); E.refreshAll(); };
  }
  function invite(ev) {
    const deals = DB().all('SELECT id,company,contact_email FROM sponsor_deals WHERE event_id=? ORDER BY company', [ev.id]); const vs = DB().all("SELECT id,name,email FROM vendors WHERE status='active' ORDER BY name"); const as = DB().all('SELECT id,name,email FROM artists WHERE event_id=? ORDER BY name', [ev.id]);
    const opts = [['sponsor', deals.map((d) => [d.id, d.company, d.contact_email])], ['vendor', vs.map((d) => [d.id, d.name, d.email])], ['artist', as.map((d) => [d.id, d.name, d.email])]];
    const f = [{ name: 'kind', label: 'Who', type: 'select', options: Object.entries(KIND) }, { name: 'ref', label: 'Which one', type: 'select', options: [] }, { name: 'email', label: 'Their email', required: true, full: true, help: 'They sign in with a code sent to this address.' }];
    ES.ui.drawer.open({ title: 'Invite a partner', body: ES.ui.formHTML(f, { kind: 'sponsor' }), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Create access and send invitation</button>', onMount: (b, d) => {
      const fill = () => { const k = b.querySelector('[name=kind]').value; const o = opts.find((x) => x[0] === k)[1]; b.querySelector('[name=ref]').innerHTML = o.map((x) => `<option value="${x[0]}" data-e="${esc(x[2] || '')}">${esc(x[1])}</option>`).join(''); sync(); }; const sync = () => { const op = b.querySelector('[name=ref]').selectedOptions[0]; if (op) b.querySelector('[name=email]').value = op.dataset.e || ''; };
      b.querySelector('[name=kind]').onchange = fill; b.querySelector('[name=ref]').onchange = sync; fill(); d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
      d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f, (v, fail) => { if (!/^\S+@\S+\.\S+$/.test(v.email)) fail('email', 'Enter a valid email'); if (!v.ref) fail('ref', 'Nothing to choose'); if (DB().get('SELECT 1 FROM partner_accounts WHERE lower(email)=lower(?) AND active=1', [v.email])) fail('email', 'This email already has access'); }); if (!v) return;
        const name = opts.find((x) => x[0] === v.kind)[1].find((x) => String(x[0]) === String(v.ref))[1];
        await E.act('invite partner', () => { DB().insert('partner_accounts', { kind: v.kind, ref_id: Number(v.ref), name, email: v.email.trim(), event_id: ev.id, active: 1 }); DB().email(v.email.trim(), name, 'You are invited to the partner portal', 'Hello,\n\nOpen the partner portal and sign in with this email address. We send you a code each time.\n\nPortal: partner/index.html', 'invite'); DB().log('partner invited', 'partner_accounts', 0, name + ' · ' + v.email); }, 'Invitation sent'); ES.ui.drawer.close(); E.refreshAll(); }; } });
  }
  E.register('inbox', { label: 'Partner messages', icon: 'mail', section: 'Partners', perm: 'home', render, keywords: 'messages partner portal invite sponsor vendor artist', badge: () => DB().val("SELECT COUNT(*) FROM messages WHERE from_kind='partner' AND read=0") || 0 });
})();
