/* NotaKris — Pengaturan: office profile, users & permissions, rooms, services, numbering, database tools. */
(function () {
  const NK = window.NK; const F = NK.fmt; const { esc, tag, toast, $ } = NK.ui; const DB = NK.db;
  const TABS = [['kantor', 'Profil kantor'], ['pengguna', 'Pengguna & hak akses'], ['ruangan', 'Ruangan'], ['layanan', 'Layanan & templat'], ['penomoran', 'Penomoran'], ['database', 'Database']];
  const CAT = { N: 'Notaris', P: 'PPAT', U: 'Pengurusan', K: 'Keuangan' };

  function render(el, param) {
    const tab = TABS.find((t) => t[0] === param) ? param : 'kantor';
    el.innerHTML = NK.app.pageHead('Pengaturan', 'Profil kantor, pengguna, data master, dan alat database.') + '<div class="tabs" id="setTabs"></div><div id="setBody"></div>';
    NK.ui.tabs($('#setTabs'), TABS.map(([id, label]) => ({ id, label })), tab, (id) => (location.hash = '#/pengaturan/' + id));
    ({ kantor, pengguna, ruangan, layanan, penomoran, database })[tab]($('#setBody'));
  }

  // ---------- office ----------
  const OFFICE_FIELDS = [
    { section: 'Identitas' },
    { name: 'name', label: 'Nama kantor', required: true, full: true },
    { name: 'notary_name', label: 'Nama notaris', required: true }, { name: 'notary_title', label: 'Gelar' },
    { name: 'roles', label: 'Jabatan', type: 'select', options: [['Notaris & PPAT', 'Notaris & PPAT'], ['Notaris', 'Notaris'], ['PPAT', 'PPAT']] },
    { name: 'sk_no', label: 'Nomor SK pengangkatan' }, { name: 'wilayah', label: 'Wilayah jabatan' }, { name: 'npwp', label: 'NPWP' },
    { section: 'Kontak' },
    { name: 'address', label: 'Alamat', full: true }, { name: 'city', label: 'Kota' }, { name: 'phone', label: 'Telepon' }, { name: 'email', label: 'Email', type: 'email' },
    { section: 'Pembayaran (tampil di invoice)' },
    { name: 'bank_name', label: 'Bank' }, { name: 'bank_acc', label: 'Nomor rekening' }, { name: 'bank_holder', label: 'Atas nama' }, { name: 'va_no', label: 'Nomor virtual account (opsional)' }
  ];
  const OPS_FIELDS = [
    { section: 'Operasional' },
    { name: 'jam_buka', label: 'Jam buka', type: 'time' }, { name: 'jam_tutup', label: 'Jam tutup', type: 'time' },
    { name: 'batas_meterai', label: 'Batas bea meterai kwitansi', type: 'money', help: 'Kwitansi di atas nilai ini ditandai perlu e-meterai' }, { name: 'tarif_meterai', label: 'Tarif meterai', type: 'money' }
  ];
  function kantor(el) {
    const o = DB.get('SELECT * FROM office WHERE id=1') || {};
    const ops = { jam_buka: DB.setting('jam_buka', '08:00'), jam_tutup: DB.setting('jam_tutup', '16:00'), batas_meterai: Number(DB.setting('batas_meterai', 5000000)), tarif_meterai: Number(DB.setting('tarif_meterai', 10000)) };
    const can = NK.auth.can('pengaturan');
    el.innerHTML = `<div class="card" style="max-width:860px"><div id="offForm">${NK.ui.formHTML(OFFICE_FIELDS.concat(OPS_FIELDS), Object.assign({}, o, ops))}</div>
      <div class="row" style="margin-top:16px">${can ? '<button class="btn primary" id="offSave">Simpan</button>' : '<span class="small muted">Hanya notaris yang dapat mengubah profil kantor.</span>'}</div></div>`;
    NK.ui.bindMoney(el);
    if (!can) return;
    $('#offSave').onclick = async () => {
      const v = NK.ui.validate($('#offForm'), OFFICE_FIELDS.concat(OPS_FIELDS)); if (!v) return;
      await DB.write('profil kantor diperbarui', () => {
        const off = {}; OFFICE_FIELDS.forEach((f) => f.name && (off[f.name] = v[f.name]));
        DB.update('office', 1, off);
        OPS_FIELDS.forEach((f) => f.name && DB.setSetting(f.name, v[f.name] === null ? '' : v[f.name]));
        DB.log('mengubah profil kantor', 'office', 1);
      });
      toast('Profil kantor disimpan', 'ok'); NK.app.route();
    };
  }

  // ---------- users ----------
  function pengguna(el) {
    const rows = DB.all('SELECT * FROM users ORDER BY active DESC, id');
    const load = Object.fromEntries(DB.all("SELECT pic_user_id u, COUNT(*) n FROM jobs WHERE stage NOT IN ('selesai','batal') GROUP BY pic_user_id").map((r) => [r.u, r.n]));
    el.innerHTML = `<div class="card"><div id="uTbl"></div></div>`;
    NK.ui.dataTable($('#uTbl'), {
      rows, exportName: 'Pengguna', searchKeys: ['name', 'email', 'title'],
      toolbar: NK.auth.can('pengaturan') ? '<button class="btn primary sm" id="uAdd">+ Pengguna</button>' : '',
      filters: [{ key: 'role', label: 'Peran', options: Object.entries(NK.auth.ROLES).map(([k, r]) => [k, r.label]) }, { key: 'active', label: 'Status', options: [['1', 'Aktif'], ['0', 'Nonaktif']] }],
      columns: [
        { key: 'name', label: 'Nama', render: (r) => `<div class="row nw">${NK.ui.avatar(r.name, r.color)}<div><b>${esc(r.name)}</b><div class="sub">${esc(r.email || '')}</div></div></div>` },
        { key: 'role', label: 'Peran', render: (r) => tag(NK.auth.ROLES[r.role].label, r.role === 'notaris' ? 'p' : ''), value: (r) => NK.auth.ROLES[r.role].label },
        { key: 'title', label: 'Jabatan' },
        { key: 'capacity', label: 'Beban kerja', render: (r) => `${load[r.id] || 0} / ${r.capacity}`, value: (r) => (load[r.id] || 0) + '/' + r.capacity },
        { key: 'active', label: 'Status', render: (r) => (r.active ? tag('aktif', 'g') : tag('nonaktif')), value: (r) => (r.active ? 'aktif' : 'nonaktif') }
      ],
      onRow: NK.auth.can('pengaturan') ? (r) => userDrawer(r) : null
    });
    const add = $('#uAdd'); if (add) add.onclick = () => userDrawer(null);
  }
  function userDrawer(u) {
    const isNew = !u; u = u || { role: 'staf', capacity: 6, color: '#2f5fa8', active: 1, joined: F.today(), leave_quota: 12 };
    const gaji = NK.auth.can('karyawan.gaji');
    const fields = [
      { name: 'name', label: 'Nama lengkap (dengan gelar)', required: true, full: true }, { name: 'short', label: 'Nama panggilan', required: true },
      { name: 'role', label: 'Peran', type: 'select', options: Object.entries(NK.auth.ROLES).map(([k, r]) => [k, r.label]) },
      { name: 'title', label: 'Jabatan' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Telepon' },
      { name: 'capacity', label: 'Kapasitas pekerjaan aktif', type: 'number', min: 1, max: 30 }, { name: 'color', label: 'Warna', type: 'color' },
      { name: 'joined', label: 'Tanggal bergabung', type: 'date' }, { name: 'leave_quota', label: 'Jatah cuti / tahun', type: 'number' },
      { name: 'screened_date', label: 'Skrining pra-kerja (PMPJ)', type: 'date' },
      { name: 'confidentiality_signed', label: 'Sudah menandatangani pernyataan rahasia jabatan', type: 'checkbox', full: true },
      { name: 'active', label: 'Aktif (boleh masuk)', type: 'checkbox', full: true },
      ...(gaji ? [{ section: 'Gaji' }, { name: 'base_salary', label: 'Gaji pokok', type: 'money' }, { name: 'allowance', label: 'Tunjangan', type: 'money' }] : []),
      { section: isNew ? 'PIN masuk' : 'Ganti PIN (kosongkan jika tidak diubah)' },
      { name: 'pin', label: 'PIN baru (4–6 angka)', type: 'password', required: isNew, pattern: /^\d{4,6}$/, patternMsg: 'PIN harus 4–6 angka' }
    ];
    const perms = NK.auth.permsOf(u.role ? u : { role: 'staf' });
    const permHTML = `<div class="section-t" style="margin-top:16px">Hak akses</div><p class="small muted" style="margin:4px 0 8px">Centang default mengikuti peran. Ubah untuk pengecualian per orang.</p>
      <div class="grid g2" style="gap:6px" id="permBox">${Object.entries(NK.auth.PERMS).map(([p, l]) => `<label class="check-row"><input type="checkbox" data-perm="${p}" ${perms.has(p) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
    NK.ui.drawer.open({
      title: isNew ? 'Pengguna baru' : u.name, wide: true,
      body: `<div id="uForm">${NK.ui.formHTML(fields, u)}</div>${permHTML}`,
      footer: '<button class="btn" data-close2>Batal</button><button class="btn primary" id="uSave">Simpan</button>',
      onMount(body, d) {
        NK.ui.bindMoney(body);
        d.querySelector('[data-close2]').onclick = () => NK.ui.drawer.close();
        body.querySelector('[name=role]').onchange = (e) => { const def = NK.auth.permsOf({ role: e.target.value }); body.querySelectorAll('[data-perm]').forEach((c) => (c.checked = def.has(c.dataset.perm))); };
        d.querySelector('#uSave').onclick = async () => {
          const v = NK.ui.validate(body.querySelector('#uForm'), fields, (v, fail) => {
            if (!isNew && u.id === NK.session.id && !v.active) fail('active', 'Anda tidak bisa menonaktifkan akun sendiri');
            const notaries = DB.val("SELECT COUNT(*) FROM users WHERE role='notaris' AND active=1 AND id<>?", [u.id || 0]);
            if (!notaries && (v.role !== 'notaris' || !v.active)) fail('role', 'Harus ada minimal satu notaris aktif');
          });
          if (!v) return;
          const def = NK.auth.permsOf({ role: v.role }); const ov = {};
          body.querySelectorAll('[data-perm]').forEach((c) => { if (c.checked !== def.has(c.dataset.perm)) ov[c.dataset.perm] = c.checked; });
          const row = Object.assign({}, v, { perm_override: JSON.stringify(ov) }); delete row.pin;
          if (v.pin) row.pin_hash = NK.auth.hashPin(v.pin);
          await DB.write(isNew ? 'pengguna baru' : 'pengguna diperbarui', () => {
            if (isNew) { row.created_at = F.nowStamp(); const id = DB.insert('users', row); DB.log('menambah pengguna', 'users', id, v.name); }
            else { DB.update('users', u.id, row); DB.log('mengubah pengguna', 'users', u.id, v.name + (v.pin ? ' (PIN diganti)' : '')); }
          });
          NK.ui.drawer.close(); toast('Pengguna disimpan', 'ok'); NK.app.route();
        };
      }
    });
  }

  // ---------- rooms ----------
  function ruangan(el) {
    const rows = DB.all('SELECT * FROM rooms ORDER BY id');
    el.innerHTML = '<div class="card" style="max-width:860px"><div id="rTbl"></div></div>';
    const fields = [{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'color', label: 'Warna', type: 'color' },
      { name: 'kind', label: 'Jenis', type: 'select', options: [['ruang', 'Ruangan kantor (cek bentrok)'], ['luar', 'Luar kantor (tanpa cek bentrok ruang)']] }, { name: 'active', label: 'Aktif', type: 'checkbox' }];
    const edit = (r) => {
      const isNew = !r; r = r || { color: '#744C68', kind: 'ruang', active: 1 };
      NK.ui.drawer.open({ title: isNew ? 'Ruangan baru' : r.name, body: `<div id="rf">${NK.ui.formHTML(fields, r)}</div>`, footer: '<button class="btn primary" id="rSave">Simpan</button>',
        onMount(b, d) { d.querySelector('#rSave').onclick = async () => {
          const v = NK.ui.validate(b.querySelector('#rf'), fields); if (!v) return;
          await DB.write(isNew ? 'ruangan baru' : 'ruangan diperbarui', () => { if (isNew) DB.insert('rooms', v); else DB.update('rooms', r.id, v); DB.log((isNew ? 'menambah' : 'mengubah') + ' ruangan', 'rooms', r.id, v.name); });
          NK.ui.drawer.close(); toast('Ruangan disimpan', 'ok'); NK.app.refresh(); }; } });
    };
    NK.ui.dataTable($('#rTbl'), {
      rows, exportName: 'Ruangan', noSearch: true, toolbar: NK.auth.can('pengaturan') ? '<button class="btn primary sm" id="rAdd">+ Ruangan</button>' : '',
      columns: [{ key: 'code', label: 'Kode' }, { key: 'name', label: 'Nama', render: (r) => `<span class="dot" style="color:${r.color}"></span> ${esc(r.name)}` },
        { key: 'kind', label: 'Jenis', render: (r) => (r.kind === 'luar' ? 'Luar kantor' : 'Ruangan kantor') }, { key: 'active', label: 'Status', render: (r) => (r.active ? tag('aktif', 'g') : tag('nonaktif')) }],
      onRow: NK.auth.can('pengaturan') ? edit : null
    });
    const a = $('#rAdd'); if (a) a.onclick = () => edit(null);
  }

  // ---------- services ----------
  function layanan(el) {
    const rows = DB.all('SELECT * FROM services ORDER BY category, name');
    el.innerHTML = '<div class="card"><div id="sTbl"></div></div>';
    NK.ui.dataTable($('#sTbl'), {
      rows, exportName: 'Layanan', toolbar: NK.auth.can('pengaturan') ? '<button class="btn primary sm" id="sAdd">+ Layanan</button>' : '',
      filters: [{ key: 'category', label: 'Kategori', options: Object.entries(CAT) }],
      columns: [{ key: 'code', label: 'Kode', render: (r) => `<span class="mono">${esc(r.code)}</span>` }, { key: 'name', label: 'Layanan', render: (r) => `<b>${esc(r.name)}</b>` },
        { key: 'category', label: 'Kategori', render: (r) => tag(CAT[r.category]), value: (r) => CAT[r.category] },
        { key: 'default_fee', label: 'Honorarium default', num: true, render: (r) => (NK.auth.can('biaya') ? (r.default_fee ? F.rp(r.default_fee) : 'sesuai nilai transaksi') : '•••') },
        { key: 'sla_days', label: 'Target (hari)', num: true },
        { key: 'steps', label: 'Tahap', render: (r) => JSON.parse(r.steps).length + ' tahap', value: (r) => JSON.parse(r.steps).join(' → ') },
        { key: 'checklist', label: 'Dokumen', render: (r) => JSON.parse(r.checklist).length + ' dokumen', value: (r) => JSON.parse(r.checklist).map((c) => c[0]).join('; ') },
        { key: 'active', label: 'Status', render: (r) => (r.active ? tag('aktif', 'g') : tag('nonaktif')) }],
      onRow: NK.auth.can('pengaturan') ? (r) => serviceDrawer(r) : null
    });
    const a = $('#sAdd'); if (a) a.onclick = () => serviceDrawer(null);
  }
  function serviceDrawer(s) {
    const isNew = !s; s = s || { category: 'N', sla_days: 14, steps: '[]', checklist: '[]', active: 1, default_fee: 0 };
    const steps = JSON.parse(s.steps).join('\n');
    const chk = JSON.parse(s.checklist).map(([n, req, up, ocr]) => (req ? '' : '? ') + (up ? '' : '! ') + n + (ocr ? ' [ktp]' : '')).join('\n');
    const fields = [{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama layanan', required: true },
      { name: 'category', label: 'Kategori', type: 'select', options: Object.entries(CAT) }, { name: 'default_fee', label: 'Honorarium default', type: 'money' },
      { name: 'sla_days', label: 'Target selesai (hari)', type: 'number', min: 1 }, { name: 'active', label: 'Aktif', type: 'checkbox' },
      { name: 'steps_txt', label: 'Tahap pekerjaan (satu per baris) — terlihat oleh klien di portal', type: 'textarea', full: true, rows: 6 },
      { name: 'chk_txt', label: 'Checklist dokumen (satu per baris)', type: 'textarea', full: true, rows: 7, help: 'Awali dengan <b>?</b> untuk dokumen opsional, <b>!</b> untuk dokumen yang diserahkan langsung ke kantor (tidak diunggah klien), dan akhiri dengan <b>[ktp]</b> agar foto dibaca otomatis.' }];
    NK.ui.drawer.open({ title: isNew ? 'Layanan baru' : s.name, wide: true, body: `<div id="sf">${NK.ui.formHTML(fields, Object.assign({}, s, { steps_txt: steps, chk_txt: chk }))}</div>`,
      footer: '<button class="btn primary" id="sSave">Simpan</button>',
      onMount(b, d) {
        NK.ui.bindMoney(b);
        d.querySelector('#sSave').onclick = async () => {
          const v = NK.ui.validate(b.querySelector('#sf'), fields); if (!v) return;
          const stepsArr = v.steps_txt.split('\n').map((x) => x.trim()).filter(Boolean);
          const chkArr = v.chk_txt.split('\n').map((x) => x.trim()).filter(Boolean).map((line) => {
            let req = 1, up = 1, ocr = 0, n = line;
            for (;;) { if (n.startsWith('?')) { req = 0; n = n.slice(1).trim(); } else if (n.startsWith('!')) { up = 0; n = n.slice(1).trim(); } else break; }
            if (/\[ktp\]\s*$/i.test(n)) { ocr = 1; n = n.replace(/\[ktp\]\s*$/i, '').trim(); }
            return [n, req, up, ocr];
          });
          const row = { code: v.code, name: v.name, category: v.category, default_fee: v.default_fee || 0, sla_days: v.sla_days || 14, active: v.active, steps: JSON.stringify(stepsArr), checklist: JSON.stringify(chkArr) };
          await DB.write(isNew ? 'layanan baru' : 'layanan diperbarui', () => { const id = isNew ? DB.insert('services', row) : (DB.update('services', s.id, row), s.id); DB.log((isNew ? 'menambah' : 'mengubah') + ' layanan', 'services', id, v.name); });
          NK.ui.drawer.close(); toast('Layanan disimpan', 'ok'); NK.app.refresh();
        };
      } });
  }

  // ---------- numbering ----------
  function penomoran(el) {
    const types = Object.keys(NK.num.DEFAULTS);
    const can = NK.auth.can('pengaturan');
    el.innerHTML = `<div class="card" style="max-width:900px"><p class="small muted" style="margin-bottom:12px">Token: <span class="mono">{YYYY}</span> tahun, <span class="mono">{YY}</span> 2 digit tahun, <span class="mono">{MM}</span> bulan, <span class="mono">{NNN}</span> nomor urut (jumlah N = jumlah digit).</p>
      <table class="tbl"><thead><tr><th>Dokumen</th><th>Format</th><th>Nomor urut diulang</th><th>Nomor berikutnya</th></tr></thead><tbody>
      ${types.map((t) => { const c = NK.num.cfg(t); return `<tr><td><b>${esc(c.label)}</b></td><td><input class="input mono" data-fmt="${t}" value="${esc(c.fmt)}" ${can ? '' : 'disabled'}></td>
        <td><select class="input" data-reset="${t}" ${can ? '' : 'disabled'}>${[['tahun', 'Tiap tahun'], ['bulan', 'Tiap bulan'], ['tidak', 'Tidak pernah']].map(([v, l]) => `<option value="${v}" ${c.reset === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="mono" data-prev="${t}">${esc(NK.num.peek(t))}</td></tr>`; }).join('')}</tbody></table>
      ${can ? '<div class="row" style="margin-top:14px"><button class="btn primary" id="nSave">Simpan</button></div>' : ''}</div>`;
    el.querySelectorAll('[data-fmt]').forEach((i) => (i.oninput = () => { el.querySelector(`[data-prev="${i.dataset.fmt}"]`).textContent = NK.num.render(i.value, F.today(), 1) + ' …'; }));
    const s = $('#nSave');
    if (s) s.onclick = async () => {
      await DB.write('format penomoran diperbarui', () => {
        types.forEach((t) => { DB.setSetting('numfmt.' + t, el.querySelector(`[data-fmt="${t}"]`).value.trim() || NK.num.DEFAULTS[t].fmt); DB.setSetting('numreset.' + t, el.querySelector(`[data-reset="${t}"]`).value); });
        DB.log('mengubah format penomoran', 'settings');
      });
      toast('Format penomoran disimpan', 'ok'); NK.app.refresh();
    };
  }

  // ---------- database ----------
  let browseTable = 'clients';
  async function database(el) {
    const tables = DB.tables();
    const counts = Object.fromEntries(tables.map((t) => [t, DB.val(`SELECT COUNT(*) FROM "${t}"`)]));
    const size = DB.sizeBytes(); const saved = await DB.savedAt();
    const mode = DB.setting('mode', '-');
    const canDb = NK.auth.can('database');
    el.innerHTML = `<div class="grid g21">
      <div class="card"><h3>Database SQLite</h3><div class="kv" style="margin-top:6px">
        <span>Jenis</span><span>${mode === 'demo' ? tag('Data demo', 'p') : tag('Data kantor', 'g')}</span>
        <span>Dibuat</span><span>${esc(DB.setting('created_at', '-'))}</span>
        <span>Ukuran</span><span>${(size / 1024).toFixed(0)} KB · ${tables.length} tabel · ${F.num(Object.values(counts).reduce((a, b) => a + b, 0))} baris</span>
        <span>Versi simpan</span><span>v${DB.version} · tersimpan ${saved ? new Date(saved).toLocaleString('id-ID') : '-'}</span>
        <span>Skema</span><span>versi ${esc(DB.setting('schema_version', '1'))}</span>
        <span>Penyimpanan</span><span>IndexedDB browser ini (dipakai bersama oleh aplikasi kantor & portal klien di browser yang sama)</span></div></div>
      <div class="card"><h3>Cadangan & pemulihan</h3>
        <div style="display:grid;gap:8px;margin-top:6px">
          ${canDb ? `<button class="btn primary" id="dbDl">⬇ Unduh database (.sqlite)</button>
          <button class="btn" id="dbUp">⬆ Pulihkan dari file .sqlite</button><input type="file" id="dbFile" accept=".sqlite,.db,.sqlite3" hidden>
          <button class="btn" id="dbDemo">✨ Ganti dengan data demo baru</button>
          <button class="btn danger" id="dbReset">Hapus semua data</button>` : '<span class="small muted">Hanya notaris yang dapat mengunduh, memulihkan, atau menghapus database.</span>'}
        </div><p class="small muted" style="margin-top:10px">File .sqlite bisa dibuka dengan DB Browser for SQLite atau alat SQLite lain.</p></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Penjelajah tabel</h3><span class="hint">hanya baca</span></div>
        <div class="row" style="margin-bottom:12px"><select class="input" id="tblSel" style="max-width:340px">${tables.map((t) => `<option value="${t}" ${t === browseTable ? 'selected' : ''}>${esc(NK.TABLE_LABELS[t] || t)} (${t}) — ${counts[t]}</option>`).join('')}</select></div>
        <div id="tblView"></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Konsol SQL</h3><span class="hint">hanya SELECT</span></div>
        <textarea class="input sql-box" id="sqlIn" placeholder="SELECT name, risk_level FROM clients WHERE pep=1">SELECT a.code, a.name, SUM(l.debit) debit, SUM(l.credit) kredit FROM accounts a JOIN journal_lines l ON l.account_code=a.code GROUP BY a.code</textarea>
        <div class="row" style="margin:10px 0"><button class="btn primary sm" id="sqlRun">Jalankan</button><span class="small muted" id="sqlMsg"></span></div><div id="sqlOut"></div></div>`;
    showTable(browseTable);
    $('#tblSel').onchange = (e) => { browseTable = e.target.value; showTable(browseTable); };
    if (canDb) {
      $('#dbDl').onclick = () => {
        const name = 'notakris_' + (mode === 'demo' ? 'demo_' : '') + F.today() + '.sqlite';
        NK.exp.saveBlob(new Blob([DB.exportBytes()], { type: 'application/x-sqlite3' }), name); toast('Database diunduh: ' + name, 'ok');
      };
      $('#dbUp').onclick = () => $('#dbFile').click();
      $('#dbFile').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (!(await NK.ui.confirm('Pulihkan database?', `Semua data saat ini akan diganti dengan isi <b>${esc(f.name)}</b>. Unduh cadangan dulu jika perlu.`, { danger: true, ok: 'Ganti data' }))) return;
        try { await DB.importBytes(new Uint8Array(await f.arrayBuffer())); toast('Database dipulihkan', 'ok'); NK.auth.logout(); NK.app.route(); } catch (err) { toast(err.message, 'err'); }
      };
      $('#dbDemo').onclick = async () => {
        if (!(await NK.ui.confirm('Ganti dengan data demo?', 'Semua data saat ini akan dihapus dan diganti data contoh.', { danger: true, ok: 'Ganti', typeToConfirm: 'DEMO' }))) return;
        await DB.create('database demo', (D) => NK.seed.demo(D)); NK.auth.logout(); toast('Data demo dimuat', 'ok'); NK.app.route();
      };
      $('#dbReset').onclick = async () => {
        if (!(await NK.ui.confirm('Hapus semua data?', 'Database di browser ini akan dihapus permanen. Portal klien yang terbuka juga akan keluar.', { danger: true, ok: 'Hapus semua', typeToConfirm: 'HAPUS' }))) return;
        await DB.reset(); NK.auth.logout(); location.hash = ''; NK.app.route();
      };
    }
    $('#sqlRun').onclick = () => {
      const q = $('#sqlIn').value.trim(); const out = $('#sqlOut'); const msg = $('#sqlMsg');
      if (!/^(select|with|pragma\s+table_info)\b/i.test(q) || /;\s*\S/.test(q)) { msg.textContent = 'Hanya satu perintah SELECT yang diizinkan.'; return; }
      try {
        const res = DB.db.exec(q);
        if (!res[0]) { out.innerHTML = '<div class="small muted">Tidak ada hasil.</div>'; msg.textContent = ''; return; }
        const { columns, values } = res[0]; msg.textContent = values.length + ' baris';
        const rows = values.map((v) => Object.fromEntries(columns.map((c, i) => [c, cell(v[i])])));
        NK.ui.dataTable(out, { rows, exportName: 'Hasil query', pageSize: 20, noSearch: true, columns: columns.map((c) => ({ key: c, label: c })) });
      } catch (e) { msg.textContent = 'Galat: ' + e.message; out.innerHTML = ''; }
    };
  }
  const cell = (v) => (v instanceof Uint8Array ? `[file ${(v.length / 1024).toFixed(0)} KB]` : v);
  function showTable(t) {
    const res = DB.db.exec(`SELECT * FROM "${t}" ORDER BY rowid DESC LIMIT 500`);
    const cols = res[0] ? res[0].columns : DB.all(`PRAGMA table_info("${t}")`).map((c) => c.name);
    const rows = res[0] ? res[0].values.map((v) => Object.fromEntries(cols.map((c, i) => [c, cell(v[i])]))) : [];
    NK.ui.dataTable($('#tblView'), { rows, pageSize: 15, exportName: NK.TABLE_LABELS[t] || t, columns: cols.map((c) => ({ key: c, label: c, render: (r) => `<span class="small">${esc(String(r[c] === null ? '∅' : r[c]).slice(0, 80))}</span>` })), emptyTitle: 'Tabel kosong' });
  }

  NK.app.register('pengaturan', { label: 'Pengaturan', icon: 'set', section: 'Sistem', render });
})();
