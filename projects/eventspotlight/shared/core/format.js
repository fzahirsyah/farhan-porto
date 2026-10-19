/* Event Spotlight — formatting helpers (Rupiah, dates, escaping). English UI, Indonesian number and date style. */
(function () {
  const ES = (window.ES = window.ES || {});
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function iso(d) { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { if (!s) return null; if (s instanceof Date) return s; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  // The demo "today": real clock, unless the demo clock is pinned in settings (so seeded data always lines up).
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const addMonths = (s, n) => { const d = parse(s); d.setMonth(d.getMonth() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const daysFromToday = (s) => daysBetween(today(), s);
  const nowStamp = () => { const d = new Date(); return iso(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const hhmm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  function date(s, style) {
    if (!s) return '—';
    const d = parse(s);
    if (style === 'long') return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    if (style === 'day') return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
    if (style === 'dm') return d.getDate() + ' ' + MON[d.getMonth()];
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
  }
  const monthYear = (ym) => { const [y, m] = ym.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; };
  function stamp(s) { if (!s) return '—'; return date(s.slice(0, 10)) + (s.length > 10 ? ' ' + s.slice(11, 16) : ''); }

  function rp(n, opt) {
    if (n === null || n === undefined || n === '') return '';
    n = Number(n) || 0;
    const s = 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
    if (n < 0) return opt === 'minus' ? '-' + s : '(' + s + ')';
    return s;
  }
  function rpShort(n) {
    n = Number(n) || 0; const a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a >= 1e9) return sg + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' bn';
    if (a >= 1e6) return sg + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' m';
    return rp(n);
  }
  const num = (n) => (Number(n) || 0).toLocaleString('id-ID');
  const pct = (a, b, d) => (b ? ((a / b) * 100).toFixed(d === undefined ? 0 : d) + '%' : '—');
  function parseNum(s) {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    const neg = /^\s*[-(]/.test(s);
    const v = parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    return neg ? -v : v;
  }

  // Number in words (English), used on receipts ("Say: ...").
  function words(n) {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'zero';
    const f = (x) => {
      if (x < 20) return a[x];
      if (x < 100) return b[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : '');
      if (x < 1000) return a[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' ' + f(x % 100) : '');
      for (const [v, w] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) if (x >= v) return f(Math.floor(x / v)) + ' ' + w + (x % v ? ' ' + f(x % v) : '');
      return '';
    };
    return f(n);
  }
  const rupiahWords = (n) => { const t = words(n) + ' rupiah'; return t[0].toUpperCase() + t.slice(1); };

  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();
  const mask = (phone) => { phone = String(phone || ''); return phone.length > 6 ? phone.slice(0, 4) + '••••' + phone.slice(-3) : phone; };
  const normPhone = (p) => { p = String(p || '').replace(/[^\d+]/g, ''); if (p.startsWith('+62')) p = '0' + p.slice(3); else if (p.startsWith('62')) p = '0' + p.slice(2); return p; };

  ES.fmt = { pad, iso, parse, today, addDays, addMonths, daysBetween, daysFromToday, nowStamp, hhmm, date, monthYear, stamp, rp, rpShort, num, pct, parseNum, words, rupiahWords, esc, initials, mask, normPhone, MONTHS, MON, DAYS };
})();
