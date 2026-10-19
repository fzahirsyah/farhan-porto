/* Buku — amounts in words (terbilang) in Indonesian and English. */
(function () {
  'use strict';
  const Buku = window.Buku;

  const ID_UNITS = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  function idWords(n) {
    n = Math.floor(n);
    if (n < 12) return ID_UNITS[n];
    if (n < 20) return idWords(n - 10) + ' belas';
    if (n < 100) return idWords(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + idWords(n % 10) : '');
    if (n < 200) return 'seratus' + (n - 100 ? ' ' + idWords(n - 100) : '');
    if (n < 1000) return idWords(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + idWords(n % 100) : '');
    if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + idWords(n - 1000) : '');
    const scales = [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']];
    for (const [v, w] of scales) {
      if (n >= v) return idWords(Math.floor(n / v)) + ' ' + w + (n % v ? ' ' + idWords(n % v) : '');
    }
    return '';
  }

  const EN_SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function enWords(n) {
    n = Math.floor(n);
    if (n < 20) return EN_SMALL[n];
    if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? '-' + EN_SMALL[n % 10] : '');
    if (n < 1000) return EN_SMALL[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + enWords(n % 100) : '');
    const scales = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
    for (const [v, w] of scales) {
      if (n >= v) return enWords(Math.floor(n / v)) + ' ' + w + (n % v ? (n % v < 100 ? ' and ' : ' ') + enWords(n % v) : '');
    }
    return '';
  }

  const CUR_WORDS = {
    id: { IDR: ['rupiah', ''], USD: ['dolar Amerika Serikat', 'sen'], SGD: ['dolar Singapura', 'sen'] },
    en: { IDR: ['rupiah', ''], USD: ['US dollars', 'cents'], SGD: ['Singapore dollars', 'cents'] },
  };

  /** Amount (minor units) in words, capitalised. */
  function words(minor, currency, decimals, lang) {
    lang = lang === 'en' ? 'en' : 'id';
    const neg = minor < 0;
    const abs = Math.abs(Math.round(minor));
    const div = Math.pow(10, decimals || 0);
    const whole = Math.floor(abs / div), frac = abs % div;
    const cw = (CUR_WORDS[lang][currency] || [currency, ''])[0];
    const sw = (CUR_WORDS[lang][currency] || ['', ''])[1];
    const f = lang === 'en' ? enWords : idWords;
    let s = (whole === 0 ? (lang === 'en' ? 'zero' : 'nol') : f(whole)) + ' ' + cw;
    if (frac && sw) s += (lang === 'en' ? ' and ' : ' ') + f(frac) + ' ' + sw;
    if (neg) s = (lang === 'en' ? 'minus ' : 'minus ') + s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  Buku.terbilang = { words, idWords, enWords };
})();
