/* Event Spotlight — database layer.
   - SQLite (sql.js / WebAssembly) held in memory, persisted as one binary blob in IndexedDB.
   - Every write runs inside a cross-tab lock (navigator.locks): reload latest -> apply -> save -> broadcast.
   - Other tabs receive a message (BroadcastChannel, with localStorage 'storage' event fallback) and reload. */
(function () {
  const ES = (window.ES = window.ES || {});
  const IDB_NAME = 'eventspotlight', IDB_STORE = 'store', CHANNEL = 'es-sync', LOCK = 'es-write';

  // ---------- IndexedDB helpers ----------
  let idbP = null;
  function idb() {
    if (!idbP) idbP = new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return idbP;
  }
  async function idbGet(key) {
    const d = await idb();
    return new Promise((res, rej) => { const q = d.transaction(IDB_STORE).objectStore(IDB_STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function idbPutMany(obj) {
    const d = await idb();
    return new Promise((res, rej) => {
      const tx = d.transaction(IDB_STORE, 'readwrite'); const st = tx.objectStore(IDB_STORE);
      Object.entries(obj).forEach(([k, v]) => (v === undefined ? st.delete(k) : st.put(v, k)));
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }

  // ---------- Lock (Web Locks API, with a simple in-tab fallback) ----------
  let chain = Promise.resolve();
  function withLock(fn) {
    if (navigator.locks && navigator.locks.request) return navigator.locks.request(LOCK, fn);
    const p = chain.then(fn); chain = p.catch(() => {}); return p;
  }

  // ---------- Sync messaging ----------
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
  const listeners = [];
  function broadcast(msg) {
    msg.t = Date.now(); msg.from = DB.tabId;
    try { bc && bc.postMessage(msg); } catch (e) { /* ignore */ }
    try { localStorage.setItem('es-sync', JSON.stringify(msg)); } catch (e) { /* ignore */ }
  }
  let lastSeen = '';
  async function onRemote(msg) {
    if (!msg || msg.from === DB.tabId) return;
    const key = msg.type + ':' + msg.ver + ':' + msg.t;
    if (key === lastSeen) return; // same message via both channels
    lastSeen = key;
    if (msg.type === 'reset') { DB.db = null; DB.state = 'none'; DB.version = 0; }
    else { await DB.syncFromStore(); }
    listeners.forEach((cb) => { try { cb(Object.assign({ remote: true }, msg)); } catch (e) { console.error(e); } });
  }
  if (bc) bc.onmessage = (e) => onRemote(e.data);
  window.addEventListener('storage', (e) => { if (e.key === 'es-sync' && e.newValue) { try { onRemote(JSON.parse(e.newValue)); } catch (x) { /* ignore */ } } });
  // Safety net: when a tab regains focus, make sure it has the newest version.
  window.addEventListener('focus', async () => {
    if (DB.state !== 'ready') return;
    const v = await idbGet('ver');
    if (v && v !== DB.version) { await DB.syncFromStore(); listeners.forEach((cb) => cb({ remote: true, type: 'changed', label: 're-synced' })); }
  });

  // ---------- Row helpers ----------
  function rowsFrom(res) {
    if (!res || !res[0]) return [];
    const { columns, values } = res[0];
    return values.map((v) => { const o = {}; columns.forEach((c, i) => (o[c] = v[i])); return o; });
  }

  const DB = {
    SQL: null, db: null, state: 'loading', version: 0, who: 'erp',
    tabId: Math.random().toString(36).slice(2),
    inWrite: false,

    async init(who) {
      this.who = who || 'erp';
      if (!window.initSqlJs) throw new Error('SQLite library (sql.js) did not load.');
      const bin = Uint8Array.from(atob(window.SQL_WASM_B64), (c) => c.charCodeAt(0));
      this.SQL = await window.initSqlJs({ wasmBinary: bin });
      await this.syncFromStore(true);
      return this.state;
    },

    // Load the latest saved database from IndexedDB if it is newer than ours.
    async syncFromStore(force) {
      const ver = await idbGet('ver');
      if (!ver) { this.db = null; this.state = 'none'; this.version = 0; return; }
      if (!force && ver === this.version && this.db) return;
      const bytes = await idbGet('db');
      if (!bytes) { this.state = 'none'; return; }
      if (this.db) { try { this.db.close(); } catch (e) { /* ignore */ } }
      this.db = new this.SQL.Database(bytes);
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.version = ver;
      this.state = 'ready';
      this.migrate();
    },

    migrate() {
      const cur = Number(this.val("SELECT value FROM settings WHERE key='schema_version'") || 1);
      if (cur >= ES.SCHEMA_VERSION) return;
      for (let v = cur + 1; v <= ES.SCHEMA_VERSION; v++) if (ES.MIGRATIONS[v]) this.db.exec(ES.MIGRATIONS[v]);
      this.db.exec("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','" + ES.SCHEMA_VERSION + "')");
    },

    // ----- reads -----
    all(sql, params) { return rowsFrom(this.db.exec(sql, params || [])); },
    get(sql, params) { return this.all(sql, params)[0] || null; },
    val(sql, params) {
      const r = this.db.exec(sql, params || []);
      return r[0] && r[0].values[0] ? r[0].values[0][0] : null;
    },
    setting(key, def) { const v = this.val('SELECT value FROM settings WHERE key=?', [key]); return v === null ? def : v; },

    // ----- writes (only inside DB.write) -----
    run(sql, params) {
      if (!this.inWrite && !this._creating) console.warn('DB.run outside DB.write:', sql);
      this.db.run(sql, params || []);
      return { id: this.val('SELECT last_insert_rowid()'), changes: this.db.getRowsModified() };
    },
    insert(table, obj) {
      const keys = Object.keys(obj);
      return this.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => norm(obj[k]))).id;
    },
    update(table, id, obj, idCol) {
      const keys = Object.keys(obj);
      if (!keys.length) return;
      this.run(`UPDATE ${table} SET ${keys.map((k) => k + '=?').join(',')} WHERE ${idCol || 'id'}=?`, keys.map((k) => norm(obj[k])).concat([id]));
    },
    setSetting(key, value) { this.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [key, String(value)]); },
    log(action, entity, entityId, detail) {
      const s = ES.session || {};
      this.run('INSERT INTO activity_log(at,actor,actor_kind,action,entity,entity_id,detail) VALUES(?,?,?,?,?,?,?)',
        [ES.fmt.nowStamp(), s.name || (this.who === 'erp' ? 'System' : 'Guest'), this.who, action, entity || null, entityId || null, detail || null]);
    },
    notify(target, title, body, extra) {
      extra = extra || {};
      this.run('INSERT INTO notifications(target,user_id,partner_id,title,body,link,created_at) VALUES(?,?,?,?,?,?,?)',
        [target, extra.user_id || null, extra.partner_id || null, title, body || '', extra.link || '', ES.fmt.nowStamp()]);
    },
    email(to, toName, subject, body, kind) {
      this.run('INSERT INTO outbox(to_email,to_name,subject,body,kind,created_at) VALUES(?,?,?,?,?,?)',
        [to, toName || '', subject, body, kind || 'general', ES.fmt.nowStamp()]);
    },

    /* Run fn() as one transaction under the cross-tab lock, then save and notify other tabs.
       fn must be synchronous. Returns fn's result. */
    async write(label, fn) {
      if (this.state !== 'ready') throw new Error('Database is not ready.');
      return withLock(async () => {
        await this.syncFromStore();
        this.inWrite = true;
        let result;
        this.db.exec('BEGIN');
        try { result = fn(); this.db.exec('COMMIT'); }
        catch (e) { try { this.db.exec('ROLLBACK'); } catch (x) { /* ignore */ } this.inWrite = false; throw e; }
        this.inWrite = false;
        await this.persist();
        const msg = { type: 'changed', ver: this.version, label, by: (ES.session && ES.session.name) || this.who, who: this.who };
        broadcast(msg);
        listeners.forEach((cb) => { try { cb(Object.assign({ remote: false }, msg)); } catch (e) { console.error(e); } });
        return result;
      });
    },

    async persist() {
      const bytes = this.db.export();
      this.db.exec('PRAGMA foreign_keys = ON;'); // export() resets pragmas
      this.version = (this.version || 0) + 1;
      await idbPutMany({ db: bytes, ver: this.version, savedAt: Date.now() });
    },

    onChange(cb) { listeners.push(cb); },

    // ----- lifecycle -----
    /* Create a brand-new database. builder(DB) fills it (seed functions use DB.insert/run). */
    async create(label, builder) {
      return withLock(async () => {
        if (this.db) { try { this.db.close(); } catch (e) { /* ignore */ } }
        this.db = new this.SQL.Database();
        this.db.exec(ES.SCHEMA_SQL);
        this._creating = true;
        this.db.exec('BEGIN');
        try {
          builder(this);
          this.setSetting('schema_version', ES.SCHEMA_VERSION);
          this.setSetting('created_at', ES.fmt.nowStamp());
          this.db.exec('COMMIT');
        } catch (e) { this.db.exec('ROLLBACK'); this._creating = false; this.db = null; throw e; }
        this._creating = false;
        this.version = (await idbGet('ver')) || 0;
        this.state = 'ready';
        await this.persist();
        broadcast({ type: 'created', ver: this.version, label });
        return true;
      });
    },

    async importBytes(u8) {
      const test = new this.SQL.Database(u8);
      const ok = test.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('org','users','events')");
      if (!ok[0] || ok[0].values.length < 3) { test.close(); throw new Error('File ini bukan database Event Spotlight.'); }
      test.close();
      return withLock(async () => {
        if (this.db) { try { this.db.close(); } catch (e) { /* ignore */ } }
        this.db = new this.SQL.Database(u8);
        this.db.exec('PRAGMA foreign_keys = ON;');
        this.migrate();
        this.version = (await idbGet('ver')) || 0;
        this.state = 'ready';
        await this.persist();
        broadcast({ type: 'created', ver: this.version, label: 'database import' });
      });
    },

    exportBytes() { const b = this.db.export(); this.db.exec('PRAGMA foreign_keys = ON;'); return b; },

    async reset() {
      return withLock(async () => {
        await idbPutMany({ db: undefined, ver: undefined, savedAt: undefined });
        if (this.db) { try { this.db.close(); } catch (e) { /* ignore */ } }
        this.db = null; this.state = 'none'; this.version = 0;
        broadcast({ type: 'reset', ver: 0 });
      });
    },

    sizeBytes() { return this.db ? this.db.export().length : 0; },
    async savedAt() { return idbGet('savedAt'); },
    tables() { return this.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name); }
  };

  function norm(v) {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) return JSON.stringify(v);
    return v;
  }

  ES.db = DB;
})();
