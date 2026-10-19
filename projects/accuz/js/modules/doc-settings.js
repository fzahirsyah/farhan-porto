/* Buku — document settings: templates (list + editor with live preview), bank details printed on documents,
   SaaS revenue options. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;
  const U2 = () => Buku.ui2;
  const now = () => Buku.util.nowIso();
  const KIND_LABEL = { all: 'All documents', sales_order: 'Sales order', invoice: 'Invoice', credit_note: 'Credit note', receipt: 'Kwitansi', statement: 'Statement' };
  const LAYOUT_LABEL = { milikirumah: 'Accu-Z Standard', classic: 'Classic', modern: 'Modern', compact: 'Compact' };

  function page() {
    const db = Buku.db;
    const tpls = db.all('SELECT * FROM doc_templates ORDER BY CASE doc_type WHEN \'all\' THEN 1 ELSE 0 END, doc_type, name');
    const banks = db.setting('bank_details') || [];
    const deferred = db.setting('deferred_revenue') !== false;
    const win = db.setting('renewal_window_days') || 30;
    ui.page({
      title: t('Documents & templates'),
      cls: 'narrow',
      body:
        '<section class="panel"><header><h2>' + h(t('Templates')) + '</h2><button type="button" class="btn small" id="new-tpl">' + h(t('New template')) + '</button></header>' +
        '<p class="hint">' + h(t('Each document uses its own template, else the customer’s, else the default for its type.')) + '</p>' +
        '<table class="data"><tbody>' + tpls.map((x) => '<tr><td><strong>' + h(x.name) + '</strong><div class="sub">' + h(t(KIND_LABEL[x.doc_type] || x.doc_type)) + ' · ' + h(LAYOUT_LABEL[x.layout] || x.layout) + '</div></td>' +
          '<td>' + (x.is_default ? '<span class="chip ok">' + h(t('Default')) + '</span>' : x.doc_type !== 'all' ? '<button type="button" class="btn small ghost" data-def="' + x.id + '">' + h(t('Make default')) + '</button>' : '') + '</td>' +
          '<td class="actions"><a class="btn small" href="#/settings/templates/' + x.id + '">' + h(t('Edit')) + '</a> <button type="button" class="btn small ghost" data-dup="' + x.id + '">' + h(t('Duplicate')) + '</button></td></tr>').join('') + '</tbody></table></section>' +
        '<section class="panel"><header><h2>' + h(t('Bank details on documents')) + '</h2><button type="button" class="btn small" id="add-bank">' + h(t('Add bank account')) + '</button></header>' +
        '<p class="hint">' + h(t('Printed in the payment box. With “match currency” on, a USD invoice shows only USD accounts.')) + '</p>' +
        (banks.length ? '<table class="data"><tbody>' + banks.map((b, i) => '<tr><td><strong>' + h(b.bank) + '</strong><div class="sub">' + h(b.account_name) + ' · ' + h(b.account_no) + (b.swift ? ' · SWIFT ' + h(b.swift) : '') + '</div></td><td>' + h(b.currency || t('Any')) + '</td><td class="actions"><button type="button" class="btn small ghost" data-bank="' + i + '">' + h(t('Edit')) + '</button></td></tr>').join('') + '</tbody></table>' : ui.empty(t('No bank details yet. Invoices will not show where to pay.'))) + '</section>' +
        '<section class="panel"><header><h2>' + h(t('SaaS subscriptions')) + '</h2></header>' +
        '<label class="check"><input type="checkbox" id="deferred"' + (deferred ? ' checked' : '') + '> ' + h(t('Defer SaaS revenue and recognize it month by month (recommended)')) + '</label>' +
        '<p class="hint">' + h(t('When off, SaaS invoices go straight to revenue. Existing invoices are not changed.')) + '</p>' +
        ui.field(t('Show renewals this many days before the end'), '<span class="inline">' + ui.input('win', win, { type: 'number', attrs: 'min="1" max="180" style="width:6em"' }) + ' ' + h(t('days')) + '</span>') + '</section>',
    });
    ui.$('#new-tpl').addEventListener('click', () => newTemplate());
    ui.$$('[data-def]').forEach((b) => b.addEventListener('click', () => {
      const x = db.get('SELECT * FROM doc_templates WHERE id=?', [Number(b.dataset.def)]);
      db.tx(() => { db.run('UPDATE doc_templates SET is_default=0 WHERE doc_type=?', [x.doc_type]); db.run('UPDATE doc_templates SET is_default=1 WHERE id=?', [x.id]); });
      ui.dispatch();
    }));
    ui.$$('[data-dup]').forEach((b) => b.addEventListener('click', () => {
      const x = db.get('SELECT * FROM doc_templates WHERE id=?', [Number(b.dataset.dup)]);
      const id = db.tx(() => db.insert('doc_templates', { name: x.name + ' ' + t('(copy)'), doc_type: x.doc_type, layout: x.layout, settings: x.settings, is_default: 0, created_at: now(), updated_at: now() }));
      location.hash = '#/settings/templates/' + id;
    }));
    ui.$('#add-bank').addEventListener('click', () => bankModal(null));
    ui.$$('[data-bank]').forEach((b) => b.addEventListener('click', () => bankModal(Number(b.dataset.bank))));
    ui.$('#deferred').addEventListener('change', (e) => { db.tx(() => db.setting('deferred_revenue', e.target.checked)); ui.toast(t('Saved')); });
    ui.$('[name=win]').addEventListener('change', (e) => { db.tx(() => db.setting('renewal_window_days', Math.min(180, Math.max(1, parseInt(e.target.value, 10) || 30)))); ui.toast(t('Saved')); });
  }

  function bankModal(i) {
    const db = Buku.db;
    const list = db.setting('bank_details') || [];
    const b = i === null ? { account_name: db.scalar('SELECT name FROM company WHERE id=1'), bank: '', account_no: '', swift: '', currency: 'IDR' } : list[i];
    const actions = [{ label: t('Cancel'), kind: 'ghost' }];
    if (i !== null) actions.unshift({ label: t('Delete'), kind: 'danger', onClick: () => { list.splice(i, 1); db.tx(() => db.setting('bank_details', list)); ui.dispatch(); } });
    actions.push({ label: t('Save'), kind: 'primary', onClick: (m) => {
      const f = ui.formData(m.body);
      if (!f.bank || !f.account_no) throw new Buku.BukuError('required', t('Enter the bank and account number.'));
      const rec = { account_name: f.account_name, bank: f.bank, account_no: f.account_no, swift: f.swift, currency: f.currency || null };
      if (i === null) list.push(rec); else list[i] = rec;
      db.tx(() => db.setting('bank_details', list));
      ui.dispatch();
    } });
    ui.modal({
      title: i === null ? t('Add bank account') : t('Edit bank account'),
      body: '<div class="grid2">' + ui.field(t('Account name'), ui.input('account_name', b.account_name), { wide: true }) + ui.field(t('Bank / branch'), ui.input('bank', b.bank, { placeholder: 'Bank BCA – Cabang Thamrin' }), { wide: true }) +
        ui.field(t('Account no.'), ui.input('account_no', b.account_no)) + ui.field('SWIFT/BIC', ui.input('swift', b.swift, { placeholder: 'CENAIDJA' }), { optional: true }) +
        ui.field(t('Currency'), ui.select('currency', [{ value: '', label: t('Any') }].concat(U2().currencyOptions()), b.currency || '')) + '</div>',
      actions,
    });
  }

  function newTemplate() {
    ui.modal({
      title: t('New template'),
      body: ui.field(t('Name'), ui.input('name', '')) + ui.field(t('Layout'), ui.select('layout', Object.keys(LAYOUT_LABEL).map((k) => ({ value: k, label: LAYOUT_LABEL[k] })), 'milikirumah')) +
        ui.field(t('For'), ui.select('doc_type', Object.keys(KIND_LABEL).map((k) => ({ value: k, label: t(KIND_LABEL[k]) })), 'invoice')),
      actions: [{ label: t('Cancel'), kind: 'ghost' }, { label: t('Create'), kind: 'primary', onClick: (m) => {
        const f = ui.formData(m.body);
        if (!f.name) throw new Buku.BukuError('required', t('Enter the name.'));
        const id = Buku.db.tx(() => Buku.db.insert('doc_templates', { name: f.name, doc_type: f.doc_type, layout: f.layout, settings: JSON.stringify(Buku.templates.defaultSettings(f.layout)), is_default: 0, created_at: now(), updated_at: now() }));
        location.hash = '#/settings/templates/' + id;
      } }],
    });
  }

  // ---------------- Editor ----------------
  function editor(params, q) {
    const db = Buku.db;
    const row = db.get('SELECT * FROM doc_templates WHERE id=?', [Number(params.id)]);
    if (!row) throw new Buku.BukuError('not_found', t('Template not found.'));
    const T = Buku.templates;
    const s = T.resolve(JSON.parse(row.settings || '{}'), row.layout);
    let kind = q.kind || (row.doc_type === 'all' ? 'invoice' : row.doc_type);
    let realDoc = q.doc ? Number(q.doc) : null;
    let dirty = false;
    const docKinds = ['sales_order', 'invoice', 'credit_note'];

    ui.page({
      title: t('Template') + ' · ' + row.name,
      cls: 'tpl-editor-page',
      actions: '<a class="btn ghost" href="#/settings/templates">' + h(t('Back')) + '</a><button type="button" class="btn ghost danger-text" id="del">' + h(t('Delete')) + '</button><button type="button" class="btn primary" id="save">' + h(t('Save template')) + '</button>',
      body: '<div class="tpl-editor"><form id="tf" class="tpl-controls"></form><div class="tpl-preview"><div class="tpl-pv-bar">' +
        ui.select('pv_kind', [['sales_order', 'Sales order'], ['invoice', 'Invoice'], ['credit_note', 'Credit note'], ['receipt', 'Kwitansi'], ['statement', 'Statement']].map(([v, l]) => ({ value: v, label: t('Preview:') + ' ' + t(l) })), kind) +
        '<span id="pv-doc"></span></div><div class="doc-stage" id="pv"></div></div></div>',
    });

    const form = ui.$('#tf');
    const sec = (title, body, open) => '<details class="tpl-sec"' + (open ? ' open' : '') + '><summary>' + h(title) + '</summary><div class="tpl-sec-body">' + body + '</div></details>';
    const chk = (name, label, val) => '<label class="check"><input type="checkbox" name="' + name + '"' + (val ? ' checked' : '') + '> ' + h(label) + '</label>';
    const imgField = (name, label, val) => '<div class="field"><span class="label">' + h(label) + '</span><div class="img-pick">' + (val ? '<img src="' + h(val) + '" alt="">' : '<span class="sub">' + h(t('None')) + '</span>') +
      '<label class="btn small">' + h(t('Upload')) + '<input type="file" accept="image/*" data-img="' + name + '" hidden></label>' + (val ? '<button type="button" class="btn small ghost" data-clear="' + name + '">' + h(t('Remove')) + '</button>' : '') + '</div></div>';

    function listEditor(key, items) {
      return '<ul class="col-list" data-list="' + key + '">' + items.map((c, i) => '<li data-i="' + i + '"><input type="checkbox" data-k="show"' + (c.show ? ' checked' : '') + ' aria-label="' + h(t('Show')) + '">' +
        '<input data-k="label" value="' + h(c.label) + '" aria-label="' + h(t('Label')) + '"><span class="sub">' + h(c.key) + '</span><button type="button" class="icon-btn" data-move="-1" aria-label="' + h(t('Move up')) + '">↑</button><button type="button" class="icon-btn" data-move="1" aria-label="' + h(t('Move down')) + '">↓</button></li>').join('') + '</ul>';
    }

    function renderControls() {
      const isDoc = docKinds.includes(kind);
      const sig = s.signature[kind] || s.signature.invoice;
      const blocks = s.blocks[kind] || {};
      const labels = s.labels[kind] || s.labels.invoice;
      form.innerHTML =
        sec(t('General'), '<div class="grid2">' + ui.field(t('Name'), ui.input('tpl_name', row.name), { wide: true }) +
          ui.field(t('For'), ui.select('tpl_type', Object.keys(KIND_LABEL).map((k) => ({ value: k, label: t(KIND_LABEL[k]) })), row.doc_type)) +
          ui.field(t('Layout'), ui.select('layout', Object.keys(LAYOUT_LABEL).map((k) => ({ value: k, label: LAYOUT_LABEL[k] })), s.layout)) +
          ui.field(t('Document language'), ui.select('language', [{ value: 'en', label: 'English' }, { value: 'id', label: 'Bahasa Indonesia' }], s.language)) +
          ui.field(t('Paper'), ui.select('paper', ['A4', 'Letter', 'A5'], s.paper)) + ui.field(t('Margins'), ui.select('margins', [{ value: 'narrow', label: t('Narrow') }, { value: 'normal', label: t('Normal') }, { value: 'wide', label: t('Wide') }], s.margins)) +
          ui.field(t('Font'), ui.select('font', [{ value: 'sans', label: 'Arial' }, { value: 'serif', label: 'Georgia' }, { value: 'humanist', label: 'Segoe / Trebuchet' }], s.font)) +
          ui.field(t('Text size (pt)'), ui.input('fontSize', s.fontSize, { type: 'number', attrs: 'min="6" max="12" step="0.5"' })) +
          ui.field(t('Accent colour'), '<input type="color" name="accent" value="' + h(s.accent) + '">') + ui.field(t('Logo size'), ui.select('logoSize', [{ value: 's', label: t('Small') }, { value: 'm', label: t('Medium') }, { value: 'l', label: t('Large') }], s.logoSize)) +
          '</div>' + chk('showTitle', t('Show the document title (INVOICE, SALES ORDER…)'), s.showTitle) +
          (s.showTitle ? ui.field(t('Title for this document'), ui.input('title_' + kind, s.titles[kind] || '')) : '') +
          chk('showSocials', t('Show website and social accounts in the header'), s.showSocials) + chk('showNpwp', t('Show our NPWP'), s.showNpwp) + chk('watermark', t('DRAFT / PAID / VOID watermark'), s.watermark) +
          imgField('background', t('Background image'), s.background) + (s.background ? ui.field(t('Background strength'), '<input type="range" name="backgroundOpacity" min="0.03" max="0.5" step="0.01" value="' + s.backgroundOpacity + '">') : '') +
          '<p class="hint">' + h(t('The logo comes from Settings → Company.')) + '</p>', true) +
        (isDoc ? sec(t('Information box'), listEditor('info', s.info[kind])) : '') +
        (isDoc || kind === 'statement' ? sec(t('Customer box'), listEditor('party', s.party)) : '') +
        (isDoc ? sec(t('Line columns'), listEditor('columns', s.columns[kind]) + ui.field(t('Minimum table rows'), ui.input('minRows', s.minRows, { type: 'number', attrs: 'min="0" max="10"' })) +
          ui.field(t('Period format (Start/End)'), ui.select('periodFormat', [{ value: 'month', label: 'Oct 2026' }, { value: 'monthLong', label: 'October 2026' }, { value: 'short', label: '01 Oct 2026' }, { value: 'numeric', label: '01/10/2026' }], s.periodFormat))) : '') +
        (isDoc ? sec(t('Totals'), '<div class="grid2">' + ui.field(t('Subtotal label'), ui.input('label_subtotal', labels.subtotal)) + ui.field(t('Total label'), ui.input('label_total', labels.total)) + ui.field(t('Note label'), ui.input('label_note', labels.note)) +
          ui.field(t('Date format'), ui.select('dateFormat', [{ value: 'short', label: '12 Oct 2026' }, { value: 'long', label: '12 October 2026' }, { value: 'numeric', label: '12/10/2026' }, { value: 'iso', label: '2026-10-12' }], s.dateFormat)) + '</div>' +
          chk('currencyInAmounts', t('Currency code in every amount (IDR 2.000.000)'), s.currencyInAmounts) + chk('zeroAsDash', t('Show zero as “IDR -”'), s.zeroAsDash) + chk('showDiscountLine', t('Show subtotal and discount when discounted'), s.showDiscountLine) +
          chk('showDpp', t('Show DPP (tax base) line'), s.showDpp) + chk('showPph23Info', t('Show the PPh 23 the customer will withhold'), s.showPph23Info) + chk('showIdrEquivalent', t('Show IDR equivalent on foreign-currency documents'), s.showIdrEquivalent) +
          chk('showTerbilang', t('Amount in words (terbilang)'), s.showTerbilang) + chk('showPaid', t('Show paid amount and balance on invoices'), s.showPaid)) : '') +
        sec(t('Text blocks'), '<p class="hint">' + h(t('**bold**, *italic*, lines starting with • become bullets. Placeholders: {company}, {customer}, {total}, {due_date}, {finance_phone}, {period}, {invoice_ref}.')) + '</p>' +
          [['intro', t('Opening paragraph')], ['terms', t('Terms (after the table)')], ['notes', t('Notes (Catatan)')], ['legal', t('Legal clause (boxed)')], ['payment', t('Payment instructions')]]
            .map(([k, l]) => ui.field(l, '<textarea name="block_' + k + '" rows="' + (k === 'notes' ? 6 : 3) + '">' + h(blocks[k] || '') + '</textarea>')).join('')) +
        (kind !== 'statement' ? sec(t('Signatures & stamp'), chk('sig_ours', t('Our signature block'), sig.ours) + (kind === 'sales_order' || kind === 'invoice' ? chk('sig_theirs', t('Customer signature block'), sig.theirs) : '') +
          ui.field(t('Label above signatures'), ui.input('sig_label', sig.label)) + chk('sig_date', t('Show date under our signature'), sig.showDate) + chk('sig_stamp', t('“Company Stamp Required” under our signature'), sig.stampRequired) +
          ui.field(t('Signatory name'), ui.input('signatoryName', s.signatoryName, { placeholder: kind === 'sales_order' ? t('Empty = the sales rep') : 'Denny' })) +
          imgField('signatureImage', t('Signature image'), s.signatureImage) + imgField('stampImage', t('Company stamp / e-meterai image'), s.stampImage) + chk('emeterai', t('Leave an e-meterai box when there is no stamp image'), s.emeterai)) : '') +
        sec(t('Payment box & footer'), chk('showPayment', t('Show bank details'), s.showPayment) + chk('matchBankCurrency', t('Only bank accounts in the document currency'), s.matchBankCurrency) +
          chk('footerBand', t('Coloured footer band'), s.footerBand) + ui.field(t('Footer text'), ui.input('footerText', s.footerText), { hint: t('{address} prints the company address.') }) + '<p class="hint"><a href="#/settings/templates">' + h(t('Bank details are set on the Documents page.')) + '</a></p>');
    }

    function readControls() {
      const f = ui.formData(form);
      const num = (v, d) => (isNaN(Number(v)) || v === '' ? d : Number(v));
      Object.assign(s, {
        layout: f.layout, language: f.language, paper: f.paper, margins: f.margins, font: f.font, fontSize: num(f.fontSize, s.fontSize), accent: f.accent, logoSize: f.logoSize,
        showTitle: f.showTitle, showSocials: f.showSocials, showNpwp: f.showNpwp, watermark: f.watermark,
      });
      if (f.backgroundOpacity !== undefined) s.backgroundOpacity = Number(f.backgroundOpacity);
      if (f['title_' + kind] !== undefined) s.titles[kind] = f['title_' + kind];
      ['minRows'].forEach((k) => { if (f[k] !== undefined) s[k] = Math.max(0, parseInt(f[k], 10) || 0); });
      ['periodFormat', 'dateFormat', 'footerText', 'signatoryName'].forEach((k) => { if (f[k] !== undefined) s[k] = f[k]; });
      ['currencyInAmounts', 'zeroAsDash', 'showDiscountLine', 'showDpp', 'showPph23Info', 'showIdrEquivalent', 'showTerbilang', 'showPaid', 'emeterai', 'showPayment', 'matchBankCurrency', 'footerBand']
        .forEach((k) => { if (form.querySelector('[name=' + k + ']')) s[k] = !!f[k]; });
      if (f.label_subtotal !== undefined && s.labels[kind]) { s.labels[kind].subtotal = f.label_subtotal; s.labels[kind].total = f.label_total; s.labels[kind].note = f.label_note; }
      if (form.querySelector('[name=block_intro]')) {
        s.blocks[kind] = s.blocks[kind] || {};
        ['intro', 'terms', 'notes', 'legal', 'payment'].forEach((k) => { s.blocks[kind][k] = f['block_' + k] || ''; });
      }
      if (form.querySelector('[name=sig_ours]') && s.signature[kind]) {
        Object.assign(s.signature[kind], { ours: f.sig_ours, theirs: !!f.sig_theirs, label: f.sig_label, showDate: f.sig_date, stampRequired: f.sig_stamp });
      }
      ui.$$('[data-list]', form).forEach((ul) => {
        const items = ui.$$('li', ul).map((li) => ({ i: Number(li.dataset.i), show: li.querySelector('[data-k=show]').checked, label: li.querySelector('[data-k=label]').value }));
        const key = ul.dataset.list;
        const src = key === 'party' ? s.party : s[key][kind];
        const next = items.map((x) => Object.assign({}, src[x.i], { show: x.show, label: x.label }));
        if (key === 'party') s.party = next; else s[key][kind] = next;
      });
    }

    const preview = Buku.util.debounce(() => {
      const box = ui.$('#pv');
      if (!box) return;
      let html;
      try {
        if (realDoc && docKinds.includes(kind)) html = Buku.templates.renderDocument(db, realDoc, { settings: s });
        else html = Buku.templates.renderSample(db, kind, s);
      } catch (e) { html = '<div class="banner bad"><div>' + h(ui.errorText(e)) + '</div></div>'; }
      U2().showPaper(box, html);
    }, 150);

    function docPicker() {
      const slot = ui.$('#pv-doc');
      if (!docKinds.includes(kind)) { slot.innerHTML = ''; return; }
      const docs = db.all("SELECT id, number, contact_id FROM documents WHERE doc_type=? AND number IS NOT NULL ORDER BY id DESC LIMIT 30", [kind]);
      slot.innerHTML = ui.select('pv_doc', [{ value: '', label: t('Sample data') }].concat(docs.map((d) => ({ value: d.id, label: d.number }))), realDoc || '');
      slot.querySelector('select').addEventListener('change', (e) => { realDoc = e.target.value ? Number(e.target.value) : null; preview(); });
    }

    form.addEventListener('input', () => { readControls(); dirty = true; preview(); });
    form.addEventListener('change', (e) => {
      readControls(); dirty = true;
      if (['layout', 'showTitle'].includes(e.target.name)) {
        if (e.target.name === 'layout') {
          // Switching layout keeps your texts and columns but takes the new layout's look.
          const d = Buku.templates.defaultSettings(s.layout);
          Object.assign(s, { accent: d.accent, font: d.font, fontSize: d.fontSize, showTitle: d.showTitle, minRows: d.minRows, zeroAsDash: d.zeroAsDash, footerBand: d.footerBand });
        }
        renderControls();
      }
      preview();
    });
    form.addEventListener('click', (e) => {
      const mv = e.target.closest('[data-move]');
      if (mv) {
        readControls();
        const li = mv.closest('li'), ul = mv.closest('ul');
        const key = ul.dataset.list, i = Number(li.dataset.i), j = i + Number(mv.dataset.move);
        const arr = key === 'party' ? s.party : s[key][kind];
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        const open = ui.$$('details', form).map((d) => d.open);
        renderControls();
        ui.$$('details', form).forEach((d, k) => { d.open = open[k]; });
        dirty = true; preview();
      }
      const clr = e.target.closest('[data-clear]');
      if (clr) { s[clr.dataset.clear] = null; dirty = true; renderControls(); preview(); }
    });
    form.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-img]');
      if (!inp || !inp.files[0]) return;
      const file = inp.files[0];
      if (file.size > 600 * 1024) { ui.toast(t('Images must be under 600 KB.'), 'error'); return; }
      const r = new FileReader();
      r.onload = () => { s[inp.dataset.img] = r.result; dirty = true; renderControls(); preview(); };
      r.readAsDataURL(file);
    });
    ui.$('[name=pv_kind]').addEventListener('change', (e) => { readControls(); kind = e.target.value; realDoc = null; renderControls(); docPicker(); preview(); });
    ui.$('#save').addEventListener('click', () => {
      try {
        readControls();
        const f = ui.formData(form);
        db.tx(() => {
          const type = f.tpl_type || row.doc_type;
          db.update('doc_templates', row.id, { name: f.tpl_name || row.name, doc_type: type, layout: s.layout, settings: JSON.stringify(s), updated_at: now() });
          if (type !== row.doc_type) db.run('UPDATE doc_templates SET is_default=0 WHERE id=?', [row.id]);
        });
        dirty = false;
        ui.toast(t('Template saved'));
      } catch (e) { ui.showError(e); }
    });
    ui.$('#del').addEventListener('click', async () => {
      const used = db.scalar('SELECT count(*) FROM documents WHERE template_id=?', [row.id]) + db.scalar('SELECT count(*) FROM contacts WHERE default_template_id=?', [row.id]);
      if (row.is_default) return ui.toast(t('Make another template the default first.'), 'error');
      if (!(await ui.confirm(used ? t('{n} documents or contacts use this template. They will use the default instead. Delete?', { n: used }) : t('Delete this template?'), { danger: true, okLabel: t('Delete') }))) return;
      db.tx(() => { db.run('UPDATE documents SET template_id=NULL WHERE template_id=?', [row.id]); db.run('UPDATE contacts SET default_template_id=NULL WHERE default_template_id=?', [row.id]); db.run('DELETE FROM doc_templates WHERE id=?', [row.id]); });
      dirty = false;
      location.hash = '#/settings/templates';
    });
    ui.setLeaveGuard(() => (dirty ? t('The template has unsaved changes. Leave anyway?') : null));
    renderControls();
    docPicker();
    preview();
  }

  ui.route('/settings/templates', page);
  ui.route('/settings/templates/:id', editor);
})();
