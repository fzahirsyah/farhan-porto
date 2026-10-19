/* Buku — welcome screen (no company open) and the new-company setup wizard. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;

  async function welcome() {
    if (Buku.db) { location.hash = '#/home'; return; }
    const companies = await Buku.store.listCompanies();
    const list = companies.length
      ? '<ul class="company-list">' + companies.map((c) =>
          '<li><button type="button" class="company-open" data-id="' + h(c.file_id) + '"><strong>' + h(c.name) + '</strong>' +
          '<span>' + h(t('Last saved in this browser {date}', { date: ui.date(c.saved_at.slice(0, 10)) })) +
          (c.file_dirty ? ' · ' + h(t('not saved to file')) : c.file_name ? ' · ' + h(c.file_name) : '') + '</span></button>' +
          '<button type="button" class="icon-btn company-remove" data-id="' + h(c.file_id) + '" data-name="' + h(c.name) + '" aria-label="' + h(t('Remove from this browser')) + '">✕</button></li>').join('') + '</ul>'
      : '';
    ui.page({
      title: '',
      cls: 'welcome',
      body:
        '<section class="welcome-card">' +
        '<div class="welcome-brand-lockup" aria-label="Accu-Z Accounting">' +
          '<img class="welcome-logo logo-light" src="assets/accuz-horizontal-light.png" alt="Accu-Z">' +
          '<img class="welcome-logo logo-dark" src="assets/accuz-horizontal-dark.png" alt="Accu-Z">' +
          '<div class="welcome-product-name">ACCOUNTING</div>' +
        '</div>' +
        '<p class="lede">' + h(t('Double-entry bookkeeping that runs in your browser. Your books are one .sqlite file on your computer.')) + '</p>' +
        '<div class="welcome-actions">' +
        '<a class="btn primary" href="#/setup">' + h(t('Create a company')) + '</a>' +
        '<button type="button" class="btn" id="open-file">' + h(t('Open a company file')) + '</button>' +
        '<button type="button" class="btn ghost" id="demo">' + h(t('Try Accu-Z Accounting Demo')) + '</button>' +
        '</div>' +
        (list ? '<h2 class="list-title">' + h(t('Companies in this browser')) + '</h2>' + list : '') +
        '<p class="fine">' + h(t('Nothing is uploaded anywhere. Save to a file regularly and keep a backup copy.')) + '</p>' +
        '</section>',
    });
    ui.$('#open-file').addEventListener('click', openFile);
    ui.$('#demo').addEventListener('click', async () => {
      try {
        await Buku.demo.create();
        Buku.app.renderNav();
        ui.toast(t('Demo company created'));
        location.hash = '#/home';
      } catch (e) { ui.showError(e); }
    });
    ui.$$('.company-open').forEach((b) => b.addEventListener('click', async () => {
      try {
        await Buku.store.openFromBrowser(b.dataset.id);
        Buku.app.renderNav();
        location.hash = '#/home';
      } catch (e) { ui.showError(e); }
    }));
    ui.$$('.company-remove').forEach((b) => b.addEventListener('click', async () => {
      const ok = await ui.confirm(t('Remove “{name}” from this browser? Copies saved as files are not affected.', { name: b.dataset.name }), { danger: true, okLabel: t('Remove') });
      if (!ok) return;
      await Buku.store.removeCompany(b.dataset.id);
      welcome();
    }));
  }

  async function openFile() {
    try {
      const f = await Buku.store.pickFile();
      if (!f) return;
      let r = await Buku.store.openBytes(f.bytes, { fileName: f.name, handle: f.handle });
      if (r.conflict) {
        const ok = await ui.confirm(
          t('This browser has changes to “{name}” that were never saved to a file. Opening the file replaces them. Continue?', { name: r.conflict.name }),
          { danger: true, okLabel: t('Open the file') });
        if (!ok) return;
        r = await Buku.store.openBytes(f.bytes, { fileName: f.name, handle: f.handle, force: true });
      }
      Buku.app.renderNav();
      ui.toast(t('Opened {name}', { name: f.name }));
      location.hash = '#/home';
    } catch (e) {
      ui.showError(e);
    }
  }

  // ---------- Setup wizard ----------
  // Neutral defaults for new Accu-Z Accounting companies; never alter existing companies.
  const DEFAULTS = {
    company: {
      name: '',
      npwp: '',
      phone: '',
      email: '',
      website: '',
      socials: { linkedin: '', instagram: '', tiktok: '' },
      fiscal_year_start_month: 1,
      language: 'id',
      is_pkp: true,
    },
    addresses: [
      { label: 'Kantor / Office', address: '', is_default: true },
    ],
    reps: [],
  };

  const MONTHS = () => Buku.i18n.monthNames('long').map((m, i) => ({ value: i + 1, label: m }));

  function setup() {
    // If a company is open, creating a new one closes it first (on submit).
    const d = DEFAULTS;
    const step = (n, title, body) =>
      '<fieldset class="wizard-step" data-step="' + n + '"><legend><span class="step-no">' + n + '</span>' + h(title) + '</legend>' + body + '</fieldset>';
    const addrRow = (a, i) =>
      '<div class="addr-row" data-i="' + i + '">' +
      ui.field(t('Label'), ui.input('addr_label_' + i, a.label)) +
      ui.field(t('Address'), '<textarea name="addr_text_' + i + '" rows="3">' + h(a.address) + '</textarea>', { wide: true }) +
      '<label class="check"><input type="radio" name="addr_default" value="' + i + '"' + (a.is_default ? ' checked' : '') + '> ' + h(t('Default address')) + '</label></div>';
    const repRow = (r, i) =>
      '<div class="rep-row">' + ui.field(t('Code'), ui.input('rep_code_' + i, r.code, { attrs: 'maxlength="6"' })) + ui.field(t('Name'), ui.input('rep_name_' + i, r.name)) + '</div>';

    ui.page({
      title: t('Create a company'),
      cls: 'narrow',
      body:
        '<form id="setup" class="wizard" novalidate>' +
        '<p class="intro">' + h(t('These company details will appear on your invoices and sales orders. Use your real legal and contact information.')) + '</p>' +
        step(1, t('Company'),
          '<div class="grid2">' +
          ui.field(t('Company name'), ui.input('name', d.company.name, { required: true }), { wide: true }) +
          ui.field('NPWP', ui.input('npwp', d.company.npwp)) +
          ui.field(t('Finance phone'), ui.input('phone', d.company.phone)) +
          ui.field(t('Email'), ui.input('email', d.company.email, { type: 'email' }), { optional: true }) +
          ui.field(t('Website'), ui.input('website', d.company.website), { optional: true }) +
          ui.field('LinkedIn', ui.input('linkedin', d.company.socials.linkedin), { optional: true }) +
          ui.field('Instagram', ui.input('instagram', d.company.socials.instagram), { optional: true }) +
          ui.field('TikTok', ui.input('tiktok', d.company.socials.tiktok), { optional: true }) +
          '</div>' +
          '<label class="check"><input type="checkbox" name="is_pkp" checked> ' + h(t('VAT-registered company (PKP)')) + '</label>') +
        step(2, t('Office addresses'),
          '<p class="hint">' + h(t('Documents print the default address. You can pick another one per document later.')) + '</p>' +
          '<div id="addr-list">' + d.addresses.map(addrRow).join('') + '</div>' +
          '<button type="button" class="btn small ghost" id="add-addr">' + h(t('Add another address')) + '</button>') +
        step(3, t('Currencies and financial year'),
          '<p class="hint">' + h(t('Reports are always in rupiah (IDR). Turn on the other currencies you invoice or bank in.')) + '</p>' +
          '<div class="checks"><label class="check"><input type="checkbox" checked disabled> IDR · Rupiah</label>' +
          '<label class="check"><input type="checkbox" name="cur_USD" checked> USD · US Dollar</label>' +
          '<label class="check"><input type="checkbox" name="cur_SGD" checked> SGD · Singapore Dollar</label></div>' +
          '<div class="grid2">' + ui.field(t('Financial year starts in'), ui.select('fy', MONTHS(), d.company.fiscal_year_start_month)) + '</div>') +
        step(4, t('Chart of accounts'),
          '<label class="choice"><input type="radio" name="coa" value="saas_property" checked><span><strong>' + h(t('SaaS and property agency')) + '</strong>' +
          h(t('Ready-made Indonesian accounts for SaaS revenue, commissions, property resale, customer funds held (titipan), PPN and PPh.')) + '</span></label>' +
          '<label class="choice"><input type="radio" name="coa" value="blank"><span><strong>' + h(t('Minimal')) + '</strong>' +
          h(t('Only the accounts the app needs to work. You add the rest yourself.')) + '</span></label>') +
        step(5, t('Sales team'),
          '<p class="hint">' + h(t('Sales reps appear on documents as “Sales Rep.”. You can add more later.')) + '</p>' +
          '<div id="rep-list">' + d.reps.map(repRow).join('') + '</div>' +
          '<button type="button" class="btn small ghost" id="add-rep">' + h(t('Add a sales rep')) + '</button>') +
        '<div class="form-actions"><a class="btn ghost" href="#/">' + h(t('Cancel')) + '</a><button type="submit" class="btn primary">' + h(t('Create company')) + '</button></div>' +
        '</form>',
    });

    let addrCount = d.addresses.length, repCount = d.reps.length;
    ui.$('#add-addr').addEventListener('click', () => {
      ui.$('#addr-list').insertAdjacentHTML('beforeend', addrRow({ label: '', address: '' }, addrCount++));
    });
    ui.$('#add-rep').addEventListener('click', () => {
      ui.$('#rep-list').insertAdjacentHTML('beforeend', repRow({ code: '', name: '' }, repCount++));
    });

    ui.$('#setup').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ui.formData(ui.$('#setup'));
      if (!f.name) { ui.toast(t('Enter the company name.'), 'error'); ui.$('[name=name]').focus(); return; }
      const addresses = [];
      for (let i = 0; i < addrCount; i++) {
        if (f['addr_text_' + i]) addresses.push({ label: f['addr_label_' + i] || t('Office') + ' ' + (i + 1), address: f['addr_text_' + i], is_default: String(f.addr_default) === String(i) });
      }
      const reps = [];
      const codes = new Set();
      for (let i = 0; i < repCount; i++) {
        const code = (f['rep_code_' + i] || '').toUpperCase();
        if (!code && !f['rep_name_' + i]) continue;
        if (!code || !f['rep_name_' + i]) { ui.toast(t('Each sales rep needs a code and a name.'), 'error'); return; }
        if (codes.has(code)) { ui.toast(t('Sales rep code {code} is used twice.', { code }), 'error'); return; }
        codes.add(code);
        reps.push({ code, name: f['rep_name_' + i] });
      }
      const currencies = ['IDR'].concat(f.cur_USD ? ['USD'] : [], f.cur_SGD ? ['SGD'] : []);
      try {
        if (Buku.db) await Buku.store.close();
        await Buku.store.createNew({
          company: {
            name: f.name, npwp: f.npwp, phone: f.phone, email: f.email, website: f.website,
            socials: { linkedin: f.linkedin, instagram: f.instagram, tiktok: f.tiktok },
            fiscal_year_start_month: Number(f.fy), language: Buku.i18n.lang, is_pkp: f.is_pkp,
          },
          addresses, reps, coaTemplate: f.coa, currencies,
        });
        Buku.app.renderNav();
        ui.toast(t('Company created'));
        location.hash = '#/home';
      } catch (e) {
        ui.showError(e);
      }
    });
  }

  ui.route('/', welcome);
  ui.route('/setup', setup);
  Buku.start = { openFile };
})();
