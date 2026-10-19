# Buku — Master Plan (v2)

**For:** PT Miliki Rumah Indonesia (MilikiRumah) — PKP company selling **SaaS subscriptions** and running **property deals** (commission, resale, pass-through funds, JV/partners, KPR).
**What changed in v2:** stock inventory removed; subscriptions with deferred revenue and renewals added; property deals module added; PPN and PPh 23 moved into Tier 2; full Indonesian tax set (TAX.md); BCA import moved to Tier 2; new numbering; MilikiRumah document layout.

## 1. Goals and non-goals

### Goals
- Run fully offline from a local folder; data in a portable `.sqlite` file.
- Real double-entry accounting; reports always reconcile.
- The documents you use today (Sales Order, Invoice) reproduced from **customizable templates**, plus receipts and statements.
- SaaS: subscriptions, upfront multi-month billing, deferred revenue, renewals.
- Property: deals with multiple schemes, buyer funds held on behalf of developers, partner shares, resale units.
- Full tax recording: PPN, PPh 23 (both directions), PPh 21, PPh 4(2), PPh 25.
- IDR base, plus USD and SGD.

### Non-goals
- Multi-user / cloud sync / logins.
- Live bank feeds (CSV import instead).
- Payroll and employee PPh 21.
- Direct submission to Coretax / e-Faktur (exports only).
- Consolidation across companies (JV PT = separate file).
- Stock (quantity) inventory.
- Tracking SaaS usage (hits/tokens) — that stays in your platform.

## 2. Architecture
Unchanged from v1:
- Folder app, opened by double-click on `index.html` (`file://`), no server needed.
- sql.js (SQLite in WebAssembly) embedded as base64 so it works offline.
- Vanilla JS, classic `<script>` tags, a global `Buku.*` namespace, no build step.
- Persistence: autosave to IndexedDB, Open/Save/Save-as of the `.sqlite` file (File System Access API on Chrome/Edge; download fallback elsewhere), backups and reminders.
- Money as integers in minor units; rates as fixed-point strings.
- All postings go through one engine (`posting.js`) that refuses unbalanced entries.

### 2.1 Folder layout (v2)
```
buku/
├── index.html
├── css/ app.css, print.css
├── fonts/                       ← bundled fonts for templates (offline)
├── js/
│   ├── vendor/ sql-wasm.js, sql-wasm-binary.js
│   ├── db/ schema.js, migrations.js, seed.js, storage.js
│   ├── core/ money.js, fx.js, posting.js, tax.js, numbering.js,
│   │         recognition.js (deferred revenue), i18n.js, terbilang.js, audit.js
│   ├── modules/
│   │   ├── dashboard.js  accounts.js  journal.js  contacts.js  products.js  sales-reps.js
│   │   ├── quotations.js  sales-orders.js  invoices.js  credit-notes.js  receipts.js
│   │   ├── subscriptions.js  renewals.js
│   │   ├── deals.js  property-units.js  partners.js
│   │   ├── bills.js  expenses.js  payments.js  banking.js  bank-import.js  reconcile.js
│   │   ├── tax.js  reports.js  templates.js  settings.js
│   ├── templates/ milikirumah.js, classic.js, modern.js, compact.js
│   └── ui/ router, table, form, modal, toast, date-picker
├── tests/tests.html
└── docs/
```

### 2.2 Numbering (reinvented)
Configurable patterns with tokens `{YYYY} {YY} {MM} {####} {SALES}`; reset: never / yearly / monthly.

| Document | Default | Example |
|---|---|---|
| Quotation | `QT-{YYYY}{MM}-{####}` | QT-202610-0012 |
| Sales Order | `SO-{YYYY}{MM}-{####}` | SO-202610-0029 |
| Invoice | `INV-{YYYY}{MM}-{####}` | INV-202610-0177 |
| Credit Note | `CN-{YYYY}{MM}-{####}` | |
| Receipt (kwitansi) | `KW-{YYYY}{MM}-{####}` | |
| Payment in / out | `RCV-…` / `PAY-…` | |
| Deal | `DL-{YYYY}{MM}-{####}` | |
| Bill | `BILL-…` | |
| Journal | `JE-{YYYY}{MM}-{####}` | (not "JV", to avoid confusion with joint venture) |

