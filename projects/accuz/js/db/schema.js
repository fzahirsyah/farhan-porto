/* Buku — database schema and versioned migrations.
   Money columns are INTEGER minor units; *_base columns are IDR. Rates are TEXT decimals. */
(function () {
  'use strict';
  const Buku = window.Buku;

  const V1 = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  legal_name TEXT,
  npwp TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  socials TEXT NOT NULL DEFAULT '{}',
  logo TEXT,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  base_currency TEXT NOT NULL DEFAULT 'IDR',
  language TEXT NOT NULL DEFAULT 'id' CHECK (language IN ('id','en')),
  is_pkp INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE company_addresses (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sales_reps (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  commission_rate TEXT,
  signature_image TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE number_sequences (
  doc_type TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  reset TEXT NOT NULL DEFAULT 'never' CHECK (reset IN ('never','yearly','monthly')),
  last_period TEXT
);

CREATE TABLE currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL CHECK (decimals BETWEEN 0 AND 4),
  is_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY,
  currency TEXT NOT NULL REFERENCES currencies(code),
  rate_date TEXT NOT NULL,
  rate TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  UNIQUE (currency, rate_date)
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT,
  type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  subtype TEXT NOT NULL DEFAULT 'other',
  section TEXT,
  parent_id INTEGER REFERENCES accounts(id),
  is_header INTEGER NOT NULL DEFAULT 0,
  currency TEXT REFERENCES currencies(code),
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  tags TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  pic_name TEXT,
  npwp TEXT,
  nik TEXT,
  is_individual INTEGER NOT NULL DEFAULT 0,
  is_related_party INTEGER NOT NULL DEFAULT 0,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  currency TEXT REFERENCES currencies(code),
  payment_terms_days INTEGER,
  payment_term_text TEXT,
  credit_limit INTEGER,
  sales_rep_id INTEGER REFERENCES sales_reps(id),
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE taxes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  print_label TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('ppn_out','ppn_in','pph23','pph21','pph42','pph25','none')),
  direction TEXT NOT NULL DEFAULT 'none' CHECK (direction IN ('none','withheld_by_customer','withheld_by_us','final')),
  rate TEXT NOT NULL DEFAULT '0',
  base_num INTEGER NOT NULL DEFAULT 1 CHECK (base_num > 0),
  base_den INTEGER NOT NULL DEFAULT 1 CHECK (base_den > 0),
  account_id INTEGER REFERENCES accounts(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE journal_entries (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  date TEXT NOT NULL,
  reference TEXT,
  memo TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id INTEGER,
  currency TEXT NOT NULL REFERENCES currencies(code),
  rate TEXT NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  reverses_id INTEGER REFERENCES journal_entries(id),
  reversed_by_id INTEGER REFERENCES journal_entries(id),
  total_base INTEGER NOT NULL DEFAULT 0,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE journal_lines (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  description TEXT,
  contact_id INTEGER REFERENCES contacts(id),
  currency TEXT NOT NULL REFERENCES currencies(code),
  rate TEXT NOT NULL DEFAULT '1',
  debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  debit_base INTEGER NOT NULL DEFAULT 0 CHECK (debit_base >= 0),
  credit_base INTEGER NOT NULL DEFAULT 0 CHECK (credit_base >= 0),
  CHECK (NOT (debit > 0 AND credit > 0)),
  CHECK (NOT (debit_base > 0 AND credit_base > 0))
);

CREATE INDEX idx_lines_account ON journal_lines(account_id, entry_id);
CREATE INDEX idx_lines_entry ON journal_lines(entry_id);
CREATE INDEX idx_lines_contact ON journal_lines(contact_id);
CREATE INDEX idx_entries_date ON journal_entries(date, status);
CREATE INDEX idx_rates_lookup ON exchange_rates(currency, rate_date);

-- Lines of a posted entry can never change; corrections happen by reversal.
CREATE TRIGGER trg_lines_locked_update BEFORE UPDATE ON journal_lines
WHEN (SELECT status FROM journal_entries WHERE id = OLD.entry_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_entry_locked'); END;

CREATE TRIGGER trg_lines_locked_delete BEFORE DELETE ON journal_lines
WHEN (SELECT status FROM journal_entries WHERE id = OLD.entry_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_entry_locked'); END;

CREATE TRIGGER trg_lines_locked_insert BEFORE INSERT ON journal_lines
WHEN (SELECT status FROM journal_entries WHERE id = NEW.entry_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_entry_locked'); END;

CREATE TRIGGER trg_entry_posted_delete BEFORE DELETE ON journal_entries
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_entry_locked'); END;

CREATE TRIGGER trg_entry_posted_update BEFORE UPDATE OF date, currency, rate, total_base, number ON journal_entries
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_entry_locked'); END;

CREATE TRIGGER trg_entry_status BEFORE UPDATE OF status ON journal_entries
WHEN OLD.status <> 'draft' AND NOT (OLD.status = 'posted' AND NEW.status = 'void')
BEGIN SELECT RAISE(ABORT, 'posted_entry_locked'); END;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id INTEGER,
  summary TEXT
);
`;


  // ---------- Version 2: sales, purchases, payments, subscriptions, banking, tax, templates ----------
  const V2 = `
ALTER TABLE contacts ADD COLUMN code TEXT;
ALTER TABLE contacts ADD COLUMN default_tax_id INTEGER REFERENCES taxes(id);
ALTER TABLE contacts ADD COLUMN default_template_id INTEGER;
ALTER TABLE contacts ADD COLUMN withholds_pph23 INTEGER NOT NULL DEFAULT 1;

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'service' CHECK (kind IN ('service','plan','commission','fee','other')),
  unit TEXT,
  default_months INTEGER,
  quota_text TEXT,
  default_note TEXT,
  income_account_id INTEGER REFERENCES accounts(id),
  expense_account_id INTEGER REFERENCES accounts(id),
  tax_id INTEGER REFERENCES taxes(id),
  purchase_tax_id INTEGER REFERENCES taxes(id),
  is_sold INTEGER NOT NULL DEFAULT 1,
  is_bought INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE product_prices (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  currency TEXT NOT NULL REFERENCES currencies(code),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (product_id, currency)
);

CREATE TABLE doc_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'all',
  layout TEXT NOT NULL DEFAULT 'milikirumah',
  settings TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('sales_order','invoice','credit_note','bill','expense')),
  number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  contact_id INTEGER REFERENCES contacts(id),
  pic_name TEXT,
  sales_rep_id INTEGER REFERENCES sales_reps(id),
  company_address_id INTEGER REFERENCES company_addresses(id),
  date TEXT NOT NULL,
  due_date TEXT,
  valid_until TEXT,
  validity_text TEXT,
  payment_term_text TEXT,
  terms_days INTEGER,
  reference TEXT,
  vendor_invoice_no TEXT,
  subject TEXT,
  note TEXT,
  text_blocks TEXT NOT NULL DEFAULT '{}',
  currency TEXT NOT NULL REFERENCES currencies(code),
  rate TEXT NOT NULL DEFAULT '1',
  discount_type TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none','percent','amount')),
  discount_value TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  withholding_tax_id INTEGER REFERENCES taxes(id),
  withholding_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  total_base INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  base_cleared INTEGER NOT NULL DEFAULT 0,
  paid_from_account_id INTEGER REFERENCES accounts(id),
  source_doc_id INTEGER REFERENCES documents(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  template_id INTEGER REFERENCES doc_templates(id),
  faktur_no TEXT,
  faktur_date TEXT,
  signed_at TEXT,
  billing_snapshot TEXT,
  approved_at TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (doc_type, number)
);
CREATE INDEX idx_docs_type ON documents(doc_type, status, date);
CREATE INDEX idx_docs_contact ON documents(contact_id);

CREATE TABLE document_lines (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  product_id INTEGER REFERENCES products(id),
  item_label TEXT,
  description TEXT,
  start_date TEXT,
  end_date TEXT,
  quantity INTEGER NOT NULL DEFAULT 1000,
  unit TEXT,
  unit_price INTEGER NOT NULL DEFAULT 0,
  discount_percent TEXT,
  line_subtotal INTEGER NOT NULL DEFAULT 0,
  line_discount INTEGER NOT NULL DEFAULT 0,
  line_net INTEGER NOT NULL DEFAULT 0,
  line_tax INTEGER NOT NULL DEFAULT 0,
  line_net_base INTEGER NOT NULL DEFAULT 0,
  tax_id INTEGER REFERENCES taxes(id),
  account_id INTEGER REFERENCES accounts(id),
  line_note TEXT,
  source_line_id INTEGER REFERENCES document_lines(id),
  qty_fulfilled INTEGER NOT NULL DEFAULT 0,
  is_deferred INTEGER NOT NULL DEFAULT 0,
  renews_subscription_id INTEGER
);
CREATE INDEX idx_doclines_doc ON document_lines(document_id);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  contact_id INTEGER REFERENCES contacts(id),
  date TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  currency TEXT NOT NULL REFERENCES currencies(code),
  rate TEXT NOT NULL DEFAULT '1',
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  fee INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
  fee_account_id INTEGER REFERENCES accounts(id),
  unapplied INTEGER NOT NULL DEFAULT 0,
  reference TEXT,
  memo TEXT,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  bank_import_line_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE payment_allocations (
  id INTEGER PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  withholding INTEGER NOT NULL DEFAULT 0 CHECK (withholding >= 0),
  withholding_tax_id INTEGER REFERENCES taxes(id),
  bukti_potong_no TEXT,
  bukti_potong_date TEXT,
  doc_rate TEXT,
  ar_base INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_alloc_doc ON payment_allocations(document_id);
CREATE TABLE document_applications (
  id INTEGER PRIMARY KEY,
  credit_doc_id INTEGER NOT NULL REFERENCES documents(id),
  document_id INTEGER NOT NULL REFERENCES documents(id),
  date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  ar_base INTEGER NOT NULL DEFAULT 0,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  product_id INTEGER REFERENCES products(id),
  sales_rep_id INTEGER REFERENCES sales_reps(id),
  description TEXT,
  months INTEGER NOT NULL CHECK (months > 0),
  price_per_month INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  amount_base INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  rate TEXT NOT NULL DEFAULT '1',
  quota_text TEXT,
  planned_start TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','pending_handover','active','cancelled')),
  invoice_id INTEGER REFERENCES documents(id),
  invoice_line_id INTEGER REFERENCES document_lines(id),
  so_id INTEGER REFERENCES documents(id),
  deferred_account_id INTEGER REFERENCES accounts(id),
  revenue_account_id INTEGER REFERENCES accounts(id),
  renews_id INTEGER REFERENCES subscriptions(id),
  renewed_by_id INTEGER REFERENCES subscriptions(id),
  handover_ref TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE revenue_schedules (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount INTEGER NOT NULL,
  amount_base INTEGER NOT NULL,
  recognized INTEGER NOT NULL DEFAULT 0,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  UNIQUE (subscription_id, period)
);

CREATE TABLE tax_payments (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  masa TEXT NOT NULL,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  bank_account_id INTEGER NOT NULL REFERENCES accounts(id),
  ntpn TEXT,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL
);

CREATE TABLE bank_rules (
  id INTEGER PRIMARY KEY,
  pattern TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'any' CHECK (direction IN ('in','out','any')),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  contact_id INTEGER REFERENCES contacts(id),
  memo TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE bank_imports (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  file_name TEXT,
  preset TEXT,
  line_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL
);
CREATE TABLE bank_import_lines (
  id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES bank_imports(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  date TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL,
  balance INTEGER,
  hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','matched','created','ignored')),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  UNIQUE (account_id, hash)
);
CREATE TABLE reconciliations (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  statement_date TEXT NOT NULL,
  statement_balance INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'finished',
  created_at TEXT NOT NULL
);
CREATE TABLE reconciliation_lines (
  reconciliation_id INTEGER NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  journal_line_id INTEGER NOT NULL UNIQUE REFERENCES journal_lines(id),
  PRIMARY KEY (reconciliation_id, journal_line_id)
);
`;


  // Version 3: safeguard closed VAT periods and model subscription refunds explicitly.
  const V3 = `
ALTER TABLE subscriptions ADD COLUMN allocation_method TEXT NOT NULL DEFAULT 'equal' CHECK(allocation_method IN ('equal','daily'));
CREATE TABLE subscription_cancellations (
  id INTEGER PRIMARY KEY, subscription_id INTEGER NOT NULL UNIQUE REFERENCES subscriptions(id),
  mode TEXT NOT NULL CHECK(mode IN ('refund','recognize')),
  status TEXT NOT NULL CHECK(status IN ('pending_credit','credited','recognized')),
  date TEXT NOT NULL, reason TEXT, amount INTEGER NOT NULL DEFAULT 0,
  amount_base INTEGER NOT NULL DEFAULT 0, credit_note_id INTEGER UNIQUE REFERENCES documents(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE tax_period_closings (
  masa TEXT PRIMARY KEY, journal_entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id),
  output_base INTEGER NOT NULL, input_base INTEGER NOT NULL, net_base INTEGER NOT NULL,
  closed_at TEXT NOT NULL
);
`;

  const V4 = `
CREATE TABLE deals (
 id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, deal_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','booked','dp_paid','kpr_approved','akad','disbursed','handed_over','closed','cancelled','refunded')),
 scheme TEXT NOT NULL DEFAULT 'agency' CHECK(scheme IN ('agency','resale','mixed')),
 project TEXT NOT NULL, cluster TEXT, block TEXT, unit_no TEXT, unit_type TEXT,
 land_area TEXT, building_area TEXT, certificate_type TEXT, property_address TEXT,
 buyer_id INTEGER REFERENCES contacts(id), developer_id INTEGER REFERENCES contacts(id),
 bank_id INTEGER REFERENCES contacts(id), sales_rep_id INTEGER REFERENCES sales_reps(id),
 price INTEGER NOT NULL DEFAULT 0 CHECK(price>=0), booking_fee INTEGER NOT NULL DEFAULT 0,
 dp INTEGER NOT NULL DEFAULT 0, kpr_amount INTEGER NOT NULL DEFAULT 0,
 notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_deals_status ON deals(status, deal_date);
CREATE TABLE deal_parties (
 id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id),
 contact_id INTEGER NOT NULL REFERENCES contacts(id),
 role TEXT NOT NULL CHECK(role IN ('buyer','developer','bank','partner','co_broker','other')),
 notes TEXT, UNIQUE(deal_id, contact_id, role)
);
CREATE TABLE deal_milestones (
 id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id),
 kind TEXT NOT NULL CHECK(kind IN ('booking','dp','sp3k','akad','pencairan','handover','ajb','confirmation')),
 planned_date TEXT, actual_date TEXT, amount INTEGER NOT NULL DEFAULT 0,
 through_us INTEGER NOT NULL DEFAULT 0, reference TEXT, notes TEXT,
 UNIQUE(deal_id, kind)
);
CREATE TABLE deal_commissions (
 id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id),
 payer_id INTEGER NOT NULL REFERENCES contacts(id),
 payer_role TEXT NOT NULL CHECK(payer_role IN ('developer','bank','buyer')),
 basis TEXT NOT NULL DEFAULT 'fixed' CHECK(basis IN ('fixed','percent')),
 rate TEXT, amount INTEGER NOT NULL CHECK(amount>0),
 trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('akad','pencairan','confirmation')),
 tax_id INTEGER REFERENCES taxes(id),
 status TEXT NOT NULL DEFAULT 'agreed' CHECK(status IN ('agreed','invoiced')),
 invoice_id INTEGER UNIQUE REFERENCES documents(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE deal_fund_movements (
 id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id),
 kind TEXT NOT NULL CHECK(kind IN ('receipt','remit','refund','offset')),
 date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
 contact_id INTEGER REFERENCES contacts(id), bank_account_id INTEGER REFERENCES accounts(id),
 reference TEXT, memo TEXT, journal_entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id),
 bank_import_line_id INTEGER UNIQUE REFERENCES bank_import_lines(id), created_at TEXT NOT NULL
);
CREATE INDEX idx_deal_funds ON deal_fund_movements(deal_id,date);
CREATE TABLE deal_settlement_allocations (
 id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id),
 movement_id INTEGER NOT NULL UNIQUE REFERENCES deal_fund_movements(id),
 invoice_id INTEGER NOT NULL REFERENCES documents(id),
 amount INTEGER NOT NULL CHECK(amount>0), withholding INTEGER NOT NULL DEFAULT 0 CHECK(withholding>=0),
 ar_base INTEGER NOT NULL CHECK(ar_base>=0), created_at TEXT NOT NULL
);
CREATE TABLE deal_shares (
 id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id),
 contact_id INTEGER NOT NULL REFERENCES contacts(id),
 treatment TEXT NOT NULL CHECK(treatment IN ('principal','agent')),
 percentage TEXT, amount INTEGER NOT NULL CHECK(amount>0),
 status TEXT NOT NULL DEFAULT 'agreed' CHECK(status IN ('agreed','accrued','paid')),
 journal_entry_id INTEGER REFERENCES journal_entries(id), payout_entry_id INTEGER REFERENCES journal_entries(id),
 reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE deal_ledger_links (
 id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id),
 journal_line_id INTEGER NOT NULL UNIQUE REFERENCES journal_lines(id),
 notes TEXT, created_at TEXT NOT NULL
);
ALTER TABLE documents ADD COLUMN deal_id INTEGER REFERENCES deals(id);
CREATE INDEX idx_documents_deal ON documents(deal_id);
ALTER TABLE journal_entries ADD COLUMN deal_id INTEGER REFERENCES deals(id);
CREATE INDEX idx_journals_deal ON journal_entries(deal_id);
`;

  // Version 5 — owned-property inventory, sale receivables, instalments and JV investments.
  const V5 = `
CREATE TABLE property_units (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, project TEXT NOT NULL, address TEXT,
 deal_id INTEGER REFERENCES deals(id), seller_id INTEGER REFERENCES contacts(id), buyer_id INTEGER REFERENCES contacts(id),
 sales_rep_id INTEGER REFERENCES sales_reps(id),
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','owned','reserved','sold')),
 cost INTEGER NOT NULL DEFAULT 0 CHECK(cost>=0), acquired_at TEXT, sold_at TEXT,
 notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE property_unit_costs (
 id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES property_units(id), date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('acquisition','notary','tax','renovation','improvement','other_capitalized')),
 amount INTEGER NOT NULL CHECK(amount>0), bank_account_id INTEGER REFERENCES accounts(id),
 journal_entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id), reference TEXT, created_at TEXT NOT NULL
);
CREATE TABLE property_sales (
 id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL UNIQUE REFERENCES property_units(id),
 buyer_id INTEGER NOT NULL REFERENCES contacts(id), sale_date TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0),
 tax_id INTEGER REFERENCES taxes(id), invoice_id INTEGER NOT NULL UNIQUE REFERENCES documents(id),
 hpp_journal_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id), recognized_at TEXT NOT NULL
);
CREATE TABLE property_tax_payments (
 id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES property_sales(id),
 date TEXT NOT NULL, tax_kind TEXT NOT NULL CHECK(tax_kind IN ('pph_final','other_property_tax')),
 amount INTEGER NOT NULL CHECK(amount>0), bank_account_id INTEGER NOT NULL REFERENCES accounts(id),
 journal_entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id), ntpn TEXT, created_at TEXT NOT NULL
);
CREATE TABLE property_disbursements (
 id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES property_sales(id),
 date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
 payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id), reference TEXT, created_at TEXT NOT NULL
);
CREATE TABLE instalment_plans (
 id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL UNIQUE REFERENCES property_sales(id),
 invoice_id INTEGER NOT NULL REFERENCES documents(id), start_date TEXT NOT NULL,
 principal INTEGER NOT NULL CHECK(principal>0), months INTEGER NOT NULL CHECK(months BETWEEN 1 AND 360),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','settled','cancelled')),
 created_at TEXT NOT NULL
);
CREATE TABLE instalment_lines (
 id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES instalment_plans(id),
 due_date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), paid INTEGER NOT NULL DEFAULT 0 CHECK(paid>=0),
 UNIQUE(plan_id,due_date), CHECK(paid<=amount)
);
CREATE TABLE instalment_allocations (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES instalment_lines(id),
 payment_id INTEGER NOT NULL REFERENCES payments(id), amount INTEGER NOT NULL CHECK(amount>0),
 created_at TEXT NOT NULL, UNIQUE(line_id,payment_id)
);
CREATE TABLE jv_investments (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, counterparty_id INTEGER REFERENCES contacts(id),
 memo TEXT, created_at TEXT NOT NULL
);
CREATE TABLE jv_movements (
 id INTEGER PRIMARY KEY, investment_id INTEGER NOT NULL REFERENCES jv_investments(id),
 kind TEXT NOT NULL CHECK(kind IN ('contribution','capital_return','distribution')),
 date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), bank_account_id INTEGER NOT NULL REFERENCES accounts(id),
 journal_entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id), reference TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_unit_costs ON property_unit_costs(unit_id);
