/* Settings: layered configuration editor (draft, publish, log, rollback), approvals, staff and roles, numbering, company, activity log, outbox, database tools. */
(function () {
  const ES = window.ES, E = ES.erp, F = ES.fmt, DB = () => ES.db, { $, $$, esc, tag, toast } = ES.ui;
  const can = (p) => ES.auth.can(p);
  const LV = () => ES.cfg.LEVEL_LABEL;

  // ---------- reusable configuration editor ----------
  /* o: {groups?:{name:[keys]}, ev, level:'eo'|'project'|'event'|'ticket_type', scopeId?, title, note} */
  function configEditor(el, o) {
    const ev = o.ev || E.ev() || {}; const level = o.level; const scope = level === 'event' ? ev.id || 0 : level === 'project' ? ev.project_id || 0 : level === 'ticket_type' ? o.scopeId : 0;
    const ctx = { eventId: ev.id, projectId: ev.project_id }; if (level === 'ticket_type') ctx.ticketTypeId = scope;
    const sold = ev.id ? DB().val('SELECT COUNT(*) FROM tickets WHERE event_id=?', [ev.id]) : 0;
    const groups = o.groups || (() => { const g = {}; Object.entries(ES.cfg.REG).forEach(([k, r]) => (g[r.group] = g[r.group] || []).push(k)); return g; })();
    const drafts = ES.cfg.drafts(); const canPub = can('ticketing.rules') || can('config.eo') || can('settings');
    const pend = DB().all("SELECT * FROM config WHERE status='pending'").length;
    const typeScopes = level === 'event' || level === 'ticket_type' ? DB().all('SELECT id,name FROM ticket_types WHERE event_id=?', [ev.id]) : [];
    el.innerHTML = `${o.note ? `<div class="notice" style="margin-bottom:12px">${esc(o.note)}</div>` : ''}
      <div class="card"><div class="card-h"><h3>${esc(o.title || 'Configuration')}</h3>${o.scopeSelect ? `<select class="input" id="cfgScope" style="width:auto;margin-left:12px">${o.scopeSelect.map(([v, l]) => `<option value="${v}" ${v === (o.scopeSel || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
        <span class="hint">${drafts.length ? `${drafts.length} unpublished change${drafts.length > 1 ? 's' : ''}` : 'Everything is published'}${pend ? ` · ${pend} waiting for a second person` : ''}</span></div>
        ${drafts.length && canPub ? `<div class="notice ok" style="margin-bottom:12px;background:var(--yellow-soft);border-color:var(--yellow)"><div class="row"><b>${drafts.length} change${drafts.length > 1 ? 's are' : ' is'} saved as a draft and not live yet.</b><span class="spacer"></span><button class="btn sm" id="cfgDiscardAll">Discard all</button><button class="btn primary sm" id="cfgPublish">Publish changes</button></div></div>` : ''}
        ${Object.entries(groups).map(([g, keys]) => `<div class="section-t" style="margin:14px 0 4px">${esc(g)}</div>${keys.map((k) => row(k)).join('')}`).join('')}</div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Change log</h3><span class="hint">every published change, with who and when. Roll back restores the previous value.</span></div><div id="cfgLog"></div></div>`;
    function row(k) {
      const r = ES.cfg.REG[k]; const res = ES.cfg.resolve(k, ctx, { draft: true }); const allowed = r.levels.includes(level);
      const lockedAbove = res.lockedBy && res.lockedBy !== level; const ro = !allowed || lockedAbove || !canPub;
      const mine = res.level === level && !res.draft; const val = res.value;
      let input;
      if (r.type === 'bool') input = `<select class="input" data-k="${k}" ${ro ? 'disabled' : ''}><option value="true" ${val ? 'selected' : ''}>On</option><option value="false" ${!val ? 'selected' : ''}>Off</option></select>`;
      else if (r.type === 'select') input = `<select class="input" data-k="${k}" ${ro ? 'disabled' : ''}>${r.options.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      else input = `<div class="row" style="gap:6px"><input class="input" data-k="${k}" value="${esc(r.type === 'money' ? F.num(val) : val)}" ${r.type === 'text' ? '' : 'inputmode="decimal"'} ${ro ? 'disabled' : ''}>${r.unit ? `<span class="muted">${esc(r.unit)}</span>` : ''}</div>`;
      const src = res.draft ? 'Draft, not live yet' : lockedAbove ? 'Locked by ' + LV()[res.lockedBy] : res.level === 'default' ? 'Default value' : `Set at ${LV()[res.level]} level${res.by ? ' by ' + esc(res.by) : ''}${res.at ? ' · ' + F.stamp(res.at) : ''}`;
      const sens = r.sensitive && sold > 0 && level !== 'platform' ? tag('Second person needed to change', 'a') : '';
      return `<div class="cfg ${res.draft ? 'draft' : mine ? 'over' : ''} ${lockedAbove ? 'locked' : ''}"><div><b>${esc(r.label)}</b> ${sens}<div class="muted">${esc(r.help || '')}</div><div class="src">${lockedAbove ? '🔒 ' : ''}${src}${!allowed ? ' · can only be set at ' + r.levels.map((l) => LV()[l]).join(', ') : ''}</div></div>
        <div>${input}<div class="row" style="margin-top:4px;gap:6px">${res.draft ? `<button class="btn sm ghost" data-discard="${k}">Discard draft</button>` : ''}${mine && !ro ? `<button class="btn sm ghost" data-reset="${k}">Reset to inherited</button>` : ''}</div></div></div>`;
    }
    $$('[data-k]', el).forEach((i) => (i.onchange = () => {
      const k = i.dataset.k; const r = ES.cfg.REG[k]; let v = i.value; if (r.type === 'money') v = String(F.parseNum(v)); if (r.type === 'bool') v = v === 'true';
      E.act('stage setting', () => ES.cfg.setDraft(k, level, scope, v, false), 'Saved as a draft. Publish to make it live.');
    }));
    $$('[data-discard]', el).forEach((b) => (b.onclick = () => E.act('discard draft', () => ES.cfg.discardDraft(b.dataset.discard, level, scope))));
    $$('[data-reset]', el).forEach((b) => (b.onclick = () => E.act('reset setting', () => ES.cfg.removeOverride(b.dataset.reset, level, scope), 'Now inherits from the level above')));
    if ($('#cfgPublish', el)) $('#cfgPublish', el).onclick = async () => { const r = await E.act('publish configuration', () => ES.cfg.publish(ev.id)); if (r) toast(r.published + ' published' + (r.pending ? ' · ' + r.pending + ' sent for a second person to approve' : ''), 'ok'); };
    if ($('#cfgDiscardAll', el)) $('#cfgDiscardAll', el).onclick = () => E.act('discard drafts', () => DB().run("DELETE FROM config WHERE status='draft'"), 'Drafts discarded');
    if ($('#cfgScope', el)) $('#cfgScope', el).onchange = (e) => o.onScope && o.onScope(e.target.value);
    const log = DB().all('SELECT * FROM config_log ORDER BY id DESC LIMIT 40');
    ES.ui.dataTable($('#cfgLog', el), { rows: log, pageSize: 8, noSearch: true, columns: [{ key: 'at', label: 'When', render: (r) => F.stamp(r.at) }, { key: 'by', label: 'By' }, { key: 'key', label: 'Setting', render: (r) => esc((ES.cfg.REG[r.key] || {}).label || r.key) + ` <span class="muted">(${LV()[r.level] || r.level})</span>`, value: (r) => r.key },
      { key: 'old_value', label: 'From', render: (r) => esc(r.old_value === null ? '—' : r.old_value) }, { key: 'new_value', label: 'To', render: (r) => esc(r.new_value === null ? '—' : r.new_value) }, { key: 'action', label: 'Action' },
      { key: 'id', label: '', sortable: false, render: (r) => (r.action === 'publish' && canPub ? `<button class="btn sm" data-rb="${r.id}">Roll back</button>` : '') }], afterRender: (c) => $$('[data-rb]', c).forEach((b) => (b.onclick = () => E.act('rollback', () => ES.cfg.rollback(Number(b.dataset.rb)), 'Rolled back'))) });
  }

  // ---------- page ----------
  const TABS = [['config', 'Configuration', 'settings'], ['approvals', 'Approvals', 'home'], ['staff', 'Staff and roles', 'staff'], ['numbering', 'Numbering', 'settings'], ['company', 'Company', 'settings'], ['activity', 'Activity log', 'settings'], ['database', 'Database', 'database']];
  let cfgLevel = 'eo';
  function render(el, param) {
    const [t0, extra] = (param || 'config').split('/'); const tabs = TABS.filter((t) => can(t[2])); const tab = tabs.find((t) => t[0] === t0) ? t0 : tabs[0] && tabs[0][0];
    const pend = DB().val("SELECT COUNT(*) FROM approvals WHERE status='pending'");
    el.innerHTML = E.pageHead('Settings', 'Company, people, rules and data') + '<div class="tabs" id="stabs"></div><div id="sbody"></div>';
    ES.ui.tabs($('#stabs'), tabs.map((t) => ({ id: t[0], label: t[1], count: t[0] === 'approvals' && pend ? pend : null, countClass: 'a' })), tab, (t) => (location.hash = '#/settings/' + t));
    const b = $('#sbody'); ({ config: config, approvals, staff, numbering, company, activity, database })[tab](b, extra);
  }
  function config(el) {
    const ev = E.ev(); const proj = ev && DB().get('SELECT * FROM projects WHERE id=?', [ev.project_id]);
    const opts = [['eo', 'EO account (all projects)']].concat(proj ? [['project', 'Project: ' + proj.name]] : []).concat(ev ? [['event', 'Event: ' + ev.name]] : []);
    configEditor(el, { level: cfgLevel, ev, title: 'Rules and defaults', scopeSelect: opts, scopeSel: cfgLevel, onScope: (v) => { cfgLevel = v; E.refresh(); },
      note: 'Settings come in layers: platform, then your EO account, then project, event, ticket type and device. The lowest layer wins unless a higher layer locked it. Changes stay as drafts until you publish.' });
  }

  // ---------- approvals ----------
  function approvals(el) {
    const rows = DB().all('SELECT * FROM approvals ORDER BY CASE status WHEN "pending" THEN 0 ELSE 1 END, id DESC LIMIT 200');
    el.innerHTML = '<div class="notice" style="margin-bottom:12px">Only two things need a second person: changing ticket rules after sales opened, and exporting attendee data. You cannot approve your own request. Everything else is decided by role.</div><div class="card"><div id="ap"></div></div>';
    ES.ui.dataTable($('#ap'), { rows, noSearch: true, pageSize: 15, columns: [{ key: 'created_at', label: 'Requested', render: (r) => F.stamp(r.created_at) }, { key: 'title', label: 'Request', render: (r) => `<b>${esc(r.title)}</b><div class="sub">${esc(r.detail || '')}</div>` }, { key: 'requested_by', label: 'By' },
      { key: 'status', label: 'Status', render: (r) => tag(r.status, r.status === 'approved' ? 'g' : r.status === 'rejected' ? 'r' : 'a') }, { key: 'decided_by', label: 'Decided by', render: (r) => esc(r.decided_by ? r.decided_by + ' · ' + F.stamp(r.decided_at) : '') },
      { key: 'id', label: '', sortable: false, render: (r) => (r.status === 'pending' ? (r.requested_by_id === ES.session.id ? '<span class="muted">Waiting for another person</span>' : `<button class="btn sm go" data-ap="1:${r.id}">Approve</button> <button class="btn sm" data-ap="0:${r.id}">Reject</button>`) : '') }],
      afterRender: (c) => $$('[data-ap]', c).forEach((b) => (b.onclick = () => { const [a, id] = b.dataset.ap.split(':'); if (!can('accounting') && !can('settings')) return toast('Your role cannot decide approvals', 'err'); E.act('approval', () => ES.biz.decideApproval(Number(id), a === '1'), a === '1' ? 'Approved' : 'Rejected'); })) });
  }

  // ---------- staff ----------
  function staff(el) {
    const users = DB().all('SELECT * FROM users ORDER BY id'); const gates = DB().all('SELECT * FROM gates');
    el.innerHTML = `<div class="card"><div class="card-h"><h3>People</h3>${can('staff') ? '<button class="btn primary sm" style="margin-left:auto" id="addU">Add person</button>' : ''}</div><div id="us"></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>What each role can do</h3><span class="hint">Owner can override any permission per person</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Permission</th>${Object.entries(ES.auth.ROLES).map(([k, r]) => `<th style="text-align:center">${esc(r.label)}</th>`).join('')}</tr></thead><tbody>
      ${Object.entries(ES.auth.PERMS).map(([p, l]) => `<tr><td>${esc(l)}</td>${Object.values(ES.auth.ROLES).map((r) => `<td style="text-align:center">${r.perms.includes(p) ? '●' : '<span class="muted">·</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    ES.ui.dataTable($('#us'), { rows: users, noSearch: true, columns: [{ key: 'name', label: 'Name', render: (r) => `<div class="row">${ES.ui.avatar(r.name, r.color)}<div><b>${esc(r.name)}</b><div class="sub">${esc(r.title || '')}</div></div></div>`, value: (r) => r.name }, { key: 'role', label: 'Role', render: (r) => esc(ES.auth.ROLES[r.role].label) },
      { key: 'email', label: 'Email' }, { key: 'active', label: 'Status', render: (r) => (r.active ? tag('Active', 'g') : tag('Off')) }], onRow: can('staff') ? userForm : null });
    if ($('#addU')) $('#addU').onclick = () => userForm(null);
    function userForm(u) {
      const f = [{ name: 'name', label: 'Full name', required: true, full: true }, { name: 'short', label: 'Short name', required: true }, { name: 'role', label: 'Role', type: 'select', options: Object.entries(ES.auth.ROLES).map(([k, r]) => [k, r.label]) }, { name: 'title', label: 'Job title' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' },
        { name: 'pin', label: u ? 'New PIN (leave empty to keep)' : 'PIN (4 to 6 digits)', type: 'password', required: !u, pattern: /^\d{4,6}$/, patternMsg: '4 to 6 digits' }, { name: 'gate_id', label: 'Home gate (crew)', type: 'select', placeholder: 'None', options: gates.map((g) => [g.id, g.name]) }, { name: 'active', label: 'Active', type: 'checkbox', default: 1 }];
      let ov = {}; try { ov = JSON.parse((u && u.perm_override) || '{}'); } catch (e) { /* ignore */ }
      const base = u ? ES.auth.permsOf(Object.assign({}, u, { perm_override: '{}' })) : new Set();
      ES.ui.drawer.open({ title: u ? u.name : 'Add person', wide: true, body: ES.ui.formHTML(f, u || { role: 'crew', active: 1 }) + `<div class="section-t" style="margin:16px 0 6px">Permission overrides</div><div class="muted" style="margin-bottom:8px">Tick to grant on top of the role, untick to remove. Only differences from the role are saved.</div><div class="grid g2" id="ovs">${Object.entries(ES.auth.PERMS).map(([p, l]) => { const on = p in ov ? ov[p] : base.has(p); return `<label class="check-row"><input type="checkbox" data-p="${p}" ${on ? 'checked' : ''}> ${esc(l)}</label>`; }).join('')}</div>`,
        footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button>', onMount: (b, d) => {
          const roleSel = b.querySelector('[name=role]'); const refresh = () => { const bp = new Set(ES.auth.ROLES[roleSel.value].perms); b.querySelectorAll('[data-p]').forEach((c) => (c.checked = bp.has(c.dataset.p))); }; if (!u) roleSel.onchange = refresh; if (!u) refresh();
          d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close();
          d.querySelector('[data-s]').onclick = async () => {
            const v = ES.ui.validate(b, f); if (!v) return; const bp = new Set(ES.auth.ROLES[v.role].perms); const over = {}; b.querySelectorAll('[data-p]').forEach((c) => { if (c.checked !== bp.has(c.dataset.p)) over[c.dataset.p] = c.checked; });
            if (u && u.role === 'owner' && (!v.active || v.role !== 'owner') && DB().val("SELECT COUNT(*) FROM users WHERE role='owner' AND active=1") < 2) return toast('There must be at least one active owner', 'err');
            await E.act('staff', () => { const rec = { name: v.name, short: v.short, role: v.role, title: v.title, email: v.email, phone: v.phone, gate_id: v.gate_id || null, active: v.active, perm_override: JSON.stringify(over) };
              if (v.pin) rec.pin_hash = ES.auth.hashPin(v.pin);
              if (u) { DB().update('users', u.id, rec); DB().log('staff edited', 'users', u.id, v.name); } else { rec.color = ['#2F5BEA', '#0B8A5F', '#C8283D', '#8A5A00', '#6B3FA0'][Math.floor(Math.random() * 5)]; rec.created_at = F.nowStamp(); DB().insert('users', rec); DB().log('staff added', 'users', 0, v.name); } }, 'Saved'); ES.ui.drawer.close(); if (u && u.id === ES.session.id) ES.auth.loadSession(); };
        } });
    }
  }

  // ---------- numbering ----------
  function numbering(el) {
    const types = Object.keys(ES.num.DEFAULTS);
    el.innerHTML = `<div class="card"><div class="card-h"><h3>Document numbers</h3><span class="hint">Use {YYYY} {YY} {MM} and {NNN} (more N means more digits)</span></div>
      ${types.map((t) => { const c = ES.num.cfg(t); return `<div class="cfg"><div><b>${esc(c.label)}</b><div class="src">Next number: <b id="pv-${t}">${esc(ES.num.peek(t))}</b></div></div><div class="row" style="gap:6px"><input class="input" data-nf="${t}" value="${esc(c.fmt)}"><select class="input" data-nr="${t}" style="width:130px">${[['year', 'Resets yearly'], ['month', 'Resets monthly'], ['never', 'Never resets']].map(([v, l]) => `<option value="${v}" ${c.reset === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`; }).join('')}
      <div class="row" style="margin-top:12px">${can('settings') ? '<button class="btn primary" id="numSave">Save formats</button>' : ''}</div></div>`;
    $$('[data-nf]', el).forEach((i) => (i.oninput = () => { $('#pv-' + i.dataset.nf).textContent = ES.num.render(i.value, F.today(), 1); }));
    if ($('#numSave')) $('#numSave').onclick = () => { for (const t of types) { const f = $(`[data-nf="${t}"]`).value; if (!/\{N+\}/.test(f)) return toast(ES.num.DEFAULTS[t].label + ': the format needs a {NNN} part so numbers stay unique', 'err'); }
      E.act('numbering', () => types.forEach((t) => { DB().setSetting('numfmt.' + t, $(`[data-nf="${t}"]`).value); DB().setSetting('numreset.' + t, $(`[data-nr="${t}"]`).value); }), 'Saved. Existing documents keep their numbers.'); };
  }

  // ---------- company ----------
  function company(el) {
    const o = DB().get('SELECT * FROM org WHERE id=1') || {};
    const f = [{ section: 'Company' }, { name: 'name', label: 'Brand name', required: true }, { name: 'legal_name', label: 'Legal name' }, { name: 'npwp', label: 'NPWP' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'city', label: 'City' }, { name: 'address', label: 'Address', full: true },
      { section: 'Bank account on invoices' }, { name: 'bank_name', label: 'Bank' }, { name: 'bank_acc', label: 'Account number' }, { name: 'bank_holder', label: 'Account holder' }, { section: 'Signs documents' }, { name: 'signatory', label: 'Name' }, { name: 'signatory_title', label: 'Title' }];
    el.innerHTML = `<div class="card" style="max-width:820px">${ES.ui.formHTML(f, o)}<div class="row" style="margin-top:14px">${can('settings') ? '<button class="btn primary" id="orgSave">Save</button>' : ''}</div></div>`;
    if ($('#orgSave')) $('#orgSave').onclick = () => { const v = ES.ui.validate(el, f); if (!v) return; E.act('company', () => { DB().update('org', 1, v); DB().log('company updated', 'org', 1, ''); }, 'Saved'); };
  }

  // ---------- activity ----------
  function activity(el) {
    el.innerHTML = '<div class="card"><div id="act"></div></div>'; const rows = DB().all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 5000');
    ES.ui.dataTable($('#act'), { rows, pageSize: 25, exportName: 'activity-log', searchKeys: ['actor', 'action', 'detail', 'entity'], filters: [{ key: 'actor_kind', label: 'App', options: [...new Set(rows.map((r) => r.actor_kind))].map((x) => [x, x]) }], columns: [{ key: 'at', label: 'When', render: (r) => F.stamp(r.at) }, { key: 'actor', label: 'Who' }, { key: 'actor_kind', label: 'App' }, { key: 'action', label: 'Action' }, { key: 'detail', label: 'Detail' }] });
  }

  // ---------- database ----------
  function database(el) {
    const tables = DB().tables().map((n) => ({ name: n, n: DB().val('SELECT COUNT(*) FROM ' + n) })); const size = DB().sizeBytes();
    el.innerHTML = `<div class="grid g2"><div class="card"><div class="card-h"><h3>Backup</h3></div><p class="muted" style="margin-bottom:12px">All data lives in this browser. Download a copy often. The file opens in any SQLite tool and can be restored here.</p>
        <div class="kv" style="margin-bottom:12px"><span>Size</span><span>${(size / 1024 / 1024).toFixed(2)} MB</span><span>Version</span><span>${DB().version}</span><span>Schema</span><span>${ES.SCHEMA_VERSION}</span></div>
        <div class="row" style="gap:8px"><button class="btn primary" id="dbExp">Download backup (.sqlite)</button><label class="btn">Restore from file<input type="file" id="dbImp" accept=".sqlite,.db" hidden></label></div></div>
      <div class="card"><div class="card-h"><h3>Danger zone</h3></div><p class="muted" style="margin-bottom:12px">Deleting removes every project, ticket, ledger entry and document from this browser, in every open tab.</p><button class="btn danger" id="dbReset">Delete all data</button></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Records</h3></div><div class="grid g4">${tables.filter((t) => t.n).map((t) => `<div><b>${F.num(t.n)}</b> <span class="muted">${esc(t.name)}</span></div>`).join('')}</div></div>`;
    const ten = DB().get('SELECT * FROM tenants WHERE is_current=1'); if (ten) { const rq = DB().all('SELECT * FROM support_requests WHERE tenant_id=? ORDER BY id DESC LIMIT 5', [ten.id]); const active = rq.find((r) => r.status === 'granted' && r.granted_until && r.granted_until > F.nowStamp());
      el.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Platform support access</h3><span class="hint">Our staff can only look at your data while you allow it</span></div>${active ? `<div class="notice warn" style="margin-bottom:10px">Support has access until <b>${esc(F.stamp(active.granted_until))}</b>.</div>` : '<p class="muted" style="margin-bottom:10px">Nobody from the platform can open your data right now.</p>'}${rq.map((r) => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line-2)"><span style="flex:1">${esc(r.reason)}<div class="muted">${esc(F.stamp(r.created_at))} · ${esc(r.requested_by)}</div></span>${tag(r.status, r.status === 'granted' ? 'g' : r.status === 'open' ? 'a' : '')}</div>`).join('')}<button class="btn" id="supReq" style="margin-top:10px">Ask the platform for help</button></div>`);
      $('#supReq').onclick = () => { const f = [{ name: 'reason', label: 'What do you need help with?', type: 'textarea', required: true, full: true }]; ES.ui.drawer.open({ title: 'Ask for support', body: '<div class="notice" style="margin-bottom:10px">Support staff only get access after the platform approves and only for a limited time. Every access is written to the activity log.</div>' + ES.ui.formHTML(f), footer: '<button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Send request</button>', onMount: (b, d) => { d.querySelector('[data-x]').onclick = () => ES.ui.drawer.close(); d.querySelector('[data-s]').onclick = async () => { const v = ES.ui.validate(b, f); if (!v) return; await E.act('support request', () => { DB().insert('support_requests', { tenant_id: ten.id, reason: v.reason, requested_by: ES.session.name, created_at: F.nowStamp() }); DB().log('support requested', 'support_requests', 0, v.reason.slice(0, 80)); }, 'Request sent'); ES.ui.drawer.close(); E.refreshAll(); }; } }); }; }
    $('#dbExp').onclick = () => { ES.exp.saveBlob(new Blob([DB().exportBytes()], { type: 'application/x-sqlite3' }), ES.exp.fileName('event-spotlight-backup', 'sqlite')); toast('Backup downloaded', 'ok'); };
    $('#dbImp').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; if (!(await ES.ui.confirm('Replace all data?', 'The current database in this browser is replaced by this file.', { danger: true, ok: 'Replace' }))) return; try { await DB().importBytes(new Uint8Array(await f.arrayBuffer())); toast('Restored', 'ok'); location.reload(); } catch (err) { toast(err.message, 'err'); } };
    $('#dbReset').onclick = async () => { if (!(await ES.ui.confirm('Delete everything?', 'This cannot be undone. Download a backup first.', { danger: true, ok: 'Delete all data', typeToConfirm: 'DELETE' }))) return; await DB().reset(); location.hash = ''; location.reload(); };
  }

  // ---------- outbox ----------
  function outbox(el) {
    const rows = DB().all('SELECT * FROM outbox ORDER BY id DESC LIMIT 500');
    el.innerHTML = E.pageHead('Outbox', 'Emails and text messages the system would send. Nothing leaves this computer in the demo; in production these go through your email and SMS provider.') + '<div class="card"><div id="ob"></div></div>';
    ES.ui.dataTable($('#ob'), { rows, pageSize: 20, searchKeys: ['to_email', 'to_name', 'subject', 'body'], filters: [{ key: 'kind', label: 'Kind', options: [...new Set(rows.map((r) => r.kind))].map((x) => [x, x]) }], rowClass: (r) => (r.opened ? '' : 'warn'), columns: [{ key: 'created_at', label: 'Sent', render: (r) => F.stamp(r.created_at) },
      { key: 'to_name', label: 'To', render: (r) => `<b>${esc(r.to_name || '')}</b><div class="sub">${esc(r.to_email)}</div>` }, { key: 'subject', label: 'Subject' }, { key: 'kind', label: 'Kind', render: (r) => tag(r.kind, r.kind === 'sms' ? 'b' : r.kind === 'login-code' ? 'a' : '') }], onRow: (r) => {
        ES.ui.drawer.open({ title: r.subject, body: `<div class="kv"><span>To</span><span>${esc(r.to_name || '')} · ${esc(r.to_email)}</span><span>Sent</span><span>${F.stamp(r.created_at)}</span></div><pre style="white-space:pre-wrap;font:15px/1.5 var(--font);margin-top:16px;border-top:1px solid var(--line);padding-top:14px">${esc(r.body)}</pre>` });
        if (!r.opened) E.act('outbox read', () => DB().update('outbox', r.id, { opened: 1 })).then(() => {}); } });
  }

  E.register('settings', { label: 'Settings', icon: 'set', section: 'Admin', perm: 'home', render, keywords: 'configuration rules staff roles numbering database backup approvals' });
  E.register('outbox', { label: 'Outbox', icon: 'mail', section: 'Admin', perm: 'outbox', render: outbox, keywords: 'email sms codes messages', badge: () => DB().val('SELECT COUNT(*) FROM outbox WHERE opened=0') || 0 });
  ES.settingsUI = { configEditor };
})();
