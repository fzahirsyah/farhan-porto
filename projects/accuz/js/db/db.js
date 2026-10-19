/* Buku — thin wrapper around a sql.js Database. Every write goes through tx() so changes are atomic
   and the storage layer is notified once per committed change. */
(function () {
  'use strict';
  const Buku = window.Buku;
  let SQL = null; // the sql.js module

  /** Load the sql.js engine from the embedded base64 WASM (works on file://). */
  async function loadEngine() {
    if (SQL) return SQL;
    const b64 = window.SQL_WASM_BASE64;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    SQL = await window.initSqlJs({
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(bin, imports).then((r) => done(r.instance, r.module));
        return {};
      },
    });
    return SQL;
  }

  class Db {
    constructor(raw) {
      this.raw = raw;
      this.depth = 0;
      this.onCommit = null;
      raw.exec('PRAGMA foreign_keys = ON;');
    }

    /** Run a statement; returns { changes, lastId }. */
    run(sql, params) {
      const st = this.raw.prepare(sql);
      try {
        st.run(params || []);
      } finally {
        st.free();
      }
      return { changes: this.raw.getRowsModified(), lastId: this.scalar('SELECT last_insert_rowid()') };
    }

    /** All rows as plain objects. */
    all(sql, params) {
      const st = this.raw.prepare(sql);
      const rows = [];
      try {
        st.bind(params || []);
        while (st.step()) rows.push(st.getAsObject());
      } finally {
        st.free();
      }
      return rows;
    }

    get(sql, params) {
      return this.all(sql, params)[0] || null;
    }

    scalar(sql, params) {
      const st = this.raw.prepare(sql);
      try {
        st.bind(params || []);
        return st.step() ? st.get()[0] : null;
      } finally {
        st.free();
      }
    }

    exec(sql) {
      this.raw.exec(sql);
    }

    /** Run fn inside a transaction (nested calls join the outer one). Rolls back on any error. */
    tx(fn) {
      if (this.depth > 0) {
        this.depth++;
        try {
          return fn(this);
        } finally {
          this.depth--;
        }
      }
      this.raw.exec('BEGIN');
      this.depth = 1;
      try {
        const result = fn(this);
        this.raw.exec('COMMIT');
        this.depth = 0;
        if (this.onCommit) this.onCommit();
        return result;
      } catch (e) {
        this.depth = 0;
        try { this.raw.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
        throw e;
      }
    }

    /** Insert an object into a table; returns the new id. */
    insert(table, obj) {
      const keys = Object.keys(obj);
      const sql = 'INSERT INTO ' + table + ' (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')';
      return this.run(sql, keys.map((k) => norm(obj[k]))).lastId;
    }

    update(table, id, obj) {
      const keys = Object.keys(obj);
      if (!keys.length) return;
      const sql = 'UPDATE ' + table + ' SET ' + keys.map((k) => k + '=?').join(',') + ' WHERE id=?';
      this.run(sql, keys.map((k) => norm(obj[k])).concat([id]));
    }

    meta(key, value) {
      if (value === undefined) return this.scalar('SELECT value FROM meta WHERE key=?', [key]);
      this.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
    }

    setting(key, value) {
      if (value === undefined) {
        const v = this.scalar('SELECT value FROM settings WHERE key=?', [key]);
        return v === null ? undefined : JSON.parse(v);
      }
      this.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
    }

    export() {
      if (this.depth > 0) throw new Buku.BukuError('busy', 'Cannot export during a transaction');
      const bytes = this.raw.export();
      // sql.js re-opens the database on export, which resets pragmas.
      this.raw.exec('PRAGMA foreign_keys = ON;');
      return bytes;
    }

    close() {
      this.raw.close();
    }
  }

  function norm(v) {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  }

  async function create(bytes) {
    const engine = await loadEngine();
    return new Db(bytes ? new engine.Database(bytes) : new engine.Database());
  }

  Buku.dbm = { loadEngine, create, Db };
})();