- Counter runs continuously (reset: never) by default, so numbers keep counting across months as your current INV-202610-0177 does. Yearly/monthly reset is a setting.
- The **sales rep is a field** on every document (printed as "Sales Rep."), not part of the number. If you prefer the old style, `SO-{SALES}-{YYYY}{MM}-{####}` → SO-PU-202610-0029 is one setting away.
- A starting number can be set per sequence, to continue from your current numbers.

## 3. Tier 1 — Foundation and Ledger
Same as v1 (setup wizard, currencies & rates, chart of accounts, journals, general ledger, Trial Balance, P&L, Balance Sheet, journal report, storage, app shell), with these v2 changes:

- **Chart of accounts template "SaaS + Property Agency" (Indonesian names, English secondary):** Kas, Bank BCA (IDR), Bank USD/SGD (optional), Piutang Usaha, PPh 23 Dibayar di Muka, PPN Masukan, Persediaan Properti, Investasi Ventura Bersama, Utang Usaha, Titipan Dana Konsumen, Pendapatan Diterima di Muka, Utang Bagi Hasil Mitra, tax payables (see TAX.md), Modal, Laba Ditahan, Pendapatan SaaS, Pendapatan Komisi (Developer / Bank / Konsumen), Pendapatan Penjualan Properti, HPP Properti, Beban Bagi Hasil, Beban Komisi Agen, Beban Gaji, Sewa Kantor, Beban Server & Cloud, Beban Pemasaran, Biaya Bank, Beban e-Meterai, Selisih Kurs, and others.
- **Company profile supports several addresses** (e.g. 18 Office Park, GoWork Senayan City); one is default, documents/templates can choose another. Logo, NPWP, website and social handles for the document header.
- **Sales reps** (code, name, phone, commission rate, active) set up in Tier 1, since every document uses them.
- **Taxes seeded** per TAX.md, confirmed in the wizard.
- **Language:** Indonesian default for documents and UI, English switchable.

## 4. Tier 2 — SaaS sales cycle, tax, banking (the daily core)

### 4.1 Contacts
Customer / vendor / developer / bank / partner / agent (multi-tag). Fields from your documents: company name, **PIC**, phone, address, **NPWP**, email; plus default currency, payment terms, default template, sales rep, related-party flag, "is individual" (for PPh 21 vs 23).

### 4.2 Products and plans
- **Service products** (SaaS packages, commission types, consulting, one-off fees).
- **Plans** for subscriptions: months, price per month per currency, quota text (hits/month, tokens), revenue and deferred-revenue accounts, tax.

### 4.3 Sales Orders
As SALES-FLOW.md. Lines carry Item, Description, **Start Date, End Date**, Qty + unit ("6 Months"), Price/Month, Amount, **Note**. Header: order date, payment term ("Payment Before Delivery"), sales rep, currency, **validity period**, opportunity/reference no. Signature status (signed by customer yes/no, date, attachment of the signed scan).

### 4.4 Invoices
From SO (full or partial) or direct. Header fields: SO number, invoice date, invoice number, payment term, sales rep, currency, due date, terms of payment (days). Discount column. TOTAL / VAT – 11% / Amount Due. Faktur pajak fields. Stamp/e-meterai flag.

### 4.5 Credit notes, customer statements, receipts (kwitansi)
- Credit notes for refunds/corrections.
- Customer statement per period.
- **Kwitansi** printable for any payment received (with terbilang), also used for buyer funds in property deals.

### 4.6 Payments
- Allocation to many invoices, partial payments, overpayment to customer credit.
- **PPh 23 withheld** at receipt (default 2% of DPP), bukti potong number and attachment.
- Bank charges, FX gain/loss, cross-currency payments (MULTI-CURRENCY.md).
- Note on your documents ("received in full; bank charges not our responsibility"): a short-paid amount can be left open on the invoice or written off to a chosen account.

### 4.7 Subscriptions (SUBSCRIPTIONS.md)
Created automatically from invoice lines that use a Plan; handover date sets the period; **deferred revenue with a monthly "Recognize revenue" run (default on)**; renewals screen with one-click "Renew with same scheme"; MRR report.

### 4.8 Purchases and expenses
- **Bills** from vendors (with PPN Masukan, PPh 23/21 withholding).
- **Quick expenses** (paid immediately: server, ads, office, e-meterai) with receipt attachment.
- **Reimbursements** for staff out-of-pocket expenses (payable to employee, then paid).
- Recurring bills (rent, cloud) arrive in Tier 3 recurring.

