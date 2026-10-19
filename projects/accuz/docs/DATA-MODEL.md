# Buku — Data Model (SQLite) (v2)

Planned schema. Final column names may shift slightly during build; the rules below do not.

## Conventions
- Primary keys: `id INTEGER PRIMARY KEY`.
- Money: `INTEGER` in **minor units** of the stated currency (IDR: rupiah; USD/SGD: cents). Every money column is paired with a currency, either on the row or on its parent document.
- Base amounts: columns suffixed `_base` are in IDR (rupiah, integer).
- Exchange rates: `TEXT` decimal string (e.g. `"16250.50"`), parsed with fixed-point math, never floats. Meaning: **IDR per 1 unit** of the foreign currency.
- Quantities: `INTEGER` scaled ×1000 (3 decimals) so 1.5 hours = 1500.
- Dates: `TEXT` ISO `YYYY-MM-DD`; timestamps ISO with time.
- Soft states: `status TEXT` with CHECK constraints; `is_active INTEGER 0/1`.
- `created_at`, `updated_at` on every business table.

## 1. System and settings

| Table | Key columns | Notes |
|---|---|---|
| `meta` | `key`, `value` | `schema_version`, `app_version`, `created_at`, `last_backup_at` |
| `company` | name, legal_name, npwp, phone, email, website, socials (JSON), logo (data URL), fiscal_year_start_month, base_currency (`IDR`), language, is_pkp | Single row |
| `company_addresses` | id, label (e.g. "18 Office Park"), address text, is_default | Multiple addresses; documents store which one |
| `sales_reps` | id, code (PU, AP…), name, phone, email, commission_rate, signatory_name, signature_image, is_active | Used on every document |
| `signatories` | id, name, title, signature_image, stamp_image | Authorised signers for documents |
| `settings` | `key`, `value` (JSON) | Default terms, default notes, backup reminder days, number formats, default templates |
| `number_sequences` | doc_type, prefix pattern, next_number, reset (`yearly`/`monthly`/`never`) | Tokens `{YYYY}` `{YY}` `{MM}` `{####}` `{SALES}`; start number configurable → `INV-202610-0177` |

## 2. Currency

| Table | Key columns | Notes |
|---|---|---|
| `currencies` | code (PK: IDR/USD/SGD), name, symbol, decimals, is_enabled | Seeded; IDR decimals 0, USD/SGD 2 |
| `exchange_rates` | id, currency, rate_date, rate (TEXT), source (`manual`/`csv`) | UNIQUE(currency, rate_date). IDR never has rows (rate = 1) |

## 3. Ledger

### `accounts`
id, code (UNIQUE), name, name_id (Indonesian name, optional), type (`asset`/`liability`/`equity`/`income`/`expense`), subtype, parent_id, currency (NULL = any; else locked), is_system, is_active, description.

Subtypes: `cash`, `bank`, `ar`, `ap`, `tax_output`, `tax_input`, `tax_withholding_payable`, `tax_withholding_prepaid`, `deferred_revenue`, `customer_funds_held` (titipan), `partner_payable`, `property_inventory`, `property_cogs`, `investment_jv`, `fx_realized`, `fx_unrealized`, `retained_earnings`, `opening_balance`, `customer_credit`, `vendor_prepayment`, `current_asset`, `fixed_asset`, `other`.

### `journal_entries`
id, number, date, memo, source_type (`manual`/`invoice`/`bill`/`payment`/`credit_note`/`transfer`/`revaluation`/`closing`/`opening`/`subscription_recognition`/`deal`/`tax_payment`/`property`), source_id, currency, rate, status (`draft`/`posted`/`void`), reversed_by_id, reverses_id, is_auto_reversing, created_at.

### `journal_lines`
id, entry_id, line_no, account_id, description, contact_id, currency, debit, credit (minor units of `currency`), debit_base, credit_base (IDR), rate.

Rules (enforced in `posting.js`, partly in CHECK constraints):
1. Each line: `debit >= 0`, `credit >= 0`, not both > 0.
2. Per posted entry: `SUM(debit_base) = SUM(credit_base)` exactly.
3. If an account is currency-locked, the line currency must match.
4. Lines of `posted` entries are immutable; changes happen by reversal.
5. Nothing can be posted on or before `lock_date` (Tier 3).

