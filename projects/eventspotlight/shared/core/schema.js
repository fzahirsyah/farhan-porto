/* Event Spotlight — database schema. All tables for every surface are defined up front.
   Bump SCHEMA_VERSION and add an entry to MIGRATIONS when the schema changes. */
(function () {
  const ES = (window.ES = window.ES || {});
  ES.SCHEMA_VERSION = 1;
  ES.MIGRATIONS = {};

  ES.SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- ===== System =====
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS org (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL, legal_name TEXT, npwp TEXT, address TEXT, city TEXT, phone TEXT, email TEXT,
  bank_name TEXT, bank_acc TEXT, bank_holder TEXT, signatory TEXT, signatory_title TEXT
);
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT, email TEXT,
  plan TEXT DEFAULT 'Annual', plan_fee INTEGER DEFAULT 5000000, started TEXT, renews TEXT,
  status TEXT DEFAULT 'active', events INTEGER DEFAULT 0, tickets INTEGER DEFAULT 0, notes TEXT, is_current INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS support_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER, reason TEXT, status TEXT DEFAULT 'open',
  requested_by TEXT, created_at TEXT, granted_until TEXT, granted_by TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, short TEXT, role TEXT NOT NULL,          -- owner | director | finance | producer | ticketing | partnerships | crew
  title TEXT, email TEXT, phone TEXT, pin_hash TEXT NOT NULL, color TEXT DEFAULT '#2F5BEA',
  active INTEGER DEFAULT 1, perm_override TEXT DEFAULT '{}', created_at TEXT, gate_id INTEGER
);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor TEXT, actor_kind TEXT, action TEXT, entity TEXT, entity_id INTEGER, detail TEXT);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, user_id INTEGER, partner_id INTEGER, title TEXT, body TEXT, link TEXT, created_at TEXT, read INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT, to_name TEXT, subject TEXT, body TEXT, kind TEXT, created_at TEXT, opened INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS login_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ref TEXT, code TEXT, created_at TEXT, expires_at TEXT, used INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_kind TEXT, owner_id INTEGER, name TEXT, mime TEXT, size INTEGER, data BLOB, uploaded_by TEXT, created_at TEXT, status TEXT DEFAULT 'new');

-- ===== Layered configuration =====
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, level TEXT NOT NULL, scope_id INTEGER DEFAULT 0,
  value TEXT, locked INTEGER DEFAULT 0, status TEXT DEFAULT 'published', updated_by TEXT, updated_at TEXT, published_at TEXT
);
CREATE TABLE IF NOT EXISTS config_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, level TEXT, scope_id INTEGER, old_value TEXT, new_value TEXT, action TEXT, by TEXT, at TEXT);

-- ===== Projects, events, tickets =====
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, status TEXT DEFAULT 'active', budget_ceiling INTEGER DEFAULT 0, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, name TEXT NOT NULL, type TEXT DEFAULT 'Concert', date TEXT, doors TEXT, start_time TEXT, end_time TEXT,
  venue TEXT, address TEXT, city TEXT, capacity INTEGER DEFAULT 0, tz TEXT DEFAULT 'WIB', status TEXT DEFAULT 'planning', qr_secret TEXT, description TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS ticket_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, name TEXT NOT NULL, price INTEGER DEFAULT 0, quota INTEGER DEFAULT 0, tier TEXT DEFAULT 'general',
  color TEXT, perks TEXT, requires_id INTEGER DEFAULT 0, active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS waves (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, kind TEXT NOT NULL, name TEXT, opens_at TEXT, closes_at TEXT, pct INTEGER DEFAULT 0, status TEXT DEFAULT 'scheduled', draw_seed TEXT, draw_hash TEXT, drawn_at TEXT
);
CREATE TABLE IF NOT EXISTS wave_alloc (id INTEGER PRIMARY KEY AUTOINCREMENT, wave_id INTEGER, ticket_type_id INTEGER, qty INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS community_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, code TEXT NOT NULL, community TEXT, ticket_type_id INTEGER, max_qty INTEGER DEFAULT 2,
  bound_phone TEXT, used INTEGER DEFAULT 0, used_at TEXT, order_id INTEGER
);
CREATE TABLE IF NOT EXISTS lottery_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, wave_id INTEGER, phone TEXT, name TEXT, qty INTEGER DEFAULT 1, ticket_type_id INTEGER,
  status TEXT DEFAULT 'entered', draw_rank INTEGER, link_token TEXT, link_expires_at TEXT, created_at TEXT, order_id INTEGER
);
CREATE TABLE IF NOT EXISTS queue_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, wave_id INTEGER, phone TEXT, name TEXT, rank INTEGER, joined_at TEXT, status TEXT DEFAULT 'waiting', admitted_at TEXT);
CREATE TABLE IF NOT EXISTS promotors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, name TEXT NOT NULL, kind TEXT DEFAULT 'reseller', code TEXT, commission INTEGER DEFAULT 0,
  quota INTEGER DEFAULT 0, contact TEXT, phone TEXT, status TEXT DEFAULT 'active', notes TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, no TEXT, buyer_name TEXT, buyer_phone TEXT, buyer_email TEXT, verified INTEGER DEFAULT 1,
  channel TEXT DEFAULT 'direct', wave_kind TEXT, promotor_id INTEGER, qty INTEGER DEFAULT 1, subtotal INTEGER DEFAULT 0, admin_fee INTEGER DEFAULT 0, total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'paid', payment_method TEXT, created_at TEXT, paid_at TEXT, ledger_entry_id INTEGER
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, order_id INTEGER, ticket_type_id INTEGER, serial TEXT UNIQUE, holder_name TEXT, holder_phone TEXT,
  status TEXT DEFAULT 'valid', secret TEXT, price INTEGER DEFAULT 0, issued_at TEXT, used_at TEXT, used_gate INTEGER, used_by TEXT, used_device TEXT,
  transferred_from INTEGER, rescue INTEGER DEFAULT 0, generation INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_tickets_event ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS ix_tickets_order ON tickets(order_id);
CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, ticket_id INTEGER, new_ticket_id INTEGER, from_phone TEXT, from_name TEXT, to_phone TEXT, to_name TEXT,
  fee INTEGER DEFAULT 0, kind TEXT DEFAULT 'transfer', created_at TEXT, ledger_entry_id INTEGER
);
CREATE TABLE IF NOT EXISTS gates (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, name TEXT NOT NULL, kind TEXT DEFAULT 'entry', lanes INTEGER DEFAULT 2, open INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, ticket_id INTEGER, serial TEXT, gate_id INTEGER, device TEXT, user_id INTEGER,
  result TEXT, detail TEXT, at TEXT, offline INTEGER DEFAULT 0, synced_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_scans_event ON scans(event_id, at);
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, ticket_id INTEGER, serial TEXT, gate_id INTEGER, opened_by INTEGER, claimant_name TEXT, claimant_phone TEXT,
  status TEXT DEFAULT 'open', otp TEXT, notes TEXT, created_at TEXT, resolved_at TEXT, resolution TEXT, new_ticket_id INTEGER
);
CREATE TABLE IF NOT EXISTS media_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, channel TEXT, kind TEXT DEFAULT 'media', vendor TEXT, starts TEXT, ends TEXT, cost INTEGER DEFAULT 0,
  expected_tickets INTEGER DEFAULT 0, status TEXT DEFAULT 'planned', notes TEXT, po_id INTEGER
);

-- ===== Sponsors & proposals =====
CREATE TABLE IF NOT EXISTS sponsor_packages (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, name TEXT, price INTEGER DEFAULT 0, slots INTEGER DEFAULT 1, benefits TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sponsor_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, company TEXT NOT NULL, contact_name TEXT, contact_email TEXT, contact_phone TEXT, package_id INTEGER, value INTEGER DEFAULT 0,
  stage TEXT DEFAULT 'lead', owner_id INTEGER, booth_code TEXT, notes TEXT, created_at TEXT, signed_at TEXT, next_step TEXT, next_step_date TEXT, category TEXT
);
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, type TEXT, doc_no TEXT, title TEXT, recipient TEXT, recipient_ref INTEGER, data TEXT, status TEXT DEFAULT 'draft',
  version INTEGER DEFAULT 1, locked_at TEXT, share_token TEXT, views INTEGER DEFAULT 0, last_viewed TEXT, created_by TEXT, created_at TEXT, approved_by TEXT
);

-- ===== Artists, vendors, purchasing =====
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, name TEXT NOT NULL, role TEXT DEFAULT 'support', fee INTEGER DEFAULT 0, status TEXT DEFAULT 'negotiating', contact TEXT, email TEXT, phone TEXT,
  set_time TEXT, set_minutes INTEGER DEFAULT 45, stage TEXT DEFAULT 'Main stage', fee_po_id INTEGER, notes TEXT
);
CREATE TABLE IF NOT EXISTS artist_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER, category TEXT, request TEXT, qty INTEGER DEFAULT 1, est_cost INTEGER DEFAULT 0, approved_cost INTEGER DEFAULT 0,
  status TEXT DEFAULT 'requested', note TEXT, created_at TEXT, by TEXT, decided_by TEXT, decided_at TEXT, po_id INTEGER
);
CREATE TABLE IF NOT EXISTS vendors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT, contact TEXT, email TEXT, phone TEXT, npwp TEXT, bank TEXT, status TEXT DEFAULT 'active');
CREATE TABLE IF NOT EXISTS budget_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, category TEXT, name TEXT, planned INTEGER DEFAULT 0, notes TEXT);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, vendor_id INTEGER, no TEXT, category TEXT, description TEXT, amount INTEGER DEFAULT 0, tax_code TEXT, budget_line_id INTEGER,
  status TEXT DEFAULT 'draft', pic_id INTEGER, order_date TEXT, due_date TEXT, delivered_at TEXT, delivered_by TEXT, invoice_no TEXT, invoice_amount INTEGER, invoice_date TEXT,
  invoice_file_id INTEGER, approved_by TEXT, approved_at TEXT, paid_at TEXT, payment_id INTEGER, rfq_proposal_id INTEGER, source TEXT, source_id INTEGER, quote_amount INTEGER
);

