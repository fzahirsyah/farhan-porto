/* Regression tests for the review fixes, property demo data, and Import from Excel. Runs in memory. */
(async function () {
  'use strict';
  const B = window.Buku, rs = [];
  const ok = (name, test, detail) => { rs.push({ name, pass: !!test, detail: test ? '' : detail || '' }); };
  const throws = (name, fn, code) => { let actual = ''; try { fn(); } catch (e) { actual = e.code || e.message; } ok(name, actual === code, 'got ' + actual); };
  const fresh = async (reps, currencies) => {
    const db = await B.dbm.create();
    B.schema.migrate(db);
    B.seed.initCompany(db, { company: { name: 'Fix Test' }, addresses: [{ label: 'HQ', address: 'Jakarta', is_default: true }], reps: reps || [], coaTemplate: 'saas_property', currencies: currencies || ['IDR'] });
    return db;
  };
  try {
    // ---------- Bug 1: deal detail query (ambiguous deal_id) ----------
    let db = await fresh([{ code: 'PU', name: 'Putri' }]);
    const now = B.util.nowIso(), a = (c) => db.scalar('SELECT id FROM accounts WHERE code=?', [c]), bank = a('1-1200');
    const person = (n) => db.insert('contacts', { name: n, tags: '[]', created_at: now, updated_at: now });
    const buyer = person('Pembeli Satu'), dev = person('PT Developer Satu'), partner = person('Mitra Satu');
    const ppn = db.scalar("SELECT id FROM taxes WHERE code='PPN11'");
    B.posting.post(db, { date: '2026-07-01', currency: 'IDR', memo: 'Modal', lines: [{ account_id: bank, debit: 2000000000 }, { account_id: a('3-1000'), credit: 2000000000 }] });
    const d = B.deals.save(db, { project: 'Cluster Uji', unit_no: 'A1', deal_date: '2026-07-02', buyer_id: buyer, developer_id: dev, price: 500000000 });
    B.deals.party(db, d, partner, 'partner');
    B.deals.moveFund(db, { deal_id: d, kind: 'receipt', date: '2026-07-02', amount: 5000000, bank_account_id: bank });
    let detail = null; try { detail = B.deals.detail(db, d); } catch (e) { detail = e; }
    ok('deal detail loads with parties and fund movements', detail && !(detail instanceof Error) && detail.parties.length === 1 && detail.funds.length === 1, String(detail && detail.message));

    // ---------- Deal close rules: unpaid commission / accrued partner share ----------
    B.deals.milestone(db, d, { kind: 'akad', actual_date: '2026-07-10' });
    const c = B.deals.addCommission(db, d, { payer_id: dev, payer_role: 'developer', basis: 'fixed', amount: 10000000, trigger_kind: 'akad', tax_id: ppn });
    const inv = B.deals.generateInvoice(db, c, '2026-07-10'); B.docs.approve(db, inv);
    B.deals.moveFund(db, { deal_id: d, kind: 'remit', date: '2026-07-11', amount: 5000000, bank_account_id: bank });
    throws('deal cannot close while the commission invoice is unpaid', () => B.deals.close(db, d), 'commission_unpaid');
    const i1 = db.get('SELECT * FROM documents WHERE id=?', [inv]);
    B.payments.post(db, { direction: 'in', contact_id: dev, date: '2026-07-20', account_id: bank, amount: B.docs.balance(i1), allocations: [{ document_id: inv, amount: B.docs.balance(i1) }] });
    const sh = B.deals.addShare(db, d, { contact_id: partner, amount: 2000000 }); B.deals.accrueShare(db, sh, '2026-07-12');
    throws('deal cannot close while a partner share is accrued but unpaid', () => B.deals.close(db, d), 'partner_unpaid');
    B.deals.payoutShare(db, sh, '2026-07-21', bank);
    B.deals.close(db, d);
    ok('deal closes once commission and partner are settled', db.scalar('SELECT status FROM deals WHERE id=?', [d]) === 'closed');

    // ---------- Bug 2: credit note on a property sale invoice ----------
    const unit = B.property.addUnit(db, { code: 'U-1', project: 'Resale Uji' });
    B.property.capitalize(db, { unit_id: unit, kind: 'acquisition', amount: 300000000, date: '2026-07-03', bank_account_id: bank });
    const sale = B.property.sell(db, { unit_id: unit, buyer_id: buyer, price: 400000000, date: '2026-07-15' });
    ok('isPropertySale recognises the sale invoice', B.docs.isPropertySale(db, sale.invoice_id) && !B.docs.isPropertySale(db, inv));
    throws('credit note cannot be created from a property sale invoice', () => B.docs.creditNoteFromInvoice(db, sale.invoice_id), 'property_sale_credit');
    const cnDraft = B.docs.save(db, 'credit_note', { contact_id: buyer, date: '2026-07-16', source_doc_id: sale.invoice_id, currency: 'IDR', lines: [{ description: 'Diskon', quantity: 1000, unit_price: 1000000, account_id: a('4-3000') }] });
    throws('a hand-made credit note against a property sale cannot be approved', () => B.docs.approve(db, cnDraft), 'property_sale_credit');
    ok('property inventory still reconciles', B.property.trial(db).ok);

    // ---------- Bug 3: year-end closing entry does not wipe P&L, cash flow or budgets ----------
    const y = '2026';
    const plBefore = B.ledger.profitLoss(db, [{ from: y + '-01-01', to: y + '-12-31' }]).net[0];
    B.period.budget(db, '2026-12', a('6-1000'), 1000000);
    B.posting.post(db, { date: '2026-12-15', currency: 'IDR', memo: 'Gaji', lines: [{ account_id: a('6-1000'), debit: 1500000 }, { account_id: bank, credit: 1500000 }] });
    const plMid = B.ledger.profitLoss(db, [{ from: y + '-01-01', to: y + '-12-31' }]).net[0];
    const cfBefore = B.reports2.cashFlow(db, y + '-01-01', y + '-12-31');
    B.period.yearEnd(db, y + '-12-31');
    const plAfter = B.ledger.profitLoss(db, [{ from: y + '-01-01', to: y + '-12-31' }]).net[0];
    ok('P&L for the closed year still shows the profit', plAfter === plMid && plMid === plBefore - 1500000 && plAfter !== 0, plBefore + ' / ' + plMid + ' / ' + plAfter);
    ok('net profit excludes the closing entry', B.ledger.netProfit(db, y + '-01-01', y + '-12-31') === plAfter);
    const bs = B.ledger.balanceSheet(db, [y + '-12-31']);
    ok('balance sheet still balances after year-end close', bs.difference[0] === 0, String(bs.difference[0]));
    const cfAfter = B.reports2.cashFlow(db, y + '-01-01', y + '-12-31');
    ok('cash flow unchanged by the closing entry', cfAfter.cashChange === cfBefore.cashChange && cfAfter.difference === 0, cfAfter.difference);
    const br = B.period.budgetReport(db, '2026-12').find((r) => r.account_id === a('6-1000'));
    ok('budget actuals ignore the closing entry', br && Number(br.actual) === 1500000, br && br.actual);

    // ---------- Property demo data ----------
    db = await fresh([{ code: 'PU', name: 'Putri' }, { code: 'AP', name: 'Anip' }], ['IDR', 'USD', 'SGD']);
    B.demo.populate(db, '2026-10-13');
    B.demo.populateProperty(db, '2026-10-13');
    ok('demo: two deals, one closed', db.scalar('SELECT count(*) FROM deals') === 2 && db.scalar("SELECT count(*) FROM deals WHERE status='closed'") === 1);
    ok('demo: one sold and one owned unit', db.scalar("SELECT count(*) FROM property_units WHERE status='sold'") === 1 && db.scalar("SELECT count(*) FROM property_units WHERE status='owned'") === 1);
    ok('demo: instalment plan, JV, quotations and budgets present', db.scalar('SELECT count(*) FROM instalment_plans') === 1 && db.scalar('SELECT count(*) FROM jv_movements') === 2 &&
      db.scalar('SELECT count(*) FROM quotations') === 2 && db.scalar('SELECT count(*) FROM budgets') === 8);
    ok('demo: ledger, inventory and titipan reconcile', B.ledger.trialBalance(db, '2030-01-01').balanced && B.property.trial(db).ok && B.deals.trial(db).unassigned === 0 &&
      B.ledger.integrity(db).filter((i) => i.level === 'error').length === 0 && B.reports2.controlChecks(db).length === 0);

    // ---------- Templates: empty finance phone ----------
    ok('payment text drops the call sentence when no finance phone is set', (() => {
      const html = B.templates.markup ? B.templates.markup('Pay to {company}. Alternatively, please call our Finance Department on {finance_phone}, if you have any questions.', { company: 'X', finance_phone: '' }) : null;
      return html === null || (!/on ,/.test(html) && !/finance_phone/.test(html) && /Pay to X\./.test(html));
    })());

    // ---------- xlsx round trip ----------
    const bytes = B.xlsx.write([{ name: 'Satu', rows: [['A', 'B', 'C'], ['teks & <x>', 12345, { date: '2026-02-28' }], [null, { money: 1500.5 }, true]] }, { name: 'Dua', rows: [['x'], ['ü€']] }]);
    const back = await B.xlsx.read(bytes.buffer);
    ok('xlsx write → read keeps sheets, text, numbers, dates and booleans', back.sheets.length === 2 && back.sheets[0].rows[1][0] === 'teks & <x>' && back.sheets[0].rows[1][1] === 12345 &&
      back.sheets[0].rows[1][2] === '2026-02-28' && back.sheets[0].rows[2][1] === 1500.5 && back.sheets[0].rows[2][2] === true && back.sheets[1].rows[1][0] === 'ü€', JSON.stringify(back.sheets[0].rows));
    ok('date parser accepts common formats', B.excelImport.toDate('2026-07-05') === '2026-07-05' && B.excelImport.toDate('05/07/2026') === '2026-07-05' &&
      B.excelImport.toDate('5 Jul 2026') === '2026-07-05' && B.excelImport.toDate('5 Agu 2026') === '2026-08-05' && B.excelImport.toDate(46208) === '2026-07-05');
    throws('date parser rejects 31 Feb', () => B.excelImport.toDate('31/02/2026'), 'x_date');
    const tpl = await B.xlsx.read(B.excelImport.template('id').buffer);
    ok('template has an instructions sheet and one sheet per table', tpl.sheets.length === B.excelImport.SHEETS.length + 1);

    // ---------- Import the example workbook into a new company ----------
    db = await fresh();
    const bin = Uint8Array.from(atob(window.__exampleXlsx), (ch) => ch.charCodeAt(0));
    const wb = await B.xlsx.read(bin.buffer);
    const dry = B.excelImport.run(db, wb, { commit: false });
    ok('example workbook validates without errors', dry.ok, JSON.stringify(dry.sheets.filter((s) => s.errors.length).map((s) => [s.name, s.errors])));
    ok('dry run saves nothing', db.scalar('SELECT count(*) FROM contacts') === 0 && db.scalar('SELECT count(*) FROM journal_entries') === 0 && db.scalar('SELECT is_enabled FROM currencies WHERE code=?', ['USD']) === 0);
    const res = B.excelImport.run(db, wb, { commit: true, fileName: 'contoh.xlsx' });
    const by = (k) => res.sheets.find((s) => s.key === k) || {};
    ok('import commits', res.committed && by('contacts').created === 16 && by('invoices').created === 14 && by('bills').created === 10 && by('payments').created === 19 && by('journals').created === 8 && by('deals').created === 3,
      JSON.stringify(res.sheets.map((s) => [s.name, s.created, s.errors.length])));
    const bal = (code) => { const v = B.ledger.accountBalances(db).get(a2(code)); return v ? v.base : 0; };
    const a2 = (code) => db.scalar('SELECT id FROM accounts WHERE code=?', [code]);
    ok('imported ledger balances', B.ledger.trialBalance(db, '2030-01-01').balanced && B.ledger.integrity(db).filter((i) => i.level === 'error').length === 0 && B.reports2.controlChecks(db).length === 0);
    ok('receivables equal the open invoices (50,828,000)', bal('1-1300') === 50828000, bal('1-1300'));
    ok('payables equal the open consultant bill net of PPh 23 (3,270,000)', bal('2-1100') === 3270000, bal('2-1100'));
    ok('PPh 23 withheld by customers recorded (1,998,000)', bal('1-1510') === 1998000, bal('1-1510'));
    ok('opening balances posted with balancing equity', db.scalar("SELECT count(*) FROM journal_entries WHERE source_type='opening'") === 1 && bal('1-1100') === 5000000 - 1250000 - 1150000);
    ok('SaaS invoices created subscriptions and deferred revenue', db.scalar('SELECT count(*) FROM subscriptions') === 6 && bal('2-1200') > 0);
    ok('foreign currency invoice and bills used the Kurs sheet', db.scalar("SELECT count(*) FROM documents WHERE currency='SGD'") === 1 && db.scalar("SELECT count(*) FROM documents WHERE currency='USD'") === 3 &&
      db.scalar("SELECT rate FROM documents WHERE currency='SGD'") === db.scalar("SELECT rate FROM exchange_rates WHERE currency='SGD' AND rate_date='2026-07-01'"));
    ok('draft invoice stays a draft', db.scalar("SELECT count(*) FROM documents WHERE doc_type='invoice' AND status='draft'") === 1);
    ok('bank statement lines wait for matching', db.scalar("SELECT count(*) FROM bank_import_lines WHERE status='new'") === 7);
    ok('import is written to the audit log', /contoh\.xlsx/.test(db.scalar("SELECT summary FROM audit_log WHERE action='import' ORDER BY id DESC LIMIT 1") || ''));
    const again = B.excelImport.run(db, wb, { commit: true });
    ok('importing the same file again adds nothing', again.ok && again.sheets.every((s) => !s.created && !s.updated), JSON.stringify(again.sheets.map((s) => [s.name, s.created, s.updated])));

    // ---------- Problems are reported per row and nothing is saved ----------
    const badBytes = B.xlsx.write([
      { name: 'Contacts', rows: [['Name', 'Type'], ['PT Baru Sekali', 'customer']] },
      { name: 'Invoices', rows: [['Invoice no.', 'Date', 'Customer', 'Description', 'Unit price', 'Tax'], ['B-1', '2026-09-01', 'PT Tidak Ada', 'Jasa', 1000, 'PPN11'], ['B-2', '2026-09-01', 'PT Baru Sekali', 'Jasa', 'abc', 'PPN11'], ['B-3', '2026-09-01', 'PT Baru Sekali', 'Jasa', 1000, 'PPNIN11']] },
      { name: 'Journal', rows: [['Journal no.', 'Date', 'Account', 'Debit', 'Credit'], ['J-1', '2026-09-02', '6-1000', 100, null], ['J-1', '2026-09-02', '1-1200', null, 90]] },
      { name: 'Payments', rows: [['Date', 'Contact', 'Amount']] },
      { name: 'Catatan', rows: [['bebas']] },
    ]);
    const bad = B.excelImport.run(db, await B.xlsx.read(badBytes.buffer), { commit: true });
    const errs = (k) => (bad.sheets.find((s) => s.key === k) || { errors: [] }).errors;
    ok('English sheet and column names are recognised', bad.sheets.filter((s) => s.key).length === 4 && !bad.sheets.find((s) => s.name === 'Catatan').key);
    ok('unknown customer, bad amount and wrong tax are reported by row', errs('invoices').length === 3 && errs('invoices').map((e) => e.row).join(',') === '2,3,4', JSON.stringify(errs('invoices')));
    ok('unbalanced journal is reported', errs('journals').length === 1);
    ok('missing required columns are reported', errs('payments').length === 1 && /Document no\.|No\. dokumen/.test(errs('payments')[0].message), JSON.stringify(errs('payments')));
    ok('nothing is saved when there are problems', !bad.committed && !db.scalar("SELECT count(*) FROM contacts WHERE name='PT Baru Sekali'"));
  } catch (e) { rs.push({ name: 'TEST RUN CRASH', pass: false, detail: e.stack || String(e) }); }
  window.__tier5Results = { total: rs.length, failed: rs.filter((r) => !r.pass) };
  const summary = document.getElementById('summary');
  if (summary) {
    summary.textContent = (rs.length - window.__tier5Results.failed.length) + ' / ' + rs.length + ' passed';
    document.getElementById('out').innerHTML = rs.map((x) => '<p>' + (x.pass ? '✓' : '✗') + ' ' + x.name + (x.detail ? '<pre>' + String(x.detail).replace(/</g, '&lt;') + '</pre>' : '') + '</p>').join('');
  }
})();
