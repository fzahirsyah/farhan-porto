/* Event Spotlight — document numbering. Formats live in settings ('numfmt.<TYPE>'), counters in the counters table.
   Tokens: {YYYY} {YY} {MM} {N..} (zero-padded sequence). */
(function () {
  const ES = (window.ES = window.ES || {});
  const DEFAULTS = {
    QUO: { label: 'Quotation', fmt: 'QUO/{YYYY}/{MM}/{NNN}', reset: 'year' },
    CON: { label: 'Contract', fmt: 'CON/{YYYY}/{MM}/{NNN}', reset: 'year' },
    INV: { label: 'Invoice', fmt: 'INV/{YYYY}/{MM}/{NNN}', reset: 'year' },
    KW: { label: 'Receipt (kwitansi)', fmt: 'KW/{YYYY}/{MM}/{NNN}', reset: 'year' },
    PO: { label: 'Purchase order', fmt: 'PO/{YYYY}/{MM}/{NNN}', reset: 'year' },
    PRO: { label: 'Proposal', fmt: 'PRO/{YYYY}/{NNN}', reset: 'year' },
    ORD: { label: 'Ticket order', fmt: 'ORD-{YY}{MM}-{NNNNN}', reset: 'never' },
    JRN: { label: 'Journal entry', fmt: 'JV/{YYYY}/{NNNN}', reset: 'year' }
  };
  function cfg(type) {
    const d = DEFAULTS[type] || { fmt: type + '/{YYYY}/{NNN}', reset: 'year' };
    return { label: d.label, fmt: ES.db.setting('numfmt.' + type, d.fmt), reset: ES.db.setting('numreset.' + type, d.reset) };
  }
  function counterKey(type, date, reset) {
    const [y, m] = date.split('-');
    return type + ':' + (reset === 'month' ? y + '-' + m : reset === 'never' ? 'all' : y);
  }
  function render(fmt, date, n) {
    const [y, m] = date.split('-');
    return fmt.replace('{YYYY}', y).replace('{YY}', y.slice(2)).replace('{MM}', m).replace(/\{(N+)\}/, (_, ns) => String(n).padStart(ns.length, '0'));
  }
  function peek(type, date) {
    date = date || ES.fmt.today(); const c = cfg(type); const key = counterKey(type, date, c.reset);
    return render(c.fmt, date, Number(ES.db.val('SELECT value FROM counters WHERE key=?', [key]) || 0) + 1);
  }
  // Must run inside DB.write (or seeding).
  function next(type, date) {
    date = date || ES.fmt.today(); const c = cfg(type); const key = counterKey(type, date, c.reset);
    const cur = Number(ES.db.val('SELECT value FROM counters WHERE key=?', [key]) || 0) + 1;
    ES.db.run('INSERT OR REPLACE INTO counters(key,value) VALUES(?,?)', [key, cur]);
    return render(c.fmt, date, cur);
  }
  ES.num = { DEFAULTS, cfg, peek, next, render };
})();
