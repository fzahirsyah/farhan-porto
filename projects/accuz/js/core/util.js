/* Buku — shared utilities. Classic script: everything hangs off window.Buku. */
(function () {
  'use strict';
  const Buku = (window.Buku = window.Buku || {});

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escape any value for safe insertion into HTML. */
  function h(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  function pad(n, w) {
    return String(n).padStart(w || 2, '0');
  }

  /** Today's date as ISO YYYY-MM-DD in local time. */
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isIsoDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /** Add days to an ISO date. */
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  /** First day of the month containing iso, shifted by `months`. */
  function monthStart(iso, months) {
    const [y, m] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + (months || 0), 1));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-01';
  }

  function monthEnd(iso) {
    return addDays(monthStart(iso, 1), -1);
  }

  /** Start of the fiscal year containing iso, given the start month (1–12). */
  function fiscalYearStart(iso, startMonth) {
    const [y, m] = iso.split('-').map(Number);
    const sm = startMonth || 1;
    const year = m >= sm ? y : y - 1;
    return year + '-' + pad(sm) + '-01';
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** Build a CSV string (RFC 4180) with a UTF-8 BOM so Excel reads Indonesian text correctly. */
  function toCsv(rows) {
    const cell = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  /** Parse CSV text into rows of strings. Handles quotes, commas, semicolons or tabs. */
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of firstLine) if (ch in counts) counts[ch]++;
    const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Safe localStorage access for small UI preferences (may be unavailable). */
  const prefs = {
    get(k, d) {
      try { const v = localStorage.getItem('buku.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('buku.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
  };

  class BukuError extends Error {
    constructor(code, message, details) {
      super(message || code);
      this.code = code;
      this.details = details;
    }
  }

  Buku.util = { h, pad, today, nowIso, isIsoDate, addDays, monthStart, monthEnd, fiscalYearStart, debounce, uuid, toCsv, parseCsv, download, prefs };
  Buku.BukuError = BukuError;
})();
