# Buku — Multi-Currency Design (IDR · USD · SGD) (v2: unchanged except §12)

## 1. Principles
1. **IDR is the base currency.** Every journal line stores both its original amount and its IDR amount. All reports total in IDR.
2. **USD and SGD are transaction currencies.** A document is in exactly one currency; all its lines share it.
3. **Rates are "IDR per 1 unit"** (e.g. USD 16,250 / SGD 12,600 — example values only).
4. **No floats.** Money is integer minor units; rates are fixed-point decimals.
5. **Balance in base.** An entry must balance in IDR. Small conversion rounding is absorbed by a rounding line (see §4).

## 2. Display and formatting

| Currency | Decimals | ID locale | EN locale |
|---|---|---|---|
| IDR | 0 | Rp 1.250.000 | IDR 1,250,000 |
| USD | 2 | US$ 1.250,50 | $1,250.50 |
| SGD | 2 | S$ 1.250,50 | S$1,250.50 |

Amount in words (*terbilang*) on documents: Indonesian ("satu juta dua ratus lima puluh ribu rupiah") or English ("One thousand two hundred fifty US dollars and fifty cents"), per template language.

## 3. Exchange rates
- Rates screen: table per currency by date; add, edit, and paste CSV (`date,currency,rate`).
- Lookup: rate on the document date, else the latest earlier one. If none exists, the form asks for one and offers to save it.
- Every document and payment **stores the rate it used**; changing the rates table later never changes posted history.
- Optional per-document rate override (e.g. matching a bank's actual rate or a tax-office rate (kurs pajak)). A second field, "tax rate", can be stored for tax reporting if needed.

## 4. Conversion and rounding
- `base = round_half_up(amount_minor × rate / 10^decimals)`.
- Conversion happens per line, then the document total is checked: if the sum of converted lines differs from the converted total by a few rupiah, the difference is placed on the AR/AP line so the control account matches the document total exactly.
- Unit-test the rule with awkward numbers (e.g. 3 × $0.33 at 16,251.37).

## 5. Accounts
- AR, AP and bank accounts are **currency-locked** (AR-USD, Bank DBS SGD…). This keeps foreign balances clean and makes revaluation exact.
- Income, expense and tax accounts are **not** locked: they receive IDR amounts from any currency.
- Tax: PPN is computed in the document currency and converted at the document's rate (or the stored tax rate if provided).

## 6. Realized FX gain/loss (Tier 2)
When a foreign document is paid at a different rate from the one it was booked at.

**Example:** Invoice USD 1,000 at 16,000 → AR-USD debited Rp 16,000,000.
Paid USD 1,000 at 16,300 into Bank USD:

| Account | Debit (IDR) | Credit (IDR) |
|---|---|---|
| Bank USD (USD 1,000) | 16,300,000 | |
| AR-USD (USD 1,000) | | 16,000,000 |
| FX Gain (realized) | | 300,000 |

Partial payments compute gain/loss on the portion allocated, using the document's original rate for the cleared portion.

## 7. Cross-currency payments (Tier 2)
Example: USD invoice paid into an IDR bank account.
- The user enters what the bank received (Rp 16,250,000) and what it clears (USD 1,000). The app derives the effective rate (16,250).
- AR-USD is cleared at the original book rate; the difference goes to FX gain/loss.
- Bank charges (e.g. Rp 25,000 deducted by the bank) are entered as a fee and posted to Bank Charges expense.

## 8. Transfers between currencies (Tier 2)
SGD 1,000 from Bank SGD to Bank IDR, receiving Rp 12,550,000:
- Credit Bank SGD at its book value in IDR (based on its average/last rate), debit Bank IDR 12,550,000, difference to FX gain/loss.
- "Book value" uses the same rate method as revaluation; documented in code comments and the user guide.

## 9. Unrealized revaluation (Tier 3)
At period end, for each open foreign-currency balance (AR, AP, bank, customer credits):
1. Pick a revaluation rate per currency (pre-filled from the rates table at that date).
2. Compute `foreign_balance × new_rate − current_IDR_balance`.
3. Post one revaluation entry to FX Gain/Loss (unrealized), **auto-reversing** on the first day of the next period.
4. Report shows each account, foreign balance, old IDR, new IDR, and difference.

## 10. Reports in other currencies
- All standard reports: IDR.
- AR/AP aging and customer statements: shown in the **original currency** with IDR alongside.
- Bank account ledgers: foreign column plus IDR column.
- Optional "view report in USD/SGD" converts IDR totals at a chosen rate for presentation only, clearly labelled as converted.

## 11. Test cases (minimum)
1. IDR-only invoice and payment: no FX lines.
2. USD invoice, full payment at the same rate: no FX line.
3. USD invoice, payment at a higher rate: gain. Lower: loss.
4. SGD invoice, two partial payments at different rates: two FX lines, AR-SGD reaches exactly zero in both SGD and IDR.
5. USD invoice paid into the IDR bank with a fee.
6. SGD → IDR transfer.
7. Month-end revaluation, then reversal, then payment: total FX equals realized-only result.
8. Rounding torture test: many small lines, odd rates; Trial Balance still zero.

## 12. v2 additions
- **Deferred revenue** (SaaS paid upfront) is non-monetary: it is recognized at the **invoice rate** and is never revalued. Only AR, AP, bank and titipan balances are revalued.
- **PPh 23 on foreign-currency invoices:** computed in the document currency, posted in IDR at the payment rate; the bukti potong amount is in IDR.
- **Titipan dana konsumen** in a foreign currency (rare) is a monetary liability and is revalued like AP.