Indexes: `journal_lines(account_id, entry_id)`, `journal_entries(date)`, `journal_lines(contact_id)`.

## 4. Master data

| Table | Key columns |
|---|---|
| `contacts` | id, tags (customer/vendor/developer/bank/partner/agent), name, pic_name, npwp, nik, is_individual, is_related_party, email, phone, billing_address, shipping_address, currency, payment_terms_days, payment_term_text, credit_limit, default_tax_id, default_withholding_id, default_template_id, sales_rep_id, notes, is_active |
| `products` | id, code, name, description, unit (Months, Unit, Lot…), kind (`service`/`plan`/`commission`/`property`), income_account_id, deferred_account_id, expense_account_id, default_tax_id, is_active |
| `plans` | product_id, default_months, quota_text ("50 hits/month"), tokens_total, default_note |
| `product_prices` | product_id, currency, unit_price (per month for plans) |
| `taxes` | id, name, code, print_label ("VAT – 11%"), rate (TEXT `"12"`), base_num/base_den (11/12, exact fraction), kind (`ppn_out`/`ppn_in`/`pph23`/`pph21`/`pph42`/`pph25`), direction (`withheld_by_customer`/`withheld_by_us`/`final`), account_id, is_active |
| `payment_terms` (optional) | id, name, days |

## 5. Sales and purchase documents

One shared structure keeps code small: **`documents`** + **`document_lines`**, with a `doc_type` column.

`doc_type`: `quotation`, `sales_order`, `invoice`, `credit_note`, `bill`, `vendor_credit`, `expense`, `reimbursement`, `receipt` (kwitansi).

### `documents`
id, doc_type, number, contact_id, pic_name, sales_rep_id, company_address_id, deal_id, date, due_date, validity_text, valid_until, payment_term_text, terms_days, reference (opportunity / customer PO), currency, rate, prices_include_tax, vendor_invoice_no, subject, note, text_blocks (JSON per-document overrides), faktur_no, faktur_date, faktur_status, signed_at, signed_by, emeterai_applied, discount_type (`percent`/`amount`), discount_value, subtotal, discount_total, tax_total, total, total_base, amount_paid, status, template_id, source_doc_id (e.g. invoice → its SO), journal_entry_id, voided_at, billing_address_snapshot, shipping_address_snapshot, created_at, updated_at.

Address snapshots are stored so old documents reprint exactly as issued even if the contact changes.

### `document_lines`
id, document_id, line_no, product_id, item_label, description, start_date, end_date, quantity, unit, unit_price, discount_percent, discount_amount, tax_id, withholding_tax_id, account_id, line_note, line_subtotal, line_tax, line_total, source_line_id (invoice line → SO line), qty_fulfilled (SO lines), subscription_id.

### Status sets
- Quotation: `draft`, `sent`, `accepted`, `rejected`, `expired`, `converted`
- Sales order: `draft`, `confirmed`, `signed`, `partial`, `complete`, `expired`, `closed`, `cancelled`
- Invoice / bill: `draft`, `approved`, `partial`, `paid`, `void` (overdue computed from due_date)
- Credit note / vendor credit: `draft`, `approved`, `applied`, `void`

## 6. Payments and banking

| Table | Key columns |
|---|---|
| `payments` | id, number, direction (`in`/`out`), contact_id, date, bank_account_id, currency (of bank account), amount, rate, fee_amount, fee_account_id, reference, memo, journal_entry_id, status |
| `payment_allocations` | id, payment_id, document_id, amount_doc_currency, amount_payment_currency, withholding_amount, withholding_tax_id, bukti_potong_no, bukti_potong_date, fx_gain_loss_base |
| `tax_payments` | id, tax_kind, masa (YYYY-MM), date, amount, bank_account_id, ntpn, journal_entry_id |
| `transfers` | id, date, from_account_id, to_account_id, amount_from, amount_to, fee, journal_entry_id |
| `reconciliations` | id, account_id, statement_date, statement_balance, status (`in_progress`/`finished`), finished_at |
| `reconciliation_lines` | reconciliation_id, journal_line_id |
| `bank_import_presets` | name (BCA, generic…), column mapping JSON, date/number format |
| `bank_import_batches`, `bank_import_lines` | raw statement rows, match status, matched document/entry |
| `bank_rules` | condition (description contains / amount range), action (account, contact, tax) |