CREATE INDEX idx_instalment_due ON instalment_lines(due_date);
`;

  // Version 6 — quotations are non-posting commercial records, separate from the strict document CHECK.
  const V6 = `
CREATE TABLE quotations (
 id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, contact_id INTEGER NOT NULL REFERENCES contacts(id),
 deal_id INTEGER REFERENCES deals(id), date TEXT NOT NULL, valid_until TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','expired')),
 currency TEXT NOT NULL DEFAULT 'IDR', note TEXT, total INTEGER NOT NULL DEFAULT 0,
 sales_order_id INTEGER UNIQUE REFERENCES documents(id), accepted_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE quotation_lines (
 id INTEGER PRIMARY KEY, quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
 line_no INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
 tax_id INTEGER REFERENCES taxes(id), account_id INTEGER REFERENCES accounts(id),
 UNIQUE(quotation_id,line_no)
);
CREATE TABLE sales_commission_rules (
 id INTEGER PRIMARY KEY, sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
 basis TEXT NOT NULL CHECK(basis IN ('commission_collected','resale_margin')),
 percent TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
`;

  // Version 7 — controlled month closes, financial planning and tax working papers.
  const V7 = `
CREATE TABLE period_closings (
 period TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('closed','reopened')),
 checklist TEXT NOT NULL, closed_at TEXT NOT NULL, reopened_at TEXT, reopen_reason TEXT,
 trial_debit INTEGER NOT NULL, trial_credit INTEGER NOT NULL
);
CREATE TABLE year_end_closings (
 year_end TEXT PRIMARY KEY, journal_entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id),
 profit INTEGER NOT NULL, closed_at TEXT NOT NULL
);
CREATE TABLE period_events (
 id INTEGER PRIMARY KEY, period TEXT NOT NULL, event TEXT NOT NULL, reason TEXT,
 at TEXT NOT NULL
);
CREATE TABLE budgets (
 id INTEGER PRIMARY KEY, period TEXT NOT NULL, account_id INTEGER NOT NULL REFERENCES accounts(id),
 amount INTEGER NOT NULL, UNIQUE(period,account_id)
);
CREATE TABLE fiscal_adjustments (
 id INTEGER PRIMARY KEY, period TEXT NOT NULL, account_id INTEGER REFERENCES accounts(id),
 kind TEXT NOT NULL CHECK(kind IN ('positive','negative','final_income','credit')),
 amount INTEGER NOT NULL CHECK(amount>=0), memo TEXT, created_at TEXT NOT NULL
);
CREATE TABLE fx_revaluations (
 id INTEGER PRIMARY KEY, period TEXT NOT NULL, currency TEXT NOT NULL REFERENCES currencies(code),
 journal_entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id), reversal_entry_id INTEGER REFERENCES journal_entries(id),
 amount INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(period,currency)
);
`;

  // Version 8 — local recurring drafts, embedded attachments, auditable operations and presets.
  const V8 = `
