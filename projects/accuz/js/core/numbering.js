/* Buku — document numbering. Patterns use {YYYY} {YY} {MM} {###…} {SALES}. */
(function () {
  'use strict';
  const Buku = window.Buku;

  function periodKey(reset, date) {
    if (reset === 'yearly') return date.slice(0, 4);
    if (reset === 'monthly') return date.slice(0, 7);
    return null;
  }

  /** Render a pattern for a given counter value and date. */
  function render(pattern, n, date, ctx) {
    ctx = ctx || {};
    const [y, m] = (date || Buku.util.today()).split('-');
    let out = pattern
      .replace(/\{YYYY\}/g, y)
      .replace(/\{YY\}/g, y.slice(2))
      .replace(/\{MM\}/g, m)
      .replace(/\{SALES\}/g, ctx.sales || 'XX');
    out = out.replace(/\{(#+)\}/g, (_, hashes) => String(n).padStart(hashes.length, '0'));
    return out;
  }

  function validatePattern(pattern) {
    if (!pattern || !/\{#+\}/.test(pattern)) throw new Buku.BukuError('invalid_pattern', 'The pattern needs a counter such as {####}.');
    if (/[^A-Za-z0-9{}#\-_/. ]/.test(pattern)) throw new Buku.BukuError('invalid_pattern', 'Use letters, numbers and - _ / . only.');
    return true;
  }

  /** Preview the next number without consuming it. */
  function peek(db, docType, date, ctx) {
    const seq = db.get('SELECT * FROM number_sequences WHERE doc_type=?', [docType]);
    if (!seq) throw new Buku.BukuError('no_sequence', 'No number sequence for ' + docType);
    const key = periodKey(seq.reset, date);
    const n = key && seq.last_period && key !== seq.last_period ? 1 : seq.next_number;
    return render(seq.pattern, n, date, ctx);
  }

  /** Take the next number (must run inside a transaction). Skips numbers already used. */
  function take(db, docType, date, ctx, existsFn) {
    return db.tx(() => {
      const seq = db.get('SELECT * FROM number_sequences WHERE doc_type=?', [docType]);
      if (!seq) throw new Buku.BukuError('no_sequence', 'No number sequence for ' + docType);
      const key = periodKey(seq.reset, date);
      let n = key && seq.last_period && key !== seq.last_period ? 1 : seq.next_number;
      let number = render(seq.pattern, n, date, ctx);
      let guard = 0;
      while (existsFn && existsFn(number)) {
        n++;
        number = render(seq.pattern, n, date, ctx);
        if (++guard > 100000) throw new Buku.BukuError('sequence_exhausted', 'Could not find a free number.');
      }
      db.run('UPDATE number_sequences SET next_number=?, last_period=? WHERE doc_type=?', [n + 1, key, docType]);
      return number;
    });
  }

  Buku.numbering = { render, peek, take, validatePattern, periodKey };
})();
