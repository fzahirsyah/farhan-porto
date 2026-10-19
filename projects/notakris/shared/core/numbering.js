/* NotaKris — document numbering. Formats are stored in settings ('numfmt.<TYPE>'),
   counters in the counters table. Tokens: {YYYY} {YY} {MM} {N..} (zero-padded sequence). */
(function () {
  const NK = (window.NK = window.NK || {});

  const DEFAULTS = {
    QUO: { label: 'Penawaran', fmt: 'QUO/{YYYY}/{MM}/{NNN}', reset: 'tahun' },
    INV: { label: 'Invoice', fmt: 'INV/{YYYY}/{MM}/{NNN}', reset: 'tahun' },
    KW: { label: 'Kwitansi', fmt: 'KW/{YYYY}/{MM}/{NNN}', reset: 'tahun' },
    PO: { label: 'Purchase order', fmt: 'PO/{YYYY}/{MM}/{NNN}', reset: 'tahun' },
    JOB: { label: 'Pekerjaan', fmt: 'PK/{YYYY}/{NNNN}', reset: 'tahun' },
    AKTA: { label: 'Akta notaris (reset tiap bulan)', fmt: '{N}', reset: 'bulan' },
    PPAT: { label: 'Akta PPAT', fmt: '{N}/{YYYY}', reset: 'tahun' },
    LEG: { label: 'Legalisasi', fmt: '{N}/L/{YYYY}', reset: 'tahun' },
    WAR: { label: 'Waarmerking', fmt: '{N}/W/{YYYY}', reset: 'tahun' },
    REP: { label: 'Nomor urut repertorium', fmt: '{N}', reset: 'tahun' }
  };

  function cfg(type) {
    const d = DEFAULTS[type] || { fmt: type + '/{YYYY}/{NNN}', reset: 'tahun' };
    return { label: d.label, fmt: NK.db.setting('numfmt.' + type, d.fmt), reset: NK.db.setting('numreset.' + type, d.reset) };
  }
  function counterKey(type, date, reset) {
    const [y, m] = date.split('-');
    return type + ':' + (reset === 'bulan' ? y + '-' + m : reset === 'tidak' ? 'all' : y);
  }
  function render(fmt, date, n) {
    const [y, m] = date.split('-');
    return fmt.replace('{YYYY}', y).replace('{YY}', y.slice(2)).replace('{MM}', m)
      .replace(/\{(N+)\}/, (_, ns) => String(n).padStart(ns.length, '0'));
  }
  function peek(type, date) {
    date = date || NK.fmt.today();
    const c = cfg(type); const key = counterKey(type, date, c.reset);
    const cur = Number(NK.db.val('SELECT value FROM counters WHERE key=?', [key]) || 0);
    return render(c.fmt, date, cur + 1);
  }
  // Must be called inside DB.write (or seeding)
  function next(type, date) {
    date = date || NK.fmt.today();
    const c = cfg(type); const key = counterKey(type, date, c.reset);
    const cur = Number(NK.db.val('SELECT value FROM counters WHERE key=?', [key]) || 0) + 1;
    NK.db.run('INSERT OR REPLACE INTO counters(key,value) VALUES(?,?)', [key, cur]);
    return { no: render(c.fmt, date, cur), seq: cur };
  }

  NK.num = { DEFAULTS, cfg, peek, next, render };
})();
