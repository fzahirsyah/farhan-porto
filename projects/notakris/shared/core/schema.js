/* NotaKris — database schema. All tables for every phase are defined up front.
   Bump SCHEMA_VERSION and add an entry to MIGRATIONS when the schema changes. */
(function () {
  const NK = (window.NK = window.NK || {});

  NK.SCHEMA_VERSION = 1;

  NK.SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- ===== System =====
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS office (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL, notary_name TEXT NOT NULL, notary_title TEXT, roles TEXT DEFAULT 'Notaris & PPAT',
  sk_no TEXT, wilayah TEXT, address TEXT, city TEXT, phone TEXT, email TEXT, npwp TEXT,
  bank_name TEXT, bank_acc TEXT, bank_holder TEXT, va_no TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, short TEXT, role TEXT NOT NULL,            -- notaris | staf | staf_ppat | keuangan | kurir
  title TEXT, email TEXT, phone TEXT, pin_hash TEXT NOT NULL,
  capacity INTEGER DEFAULT 6, color TEXT DEFAULT '#744C68', joined TEXT,
  active INTEGER DEFAULT 1, perm_override TEXT DEFAULT '{}',      -- JSON {perm: true|false}
  screened_date TEXT, confidentiality_signed INTEGER DEFAULT 0,
  base_salary INTEGER DEFAULT 0, allowance INTEGER DEFAULT 0, leave_quota INTEGER DEFAULT 12,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL, color TEXT, kind TEXT DEFAULT 'ruang', active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor TEXT, actor_kind TEXT, action TEXT, entity TEXT, entity_id INTEGER, detail TEXT);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, user_id INTEGER, client_id INTEGER, title TEXT, body TEXT, link TEXT, created_at TEXT, read INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT, to_name TEXT, subject TEXT, body TEXT, kind TEXT, client_id INTEGER, created_at TEXT, opened INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS portal_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, client_id INTEGER, code TEXT, created_at TEXT, expires_at TEXT, used INTEGER DEFAULT 0);

-- ===== Clients & PMPJ (know-your-client) =====
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'perorangan',                        -- perorangan | badan
  name TEXT NOT NULL, nik TEXT, npwp TEXT, birth_place TEXT, birth_date TEXT, gender TEXT,
  address TEXT, city TEXT, phone TEXT, email TEXT, occupation TEXT, nationality TEXT DEFAULT 'WNI',
  company_form TEXT, sk_no TEXT, nib TEXT, business_field TEXT, representative TEXT,
  source_of_funds TEXT, purpose TEXT,
  risk_profile INTEGER DEFAULT 1, risk_business INTEGER DEFAULT 1, risk_country INTEGER DEFAULT 1, risk_service INTEGER DEFAULT 1,
  risk_level TEXT DEFAULT 'rendah', pep INTEGER DEFAULT 0, pep_note TEXT,
  screening_status TEXT DEFAULT 'belum', screening_date TEXT, met_in_person TEXT,
  kyc_status TEXT DEFAULT 'belum lengkap', portal_enabled INTEGER DEFAULT 1, notes TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, nik TEXT, list_name TEXT, note TEXT, added_at TEXT);
CREATE TABLE IF NOT EXISTS ltkm (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, created_at TEXT, deadline TEXT, reason TEXT, status TEXT DEFAULT 'draft', reported_at TEXT);

-- ===== Companies (PT compliance register) =====
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER REFERENCES clients(id),
  name TEXT NOT NULL, form TEXT DEFAULT 'PT', sk_no TEXT, founded_date TEXT, director TEXT, director_email TEXT,
  fy_end TEXT DEFAULT '12-31', kbli_version TEXT DEFAULT '2020', kbli_codes TEXT, purpose_change_needed INTEGER DEFAULT 0,
  modal_dasar INTEGER, modal_disetor INTEGER, address TEXT, notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS beneficial_owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT, nik TEXT, ownership_pct REAL, control_basis TEXT,
  doc_poa INTEGER DEFAULT 0, doc_statement INTEGER DEFAULT 0, doc_consent INTEGER DEFAULT 0, consent_uploaded_sabh INTEGER DEFAULT 0, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS annual_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER, rups_date TEXT, deed_id INTEGER, deed_date TEXT, sabh_date TEXT, job_id INTEGER,
  status TEXT DEFAULT 'belum'                                      -- belum | dijadwalkan | akta | dilaporkan
);

