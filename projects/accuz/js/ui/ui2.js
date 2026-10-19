/* Buku — UI helpers for Tier 2: document labels and statuses, contact/product pickers, document preview and printing. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);
  const ui = Buku.ui;

  const DOC = {
    sales_order: { label: 'Sales order', plural: 'Sales orders', list: '#/sales-orders', side: 'sale' },
    invoice: { label: 'Invoice', plural: 'Invoices', list: '#/invoices', side: 'sale' },
    credit_note: { label: 'Credit note', plural: 'Credit notes', list: '#/credit-notes', side: 'sale' },
    bill: { label: 'Bill', plural: 'Bills', list: '#/bills', side: 'purchase' },
    expense: { label: 'Expense record', plural: 'Quick expenses', list: '#/expenses', side: 'purchase' },
  };

  const STATUS = {
    draft: ['Draft', 'draft'], confirmed: ['Confirmed', 'info'], partial: ['Partly done', 'warn'], complete: ['Fully invoiced', 'ok'], closed: ['Closed', 'muted'],
    cancelled: ['Cancelled', 'muted'], open: ['Unpaid', 'info'], paid: ['Paid', 'ok'], void: ['Void', 'muted'], overdue: ['Overdue', 'bad'], expired: ['Expired', 'muted'],
    partial_paid: ['Partly paid', 'warn'], applied: ['Applied', 'ok'], unapplied: ['Open credit', 'info'], posted: ['Posted', 'ok'],
    pending_payment: ['Awaiting payment', 'warn'], pending_handover: ['Awaiting handover', 'info'], active: ['Active', 'ok'], expiring: ['Expiring', 'warn'], renewed: ['Renewed', 'muted'], renewed_active: ['Active · renewed', 'ok'],
  };

  /** Status key as people should see it (adds overdue / expired). */
  function docStatus(d) {
    const today = Buku.util.today();
    if (d.doc_type === 'sales_order') {
      if (d.status === 'confirmed' && d.valid_until && d.valid_until < today) return 'expired';
      return d.status;
    }
    if (d.doc_type === 'credit_note') return d.status === 'paid' ? 'applied' : d.status === 'open' || d.status === 'partial' ? 'unapplied' : d.status;
    if ((d.status === 'open' || d.status === 'partial') && d.due_date && d.due_date < today) return 'overdue';
    if (d.status === 'partial') return 'partial_paid';
    return d.status;
  }

  function chip(key) {
    const s = STATUS[key] || [key, 'muted'];
    return '<span class="chip ' + s[1] + '">' + h(t(s[0])) + '</span>';
  }

  function money(minor, cur) {
    return Buku.money.format(minor || 0, ui.curDecimals(cur), { code: cur });
  }

  function contacts(filter) {
    const where = filter === 'customer' ? "AND (tags LIKE '%customer%' OR tags LIKE '%developer%' OR tags LIKE '%bank%' OR tags='[]')" : filter === 'vendor' ? "AND (tags LIKE '%vendor%' OR tags LIKE '%partner%' OR tags LIKE '%agent%' OR tags='[]')" : '';
    return Buku.db.all('SELECT * FROM contacts WHERE is_active=1 ' + where + ' ORDER BY name');
  }

  function contactOptions(filter, empty) {
    return (empty ? [{ value: '', label: empty }] : []).concat(contacts(filter).map((c) => ({ value: c.id, label: c.name })));
  }

  function currencyOptions() {
    return Buku.db.all("SELECT code FROM currencies WHERE is_enabled=1 ORDER BY CASE code WHEN 'IDR' THEN 0 ELSE 1 END, code").map((c) => ({ value: c.code, label: c.code }));
  }

  function repOptions(empty) {
    return [{ value: '', label: empty || '—' }].concat(Buku.db.all('SELECT * FROM sales_reps WHERE is_active=1 ORDER BY name').map((r) => ({ value: r.id, label: r.name + ' (' + r.code + ')' })));
  }

  function taxOptions(kinds, empty) {
    const ph = kinds.map(() => '?').join(',');
    return [{ value: '', label: empty || t('No tax') }].concat(Buku.db.all(`SELECT * FROM taxes WHERE is_active=1 AND kind IN (${ph}) ORDER BY kind, code`, kinds).map((x) => ({ value: x.id, label: x.print_label || x.name })));
  }

  /** Put a rendered document into a container, scaled to fit its width. */
  function showPaper(container, html) {
    container.innerHTML = '<div class="doc-scale"><div class="doc-scale-inner">' + html + '</div></div>';
    fitPaper(container);
    if (!container._fitBound) {
      container._fitBound = true;
      const ro = new ResizeObserver(() => fitPaper(container));
      ro.observe(container);
    }
  }

  function fitPaper(container) {
    const scaleBox = container.querySelector('.doc-scale');
    const inner = container.querySelector('.doc-scale-inner');
    const paper = container.querySelector('.doc-paper');
    if (!scaleBox || !paper) return;
    const avail = scaleBox.clientWidth;
    const w = paper.offsetWidth;
    const s = Math.min(1, avail / w);
    inner.style.transform = 'scale(' + s + ')';
    inner.style.transformOrigin = 'top left';
    inner.style.width = w + 'px';
    scaleBox.style.height = Math.ceil(paper.offsetHeight * s) + 'px';
  }

  /** Print only the document in `container`; filename suggestion via the page title. */
  function printPaper(container, fileTitle) {
    const prevTitle = document.title;
    if (fileTitle) document.title = fileTitle.replace(/[\\/:*?"<>|]+/g, ' ');
    container.classList.add('doc-print-root');
    document.body.classList.add('printing-doc');
    const done = () => {
      document.body.classList.remove('printing-doc');
      container.classList.remove('doc-print-root');
      document.title = prevTitle;
      window.removeEventListener('afterprint', done);
      fitPaper(container);
    };
    window.addEventListener('afterprint', done);
    const inner = container.querySelector('.doc-scale-inner');
    const box = container.querySelector('.doc-scale');
    if (inner) { inner.style.transform = 'none'; }
    if (box) box.style.height = 'auto';
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  }

  /** Quick-add contact modal; resolves with the new id. */
  function newContact(tag, prefill) {
    return new Promise((resolve) => {
      Buku.contactsUI.edit(null, { tag, prefill, onSaved: resolve });
    });
  }

  function rowLinks(root) {
    ui.$$('tr.link', root || ui.$('#main')).forEach((tr) => tr.addEventListener('click', (ev) => {
      if (ev.target.closest('a,button,input,select,label')) return;
      location.hash = tr.dataset.href;
    }));
  }

  /** Read a qty text ("6", "1,5") to ×1000 integer. */
  function readQty(text) {
    const s = String(text || '').trim().replace(',', '.');
    if (s === '') return 0;
    if (!/^\d+(\.\d{1,3})?$/.test(s)) throw new Buku.BukuError('invalid_qty', t('Enter a valid quantity.'));
    return Math.round(Number(s) * 1000);
  }
  function qtyText(q) {
    const v = (q || 0) / 1000;
    return Number.isInteger(v) ? String(v) : String(v).replace('.', Buku.i18n.lang === 'id' ? ',' : '.');
  }

  Buku.ui2 = { DOC, STATUS, docStatus, chip, money, contacts, contactOptions, currencyOptions, repOptions, taxOptions, showPaper, fitPaper, printPaper, newContact, rowLinks, readQty, qtyText };
})();
