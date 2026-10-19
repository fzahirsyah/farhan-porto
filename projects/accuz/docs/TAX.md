# Buku — Indonesian Tax Handling (v2)

The company is a **PKP** with full corporate tax obligations. Buku records and reports taxes so filing is easy; it does **not** file with DJP/Coretax directly.

> All rates below are **defaults stored as data** (Taxes table) and must be confirmed with your tax consultant before go-live. Changing a rate never alters posted documents.

## 1. PPN (VAT)
- **Default output tax:** 12% on a DPP of 11/12 of the price ("DPP nilai lain"), which equals an effective 11%. This matches your documents: 12,000,000 → VAT 1,320,000.
- Tax record fields: `rate = 12`, `base_factor = 11/12`, `print_label = "VAT – 11%"` (label is editable per template/language).
- Also seeded: PPN 12% full DPP (for goods/services where it applies), PPN 0%, Non-PPN / Tidak dipungut, PPN Dibebaskan.
- **Faktur pajak:** each approved invoice has fields for faktur number, faktur date, and status (to issue / issued / replaced / cancelled). Invoice list filter "PPN invoices without faktur".
- **Input tax (PPN Masukan):** on bills, with vendor faktur number and date; flag "creditable / non-creditable" (non-creditable goes to expense).
- **Report:** PPN Keluaran vs Masukan per masa (month), net payable or overpaid, document list; CSV export shaped for entering into Coretax. A Coretax-import XML export is a Tier 3 item, format to be verified at that time.
- Payment of PPN: "Pay tax" screen posts Utang PPN → Bank, with NTPN reference.

## 2. PPh 23 (withholding on services)
**Customers withhold from you (very common for SaaS and commission):**
- At payment, user ticks "PPh 23 withheld" → default 2% of DPP (Total Amount before VAT, as your SO notes state).
- Example: 13,320,000 invoice; customer pays 13,080,000.

| Account | Debit | Credit |
|---|---|---|
| Bank | 13,080,000 | |
| PPh 23 Dibayar di Muka (prepaid tax, asset) | 240,000 | |
| Piutang Usaha | | 13,320,000 |

- Record **bukti potong** number, date, and attach the PDF. Report: "PPh 23 withheld by customers" with missing-bukti-potong flag (you need these to credit against corporate tax).

**You withhold from vendors** (e.g. consultants, rental of equipment, a company co-broker):
- On bills: tax line "PPh 23 2%" reduces the amount payable and credits **Utang PPh 23**.
- Report per month for filing; "Pay tax" posts Utang PPh 23 → Bank.

## 3. PPh 21 (individuals)
- Payments to individual agents/freelancers (co-brokers, referral persons): bill line with PPh 21 withholding (rate entered or computed by a simple configured rule) → **Utang PPh 21**.
- Employee payroll PPh 21 is **out of scope**; payroll totals are entered as a journal.

## 4. PPh 4(2) final (property)
- Resale of land/buildings: seller's PPh final (default 2.5% of gross transfer value; other rates configurable, e.g. 1% for specific simple houses) on the transfer.
- Posted as **Beban PPh Final** with **Utang PPh 4(2)** until paid, or directly to Bank if paid at signing.
- Rental of property (if ever): PPh 4(2) 10% withheld by tenant — configurable.
- Because the resale income is final-taxed, a report lists final-taxed revenue and its costs to help the year-end **fiscal correction**.

## 5. Corporate income tax (PPh 25 / 29)
- Monthly instalments (PPh 25) recorded via "Pay tax" to **PPh 25 Dibayar di Muka**.
- Year end: Buku shows commercial profit plus a simple **fiscal correction worksheet** (manual positive/negative adjustments, final-tax income removed) and a prepaid-taxes summary (PPh 23 withheld + PPh 25 paid). The actual tax return is prepared outside Buku.

## 6. e-Meterai and other
- e-Meterai cost (Rp 10,000 each) recorded as an expense; templates have a slot for the stamp image.
- BPHTB: buyer's tax; recorded on the deal for information, or capitalised to the unit cost when you are the buyer (resale).

## 7. Tax accounts seeded
PPN Keluaran · PPN Masukan · Utang PPN · PPh 23 Dibayar di Muka · Utang PPh 23 · Utang PPh 21 · Utang PPh 4(2) · Beban PPh Final · PPh 25 Dibayar di Muka · Utang PPh 29 · Beban Pajak Penghasilan.

## 8. Tax reports (summary)
| Report | Purpose |
|---|---|
| PPN masa | Monthly VAT return support |
| Faktur status | Invoices missing faktur numbers |
| PPh 23 withheld by customers | Bukti potong collection, tax credits |
| PPh 23/21/4(2) withheld by us | Monthly withholding returns |
| Tax payments | NTPN log per tax type and masa |
| Fiscal correction worksheet | Year-end support |
