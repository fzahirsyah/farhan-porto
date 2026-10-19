/* Buku — tax arithmetic. Taxes are data (taxes table); this file only does the maths. */
(function () {
  'use strict';
  const Buku = window.Buku;

  /** Tax base (DPP) for an amount: amount × base_num / base_den. */
  function dpp(amount, tax) {
    return Buku.money.mulFrac(amount, tax.base_num || 1, tax.base_den || 1);
  }

  /** Tax amount on `amount` (minor units, tax-exclusive). PPN 12% × 11/12 on 12,000,000 → 1,320,000. */
  function amount(amountMinor, tax) {
    if (!tax || !Number(tax.rate)) return 0;
    return Buku.money.percentOf(dpp(amountMinor, tax), tax.rate);
  }

  /** Effective rate as a display string, e.g. "11" for 12% × 11/12. */
  function effectiveRate(tax) {
    if (!Number(tax.rate)) return '0';
    const r = Buku.money.parseRate(tax.rate); // × 1e6
    const eff = Buku.money.divRound(r * BigInt(tax.base_num || 1), BigInt(tax.base_den || 1));
    return Buku.money.rateToString(eff);
  }

  Buku.tax = { dpp, amount, effectiveRate };
})();
