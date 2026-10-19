/* Buku — app shell: navigation, save status, global shortcuts, boot sequence. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = () => Buku.ui;

  const NAV = [
    { href: '#/home', label: 'Overview', icon: 'home' },
    { href: '#/dashboard', label: 'Executive Dashboard', icon: 'report' },
    { section: 'Sales' },
    { href: '#/quotations', label: 'Quotations', icon: 'doc' },
    { href: '#/sales-orders', label: 'Sales orders', icon: 'doc' },
    { href: '#/invoices', label: 'Invoices', icon: 'doc' },
    { href: '#/credit-notes', label: 'Credit notes', icon: 'doc' },
    { href: '#/payments?direction=in', match: '#/payments', label: 'Payments received', icon: 'money' },
    { href: '#/subscriptions', label: 'Subscriptions', icon: 'cycle' },
    { href: '#/renewals', label: 'Renewals', icon: 'cycle' },
    { section: 'Property' },
    { href: '#/deals', label: 'Property Deals', icon: 'home' },
    { href: '#/deal-reports', label: 'Deal Reports', icon: 'report' },
    { href: '#/inventory', label: 'Property Inventory', icon: 'box' },
    { href: '#/jv', label: 'JV Investments', icon: 'bank' },
    { href: '#/internal-commissions', label: 'Internal Sales Commissions', icon: 'people' },
    { section: 'Purchases' },
    { href: '#/bills', label: 'Bills', icon: 'doc' },
    { href: '#/expenses', label: 'Quick expenses', icon: 'doc' },
    { href: '#/payments?direction=out', label: 'Payments made', icon: 'money' },
    { section: 'Contacts & products' },
    { href: '#/contacts', label: 'Contacts', icon: 'people' },
    { href: '#/products', label: 'Products & plans', icon: 'box' },
    { section: 'Bank & tax' },
    { href: '#/banking', label: 'Bank & cash', icon: 'bank' },
    { href: '#/tax', label: 'Tax', icon: 'percent' },
    { section: 'Bookkeeping' },
    { href: '#/journal', label: 'Journal entries', icon: 'journal' },
    { href: '#/accounts', label: 'Chart of accounts', icon: 'accounts' },
    { href: '#/ledger', label: 'General ledger', icon: 'ledger' },
    { href: '#/recognition', label: 'Recognize revenue', icon: 'cycle' },
    { href: '#/period-close', label: 'Period Close', icon: 'journal' },
    { href: '#/budgets', label: 'Budgets & Fiscal', icon: 'report' },
    { section: 'Reports' },
    { href: '#/reports/pl', label: 'Profit & loss', icon: 'report' },
    { href: '#/reports/bs', label: 'Balance sheet', icon: 'report' },
    { href: '#/reports/cashflow', label: 'Cash flow', icon: 'report' },
    { href: '#/reports/ar', label: 'Receivables aging', icon: 'report' },
    { href: '#/reports/ap', label: 'Payables aging', icon: 'report' },
    { href: '#/reports/sales', label: 'Sales', icon: 'report' },
    { href: '#/reports/deferred', label: 'Deferred revenue & MRR', icon: 'report' },
    { href: '#/reports/open-so', label: 'Open sales orders', icon: 'report' },
    { href: '#/reports/tb', label: 'Trial balance', icon: 'report' },
    { href: '#/reports/journal', label: 'Journal report', icon: 'report' },
    { section: 'Settings' },
    { href: '#/settings/company', label: 'Company', icon: 'gear' },
    { href: '#/settings/templates', label: 'Documents & templates', icon: 'gear' },
    { href: '#/settings/reps', label: 'Sales team', icon: 'gear' },
    { href: '#/settings/currencies', label: 'Currencies & rates', icon: 'gear' },
    { href: '#/settings/taxes', label: 'Taxes', icon: 'gear' },
    { href: '#/settings/numbering', label: 'Numbering', icon: 'gear' },
    { href: '#/settings/data', label: 'Data & backup', icon: 'gear' },
    { href: '#/import', label: 'Import from Excel', icon: 'journal' },
    { href: '#/automation', label: 'Automation & Imports', icon: 'cycle' },
    { href: '#/search', label: 'Global Search', icon: 'report' },
  ];

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    journal: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    accounts: '<path d="M4 5h4M4 12h4M4 19h4M11 5h9M11 12h9M11 19h9"/>',
    ledger: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M10 9v11"/>',
    report: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    cycle: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    bank: '<path d="M3 10h18L12 4z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    percent: '<path d="M5 19 19 5"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  };
  const icon = (name) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';

  function renderNav() {
    const company = Buku.db ? Buku.db.get('SELECT name, logo FROM company WHERE id=1') : null;
    ui().$('#company-name').textContent = company ? company.name : '';
    ui().$('#nav').innerHTML = NAV.map((n) =>
      n.section
        ? '<div class="nav-section">' + h(t(n.section)) + '</div>'
        : '<a href="' + n.href + '" data-nav' + (n.match ? '' : '') + '>' + icon(n.icon) + '<span>' + h(t(n.label)) + '</span></a>'
    ).join('');
    ui().$$('.nav a').forEach((a) => a.classList.toggle('active', ui().isActive(a.getAttribute('href'))));
  }

  function renderStatus(s) {
    const el = ui().$('#save-status');
    if (!el) return;
    s = s || Buku.store.status();
    document.body.classList.toggle('has-company', !!s.open);
    if (!s.open) { el.hidden = true; return; }
    el.hidden = false;
    let cls = 'ok', text, title;
    if (s.error) { cls = 'bad'; text = t('Autosave failed'); title = t('Save to a file now to keep your work.'); }
    else if (!s.browserSaved) { cls = 'busy'; text = t('Saving…'); title = ''; }
    else if (s.fileDirty) { cls = 'warn'; text = t('Not saved to file'); title = t('Saved in this browser. Click to save a .sqlite file.'); }
    else { cls = 'ok'; text = t('Saved to file'); title = s.fileName || ''; }
    el.className = 'save-status ' + cls;
    el.innerHTML = '<span class="dot"></span><span>' + h(text) + '</span>';
    el.title = title;
  }

  async function saveFile(as) {
    try {
      const r = await Buku.store.saveToFile({ as });
      if (r === 'saved') ui().toast(t('Saved to {name}', { name: Buku.store.state.fileName }));
      if (r === 'downloaded') ui().toast(t('Downloaded {name}. Keep it somewhere safe.', { name: Buku.store.state.fileName }));
    } catch (e) {
      ui().showError(e);
    }
  }

  function applyTheme() {
    const pref = Buku.util.prefs.get('theme', 'auto');
    if (pref === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', pref);
  }

  function menu() {
    const theme = Buku.util.prefs.get('theme', 'auto');
    const lang = Buku.i18n.lang;
    const m = ui().modal({
      title: t('Preferences'),
      body:
        ui().field(t('Language'), ui().select('lang', [{ value: 'id', label: 'Bahasa Indonesia' }, { value: 'en', label: 'English' }], lang)) +
        ui().field(t('Appearance'), ui().select('theme', [{ value: 'auto', label: t('Follow system') }, { value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }, { value: 'contrast', label: t('High contrast') }], theme)) +
        (Buku.db ? '<hr><div class="stack">' +
          '<button type="button" class="btn" data-act="save">' + h(t('Save to file')) + '</button>' +
          '<button type="button" class="btn" data-act="saveas">' + h(t('Save as…')) + '</button>' +
          '<button type="button" class="btn ghost" data-act="close">' + h(t('Close company')) + '</button></div>' : ''),
      actions: [{ label: t('Done'), kind: 'primary', onClick: (mm) => {
        const f = ui().formData(mm.body);
        Buku.util.prefs.set('theme', f.theme);
        applyTheme();
        if (f.lang !== Buku.i18n.lang) { Buku.i18n.setLang(f.lang); renderNav(); renderStatus(); ui().dispatch(); }
      } }],
    });
    m.body.addEventListener('click', async (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      m.close();
      if (act === 'save') saveFile(false);
      if (act === 'saveas') saveFile(true);
      if (act === 'close') closeCompany();
    });
  }

  async function closeCompany() {
    const s = Buku.store.status();
    if (s.fileDirty) {
      const ok = await ui().confirm(t('Your changes are kept in this browser, but have not been saved to a file. Close anyway?'), { okLabel: t('Close company') });
      if (!ok) return;
    }
    await Buku.store.close();
    renderNav();
    location.hash = '#/';
    ui().dispatch();
  }

  function bindShell() {
    ui().$('#save-status').addEventListener('click', () => saveFile(false));
    ui().$('#menu-btn').addEventListener('click', menu);
    ui().$('#nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    ui().$('#nav-scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (Buku.db) saveFile(e.shiftKey);
      }
    });
    Buku.store.onChange(renderStatus);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  }

  async function boot() {
    applyTheme();
    Buku.i18n.setLang(Buku.util.prefs.get('lang', 'id'));
    bindShell();
    try {
      await Buku.dbm.loadEngine();
    } catch (e) {
      document.body.innerHTML = '<div class="fatal"><h1>Accu-Z Accounting</h1><p>' + h(t('This browser could not start the database engine. Use a recent Chrome, Edge or Firefox.')) + '</p><pre>' + h(e.message) + '</pre></div>';
      return;
    }
    try {
      const last = await Buku.store.lastOpenedId();
      if (last) await Buku.store.openFromBrowser(last);
    } catch (e) {
      console.warn('Could not reopen last company', e);
    }
    renderNav();
    renderStatus();
    if (Buku.db && (location.hash === '' || location.hash === '#/')) location.hash = '#/home';
    else ui().dispatch();
    document.body.classList.add('ready');
  }

  Buku.app = { boot, renderNav, renderStatus, saveFile, closeCompany, icon };
  document.addEventListener('DOMContentLoaded', boot);
})();