-- ===== Services, jobs, documents =====
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL, category TEXT NOT NULL,   -- N notaris | P ppat | U pengurusan | K keuangan
  default_fee INTEGER DEFAULT 0, sla_days INTEGER DEFAULT 14, steps TEXT DEFAULT '[]', checklist TEXT DEFAULT '[]', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, no TEXT, service_id INTEGER REFERENCES services(id),
  title TEXT NOT NULL, subtitle TEXT, category TEXT, client_id INTEGER REFERENCES clients(id), company_id INTEGER REFERENCES companies(id),
  stage TEXT DEFAULT 'draft',                                      -- draft | ttd | instansi | selesai | batal
  pic_user_id INTEGER REFERENCES users(id), due_date TEXT, value INTEGER DEFAULT 0,
  created_at TEXT, completed_at TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS job_steps (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE, seq INTEGER, name TEXT, done_date TEXT, eta TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS job_checklist (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE, name TEXT, required INTEGER DEFAULT 1, client_upload INTEGER DEFAULT 1, document_id INTEGER, done INTEGER DEFAULT 0, ocr INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, job_id INTEGER, checklist_id INTEGER,
  name TEXT, filename TEXT, mime TEXT, size INTEGER, data BLOB,
  uploaded_by TEXT, uploaded_at TEXT, status TEXT DEFAULT 'diterima', ocr_json TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS ahu_prep (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER UNIQUE, deed_data TEXT DEFAULT '{}', entry_data TEXT DEFAULT '{}', status TEXT DEFAULT 'draft', checked_at TEXT, entered_at TEXT);

-- ===== Deeds, repertorium, klapper, archive =====
CREATE TABLE IF NOT EXISTS deeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,          -- notaris | ppat | legalisasi | waarmerking
  number TEXT, rep_no INTEGER, deed_date TEXT NOT NULL, nature TEXT, job_id INTEGER, client_id INTEGER,
  value INTEGER, notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS deed_parties (id INTEGER PRIMARY KEY AUTOINCREMENT, deed_id INTEGER REFERENCES deeds(id) ON DELETE CASCADE, name TEXT, client_id INTEGER, role TEXT);
CREATE TABLE IF NOT EXISTS ppat_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT, deed_id INTEGER UNIQUE REFERENCES deeds(id) ON DELETE CASCADE,
  hak TEXT, nop TEXT, location TEXT, land_area REAL, building_area REAL, transaction_value INTEGER, njop INTEGER,
  bphtb INTEGER, pph INTEGER, ssp_date TEXT, ssb_date TEXT, from_party TEXT, to_party TEXT
);
CREATE TABLE IF NOT EXISTS archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT, deed_id INTEGER, number TEXT, deed_date TEXT, nature TEXT, parties TEXT,
  cabinet TEXT, box TEXT, folder TEXT, scan_document_id INTEGER, source_protocol TEXT, notes TEXT
);

-- ===== Calendar, staff =====
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
  room_id INTEGER REFERENCES rooms(id), user_id INTEGER REFERENCES users(id), client_id INTEGER, job_id INTEGER,
  title TEXT, source TEXT DEFAULT 'kantor', status TEXT DEFAULT 'terjadwal', notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS leaves (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), start_date TEXT, end_date TEXT, kind TEXT, reason TEXT, status TEXT DEFAULT 'diajukan', decided_by INTEGER, decided_at TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), date TEXT, check_in TEXT, check_out TEXT, status TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS trainings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), date TEXT, topic TEXT, kind TEXT DEFAULT 'pmpj', provider TEXT);
CREATE TABLE IF NOT EXISTS payroll_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT UNIQUE, status TEXT DEFAULT 'draft', entry_id INTEGER, posted_at TEXT);
CREATE TABLE IF NOT EXISTS payroll_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER REFERENCES payroll_runs(id) ON DELETE CASCADE, user_id INTEGER, base INTEGER, allowance INTEGER, overtime INTEGER DEFAULT 0, pph21 INTEGER, net INTEGER);

-- ===== Messages (client portal chat) =====
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER REFERENCES clients(id), sender TEXT, user_id INTEGER, body TEXT, created_at TEXT, read_at TEXT);

-- ===== Sales: quotation -> invoice -> payment -> receipt =====
CREATE TABLE IF NOT EXISTS quotations (id INTEGER PRIMARY KEY AUTOINCREMENT, no TEXT UNIQUE, date TEXT, client_id INTEGER REFERENCES clients(id), job_id INTEGER, title TEXT, valid_until TEXT, status TEXT DEFAULT 'draft', notes TEXT, invoice_id INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS quotation_items (id INTEGER PRIMARY KEY AUTOINCREMENT, quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE, description TEXT, qty REAL DEFAULT 1, price INTEGER, account_code TEXT);
CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, no TEXT UNIQUE, date TEXT, due_date TEXT, client_id INTEGER REFERENCES clients(id), job_id INTEGER, quotation_id INTEGER, client_po_ref TEXT, status TEXT DEFAULT 'terbit', notes TEXT, entry_id INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE, description TEXT, qty REAL DEFAULT 1, price INTEGER, account_code TEXT);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER REFERENCES invoices(id), date TEXT, amount INTEGER, method TEXT, proof_document_id INTEGER, status TEXT DEFAULT 'terverifikasi', source TEXT DEFAULT 'kantor', entry_id INTEGER, note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, no TEXT UNIQUE, date TEXT, payment_id INTEGER, client_id INTEGER, received_from TEXT, amount INTEGER, description TEXT, method TEXT, meterai INTEGER DEFAULT 0, created_at TEXT);

