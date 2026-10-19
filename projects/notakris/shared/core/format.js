/* NotaKris — formatting helpers (Rupiah, dates, terbilang, escaping). */
(function () {
  const NK = (window.NK = window.NK || {});

  const pad = (n) => String(n).padStart(2, '0');
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  // ISO date (YYYY-MM-DD) in local time
  function iso(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parse(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const today = () => iso(new Date());
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function addMonths(s, n) { const d = parse(s); d.setMonth(d.getMonth() + n); return iso(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  const daysFromToday = (s) => daysBetween(today(), s);
  const nowStamp = () => { const d = new Date(); return iso(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };

  function tgl(s, style) {
    if (!s) return '—';
    const d = parse(s);
    if (style === 'long') return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
    if (style === 'day') return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear();
    if (style === 'dm') return d.getDate() + ' ' + BLN[d.getMonth()];
    return d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear();
  }
  const bulanTahun = (ym) => { const [y, m] = ym.split('-').map(Number); return BULAN[m - 1] + ' ' + y; };

  function rp(n, opt) {
    if (n === null || n === undefined || n === '') return '';
    n = Number(n) || 0;
    const s = 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
    if (n < 0) return opt === 'minus' ? '-' + s : '(' + s + ')';
    return s;
  }
  function rpShort(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e9) return 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(n) >= 1e6) return 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return rp(n);
  }
  const num = (n) => (Number(n) || 0).toLocaleString('id-ID');
  // "Rp 1.250.000" / "1.250.000" / "1250000" -> 1250000
  function parseNum(s) {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    const neg = /^\s*[-(]/.test(s);
    const v = parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    return neg ? -v : v;
  }

  function terbilang(n) {
    const w = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    n = Math.floor(Math.abs(n));
    if (n < 12) return w[n];
    if (n < 20) return terbilang(n - 10) + ' belas';
    if (n < 100) return terbilang(n / 10) + ' puluh' + (n % 10 ? ' ' + terbilang(n % 10) : '');
    if (n < 200) return 'seratus' + (n - 100 ? ' ' + terbilang(n - 100) : '');
    if (n < 1000) return terbilang(n / 100) + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
    if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + terbilang(n - 1000) : '');
    if (n < 1e6) return terbilang(n / 1000) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
    if (n < 1e9) return terbilang(n / 1e6) + ' juta' + (n % 1e6 ? ' ' + terbilang(n % 1e6) : '');
    if (n < 1e12) return terbilang(n / 1e9) + ' miliar' + (n % 1e9 ? ' ' + terbilang(n % 1e9) : '');
    return terbilang(n / 1e12) + ' triliun' + (n % 1e12 ? ' ' + terbilang(n % 1e12) : '');
  }
  function terbilangRupiah(n) {
    if (!n) return 'Nol rupiah';
    const t = terbilang(n) + ' rupiah';
    return t[0].toUpperCase() + t.slice(1);
  }
  // Date in words for deeds: "dua puluh Oktober dua ribu dua puluh enam"
  function tanggalTerbilang(s) {
    const d = parse(s);
    return terbilang(d.getDate()) + ' ' + BULAN[d.getMonth()] + ' ' + terbilang(d.getFullYear());
  }

  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const initials = (name) => String(name || '?').replace(/^(Bpk\.|Ibu|Sdr\.|dr\.|H\.|Hj\.|Ir\.)\s*/i, '').split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();

  NK.fmt = { pad, iso, parse, today, addDays, addMonths, daysBetween, daysFromToday, nowStamp, tgl, bulanTahun, rp, rpShort, num, parseNum, terbilang, terbilangRupiah, tanggalTerbilang, esc, initials, BULAN, BLN, HARI };
})();
