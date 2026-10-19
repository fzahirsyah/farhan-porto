/* Buku — persistence.
   Working copy: sql.js database in memory.
   Browser copy: IndexedDB, autosaved ~1s after every committed change (survives reload).
   File copy: a real .sqlite file. Chrome/Edge save back to the same file; other browsers download. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const IDB_NAME = 'buku';
  const IDB_VERSION = 1;
  const AUTO_BACKUP_EVERY_MS = 10 * 60 * 1000;
  const AUTO_BACKUPS_KEPT = 3;

  // ---------- IndexedDB helpers ----------
  let idbPromise = null;
  function idb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(IDB_NAME, IDB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('companies')) d.createObjectStore('companies', { keyPath: 'file_id' });
        if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles');
        if (!d.objectStoreNames.contains('backups')) {
          const s = d.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
          s.createIndex('file_id', 'file_id');
        }
        if (!d.objectStoreNames.contains('state')) d.createObjectStore('state');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbPromise;
  }

  async function idbDo(store, mode, fn) {
    const d = await idb();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s);
      if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('IndexedDB aborted'));
    });
  }
  const idbGet = (store, key) => idbDo(store, 'readonly', (s) => s.get(key));
  const idbPut = (store, value, key) => idbDo(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
  const idbDel = (store, key) => idbDo(store, 'readwrite', (s) => s.delete(key));
  const idbAll = (store) => idbDo(store, 'readonly', (s) => s.getAll());

  // ---------- State ----------
  const state = {
    db: null,
    fileId: null,
    fileName: null,
    handle: null, // FileSystemFileHandle when the browser supports it
    browserSaved: true, // working copy == browser copy
    fileDirty: false, // changes not yet written to a .sqlite file
    lastFileSave: null,
    lastBrowserSave: null,
    lastAutoBackup: 0,
    error: null,
  };
  const listeners = new Set();
  function emit() { listeners.forEach((fn) => { try { fn(status()); } catch (e) { console.error(e); } }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function status() {
    return {
      open: !!state.db,
      fileName: state.fileName,
      hasHandle: !!state.handle,
      browserSaved: state.browserSaved,
      fileDirty: state.fileDirty,
      lastFileSave: state.lastFileSave,
      lastBrowserSave: state.lastBrowserSave,
      error: state.error,
    };
  }

  function companyName(db) {
    return db.scalar('SELECT name FROM company WHERE id=1') || 'Accu-Z Accounting';
  }

  function safeFileName(name) {
    return (name || 'buku').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.sqlite';
  }

  // ---------- Autosave ----------
  const scheduleSave = Buku.util.debounce(() => { saveToBrowser().catch((e) => console.error(e)); }, 800);

  function attach(db) {
    db.onCommit = () => {
      state.browserSaved = false;
      state.fileDirty = true;
      emit();
      scheduleSave();
    };
  }

  async function saveToBrowser() {
    if (!state.db) return;
    try {
      const bytes = state.db.export();
      const prev = (await idbGet('companies', state.fileId)) || {};
      await idbPut('companies', {
        file_id: state.fileId,
        name: companyName(state.db),
        bytes,
        saved_at: Buku.util.nowIso(),
        file_name: state.fileName,
        file_dirty: state.fileDirty,
        last_file_save: state.lastFileSave,
        created_at: prev.created_at || Buku.util.nowIso(),
      });
      if (Date.now() - state.lastAutoBackup > AUTO_BACKUP_EVERY_MS) {
        state.lastAutoBackup = Date.now();
        await addBackup(bytes, 'auto');
      }
      state.browserSaved = true;
      state.lastBrowserSave = Buku.util.nowIso();
      state.error = null;
    } catch (e) {
      state.error = 'browser_save_failed';
      console.error('Autosave failed', e);
    }
    emit();
  }

  async function addBackup(bytes, reason) {
    await idbPut('backups', { file_id: state.fileId, at: Buku.util.nowIso(), reason, bytes });
    const all = (await idbAll('backups')).filter((b) => b.file_id === state.fileId && b.reason === 'auto').sort((a, b) => a.id - b.id);
    while (all.length > AUTO_BACKUPS_KEPT) await idbDel('backups', all.shift().id);
  }

  async function listBackups(fileId) {
    return (await idbAll('backups')).filter((b) => b.file_id === (fileId || state.fileId)).map((b) => ({ id: b.id, at: b.at, reason: b.reason, size: b.bytes.length })).sort((a, b) => b.at.localeCompare(a.at));
  }

  async function getBackup(id) {
    return idbGet('backups', id);
  }

  // ---------- Open / create ----------
  async function adopt(db, opts) {
    if (state.db && state.db !== db) { try { state.db.close(); } catch (e) { /* ignore */ } }
    state.db = db;
    state.fileId = db.meta('file_id');
    state.fileName = opts.fileName || null;
    state.handle = opts.handle || null;
    state.fileDirty = !!opts.fileDirty;
    state.lastFileSave = opts.lastFileSave || null;
    state.browserSaved = false;
    attach(db);
    Buku.db = db;
    await idbPut('state', state.fileId, 'last');
    if (state.handle) { try { await idbPut('handles', state.handle, state.fileId); } catch (e) { /* not cloneable */ } }
    await saveToBrowser();
    requestPersistence();
  }

  /** Create a brand-new company file. */
  async function createNew(input) {
    const db = await Buku.dbm.create();
    Buku.schema.migrate(db);
    Buku.seed.initCompany(db, input);
    await adopt(db, { fileDirty: true });
    return db;
  }

  /**
   * Open a .sqlite file's bytes. Migrates older files (after backing them up).
   * Returns { db, conflict } — conflict is set when this browser holds unsaved changes for the same company.
   */
  async function openBytes(bytes, opts) {
    opts = opts || {};
    const db = await Buku.dbm.create(bytes);
    let fileId;
    try {
      const hasMeta = db.scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='meta'");
      fileId = hasMeta ? db.meta('file_id') : null;
      if (!fileId || db.meta('app') !== 'Buku') throw new Buku.BukuError('not_buku', 'This is not a compatible Accu-Z Accounting company file.');
    } catch (e) {
      db.close();
      if (e.code) throw e;
      throw new Buku.BukuError('not_buku', 'This is not a compatible Accu-Z Accounting company file.');
    }
    const existing = await idbGet('companies', fileId);
    if (existing && existing.file_dirty && !opts.force) {
      db.close();
      return { conflict: { fileId, name: existing.name, savedAt: existing.saved_at } };
    }
    const from = Buku.schema.currentVersion(db);
    if (from < Buku.schema.LATEST) {
      state.fileId = fileId;
      await addBackup(new Uint8Array(bytes), 'before_upgrade_v' + from);
      Buku.schema.migrate(db);
    }
    await adopt(db, { fileName: opts.fileName, handle: opts.handle, fileDirty: !!opts.fileDirty || from < Buku.schema.LATEST });
    return { db };
  }

  /** Reopen a company stored in this browser. */
  async function openFromBrowser(fileId) {
    const rec = await idbGet('companies', fileId);
    if (!rec) throw new Buku.BukuError('not_found', 'Company not found in this browser.');
    const db = await Buku.dbm.create(rec.bytes);
    const before = Buku.schema.currentVersion(db);
    if (before < Buku.schema.LATEST) {
      state.fileId = fileId;
      await addBackup(new Uint8Array(rec.bytes), 'before_upgrade_v' + before);
      Buku.schema.migrate(db);
    }
    let handle = null;
    try { handle = (await idbGet('handles', fileId)) || null; } catch (e) { handle = null; }
    await adopt(db, { fileName: rec.file_name, handle, fileDirty: !!rec.file_dirty || before < Buku.schema.LATEST, lastFileSave: rec.last_file_save });
    return db;
  }

  async function lastOpenedId() {
    try { return await idbGet('state', 'last'); } catch (e) { return null; }
  }

  async function listCompanies() {
    try {
      return (await idbAll('companies'))
        .map((c) => ({ file_id: c.file_id, name: c.name, saved_at: c.saved_at, file_name: c.file_name, file_dirty: c.file_dirty, size: c.bytes ? c.bytes.length : 0 }))
        .sort((a, b) => (b.saved_at || '').localeCompare(a.saved_at || ''));
    } catch (e) {
      return [];
    }
  }

  async function removeCompany(fileId) {
    await idbDel('companies', fileId);
    try { await idbDel('handles', fileId); } catch (e) { /* ignore */ }
    for (const b of await listBackups(fileId)) await idbDel('backups', b.id);
    if ((await lastOpenedId()) === fileId) await idbDel('state', 'last');
  }

  async function close() {
    if (!state.db) return;
    if (!state.browserSaved) await saveToBrowser();
    try { state.db.close(); } catch (e) { /* ignore */ }
    state.db = null;
    Buku.db = null;
    state.fileId = null;
    state.handle = null;
    state.fileName = null;
    await idbDel('state', 'last');
    emit();
  }

  // ---------- Save to file ----------
  const canSaveInPlace = () => typeof window.showSaveFilePicker === 'function';

  async function markFileSaved(name) {
    state.fileDirty = false;
    state.fileName = name || state.fileName;
    state.lastFileSave = Buku.util.nowIso();
    state.db.meta('last_file_save', state.lastFileSave);
    await saveToBrowser();
  }

  /**
   * Save to a .sqlite file. opts.as forces "save as". Returns 'saved' | 'downloaded' | 'cancelled'.
   */
  async function saveToFile(opts) {
    opts = opts || {};
    if (!state.db) return 'cancelled';
    const suggested = state.fileName || safeFileName(companyName(state.db));
    if (canSaveInPlace()) {
      let handle = opts.as ? null : state.handle;
      try {
        if (handle && handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') handle = null;
        }
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            types: [{ description: 'Accu-Z Accounting company file', accept: { 'application/vnd.sqlite3': ['.sqlite', '.db'] } }],
          });
        }
        const w = await handle.createWritable();
        await w.write(state.db.export());
        await w.close();
        state.handle = handle;
        try { await idbPut('handles', handle, state.fileId); } catch (e) { /* ignore */ }
        await markFileSaved(handle.name);
        return 'saved';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        console.warn('Save in place failed, falling back to download', e);
      }
    }
    Buku.util.download(suggested, new Blob([state.db.export()], { type: 'application/vnd.sqlite3' }));
    await markFileSaved(suggested);
    return 'downloaded';
  }

  /** Download a timestamped backup copy without changing the "saved to file" status. */
  function downloadBackup() {
    const d = new Date();
    const p = Buku.util.pad;
    const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
    const base = (state.fileName || safeFileName(companyName(state.db))).replace(/\.(sqlite|db)$/i, '');
    Buku.util.download(base + ' backup ' + stamp + '.sqlite', new Blob([state.db.export()], { type: 'application/vnd.sqlite3' }));
    // Written outside tx() on purpose: a backup is not a change that needs saving to the file.
    state.db.meta('last_backup_at', Buku.util.nowIso());
    saveToBrowser();
  }

  /** Pick a file: File System Access API when available (keeps a handle for saving back), else <input type=file>. */
  async function pickFile() {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Accu-Z Accounting company file', accept: { 'application/vnd.sqlite3': ['.sqlite', '.db', '.sqlite3'] } }],
        });
        const f = await handle.getFile();
        return { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name, handle };
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
      }
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sqlite,.db,.sqlite3';
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return resolve(null);
        resolve({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name, handle: null });
      };
      input.click();
    });
  }

  function requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  }

  window.addEventListener('beforeunload', (ev) => {
    if (state.db && !state.browserSaved) {
      // Try one last synchronous-ish save; also ask the browser to confirm leaving.
      saveToBrowser();
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  Buku.store = {
    state, status, onChange, createNew, openBytes, openFromBrowser, lastOpenedId, listCompanies, removeCompany, close,
    saveToFile, saveToBrowser, downloadBackup, pickFile, canSaveInPlace, listBackups, getBackup, safeFileName,
  };
})();