-- ===== Purchasing =====
CREATE TABLE IF NOT EXISTS vendors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT, email TEXT, npwp TEXT, bank TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, no TEXT UNIQUE, date TEXT, vendor_id INTEGER REFERENCES vendors(id),
  status TEXT DEFAULT 'draft',                                     -- draft | menunggu | disetujui | diterima | dibayar | batal
  expense_account TEXT DEFAULT '5-4000', created_by INTEGER, approved_by INTEGER, approved_at TEXT,
  received_at TEXT, paid_at TEXT, received_entry_id INTEGER, paid_entry_id INTEGER, notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS po_items (id INTEGER PRIMARY KEY AUTOINCREMENT, po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE, description TEXT, qty REAL DEFAULT 1, price INTEGER);

-- ===== Accounting =====
CREATE TABLE IF NOT EXISTS accounts (code TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, client_fund INTEGER DEFAULT 0, note TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS journal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, ref TEXT, description TEXT, source TEXT, source_id INTEGER, manual INTEGER DEFAULT 0, created_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS journal_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE, account_code TEXT REFERENCES accounts(code), debit INTEGER DEFAULT 0, credit INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS bank_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, number TEXT, account_code TEXT REFERENCES accounts(code), kind TEXT);
CREATE TABLE IF NOT EXISTS bank_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, bank_account_id INTEGER, date TEXT, description TEXT, amount_in INTEGER DEFAULT 0, amount_out INTEGER DEFAULT 0, matched_entry_id INTEGER, imported_at TEXT);
CREATE TABLE IF NOT EXISTS periods (month TEXT PRIMARY KEY, closed INTEGER DEFAULT 0, closed_at TEXT, closed_by TEXT);
CREATE TABLE IF NOT EXISTS tax_obligations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, period TEXT, due_pay TEXT, due_file TEXT, amount INTEGER, status TEXT DEFAULT 'terjadwal', paid_date TEXT, filed_date TEXT, notes TEXT);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS ix_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS ix_jobs_pic ON jobs(pic_user_id);
CREATE INDEX IF NOT EXISTS ix_appt_date ON appointments(date);
CREATE INDEX IF NOT EXISTS ix_docs_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS ix_jl_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS ix_jl_acc ON journal_lines(account_code);
CREATE INDEX IF NOT EXISTS ix_msg_client ON messages(client_id);
CREATE INDEX IF NOT EXISTS ix_inv_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS ix_log_at ON activity_log(at);
`;

  // version -> SQL to upgrade from the previous version
  NK.MIGRATIONS = {};

  // Human-readable labels for the table browser
  NK.TABLE_LABELS = {
    settings: 'Pengaturan', office: 'Profil kantor', users: 'Pengguna', rooms: 'Ruangan', counters: 'Penomoran',
    activity_log: 'Log aktivitas', notifications: 'Notifikasi', outbox: 'Outbox email', portal_codes: 'Kode masuk portal',
    clients: 'Klien', sanctions: 'Daftar sanksi/DTTOT', ltkm: 'Draf LTKM', companies: 'Perseroan', beneficial_owners: 'Pemilik manfaat',
    annual_reports: 'Laporan tahunan PT', services: 'Layanan', jobs: 'Pekerjaan', job_steps: 'Tahap pekerjaan', job_checklist: 'Checklist dokumen',
    documents: 'Dokumen', ahu_prep: 'Persiapan AHU', deeds: 'Akta', deed_parties: 'Penghadap', ppat_details: 'Detail akta PPAT',
    archive: 'Arsip protokol', appointments: 'Janji temu', leaves: 'Cuti', attendance: 'Kehadiran', trainings: 'Pelatihan',
    payroll_runs: 'Periode gaji', payroll_lines: 'Rincian gaji', messages: 'Pesan portal', quotations: 'Penawaran', quotation_items: 'Item penawaran',
    invoices: 'Invoice', invoice_items: 'Item invoice', payments: 'Pembayaran', receipts: 'Kwitansi', vendors: 'Vendor',
    purchase_orders: 'Purchase order', po_items: 'Item PO', accounts: 'Bagan akun', journal_entries: 'Jurnal', journal_lines: 'Baris jurnal',
    bank_accounts: 'Rekening bank', bank_transactions: 'Mutasi bank', periods: 'Periode buku', tax_obligations: 'Kewajiban pajak'
  };
})();
