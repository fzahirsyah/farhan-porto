/* Buku — settings: company & addresses, sales team, currencies & rates, taxes, numbering, data & backup. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const L = () => Buku.i18n;
  const now = () => Buku.util.nowIso();
  const LOGO_MAX = 400 * 1024;

  // ---------- Company ----------
  function company() {
    const db = Buku.db;
    const c = db.get('SELECT * FROM company WHERE id=1');
    const socials = JSON.parse(c.socials || '{}');
    const addrs = db.all('SELECT * FROM company_addresses ORDER BY is_default DESC, label');
    const months = L().monthNames('long').map((m, i) => ({ value: i + 1, label: m }));
    ui.page({
      title: t('Company'),
      cls: 'narrow',
      body:
        '<form id="cf" class="card-form">' +
        '<div class="logo-row"><div class="logo-box" id="logo-box">' + (c.logo ? '<img src="' + h(c.logo) + '" alt="">' : '<span>' + h(t('No logo')) + '</span>') + '</div>' +
        '<div><label class="btn small">' + h(t('Upload logo')) + '<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="logo-file" hidden></label> ' +
        (c.logo ? '<button type="button" class="btn small ghost" id="logo-remove">' + h(t('Remove')) + '</button>' : '') +
        '<p class="hint">' + h(t('PNG or SVG with a transparent background works best. Max 400 KB.')) + '</p></div></div>' +
        '<div class="grid2">' +
        ui.field(t('Company name'), ui.input('name', c.name, { required: true }), { wide: true }) +
        ui.field(t('Legal name'), ui.input('legal_name', c.legal_name), { optional: true, wide: true }) +
        ui.field('NPWP', ui.input('npwp', c.npwp)) +
        ui.field(t('Finance phone'), ui.input('phone', c.phone)) +
        ui.field(t('Email'), ui.input('email', c.email, { type: 'email' }), { optional: true }) +
        ui.field(t('Website'), ui.input('website', c.website), { optional: true }) +
        ui.field('LinkedIn', ui.input('linkedin', socials.linkedin), { optional: true }) +
        ui.field('Instagram', ui.input('instagram', socials.instagram), { optional: true }) +
        ui.field('TikTok', ui.input('tiktok', socials.tiktok), { optional: true }) +
        ui.field(t('Financial year starts in'), ui.select('fiscal_year_start_month', months, c.fiscal_year_start_month)) +
        '</div>' +
        '<label class="check"><input type="checkbox" name="is_pkp"' + (c.is_pkp ? ' checked' : '') + '> ' + h(t('VAT-registered company (PKP)')) + '</label>' +
        '<div class="form-actions"><button class="btn primary" type="submit">' + h(t('Save changes')) + '</button></div></form>' +
        '<section class="panel"><header><h2>' + h(t('Office addresses')) + '</h2><button type="button" class="btn small" id="add-addr">' + h(t('Add address')) + '</button></header>' +
        (addrs.length ? '<ul class="plain-list">' + addrs.map((a) => '<li><div><strong>' + h(a.label) + '</strong>' + (a.is_default ? ' <span class="chip ok">' + h(t('Default')) + '</span>' : '') +
          '<div class="sub">' + h(a.address) + '</div></div><button type="button" class="btn small ghost" data-addr="' + a.id + '">' + h(t('Edit')) + '</button></li>').join('') + '</ul>'
          : ui.empty(t('No addresses yet.'))) + '</section>',
    });

    ui.$('#cf').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = ui.formData(ui.$('#cf'));
      if (!f.name) return ui.toast(t('Enter the company name.'), 'error');
      db.tx(() => {
        db.update('company', 1, {
          name: f.name, legal_name: f.legal_name || null, npwp: f.npwp || null, phone: f.phone || null, email: f.email || null, website: f.website || null,
          socials: JSON.stringify({ linkedin: f.linkedin, instagram: f.instagram, tiktok: f.tiktok }),
          fiscal_year_start_month: Number(f.fiscal_year_start_month), is_pkp: f.is_pkp ? 1 : 0, updated_at: now(),
        });
        Buku.posting.audit(db, 'update', 'company', 1, null);
      });
      Buku.app.renderNav();
      ui.toast(t('Company details saved'));
    });

    ui.$('#logo-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > LOGO_MAX) return ui.toast(t('The logo is larger than 400 KB. Resize it and try again.'), 'error');
      const r = new FileReader();
      r.onload = () => { db.tx(() => db.update('company', 1, { logo: r.result, updated_at: now() })); ui.toast(t('Logo updated')); ui.dispatch(); };
      r.readAsDataURL(file);
    });
    const rm = ui.$('#logo-remove');
    if (rm) rm.addEventListener('click', () => { db.tx(() => db.update('company', 1, { logo: null, updated_at: now() })); ui.dispatch(); });
    ui.$('#add-addr').addEventListener('click', () => editAddress(null));
    ui.$$('[data-addr]').forEach((b) => b.addEventListener('click', () => editAddress(Number(b.dataset.addr))));
  }

  function editAddress(id) {
    const db = Buku.db;
    const a = id ? db.get('SELECT * FROM company_addresses WHERE id=?', [id]) : { label: '', address: '', is_default: 0 };
    const count = db.scalar('SELECT count(*) FROM company_addresses');
    const actions = [{ label: t('Cancel'), kind: 'ghost' }];
    if (id && count > 1) actions.unshift({ label: t('Delete'), kind: 'danger', onClick: () => {
      db.tx(() => {
        db.run('DELETE FROM company_addresses WHERE id=?', [id]);
        if (a.is_default) db.run('UPDATE company_addresses SET is_default=1 WHERE id=(SELECT min(id) FROM company_addresses)');
      });
      ui.dispatch();
    } });
    actions.push({ label: t('Save'), kind: 'primary', onClick: (m) => {
      const f = ui.formData(m.body);
      if (!f.label || !f.address) throw new Buku.BukuError('required', t('Enter a label and the address.'));
      db.tx(() => {
        const makeDefault = f.is_default || !count;
        if (makeDefault) db.run('UPDATE company_addresses SET is_default=0');
        if (id) db.update('company_addresses', id, { label: f.label, address: f.address, is_default: makeDefault ? 1 : a.is_default, updated_at: now() });
        else db.insert('company_addresses', { label: f.label, address: f.address, is_default: makeDefault ? 1 : 0, created_at: now(), updated_at: now() });
      });
      ui.dispatch();
    } });
    ui.modal({
      title: id ? t('Edit address') : t('Add address'),
      body: ui.field(t('Label'), ui.input('label', a.label, { placeholder: 'GoWork Senayan City' })) +
        ui.field(t('Address'), '<textarea name="address" rows="4">' + h(a.address) + '</textarea>') +
        '<label class="check"><input type="checkbox" name="is_default"' + (a.is_default ? ' checked disabled' : '') + '> ' + h(t('Default address')) + '</label>',
      actions,
    });
  }

  // ---------- Sales team ----------
  function reps() {
    const db = Buku.db;
    const rows = db.all('SELECT * FROM sales_reps ORDER BY is_active DESC, code');
    ui.page({
      title: t('Sales team'),
      actions: '<button type="button" class="btn primary" id="new-rep">' + h(t('Add sales rep')) + '</button>',
      cls: 'narrow',
      body: '<p class="intro">' + h(t('Sales reps are printed on sales orders and invoices and used for sales reports.')) + '</p>' +
        (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Code')) + '</th><th>' + h(t('Name')) + '</th><th>' + h(t('Phone')) + '</th><th>' + h(t('Email')) + '</th><th></th></tr></thead><tbody>' +
          rows.map((r) => '<tr class="' + (r.is_active ? '' : 'inactive') + '"><td class="mono">' + h(r.code) + '</td><td>' + h(r.name) + (r.is_active ? '' : ' <span class="chip muted">' + h(t('Inactive')) + '</span>') + '</td><td>' + h(r.phone || '') + '</td><td>' + h(r.email || '') + '</td>' +
            '<td class="actions"><button type="button" class="btn small ghost" data-id="' + r.id + '">' + h(t('Edit')) + '</button></td></tr>').join('') + '</tbody></table></div>'
          : ui.empty(t('No sales reps yet.'))),
    });
    ui.$('#new-rep').addEventListener('click', () => editRep(null));
    ui.$$('[data-id]').forEach((b) => b.addEventListener('click', () => editRep(Number(b.dataset.id))));
  }

  function editRep(id) {
    const db = Buku.db;
    const r = id ? db.get('SELECT * FROM sales_reps WHERE id=?', [id]) : { code: '', name: '', phone: '', email: '', commission_rate: '', is_active: 1 };
    ui.modal({
      title: id ? t('Edit sales rep') : t('Add sales rep'),
      body: '<div class="grid2">' + ui.field(t('Code'), ui.input('code', r.code, { attrs: 'maxlength="6"' }), { hint: t('Short code, e.g. PU') }) + ui.field(t('Name'), ui.input('name', r.name)) +
        ui.field(t('Phone'), ui.input('phone', r.phone), { optional: true }) + ui.field(t('Email'), ui.input('email', r.email, { type: 'email' }), { optional: true }) +
        ui.field(t('Commission %'), ui.input('commission_rate', r.commission_rate, { placeholder: '0' }), { optional: true, hint: t('Used by the sales commission report later.') }) + '</div>' +
        (id ? '<label class="check"><input type="checkbox" name="is_active"' + (r.is_active ? ' checked' : '') + '> ' + h(t('Active')) + '</label>' : ''),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (m) => {
        const f = ui.formData(m.body);
        const code = (f.code || '').toUpperCase();
        if (!code || !f.name) throw new Buku.BukuError('required', t('Enter a code and a name.'));
        if (db.scalar('SELECT count(*) FROM sales_reps WHERE code=? AND id<>?', [code, id || 0])) throw new Buku.BukuError('duplicate_code', t('Code {code} is already used.', { code }));
        if (f.commission_rate && !/^\d+([.,]\d+)?$/.test(f.commission_rate)) throw new Buku.BukuError('invalid', t('Commission must be a number.'));
        const rec = { code, name: f.name, phone: f.phone || null, email: f.email || null, commission_rate: f.commission_rate ? f.commission_rate.replace(',', '.') : null, updated_at: now() };
        db.tx(() => {
          if (id) db.update('sales_reps', id, Object.assign(rec, { is_active: f.is_active ? 1 : 0 }));
          else db.insert('sales_reps', Object.assign(rec, { created_at: now() }));
        });
        ui.dispatch();
      } }],
    });
  }

  // ---------- Currencies & rates ----------
  function currencies(params, q) {
    const db = Buku.db;
    const curs = db.all('SELECT * FROM currencies ORDER BY CASE code WHEN \'IDR\' THEN 0 ELSE 1 END, code');
    const foreign = curs.filter((c) => c.code !== 'IDR' && c.is_enabled);
    const filterCur = q.currency || '';
    const rates = db.all('SELECT * FROM exchange_rates ' + (filterCur ? 'WHERE currency=? ' : '') + 'ORDER BY rate_date DESC, currency LIMIT 400', filterCur ? [filterCur] : []);
    const today = Buku.util.today();
    ui.page({
      title: t('Currencies & rates'),
      actions: '<button type="button" class="btn ghost" id="paste">' + h(t('Import rates (CSV)')) + '</button><button type="button" class="btn primary" id="add-rate">' + h(t('Add rate')) + '</button>',
      body:
        '<section class="panel"><header><h2>' + h(t('Currencies')) + '</h2></header>' +
        '<p class="hint">' + h(t('Reports are in IDR. Enabled currencies can be used in entries, bank accounts and documents.')) + '</p>' +
        '<div class="cur-grid">' + curs.map((c) => {
          const latest = c.code === 'IDR' ? null : Buku.fx.lookup(db, c.code, today);
          return '<label class="cur-card' + (c.is_enabled ? ' on' : '') + '"><input type="checkbox" data-cur="' + h(c.code) + '"' + (c.is_enabled ? ' checked' : '') + (c.code === 'IDR' ? ' disabled' : '') + '>' +
            '<strong>' + h(c.code) + '</strong><span>' + h(c.name) + '</span><span class="sub">' + (c.code === 'IDR' ? h(t('Base currency')) : latest ? h(t('{rate} on {date}', { rate: Buku.money.formatRate(latest.rate), date: ui.date(latest.rate_date) })) : h(t('No rate yet'))) + '</span></label>';
        }).join('') + '</div></section>' +
        '<section class="panel"><header><h2>' + h(t('Exchange rates')) + '</h2>' +
        '<nav class="tabs small">' + [['', t('All')]].concat(foreign.map((c) => [c.code, c.code])).map(([v, l]) => '<a class="' + (filterCur === v ? 'active' : '') + '" href="#/settings/currencies' + ui.qs({ currency: v }) + '">' + h(l) + '</a>').join('') + '</nav></header>' +
        '<p class="hint">' + h(t('Rupiah per 1 unit of foreign currency. Entries use the rate on their date, or the latest earlier one.')) + '</p>' +
        (rates.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Date')) + '</th><th>' + h(t('Currency')) + '</th><th class="num">' + h(t('IDR per unit')) + '</th><th>' + h(t('Source')) + '</th><th></th></tr></thead><tbody>' +
          rates.map((r) => '<tr><td>' + h(ui.date(r.rate_date)) + '</td><td>' + h(r.currency) + '</td><td class="num">' + h(Buku.money.formatRate(r.rate)) + '</td><td class="muted">' + h(r.source === 'csv' ? 'CSV' : t('Manual')) + '</td>' +
            '<td class="actions"><button type="button" class="btn small ghost" data-del="' + r.id + '">' + h(t('Delete')) + '</button></td></tr>').join('') + '</tbody></table></div>'
          : ui.empty(t('No exchange rates yet. Add one before recording USD or SGD transactions.'))) + '</section>',
    });
    ui.$$('[data-cur]').forEach((cb) => cb.addEventListener('change', async () => {
      const code = cb.dataset.cur;
      if (!cb.checked) {
        const used = db.scalar('SELECT count(*) FROM journal_lines WHERE currency=?', [code]);
        if (used && !(await ui.confirm(t('{code} is used in {n} posted line(s). Disabling only hides it for new entries. Continue?', { code, n: used })))) { cb.checked = true; return; }
      }
      db.tx(() => {
        db.run('UPDATE currencies SET is_enabled=? WHERE code=?', [cb.checked ? 1 : 0, code]);
        // Currency-locked accounts follow their currency (if they have no history to keep visible).
        if (cb.checked) db.run('UPDATE accounts SET is_active=1, updated_at=? WHERE currency=? AND is_active=0', [now(), code]);
        db.setting('enabled_currencies', db.all('SELECT code FROM currencies WHERE is_enabled=1').map((r) => r.code));
      });
      ui.dispatch();
    }));
    ui.$('#add-rate').addEventListener('click', () => {
      if (!foreign.length) return ui.toast(t('Enable USD or SGD first.'), 'error');
      ui.modal({
        title: t('Add exchange rate'),
        body: '<div class="grid2">' + ui.field(t('Date'), ui.input('date', today, { type: 'date' })) +
          ui.field(t('Currency'), ui.select('currency', foreign.map((c) => c.code), filterCur || foreign[0].code)) +
          ui.field(t('IDR per unit'), '<input name="rate" class="num" inputmode="decimal" placeholder="16.250">', { wide: true, hint: t('Example: 1 USD = 16.250 rupiah') }) + '</div>',
        actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save rate'), kind: 'primary', onClick: (m) => {
          const f = ui.formData(m.body);
          Buku.fx.set(db, f.currency, f.date, f.rate);
          ui.toast(t('Rate saved'));
          ui.dispatch();
        } }],
      });
    });
    ui.$('#paste').addEventListener('click', () => {
      ui.modal({
        title: t('Import rates (CSV)'),
        body: '<p>' + h(t('One rate per line: date, currency, rate. Dates as YYYY-MM-DD.')) + '</p><textarea name="csv" rows="8" placeholder="2026-10-01,USD,16250\n2026-10-01,SGD,12600.5"></textarea>',
        actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Import'), kind: 'primary', onClick: (m) => {
          const r = Buku.fx.importCsv(db, m.body.querySelector('[name=csv]').value);
          ui.toast(t('{n} rate(s) imported', { n: r.imported }) + (r.errors.length ? ' · ' + t('{n} line(s) skipped', { n: r.errors.length }) : ''), r.errors.length ? 'error' : 'ok');
          if (r.errors.length) console.warn('Rate import errors', r.errors);
          ui.dispatch();
        } }],
      });
    });
    ui.$$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await ui.confirm(t('Delete this rate? Posted entries keep the rate they used.'), { danger: true, okLabel: t('Delete') }))) return;
      Buku.fx.remove(db, Number(b.dataset.del));
      ui.dispatch();
    }));
  }

  // ---------- Taxes ----------
  const KIND_LABEL = { ppn_out: 'Output VAT (PPN Keluaran)', ppn_in: 'Input VAT (PPN Masukan)', pph23: 'PPh 23', pph21: 'PPh 21', pph42: 'PPh 4(2) final', pph25: 'PPh 25', none: 'No tax' };
  const DIR_LABEL = { none: '—', withheld_by_customer: 'Withheld by customer', withheld_by_us: 'Withheld by us', final: 'Final tax' };

  function taxes() {
    const db = Buku.db;
    const rows = db.all('SELECT t.*, a.code acc_code, a.name acc_name FROM taxes t LEFT JOIN accounts a ON a.id=t.account_id ORDER BY t.is_active DESC, t.kind, t.code');
    ui.page({
      title: t('Taxes'),
      actions: '<button type="button" class="btn primary" id="new-tax">' + h(t('Add tax')) + '</button>',
      body: '<div class="banner info"><div>' + h(t('Tax rates are settings, not code. Confirm them with your tax consultant; changing a rate never alters posted entries.')) + '</div></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Code')) + '</th><th>' + h(t('Name')) + '</th><th>' + h(t('Kind')) + '</th><th class="num">' + h(t('Rate')) + '</th><th class="num">' + h(t('Effective')) + '</th><th class="num">' + h(t('On 12.000.000')) + '</th><th>' + h(t('Account')) + '</th><th></th></tr></thead><tbody>' +
        rows.map((x) => '<tr class="' + (x.is_active ? '' : 'inactive') + '"><td class="mono">' + h(x.code) + '</td><td>' + h(x.name) + '<div class="sub">' + h(t('Printed as')) + ' “' + h(x.print_label || x.name) + '”</div></td>' +
          '<td>' + h(t(KIND_LABEL[x.kind])) + (x.direction !== 'none' ? '<div class="sub">' + h(t(DIR_LABEL[x.direction])) + '</div>' : '') + '</td>' +
          '<td class="num">' + h(x.rate) + '%' + (x.base_num !== x.base_den ? '<div class="sub">DPP ' + x.base_num + '/' + x.base_den + '</div>' : '') + '</td>' +
          '<td class="num">' + h(Buku.tax.effectiveRate(x).replace('.', L().lang === 'id' ? ',' : '.')) + '%</td>' +
          '<td class="num">' + h(ui.idr(Buku.tax.amount(12000000, x))) + '</td>' +
          '<td>' + (x.acc_code ? '<span class="mono">' + h(x.acc_code) + '</span> ' + h(x.acc_name) : '—') + '</td>' +
          '<td class="actions"><button type="button" class="btn small ghost" data-id="' + x.id + '">' + h(t('Edit')) + '</button></td></tr>').join('') + '</tbody></table></div>',
    });
    ui.$('#new-tax').addEventListener('click', () => editTax(null));
    ui.$$('[data-id]').forEach((b) => b.addEventListener('click', () => editTax(Number(b.dataset.id))));
  }

  function editTax(id) {
    const db = Buku.db;
    const x = id ? db.get('SELECT * FROM taxes WHERE id=?', [id]) : { code: '', name: '', print_label: '', kind: 'ppn_out', direction: 'none', rate: '', base_num: 1, base_den: 1, account_id: '', is_active: 1, notes: '' };
    const preview = (m) => {
      const f = ui.formData(m.body);
      let out = '';
      try {
        const tx = { rate: (f.rate || '0').replace(',', '.'), base_num: Number(f.base_num) || 1, base_den: Number(f.base_den) || 1 };
        out = t('On {base}: tax base {dpp}, tax {tax}', { base: ui.idr(12000000), dpp: ui.idr(Buku.tax.dpp(12000000, tx)), tax: ui.idr(Buku.tax.amount(12000000, tx)) });
      } catch (e) { out = t('Enter a valid rate.'); }
      m.body.querySelector('#tax-preview').textContent = out;
    };
    const m = ui.modal({
      title: id ? t('Edit tax {code}', { code: x.code }) : t('Add tax'),
      wide: true,
      body: '<div class="grid2">' +
        ui.field(t('Code'), ui.input('code', x.code, { attrs: id ? 'readonly' : '' })) +
        ui.field(t('Kind'), ui.select('kind', Object.keys(KIND_LABEL).map((k) => ({ value: k, label: t(KIND_LABEL[k]) })), x.kind)) +
        ui.field(t('Name'), ui.input('name', x.name), { wide: true }) +
        ui.field(t('Printed as'), ui.input('print_label', x.print_label, { placeholder: 'VAT – 11%' }), { hint: t('The label on invoices.') }) +
        ui.field(t('Withholding'), ui.select('direction', Object.keys(DIR_LABEL).map((k) => ({ value: k, label: t(DIR_LABEL[k]) })), x.direction)) +
        ui.field(t('Rate %'), ui.input('rate', x.rate, { attrs: 'inputmode="decimal"' })) +
        '<div class="field"><span class="label">' + h(t('Tax base (DPP) fraction')) + '</span><div class="frac">' + ui.input('base_num', x.base_num, { type: 'number', attrs: 'min="1"' }) + '<span>/</span>' + ui.input('base_den', x.base_den, { type: 'number', attrs: 'min="1"' }) + '</div><span class="hint">' + h(t('11/12 for PPN on “DPP nilai lain”; 1/1 for the full amount.')) + '</span></div>' +
        ui.field(t('Posts to account'), ui.select('account_id', ui.accountOptions({ empty: t('— none —') }), x.account_id || '')) +
        '</div><p class="preview" id="tax-preview"></p>' +
        ui.field(t('Notes'), '<textarea name="notes" rows="2">' + h(x.notes || '') + '</textarea>', { optional: true }) +
        (id ? '<label class="check"><input type="checkbox" name="is_active"' + (x.is_active ? ' checked' : '') + '> ' + h(t('Active')) + '</label>' : ''),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (mm) => {
        const f = ui.formData(mm.body);
        const code = (f.code || '').toUpperCase();
        if (!code || !f.name) throw new Buku.BukuError('required', t('Enter a code and a name.'));
        const rate = (f.rate || '0').replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(rate) || Number(rate) > 100) throw new Buku.BukuError('invalid', t('Enter a rate between 0 and 100.'));
        const num = parseInt(f.base_num, 10), den = parseInt(f.base_den, 10);
        if (!(num > 0) || !(den > 0)) throw new Buku.BukuError('invalid', t('The tax base fraction needs two whole numbers above zero.'));
        if (!id && db.scalar('SELECT 1 FROM taxes WHERE code=?', [code])) throw new Buku.BukuError('duplicate_code', t('Code {code} is already used.', { code }));
        const rec = { name: f.name, print_label: f.print_label || null, kind: f.kind, direction: f.direction, rate, base_num: num, base_den: den, account_id: f.account_id ? Number(f.account_id) : null, notes: f.notes || null, updated_at: now() };
        db.tx(() => {
          if (id) { db.update('taxes', id, Object.assign(rec, { is_active: f.is_active ? 1 : 0 })); Buku.posting.audit(db, 'update', 'taxes', id, code + ' ' + rate + '%'); }
          else db.insert('taxes', Object.assign(rec, { code, created_at: now() }));
        });
        ui.dispatch();
      } }],
    });
    m.body.addEventListener('input', () => preview(m));
    preview(m);
  }

  // ---------- Numbering ----------
  const SEQ_LABEL = {
    journal: 'Journal entries', opening: 'Opening balances', quotation: 'Quotations', sales_order: 'Sales orders', invoice: 'Invoices',
    credit_note: 'Credit notes', receipt: 'Receipts (kwitansi)', payment_in: 'Payments received', payment_out: 'Payments made', bill: 'Bills', deal: 'Property deals',
  };
  const RESET_LABEL = { never: 'Never (keeps counting)', yearly: 'Every year', monthly: 'Every month' };

  function numbering() {
    const db = Buku.db;
    const rows = db.all('SELECT * FROM number_sequences');
    const order = Object.keys(SEQ_LABEL);
    rows.sort((a, b) => order.indexOf(a.doc_type) - order.indexOf(b.doc_type));
    const today = Buku.util.today();
    ui.page({
      title: t('Numbering'),
      cls: 'narrow',
      body: '<p class="intro">' + h(t('Patterns use {YYYY} year, {YY} short year, {MM} month, {####} counter and {SALES} sales rep code. Set the next number to continue from your current documents.')) + '</p>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>' + h(t('Document')) + '</th><th>' + h(t('Pattern')) + '</th><th class="num">' + h(t('Next')) + '</th><th>' + h(t('Restart')) + '</th><th>' + h(t('Next number looks like')) + '</th><th></th></tr></thead><tbody>' +
        rows.map((s) => '<tr><td>' + h(t(SEQ_LABEL[s.doc_type] || s.doc_type)) + '</td><td class="mono">' + h(s.pattern) + '</td><td class="num">' + s.next_number + '</td><td>' + h(t(RESET_LABEL[s.reset])) + '</td>' +
          '<td class="mono">' + h(Buku.numbering.peek(db, s.doc_type, today, { sales: 'PU' })) + '</td><td class="actions"><button type="button" class="btn small ghost" data-type="' + h(s.doc_type) + '">' + h(t('Edit')) + '</button></td></tr>').join('') +
        '</tbody></table></div>',
    });
    ui.$$('[data-type]').forEach((b) => b.addEventListener('click', () => {
      const s = db.get('SELECT * FROM number_sequences WHERE doc_type=?', [b.dataset.type]);
      const m = ui.modal({
        title: t('Numbering: {doc}', { doc: t(SEQ_LABEL[s.doc_type] || s.doc_type) }),
        body: ui.field(t('Pattern'), ui.input('pattern', s.pattern)) +
          '<div class="grid2">' + ui.field(t('Next number'), ui.input('next_number', s.next_number, { type: 'number', attrs: 'min="1"' })) +
          ui.field(t('Restart counter'), ui.select('reset', Object.keys(RESET_LABEL).map((k) => ({ value: k, label: t(RESET_LABEL[k]) })), s.reset)) + '</div>' +
          '<p class="preview" id="seq-preview"></p>',
        actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Save'), kind: 'primary', onClick: (mm) => {
          const f = ui.formData(mm.body);
          Buku.numbering.validatePattern(f.pattern);
          const n = parseInt(f.next_number, 10);
          if (!(n >= 1)) throw new Buku.BukuError('invalid', t('The next number must be 1 or more.'));
          db.tx(() => db.run('UPDATE number_sequences SET pattern=?, next_number=?, reset=?, last_period=? WHERE doc_type=?', [f.pattern, n, f.reset, Buku.numbering.periodKey(f.reset, today), s.doc_type]));
          ui.dispatch();
        } }],
      });
      const prev = () => {
        const f = ui.formData(m.body);
        try { Buku.numbering.validatePattern(f.pattern); m.body.querySelector('#seq-preview').textContent = t('Next: {n}', { n: Buku.numbering.render(f.pattern, parseInt(f.next_number, 10) || 1, today, { sales: 'PU' }) }); }
        catch (e) { m.body.querySelector('#seq-preview').textContent = ui.errorText(e); }
      };
      m.body.addEventListener('input', prev);
      prev();
    }));
  }

  // ---------- Data & backup ----------
  async function data() {
    const db = Buku.db;
    const st = Buku.store.status();
    const backups = await Buku.store.listBackups();
    const counts = {
      entries: db.scalar("SELECT count(*) FROM journal_entries WHERE status='posted'"),
      drafts: db.scalar("SELECT count(*) FROM journal_entries WHERE status='draft'"),
      accounts: db.scalar('SELECT count(*) FROM accounts'),
      size: db.export().length,
    };
    const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    const reminder = db.setting('backup_reminder_days') || 7;
    const canInPlace = Buku.store.canSaveInPlace();
    ui.page({
      title: t('Data & backup'),
      cls: 'narrow',
      body:
        '<section class="panel"><header><h2>' + h(t('Company file')) + '</h2></header>' +
        '<dl class="facts">' +
        '<div><dt>' + h(t('File')) + '</dt><dd>' + h(st.fileName || t('Not saved to a file yet')) + '</dd></div>' +
        '<div><dt>' + h(t('Last saved to file')) + '</dt><dd>' + h(st.lastFileSave ? ui.date(st.lastFileSave.slice(0, 10)) + ' ' + st.lastFileSave.slice(11, 16) + ' UTC' : '—') + '</dd></div>' +
        '<div><dt>' + h(t('Size')) + '</dt><dd>' + h(fmtSize(counts.size)) + '</dd></div>' +
        '<div><dt>' + h(t('Contents')) + '</dt><dd>' + h(t('{e} posted entries, {d} drafts, {a} accounts', { e: counts.entries, d: counts.drafts, a: counts.accounts })) + '</dd></div>' +
        '</dl>' +
        '<p class="hint">' + h(canInPlace ? t('This browser can save straight back to the same file.') : t('This browser downloads a new copy each time you save. Chrome or Edge can save back to the same file.')) + '</p>' +
        '<div class="button-row"><button type="button" class="btn primary" id="save">' + h(t('Save to file')) + '</button><button type="button" class="btn" id="saveas">' + h(t('Save as…')) + '</button>' +
        '<button type="button" class="btn" id="backup">' + h(t('Download backup copy')) + '</button><button type="button" class="btn ghost" id="open">' + h(t('Open another company file')) + '</button></div>' +
        ui.field(t('Remind me to save to a file after'), '<span class="inline">' + ui.input('reminder', reminder, { type: 'number', attrs: 'min="1" max="90" style="width:5em"' }) + ' ' + h(t('days')) + '</span>') +
        '</section>' +
        '<section class="panel"><header><h2>' + h(t('Data check')) + '</h2><button type="button" class="btn small" id="check">' + h(t('Run check')) + '</button></header>' +
        '<p class="hint">' + h(t('Confirms every entry balances, accounts are used correctly and the file is not damaged.')) + '</p><div id="check-out"></div></section>' +
        '<section class="panel"><header><h2>' + h(t('Screen check')) + '</h2><button type="button" class="btn small" id="screencheck">' + h(t('Run screen check')) + '</button></header>' +
        '<p class="hint">' + h(t('Opens every screen once and lists any that fail to load. Nothing is changed.')) + '</p></section>' +
        '<section class="panel"><header><h2>' + h(t('Automatic browser backups')) + '</h2></header>' +
        '<p class="hint">' + h(t('Accu-Z Accounting keeps a few recent snapshots in this browser, plus one before every file upgrade. They are not a substitute for saving files.')) + '</p>' +
        (backups.length ? '<ul class="plain-list">' + backups.map((b) => '<li><div>' + h(ui.date(b.at.slice(0, 10))) + ' ' + h(b.at.slice(11, 16)) + ' UTC <span class="sub">' + h(b.reason === 'auto' ? t('Automatic') : t('Before upgrade')) + ' · ' + h(fmtSize(b.size)) + '</span></div>' +
          '<span><button type="button" class="btn small ghost" data-dl="' + b.id + '">' + h(t('Download')) + '</button><button type="button" class="btn small ghost" data-restore="' + b.id + '">' + h(t('Restore')) + '</button></span></li>').join('') + '</ul>' : ui.empty(t('No snapshots yet.'))) +
        '</section>' +
        '<section class="panel danger-zone"><header><h2>' + h(t('Close or remove')) + '</h2></header>' +
        '<div class="button-row"><button type="button" class="btn" id="close">' + h(t('Close company')) + '</button><button type="button" class="btn danger" id="remove">' + h(t('Remove from this browser')) + '</button></div>' +
        '<p class="hint">' + h(t('Removing deletes the browser copy and its snapshots. Files you saved are not touched.')) + '</p></section>',
    });
    ui.$('#save').addEventListener('click', async () => { await Buku.app.saveFile(false); data(); });
    ui.$('#saveas').addEventListener('click', async () => { await Buku.app.saveFile(true); data(); });
    ui.$('#backup').addEventListener('click', () => { Buku.store.downloadBackup(); ui.toast(t('Backup downloaded')); });
    ui.$('#open').addEventListener('click', () => Buku.start.openFile());
    ui.$('[name=reminder]').addEventListener('change', (e) => {
      const n = Math.min(90, Math.max(1, parseInt(e.target.value, 10) || 7));
      db.tx(() => db.setting('backup_reminder_days', n));
      ui.toast(t('Saved'));
    });
    ui.$('#screencheck').addEventListener('click', () => Buku.selfCheck.run());
    ui.$('#check').addEventListener('click', () => {
      const issues = Buku.ledger.integrity(db);
      ui.$('#check-out').innerHTML = issues.length
        ? '<ul class="issues">' + issues.map((i) => '<li class="' + i.level + '">' + h(i.message) + '</li>').join('') + '</ul>'
        : '<p class="check-line ok">' + h(t('Everything checks out.')) + '</p>';
    });
    ui.$$('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
      const rec = await Buku.store.getBackup(Number(b.dataset.dl));
      Buku.util.download('buku-snapshot-' + rec.at.slice(0, 16).replace(/[:T]/g, '-') + '.sqlite', new Blob([rec.bytes]));
    }));
    ui.$$('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await ui.confirm(t('Replace the current books with this snapshot? Download a backup first if you are unsure.'), { danger: true, okLabel: t('Restore') }))) return;
      try {
        const rec = await Buku.store.getBackup(Number(b.dataset.restore));
        const name = Buku.store.state.fileName;
        await Buku.store.openBytes(rec.bytes, { fileName: name, force: true, fileDirty: true });
        Buku.app.renderNav();
        ui.toast(t('Snapshot restored'));
        location.hash = '#/home';
      } catch (e) { ui.showError(e); }
    }));
    ui.$('#close').addEventListener('click', () => Buku.app.closeCompany());
    ui.$('#remove').addEventListener('click', async () => {
      const name = db.scalar('SELECT name FROM company WHERE id=1');
      const ok = await ui.confirm(t('Remove “{name}” from this browser? Copies saved as files are not affected.', { name }), { danger: true, okLabel: t('Remove') });
      if (!ok) return;
      const id = Buku.store.state.fileId;
      await Buku.store.close();
      await Buku.store.removeCompany(id);
      Buku.app.renderNav();
      location.hash = '#/';
    });
  }

  ui.route('/settings/company', company);
  ui.route('/settings/reps', reps);
  ui.route('/settings/currencies', currencies);
  ui.route('/settings/taxes', taxes);
  ui.route('/settings/numbering', numbering);
  ui.route('/settings/data', data);
  ui.route('/settings', () => { location.hash = '#/settings/company'; });
})();
