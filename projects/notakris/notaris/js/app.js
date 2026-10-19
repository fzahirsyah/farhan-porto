/* NotaKris — office app shell: boot, setup wizard, PIN login, layout, router, live sync. */
(function () {
  const NK = window.NK;
  const { $, $$, esc, toast } = NK.ui;
  const F = NK.fmt;

  // ---------- icons ----------
  const I = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    pt: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
    ahu: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
    klien: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    job: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M14 4v16"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    msg: '<path d="M21 12a8.5 8.5 0 01-12.6 7.4L3 21l1.7-5.2A8.5 8.5 0 1121 12z"/>',
    deed: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    rep: '<path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"/>',
    arch: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
    bill: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    po: '<path d="M6 2h12l2 4H4z"/><path d="M4 6v14a2 2 0 002 2h12a2 2 0 002-2V6M9 11h6"/>',
    acc: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    tax: '<path d="M9 14l6-6M9.5 8.5h.01M14.5 13.5h.01"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    bell: '<path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16z"/><path d="M10 21h4"/>',
    log: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    set: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k] || ''}</svg>`;

  // ---------- module registry ----------
  const routes = {};
  /* def: {label, icon, perm, section, phase, desc, render(el, param), badge()} */
  function register(id, def) { routes[id] = Object.assign({ id }, def); }
  const SECTIONS = ['Utama', 'Kepatuhan', 'Kantor', 'Keuangan', 'Tim', 'Sistem'];

  // Modules arriving in later phases (replaced when their files register a real render function)
  const PLANNED = {
    kepatuhan: ['Register Kepatuhan PT', 'pt', 'kepatuhan', 'Kepatuhan', 4, 'Laporan tahunan PT (RUPS + akta + SABH 30 hari), dokumen pemilik manfaat, versi KBLI, impor dari Excel, pembuatan pekerjaan RUPS massal.', 'SELECT COUNT(*) FROM companies', 'perseroan'],
    ahu: ['Persiapan AHU', 'ahu', 'ahu', 'Kepatuhan', 4, 'Lembar salin ke AHU, cek kesesuaian akta vs entri (modal, saham, nama, NIK), checklist pemilik manfaat, paket unggah.', "SELECT COUNT(*) FROM jobs WHERE category='N' AND stage<>'selesai'", 'pekerjaan notaris aktif'],
    klien: ['Klien & PMPJ', 'klien', 'klien', 'Kepatuhan', 3, 'Data klien perorangan & badan, dokumen, penilaian risiko, PEP, skrining daftar sanksi, identifikasi mendalam (EDD), draf LTKM.', 'SELECT COUNT(*) FROM clients', 'klien'],
    pekerjaan: ['Pekerjaan', 'job', 'pekerjaan', 'Kantor', 3, 'Papan tahapan, penugasan staf dengan batas beban kerja dan saran, checklist dokumen, tahap yang terlihat oleh klien.', "SELECT COUNT(*) FROM jobs WHERE stage NOT IN ('selesai','batal')", 'pekerjaan aktif'],
    kalender: ['Kalender & Ruangan', 'cal', 'kalender', 'Kantor', 3, 'Tampilan mingguan, cek bentrok ruangan/staf/cuti, pengingat lewat Outbox.', 'SELECT COUNT(*) FROM appointments', 'janji temu'],
    pesan: ['Pesan Portal', 'msg', 'pesan', 'Kantor', 3, 'Percakapan dengan klien lewat portal, waktu nyata antar-tab.', 'SELECT COUNT(*) FROM messages', 'pesan'],
    akta: ['Studio Akta', 'deed', 'akta', 'Kantor', 4, 'Templat akta (pendirian PT, RUPS tahunan, perubahan, AJB) terisi dari data, terbilang otomatis, unduh .doc.', 'SELECT COUNT(*) FROM services', 'templat layanan'],
    repertorium: ['Repertorium & Laporan', 'rep', 'repertorium', 'Kantor', 4, 'Repertorium, klapper, laporan bulanan Notaris & PPAT (termasuk NIHIL), pengingat lapor wasiat.', 'SELECT COUNT(*) FROM deeds', 'akta tercatat'],
    arsip: ['Arsip Protokol', 'arch', 'arsip', 'Kantor', 4, 'Indeks minuta, lokasi fisik, pindaian, pencarian, paket serah terima protokol.', 'SELECT COUNT(*) FROM archive', 'minuta terindeks'],
    penjualan: ['Penawaran & Tagihan', 'bill', 'penjualan', 'Keuangan', 5, 'Penawaran → invoice → pembayaran (termasuk bukti transfer klien) → kwitansi + e-meterai, dokumen siap cetak.', 'SELECT COUNT(*) FROM invoices', 'invoice'],
    pembelian: ['Purchase Order', 'po', 'pembelian', 'Keuangan', 5, 'Vendor, PO, persetujuan notaris, penerimaan barang, utang usaha, pembayaran.', 'SELECT COUNT(*) FROM purchase_orders', 'PO'],
    akuntansi: ['Akuntansi', 'acc', 'akuntansi', 'Keuangan', 5, 'Jurnal otomatis & manual, laba rugi, neraca, neraca saldo, buku besar, impor mutasi bank, kontrol dana titipan, tutup buku.', 'SELECT COUNT(*) FROM journal_entries', 'jurnal'],
    pajak: ['Pajak Kantor', 'tax', 'pajak', 'Keuangan', 5, 'Daftar kewajiban pajak kantor dan tenggatnya.', 'SELECT COUNT(*) FROM tax_obligations', 'kewajiban pajak'],
    karyawan: ['Karyawan', 'team', 'karyawan', 'Tim', 5, 'Data staf, kehadiran, cuti, penggajian ke jurnal, kinerja, log pelatihan PMPJ.', 'SELECT COUNT(*) FROM users', 'pengguna']
  };
  Object.entries(PLANNED).forEach(([id, [label, ic, perm, section, phase, desc, countSql, unit]]) =>
    register(id, { label, icon: ic, perm, section, phase, desc, countSql, unit, render: renderPlanned }));

  function renderPlanned(el, _p, r) {
    const n = NK.db.val(r.countSql);
    el.innerHTML = `<div class="phase card"><div class="ic">${icon(r.icon)}</div><span class="tag p">Dibangun di Fase ${r.phase}</span>
      <h2 style="margin:10px 0 6px">${esc(r.label)}</h2><p class="muted">${esc(r.desc)}</p>
      <div class="notice info" style="margin-top:16px">Database sudah memiliki <b>${F.num(n)}</b> ${esc(r.unit)} untuk modul ini.
      Lihat isinya di <a href="#/pengaturan/database">Pengaturan → Database</a>.</div></div>`;
  }

  // ---------- state ----------
  let current = { id: 'dashboard', param: '' };
  let pendingRemote = false;

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '').split('/');
    return { id: h[0] || 'dashboard', param: h.slice(1).join('/') };
  }

  // ---------- boot ----------
  async function boot() {
    document.body.innerHTML = `<div class="screen"><div class="box" style="text-align:center"><img class="logo" src="../assets/logo-plum.png" alt="NotaKris"><p class="muted" style="margin-top:14px"><span class="spin"></span>&nbsp; Menyiapkan database…</p></div></div>`;
    try { await NK.db.init('kantor'); }
    catch (e) { return fatal(e); }
    NK.db.onChange(onDbChange);
    route();
    window.addEventListener('hashchange', route);
  }
  function fatal(e) {
    console.error(e);
    document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:560px"><h2>Aplikasi tidak bisa dimulai</h2>
      <p class="muted" style="margin:8px 0 12px">${esc(e.message || e)}</p>
      <div class="notice warn">Pastikan Anda membuka file ini di <b>Google Chrome</b> (atau Edge) dan folder <code>shared/</code> tidak dipindah dari samping folder <code>notaris/</code>.</div></div></div>`;
  }

  function route() {
    if (NK.db.state !== 'ready') return renderSetup();
    if (!NK.auth.loadSession()) return renderLogin();
    current = parseHash();
    if (!routes[current.id]) current.id = 'dashboard';
    renderShell();
  }

  // ---------- setup (no database yet) ----------
  function renderSetup() {
    document.body.innerHTML = `<div class="screen"><div class="box">
      <div style="text-align:center"><img class="logo" src="../assets/logo-plum.png" alt="NotaKris">
      <p class="muted">Aplikasi kantor Notaris & PPAT · database SQLite tersimpan di browser ini</p></div>
      <div class="choice">
        <div class="card" data-c="empty"><div class="big">🗂️</div><h3 style="margin:8px 0 4px">Database kosong</h3><p class="small muted">Mulai dari nol untuk kantor Anda. Isi profil kantor & akun notaris, lalu tambah data sendiri.</p></div>
        <div class="card" data-c="demo"><div class="big">✨</div><h3 style="margin:8px 0 4px">Database demo</h3><p class="small muted">Berisi data contoh lengkap (kantor fiktif di Surabaya): klien, PT, pekerjaan, invoice, jurnal, karyawan.</p></div>
        <div class="card" data-c="file"><div class="big">📂</div><h3 style="margin:8px 0 4px">Buka file .sqlite</h3><p class="small muted">Pulihkan database yang pernah Anda unduh dari menu Pengaturan → Database.</p><input type="file" accept=".sqlite,.db,.sqlite3" hidden></div>
      </div>
      <p class="small muted" style="text-align:center;margin-top:22px">Data hanya tersimpan di browser ini. Unduh cadangan .sqlite secara berkala.</p></div></div>`;
    const fileInput = $('[data-c="file"] input');
    $$('[data-c]').forEach((c) => (c.onclick = async (e) => {
      const k = c.dataset.c;
      if (k === 'demo') { busy(c); await NK.db.create('database demo', (DB) => NK.seed.demo(DB)); toast('Database demo siap', 'ok'); route(); }
      else if (k === 'empty') renderWizard();
      else if (e.target !== fileInput) fileInput.click();
    }));
    fileInput.onchange = async () => {
      const f = fileInput.files[0]; if (!f) return;
      try { await NK.db.importBytes(new Uint8Array(await f.arrayBuffer())); toast('Database dipulihkan', 'ok'); route(); }
      catch (err) { toast(err.message, 'err'); }
    };
  }
  function busy(el) { el.innerHTML = '<div style="text-align:center;padding:30px"><span class="spin"></span><p class="muted small" style="margin-top:10px">Membuat database…</p></div>'; }

  function renderWizard() {
    const fields = [
      { section: 'Profil kantor' },
      { name: 'officeName', label: 'Nama kantor', required: true, full: true, placeholder: 'Kantor Notaris & PPAT …' },
      { name: 'notaryName', label: 'Nama notaris', required: true, placeholder: 'tanpa gelar' },
      { name: 'notaryTitle', label: 'Gelar', placeholder: 'S.H., M.Kn.' },
      { name: 'roles', label: 'Jabatan', type: 'select', options: [['Notaris & PPAT', 'Notaris & PPAT'], ['Notaris', 'Notaris'], ['PPAT', 'PPAT']] },
      { name: 'city', label: 'Kota kedudukan', required: true },
      { name: 'address', label: 'Alamat kantor', full: true },
      { name: 'phone', label: 'Telepon' }, { name: 'email', label: 'Email kantor', type: 'email' },
      { name: 'skNo', label: 'Nomor SK pengangkatan' }, { name: 'npwp', label: 'NPWP' },
      { section: 'Akun notaris (administrator)' },
      { name: 'pin', label: 'PIN masuk (4–6 angka)', type: 'password', required: true, pattern: /^\d{4,6}$/, patternMsg: 'PIN harus 4–6 angka' },
      { name: 'pin2', label: 'Ulangi PIN', type: 'password', required: true }
    ];
    document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:720px">
      <div class="row"><img src="../assets/icon.svg" width="40" height="40" alt=""><div><h2>Siapkan database kosong</h2><div class="small muted">Bagan akun, ruangan & templat layanan dibuat otomatis. Semua bisa diubah nanti.</div></div></div>
      <div style="margin-top:18px" id="wz">${NK.ui.formHTML(fields)}</div>
      <div class="row" style="margin-top:18px"><button class="btn" id="wzBack">← Kembali</button><span class="spacer"></span><button class="btn primary" id="wzGo">Buat database</button></div></div></div>`;
    $('#wzBack').onclick = renderSetup;
    $('#wzGo').onclick = async () => {
      const v = NK.ui.validate($('#wz'), fields, (v, fail) => { if (v.pin && v.pin !== v.pin2) fail('pin2', 'PIN tidak sama'); });
      if (!v) return;
      $('#wzGo').disabled = true;
      await NK.db.create('database kosong', (DB) => NK.seed.empty(DB, v));
      NK.auth.login(1, v.pin);
      toast('Database dibuat. Selamat datang!', 'ok');
      location.hash = '#/dashboard'; route();
    };
  }

  // ---------- login ----------
  function renderLogin() {
    const users = NK.db.all('SELECT id,name,short,role,title,color FROM users WHERE active=1 ORDER BY id');
    const office = NK.db.get('SELECT * FROM office WHERE id=1') || {};
    let pins = {}; try { pins = JSON.parse(NK.db.setting('demo_pins', '{}')); } catch (e) { /* ignore */ }
    document.body.innerHTML = `<div class="screen"><div class="box" style="max-width:820px">
      <div style="text-align:center"><img class="logo" src="../assets/logo-plum.png" alt="NotaKris"><p class="muted">${esc(office.name || '')}</p></div>
      <h2 style="text-align:center;margin-top:20px">Siapa yang masuk?</h2>
      <div class="users-grid">${users.map((u) => `<div class="user-card" data-u="${u.id}"><span class="avatar" style="background:${u.color}">${esc(F.initials(u.name))}</span><b>${esc(u.short || u.name)}</b><div class="small muted">${esc(u.title || NK.auth.ROLES[u.role].label)}</div>${pins[u.short] ? `<div class="tiny muted" style="margin-top:4px">PIN demo: ${pins[u.short]}</div>` : ''}</div>`).join('')}</div>
      <p class="small muted" style="text-align:center;margin-top:20px">Portal klien dibuka dari <b>klien/index.html</b> di tab lain.</p></div></div>`;
    $$('[data-u]').forEach((c) => (c.onclick = () => pinPrompt(users.find((u) => u.id === Number(c.dataset.u)))));
  }
  function pinPrompt(u) {
    let pin = '';
    const box = document.createElement('div');
    NK.ui.drawer.close();
    document.querySelector('.screen .box').innerHTML = `<div class="card" style="max-width:360px;margin:0 auto;text-align:center">
      <span class="avatar" style="background:${u.color};width:56px;height:56px;font-size:20px;margin:0 auto">${esc(F.initials(u.name))}</span>
      <h3 style="margin-top:10px">${esc(u.name)}</h3><div class="small muted">Masukkan PIN</div>
      <div class="pindots">${'<i></i>'.repeat(6)}</div><div class="small" id="pinErr" style="color:var(--red);height:18px;margin-top:6px"></div>
      <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, 'OK'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>
      <button class="btn ghost" style="margin-top:12px" id="pinBack">← Pilih pengguna lain</button></div>`;
    void box;
    const dots = () => $$('.pindots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const submit = () => {
      if (NK.auth.login(u.id, pin)) { document.removeEventListener('keydown', kd); NK.db.write('masuk', () => NK.db.log('masuk', 'users', u.id)).catch(() => {}); route(); }
      else { pin = ''; dots(); $('#pinErr').textContent = 'PIN salah'; }
    };
    const press = (k) => {
      $('#pinErr').textContent = '';
      if (k === '←') pin = pin.slice(0, -1); else if (k === 'OK') return submit(); else if (pin.length < 6) pin += k;
      dots(); if (pin.length >= 4 && NK.auth.hashPin(pin) === NK.db.val('SELECT pin_hash FROM users WHERE id=?', [u.id])) submit();
    };
    const kd = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('←'); else if (e.key === 'Enter') press('OK'); };
    document.addEventListener('keydown', kd);
    $$('[data-k]').forEach((b) => (b.onclick = () => press(b.dataset.k)));
    $('#pinBack').onclick = () => { document.removeEventListener('keydown', kd); renderLogin(); };
  }

  // ---------- shell ----------
  function renderShell() {
    const s = NK.session;
    document.body.innerHTML = `<div class="app">
      <aside class="side"><div class="brand"><img src="../assets/logo-white.png" alt="NotaKris"><small>${esc((NK.db.get('SELECT name FROM office WHERE id=1') || {}).name || '')}</small></div>
        <nav id="nav"></nav>
        <div class="me">${NK.ui.avatar(s.name, s.color)}<div><b>${esc(s.short || s.name)}</b>${esc(s.title || NK.auth.ROLES[s.role].label)}</div></div></aside>
      <div class="main">
        <div class="topbar"><span class="crumb" id="crumb"></span><span class="spacer"></span>
          <span class="sync" id="sync" title="Status sinkron dengan tab lain"><span class="dot"></span><span id="syncTxt">Tersinkron</span></span>
          ${NK.auth.can('outbox') ? `<button class="icon-btn" style="position:relative" title="Outbox email (simulasi)" id="tbOutbox">${icon('mail')}<span class="badge-n hidden" id="cntOutbox"></span></button>` : ''}
          <button class="icon-btn" style="position:relative" title="Notifikasi" id="tbBell" data-popbtn>${icon('bell')}<span class="badge-n hidden" id="cntBell"></span></button>
          <button class="btn sm" id="tbUser" data-popbtn>${esc(s.short || s.name)} ▾</button></div>
        <div class="content" id="content"></div></div></div>`;
    $('#tbUser').onclick = (e) => NK.ui.popMenu(e.currentTarget, [
      { label: 'Ganti pengguna', onClick: () => { NK.auth.logout(); route(); } },
      { label: 'Keluar', onClick: () => { NK.auth.logout(); route(); } }]);
    $('#tbBell').onclick = (e) => bellMenu(e.currentTarget);
    if ($('#tbOutbox')) $('#tbOutbox').onclick = () => (location.hash = '#/outbox');
    renderNav(); renderRoute(); refreshChrome();
  }

  function renderNav() {
    const html = SECTIONS.map((sec) => {
      const items = Object.values(routes).filter((r) => r.section === sec && (!r.perm || NK.auth.can(r.perm)));
      if (!items.length) return '';
      return (sec === 'Utama' ? '' : `<div class="sec">${sec}</div>`) + items.map((r) => {
        const b = r.badge ? r.badge() : 0;
        return `<a class="nav ${current.id === r.id ? 'on' : ''}" href="#/${r.id}">${icon(r.icon)}${esc(r.label)}${b ? `<span class="cnt">${b}</span>` : r.render === renderPlanned ? `<span class="soon">F${r.phase}</span>` : ''}</a>`;
      }).join('');
    }).join('');
    $('#nav').innerHTML = html;
  }

  function renderRoute() {
    const r = routes[current.id];
    if (!r || (r.perm && !NK.auth.can(r.perm))) {
      $('#content').innerHTML = `<div class="phase card"><h2>Tidak ada akses</h2><p class="muted">Peran Anda tidak memiliki izin untuk modul ini. Minta notaris mengubah hak akses di Pengaturan → Pengguna.</p></div>`;
      $('#crumb').textContent = 'Tidak ada akses'; return;
    }
    $('#crumb').textContent = r.label;
    document.title = r.label + ' — NotaKris';
    const el = $('#content');
    pendingRemote = false;
    try { r.render(el, current.param, r); }
    catch (e) { console.error(e); el.innerHTML = `<div class="notice err">Terjadi kesalahan saat menampilkan halaman: ${esc(e.message)}</div>`; }
  }

  function refreshChrome() {
    if (!$('#nav')) return;
    renderNav();
    const nb = NK.db.val("SELECT COUNT(*) FROM notifications WHERE target='kantor' AND read=0") || 0;
    const ob = NK.db.val('SELECT COUNT(*) FROM outbox WHERE opened=0') || 0;
    const b = $('#cntBell'); if (b) { b.textContent = nb; b.classList.toggle('hidden', !nb); }
    const o = $('#cntOutbox'); if (o) { o.textContent = ob; o.classList.toggle('hidden', !ob); }
    $('#syncTxt').textContent = 'Tersinkron · v' + NK.db.version;
  }

  function bellMenu(anchor) {
    const items = NK.db.all("SELECT * FROM notifications WHERE target='kantor' ORDER BY id DESC LIMIT 8");
    const m = NK.ui.popMenu(anchor, []);
    m.style.width = '340px';
    m.innerHTML = `<div class="row" style="padding:6px 8px"><b>Notifikasi</b><span class="spacer"></span><button class="btn sm ghost" id="nbAll" style="padding:2px 6px">Tandai dibaca</button></div>
      ${items.length ? items.map((n) => `<button data-link="${esc(n.link || '')}" style="display:block;${n.read ? '' : 'background:#faf3f8'}"><b style="font-size:12.5px">${esc(n.title)}</b><div class="small muted">${esc(n.body || '')}</div><div class="tiny muted">${esc(n.created_at)}</div></button>`).join('') : '<div class="small muted" style="padding:10px">Belum ada notifikasi</div>'}
      <button data-link="#/notifikasi" style="justify-content:center;color:var(--plum);font-weight:600">Lihat semua</button>`;
    m.onclick = async (e) => {
      if (e.target.id === 'nbAll') { await NK.db.write('notifikasi dibaca', () => NK.db.run("UPDATE notifications SET read=1 WHERE target='kantor'")); NK.ui.closePops(); refreshChrome(); return; }
      const b = e.target.closest('[data-link]'); if (b) { NK.ui.closePops(); if (b.dataset.link) location.hash = b.dataset.link; }
    };
  }

  // ---------- live sync ----------
  function onDbChange(msg) {
    if (msg.type === 'reset' || msg.type === 'created') {
      if (msg.remote) { toast(msg.type === 'reset' ? 'Database dihapus dari tab lain' : 'Database diganti dari tab lain'); setTimeout(() => location.reload(), 600); }
      return;
    }
    if (!$('#content')) { if (msg.remote && NK.db.state === 'ready' && !NK.session) { /* login screen — nothing */ } return; }
    if (!NK.auth.loadSession()) return route();
    const sync = $('#sync'); if (sync) { sync.classList.add('busy'); setTimeout(() => sync.classList.remove('busy'), 600); }
    refreshChrome();
    if (msg.remote) {
      toast((msg.who === 'klien' ? 'Klien' : msg.by) + ': ' + msg.label);
      if (NK.ui.drawer.isOpen() && NK.ui.drawer.dirty) {
        if (!pendingRemote) {
          pendingRemote = true;
          const ban = document.createElement('div'); ban.className = 'refresh-banner';
          ban.innerHTML = 'Data berubah di tab lain. <button class="btn sm">Muat ulang tampilan</button>';
          ban.querySelector('button').onclick = () => { ban.remove(); renderRoute(); };
          $('#content').prepend(ban);
        }
      } else refresh();
    }
  }
  // Re-render the current page, keeping scroll position.
  function refresh() {
    const y = window.scrollY; renderRoute(); window.scrollTo(0, y);
  }

  // Page header helper used by modules
  function pageHead(title, sub, actions) {
    return `<div class="page-h"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
  }

  NK.app = { register, routes, boot, route, refresh, refreshChrome, renderNav, pageHead, icon, go: (h) => (location.hash = h) };
  document.addEventListener('DOMContentLoaded', boot);
})();
