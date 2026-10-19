/* Event Spotlight — users, roles, permissions, sessions, partner and buyer login codes.
   NOTE: this is a browser-only prototype. PINs are hashed, but anyone with access to this browser profile can read the database.
   A real deployment needs a server. */
(function () {
  const ES = (window.ES = window.ES || {});

  // Compact synchronous SHA-256 (works in seeds and without a secure context).
  function sha256(ascii) {
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const maxWord = Math.pow(2, 32); let result = ''; const words = []; const bitLen = ascii.length * 8;
    let hash = (sha256.h = sha256.h || []); const k = (sha256.k = sha256.k || []); let primeCounter = k.length;
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
    while ((ascii.length % 64) - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) { const j = ascii.charCodeAt(i); words[i >> 2] |= j << (((3 - i) % 4) * 8); }
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
  const hashPin = (pin) => sha256('eventspotlight:' + String(pin));

  const PERMS = {
    home: 'Home', projects: 'Projects and events', ticketing: 'Ticketing (view)', 'ticketing.rules': 'Change ticket rules', 'ticketing.draw': 'Run lottery draws',
    'ticketing.refund': 'Refund and void tickets', disputes: 'Dispute desk', marketing: 'Marketing and promotors', sponsors: 'Sponsor pipeline',
    proposals: 'Proposal generator', 'proposals.send': 'Send proposals', artists: 'Artists', 'artists.approve': 'Approve artist requests',
    vendors: 'Vendors and purchase orders', 'vendors.confirm': 'Confirm deliveries', 'pay.approve': 'Approve vendor payments', accounting: 'Accounting',
    'accounting.post': 'Post journals and lock periods', layout: 'Layout editor', schedule: 'Schedule and rundown', checklists: 'Checklists',
    control: 'Event-day control room', reports: 'Reports', 'data.export': 'Export attendee data', staff: 'Staff', settings: 'Settings', 'config.eo': 'EO-level configuration',
    database: 'Database tools', outbox: 'Outbox', 'contracts.approve': 'Approve contracts', crew: 'Crew app'
  };
  const ALL = Object.keys(PERMS);
  const ROLES = {
    owner: { label: 'Owner', perms: ALL },
    director: { label: 'Director', perms: ALL.filter((p) => !['pay.approve', 'database'].includes(p)) },
    finance: { label: 'Finance', perms: ['home', 'projects', 'ticketing', 'vendors', 'pay.approve', 'accounting', 'accounting.post', 'reports', 'outbox', 'proposals', 'marketing', 'sponsors'] },
    producer: { label: 'Producer', perms: ['home', 'projects', 'ticketing', 'marketing', 'sponsors', 'artists', 'artists.approve', 'vendors', 'vendors.confirm', 'layout', 'schedule', 'checklists', 'control', 'reports', 'disputes', 'crew', 'outbox'] },
    ticketing: { label: 'Ticketing lead', perms: ['home', 'ticketing', 'ticketing.rules', 'ticketing.draw', 'disputes', 'marketing', 'control', 'reports', 'crew', 'outbox'] },
    partnerships: { label: 'Partnerships lead', perms: ['home', 'projects', 'sponsors', 'proposals', 'proposals.send', 'marketing', 'reports', 'outbox'] },
    crew: { label: 'Crew (gate and PIC)', perms: ['crew', 'checklists'] }
  };
  function permsOf(user) {
    if (!user) return new Set();
    const base = new Set((ROLES[user.role] || { perms: [] }).perms);
    let ov = {}; try { ov = JSON.parse(user.perm_override || '{}'); } catch (e) { /* ignore */ }
    Object.entries(ov).forEach(([p, on]) => (on ? base.add(p) : base.delete(p)));
    return base;
  }

  // Per-tab session (sessionStorage), keyed per surface so the ERP and crew app can be open in the same browser window.
  let SKEY = 'es-user';
  function useSessionKey(k) { SKEY = k; }
  function loadSession() {
    const id = Number(sessionStorage.getItem(SKEY) || 0);
    if (!id || !ES.db.db) { ES.session = null; return null; }
    const u = ES.db.get('SELECT * FROM users WHERE id=? AND active=1', [id]);
    if (!u) { sessionStorage.removeItem(SKEY); ES.session = null; return null; }
    ES.session = Object.assign(u, { perms: permsOf(u) });
    return ES.session;
  }
  function login(userId, pin) {
    const u = ES.db.get('SELECT * FROM users WHERE id=? AND active=1', [userId]);
    if (!u || u.pin_hash !== hashPin(pin)) return false;
    sessionStorage.setItem(SKEY, String(u.id)); loadSession(); return true;
  }
  function logout() { sessionStorage.removeItem(SKEY); ES.session = null; }
  const can = (perm) => !!(ES.session && ES.session.perms && ES.session.perms.has(perm));

  // Emailed one-time codes (simulated: the email lands in the ERP Outbox). kind: 'partner' | 'buyer'.
  function issueCode(kind, ref, email, name, subject, intro) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exp = new Date(Date.now() + 15 * 60000).toISOString();
    ES.db.run('INSERT INTO login_codes(kind,ref,code,created_at,expires_at) VALUES(?,?,?,?,?)', [kind, String(ref), code, ES.fmt.nowStamp(), exp]);
    const org = ES.db.get('SELECT * FROM org WHERE id=1') || {};
    ES.db.email(email, name, subject + ': ' + code, `Hello ${name},\n\n${intro}\nYour code: ${code}\nIt is valid for 15 minutes. Do not share it with anyone.\n\n${org.name || 'Event Spotlight'}`, 'login-code');
    return code;
  }
  function verifyCode(kind, ref, code) {
    const r = ES.db.get('SELECT * FROM login_codes WHERE kind=? AND ref=? AND code=? AND used=0 ORDER BY id DESC LIMIT 1', [kind, String(ref), String(code).trim()]);
    if (!r || new Date(r.expires_at) < new Date()) return null;
    return r;
  }

  ES.auth = { sha256, hashPin, PERMS, ROLES, permsOf, loadSession, login, logout, can, useSessionKey, issueCode, verifyCode };
})();
