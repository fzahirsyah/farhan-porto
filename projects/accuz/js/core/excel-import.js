/* Buku — import data from an Excel workbook. Each sheet is one data table (Kontak, Produk, Invoice, …).
   Everything is validated first (dry run, rolled back); the real import runs in one transaction and only
   when there are no errors. Rows that already exist are skipped, so importing the same file twice is safe. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, message) => new Buku.BukuError(code, message);
  const tr = (s, v) => Buku.i18n.t(s, v);
  const norm = (s) => String(s === null || s === undefined ? '' : s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const now = () => Buku.util.nowIso();

  // ---------- value parsing ----------
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
  const pad = (n) => String(n).padStart(2, '0');
  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') { if (v > 20000 && v < 80000) return Buku.xlsx.serialToIso(v); throw E('x_date', tr('“{v}” is not a date. Use YYYY-MM-DD.', { v })); }
    const s = String(v).trim();
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return valid(m[1] + '-' + pad(m[2]) + '-' + pad(m[3]), s);
    if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) return valid(m[3] + '-' + pad(m[2]) + '-' + pad(m[1]), s);
    if ((m = /^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-]+(\d{4})$/i.exec(s)) && MONTHS[m[2].toLowerCase()]) return valid(m[3] + '-' + pad(MONTHS[m[2].toLowerCase()]) + '-' + pad(m[1]), s);
    throw E('x_date', tr('“{v}” is not a date. Use YYYY-MM-DD.', { v: s }));
  }
  function valid(iso, raw) { if (!Buku.util.isIsoDate(iso)) throw E('x_date', tr('“{v}” is not a date. Use YYYY-MM-DD.', { v: raw })); return iso; }
  function toMoney(v, decimals) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') { if (!isFinite(v)) throw E('x_amount', tr('“{v}” is not an amount.', { v })); return Math.round(v * Math.pow(10, decimals)); }
    const n = Buku.money.parse(String(v), decimals);
    if (n === null || n === undefined || Number.isNaN(n)) throw E('x_amount', tr('“{v}” is not an amount.', { v }));
    return n;
  }
  function toQty(v) {
    if (v === null || v === undefined || v === '') return 1000;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!isFinite(n) || n <= 0) throw E('x_qty', tr('“{v}” is not a quantity.', { v }));
    return Math.round(n * 1000);
  }
  const toBool = (v, dflt) => (v === null || v === undefined || v === '' ? dflt : v === true || /^(ya|yes|y|true|1|x|v|✓)$/i.test(String(v).trim()));
  const text = (v) => (v === null || v === undefined ? '' : String(typeof v === 'number' && Number.isInteger(v) ? v : v).trim());

  // ---------- lookups ----------
  const L = {
    account(db, v, label) {
      const s = text(v); if (!s) return null;
      const code = s.split(/\s+/)[0];
      const a = db.get('SELECT * FROM accounts WHERE code=? OR lower(name)=lower(?) OR lower(name_en)=lower(?)', [code, s, s]);
      if (!a) throw E('x_account', tr('Account “{v}” not found. Use the account code, e.g. 1-1200.', { v: s }));
      if (a.is_header) throw E('x_account', tr('Account {v} is a group; use an account under it.', { v: a.code }));
      return a;
    },
    contact(db, v) {
      const s = text(v); if (!s) return null;
      const c = db.get('SELECT * FROM contacts WHERE lower(name)=lower(?) OR (code IS NOT NULL AND lower(code)=lower(?)) ORDER BY id LIMIT 1', [s, s]);
      if (!c) throw E('x_contact', tr('Contact “{v}” not found. Add it to the Kontak sheet first.', { v: s }));
      return c;
    },
    tax(db, v) {
      const s = text(v); if (!s || /^(none|tanpa|tidak|-|0|no)$/i.test(s)) return null;
      const x = db.get('SELECT * FROM taxes WHERE upper(code)=upper(?) OR lower(name)=lower(?)', [s.replace(/\s+/g, ''), s]);
      if (!x) throw E('x_tax', tr('Tax code “{v}” not found (e.g. PPN11, PPNIN11, PPH23V).', { v: s }));
      return x;
    },
    product(db, v) {
      const s = text(v); if (!s) return null;
      const p = db.get('SELECT * FROM products WHERE upper(code)=upper(?) OR lower(name)=lower(?)', [s, s]);
      if (!p) throw E('x_product', tr('Product “{v}” not found. Add it to the Produk sheet first.', { v: s }));
      return p;
    },
    rep(db, v) {
      const s = text(v); if (!s) return null;
      const r = db.get('SELECT * FROM sales_reps WHERE upper(code)=upper(?) OR lower(name)=lower(?)', [s, s]);
      if (!r) throw E('x_rep', tr('Sales rep “{v}” not found (use the code, e.g. PU).', { v: s }));
      return r;
    },
    currency(db, v) {
      const s = text(v).toUpperCase() || Buku.fx.base(db);
      if (!db.scalar('SELECT is_enabled FROM currencies WHERE code=?', [s])) throw E('x_currency', tr('Currency {v} is not enabled (Settings → Currencies).', { v: s }));
      return s;
    },
    rate(db, cur, date, v) {
      if (cur === Buku.fx.base(db)) return '1';
      if (text(v)) return String(v).replace(',', '.');
      const r = Buku.fx.lookup(db, cur, date);
      if (!r) throw E('x_rate', tr('No {c} exchange rate on or before {d}. Add it to the Kurs sheet or fill the rate column.', { c: cur, d: date }));
      return r.rate;
    },
    bank(db, v, cur) {
      if (text(v)) { const a = L.account(db, v); if (!['bank', 'cash'].includes(a.subtype)) throw E('x_account', tr('{v} is not a bank or cash account.', { v: a.code })); return a; }
      return db.get("SELECT * FROM accounts WHERE subtype IN ('bank','cash') AND is_active=1 AND is_header=0 AND coalesce(currency,?)=? ORDER BY subtype='bank' DESC, code LIMIT 1", [cur, cur]);
    },
  };
  const decimals = (db, cur) => Buku.fx.decimals(db, cur);

  const TAG_WORDS = { customer: 'customer', pelanggan: 'customer', klien: 'customer', vendor: 'vendor', pemasok: 'vendor', supplier: 'vendor', developer: 'developer', pengembang: 'developer',
    bank: 'bank', partner: 'partner', mitra: 'partner', agent: 'agent', agen: 'agent', buyer: 'customer', pembeli: 'customer', konsumen: 'customer' };

  // ---------- sheet definitions ----------
  // col: [key, Indonesian header, English header, other aliases, required, example]
  const SHEETS = [
    { key: 'rates', desc: 'Exchange rates by date (USD, SGD).', id: 'Kurs', en: 'Exchange rates', alias: ['kurs', 'exchangerates', 'rates', 'fx'],
      cols: [['date', 'Tanggal', 'Date', [], true], ['currency', 'Mata uang', 'Currency', ['valuta'], true], ['rate', 'Kurs', 'Rate', ['nilaitukar', 'kursidr'], true]],
      row(db, r) {
        const cur = text(r.currency).toUpperCase(), date = toDate(r.date);
        if (!cur || cur === Buku.fx.base(db)) throw E('x_currency', tr('Use a foreign currency code such as USD or SGD.'));
        if (!db.scalar('SELECT 1 FROM currencies WHERE code=?', [cur])) throw E('x_currency', tr('Currency {v} is not available.', { v: cur }));
        if (!db.scalar('SELECT is_enabled FROM currencies WHERE code=?', [cur])) {
          // Same as switching the currency on in Settings → Currencies: its bank/AR/AP accounts come with it.
          db.run('UPDATE currencies SET is_enabled=1 WHERE code=?', [cur]);
          db.run('UPDATE accounts SET is_active=1, updated_at=? WHERE currency=? AND is_active=0', [now(), cur]);
          db.setting('enabled_currencies', db.all('SELECT code FROM currencies WHERE is_enabled=1').map((x) => x.code));
        }
        const old = db.get('SELECT rate FROM exchange_rates WHERE currency=? AND rate_date=?', [cur, date]);
        const rate = Buku.money.rateToString(String(r.rate).replace(',', '.'));
        if (old && old.rate === rate) return 'skipped';
        Buku.fx.set(db, cur, date, rate, 'excel');
        return old ? 'updated' : 'created';
      } },
    { key: 'reps', desc: 'Sales team codes used on invoices.', id: 'Tim Sales', en: 'Sales team', alias: ['timsales', 'salesteam', 'sales', 'salesreps', 'reps'],
      cols: [['code', 'Kode', 'Code', ['kodesales'], true], ['name', 'Nama', 'Name', [], true], ['phone', 'Telepon', 'Phone', ['hp', 'telp'], false], ['email', 'Email', 'Email', [], false]],
      row(db, r) {
        const code = text(r.code).toUpperCase();
        if (db.scalar('SELECT 1 FROM sales_reps WHERE upper(code)=?', [code])) return 'skipped';
        db.insert('sales_reps', { code, name: text(r.name), phone: text(r.phone) || null, email: text(r.email) || null, created_at: now(), updated_at: now() });
        return 'created';
      } },
    { key: 'contacts', desc: 'Customers, vendors, developers, banks and partners.', id: 'Kontak', en: 'Contacts', alias: ['kontak', 'contacts', 'contact', 'pelanggan', 'customers', 'pemasok', 'vendors'],
      cols: [['name', 'Nama', 'Name', ['namakontak', 'namaperusahaan', 'company'], true], ['type', 'Jenis', 'Type', ['tipe', 'kategori', 'tags'], false],
        ['code', 'Kode', 'Code', [], false], ['npwp', 'NPWP', 'NPWP', ['taxid'], false], ['pic', 'PIC', 'Contact person', ['kontakperson', 'pic'], false],
        ['email', 'Email', 'Email', ['surel'], false], ['phone', 'Telepon', 'Phone', ['telp', 'hp', 'nohp', 'notelp'], false],
        ['address', 'Alamat', 'Address', ['alamattagihan', 'billingaddress'], false], ['terms', 'Termin (hari)', 'Terms (days)', ['termin', 'jatuhtempohari', 'top'], false],
        ['wht', 'Potong PPh 23', 'Withholds PPh 23', ['pph23', 'memotongpph23'], false], ['individual', 'Perorangan', 'Individual', ['pribadi'], false]],
      row(db, r) {
        const name = text(r.name);
        if (db.scalar('SELECT 1 FROM contacts WHERE lower(name)=lower(?)', [name])) return 'skipped';
        const tags = [...new Set(text(r.type).split(/[,;/]+/).map((x) => TAG_WORDS[norm(x)]).filter(Boolean))];
        const days = text(r.terms) ? parseInt(r.terms, 10) : null;
        if (days !== null && !(days >= 0)) throw E('x_terms', tr('Terms must be a number of days.'));
        const individual = toBool(r.individual, false);
        db.insert('contacts', { name, code: text(r.code) || null, tags: JSON.stringify(tags.length ? tags : ['customer']), npwp: text(r.npwp) || null, pic_name: text(r.pic) || null,
          email: text(r.email) || null, phone: text(r.phone) || null, billing_address: text(r.address) || null, payment_terms_days: days,
          withholds_pph23: toBool(r.wht, !individual) ? 1 : 0, is_individual: individual ? 1 : 0, created_at: now(), updated_at: now() });
        return 'created';
      } },
    { key: 'products', desc: 'Products and SaaS plans with price and tax.', id: 'Produk', en: 'Products', alias: ['produk', 'products', 'product', 'layanan', 'services', 'items'],
      cols: [['code', 'Kode', 'Code', ['kodeproduk', 'sku'], true], ['name', 'Nama', 'Name', ['namaproduk'], true], ['kind', 'Jenis', 'Kind', ['tipe', 'type'], false],
        ['unit', 'Satuan', 'Unit', [], false], ['price', 'Harga', 'Price', ['hargajual', 'unitprice'], false], ['months', 'Bulan', 'Months', ['durasi', 'durasibulan'], false],
        ['tax', 'Pajak', 'Tax', ['kodepajak', 'ppn'], false], ['income', 'Akun pendapatan', 'Income account', ['akun', 'account'], false], ['description', 'Deskripsi', 'Description', ['keterangan'], false]],
      row(db, r) {
        const code = text(r.code);
        if (db.scalar('SELECT 1 FROM products WHERE upper(code)=upper(?)', [code])) return 'skipped';
        const kindMap = { langganan: 'plan', plan: 'plan', subscription: 'plan', saas: 'plan', komisi: 'commission', commission: 'commission', fee: 'fee', biaya: 'fee', jasa: 'service', service: 'service', lainnya: 'other', other: 'other' };
        const kind = kindMap[norm(r.kind)] || 'service';
        const tax = L.tax(db, r.tax), inc = L.account(db, r.income);
        if (inc && inc.type !== 'income') throw E('x_account', tr('{v} is not an income account.', { v: inc.code }));
        const id = db.insert('products', { code, name: text(r.name), kind, unit: text(r.unit) || null, description: text(r.description) || null,
          default_months: kind === 'plan' ? Math.max(1, parseInt(r.months, 10) || 1) : null, income_account_id: inc ? inc.id : null, tax_id: tax ? tax.id : null,
          is_sold: 1, is_bought: 0, created_at: now(), updated_at: now() });
        const price = toMoney(r.price, 0);
        if (price !== null) db.insert('product_prices', { product_id: id, currency: Buku.fx.base(db), unit_price: Math.max(0, price) });
        return 'created';
      } },
    { key: 'opening', desc: 'Account balances on the go-live date.', id: 'Saldo Awal', en: 'Opening balances', alias: ['saldoawal', 'openingbalances', 'openingbalance', 'neracaawal'], group: '__all',
      cols: [['date', 'Tanggal', 'Date', [], true], ['account', 'Akun', 'Account', ['kodeakun', 'accountcode'], true], ['debit', 'Debit', 'Debit', [], false], ['credit', 'Kredit', 'Credit', [], false],
        ['currency', 'Mata uang', 'Currency', [], false], ['rate', 'Kurs', 'Rate', [], false]],
      group_(db, rows) {
        if (db.scalar("SELECT 1 FROM journal_entries WHERE source_type='opening' AND status='posted' AND memo='Saldo awal (Excel)'")) return 'skipped';
        const date = toDate(rows[0].date);
        const lines = rows.map((r) => {
          const a = L.account(db, r.account);
          if (['ar', 'ap'].includes(a.subtype)) throw E('x_account', tr('Enter unpaid invoices and bills on the Invoice and Tagihan sheets with “Saldo awal” = Ya, not as an opening balance on {v}.', { v: a.code }));
          const cur = L.currency(db, r.currency || a.currency), dec = decimals(db, cur);
          const l = { account_id: a.id, debit: toMoney(r.debit, dec) || 0, credit: toMoney(r.credit, dec) || 0 };
          if (cur !== Buku.fx.base(db)) { l.currency = cur; l.rate = L.rate(db, cur, date, r.rate); }
          return l;
        });
        Buku.posting.postOpening(db, date, lines, 'Saldo awal (Excel)');
        return 'created';
      } },
    { key: 'invoices', desc: 'Sales invoices, one row per line; also unpaid opening invoices.', id: 'Invoice', en: 'Invoices', alias: ['invoice', 'invoices', 'faktur', 'penjualan', 'sales'], group: 'number',
      cols: [['number', 'No. invoice', 'Invoice no.', ['noinvoice', 'nomor', 'number', 'invoiceno', 'nofaktur'], true], ['date', 'Tanggal', 'Date', [], true],
        ['due', 'Jatuh tempo', 'Due date', ['tanggaljatuhtempo', 'duedate'], false], ['customer', 'Pelanggan', 'Customer', ['kontak', 'contact', 'klien'], true],
        ['currency', 'Mata uang', 'Currency', [], false], ['rate', 'Kurs', 'Rate', [], false], ['rep', 'Sales', 'Sales rep', ['kodesales', 'salesrep'], false],
        ['product', 'Kode produk', 'Product code', ['produk', 'product'], false], ['description', 'Deskripsi', 'Description', ['keterangan', 'item', 'uraian'], true],
        ['qty', 'Qty', 'Qty', ['jumlahunit', 'kuantitas', 'quantity'], false], ['unit', 'Satuan', 'Unit', [], false], ['price', 'Harga', 'Unit price', ['hargasatuan', 'price'], true],
        ['tax', 'Pajak', 'Tax', ['kodepajak', 'ppn'], false], ['start', 'Mulai', 'Start', ['mulailayanan', 'startdate'], false], ['end', 'Selesai', 'End', ['selesailayanan', 'enddate'], false],
        ['subject', 'Perihal', 'Subject', ['subjek'], false], ['opening', 'Saldo awal', 'Opening', ['saldoawal', 'opening', 'openingbalance'], false],
        ['status', 'Status', 'Status', [], false]],
      group_(db, rows) { return importDoc(db, 'invoice', rows); } },
    { key: 'bills', desc: 'Vendor bills, one row per line; also unpaid opening bills.', id: 'Tagihan', en: 'Bills', alias: ['tagihan', 'bills', 'bill', 'pembelian', 'purchases', 'hutang'], group: 'number',
      cols: [['number', 'No. tagihan pemasok', 'Vendor invoice no.', ['notagihan', 'nomor', 'number', 'vendorinvoiceno', 'noinvoicepemasok'], true], ['date', 'Tanggal', 'Date', [], true],
        ['due', 'Jatuh tempo', 'Due date', ['duedate'], false], ['vendor', 'Pemasok', 'Vendor', ['kontak', 'contact', 'supplier'], true],
        ['currency', 'Mata uang', 'Currency', [], false], ['rate', 'Kurs', 'Rate', [], false], ['description', 'Deskripsi', 'Description', ['keterangan', 'uraian'], true],
        ['account', 'Akun beban', 'Expense account', ['akun', 'account'], false], ['qty', 'Qty', 'Qty', ['kuantitas', 'quantity'], false], ['price', 'Harga', 'Unit price', ['hargasatuan', 'price', 'jumlah', 'amount'], true],
        ['tax', 'Pajak', 'Tax', ['kodepajak', 'ppn'], false], ['wht', 'PPh dipotong', 'Withholding', ['pph', 'potonganpph', 'withholdingtax'], false],
        ['opening', 'Saldo awal', 'Opening', ['saldoawal', 'opening'], false], ['status', 'Status', 'Status', [], false]],
      group_(db, rows) { return importDoc(db, 'bill', rows); } },
    { key: 'payments', desc: 'Money received and paid against invoices and bills, with PPh 23.', id: 'Pembayaran', en: 'Payments', alias: ['pembayaran', 'payments', 'payment', 'pelunasan', 'penerimaan'],
      cols: [['date', 'Tanggal', 'Date', [], true], ['direction', 'Arah', 'Direction', ['jenis', 'type', 'masukkeluar'], false], ['contact', 'Kontak', 'Contact', ['pelanggan', 'pemasok', 'customer', 'vendor'], true],
        ['doc', 'No. dokumen', 'Document no.', ['noinvoice', 'notagihan', 'invoice', 'document', 'nodokumen'], true], ['amount', 'Jumlah', 'Amount', ['nominal', 'jumlahdibayar'], true],
        ['wht', 'PPh 23 dipotong', 'PPh 23 withheld', ['pph23', 'potonganpph23', 'withholding'], false], ['bp', 'No. bukti potong', 'Bukti potong no.', ['buktipotong', 'nobp'], false],
        ['bank', 'Rekening', 'Bank account', ['akunbank', 'kasbank', 'account'], false], ['fee', 'Biaya bank', 'Bank charges', ['biayaadmin', 'fee'], false],
        ['rate', 'Kurs', 'Rate', [], false], ['reference', 'Referensi', 'Reference', ['ref', 'keterangan', 'memo'], false]],
      row(db, r) {
        const date = toDate(r.date), c = L.contact(db, r.contact), no = text(r.doc);
        const dirWord = norm(r.direction);
        let d = db.get("SELECT * FROM documents WHERE contact_id=? AND doc_type IN ('invoice','bill') AND status<>'draft' AND (number=? OR reference=? OR vendor_invoice_no=?) ORDER BY id DESC LIMIT 1", [c.id, no, no, no]);
        if (!d) throw E('x_doc', tr('No approved invoice or bill “{v}” for {c}.', { v: no, c: c.name }));
        if (d.status === 'void') throw E('x_doc', tr('{v} is void.', { v: no }));
        const direction = d.doc_type === 'bill' ? 'out' : 'in';
        if (dirWord && ((/^(masuk|in|terima|diterima|received)$/.test(dirWord) && direction === 'out') || (/^(keluar|out|bayar|dibayar|paid)$/.test(dirWord) && direction === 'in')))
          throw E('x_direction', tr('Direction does not match: {v} is a {k}.', { v: no, k: tr(d.doc_type === 'bill' ? 'bill' : 'invoice') }));
        const dec = decimals(db, d.currency);
        const gross = toMoney(r.amount, dec), wht = toMoney(r.wht, dec) || 0, fee = toMoney(r.fee, dec) || 0;
        if (!(gross > 0)) throw E('x_amount', tr('Amount must be more than zero.'));
        const ref = text(r.reference);
        if (ref && db.scalar("SELECT 1 FROM payments WHERE reference=? AND status='posted'", [ref])) return 'skipped';
        const bal = Buku.docs.balance(d);
        if (bal <= 0 || d.status === 'paid') return 'skipped';
        if (gross > bal) throw E('x_amount', tr('{a} is more than the open balance of {v} ({b}).', { a: Buku.money.format(gross, dec), v: no, b: Buku.money.format(bal, dec) }));
        const bank = L.bank(db, r.bank, d.currency);
        if (!bank) throw E('x_account', tr('No {c} bank account. Fill the bank account column.', { c: d.currency }));
        const bankCur = bank.currency || Buku.fx.base(db);
        const input = { direction, contact_id: c.id, date, account_id: bank.id, amount: gross - wht, reference: ref || null, memo: 'Impor Excel',
          allocations: [{ document_id: d.id, amount: gross, withholding: wht, bukti_potong_no: text(r.bp) || null, bukti_potong_date: wht ? date : null }] };
        if (fee) input.fee = fee;
        if (bankCur !== Buku.fx.base(db) || d.currency !== Buku.fx.base(db)) input.rate = L.rate(db, d.currency === Buku.fx.base(db) ? bankCur : d.currency, date, r.rate);
        Buku.payments.post(db, input);
        return 'created';
      } },
    { key: 'journals', desc: 'General journal entries, one row per line.', id: 'Jurnal', en: 'Journal', alias: ['jurnal', 'journal', 'journals', 'jurnalumum', 'generaljournal'], group: 'number',
      cols: [['number', 'No. jurnal', 'Journal no.', ['nojurnal', 'nomor', 'ref', 'reference', 'bukti', 'nobukti'], true], ['date', 'Tanggal', 'Date', [], true],
        ['memo', 'Keterangan', 'Memo', ['deskripsi', 'description', 'uraian'], false], ['account', 'Akun', 'Account', ['kodeakun', 'accountcode'], true],
        ['debit', 'Debit', 'Debit', [], false], ['credit', 'Kredit', 'Credit', [], false], ['contact', 'Kontak', 'Contact', [], false]],
      group_(db, rows) {
        const ref = text(rows[0].number);
        if (db.scalar("SELECT 1 FROM journal_entries WHERE reference=? AND status='posted'", [ref])) return 'skipped';
        const date = toDate(rows[0].date);
        const lines = rows.map((r) => {
          const a = L.account(db, r.account);
          if (['ar', 'ap'].includes(a.subtype)) throw E('x_account', tr('{v} is a receivable/payable control account. Use the Invoice, Tagihan or Pembayaran sheet.', { v: a.code }));
          const c = text(r.contact) ? L.contact(db, r.contact) : null;
          return { account_id: a.id, debit: toMoney(r.debit, 0) || 0, credit: toMoney(r.credit, 0) || 0, description: text(r.memo) || null, contact_id: c ? c.id : null };
        });
        Buku.posting.post(db, { date, currency: Buku.fx.base(db), reference: ref, memo: text(rows[0].memo) || ref, lines });
        return 'created';
      } },
    { key: 'bank', desc: 'Bank statement lines to match in Bank & cash.', id: 'Mutasi Bank', en: 'Bank statement', alias: ['mutasibank', 'mutasi', 'bankstatement', 'rekeningkoran', 'statement'], group: '__all',
      cols: [['account', 'Rekening', 'Bank account', ['akun', 'akunbank', 'account'], false], ['date', 'Tanggal', 'Date', [], true], ['description', 'Keterangan', 'Description', ['deskripsi', 'uraian'], true],
        ['amount', 'Jumlah', 'Amount', ['nominal', 'jumlahplusminus'], false], ['in', 'Masuk', 'In', ['kredit', 'credit', 'cr'], false], ['out', 'Keluar', 'Out', ['debit', 'db'], false],
        ['balance', 'Saldo', 'Balance', [], false]],
      group_(db, rows, ctx) {
        const byAcc = new Map();
        rows.forEach((r) => {
          const acc = L.bank(db, r.account, Buku.fx.base(db));
          if (!acc) throw E('x_account', tr('Choose the bank account.'));
          const dec = decimals(db, acc.currency || Buku.fx.base(db));
          let amount = toMoney(r.amount, dec);
          if (amount === null) amount = (toMoney(r.in, dec) || 0) - (toMoney(r.out, dec) || 0);
          if (!amount) throw E('x_amount', tr('Fill the amount (+ in / − out) or the In/Out columns.'));
          if (!byAcc.has(acc.id)) byAcc.set(acc.id, []);
          byAcc.get(acc.id).push({ date: toDate(r.date), description: text(r.description), amount, balance: toMoney(r.balance, dec) });
        });
        let added = 0, dup = 0;
        for (const [acc, list] of byAcc) { const x = Buku.banking.importRows(db, acc, list, { preset: 'excel', fileName: ctx.fileName || 'excel' }); added += x.added; dup += x.duplicates; }
        return { created: added, skipped: dup };
      } },
    { key: 'deals', desc: 'Property deals (project, unit, buyer, developer, price).', id: 'Deals', en: 'Deals', alias: ['deals', 'deal', 'transaksiproperti', 'properti', 'propertydeals'],
      cols: [['project', 'Proyek', 'Project', ['project'], true], ['date', 'Tanggal', 'Date', ['tanggaltransaksi'], true], ['cluster', 'Klaster', 'Cluster', [], false],
        ['block', 'Blok', 'Block', [], false], ['unit', 'No. unit', 'Unit no.', ['unit', 'nounit'], false], ['type', 'Tipe', 'Unit type', ['tipeunit'], false],
        ['buyer', 'Pembeli', 'Buyer', ['konsumen'], false], ['developer', 'Developer', 'Developer', ['pengembang'], false], ['bank', 'Bank KPR', 'KPR bank', ['bank'], false],
        ['price', 'Harga', 'Price', ['hargajual'], false], ['booking', 'Booking fee', 'Booking fee', ['bookingfee', 'utj'], false], ['dp', 'DP', 'Down payment', ['uangmuka'], false],
        ['kpr', 'KPR', 'KPR amount', ['nilaikpr'], false], ['rep', 'Sales', 'Sales rep', [], false], ['scheme', 'Skema', 'Scheme', [], false], ['notes', 'Catatan', 'Notes', [], false]],
      row(db, r) {
        const project = text(r.project), block = text(r.block) || null, unit = text(r.unit) || null;
        if (db.scalar('SELECT 1 FROM deals WHERE lower(project)=lower(?) AND coalesce(block,\'\')=coalesce(?,\'\') AND coalesce(unit_no,\'\')=coalesce(?,\'\')', [project, block, unit])) return 'skipped';
        const id = (v) => { const c = L.contact(db, v); return c ? c.id : null; };
        const rep = L.rep(db, r.rep);
        const scheme = { agensi: 'agency', agency: 'agency', resale: 'resale', jualkembali: 'resale', campuran: 'mixed', mixed: 'mixed' }[norm(r.scheme)] || 'agency';
        Buku.deals.save(db, { project, deal_date: toDate(r.date), cluster: text(r.cluster), block, unit_no: unit, unit_type: text(r.type), scheme, notes: text(r.notes),
          buyer_id: id(r.buyer), developer_id: id(r.developer), bank_id: id(r.bank), sales_rep_id: rep ? rep.id : null,
          price: toMoney(r.price, 0) || 0, booking_fee: toMoney(r.booking, 0) || 0, dp: toMoney(r.dp, 0) || 0, kpr_amount: toMoney(r.kpr, 0) || 0 });
        return 'created';
      } },
  ];

  function importDoc(db, type, rows) {
    const sale = type === 'invoice';
    const h = rows[0];
    const no = text(h.number);
    const contact = L.contact(db, sale ? h.customer : h.vendor);
    if (sale ? db.scalar("SELECT 1 FROM documents WHERE doc_type='invoice' AND contact_id=? AND (reference=? OR number=?) AND status<>'void'", [contact.id, no, no])
      : db.scalar("SELECT 1 FROM documents WHERE doc_type='bill' AND contact_id=? AND vendor_invoice_no=? AND status<>'void'", [contact.id, no])) return 'skipped';
    const date = toDate(h.date), due = toDate(h.due);
    const cur = L.currency(db, h.currency || contact.currency), dec = decimals(db, cur);
    const opening = toBool(h.opening, false);
    const obe = opening ? db.get("SELECT * FROM accounts WHERE subtype='opening_balance' AND is_active=1 ORDER BY code LIMIT 1") : null;
    const rep = sale ? L.rep(db, h.rep) : null;
    const lines = rows.map((r) => {
      const p = sale ? L.product(db, r.product) : null;
      let price = toMoney(r.price, dec);
      if (price === null && p) price = db.scalar('SELECT unit_price FROM product_prices WHERE product_id=? AND currency=?', [p.id, cur]);
      if (price === null || price === undefined) throw E('x_amount', tr('Fill the price.'));
      const tax = opening ? null : L.tax(db, r.tax !== undefined && r.tax !== null && r.tax !== '' ? r.tax : (p && p.tax_id ? db.scalar('SELECT code FROM taxes WHERE id=?', [p.tax_id]) : ''));
      if (tax && tax.kind !== (sale ? 'ppn_out' : 'ppn_in')) throw E('x_tax', tr('Tax {v} cannot be used on this kind of document.', { v: tax.code }));
      const l = { product_id: p ? p.id : null, item_label: p ? p.name : null, description: text(r.description) || (p ? p.name : ''), quantity: toQty(r.qty), unit: text(r.unit) || (p && p.unit) || null,
        unit_price: price, tax_id: tax ? tax.id : null, start_date: sale ? toDate(r.start) : null, end_date: sale ? toDate(r.end) : null };
      if (opening) l.account_id = obe.id;
      else if (!sale) { const a = L.account(db, r.account); if (!a) throw E('x_account', tr('Fill the expense account.')); l.account_id = a.id; }
      if (l.start_date && l.end_date && p && p.default_months) l.line_note = String(Math.max(1, Math.round((new Date(l.end_date) - new Date(l.start_date)) / 2629800000)));
      return l;
    });
    const wht = !sale && !opening ? L.tax(db, h.wht) : null;
    if (wht && wht.direction !== 'withheld_by_us') throw E('x_tax', tr('Tax {v} cannot be used on this kind of document.', { v: wht.code }));
    const input = { date, due_date: due || null, contact_id: contact.id, currency: cur, rate: cur === Buku.fx.base(db) ? undefined : L.rate(db, cur, date, h.rate), lines,
      terms_days: due ? null : contact.payment_terms_days, payment_term_text: contact.payment_term_text || null };
    if (sale) { input.reference = no; input.subject = text(h.subject) || null; input.sales_rep_id = rep ? rep.id : contact.sales_rep_id || null; }
    else { input.vendor_invoice_no = no; input.withholding_tax_id = wht ? wht.id : null; }
    if (!due && contact.payment_terms_days !== null && contact.payment_terms_days !== undefined) input.due_date = Buku.util.addDays(date, contact.payment_terms_days);
    const id = Buku.docs.save(db, type, input);
    if (!/^(draft|draf)$/i.test(text(h.status))) Buku.docs.approve(db, id);
    return 'created';
  }

  // ---------- mapping ----------
  function matchSheet(name) {
    const n = norm(name);
    return SHEETS.find((s) => s.alias.includes(n) || norm(s.id) === n || norm(s.en) === n) || null;
  }

  /** Recognise sheets and columns. Returns [{ name, spec, headerRow, map, unknown, missing, rows:[{n, values}] }]. */
  function analyze(workbook) {
    return workbook.sheets.map((sh) => {
      const spec = matchSheet(sh.name);
      const out = { name: sh.name, spec, rows: [], unknown: [], missing: [] };
      if (!spec) return out;
      const hi = sh.rows.findIndex((r) => r && r.some((v) => text(v)));
      if (hi < 0) return out;
      const header = sh.rows[hi];
      const map = {};
      header.forEach((cell, ci) => {
        const n = norm(cell);
        if (!n) return;
        const col = spec.cols.find((c) => norm(c[1]) === n || norm(c[2]) === n || c[3].includes(n) || norm(c[0]) === n);
        if (col && map[col[0]] === undefined) map[col[0]] = ci; else out.unknown.push(text(cell));
      });
      out.missing = spec.cols.filter((c) => c[4] && map[c[0]] === undefined).map((c) => c[Buku.i18n.lang === 'en' ? 2 : 1]);
      for (let i = hi + 1; i < sh.rows.length; i++) {
        const r = sh.rows[i] || [];
        if (!r.some((v) => text(v))) continue;
        const values = {};
        for (const k in map) values[k] = r[map[k]] === undefined ? null : r[map[k]];
        out.rows.push({ n: i + 1, values });
      }
      out.map = map;
      return out;
    });
  }

  const ROLLBACK = { rollback: true };

  /**
   * Validate (commit:false) or import (commit:true) a workbook read by Buku.xlsx.read.
   * Returns { ok, sheets:[{ name, key, label, rows, created, updated, skipped, errors:[{row, message}], unknown, missing }], errors }.
   * Nothing is saved unless commit is true AND there are no errors.
   */
  function run(db, workbook, opts) {
    opts = opts || {};
    const plan = analyze(workbook);
    const order = SHEETS.map((s) => s.key);
    const report = plan.map((p) => ({ name: p.name, key: p.spec ? p.spec.key : null, label: p.spec ? tr(p.spec.en) : null,
      rows: p.rows.length, created: 0, updated: 0, skipped: 0, errors: [], unknown: p.unknown, missing: p.missing }));
    let total = 0;
    try {
      db.tx(() => {
        plan.map((p, i) => [p, report[i]]).filter(([p]) => p.spec).sort((a, b) => order.indexOf(a[0].spec.key) - order.indexOf(b[0].spec.key)).forEach(([p, rep]) => {
          if (p.missing.length) { rep.errors.push({ row: 1, message: tr('Missing column: {c}', { c: p.missing.join(', ') }) }); return; }
          const spec = p.spec;
          const required = spec.cols.filter((c) => c[4]).map((c) => c[0]);
          const units = [];
          if (spec.group === '__all') { if (p.rows.length) units.push(p.rows); }
          else if (spec.group) {
            const g = new Map();
            p.rows.forEach((r) => { const k = text(r.values[spec.group]) || '#row' + r.n; if (!g.has(k)) g.set(k, []); g.get(k).push(r); });
            g.forEach((v) => units.push(v));
          } else p.rows.forEach((r) => units.push([r]));
          for (const unit of units) {
            const rowsLabel = unit.length > 1 ? unit[0].n + '–' + unit[unit.length - 1].n : String(unit[0].n);
            const miss = [];
            unit.forEach((r) => required.forEach((k) => { const v = r.values[k]; if ((v === null || v === undefined || text(v) === '') && !miss.includes(k)) miss.push(k); }));
            if (miss.length) { rep.errors.push({ row: rowsLabel, message: tr('Empty required column: {c}', { c: miss.map((k) => { const c = spec.cols.find((x) => x[0] === k); return c[Buku.i18n.lang === 'en' ? 2 : 1]; }).join(', ') }) }); continue; }
            db.raw.exec('SAVEPOINT xl_row');
            try {
              const res = spec.group ? spec.group_(db, unit.map((r) => r.values), opts) : spec.row(db, unit[0].values, opts);
              db.raw.exec('RELEASE xl_row');
              if (typeof res === 'object') { rep.created += res.created || 0; rep.skipped += res.skipped || 0; }
              else rep[res === 'updated' ? 'updated' : res === 'skipped' ? 'skipped' : 'created'] += 1;
            } catch (e) {
              db.raw.exec('ROLLBACK TO xl_row'); db.raw.exec('RELEASE xl_row');
              if (e === ROLLBACK) throw e;
              rep.errors.push({ row: rowsLabel, message: Buku.i18n.err(e) });
            }
          }
        });
        total = report.reduce((s, r) => s + r.errors.length, 0);
        if (!opts.commit || total) throw ROLLBACK;
        Buku.posting.audit(db, 'import', 'excel', null, (opts.fileName || 'workbook') + ': ' + report.filter((r) => r.key).map((r) => r.label + ' ' + r.created).join(', '));
      });
    } catch (e) { if (e !== ROLLBACK) throw e; }
    const ok = total === 0;
    return { ok, committed: ok && !!opts.commit, errors: total, sheets: report };
  }

  /** Template workbook: one sheet per table with headers, an example row and an instructions sheet. */
  function template(lang) {
    lang = lang || Buku.i18n.lang;
    const L2 = lang === 'en' ? 2 : 1;
    const ex = {
      rates: [[{ date: '2026-07-01' }, 'USD', 16250]],
      reps: [['PU', 'Putri', '0812-1111-2222', 'putri@contoh.co.id']],
      contacts: [['PT Contoh Properti', 'customer, developer', 'CPI', '01.234.567.8-901.000', 'Budi', 'finance@contoh.co.id', '0812-0000-0000', 'Jl. Contoh No. 1, Jakarta', 14, 'Ya', 'Tidak'],
        ['PT Pemasok Contoh', 'vendor', 'PMC', '02.345.678.9-012.000', 'Sari', 'tagihan@pemasok.co.id', '021-000-0000', 'Jl. Contoh No. 2, Jakarta', 14, 'Tidak', 'Tidak']],
      products: [['SAAS-12', 'Langganan 12 bulan', 'langganan', 'Bulan', { money: 24000000 }, 12, 'PPN11', '4-1000', '']],
      opening: [[{ date: '2026-06-30' }, '1-1200', { money: 100000000 }, null, null, null]],
      invoices: [['INV-LAMA-001', { date: '2026-07-05' }, { date: '2026-07-12' }, 'PT Contoh Properti', 'IDR', null, 'PU', 'SAAS-12', 'Langganan 12 bulan', 1, 'Paket', { money: 24000000 }, 'PPN11', { date: '2026-08-01' }, { date: '2027-07-31' }, '', 'Tidak', '']],
      bills: [['VND-2026-07', { date: '2026-07-03' }, { date: '2026-07-17' }, 'PT Pemasok Contoh', 'IDR', null, 'Sewa kantor Juli', '6-2000', 1, { money: 6500000 }, 'PPNIN11', '', 'Tidak', '']],
      payments: [[{ date: '2026-07-10' }, 'masuk', 'PT Contoh Properti', 'INV-LAMA-001', { money: 26640000 }, { money: 480000 }, 'BP-0001', '1-1200', null, null, 'TRF-0710']],
      journals: [['JU-001', { date: '2026-07-25' }, 'Gaji Juli', '6-1000', { money: 22000000 }, null, ''], ['JU-001', { date: '2026-07-25' }, 'Gaji Juli', '1-1200', null, { money: 22000000 }, '']],
      bank: [['1-1200', { date: '2026-07-10' }, 'TRSF E-BANKING CR CONTOH PROPERTI', { money: 26160000 }, null, null, null]],
      deals: [['Cluster Contoh', { date: '2026-07-06' }, 'Bougenville', 'B', '12', '45/90', '', 'PT Contoh Properti', '', { money: 850000000 }, { money: 5000000 }, { money: 85000000 }, { money: 765000000 }, 'PU', 'agensi', '']],
    };
    const guide = lang === 'en' ? [
      ['How to use this workbook'], [''],
      ['Each sheet is one table. Keep the sheet names and the header row; add your rows below. Delete the example rows before importing.'],
      ['Order of import: Kurs → Tim Sales → Kontak → Produk → Saldo Awal → Invoice → Tagihan → Pembayaran → Jurnal → Mutasi Bank → Deals. Later sheets can use rows from earlier sheets.'],
      ['Contacts, products and accounts are matched by name or code. Accounts use the code from the chart of accounts, e.g. 1-1200.'],
      ['Invoice and Tagihan: one row per line. Rows with the same number become one document. Status “draft” keeps it as a draft; otherwise it is approved and posted.'],
      ['“Saldo awal” = Ya on Invoice or Tagihan creates an opening document (unpaid before go-live), posted against opening balance equity.'],
      ['Pembayaran: amount is the gross amount applied to the invoice; “PPh 23 dipotong” is what the customer withheld. Bank receives amount − PPh 23.'],
      ['Dates: YYYY-MM-DD or real Excel dates. Amounts: plain numbers in the document currency.'],
      ['Importing the same file again skips rows that already exist (contacts by name, products by code, invoices by number, journals by number).'],
    ] : [
      ['Cara memakai workbook ini'], [''],
      ['Setiap sheet adalah satu tabel. Jangan ubah nama sheet dan baris judul; isi data di bawahnya. Hapus baris contoh sebelum impor.'],
      ['Urutan impor: Kurs → Tim Sales → Kontak → Produk → Saldo Awal → Invoice → Tagihan → Pembayaran → Jurnal → Mutasi Bank → Deals. Sheet berikutnya boleh memakai data dari sheet sebelumnya.'],
      ['Kontak, produk, dan akun dicocokkan dengan nama atau kode. Akun memakai kode dari daftar akun, misalnya 1-1200.'],
      ['Invoice dan Tagihan: satu baris per item. Baris dengan nomor yang sama menjadi satu dokumen. Status “draft” menyimpannya sebagai draf; selain itu langsung disetujui dan diposting.'],
      ['“Saldo awal” = Ya pada Invoice atau Tagihan membuat dokumen saldo awal (belum lunas sebelum mulai memakai aplikasi), diposting ke ekuitas saldo awal.'],
      ['Pembayaran: Jumlah adalah nilai bruto yang dilunasi; “PPh 23 dipotong” adalah potongan oleh pelanggan. Uang masuk ke bank = Jumlah − PPh 23.'],
      ['Tanggal: YYYY-MM-DD atau format tanggal Excel. Jumlah: angka biasa dalam mata uang dokumen.'],
      ['Impor ulang file yang sama akan melewati data yang sudah ada (kontak per nama, produk per kode, invoice per nomor, jurnal per nomor).'],
    ];
    const sheets = [{ name: lang === 'en' ? 'Instructions' : 'Petunjuk', header: false, rows: guide.map((r) => r.map((x) => ({ wrap: x }))), widths: [120] }];
    SHEETS.forEach((s) => sheets.push({ name: s.id, rows: [s.cols.map((c) => c[L2])].concat(ex[s.key] || []), widths: s.cols.map((c) => Math.max(12, c[L2].length + 4)) }));
    return Buku.xlsx.write(sheets);
  }

  Buku.excelImport = { SHEETS, analyze, run, template, toDate, toMoney };
})();