`journal_lines` also gets `cleared_reconciliation_id` for quick lookup.

## 7. Templates

| Table | Key columns |
|---|---|
| `doc_templates` | id, name, doc_type (or `all`), layout (`milikirumah`/`classic`/`modern`/`compact`), settings (JSON), is_default, is_system |

`settings` JSON schema is in `TEMPLATES.md`.

## 8. Subscriptions (Tier 2)

| Table | Key columns |
|---|---|
| `subscriptions` | id, contact_id, product_id, sales_rep_id, months, price_per_month, currency, rate, quota_text, planned_start, start_date (handover), end_date, status, invoice_id, invoice_line_id, so_id, renews_subscription_id, renewed_by_id, cancel_reason, handover_ref |
| `revenue_schedules` | id, subscription_id, period (YYYY-MM), amount, amount_base, recognized (0/1), journal_entry_id |

## 9. Property deals (Tier 3)

| Table | Key columns |
|---|---|
| `deals` | id, number, date, sales_rep_id, status, schemes (JSON flags: commission, titipan, resale, partner, instalment), project, unit_desc, address, land_area, building_area, certificate_type, selling_price, booking_fee, dp_amount, kpr_amount, buyer_funds, notes |
| `deal_parties` | deal_id, contact_id, role (`buyer`/`developer`/`bank`/`partner`/`co_broker`) |
| `deal_milestones` | deal_id, kind (booking, dp, sp3k, akad, pencairan, serah_terima, ajb), planned_date, actual_date, amount, through_us, document_id / payment_id |
| `deal_commissions` | deal_id, payer_contact_id, basis (`percent`/`fixed`), value, incl_ppn, earn_trigger (akad/pencairan/confirmed), invoice_id, status |
| `deal_shares` | deal_id, contact_id (partner / co-broker), basis, value, treatment (`principal`/`agent`), bill_id, status |
| `property_units` | id, deal_id, description, acquired_date, status (`owned`/`sold`), sale_document_id |
| `property_unit_costs` | unit_id, date, kind (purchase, notary, bphtb, renovation, other), amount, document_id |
| `partner_agreements` | id, contact_id, name, default_share_basis, default_value, treatment, notes |
| `instalment_plans` | id, deal_id, contact_id, principal, margin_rate, count, frequency, start_date |
| `instalment_lines` | plan_id, no, due_date, principal, margin, invoice_id, status |
| `jv_investments` | id, jv_contact_id, date, kind (capital_in, distribution, equity_share), amount, journal_entry_id |

## 10. Other Tier 3 tables

| Table | Purpose |
|---|---|
| `recurring_schedules` | template document/entry id, frequency, next_date, end_date, last_generated |
| `budgets`, `budget_lines` | fiscal_year, account_id, month, amount_base |
| `audit_log` | timestamp, action, table_name, record_id, before_json, after_json |
| `attachments` | owner_type, owner_id, filename, mime, data (BLOB), size |
| `period_locks` | lock_date |
| `fiscal_adjustments` | year, description, kind (positive/negative), amount |

## 11. Seed data
- Currencies IDR/USD/SGD.
- Chart of accounts "SaaS + Property Agency" (PLAN.md §3) including system accounts: Piutang Usaha (IDR/USD/SGD), Utang Usaha (IDR/USD/SGD), Bank BCA, PPN Keluaran/Masukan, PPh 23 Dibayar di Muka, Utang PPh 21/23/4(2), Pendapatan Diterima di Muka, Titipan Dana Konsumen, Utang Bagi Hasil Mitra, Persediaan Properti, HPP Properti, Investasi Ventura Bersama, Selisih Kurs (realized/unrealized), Laba Ditahan, Ekuitas Saldo Awal, Uang Muka Pelanggan.
- Taxes per TAX.md.
- Number sequences per PLAN.md §2.2.
- Sales reps: PU (Putri), AP (Anip) as examples, editable.
- Templates: MilikiRumah (SO, Invoice, Kwitansi, Statement), Classic, Modern, Compact.
- Default text blocks (Indonesian and English) taken from your current SO and invoice.
