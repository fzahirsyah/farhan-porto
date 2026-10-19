/* Buku — integer money math. Amounts are integers in minor units (IDR: rupiah, USD/SGD: cents).
   Exchange rates are decimal strings ("16250.5") handled as BigInt fixed-point; no floats touch money. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const RATE_SCALE = 1000000n; // rates keep 6 decimal places

  const SEP = {
    id: { group: '.', decimal: ',' },
    en: { group: ',', decimal: '.' },
  };

  function seps(locale) {
    return SEP[locale] || SEP.id;
  }

  function groupDigits(intStr, sep) {
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }

  /**
   * Format minor units for display.
   * opts: { locale: 'id'|'en', code: 'IDR', parens: bool (negatives in brackets), blankZero: bool, dashZero: bool }
   */
  function format(minor, decimals, opts) {
    opts = opts || {};
    if (minor === null || minor === undefined || minor === '') return '';
    let n = BigInt(Math.round(Number(minor)));
    if (n === 0n && opts.blankZero) return '';
    const s = seps(opts.locale || Buku.i18n?.lang || 'id');
    const neg = n < 0n;
    if (neg) n = -n;
    const d = decimals || 0;
    const div = 10n ** BigInt(d);
    const intPart = groupDigits((n / div).toString(), s.group);
    let out = intPart;
    if (d > 0) out += s.decimal + (n % div).toString().padStart(d, '0');
    if (n === 0n && opts.dashZero) out = '-';
    if (opts.code) out = opts.code + ' ' + out;
    if (neg) out = opts.parens ? '(' + out + ')' : '-' + out;
    return out;
  }

  /**
   * Parse user input into minor units. Accepts "1.250.000", "1,250,000.50", "Rp 1.250.000,5", "-500".
   * The decimal separator is the locale's; if the other separator appears last and is followed by
   * exactly `decimals` or fewer digits (and the locale separator is absent), it is treated as decimal too.
   * Returns null for empty input; throws BukuError('invalid_amount') for garbage.
   */
  function parse(input, decimals, locale) {
    if (input === null || input === undefined) return null;
    let str = String(input).trim();
    if (str === '') return null;
    const s = seps(locale || Buku.i18n?.lang || 'id');
    let neg = false;
    if (/^\(.*\)$/.test(str)) { neg = true; str = str.slice(1, -1); }
    if (str.startsWith('-')) { neg = !neg; str = str.slice(1).trim(); }
    // Strip a currency prefix or suffix (Rp, IDR, USD, SGD, US$, S$, $) but nothing else.
    str = str.replace(/^(rp\.?|idr|usd|sgd|us\$|s\$|\$)\s*/i, '').replace(/\s*(idr|usd|sgd)$/i, '').replace(/\s/g, '');
    if (str.startsWith('-')) { neg = !neg; str = str.slice(1); }
    if (!/^[\d.,]+$/.test(str)) throw new Buku.BukuError('invalid_amount', 'Invalid amount: ' + input);

    const d = decimals || 0;
    let intPart = str, fracPart = '';
    const lastDec = str.lastIndexOf(s.decimal);
    if (lastDec >= 0) {
      intPart = str.slice(0, lastDec);
      fracPart = str.slice(lastDec + 1);
    } else {
      // Tolerate the other convention for decimals, e.g. "12.5" typed in Indonesian mode for USD.
      const other = s.group;
      const lastOther = str.lastIndexOf(other);
      const occurrences = str.split(other).length - 1;
      if (d > 0 && lastOther >= 0 && occurrences === 1 && str.length - lastOther - 1 <= d && str.length - lastOther - 1 !== 3) {
        intPart = str.slice(0, lastOther);
        fracPart = str.slice(lastOther + 1);
      }
    }
    intPart = intPart.split(s.group).join('').split(s.decimal).join('');
    if (intPart !== '' && /[^\d]/.test(intPart)) throw new Buku.BukuError('invalid_amount', 'Invalid amount: ' + input);
    if (/[^\d]/.test(fracPart)) throw new Buku.BukuError('invalid_amount', 'Invalid amount: ' + input);
    if (fracPart.length > d) {
      // Round half up on the extra digits.
      const keep = fracPart.slice(0, d);
      const next = Number(fracPart[d]);
      let val = BigInt((intPart || '0') + keep.padEnd(d, '0'));
      if (next >= 5) val += 1n;
      return Number(neg ? -val : val);
    }
    const val = BigInt((intPart || '0') + fracPart.padEnd(d, '0'));
    return Number(neg ? -val : val);
  }

  /** Parse a rate string like "16250.50" or "16.250,50" into BigInt scaled by 1e6. */
  function parseRate(rate) {
    if (rate === null || rate === undefined || rate === '') throw new Buku.BukuError('invalid_rate', 'Missing exchange rate');
    let s = String(rate).trim().replace(/\s/g, '');
    // Accept either convention: the last separator followed by 1–6 digits that isn't a 3-digit group is decimal.
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    const lastSep = Math.max(lastDot, lastComma);
    let intPart = s, frac = '';
    if (lastSep >= 0) {
      const tail = s.slice(lastSep + 1);
      const sepChar = s[lastSep];
      const count = s.split(sepChar).length - 1;
      const bothUsed = lastDot >= 0 && lastComma >= 0;
      // A single separator followed by exactly 3 digits is a thousands group ("16.250" = 16250),
      // because rates here are IDR per foreign unit and are always large; "0.065" stays decimal.
      if (bothUsed || (count === 1 && (tail.length !== 3 || s.slice(0, lastSep) === '0'))) {
        intPart = s.slice(0, lastSep);
        frac = tail;
      }
    }
    intPart = intPart.replace(/[.,]/g, '');
    if (!/^\d+$/.test(intPart) || !/^\d*$/.test(frac)) throw new Buku.BukuError('invalid_rate', 'Invalid exchange rate: ' + rate);
    const scaled = BigInt(intPart) * RATE_SCALE + BigInt((frac + '000000').slice(0, 6));
    if (scaled <= 0n) throw new Buku.BukuError('invalid_rate', 'Exchange rate must be greater than zero');
    return scaled;
  }

  /** Normalise a rate to a canonical string ("16250.5"). */
  function rateToString(rate) {
    const v = typeof rate === 'bigint' ? rate : parseRate(rate);
    const i = v / RATE_SCALE;
    let f = (v % RATE_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
    return f ? i + '.' + f : i.toString();
  }

  function formatRate(rate, locale) {
    const s = seps(locale || Buku.i18n?.lang || 'id');
    const [i, f] = rateToString(rate).split('.');
    return groupDigits(i, s.group) + (f ? s.decimal + f : '');
  }

  /** Divide BigInts rounding half away from zero. */
  function divRound(num, den) {
    const neg = (num < 0n) !== (den < 0n);
    const n = num < 0n ? -num : num;
    const d = den < 0n ? -den : den;
    let q = n / d;
    if ((n % d) * 2n >= d) q += 1n;
    return neg ? -q : q;
  }

  /** Convert minor units of a currency with `decimals` to base (IDR, 0 decimals) at `rate` (IDR per unit). */
  function toBase(minor, decimals, rate) {
    if (!minor) return 0;
    const r = parseRate(rate);
    const num = BigInt(minor) * r;
    const den = (10n ** BigInt(decimals || 0)) * RATE_SCALE;
    return Number(divRound(num, den));
  }

  /** amount × num / den, rounded half up (used for tax bases such as 11/12). */
  function mulFrac(minor, num, den) {
    return Number(divRound(BigInt(minor) * BigInt(num), BigInt(den)));
  }

  /** amount × percent (percent is a decimal string such as "12" or "2.5"), rounded half up. */
  function percentOf(minor, percent) {
    const p = parseRate(percent); // percent × 1e6
    return Number(divRound(BigInt(minor) * p, 100n * RATE_SCALE));
  }

  Buku.money = { format, parse, parseRate, rateToString, formatRate, toBase, mulFrac, percentOf, divRound };
})();
