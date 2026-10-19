/* Buku — screen check: opens every screen once (plus one record of each kind) and reports any that fail to render. Read-only. */
(function () {
  'use strict';
  const Buku = window.Buku, ui = Buku.ui, h = Buku.util.h;
  const t = (k, v) => Buku.i18n.t(k, v);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function screens(onProgress) {
    const db = Buku.db;
    const first = (sql) => { try { const r = db.get(sql); return r ? r.id : null; } catch (e) { return null; } };
    const hrefs = [...new Set(Array.from(document.querySelectorAll('#nav a[href^="#/"]')).map((a) => a.getAttribute('href')))];
    const extra = [
      ['#/deals/', first('SELECT id FROM deals ORDER BY id LIMIT 1')], ['#/inventory/', first('SELECT id FROM property_units ORDER BY id LIMIT 1')],
      ['#/doc/', first("SELECT id FROM documents WHERE doc_type='invoice' ORDER BY id DESC LIMIT 1")], ['#/doc/', first("SELECT id FROM documents WHERE doc_type='sales_order' ORDER BY id DESC LIMIT 1")],
      ['#/doc/', first("SELECT id FROM documents WHERE doc_type='bill' ORDER BY id DESC LIMIT 1")], ['#/contacts/', first('SELECT id FROM contacts ORDER BY id LIMIT 1')],
      ['#/journal/', first("SELECT id FROM journal_entries WHERE status='posted' ORDER BY id DESC LIMIT 1")], ['#/payments/', first('SELECT id FROM payments ORDER BY id DESC LIMIT 1')],
      ['#/banking/', first("SELECT id FROM accounts WHERE subtype='bank' AND is_active=1 ORDER BY code LIMIT 1")], ['#/settings/templates/', first('SELECT id FROM doc_templates ORDER BY id LIMIT 1')],
    ].filter(([, id]) => id).map(([p, id]) => p + id);
    const all = hrefs.concat(extra, ['#/accounts/opening', '#/doc/new/invoice', '#/doc/new/bill', '#/payments/new?direction=in']);
    const back = location.hash;
    const failed = [];
    let current = '';
    const onErr = (e) => failed.push({ href: current, message: String((e.error && e.error.message) || e.message || e.reason || e) });
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);
    const wrong = t('Something went wrong');
    try {
      for (let i = 0; i < all.length; i++) {
        current = all[i];
        if (onProgress) onProgress(i + 1, all.length);
        location.hash = current;
        await wait(120);
        const title = (document.getElementById('page-title') || {}).textContent || '';
        if (title === wrong) failed.push({ href: current, message: ((document.querySelector('#main .empty p') || {}).textContent || '').trim() });
      }
    } finally {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onErr);
      ui.setLeaveGuard && ui.setLeaveGuard(null);
      location.hash = back;
      await wait(150);
    }
    return { total: all.length, failed };
  }

  async function run() {
    ui.toast(t('Opening every screen…'));
    const r = await screens();
    ui.modal({
      title: t('Screen check'),
      body: r.failed.length
        ? '<p>' + h(t('{n} of {t} screens had a problem:', { n: r.failed.length, t: r.total })) + '</p><ul class="issues">' + r.failed.map((f) => '<li class="error"><code>' + h(f.href) + '</code> — ' + h(f.message) + '</li>').join('') + '</ul>'
        : '<p class="check-line ok">' + h(t('All {t} screens opened without errors.', { t: r.total })) + '</p>',
      actions: [{ label: t('Close'), kind: 'primary' }],
    });
    return r;
  }

  Buku.selfCheck = { screens, run };
})();
