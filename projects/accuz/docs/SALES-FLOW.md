# Buku — Sales Flow (v2)

## 1. Overview

```
[Quotation] ─▶ [Sales Order] ─▶ [Invoice] ─▶ [Payment (net of PPh 23)] ─▶ [Handover] ─▶ [Subscription active]
   (T3)            │                 │                                                   │
                   │                 └─▶ [Credit Note]                                  └─▶ [Renewal SO/Invoice]
                   └─ signed by customer (scan attached)

[Deal] (T3) ─▶ milestones ─▶ commission invoice / titipan receipt / resale invoice ─▶ payments
```

| Document | Posts? | Notes |
|---|---|---|
| Quotation | No | Offer |
| Sales Order | No | Agreement; the customer signs it |
| Invoice | Yes | AR / Deferred revenue or revenue / PPN Keluaran |
| Payment | Yes | Bank + PPh 23 prepaid / AR (+ fees, FX) |
| Credit Note | Yes | Reverse of invoice |
| Kwitansi | No (prints a payment) | Receipt for any payment received |

## 2. Sales Order
- Customer fills PIC, phone, address, NPWP, email, currency, payment terms, sales rep, template.
- Header: order date, **validity period** (e.g. 1 Month → SO expires if not signed/paid), payment term (e.g. "Payment Before Delivery"), reference/opportunity no.
- Lines: product or plan → description, months/qty + unit, price per month/qty, **planned start/end**, note. Free-text lines allowed.
- Totals: subtotal → discount → PPN (DPP 11/12 × 12%) → Grand Total. Optional PPh 23 info line.
- Statuses: Draft → Confirmed (number assigned) → Signed (customer signature recorded, scan attached) → Partially invoiced → Fully invoiced; Expired (validity passed), Closed, Cancelled.
- Convert to invoice: full or partial quantity per line.

## 3. Invoice
- From SO or direct. Header: SO number, invoice date, due date = date + terms (e.g. 7 days), payment term text, sales rep, currency.
- Lines inherit from SO, including start/end and note.
- **Approve:** number, posting, subscription records created for plan lines (status Awaiting payment).
- Posting with deferral on (SaaS plan lines): AR / Pendapatan Diterima di Muka / PPN Keluaran. Non-plan lines (one-off services, commissions): AR / revenue account / PPN Keluaran.
- Faktur pajak number recorded after issuing in Coretax.
- Edit after approval only without payments (reversal + repost); otherwise credit note. Void reverses.

## 4. Payment
- Expected amount shown both gross and **net of PPh 23** so the cashier can match what arrived.
- Withholding tick → Prepaid PPh 23, bukti potong number/attachment (can be added later; report lists missing ones).
- Short payment from bank charges: leave open, or write off to Biaya Bank (per your "received in full" clause, default is leave open and remind).
- Full payment → subscription "Awaiting handover".

## 5. Handover and subscription
- "Mark handover / go-live" on the invoice or subscription: sets start date → end date → monthly revenue schedule.
- Optional: handover note / BAST number.

## 6. Renewals
- Renewals screen → "Renew with same scheme" → new SO (default) or invoice, same plan/months/price/sales rep, planned start = old end + 1 day; links new to old subscription.

## 7. Credit notes and refunds
- From an invoice; for a subscription, choose: refund unrecognized portion (credit note for remaining months) or a specific amount. PPN adjusted accordingly (retur/nota pembatalan note for tax).

## 8. Customer statement and kwitansi
- Statement per customer per period, by currency, with aging.
- Kwitansi for each payment: number, received from, amount, terbilang, for payment of (invoice numbers), signature/stamp/e-meterai slot.

## 9. Edge cases
- SO expired but customer pays anyway → reopen/extend validity, then invoice.
- Customer is an individual (no NPWP) → PPh 23 not withheld; NPWP fields blank; faktur still issued with NIK if required.
- Invoice in USD/SGD for overseas customers → PPN rule for export services per tax settings (e.g. 0%), deferred revenue at invoice rate.
- Over-invoicing an SO blocked by default.
- Voiding an invoice with a subscription → subscription cancelled; schedules removed if nothing recognized, otherwise blocked (credit note required).
