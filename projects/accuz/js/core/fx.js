/* Buku — exchange rates (IDR per 1 unit of foreign currency). */
(function () {
  'use strict';
  const Buku = window.Buku;

  function base(db) {
    return db.scalar('SELECT base_currency FROM company WHERE id=1') || 'IDR';
  }

  function decimals(db, code) {
    const d = db.scalar('SELECT decimals FROM currencies WHERE code=?', [code]);
    if (d === null) throw new Buku.BukuError('unknown_currency', 'Unknown currency ' + code);
    return d;
  }

  /** Rate on `date`, else the most recent earlier rate. Returns { rate, rate_date } or null. */
  function lookup(db, currency, date) {
    if (currency === base(db)) return { rate: '1', rate_date: date };
    return db.get('SELECT rate, rate_date FROM exchange_rates WHERE currency=? AND rate_date<=? ORDER BY rate_date DESC LIMIT 1', [currency, date]);
  }

  function set(db, currency, date, rate, source) {
    if (currency === base(db)) throw new Buku.BukuError('base_rate', 'The base currency always has rate 1.');
    if (!Buku.util.isIsoDate(date)) throw new Buku.BukuError('invalid_date', 'Invalid date');
    const r = Buku.money.rateToString(rate);
    db.tx(() => {
      db.run(
        'INSERT INTO exchange_rates(currency,rate_date,rate,source,created_at) VALUES(?,?,?,?,?) ON CONFLICT(currency,rate_date) DO UPDATE SET rate=excluded.rate, source=excluded.source',
        [currency, date, r, source || 'manual', Buku.util.nowIso()]
      );
    });
    return r;
  }

  function remove(db, id) {
    db.tx(() => db.run('DELETE FROM exchange_rates WHERE id=?', [id]));
  }

  /** Import "date,currency,rate" rows. Returns { imported, errors: [lineNo, message] }. */
  function importCsv(db, text) {
    const rows = Buku.util.parseCsv(text);
    let imported = 0;
    const errors = [];
    db.tx(() => {
      rows.forEach((r, i) => {
        if (i === 0 && /date|tanggal/i.test(r[0] || '')) return;
        try {
          const date = (r[0] || '').trim();
          const cur = (r[1] || '').trim().toUpperCase();
          const rate = (r[2] || '').trim();
          decimals(db, cur); // throws for unknown currencies
          set(db, cur, date, rate, 'csv');
          imported++;
        } catch (e) {
          errors.push([i + 1, e.message]);
        }
      });
    });
    return { imported, errors };
  }

  Buku.fx = { base, decimals, lookup, set, remove, importCsv };
})();
