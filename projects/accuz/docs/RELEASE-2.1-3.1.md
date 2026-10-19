# Buku — Release 2.1 + 3.1 implementation notes

Updated: 13 October 2026. This release is based on the supplied `buku-tier2.zip`, with no server or cloud dependency.

## Run

Open `index.html` directly in a supported modern browser. Create a company, or open a copy of an existing company SQLite file. **Back up your company file before the first upgrade.** Schema migration moves the file from v1/v2 to v4 via the immutable v3 and v4 migrations; the file cannot be opened in an earlier version after upgrading.

New main navigation: **Property → Property Deals / Deal Reports**. In a Deal you can record booking, DP, SP3K, akad, pencairan and handover; commission terms and a linked draft invoice; money received for a developer, remittance, refund or invoice offset; partner agreements and principal-treatment share accrual/payout. You can link an old customer-funds journal line to a deal without posting it again. The receipt action opens a printable KWITANSI using existing document templates.

## 2.1 shipped

- New `schema_version=3` tables: `subscription_cancellations`, `tax_period_closings`, and a subscription allocation method.
- No handover for unpaid/part-paid invoices. Repeated handover remains prohibited.
- Optional daily proration for newly started deferred-revenue subscriptions; previously generated schedules are left unchanged.
- Cancelling a deferred subscription with a refund creates **one exact draft partial credit note** for remaining unrecognized service. Schedules stay on the books until the credit is approved, when the corresponding deferred balance is cleared. Withdrawing an approved linked cancellation credit is blocked to avoid silent corruption. Actual cash refund uses existing outgoing payments.
- Cancelling without refund releases the remaining deferral with a posted revenue-recognition journal.
- Closing PPN now records a period closure and blocks subsequent tax-input/tax-output postings in that month, including backdated reversals. Historic `ppn_close` journal entries are backfilled as closed periods.
- Browser reopen now makes a pre-upgrade backup, just like reopening from a `.sqlite` file.

## 3.1 shipped

- New `schema_version=4` deal, party, milestone, commission, titipan, settlement, partner-share and legacy-link data models.
- Commission invoices use existing `documents` and `Buku.posting`; invoice amount/payer/tax/deal are validated against the agreement. Invoice generation requires the actual earning milestone and cannot occur twice.
- Titipan receipt: Dr Bank, Cr Customer Funds Held. Remittance or refund: Dr Customer Funds Held, Cr Bank. No revenue is created from titipan.
- Invoice offset: Dr Customer Funds Held (cash-equivalent part), Dr PPh23 Prepaid (when configured), Cr Accounts Receivable (gross). Invoice aging and paid/open status are refreshed. Titipan may never be spent below the balance for the deal.
- Partners under **principal** treatment: Dr partner expense / Cr partner payable upon accrual; payable clears on payout. Agent-treatment agreements can be stored but **posting is intentionally blocked pending signed-contract/accounting validation** (see remaining work).
- Legacy journal-line attribution never duplicates a posted entry. Bank statement lines can be attached when bank/date/amount/direction match a new transaction.
- Closing a deal requires zero titipan, no un-invoiced commissions, approved linked commission invoices, and no unaccrued partner shares. Reopening is audited.
- Report surfaces both allocated customer funds and unassigned historical liability; unassigned must be investigated before accepting complete reconciliation.
- Posted property events cannot be reversed directly from the general journal; a controlled correcting workflow is needed rather than silently detaching the business event.

## Automated verification

- Original suite: `tests/tests.html` — **212/212 passed** in a controlled Node/sql.js harness.
- New suite: `tests/tier3.html` — **35/35 passed** in the same harness. Covers subscription gates/proration/refund, tax locks, complete property money flows, PPh23, partner principal accrual/payout, legacy linking, bank-statement attribution, receipt rendering, and SQLite export/reopen.
- Additional static validation: `node --check` on application JS, verified script files exist.
- **Browser/UI acceptance testing was blocked in this environment and is not claimed as passed.** Print and IndexedDB upgrade usability require manual QA with real company file copies.

## Known limits and safety boundaries (before production go-live)

1. **Partner agent-treatment recognition is not automatic**: it needs a verified principal-versus-agent and taxation decision per signed agreement. 3.1 allows agreement capture and explicitly blocks incorrect accruals.
2. A controlled **reversal/adjustment workflow** for property receipts, offsets, commission invoices and already-posted partner amounts is still needed. Preventing direct journal reversal avoids corruption but is not a substitute for corrections.
3. Non-deferred subscription cancellation/refund and part-pay/partial-month service refunds need additional contract-specific accounting rules; current controlled automated partial credit focuses on active deferred subscriptions.
4. PPN correction workflow currently blocks closed-period postings rather than offering a full re-opening/revision process (scheduled for P14).
5. The app has not been tested with actual proprietary bank exports, signed brokerage contracts, accountant-approved tax scenarios, or a real upgrade+restore exercise in a browser.
6. Deal closing may leave valid outstanding AR and accrued payables in place; they remain visible in reports. Introduce an explicit business sign-off review if your policy requires every receivable collected before closure.
7. `deal_parties` supports additional roles at the core level; the UI's primary parties are Buyer, Developer, Bank, plus partner share. Advanced multi-party editing can be expanded.
8. Full non-property Tier 2 gaps (employee reimbursement module and saved custom bank CSV presets) are deferred.

## Next major phase — P12 (Tier 3.2)

**Resale, in-house instalments, and JV accounting**. Unit-level acquisition and capitalization, property inventory/HPP at transfer, per-unit margin, PPh final 4(2) rules, KPR disbursement and buyer installment schedules, overdue/dunning reports, and investments / intercompany transactions for separately accounted JV PTs. **Do not conflate agency deals with owned resale inventory.** Exact tax rules, title ownership, and the PraKPR/rent-to-own arrangement need contract/accountant confirmation before automation.

After P12, the existing roadmap continues with P13 (dashboard/quotations), P14 (period closing/year-end), and P15 (automation/imports/security).
