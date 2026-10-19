/* NotaKris — Outbox (simulated email), notifications, activity log. */
(function () {
  const NK = window.NK; const F = NK.fmt; const { esc, tag, toast } = NK.ui; const DB = NK.db;

  const KIND = { 'kode-masuk': ['Kode masuk portal', 'p'], undangan: ['Undangan portal', 'b'], pengingat: ['Pengingat', 'a'], tagihan: ['Tagihan', 'g'], umum: ['Umum', ''] };

  // ---------- Outbox ----------
  let selected = null;
  function renderOutbox(el) {
    const rows = DB.all('SELECT * FROM outbox ORDER BY id DESC');
    if (selected && !rows.find((r) => r.id === selected)) selected = null;
    const sel = rows.find((r) => r.id === selected) || null;
    el.innerHTML = NK.app.pageHead('Outbox email', 'Simulasi: email tidak benar-benar dikirim. Semua email aplikasi (termasuk kode masuk Portal Klien) muncul di sini.',
      `<button class="btn" id="obRead">Tandai semua dibuka</button>${NK.auth.can('hapus') ? '<button class="btn" id="obClear">Hapus yang sudah dibuka</button>' : ''}`) +
      `<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)"><div class="card"><div id="obList"></div></div><div class="card" id="obView"></div></div>`;
    NK.ui.dataTable(NK.ui.$('#obList'), {
      rows, pageSize: 12, exportName: 'Outbox email',
      searchKeys: ['to_email', 'to_name', 'subject', 'body'],
      filters: [{ key: 'kind', label: 'Jenis', options: Object.entries(KIND).map(([k, v]) => [k, v[0]]) }],
      columns: [
        { key: 'created_at', label: 'Waktu', render: (r) => `<span class="small">${esc(r.created_at.slice(5, 16))}</span>` },
        { key: 'subject', label: 'Subjek', render: (r) => `${r.opened ? '' : '<span class="dot" style="color:var(--plum)"></span> '}<b style="${r.opened ? 'font-weight:500' : ''}">${esc(r.subject)}</b><div class="sub">${esc(r.to_name || '')} &lt;${esc(r.to_email)}&gt;</div>` },
        { key: 'kind', label: 'Jenis', render: (r) => tag((KIND[r.kind] || KIND.umum)[0], (KIND[r.kind] || KIND.umum)[1]), value: (r) => (KIND[r.kind] || KIND.umum)[0] }
      ],
      rowClass: (r) => (r.id === selected ? 'sel' : ''),
      onRow: (r) => { selected = r.id; if (!r.opened) DB.write('email dibuka', () => DB.run('UPDATE outbox SET opened=1 WHERE id=?', [r.id])).then(() => NK.app.refresh()); else NK.app.refresh(); }
    });
    const v = NK.ui.$('#obView');
    if (!sel) v.innerHTML = NK.ui.empty('Pilih email', 'Klik salah satu email di kiri untuk membacanya.');
    else {
      const code = sel.kind === 'kode-masuk' ? (sel.subject.match(/\d{6}/) || [])[0] : null;
      v.innerHTML = `<div class="small muted">${esc(sel.created_at)}</div><h2 style="margin:4px 0 8px">${esc(sel.subject)}</h2>
        <div class="small">Kepada: <b>${esc(sel.to_name || '')}</b> &lt;${esc(sel.to_email)}&gt;</div>
        ${code ? `<div class="notice info" style="margin:14px 0;text-align:center"><div class="small">Kode masuk Portal Klien</div><div style="font-size:34px;font-weight:800;letter-spacing:8px;color:var(--plum-d)">${code}</div><button class="btn sm" id="obCopy">Salin kode</button></div>` : ''}
        <pre style="white-space:pre-wrap;font-family:inherit;background:#faf8f5;border:1px solid var(--line);border-radius:10px;padding:14px;margin-top:12px">${esc(sel.body)}</pre>
        <div class="row" style="margin-top:12px"><a class="btn" href="mailto:${encodeURIComponent(sel.to_email)}?subject=${encodeURIComponent(sel.subject)}&body=${encodeURIComponent(sel.body)}">Buka di aplikasi email</a></div>`;
      const cp = NK.ui.$('#obCopy'); if (cp) cp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(code); toast('Kode disalin'); };
    }
    NK.ui.$('#obRead').onclick = async () => { await DB.write('semua email ditandai dibuka', () => DB.run('UPDATE outbox SET opened=1')); NK.app.refresh(); };
    const c = NK.ui.$('#obClear');
    if (c) c.onclick = async () => {
      if (!(await NK.ui.confirm('Hapus email yang sudah dibuka?', 'Email yang belum dibuka tetap disimpan.', { danger: true, ok: 'Hapus' }))) return;
      await DB.write('email lama dihapus', () => { const n = DB.run('DELETE FROM outbox WHERE opened=1').changes; DB.log('menghapus email outbox', 'outbox', null, n + ' email'); });
      selected = null; NK.app.refresh();
    };
  }

  // ---------- Notifications ----------
  function renderNotif(el) {
    const rows = DB.all("SELECT * FROM notifications WHERE target='kantor' ORDER BY id DESC");
    el.innerHTML = NK.app.pageHead('Notifikasi', 'Pemberitahuan untuk kantor dari sistem dan dari Portal Klien.', '<button class="btn" id="nRead">Tandai semua dibaca</button>') + '<div class="card" id="nList"></div>';
    NK.ui.dataTable(NK.ui.$('#nList'), {
      rows, exportName: 'Notifikasi',
      filters: [{ key: 'read', label: 'Status', options: [['0', 'Belum dibaca'], ['1', 'Sudah dibaca']] }],
      columns: [
        { key: 'created_at', label: 'Waktu', render: (r) => `<span class="small">${esc(r.created_at)}</span>` },
        { key: 'title', label: 'Judul', render: (r) => `<b style="${r.read ? 'font-weight:500' : ''}">${esc(r.title)}</b><div class="sub">${esc(r.body || '')}</div>` },
        { key: 'read', label: 'Status', render: (r) => (r.read ? tag('dibaca') : tag('baru', 'p')), value: (r) => (r.read ? 'dibaca' : 'baru') }
      ],
      onRow: async (r) => { await DB.write('notifikasi dibaca', () => DB.run('UPDATE notifications SET read=1 WHERE id=?', [r.id])); if (r.link) location.hash = r.link; else NK.app.refresh(); }
    });
    NK.ui.$('#nRead').onclick = async () => { await DB.write('notifikasi dibaca', () => DB.run("UPDATE notifications SET read=1 WHERE target='kantor'")); NK.app.refresh(); };
  }

  // ---------- Activity log ----------
  function renderLog(el) {
    const rows = DB.all('SELECT * FROM activity_log ORDER BY id DESC');
    const actors = [...new Set(rows.map((r) => r.actor))].sort();
    el.innerHTML = NK.app.pageHead('Log aktivitas', 'Jejak audit: siapa mengubah apa dan kapan — dari aplikasi kantor maupun Portal Klien.') + '<div class="card" id="lList"></div>';
    NK.ui.dataTable(NK.ui.$('#lList'), {
      rows, pageSize: 30, exportName: 'Log aktivitas',
      filters: [{ key: 'actor', label: 'Pelaku', options: actors.map((a) => [a, a]) }, { key: 'actor_kind', label: 'Asal', options: [['kantor', 'Aplikasi kantor'], ['klien', 'Portal klien']] }],
      columns: [
        { key: 'at', label: 'Waktu', render: (r) => `<span class="mono">${esc(r.at)}</span>` },
        { key: 'actor', label: 'Pelaku', render: (r) => `<b>${esc(r.actor)}</b> ${r.actor_kind === 'klien' ? tag('portal', 'p') : ''}` },
        { key: 'action', label: 'Aktivitas' },
        { key: 'entity', label: 'Data', render: (r) => (r.entity ? `<span class="small muted">${esc(NK.TABLE_LABELS[r.entity] || r.entity)}${r.entity_id ? ' #' + r.entity_id : ''}</span>` : '') },
        { key: 'detail', label: 'Keterangan', render: (r) => `<span class="small">${esc(r.detail || '')}</span>` }
      ]
    });
  }

  NK.app.register('outbox', { label: 'Outbox email', icon: 'mail', perm: 'outbox', section: 'Sistem', render: renderOutbox, badge: () => DB.val('SELECT COUNT(*) FROM outbox WHERE opened=0') || 0 });
  NK.app.register('notifikasi', { label: 'Notifikasi', icon: 'bell', section: 'Sistem', render: renderNotif });
  NK.app.register('log', { label: 'Log aktivitas', icon: 'log', perm: 'pengaturan', section: 'Sistem', render: renderLog });
})();
