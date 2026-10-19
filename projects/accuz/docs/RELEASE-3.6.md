# Release 3.6 — review fixes, Import from Excel, demo data

Schema stays at **v8**; files from 3.5 open without an upgrade step.

## Fixes

| # | Problem | Fix |
|---|---|---|
| 1 | Opening a property deal failed (`ambiguous column name: deal_id`) whenever it had partners or titipan movements. | Queries in `deals.detail` qualify the column. |
| 2 | A credit note could be raised on a property sale invoice. It reversed the revenue but left HPP and inventory as sold. | Blocked when creating, approving and applying credit notes; the Credit note button is hidden on sale invoices. |
| 3 | After a year-end close, P&L for the closed year showed zero, and cash flow / budget actuals included the closing entry. | Year-end closing entries are excluded from P&L, net profit, cash flow retained-earnings movement and budget actuals. Balance sheet unchanged. |
| 4 | Contact names and labels on the deal screens were not escaped (a contact named `<img onerror=…>` ran script). | All table cells on deal screens are escaped. |
| — | A deal could be closed with an unpaid commission invoice or an accrued but unpaid partner share. | Closing now requires both to be settled. |
| — | Payment text printed “call our Finance Department on , if …” when the company phone is empty. | The sentence is left out until a phone number is set. |
| — | Dashboard showed the overdue-instalment *count* as rupiah. | Shown as a count. |

## Indonesian

All property, JV, quotation, period-close, budget, automation and search screens, and the engine’s error messages, now have Indonesian text. Engine errors without a dedicated code fall back to the same dictionary.

## Import from Excel (Pengaturan → Impor dari Excel)

- Each sheet is one table, recognised by name: **Kurs, Tim Sales, Kontak, Produk, Saldo Awal, Invoice, Tagihan, Pembayaran, Jurnal, Mutasi Bank, Deals**. English names (Contacts, Invoices, Payments, …) work too; other sheets are ignored.
- Columns are matched by header, in Indonesian or English, in any order. Extra columns are ignored and listed.
- **Check first:** the whole workbook is run inside a transaction and rolled back. Problems are listed by sheet and row. **Import** is offered only when there are none, and then runs as one transaction.
- **Re-import safe:** contacts by name, products by code, invoices by number + customer, bills by vendor invoice number + vendor, journals by number, payments by reference / already-paid, bank lines by the usual duplicate check, deals by project + block + unit.
- Invoice/Tagihan: one row per line, grouped by number. `Status = draft` keeps a draft; otherwise approved and posted. `Saldo awal = Ya` creates an opening document. SaaS plan lines with Mulai/Selesai create subscriptions as usual.
- Pembayaran: `Jumlah` is the gross amount applied; `PPh 23 dipotong` is what the customer withheld (with bukti potong number).
- Mutasi Bank lines go to Bank & cash for matching; they do not post.
- Kurs switches the currency (and its bank/AR/AP accounts) on if it was off.
- No library: `.xlsx` is unzipped with the browser’s `DecompressionStream` and parsed directly (`js/core/xlsx.js`). The template download is generated the same way.
- Each import is written to the audit log.

`examples/contoh-data-milikirumah.xlsx` is a fictional July–September 2026 data set (16 contacts, 14 invoices incl. SGD and opening invoices, 10 bills incl. USD, 19 payments with PPh 23, journals, a BCA statement, 3 deals). It imports cleanly into a new company: AR 50.828.000, AP 3.270.000, ledger balanced.

## Demo data

**Coba demo** now also creates: an agency deal taken from booking to close (titipan received, part remitted, part offset against the commission, partner share accrued and paid), a deal in progress with DP held, a resale unit bought, renovated and sold with a KPR disbursement plus a 6-month instalment plan, an unsold unit, a JV with a contribution and distribution, two quotations, and budgets.

## Screen check

Pengaturan → Data & cadangan → **Jalankan cek layar** opens every screen once (plus one record of each kind) and lists any that fail. Read-only.

## Tests

`tests/tier5.html` — 41 checks: the four fixes and deal-close rules, property demo reconciliation, xlsx write/read round trip, date parsing, the template, importing the example workbook (totals, idempotency, audit), and row-level error reporting with nothing saved. All suites: 212 + 35 + 47 + 41 pass.

## Not changed

No refactoring of existing modules, per request. Remaining known limits from 3.5 still apply (see `RELEASE-3.2-3.5.md`).
