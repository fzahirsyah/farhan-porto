/* NotaKris — users, roles, permissions, sessions, client login codes.
   NOTE: this is a browser-only demo. PINs are hashed, but anyone with access to this
   browser profile can read the database. A real deployment needs a server. */
(function () {
  const NK = (window.NK = window.NK || {});

  // ---- compact synchronous SHA-256 (used for PIN hashes; works in seeds and without secure context) ----
  function sha256(ascii) {
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const maxWord = Math.pow(2, 32); let result = ''; const words = []; const bitLen = ascii.length * 8;
    let hash = sha256.h = sha256.h || []; const k = sha256.k = sha256.k || []; let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) { const j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = (bitLen / maxWord) | 0; words[words.length] = bitLen;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16)); const oldHash = hash; hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2]; const a = hash[0], e = hash[4];
        const temp1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash); hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? 0 : '') + b.toString(16); }
    return result;
  }
  const hashPin = (pin) => sha256('notakris:' + String(pin));

  // ---- permissions ----
  const PERMS = {
    dashboard: 'Dasbor', klien: 'Klien & PMPJ', pekerjaan: 'Pekerjaan', 'pekerjaan.tugaskan': 'Menugaskan pekerjaan',
    kalender: 'Kalender & ruangan', pesan: 'Pesan portal klien', kepatuhan: 'Register kepatuhan PT', ahu: 'Persiapan AHU',
    akta: 'Studio akta', repertorium: 'Repertorium & laporan', arsip: 'Arsip protokol',
    penjualan: 'Penawaran, invoice & kwitansi', pembelian: 'Purchase order', 'pembelian.setujui': 'Menyetujui PO',
    akuntansi: 'Akuntansi', pajak: 'Pajak kantor', karyawan: 'Karyawan', 'karyawan.gaji': 'Penggajian',
    biaya: 'Melihat nominal biaya & honorarium', hapus: 'Menghapus data', pengaturan: 'Pengaturan', database: 'Alat database', outbox: 'Outbox email'
  };
  const ALL = Object.keys(PERMS);
  const ROLES = {
    notaris: { label: 'Notaris & PPAT', perms: ALL },
    staf: { label: 'Staf Notaris', perms: ['dashboard', 'klien', 'pekerjaan', 'kalender', 'pesan', 'kepatuhan', 'ahu', 'akta', 'repertorium', 'arsip', 'outbox'] },
    staf_ppat: { label: 'Staf PPAT', perms: ['dashboard', 'klien', 'pekerjaan', 'kalender', 'pesan', 'akta', 'repertorium', 'arsip', 'outbox'] },
    keuangan: { label: 'Admin Keuangan', perms: ['dashboard', 'klien', 'pekerjaan', 'kalender', 'pesan', 'penjualan', 'pembelian', 'akuntansi', 'pajak', 'karyawan', 'karyawan.gaji', 'biaya', 'outbox'] },
    kurir: { label: 'Kurir & Pengurusan', perms: ['dashboard', 'pekerjaan', 'kalender'] }
  };

  function permsOf(user) {
    if (!user) return new Set();
    const base = new Set((ROLES[user.role] || { perms: [] }).perms);
    let ov = {};
    try { ov = JSON.parse(user.perm_override || '{}'); } catch (e) { /* ignore */ }
    Object.entries(ov).forEach(([p, on]) => (on ? base.add(p) : base.delete(p)));
    return base;
  }

  // ---- office session (per browser tab) ----
  function loadSession() {
    const id = Number(sessionStorage.getItem('nk-user') || 0);
    if (!id || !NK.db.db) { NK.session = null; return null; }
    const u = NK.db.get('SELECT * FROM users WHERE id=? AND active=1', [id]);
    if (!u) { sessionStorage.removeItem('nk-user'); NK.session = null; return null; }
    NK.session = Object.assign(u, { perms: permsOf(u) });
    return NK.session;
  }
  function login(userId, pin) {
    const u = NK.db.get('SELECT * FROM users WHERE id=? AND active=1', [userId]);
    if (!u || u.pin_hash !== hashPin(pin)) return false;
    sessionStorage.setItem('nk-user', String(u.id));
    loadSession();
    return true;
  }
  function logout() { sessionStorage.removeItem('nk-user'); NK.session = null; }
  const can = (perm) => !!(NK.session && NK.session.perms && NK.session.perms.has(perm));

  // ---- client portal login (simulated email code) ----
  function requestCode(email) {
    email = String(email || '').trim().toLowerCase();
    const c = NK.db.get('SELECT * FROM clients WHERE lower(email)=? AND portal_enabled=1', [email]);
    if (!c) return null;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = new Date(); const exp = new Date(now.getTime() + 15 * 60000);
    NK.db.run('INSERT INTO portal_codes(email,client_id,code,created_at,expires_at) VALUES(?,?,?,?,?)', [email, c.id, code, NK.fmt.nowStamp(), exp.toISOString()]);
    const office = NK.db.get('SELECT * FROM office WHERE id=1') || {};
    NK.db.email(email, c.name, 'Kode masuk Portal Klien: ' + code,
      `Yth. ${c.name},\n\nKode masuk Portal Klien Anda: ${code}\nKode berlaku 15 menit. Jangan berikan kode ini kepada siapa pun.\n\nSalam,\n${office.name || 'Kantor Notaris'}`, 'kode-masuk', c.id);
    return { client: c, code };
  }
  function verifyCode(email, code) {
    email = String(email || '').trim().toLowerCase();
    const r = NK.db.get('SELECT * FROM portal_codes WHERE email=? AND code=? AND used=0 ORDER BY id DESC LIMIT 1', [email, String(code).trim()]);
    if (!r || new Date(r.expires_at) < new Date()) return null;
    return r;
  }
  function clientSession() {
    const id = Number(sessionStorage.getItem('nk-client') || 0);
    if (!id || !NK.db.db) return null;
    const c = NK.db.get('SELECT * FROM clients WHERE id=? AND portal_enabled=1', [id]);
    if (!c) { sessionStorage.removeItem('nk-client'); return null; }
    NK.session = { name: c.name, client_id: c.id, kind: 'klien' };
    return c;
  }

  NK.auth = { sha256, hashPin, PERMS, ROLES, permsOf, loadSession, login, logout, can, requestCode, verifyCode, clientSession };
})();
