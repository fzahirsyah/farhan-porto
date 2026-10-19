# Accu-Z Accounting — Offline Accounting

**Latest release:** 3.6 — review fixes, **Import from Excel**, property demo data and full Indonesian for the property screens. See [`docs/RELEASE-3.6.md`](docs/RELEASE-3.6.md). Rebrand to Accu-Z Accounting (red theme): [`docs/ACCUZ-REBRAND.md`](docs/ACCUZ-REBRAND.md). Earlier: [`docs/RELEASE-3.2-3.5.md`](docs/RELEASE-3.2-3.5.md).

# Accu-Z Accounting

Offline double-entry bookkeeping for Indonesian businesses: subscriptions, sales orders, invoices, property deals, inventory, KPR payments, PPN and PPh, bank import and reconciliation. Runs in the browser from this folder; your books are one `.sqlite` file.

## Start

1. Unzip the folder anywhere. Keep your existing company `.sqlite` backups separately.
2. Double-click **`index.html`** (Chrome or Edge recommended; Firefox works).
3. **Buat perusahaan** (enter your own legal company details), **Buka file perusahaan**, or **Coba Accu-Z Accounting Demo** (four months of realistic sample data, including property deals, resale units, KPR instalments, a JV, quotations and budgets).

No internet, no install, no server. Nothing is uploaded.

**Opening an older compatible company file:** open your existing `.sqlite` file. Accu-Z Accounting backs it up in the browser, upgrades it, and retains your existing documents, templates, numbering, and banking settings.

## Keeping your data safe

- Every change autosaves **in this browser**. Press **Ctrl+S** (or click the status pill) to save the **`.sqlite` file**; the pill turns green when the file is current.
- **Pengaturan → Data & cadangan**: Save as, backup copy, automatic snapshots, a data check that confirms the ledger, receivables, payables and deferred revenue all agree, and a **screen check** that opens every screen once.

## Moving in from Excel

**Pengaturan → Impor dari Excel.** Each sheet in the workbook is one table: Kurs, Tim Sales, Kontak, Produk, Saldo Awal, Invoice, Tagihan, Pembayaran, Jurnal, Mutasi Bank, Deals (English sheet and column names work too). Click **Unduh template** for the layout, or try **`examples/contoh-data-milikirumah.xlsx`** (fictional July–September data) on a new company.

The file is checked first and every problem is listed by sheet and row; nothing is saved until everything passes and you click **Impor**, and then it all goes in as one step. Importing the same file again skips what already exists.

## Typical SaaS flow

1. **Sales order** → pick the SaaS plan (6 months × price, VAT 11%), customer signs → **Mark as signed**.
2. **Create invoice** (all or part of the order) → **Approve**. Revenue goes to *Pendapatan Diterima di Muka*; a subscription is created.
3. **Bank & cash → Import statement** (KlikBCA CSV). Accu-Z Accounting matches the transfer to the invoice **net of PPh 23** → **Record**; add the bukti potong number.
4. **Subscriptions → Mark handover** on go-live. The 6-month schedule starts.
5. Month end: **Recognize revenue** (safe to run twice).
6. **Renewals** lists subscriptions ending within 30 days → **Renew** creates the next SO with the same scheme.
7. **Tax → PPN**: check faktur numbers, **Close this masa**, then **Pay tax** with the NTPN.

## What's included

| Area | Features |
|---|---|
| Sales | Sales orders (validity, signature, partial invoicing), invoices, credit notes (auto-applied), kwitansi, customer statements |
| Documents | Accu-Z Standard layout with customer-specific legal details; Classic, Modern, Compact; editor with live preview for columns, labels, text blocks, signatures, stamp/e-meterai, bank box, footer, language; prints one A4 page; PDF filename like `INV-… - Customer - SO-…` |
| SaaS | Plans, subscriptions, handover, deferred revenue with monthly recognition, renewals (single or bulk), MRR/ARR |
| Payments | Allocation to many invoices, PPh 23 withheld by customers (auto-suggested), bank charges, deposits, USD/SGD with realized FX gain/loss, void |
| Purchases | Bills with PPN Masukan and PPh 23/21 withheld by us, quick expenses, vendor payments |
| Banking | Bank & cash overview, transfers (incl. cross-currency), spend/receive money, BCA + any-bank CSV import, smart matching, rules, reconciliation |
| Tax | PPN per masa (DPP 11/12), faktur pajak numbers, close masa → Utang PPN, tax payments with NTPN, PPh 23 registers (both directions) |
| Reports | P&L, balance sheet, cash flow, trial balance, AR/AP aging, sales by customer/product/rep, deferred revenue roll-forward & MRR, open sales orders, journal report, general ledger |
| Opening balances | Bank and other balances in one screen; unpaid invoices/bills from before go-live as **opening documents** so they can be paid later |
| Import from Excel | One sheet per table, header aliases in Indonesian and English, check-then-import in one transaction, safe to re-import, downloadable template, example workbook |
| Tier 1 base | Chart of accounts, journals, multi-currency, numbering, Indonesian/English, light/dark |

## Tests

Open **`tests/tests.html`** (212 checks), **`tests/tier3.html`** (35), **`tests/tier4.html`** (47) and **`tests/tier5.html`** (41: review fixes, demo data, Excel import of the example workbook). The first covers the full 6-month SaaS scenario (SO → invoice → BCA import → payment net of PPh 23 → handover → 6 months of recognition → renewal), multi-currency partial invoicing, credit notes, bills with withholding, reconciliation, PPN close, and upgrade from a Tier 1 file.

## Notes

- Tax rates are settings (Pengaturan → Pajak). Confirm PPN DPP 11/12 and PPh rates with your tax consultant.
- Deferred revenue is on by default (Pengaturan → Dokumen & template). Confirm the treatment with your accountant.
- sql.js is MIT-licensed (https://github.com/sql-js/sql.js).

## Release 3.2–3.5 (P12–P15)

Property inventory, resale and instalment flows, JV investment ledger, quotations, dashboard,
period closing, FX revaluation, recurring journal drafts, contact import, SQLite attachments,
search and encrypted backup export are included in this build. Read `docs/RELEASE-3.2-3.5.md`
for tests, detailed feature limitations, data safety, and remaining acceptance items.


## Accu-Z Accounting branding

The app header, favicon, demo company, and new-company template labels now use Accu-Z Accounting.
The demo is **Accu-Z Accounting Demo**, with a printable Accu-Z logo.
Existing company names, logos, and issued documents are not renamed automatically.
For compatibility, the JavaScript namespace `Buku`, SQLite metadata `app=Buku`, and legacy layout keys are intentionally unchanged.