-- ===== Accounting =====
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT, type TEXT, active INTEGER DEFAULT 1, system INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS journal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, date TEXT, no TEXT, memo TEXT, source TEXT, source_id INTEGER, created_by TEXT, created_at TEXT, reversed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS journal_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER, account_id INTEGER, debit INTEGER DEFAULT 0, credit INTEGER DEFAULT 0, memo TEXT);
CREATE INDEX IF NOT EXISTS ix_jl_entry ON journal_lines(entry_id);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, type TEXT, no TEXT, party_kind TEXT, party_id INTEGER, party_name TEXT, party_address TEXT, issue_date TEXT, due_date TEXT,
  lines TEXT, subtotal INTEGER DEFAULT 0, tax_amount INTEGER DEFAULT 0, stamp INTEGER DEFAULT 0, total INTEGER DEFAULT 0, paid INTEGER DEFAULT 0, status TEXT DEFAULT 'draft',
  ref_doc_id INTEGER, deal_id INTEGER, proposal_id INTEGER, terms TEXT, notes TEXT, created_by TEXT, created_at TEXT, ledger_entry_id INTEGER, signed_by TEXT, signed_at TEXT
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, direction TEXT, doc_id INTEGER, po_id INTEGER, amount INTEGER, date TEXT, method TEXT, reference TEXT, note TEXT,
  receipt_doc_id INTEGER, ledger_entry_id INTEGER, created_by TEXT, proof_file_id INTEGER, status TEXT DEFAULT 'posted'
);

-- ===== Operations =====
CREATE TABLE IF NOT EXISTS checklists (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, title TEXT, pic_id INTEGER, due TEXT, phase TEXT DEFAULT 'pre-event', area TEXT);
CREATE TABLE IF NOT EXISTS checklist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, checklist_id INTEGER, text TEXT, done INTEGER DEFAULT 0, done_by TEXT, done_at TEXT, required INTEGER DEFAULT 1, note TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS rundown_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, at_time TEXT, minutes INTEGER DEFAULT 30, title TEXT, stage TEXT DEFAULT 'Main stage', owner_id INTEGER, status TEXT DEFAULT 'pending',
  kind TEXT DEFAULT 'program', notes TEXT, artist_id INTEGER, started_at TEXT, ended_at TEXT
);
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, name TEXT, category TEXT, starts TEXT, ends TEXT, owner_id INTEGER, depends_on INTEGER, pct INTEGER DEFAULT 0, status TEXT DEFAULT 'open', notes TEXT
);
CREATE TABLE IF NOT EXISTS layout_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, kind TEXT, label TEXT, x REAL, y REAL, w REAL, h REAL, color TEXT, ref_kind TEXT, ref_id INTEGER, capacity INTEGER, meta TEXT
);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, kind TEXT, severity TEXT DEFAULT 'normal', location TEXT, description TEXT, reported_by TEXT, status TEXT DEFAULT 'open',
  at TEXT, resolved_at TEXT, resolution TEXT, assigned_to INTEGER
);
CREATE TABLE IF NOT EXISTS booth_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, deal_id INTEGER, name TEXT, line_y REAL DEFAULT 0.5, direction TEXT DEFAULT 'down', sensitivity INTEGER DEFAULT 50,
  calibrated INTEGER DEFAULT 0, calib_ai INTEGER, calib_hand INTEGER, status TEXT DEFAULT 'setup', last_seen TEXT
);
CREATE TABLE IF NOT EXISTS booth_counts (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, deal_id INTEGER, device_id INTEGER, ts TEXT, hour TEXT, in_count INTEGER DEFAULT 0, out_count INTEGER DEFAULT 0, source TEXT DEFAULT 'ai');

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, kind TEXT, title TEXT, detail TEXT, needs_role TEXT, ref_kind TEXT, ref_id INTEGER, payload TEXT,
  requested_by TEXT, requested_by_id INTEGER, status TEXT DEFAULT 'pending', decided_by TEXT, decided_at TEXT, created_at TEXT, note TEXT
);

-- ===== Partners =====
CREATE TABLE IF NOT EXISTS partner_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ref_id INTEGER, name TEXT, email TEXT, active INTEGER DEFAULT 1, event_id INTEGER);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, partner_id INTEGER, from_kind TEXT, user_id INTEGER, body TEXT, created_at TEXT, read INTEGER DEFAULT 0);
`;
})();