### 4.9 Tax (TAX.md)
PPN in/out with faktur tracking and masa report; PPh 23 both directions; PPh 21 on agent payments; "Pay tax" screen with NTPN; tax payment log.

### 4.10 Banking
- Bank and cash accounts per currency; transfers; quick spend/receive.
- **BCA CSV import** (KlikBCA Bisnis / statement export) with a mapping preset; **generic CSV mapping** for any other bank (saved presets).
- **Matching:** suggest matches to open invoices (by amount, amount net of PPh 23, reference/invoice number in the description), bills, and existing entries; unmatched lines become spend/receive entries via rules ("description contains GOOGLE CLOUD → Beban Server").
- Bank reconciliation with history.

### 4.11 Reports (Tier 2)
AR/AP aging · cash flow · sales by customer / product / **sales rep** · open SOs · subscription MRR & renewals · deferred revenue roll-forward · tax reports · account transactions.

**Tier 2 done when:** an SO for 6 months SaaS is invoiced with VAT 11%, paid net of PPh 23 via a BCA CSV import match, handed over, recognized monthly for 6 months, then renewed with one click; every report agrees with the ledger.

## 5. Tier 3 — Property, automation, period end

### 5.1 Property deals (PROPERTY-DEALS.md)
Deals with unit, parties, price, KPR, milestones; schemes: commission (developer/bank/buyer), **titipan dana konsumen**, resale units with per-unit cost and HPP, partner shares, co-broke, JV as separate file with investment tracking, in-house instalment plans. Deal reports and partner statements.
*(This is your second main business line, so it's the first Tier 3 phase.)*

### 5.2 Quotations
Quote → SO → Invoice; valid-until; statuses.

### 5.3 Dashboard
Cash per bank, AR/AP, overdue invoices, **MRR and renewals due**, deal pipeline and expected commission, titipan held, this month's profit, 12-month income/expense chart.

### 5.4 Recurring transactions
Recurring bills, journals, and optional auto-renew drafts for subscriptions; generated on app open with a review list.

### 5.5 Period end
Monthly close checklist (recognize revenue, reconcile banks, review titipan, revalue FX); lock date; year-end close to Laba Ditahan; fiscal correction worksheet (TAX.md §5); unrealized FX revaluation.

### 5.6 Budgets
Budget vs actual per account per month.

### 5.7 Import / export
CSV import of contacts, products, opening invoices (to migrate open AR), chart of accounts; CSV/XLSX export of lists and reports; JSON full export; Coretax-oriented exports (format verified at that time).

### 5.8 Audit, security, attachments
Audit log with before/after; optional file encryption and auto-lock; attachments (signed SO scans, bukti potong, faktur, PPJB, receipts) with size caps.

### 5.9 Sales commission
Internal commission per sales rep from paid invoices and closed deals; report (and optional accrual journal).

### 5.10 Quality of life
Global search; duplicate detection; mailto/email text; in-app user guide (Indonesian + English).

## 6. Feature-to-tier summary (v2)

| Area | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Storage | Autosave, open/save, backups, migrations | — | Encryption, JSON export |
| Ledger | CoA (SaaS+Property template), journals, GL | Auto-posting | Lock date, year-end, revaluation |
| Company | Multi-address, logo, sales reps | — | — |
| Sales | — | SO, invoice, credit note, kwitansi, statement | Quotation, sales commission |
| SaaS | — | Plans, subscriptions, deferred revenue, renewals, MRR | Auto-renew drafts |
| Property | — | (commission invoices via normal invoices) | Deals, titipan, resale units, partners, JV, instalments |
| Purchases | — | Bills, expenses, reimbursements | Recurring bills |
| Tax | Tax table seeded | PPN, PPh 23 in/out, PPh 21, tax payments | PPh 4(2) on resale, fiscal worksheet, Coretax exports |
| Banking | — | Accounts, transfers, BCA + generic CSV import, matching rules, reconciliation | — |
| Templates | — | MilikiRumah layout + 3 presets for SO, invoice, kwitansi, statement | Quotation, deal receipts |
| Reports | TB, P&L, BS, journal | Aging, cash flow, sales by rep, tax, MRR, deferred revenue | Dashboard, deal & partner reports, budgets |
| Currency | IDR/USD/SGD rates | FX gain/loss on payments | Unrealized revaluation |
