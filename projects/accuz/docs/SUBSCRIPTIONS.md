# Buku — SaaS Subscriptions (v2)

## 1. How the business works (as understood)
- Customers buy a SaaS package (e.g. BI checking + profiling) for **3, 6 or 12 months** (any number of months is allowed).
- Price is per month × months, with a quota (e.g. 50 hits/month, 300 tokens total).
- **Money comes first.** Payment terms are "Payment Before Delivery", usually 7 days.
- **The period starts after payment and handover** from the Tech Team, not on the invoice date.
- When the period ends, the customer is **charged again with the same scheme** (same package, months and price unless changed).

## 2. Objects
| Object | Meaning |
|---|---|
| **Plan** (product) | A package template: name, description, default months, price per month per currency, quota (hits/month, tokens), tax, revenue account |
| **Subscription** | One customer's contract: plan, months, price, quota, start, end, status, the SO and invoice it came from, the previous subscription it renews |
| **Revenue schedule** | One row per month of the subscription: period, amount to recognize, recognized yes/no, journal entry |

## 3. Lifecycle

```
SO confirmed ──▶ Invoice approved ──▶ Paid ──▶ Handover (start date set) ──▶ Active ──▶ Expiring (N days) ──▶ Expired
                                                                                  │
                                                                                  └──▶ Renewal SO/Invoice (same scheme) ──▶ new Subscription
```

| Status | Set when |
|---|---|
| Awaiting payment | Created from an approved invoice line that uses a Plan |
| Awaiting handover | Invoice fully paid (net of PPh 23) |
| Active | User enters the handover/go-live date; end date = start + months − 1 day |
| Expiring | Within the warning window (default 30 days, configurable) |
| Expired | End date passed and not renewed |
| Renewed | A renewal subscription exists |
| Cancelled | Manual, with reason; can trigger a credit note if refunding |

The start/end dates print on the SO and invoice lines (your SO already has Start Date / End Date columns). If handover hasn't happened yet, the lines show the planned period and the note "Period will be calculated after payment and handover".

## 4. Revenue recognition — recommended default: **deferred**
Plain explanation: when a customer pays Rp 12,000,000 for 6 months, you haven't earned it all on day one; you owe them 6 months of service. Proper accounting (and what an auditor or tax consultant normally expects under PSAK 72) records the cash as a liability and moves 1/6 to revenue each month.

**On invoice approval** (12,000,000 + PPN):
| Account | Debit | Credit |
|---|---|---|
| Piutang Usaha (AR) | 13,320,000 | |
| Pendapatan Diterima di Muka (Deferred revenue) | | 12,000,000 |
| PPN Keluaran | | 1,320,000 |

**Each month while active** ("Recognize revenue" run, one click, safe to run twice):
| Account | Debit | Credit |
|---|---|---|
| Pendapatan Diterima di Muka | 2,000,000 | |
| Pendapatan SaaS | | 2,000,000 |

- Months are prorated by days for partial first/last months (setting: "whole months" or "daily proration"; default whole months starting at the start date's month).
- Before handover nothing is recognized; the whole amount stays deferred.
- PPN is not deferred: it's due on invoicing, as normal.
- Cancelling mid-way: unrecognized balance is either refunded (credit note) or recognized immediately (setting per cancellation).

**Simple mode (setting, switch off deferral):** invoice credits Pendapatan SaaS directly. Subscriptions still track periods and renewals. The setting can't be switched once deferred schedules exist without a conversion wizard.

## 5. Renewals
- **Renewals screen:** subscriptions expiring in the next 30/60/90 days, with customer, plan, months, price, sales rep.
- **"Renew"** (single or bulk): creates a new **SO** (or straight to **invoice**, setting) with the same plan, months, price, currency, sales rep and template; the period is planned to start the day after the old one ends.
- Price change on renewal: editable before confirming; the plan's current price is suggested next to the old price.
- Optional reminder email text (copy / mailto) for the customer.
- Dashboard card: renewals due this month and their value; expired-not-renewed count (churn).

## 6. Quota (informational)
- Hits/month and tokens are stored on the subscription and printed in the line note ("50 hits/month | Total: 300 Tokens").
- Usage tracking is **not** in scope (it lives in your SaaS platform). A free-text "usage note" field is available.

## 7. Reports
- Active subscriptions list (MRR in IDR, by plan, by sales rep)
- **MRR / ARR** and month-over-month change; new, renewed, churned
- Deferred revenue balance roll-forward (opening + invoiced − recognized = closing; must equal the ledger account)
- Revenue by plan / customer / sales rep
- Renewal rate by month

## 8. Edge cases
- Customer pays late → start still at handover; nothing changes.
- Upgrade mid-term (more hits) → new SO for the difference, separate subscription line marked "add-on" with the same end date (prorated price suggested).
- Multi-currency subscription (USD customer) → schedule amounts in USD with IDR at the invoice rate; recognition uses the **invoice rate** (no FX on deferred revenue, it's non-monetary).
- Free trial / bonus months → zero-price months on the schedule.
