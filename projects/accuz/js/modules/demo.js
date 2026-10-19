/* Buku — demo company with realistic sample data built from real documents (also used by the test suite). */
(function () {
  'use strict';
  const Buku = window.Buku;

  /** Populate a migrated + seeded db with sample data. `today` lets tests pin the dates. */
  function populate(db, today) {
    const U = Buku.util;
    today = today || U.today();
    const id = (code) => db.scalar('SELECT id FROM accounts WHERE code=?', [code]);
    const m0 = U.monthStart(today, -3); // three months ago
    const day = (mo, d) => { const iso = U.addDays(U.monthStart(m0, mo), d - 1); return iso > today ? today : iso; };
    const now = U.nowIso();
    const post = (date, memo, lines, extra) => Buku.posting.post(db, Object.assign({ date, memo, currency: 'IDR', lines }, extra || {}));
    const contact = (name, tags, extra) => db.insert('contacts', Object.assign({ name, tags: JSON.stringify(tags), payment_terms_days: 7, payment_term_text: 'Payment Before Delivery', created_at: now, updated_at: now }, extra || {}));

    for (let i = 0; i < 4; i++) {
      Buku.fx.set(db, 'USD', U.monthStart(m0, i), String(16180 + i * 35));
      Buku.fx.set(db, 'SGD', U.monthStart(m0, i), String(12540 + i * 20) + '.5');
    }
    const ppn = db.scalar("SELECT id FROM taxes WHERE code='PPN11'");
    const ppnIn = db.scalar("SELECT id FROM taxes WHERE code='PPNIN11'");
    const saas = db.scalar("SELECT id FROM products WHERE code='SAAS-BI'");
    const komDev = db.scalar("SELECT id FROM products WHERE code='KOM-DEV'");
    const reps = db.all('SELECT id FROM sales_reps ORDER BY id').map((r) => r.id);
    const bank = id('1-1200');

    db.tx(() => {
      db.setting('bank_details', [{ account_name: db.scalar('SELECT name FROM company WHERE id=1'), bank: 'Bank BCA – Cabang Thamrin', account_no: '0000000000', swift: 'CENAIDJA', currency: 'IDR' }]);
      post(day(0, 1), 'Setoran modal awal', [{ account_id: bank, debit: 250000000 }, { account_id: id('3-1000'), credit: 250000000 }]);
      const usdRate = Buku.fx.lookup(db, 'USD', day(0, 3)).rate;
      post(day(0, 3), 'Pembelian USD untuk biaya server', [
        { account_id: id('1-1210'), debit: 300000, currency: 'USD', rate: usdRate },
        { account_id: bank, credit: Buku.money.toBase(300000, 2, usdRate) },
      ]);

      const customers = [
        contact('PT Tarumanagara Properti Indonesia', ['customer'], { pic_name: 'Heri Arsiti', phone: '08985726325', npwp: '32.152.956.1-297.000', billing_address: 'Safira Residence Blok A1 No 7, Karawang Timur, Kab. Karawang', email: 'finance@tarumanagara.example' }),
        contact('PT SuryaGajah MasPertiwi', ['customer'], { pic_name: 'Dede', phone: '0856-9798-8700', npwp: '01.740.029.2-077.000', billing_address: 'Jl. Jend. Sudirman Kav. 11, Panin Bank Centre Lt. 6, Jakarta 10270' }),
        contact('PT Griya Asri Nusantara', ['customer'], { pic_name: 'Rina', npwp: '02.111.222.3-444.000', billing_address: 'Jl. Raya Bogor Km 30, Depok' }),
        contact('CV Rumah Kita Bersama', ['customer'], { pic_name: 'Bayu', billing_address: 'Jl. Kaliurang Km 7, Yogyakarta', withholds_pph23: 0 }),
      ];
      const developer = contact('PT Cikeas Hill Development', ['developer', 'customer'], { pic_name: 'Andi', npwp: '03.333.444.5-555.000', payment_terms_days: 14, payment_term_text: '14 days after akad' });
      const gowork = contact('PT GoWork Indonesia', ['vendor'], { payment_terms_days: 14, payment_term_text: null });
      const konsultan = contact('CV Konsultan Pajak Mandiri', ['vendor'], { payment_terms_days: 30, payment_term_text: null });

      const subsToStart = [];
      let unpaidInvoice = null;
      for (let mo = 0; mo < 4; mo++) {
        for (let k = 0; k < 2; k++) {
          const cust = customers[(mo * 2 + k) % customers.length];
          const so = Buku.docs.save(db, 'sales_order', {
            contact_id: cust, sales_rep_id: reps[k % reps.length], date: day(mo, 2 + k * 3), currency: 'IDR', terms_days: 7, payment_term_text: 'Payment Before Delivery', validity_text: '1 Month',
            reference: 'OPP-' + (mo * 2 + k + 1), note: '50 hits/month',
            lines: [{ product_id: saas, item_label: 'BI Checking', description: 'BI checking in real time + profiling', quantity: 6000, unit: 'Months', unit_price: 2000000, tax_id: ppn, start_date: U.monthStart(day(mo, 2), 1), end_date: Buku.subscriptions.endDate(U.monthStart(day(mo, 2), 1), 6), line_note: '6' }],
          });
          Buku.docs.confirm(db, so);
          if (mo < 3 || k === 0) db.run('UPDATE documents SET signed_at=? WHERE id=?', [day(mo, 3 + k * 3), so]);
          const inv = Buku.docs.invoiceFromSO(db, so, { date: day(mo, 5 + k * 4) });
          Buku.docs.approve(db, inv);
          if (mo === 3 && k === 1) { unpaidInvoice = inv; continue; }
          const d = db.get('SELECT * FROM documents WHERE id=?', [inv]);
          const wt = Buku.payments.suggestedWithholding(db, d, d.total).amount;
          Buku.payments.post(db, { direction: 'in', contact_id: cust, date: day(mo, 9 + k * 4), account_id: bank, amount: d.total - wt,
            allocations: [{ document_id: inv, amount: d.total, withholding: wt, bukti_potong_no: wt ? 'BP-' + String(mo * 2 + k + 1).padStart(4, '0') : null, bukti_potong_date: day(mo, 9 + k * 4) }] });
          subsToStart.push([inv, U.monthStart(day(mo, 9 + k * 4), 1)]);
        }
        // Developer commission (2% of a house sale) with PPN, paid net of PPh 23.
        const kom = Buku.docs.save(db, 'invoice', { contact_id: developer, sales_rep_id: reps[mo % reps.length], date: day(mo, 18), terms_days: 14, due_date: day(mo, 18 + 14) < today ? day(mo, 32) : today,
          currency: 'IDR', reference: 'Akad unit ' + (mo + 1), lines: [{ product_id: komDev, description: 'Komisi penjualan Cluster Cikeas Hill unit B' + (mo + 1), quantity: 1000, unit: 'Unit', unit_price: 25000000 + mo * 5000000, tax_id: ppn }] });
        Buku.docs.approve(db, kom);
        if (mo < 3) {
          const d = db.get('SELECT * FROM documents WHERE id=?', [kom]);
          const wt = Buku.payments.suggestedWithholding(db, d, d.total).amount;
          Buku.payments.post(db, { direction: 'in', contact_id: developer, date: day(mo + 1, 2), account_id: bank, amount: d.total - wt, allocations: [{ document_id: kom, amount: d.total, withholding: wt }] });
        }
        // Office rent bill with input VAT, paid.
        const rent = Buku.docs.save(db, 'bill', { contact_id: gowork, date: day(mo, 1), terms_days: 14, due_date: day(mo, 15), currency: 'IDR', vendor_invoice_no: 'GW/' + (mo + 1),
          lines: [{ description: 'Sewa kantor GoWork Senayan City', quantity: 1000, unit_price: 6500000, tax_id: ppnIn, account_id: id('6-2000') }] });
        Buku.docs.approve(db, rent);
        const rb = db.get('SELECT * FROM documents WHERE id=?', [rent]);
        Buku.payments.post(db, { direction: 'out', contact_id: gowork, date: day(mo, 10), account_id: bank, amount: Buku.docs.balance(rb), allocations: [{ document_id: rent, amount: Buku.docs.balance(rb) }] });
        // Payroll and marketing as quick expenses / journals.
        post(day(mo, 25), 'Gaji karyawan', [{ account_id: id('6-1000'), debit: 22000000 }, { account_id: bank, credit: 22000000 }]);
        const ads = Buku.docs.save(db, 'expense', { date: day(mo, 20), currency: 'IDR', paid_from_account_id: bank, subject: 'Iklan digital', lines: [{ description: 'Meta & Google Ads', quantity: 1000, unit_price: 4250000, account_id: id('6-3000') }] });
        Buku.docs.approve(db, ads);
        const r = Buku.fx.lookup(db, 'USD', day(mo, 8)).rate;
        post(day(mo, 8), 'Biaya server & API (USD)', [
          { account_id: id('5-1000'), debit: 45000, currency: 'USD', rate: r },
          { account_id: id('1-1210'), credit: 45000, currency: 'USD', rate: r },
        ], { currency: 'USD', rate: r });
      }
      // Tax consultant bill with PPh 23 withheld by us, still open.
      const pph23v = db.scalar("SELECT id FROM taxes WHERE code='PPH23V'");
      const kb = Buku.docs.save(db, 'bill', { contact_id: konsultan, date: day(3, 4), terms_days: 30, due_date: U.addDays(day(3, 4), 30), currency: 'IDR', vendor_invoice_no: 'KPM/0921', withholding_tax_id: pph23v,
        lines: [{ description: 'Jasa konsultan pajak (SPT Masa)', quantity: 1000, unit_price: 3000000, tax_id: ppnIn, account_id: id('6-4000') }] });
      Buku.docs.approve(db, kb);

      // Subscriptions start the month after payment (when that month has begun).
      for (const [inv, start] of subsToStart) {
        if (start > today) continue;
        const s = db.get('SELECT id FROM subscriptions WHERE invoice_id=?', [inv]);
        if (s) Buku.subscriptions.handover(db, s.id, start, 'BAST-' + inv);
      }
      Buku.subscriptions.recognize(db, U.monthStart(today, -1).slice(0, 7));

      // Booking fee received on behalf of a developer (not revenue), then remitted.
      post(day(2, 14), 'Booking fee unit A1/7 – titipan untuk developer', [{ account_id: bank, debit: 5000000 }, { account_id: id('2-1300'), credit: 5000000 }]);
      post(day(3, 3), 'Setor booking fee ke developer', [{ account_id: id('2-1300'), debit: 5000000 }, { account_id: bank, credit: 5000000 }]);

      // A bank statement to review: the unpaid invoice arrived net of PPh 23, plus a bank fee.
      if (unpaidInvoice) {
        const d = db.get('SELECT * FROM documents WHERE id=?', [unpaidInvoice]);
        const wt = Buku.payments.suggestedWithholding(db, d, d.total).amount;
        const cname = db.scalar('SELECT name FROM contacts WHERE id=?', [d.contact_id]).toUpperCase().replace(/^(PT|CV)\s+/, '');
        Buku.banking.importRows(db, bank, [
          { date: today, description: 'TRSF E-BANKING CR ' + (d.total - wt) + '.00 ' + cname.slice(0, 18), amount: d.total - wt, balance: null },
          { date: today, description: 'BIAYA ADM', amount: -25000, balance: null },
        ], { preset: 'bca', fileName: 'contoh-mutasi.csv' });
      }
      Buku.banking.addRule(db, { pattern: 'BIAYA ADM', direction: 'out', account_id: id('7-5000') });

      // A draft that still needs checking.
      Buku.posting.saveDraft(db, {
        date: today, memo: 'Penggantian biaya transport (cek kuitansi)', currency: 'IDR',
        lines: [{ account_id: id('6-5000'), debit: 750000 }, { account_id: id('2-1800'), credit: 750000 }],
      });
    });
  }

  /** Property data for the Tier 3/4 screens: agency deals with titipan, a resale unit sold with KPR + instalments,
   *  an unsold unit, a JV, quotations and budgets. Runs after populate(). */
  function populateProperty(db, today) {
    const U = Buku.util;
    today = today || U.today();
    const id = (code) => db.scalar('SELECT id FROM accounts WHERE code=?', [code]);
    const m0 = U.monthStart(today, -3);
    const day = (mo, d) => { const iso = U.addDays(U.monthStart(m0, mo), d - 1); return iso > today ? today : iso; };
    const now = U.nowIso();
    const bank = id('1-1200');
    const ppn = db.scalar("SELECT id FROM taxes WHERE code='PPN11'");
    const reps = db.all('SELECT id FROM sales_reps ORDER BY id').map((r) => r.id);
    const contact = (name, tags, extra) => db.scalar('SELECT id FROM contacts WHERE name=?', [name]) ||
      db.insert('contacts', Object.assign({ name, tags: JSON.stringify(tags), payment_terms_days: 14, created_at: now, updated_at: now }, extra || {}));

    db.tx(() => {
      Buku.posting.post(db, { date: day(0, 2), memo: 'Tambahan setoran modal untuk pembelian unit properti', currency: 'IDR',
        lines: [{ account_id: bank, debit: 1500000000 }, { account_id: id('3-1000'), credit: 1500000000 }] });

      const developer = contact('PT Cikeas Hill Development', ['developer', 'customer']);
      const btn = contact('PT Bank Tabungan Negara (Persero) Tbk', ['bank', 'customer'], { npwp: '01.001.700.2-093.000', billing_address: 'Jl. Gajah Mada No. 1, Jakarta Pusat' });
      const buyer1 = contact('Budi Santoso', ['buyer', 'customer'], { phone: '0812-3456-7890', billing_address: 'Jl. Melati No. 12, Bogor' });
      const buyer2 = contact('Siti Rahmawati', ['buyer', 'customer'], { phone: '0813-2222-4545', billing_address: 'Perum Harapan Indah Blok C/9, Bekasi' });
      const buyer3 = contact('Andre Kurniawan', ['buyer', 'customer'], { phone: '0857-1111-3030', billing_address: 'Jl. Kenanga No. 4, Depok' });
      const partner = contact('Hendra Wijaya', ['partner', 'vendor'], { phone: '0811-909-777' });
      const jvParty = contact('PT Graha Mitra Sejahtera', ['partner'], { billing_address: 'Jl. Raya Jatiasih No. 88, Bekasi' });

      // Deal 1 — agency sale, complete cycle: booking fee held, part remitted, part offset against commission, partner paid, closed.
      const d1 = Buku.deals.save(db, { project: 'Cikeas Hill', cluster: 'Cluster Bougenville', block: 'B', unit_no: '12', unit_type: '45/90',
        land_area: '90', building_area: '45', certificate_type: 'SHGB', deal_date: day(0, 6), scheme: 'agency',
        buyer_id: buyer1, developer_id: developer, bank_id: btn, sales_rep_id: reps[0], price: 850000000, booking_fee: 5000000, dp: 85000000, kpr_amount: 765000000 });
      Buku.deals.milestone(db, d1, { kind: 'booking', actual_date: day(0, 6), amount: 5000000, through_us: true, reference: 'BF-B12' });
      Buku.deals.moveFund(db, { deal_id: d1, kind: 'receipt', date: day(0, 6), amount: 5000000, bank_account_id: bank, reference: 'BF-B12' });
      Buku.deals.milestone(db, d1, { kind: 'dp', actual_date: day(0, 20), amount: 85000000, through_us: false });
      Buku.deals.moveFund(db, { deal_id: d1, kind: 'remit', date: day(0, 21), amount: 3000000, bank_account_id: bank, reference: 'Setor BF ke developer' });
      Buku.deals.milestone(db, d1, { kind: 'sp3k', actual_date: day(1, 4), reference: 'SP3K/BTN/0412' });
      Buku.deals.milestone(db, d1, { kind: 'akad', actual_date: day(1, 15), reference: 'Akad BTN Cibubur' });
      const c1 = Buku.deals.addCommission(db, d1, { payer_id: developer, payer_role: 'developer', basis: 'percent', rate: 2.5, trigger_kind: 'akad', tax_id: ppn });
      const inv1 = Buku.deals.generateInvoice(db, c1, day(1, 15));
      Buku.docs.approve(db, inv1);
      Buku.deals.offset(db, { deal_id: d1, invoice_id: inv1, amount: 2000000, date: day(1, 16), memo: 'Sisa booking fee dipotong dari komisi' });
      const i1 = db.get('SELECT * FROM documents WHERE id=?', [inv1]);
      Buku.payments.post(db, { direction: 'in', contact_id: developer, date: day(1, 28), account_id: bank, amount: Buku.docs.balance(i1),
        allocations: [{ document_id: inv1, amount: Buku.docs.balance(i1) }] });
      const s1 = Buku.deals.addShare(db, d1, { contact_id: partner, treatment: 'principal', amount: 4000000, reference: 'Co-broke Hendra' });
      Buku.deals.accrueShare(db, s1, day(1, 15));
      Buku.deals.payoutShare(db, s1, day(1, 29), bank);
      Buku.deals.milestone(db, d1, { kind: 'handover', actual_date: day(2, 1), reference: 'BAST unit B-12' });
      Buku.deals.close(db, d1);

      // Deal 2 — in progress: DP passes through us (held), bank commission waits for disbursement.
      const d2 = Buku.deals.save(db, { project: 'Cikeas Hill', cluster: 'Cluster Anggrek', block: 'C', unit_no: '7', unit_type: '36/72',
        deal_date: day(2, 10), scheme: 'agency', buyer_id: buyer3, developer_id: developer, bank_id: btn, sales_rep_id: reps[1 % reps.length],
        price: 620000000, booking_fee: 3000000, dp: 62000000, kpr_amount: 558000000 });
      Buku.deals.milestone(db, d2, { kind: 'booking', actual_date: day(2, 10), amount: 3000000, through_us: true });
      Buku.deals.moveFund(db, { deal_id: d2, kind: 'receipt', date: day(2, 10), amount: 3000000, bank_account_id: bank, reference: 'BF-C7' });
      Buku.deals.milestone(db, d2, { kind: 'dp', actual_date: day(3, 3), amount: 62000000, through_us: true });
      Buku.deals.moveFund(db, { deal_id: d2, kind: 'receipt', date: day(3, 3), amount: 62000000, bank_account_id: bank, reference: 'DP-C7' });
      Buku.deals.milestone(db, d2, { kind: 'akad', planned_date: U.addDays(today, 21) });
      Buku.deals.addCommission(db, d2, { payer_id: btn, payer_role: 'bank', basis: 'fixed', amount: 5580000, trigger_kind: 'pencairan', tax_id: ppn });
      Buku.deals.addCommission(db, d2, { payer_id: developer, payer_role: 'developer', basis: 'percent', rate: 2, trigger_kind: 'akad', tax_id: ppn });

      // Resale: a unit we bought, renovated and sold with KPR plus an in-house instalment for the balance.
      const u1 = Buku.property.addUnit(db, { code: 'GRB-A7', project: 'Green Residence Bekasi', address: 'Blok A No. 7, Bekasi Utara', sales_rep_id: reps[0] });
      Buku.property.capitalize(db, { unit_id: u1, kind: 'acquisition', amount: 650000000, date: day(0, 10), bank_account_id: bank, reference: 'AJB 112/2026' });
      Buku.property.capitalize(db, { unit_id: u1, kind: 'notary', amount: 12500000, date: day(0, 12), bank_account_id: bank, reference: 'Notaris Rina SH' });
      Buku.property.capitalize(db, { unit_id: u1, kind: 'renovation', amount: 25000000, date: day(1, 3), bank_account_id: bank, reference: 'Renovasi dapur & cat' });
      const sale = Buku.property.sell(db, { unit_id: u1, buyer_id: buyer2, price: 820000000, date: day(2, 5), reference: 'PPJB GRB-A7' });
      Buku.property.kprDisbursement(db, { sale_id: sale.id, amount: 600000000, date: day(2, 25), bank_account_id: bank, reference: 'Pencairan KPR BTN' });
      Buku.property.recordPropertyTax(db, { sale_id: sale.id, tax_kind: 'pph_final', amount: 20500000, date: day(2, 26), bank_account_id: bank, ntpn: 'A1B2C3D4E5F6G7H8' });
      const planId = Buku.property.plan(db, { sale_id: sale.id, principal: 220000000, months: 6, start_date: day(2, 28) });
      const firstLine = db.get('SELECT * FROM instalment_lines WHERE plan_id=? ORDER BY due_date LIMIT 1', [planId]);
      Buku.property.collect(db, { line_id: firstLine.id, amount: firstLine.amount, date: firstLine.due_date, bank_account_id: bank });

      // An unsold unit still in inventory.
      const u2 = Buku.property.addUnit(db, { code: 'GRB-B3', project: 'Green Residence Bekasi', address: 'Blok B No. 3, Bekasi Utara' });
      Buku.property.capitalize(db, { unit_id: u2, kind: 'acquisition', amount: 540000000, date: day(3, 2), bank_account_id: bank, reference: 'AJB 140/2026' });

      // Joint venture (KSO) with a contribution and a profit distribution.
      const jv = Buku.property.jvCreate(db, 'KSO Cluster Jatiasih', jvParty);
      Buku.property.jvMove(db, { investment_id: jv, kind: 'contribution', amount: 150000000, date: day(1, 1), bank_account_id: bank, reference: 'Setoran KSO tahap 1' });
      Buku.property.jvMove(db, { investment_id: jv, kind: 'distribution', amount: 12000000, date: day(3, 15), bank_account_id: bank, reference: 'Bagi hasil Q3' });

      // Quotations: one sent, one draft.
      const cust = db.scalar("SELECT id FROM contacts WHERE name='PT Griya Asri Nusantara'") || buyer1;
      const q1 = Buku.commercial.createQuote(db, { contact_id: cust, date: day(3, 1), valid_until: U.addDays(day(3, 1), 30), note: 'Paket BI Checking 12 bulan',
        lines: [{ description: 'BI Checking 12 bulan (100 hits/bulan)', amount: 42000000, tax_id: ppn }, { description: 'Setup & training', amount: 3500000, tax_id: ppn }] });
      Buku.commercial.status(db, q1, 'sent');
      Buku.commercial.createQuote(db, { contact_id: developer, date: today, valid_until: U.addDays(today, 14), note: 'Kerja sama pemasaran cluster baru',
        lines: [{ description: 'Jasa pemasaran Cluster Mawar (retainer bulanan)', amount: 15000000, tax_id: ppn }] });

      // Budget for this month and last month.
      for (const p of [U.monthStart(today, -1).slice(0, 7), today.slice(0, 7)]) {
        Buku.period.budget(db, p, id('6-1000'), 22000000);
        Buku.period.budget(db, p, id('6-2000'), 6500000);
        Buku.period.budget(db, p, id('6-3000'), 5000000);
        Buku.period.budget(db, p, id('5-1000'), 750000);
      }
    });
  }

  async function create() {
    if (Buku.db) await Buku.store.close();
    const db = await Buku.store.createNew({
      company: { name: 'Accu-Z Accounting Demo', npwp: '00.000.000.0-000.000', phone: '', website: 'demo.example', socials: {}, logo: Buku.branding ? Buku.branding.demoLogo : null, fiscal_year_start_month: 1, language: Buku.i18n.lang, is_pkp: true },
      addresses: [{ label: 'Kantor', address: 'Jl. Contoh No. 1, Jakarta 10110', is_default: true }],
      reps: [{ code: 'PU', name: 'Putri' }, { code: 'AP', name: 'Anip' }],
      coaTemplate: 'saas_property',
      currencies: ['IDR', 'USD', 'SGD'],
    });
    populate(db);
    populateProperty(db);
    return db;
  }

  Buku.demo = { create, populate, populateProperty };
})();
