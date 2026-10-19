# Buku — Property Deals (House Sales, KPR, Schemes) (v2)

## 1. What we're modelling
House sales run under several schemes, sometimes mixed in one deal:
- **Commission (agency):** you earn a fee from the **developer**, the **bank** (KPR referral) or the **customer/buyer**.
- **Resale:** you buy a house (or unit rights) and sell it on; the margin is yours.
- **Pass-through money:** booking fee / DP / other buyer money **sometimes passes through your account** on its way to the developer, sometimes goes direct.
- **Joint venture PT:** a separate company owned with a partner.
- **Partner arrangement:** no new PT; profit or commission is shared with a partner.
- KPR (and new KPR-style models, e.g. in-house instalment) affect **when** money arrives, not who earns it.

The design: one **Deal** record per house transaction that holds the facts (unit, buyer, developer, bank, price, KPR amounts, milestones) and a **scheme** that decides what gets posted. Accounting entries are generated from the deal's events, so staff record "what happened", not debits and credits.

## 2. The Deal record
| Section | Fields |
|---|---|
| Header | Deal number, date, sales rep, status, scheme(s), notes |
| Unit | Project/cluster, block/no., type, land/building area, address, certificate type (SHM/HGB), developer |
| Parties | Buyer, developer, bank (KPR), partner(s), co-broker / external agent — all are Contacts |
| Price | Selling price, DP, booking fee, KPR (plafon) amount, buyer's own funds, PPN / BPHTB notes |
| Our economics | Commission terms per payer (% of price or fixed, incl./excl. PPN), resale cost, partner share %, co-broke share, internal sales commission |
| Milestones | Booking → DP → SP3K (KPR approval) → Akad kredit → Pencairan (disbursement) → Serah terima (handover) → AJB/sertifikat, each with planned date, actual date, amount, "through us?" flag |
| Documents | Attachments: PPJB, SP3K, akad, invoices, bukti potong |

Status: Prospect → Booked → DP paid → KPR approved → Akad → Disbursed → Handed over → Closed (or Cancelled / Refunded).

## 3. Schemes and their accounting

### A. Commission
- When the commission is earned (setting per deal: on akad, on disbursement, or on developer's confirmation), the app creates a **commission invoice** to the payer (developer, bank or buyer) with PPN.
- Posting: AR / **Pendapatan Komisi** / PPN Keluaran.
- Payer withholds **PPh 23** (typical for agency services between companies) → handled at payment like SaaS (Prepaid PPh 23).
- A deal can have commissions from several payers (e.g. developer 2% + bank referral fee).

### B. Pass-through funds (titipan)
When buyer money passes through you on the way to the developer, it is **not your revenue**:
| Event | Debit | Credit |
|---|---|---|
| Receive booking fee / DP from buyer | Bank | **Titipan Dana Konsumen** (liability), tagged to the deal |
| Remit to developer | Titipan Dana Konsumen | Bank |
| Developer lets you net your commission out of it | Titipan Dana Konsumen | AR (commission invoice) |
| Refund to buyer (cancelled deal) | Titipan Dana Konsumen | Bank |

- Deal screen shows **titipan balance** (received − remitted − netted − refunded). Report: all deals holding buyer money, oldest first. A non-zero titipan on a Closed deal is flagged.
- When money goes **direct** to the developer, the milestone is recorded for tracking only (no posting).
- Receipt (kwitansi) for buyer money prints with the template system and says "received on behalf of [developer]".

### C. Resale (buy and sell)
A house you own is an asset held for sale (**Persediaan Properti**), tracked **per unit**, not as stock quantities.
| Event | Debit | Credit |
|---|---|---|
| Buy unit (incl. notary, BPHTB, renovation capitalised) | Persediaan Properti (unit) | Bank / AP |
| Sale invoice to buyer | AR | Pendapatan Penjualan Properti (+ PPN Keluaran if applicable) |
| Cost of the unit sold | HPP Properti | Persediaan Properti (unit) |
| PPh final 4(2) on the transfer | Beban PPh Final (or Utang PPh 4(2)) | Bank / Utang PPh 4(2) |
| Buyer pays via KPR disbursement | Bank | AR |

- Unit cost card: purchase price + each capitalised cost, so margin per unit is exact.
- Report: units owned (cost, days held), units sold with margin.
- This is the only "inventory" in the app: one record per house, no quantities.

### D. Partner arrangement (no separate PT)
- Deal stores partner and share rule: % of commission, % of margin, or fixed.
- Two treatments (setting per partner agreement):
  1. **You are principal:** full commission is your revenue; partner share is an expense (**Beban Bagi Hasil / Komisi Mitra**) and a payable. If the partner invoices you, it's a normal bill (with PPN/PPh 23 as applicable).
  2. **You are agent for the partner:** only your share is revenue; the partner's share is a liability (**Utang Bagi Hasil Mitra**) until paid.
- Report: partner statement (deals, share earned, paid, balance).

### E. Joint venture PT
- A JV PT is a **separate legal entity → its own company file** in Buku (one company per `.sqlite`). Recent files list makes switching quick.
- In your main company file the JV appears as:
  - **Investasi pada Entitas Asosiasi / Ventura Bersama** (investment) when you put in capital,
  - dividend / profit distribution received when declared,
  - intercompany receivables/payables for costs you pay on its behalf or fees you charge it (normal invoices/bills to a contact flagged "related party").
- Equity-method updates (your share of JV profit) are a manual journal at year end, with a helper template.
- Consolidation across files is **out of scope**.

### F. Co-broke and internal sales commission
- External agent sharing a commission → bill from the agent (PPh 21 or 23 depending on whether they're an individual or a company) as a deal cost.
- Internal sales commission (Putri, Anip…) → calculated per deal/SO from the sales rep's rate; **report only** (paid through payroll outside Buku), or optional accrual journal.

### G. KPR variants and instalments
- Standard KPR: milestones as above; bank disbursement settles the buyer's AR (resale) or triggers the commission (agency).
- **In-house / new-model KPR (buyer pays you in instalments):** an **instalment plan** on the sale: schedule of due dates and amounts (optionally with margin/interest split). Each instalment raises an invoice (or a single invoice with a schedule), with an instalment aging report. Interest/margin portion posts to **Pendapatan Bunga/Margin** over time.
- Exact rules for your new KPR model are to be confirmed when we reach this phase (see ROADMAP open questions).

## 4. Reports
- Deal pipeline by status and sales rep (count, value, expected commission)
- Commission earned vs invoiced vs collected, by payer type (developer / bank / buyer)
- Titipan dana konsumen per deal and ageing
- Resale units: owned, sold, margin
- Partner statements, co-broke payables
- Deal profitability: revenue − partner share − co-broke − direct costs

## 5. Tax touchpoints (details in TAX.md)
- Commission invoices: PPN; payer withholds PPh 23.
- Resale: PPh final 4(2) on transfer value; PPN on the sale when applicable; buyer pays BPHTB (not your tax, noted on the deal).
- Paying agents: PPh 21 (individuals) or PPh 23 (companies) withholding.
- Rates and rules are data in the Taxes table and must be confirmed with your tax consultant before go-live.
