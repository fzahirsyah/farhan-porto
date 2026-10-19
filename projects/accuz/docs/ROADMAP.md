# Buku — Roadmap, Acceptance Criteria, Testing, Risks (v2)

## 1. Build phases
Each phase ends with a usable app and a passing `tests/tests.html`.

| Phase | Tier | Scope | Done when |
|---|---|---|---|
| **P0 Skeleton** | 1 | Folder, embedded sql.js, schema + migrations, storage (autosave, open/save, backup), app shell, router, i18n (ID/EN), dark mode | Opens by double-click in Chrome/Edge/Firefox; survives reload; file opens in DB Browser for SQLite |
| **P1 Ledger** | 1 | Setup wizard, company + multi-address, sales reps, currencies & rates, CoA (SaaS + Property template), taxes seeded, journals, posting engine, GL, opening balances | Unbalanced entries impossible; posting tests pass |
| **P2 Core reports** | 1 | Trial Balance, P&L, Balance Sheet, journal report, drill-down, print/CSV | Reports reconcile on the sample data |
| **P3 Master data** | 2 | Contacts (tags, PIC, NPWP), products, plans, number sequences with starting numbers | Can continue from INV-202610-0177 |
| **P4 Templates + SO** | 2 | Template engine, **MilikiRumah layout** + 3 presets, editor, text blocks, signatures/stamp/e-meterai, SO screens & statuses | Printed SO is visually equivalent to your current SO |
| **P5 Invoices, credit notes, kwitansi** | 2 | Invoice from SO, PPN 11/12 DPP, faktur fields, posting with deferral, credit notes, statements, kwitansi | Printed invoice equivalent to INV-202610-0177 |
| **P6 Payments & tax** | 2 | Payments with PPh 23 withheld, bukti potong, fees, FX, short-pay handling; tax payments with NTPN; PPN masa & withholding reports | PPN report equals tax accounts; PPh 23 prepaid equals sum of withholdings |
| **P7 Subscriptions** | 2 | Subscriptions from invoices, handover, revenue schedules, monthly recognition, renewals, MRR | 6-month scenario in §2 passes |
| **P8 Purchases & expenses** | 2 | Bills (PPN Masukan, PPh 23/21 withheld), quick expenses, reimbursements | AP aging equals AP accounts |
| **P9 Banking** | 2 | Bank accounts, transfers, **BCA CSV import**, generic mapping, matching (incl. net-of-PPh 23), rules, reconciliation | One month of real BCA statement imports and reconciles |
| **P10 Tier 2 reports** | 2 | Aging, cash flow, sales by customer/product/rep, open SOs, deferred revenue roll-forward | All invariants hold |
| **P11 Property deals** | 3 | Deals, parties, milestones, commission invoices, titipan, partner shares, co-broke, deal reports | Titipan per deal equals the liability account |
| **P12 Resale & instalments & JV** | 3 | Property units & costs, HPP, PPh 4(2), instalment plans, JV investment tracking | Unit margin report equals ledger |
| **P13 Dashboard & quotations** | 3 | Dashboard, quotations, sales commission report | |
| **P14 Period end** | 3 | Close checklist, lock date, year-end, fiscal worksheet, FX revaluation, budgets | Correct opening balances next year |
| **P15 Automation, IO, security** | 3 | Recurring, imports (opening AR, contacts), exports, audit log, attachments, encryption, global search, user guide | |

**Suggested go-live point:** after P10, you can run the SaaS business on Buku. Property deals (P11–P12) follow; until then, commission invoices work as ordinary invoices and titipan can be recorded with manual journals to the Titipan account.

## 2. Acceptance scenarios
1. **SaaS 6 months:** SO-202610-0029, 6 × 2,000,000, VAT 11% → signed → invoice 13,320,000 due in 7 days → BCA import shows 13,080,000 → matched with PPh 23 240,000 → handover 1 Nov → recognition Nov–Apr at 2,000,000/month → renewal SO created with the same scheme on the expiring list. Deferred revenue ends at 0; PPh 23 prepaid 240,000; PPN Keluaran 1,320,000.
2. **3- and 12-month variants** and a partial first month with daily proration setting.
3. **Cancellation after 2 months** with refund credit note for 4 months; PPN adjusted.
4. **Commission deal:** buyer booking fee 5,000,000 through us → titipan; DP direct to developer (tracked only); akad → commission invoice to developer 2% + PPN; developer nets commission from the titipan and receives the rest; titipan 0.
5. **Partner deal:** same commission, 40% partner share as principal → Beban Bagi Hasil + partner bill; partner statement correct.
6. **Resale:** buy unit + notary + renovation → sell via KPR disbursement → HPP, PPh 4(2), margin per unit.
7. **USD customer:** USD invoice, paid in USD account at a different rate → FX gain; deferred revenue unaffected by rate.
8. **Persistence and migration** as in v1.

## 3. Testing
- In-browser test runner; groups: money/rounding, PPN DPP 11/12 math, PPh 23 netting, posting engine, deferred revenue schedules, renewals, titipan, FX.
- **Integrity check** (Settings → "Check data integrity"):
  - every posted entry balances
  - AR/AP accounts = open documents per currency
  - Deferred revenue account = unrecognized schedules
  - Titipan account = sum of deal titipan balances
  - Persediaan Properti = cost of owned units
  - PPh 23 prepaid = withholdings not yet credited
  - SO fulfilled quantities = invoice quantities
- Sample company file with a year of MilikiRumah-like data (anonymised).
- Print tests: Chrome, Edge, Firefox; A4; 1- and 2-page SO/invoice.

## 4. Risks
| Risk | Mitigation |
|---|---|
| Browser storage cleared | `storage.persist()`, file-saved indicator, backup reminders |
| Tax rules change (PPN DPP, PPh rates) | Taxes are data; confirm with tax consultant before go-live |
| Property schemes vary per deal | Scheme flags per deal + manual journal escape hatch tagged to the deal |
| Deferred revenue confuses users | Clear "earned vs not yet earned" view per subscription; simple mode available |
| BCA CSV format changes | Mapping presets editable in the app, not code |
| Single-user only | Clear guidance: one person edits the file at a time; others get copies or reports |
| Print differences | Strict print CSS, test matrix, optional PDF library |

## 5. Decisions recorded (from your answers)
- Business: SaaS subscriptions + property (commission from developer/bank/buyer, resale, pass-through DP, JV PT and partners).
- PKP; full tax: PPN, PPh 23, 21, 4(2), 25.
- Bank import: BCA first, generic CSV mapping for others.
- No stock inventory; resale houses tracked per unit.
- Numbering reinvented: `SO-YYYYMM-####`, `INV-YYYYMM-####`, sales rep as a field.
- Subscriptions: upfront 3/6/12 months, renew with same scheme; **deferred revenue on by default** (switchable).

## 6. Still open (not blocking Phase 0; needed by the phase shown)
1. **P5:** Who signs on your side by default — the sales rep, or a fixed signatory (e.g. Denny)?
2. **P9:** A sample BCA CSV export (amounts can be dummy) to build the preset against.
3. **P11:** How the "new model of KPR" works (who pays whom, over what period, any margin/interest).
4. **P12:** Does the JV PT need its own books in Buku, or only the investment in your main file?
5. **Before go-live:** your tax consultant confirms the tax settings in TAX.md, and your accountant confirms deferred revenue treatment.
