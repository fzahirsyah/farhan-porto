/* Buku — seed data: currencies, chart of accounts templates, taxes, numbering, defaults. */
(function () {
  'use strict';
  const Buku = window.Buku;

  const CURRENCIES = [
    ['IDR', 'Rupiah Indonesia', 'Rp', 0],
    ['USD', 'US Dollar', 'US$', 2],
    ['SGD', 'Singapore Dollar', 'S$', 2],
  ];

  // [code, name (ID), name (EN), type, subtype, parent code, is_header, currency, section, is_system]
  // `section` on top-level income/expense headers drives the Profit & Loss layout.
  const H = 1, S = 1;
  const COA_FULL = [
    ['1', 'Aset', 'Assets', 'asset', 'header', null, H, null, 'bs_asset', S],
    ['1-1000', 'Aset Lancar', 'Current assets', 'asset', 'header', '1', H, null, null, S],
    ['1-1100', 'Kas', 'Cash on hand', 'asset', 'cash', '1-1000', 0, 'IDR', null, S],
    ['1-1200', 'Bank BCA (IDR)', 'Bank BCA (IDR)', 'asset', 'bank', '1-1000', 0, 'IDR', null, S],
    ['1-1210', 'Bank (USD)', 'Bank (USD)', 'asset', 'bank', '1-1000', 0, 'USD', null, 0],
    ['1-1220', 'Bank (SGD)', 'Bank (SGD)', 'asset', 'bank', '1-1000', 0, 'SGD', null, 0],
    ['1-1300', 'Piutang Usaha (IDR)', 'Accounts receivable (IDR)', 'asset', 'ar', '1-1000', 0, 'IDR', null, S],
    ['1-1310', 'Piutang Usaha (USD)', 'Accounts receivable (USD)', 'asset', 'ar', '1-1000', 0, 'USD', null, S],
    ['1-1320', 'Piutang Usaha (SGD)', 'Accounts receivable (SGD)', 'asset', 'ar', '1-1000', 0, 'SGD', null, S],
    ['1-1390', 'Piutang Lain-lain', 'Other receivables', 'asset', 'current_asset', '1-1000', 0, null, null, 0],
    ['1-1400', 'Biaya Dibayar di Muka', 'Prepaid expenses', 'asset', 'current_asset', '1-1000', 0, null, null, 0],
    ['1-1410', 'Uang Muka Pembelian', 'Vendor prepayments', 'asset', 'vendor_prepayment', '1-1000', 0, null, null, S],
    ['1-1500', 'PPN Masukan', 'VAT input', 'asset', 'tax_input', '1-1000', 0, null, null, S],
    ['1-1510', 'PPh 23 Dibayar di Muka', 'Prepaid income tax art. 23', 'asset', 'tax_prepaid', '1-1000', 0, null, null, S],
    ['1-1520', 'PPh 25 Dibayar di Muka', 'Prepaid income tax art. 25', 'asset', 'tax_prepaid', '1-1000', 0, null, null, S],
    ['1-1600', 'Persediaan Properti', 'Property held for sale', 'asset', 'property_inventory', '1-1000', 0, null, null, S],
    ['1-2000', 'Aset Tidak Lancar', 'Non-current assets', 'asset', 'header', '1', H, null, null, S],
    ['1-2100', 'Peralatan Kantor & Komputer', 'Office & computer equipment', 'asset', 'fixed_asset', '1-2000', 0, null, null, 0],
    ['1-2190', 'Akumulasi Penyusutan', 'Accumulated depreciation', 'asset', 'accumulated_depreciation', '1-2000', 0, null, null, 0],
    ['1-2200', 'Investasi Ventura Bersama', 'Investment in joint ventures', 'asset', 'investment_jv', '1-2000', 0, null, null, S],

    ['2', 'Liabilitas', 'Liabilities', 'liability', 'header', null, H, null, 'bs_liability', S],
    ['2-1000', 'Liabilitas Jangka Pendek', 'Current liabilities', 'liability', 'header', '2', H, null, null, S],
    ['2-1100', 'Utang Usaha (IDR)', 'Accounts payable (IDR)', 'liability', 'ap', '2-1000', 0, 'IDR', null, S],
    ['2-1110', 'Utang Usaha (USD)', 'Accounts payable (USD)', 'liability', 'ap', '2-1000', 0, 'USD', null, S],
    ['2-1120', 'Utang Usaha (SGD)', 'Accounts payable (SGD)', 'liability', 'ap', '2-1000', 0, 'SGD', null, S],
    ['2-1200', 'Pendapatan Diterima di Muka', 'Deferred revenue', 'liability', 'deferred_revenue', '2-1000', 0, null, null, S],
    ['2-1300', 'Titipan Dana Konsumen', 'Customer funds held', 'liability', 'customer_funds_held', '2-1000', 0, null, null, S],
    ['2-1400', 'Uang Muka Pelanggan', 'Customer deposits & credits', 'liability', 'customer_credit', '2-1000', 0, null, null, S],
    ['2-1500', 'Utang Bagi Hasil Mitra', 'Partner share payable', 'liability', 'partner_payable', '2-1000', 0, null, null, S],
    ['2-1600', 'PPN Keluaran', 'VAT output', 'liability', 'tax_output', '2-1000', 0, null, null, S],
    ['2-1610', 'Utang PPN', 'VAT payable', 'liability', 'tax_payable', '2-1000', 0, null, null, S],
    ['2-1620', 'Utang PPh 21', 'Income tax art. 21 payable', 'liability', 'tax_withholding_payable', '2-1000', 0, null, null, S],
    ['2-1630', 'Utang PPh 23', 'Income tax art. 23 payable', 'liability', 'tax_withholding_payable', '2-1000', 0, null, null, S],
    ['2-1640', 'Utang PPh 4(2)', 'Final income tax 4(2) payable', 'liability', 'tax_withholding_payable', '2-1000', 0, null, null, S],
    ['2-1650', 'Utang PPh 29', 'Corporate income tax payable', 'liability', 'tax_payable', '2-1000', 0, null, null, S],
    ['2-1700', 'Biaya Masih Harus Dibayar', 'Accrued expenses', 'liability', 'current_liability', '2-1000', 0, null, null, 0],
    ['2-1800', 'Utang Reimbursement Karyawan', 'Employee reimbursements payable', 'liability', 'current_liability', '2-1000', 0, null, null, 0],

    ['3', 'Ekuitas', 'Equity', 'equity', 'header', null, H, null, 'bs_equity', S],
    ['3-1000', 'Modal Disetor', 'Paid-in capital', 'equity', 'equity', '3', 0, null, null, 0],
    ['3-2000', 'Laba Ditahan', 'Retained earnings', 'equity', 'retained_earnings', '3', 0, null, null, S],
    ['3-3000', 'Ekuitas Saldo Awal', 'Opening balance equity', 'equity', 'opening_balance', '3', 0, null, null, S],
    ['3-4000', 'Dividen', 'Dividends', 'equity', 'equity', '3', 0, null, null, 0],

    ['4', 'Pendapatan', 'Revenue', 'income', 'header', null, H, null, 'pl_revenue', S],
    ['4-1000', 'Pendapatan SaaS', 'SaaS revenue', 'income', 'revenue', '4', 0, null, null, S],
    ['4-2100', 'Pendapatan Komisi Developer', 'Commission revenue — developers', 'income', 'revenue', '4', 0, null, null, S],
    ['4-2200', 'Pendapatan Komisi Bank', 'Commission revenue — banks', 'income', 'revenue', '4', 0, null, null, S],
    ['4-2300', 'Pendapatan Komisi Konsumen', 'Commission revenue — buyers', 'income', 'revenue', '4', 0, null, null, S],
    ['4-3000', 'Pendapatan Penjualan Properti', 'Property sales revenue', 'income', 'revenue', '4', 0, null, null, S],
    ['4-9000', 'Diskon & Retur Penjualan', 'Sales discounts & returns', 'income', 'revenue', '4', 0, null, null, 0],

    ['5', 'Beban Pokok Pendapatan', 'Cost of revenue', 'expense', 'header', null, H, null, 'pl_cogs', S],
    ['5-1000', 'Beban Server, API & Data', 'Server, API & data costs', 'expense', 'cost_of_sales', '5', 0, null, null, 0],
    ['5-2000', 'HPP Properti', 'Cost of property sold', 'expense', 'property_cogs', '5', 0, null, null, S],
    ['5-3000', 'Beban Komisi Agen & Co-broke', 'Agent & co-broke commissions', 'expense', 'cost_of_sales', '5', 0, null, null, 0],
    ['5-4000', 'Beban Bagi Hasil Mitra', 'Partner profit share', 'expense', 'cost_of_sales', '5', 0, null, null, S],

    ['6', 'Beban Operasional', 'Operating expenses', 'expense', 'header', null, H, null, 'pl_opex', S],
    ['6-1000', 'Beban Gaji & Tunjangan', 'Salaries & benefits', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-1100', 'Beban Komisi Sales', 'Sales commissions', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-2000', 'Beban Sewa Kantor', 'Office rent', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-2100', 'Beban Listrik, Telepon & Internet', 'Utilities, phone & internet', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-3000', 'Beban Pemasaran & Iklan', 'Marketing & advertising', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-3100', 'Beban Software & Langganan', 'Software & subscriptions', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-4000', 'Beban Jasa Profesional', 'Professional fees', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-4100', 'Beban Notaris & Legal', 'Notary & legal', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-5000', 'Beban Transportasi & Perjalanan', 'Transport & travel', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-5100', 'Beban Perlengkapan Kantor', 'Office supplies', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-5200', 'Beban Meterai & e-Meterai', 'Stamp duty (meterai)', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-6000', 'Beban Penyusutan', 'Depreciation', 'expense', 'operating', '6', 0, null, null, 0],
    ['6-9000', 'Beban Operasional Lain-lain', 'Other operating expenses', 'expense', 'operating', '6', 0, null, null, 0],

    ['7', 'Pendapatan & Beban Lain-lain', 'Other income & expenses', 'income', 'header', null, H, null, 'pl_other', S],
    ['7-1000', 'Pendapatan Bunga & Jasa Giro', 'Interest income', 'income', 'other_income', '7', 0, null, null, 0],
    ['7-1100', 'Pendapatan Lain-lain', 'Other income', 'income', 'other_income', '7', 0, null, null, 0],
    ['7-2000', 'Laba/Rugi Selisih Kurs (Terealisasi)', 'Realized FX gain/loss', 'income', 'fx_realized', '7', 0, null, null, S],
    ['7-2100', 'Laba/Rugi Selisih Kurs (Belum Terealisasi)', 'Unrealized FX gain/loss', 'income', 'fx_unrealized', '7', 0, null, null, S],
    ['7-3000', 'Pembulatan', 'Rounding', 'income', 'rounding', '7', 0, null, null, S],
    ['7-5000', 'Biaya Administrasi Bank', 'Bank charges', 'expense', 'other_expense', '7', 0, null, null, S],
    ['7-5100', 'Beban Bunga', 'Interest expense', 'expense', 'other_expense', '7', 0, null, null, 0],
    ['7-5200', 'Beban Lain-lain', 'Other expenses', 'expense', 'other_expense', '7', 0, null, null, 0],

    ['8', 'Beban Pajak', 'Income tax expense', 'expense', 'header', null, H, null, 'pl_tax', S],
    ['8-1000', 'Beban PPh Final', 'Final income tax expense', 'expense', 'income_tax', '8', 0, null, null, S],
    ['8-2000', 'Beban Pajak Penghasilan', 'Corporate income tax expense', 'expense', 'income_tax', '8', 0, null, null, S],
  ];

  // The blank template keeps only headers and system accounts.
  const COA_TEMPLATES = {
    saas_property: COA_FULL,
    blank: COA_FULL.filter((r) => r[9] === S),
  };

  // [code, name, print label, kind, direction, rate, base_num, base_den, account code, notes]
  const TAXES = [
    ['PPN11', 'PPN 12% × DPP 11/12', 'VAT – 11%', 'ppn_out', 'none', '12', 11, 12, '2-1600', 'Default output VAT: 12% on a DPP of 11/12 (effective 11%). Confirm with your tax consultant.'],
    ['PPN12', 'PPN 12% (DPP penuh)', 'VAT – 12%', 'ppn_out', 'none', '12', 1, 1, '2-1600', 'Full-DPP output VAT where applicable.'],
    ['PPN0', 'PPN 0%', 'VAT – 0%', 'ppn_out', 'none', '0', 1, 1, '2-1600', 'E.g. export of services.'],
    ['PPNIN11', 'PPN Masukan 12% × 11/12', 'VAT – 11%', 'ppn_in', 'none', '12', 11, 12, '1-1500', 'Input VAT on purchases.'],
    ['PPNIN12', 'PPN Masukan 12%', 'VAT – 12%', 'ppn_in', 'none', '12', 1, 1, '1-1500', ''],
    ['PPH23C', 'PPh 23 dipotong pelanggan 2%', 'PPh 23 – 2%', 'pph23', 'withheld_by_customer', '2', 1, 1, '1-1510', 'Withheld by customers from our services/commission.'],
    ['PPH23V', 'PPh 23 kita potong 2%', 'PPh 23 – 2%', 'pph23', 'withheld_by_us', '2', 1, 1, '2-1630', 'We withhold from vendors.'],
    ['PPH21', 'PPh 21 (bukan pegawai)', 'PPh 21', 'pph21', 'withheld_by_us', '2.5', 1, 1, '2-1620', 'Payments to individual agents; rate set per case.'],
    ['PPH42', 'PPh Final 4(2) pengalihan properti 2,5%', 'PPh 4(2) – 2,5%', 'pph42', 'final', '2.5', 1, 1, '2-1640', 'Seller final tax on transfer of land/buildings.'],
    ['NONE', 'Tanpa pajak', 'Non-PPN', 'none', 'none', '0', 1, 1, null, ''],
  ];

  const SEQUENCES = [
    ['journal', 'JE-{YYYY}{MM}-{####}'],
    ['opening', 'OB-{YYYY}-{###}'],
    ['quotation', 'QT-{YYYY}{MM}-{####}'],
    ['sales_order', 'SO-{YYYY}{MM}-{####}'],
    ['invoice', 'INV-{YYYY}{MM}-{####}'],
    ['credit_note', 'CN-{YYYY}{MM}-{####}'],
    ['receipt', 'KW-{YYYY}{MM}-{####}'],
    ['payment_in', 'RCV-{YYYY}{MM}-{####}'],
    ['payment_out', 'PAY-{YYYY}{MM}-{####}'],
    ['bill', 'BILL-{YYYY}{MM}-{####}'],
    ['deal', 'DL-{YYYY}{MM}-{####}'],
    ['expense', 'EXP-{YYYY}{MM}-{####}'],
  ];

  const DEFAULT_SETTINGS = {
    backup_reminder_days: 7,
    lock_date: null,
    enabled_currencies: ['IDR', 'USD', 'SGD'],
  };

  /**
   * Initialise an empty, migrated database with a company.
   * input: { company:{...}, addresses:[{label,address,is_default}], reps:[{code,name,...}],
   *          coaTemplate:'saas_property'|'blank', currencies:['IDR','USD','SGD'] }
   */
  function initCompany(db, input) {
    const now = Buku.util.nowIso();
    db.tx(() => {
      db.meta('file_id', Buku.util.uuid());
      db.meta('created_at', now);
      db.meta('app', 'Buku');

      const enabled = new Set(input.currencies || ['IDR', 'USD', 'SGD']);
      enabled.add('IDR');
      for (const [code, name, symbol, decimals] of CURRENCIES) {
        db.insert('currencies', { code, name, symbol, decimals, is_enabled: enabled.has(code) ? 1 : 0 });
      }

      const c = input.company || {};
      db.insert('company', {
        id: 1,
        name: c.name || 'Perusahaan Baru',
        legal_name: c.legal_name || c.name || null,
        npwp: c.npwp || null,
        phone: c.phone || null,
        email: c.email || null,
        website: c.website || null,
        socials: JSON.stringify(c.socials || {}),
        logo: c.logo || null,
        fiscal_year_start_month: Number(c.fiscal_year_start_month) || 1,
        language: c.language === 'en' ? 'en' : 'id',
        is_pkp: c.is_pkp === false ? 0 : 1,
        created_at: now,
        updated_at: now,
      });

      (input.addresses || []).forEach((a, i) => {
        if (!a.address) return;
        db.insert('company_addresses', {
          label: a.label || 'Kantor ' + (i + 1),
          address: a.address,
          is_default: a.is_default ? 1 : 0,
          created_at: now,
          updated_at: now,
        });
      });
      if (!db.scalar('SELECT count(*) FROM company_addresses WHERE is_default=1')) {
        db.run('UPDATE company_addresses SET is_default=1 WHERE id=(SELECT min(id) FROM company_addresses)');
      }

      (input.reps || []).forEach((r) => {
        if (!r.code || !r.name) return;
        db.insert('sales_reps', { code: r.code.toUpperCase(), name: r.name, phone: r.phone || null, email: r.email || null, created_at: now, updated_at: now });
      });

      const rows = COA_TEMPLATES[input.coaTemplate] || COA_TEMPLATES.saas_property;
      const ids = {};
      for (const [code, name, nameEn, type, subtype, parent, header, currency, section, system] of rows) {
        // Foreign-currency accounts for disabled currencies are still created but inactive.
        const active = currency && !enabled.has(currency) ? 0 : 1;
        ids[code] = db.insert('accounts', {
          code, name, name_en: nameEn, type, subtype, section,
          parent_id: parent ? ids[parent] : null,
          is_header: header ? 1 : 0, currency, is_system: system ? 1 : 0, is_active: active,
          created_at: now, updated_at: now,
        });
      }

      for (const [code, name, label, kind, direction, rate, num, den, acc, notes] of TAXES) {
        db.insert('taxes', {
          code, name, print_label: label, kind, direction, rate, base_num: num, base_den: den,
          account_id: acc ? ids[acc] || null : null, notes, created_at: now, updated_at: now,
        });
      }

      for (const [type, pattern] of SEQUENCES) db.insert('number_sequences', { doc_type: type, pattern, next_number: 1, reset: 'never' });

      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) db.setting(k, k === 'enabled_currencies' ? Array.from(enabled) : v);
      ensureDefaults(db);
    });
  }

  // Starter products: [code, name, kind, unit, months, quota, IDR price, income account code, note]
  const PRODUCTS = [
    ['SAAS-BI', 'SaaS BI Checking & Profiling', 'plan', 'Months', 6, '50 hits/month', 2000000, '4-1000', 'SaaS {months} Months | 50 hits/month'],
    ['KOM-DEV', 'Komisi Developer', 'commission', 'Unit', null, null, 0, '4-2100', null],
    ['KOM-BANK', 'Komisi / Referral Bank (KPR)', 'commission', 'Unit', null, null, 0, '4-2200', null],
    ['KOM-KONS', 'Jasa Agen Properti (Konsumen)', 'commission', 'Unit', null, null, 0, '4-2300', null],
  ];

  /**
   * Idempotent defaults added by schema v2 (and for every new company): numbering for new documents,
   * templates, document settings, bank details and starter products. Never overwrites user data.
   */
  function ensureDefaults(db) {
    const now = Buku.util.nowIso();
    for (const [type, pattern] of SEQUENCES) {
      if (!db.scalar('SELECT 1 FROM number_sequences WHERE doc_type=?', [type])) db.insert('number_sequences', { doc_type: type, pattern, next_number: 1, reset: 'never' });
    }
    if (db.setting('deferred_revenue') === undefined) db.setting('deferred_revenue', true);
    if (db.setting('renewal_window_days') === undefined) db.setting('renewal_window_days', 30);
    const company = db.get('SELECT * FROM company WHERE id=1');
    if (db.setting('bank_details') === undefined) {
      const isMR = company && /miliki\s*rumah/i.test(company.name || '');
      db.setting('bank_details', isMR ? [{ account_name: 'PT Miliki Rumah Indonesia', bank: 'Bank BCA – Cabang Thamrin', account_no: '2067711889', swift: 'CENAIDJA', currency: 'IDR' }] : []);
    }
    if (!db.scalar('SELECT count(*) FROM doc_templates')) {
      const T = Buku.templates;
      const mr = T.defaultSettings('milikirumah');
      const add = (name, docType, layout, settings, isDefault) =>
        db.insert('doc_templates', { name, doc_type: docType, layout, settings: JSON.stringify(settings), is_default: isDefault ? 1 : 0, created_at: now, updated_at: now });
      add('Accu-Z Accounting – Sales Order', 'sales_order', 'milikirumah', mr, true);
      add('Accu-Z Accounting – Invoice', 'invoice', 'milikirumah', mr, true);
      add('Accu-Z Accounting – Credit Note', 'credit_note', 'milikirumah', mr, true);
      add('Accu-Z Accounting – Kwitansi', 'receipt', 'milikirumah', Object.assign({}, mr, { language: 'id' }), true);
      add('Accu-Z Accounting – Statement', 'statement', 'milikirumah', mr, true);
      add('Classic', 'all', 'classic', T.defaultSettings('classic'), false);
      add('Modern', 'all', 'modern', T.defaultSettings('modern'), false);
      add('Compact', 'all', 'compact', T.defaultSettings('compact'), false);
    }
    if (!db.scalar('SELECT count(*) FROM products')) {
      const ppn = db.scalar("SELECT id FROM taxes WHERE code='PPN11'");
      for (const [code, name, kind, unit, months, quota, price, acc, note] of PRODUCTS) {
        const accId = db.scalar('SELECT id FROM accounts WHERE code=?', [acc]);
        if (!accId) continue;
        const pid = db.insert('products', { code, name, kind, unit, default_months: months, quota_text: quota, default_note: note ? note.replace('{months}', months) : null,
          income_account_id: accId, tax_id: ppn || null, is_sold: 1, created_at: now, updated_at: now });
        if (price) db.insert('product_prices', { product_id: pid, currency: 'IDR', unit_price: price });
      }
    }
  }

  Buku.seed = { initCompany, ensureDefaults, CURRENCIES, COA_TEMPLATES, TAXES, SEQUENCES };
})();