CREATE TABLE recurring_schedules (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, template_json TEXT NOT NULL,
 cadence TEXT NOT NULL CHECK(cadence IN ('monthly','quarterly','yearly')),
 next_date TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE recurring_runs (
 id INTEGER PRIMARY KEY, schedule_id INTEGER NOT NULL REFERENCES recurring_schedules(id),
 date TEXT NOT NULL, draft_journal_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(id),
 created_at TEXT NOT NULL, UNIQUE(schedule_id,date)
);
CREATE TABLE attachments (
 id INTEGER PRIMARY KEY, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
 file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
 bytes BLOB NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE audit_changes (
 id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL,
 entity_id INTEGER, before_json TEXT, after_json TEXT, reason TEXT
);
CREATE TABLE import_presets (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, mapping_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type,entity_id);
`;

  /** Ordered migrations. Never edit a shipped one; add a new version instead. */
  const MIGRATIONS = [
    { version: 1, sql: V1 },
    // v2 also adds default templates, numbering and settings to an existing company (see seed.ensureDefaults).
    { version: 2, sql: V2, after: (db) => { if (db.scalar('SELECT count(*) FROM company')) Buku.seed.ensureDefaults(db); } },
    { version: 3, sql: V3, after: (db) => {
      db.run(`INSERT OR IGNORE INTO tax_period_closings(masa,journal_entry_id,output_base,input_base,net_base,closed_at)
        SELECT substr(reference,5,7),id,0,0,0,coalesce(posted_at,created_at) FROM journal_entries
        WHERE source_type='ppn_close' AND status='posted' AND reversed_by_id IS NULL AND reference GLOB 'PPN ????-??'`);
    } },
    { version: 4, sql: V4 },
    { version: 5, sql: V5 },
    { version: 6, sql: V6 },
    { version: 7, sql: V7 },
    { version: 8, sql: V8 },
  ];
  const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version;

  function currentVersion(db) {
    const exists = db.scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='meta'");
    if (!exists) return 0;
    return Number(db.meta('schema_version') || 0);
  }

  /** Apply pending migrations. Returns { from, to }. Throws if the file is newer than this app. */
  function migrate(db) {
    const from = currentVersion(db);
    if (from > LATEST) throw new Buku.BukuError('file_too_new', 'This file was made by a newer version of Buku.');
    if (from === LATEST) return { from, to: from };
    db.tx(() => {
      for (const m of MIGRATIONS) {
        if (m.version <= from) continue;
        db.exec(m.sql);
        if (m.after) m.after(db);
        db.meta('schema_version', m.version);
      }
    });
    return { from, to: LATEST };
  }

  Buku.schema = { migrate, currentVersion, LATEST, MIGRATIONS };
})();
