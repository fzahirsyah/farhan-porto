# Buku — Offline Accounting App (Planning Package v2)

**Working name:** Buku (Indonesian: "book", as in *pembukuan*)
**For:** PT Miliki Rumah Indonesia — SaaS subscriptions + property deals
**Status:** Planning only. No code yet.

A lightweight, offline-first, double-entry accounting app that runs in the browser from a local folder, stores its data in a real SQLite file, handles **IDR, USD and SGD**, and prints Sales Orders, Invoices and receipts from **customizable templates** based on your current MilikiRumah documents.

## What's in this package

| File | Contents |
|---|---|
| `docs/PLAN.md` | Goals, architecture, numbering, and all Tier 1–3 features (start here) |
| `docs/SUBSCRIPTIONS.md` | SaaS plans, upfront billing, handover, deferred revenue, renewals, MRR |
| `docs/PROPERTY-DEALS.md` | House deals: commission, titipan (pass-through DP), resale, partners, JV, KPR/instalments |
| `docs/TAX.md` | PPN (DPP 11/12), PPh 23 both directions, PPh 21, PPh 4(2), PPh 25, reports |
| `docs/SALES-FLOW.md` | SO → Invoice → Payment → Handover → Renewal |
| `docs/TEMPLATES.md` | MilikiRumah layout + presets, every setting |
| `docs/DATA-MODEL.md` | SQLite schema plan |
| `docs/MULTI-CURRENCY.md` | Rates, rounding, FX gain/loss, revaluation |
| `docs/ROADMAP.md` | 16 build phases, acceptance scenarios, tests, risks, open items |

## Changes from v1
- Stock inventory removed (resale houses tracked per unit instead).
- SaaS subscriptions with deferred revenue and one-click renewals added (Tier 2).
- Property deals module added (Tier 3, first phase).
- PPN and PPh 23 moved into Tier 2; full Indonesian tax set.
- BCA CSV import moved into Tier 2.
- Numbering redesigned: `SO-202610-0029`, `INV-202610-0177`; sales rep is a field.
- New default document layout that recreates your current SO and invoice.

## Key decisions (change any before build starts)
1. Base currency IDR; USD/SGD as transaction currencies.
2. Opens by double-click, no server; vanilla JS, no build step.
3. Money stored as integers.
4. One company per `.sqlite` file (a JV PT gets its own file).
5. Indonesian-first UI and documents, English switchable.
6. Deferred revenue for SaaS on by default.
7. Go-live for SaaS after Phase 10; property deals follow.
