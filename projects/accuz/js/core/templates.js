/* Buku — document templates: defaults, data model and HTML rendering for sales orders, invoices,
   credit notes, receipts (kwitansi) and statements. Layouts: MilikiRumah (recreates the current
   PT Miliki Rumah Indonesia documents), Classic, Modern, Compact. All text is customizable. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;

  const LAYOUTS = ['milikirumah', 'classic', 'modern', 'compact'];
  const DOC_TYPES = ['sales_order', 'invoice', 'credit_note', 'receipt', 'statement'];

  const INFO_FIELDS = {
    sales_order: [['reference', 'Opportunity Number'], ['number', 'SO Number'], ['date', 'Order Date'], ['payment_term', 'Payment Term'], ['sales_rep', 'Sales Rep.'], ['currency', 'Currency'], ['validity', 'Validity Period']],
    invoice: [['so_number', 'SO Number'], ['date', 'Invoice Date'], ['number', 'Invoice Number'], ['payment_term', 'Payment Term'], ['sales_rep', 'Sales Rep.'], ['currency', 'Currency'], ['due_date', 'Due Date'], ['terms_days', 'Terms of Payment'], ['faktur', 'Faktur Pajak']],
    credit_note: [['number', 'Credit Note Number'], ['date', 'Date'], ['invoice_ref', 'Invoice Number'], ['sales_rep', 'Sales Rep.'], ['currency', 'Currency']],
  };
  // Fields shown by default (the rest can be switched on).
  const INFO_DEFAULT = {
    sales_order: ['reference', 'date', 'payment_term', 'sales_rep', 'currency', 'validity'],
    invoice: ['so_number', 'date', 'number', 'payment_term', 'sales_rep', 'currency', 'due_date', 'terms_days'],
    credit_note: ['number', 'date', 'invoice_ref', 'currency'],
  };
  const COLUMNS = {
    sales_order: [['item', 'Item', true], ['description', 'Description', true], ['start', 'Start Date', true], ['end', 'End Date', true], ['qty', 'Qty', true], ['price', 'Price/Month', true], ['amount', 'Amount', true], ['note', 'Note', true], ['no', 'No', false], ['discount', 'Discount', false], ['tax', 'Tax', false]],
    invoice: [['no', 'No', true], ['description', 'Description', true], ['qty', 'Qty', true], ['price', 'Price per Qty', true], ['discount', 'Discount', true], ['amount', 'Total', true], ['item', 'Item', false], ['start', 'Start Date', false], ['end', 'End Date', false], ['note', 'Note', false], ['tax', 'Tax', false]],
    credit_note: [['no', 'No', true], ['description', 'Description', true], ['qty', 'Qty', true], ['price', 'Price per Qty', true], ['amount', 'Total', true], ['discount', 'Discount', false], ['item', 'Item', false], ['note', 'Note', false]],
  };
  const PARTY_FIELDS = [['bill_to', 'Bill To'], ['pic', 'PIC'], ['phone', 'Phone'], ['address', 'Address'], ['npwp', 'NPWP'], ['email', 'Email']];

  const BLOCKS = {
    sales_order: {
      intro: 'Dengan menandatangani Sales Order di bawah ini dan/atau menggunakan produk yang tercantum, Pelanggan menyatakan bahwa telah membaca, memahami, dan menyetujui untuk terikat dengan Syarat dan Ketentuan {company}. {company} berhak untuk memperbarui atau mengubah Syarat Pembelian sewaktu-waktu tanpa pemberitahuan sebelumnya.',
      terms: 'Pelanggan menyetujui bahwa, kecuali dinyatakan lain secara tertulis oleh Perusahaan dalam Sales Order ini, masa berlaku untuk produk yang dibeli adalah sebagaimana tercantum dalam Syarat Pembelian (“Masa Berlaku”). Tidak akan ada perpanjangan Masa Berlaku dalam keadaan apa pun, dan setiap produk (atau sebagian darinya) yang tidak digunakan setelah berakhirnya Masa Berlaku akan segera hangus.',
      notes: '**Catatan:**\n• Tanggal mulai dan berakhir berlangganan akan mengikuti tanggal sistem on-board/live.\n• Harga belum termasuk PPh 23, klien/pengembang wajib melakukan pemotongan sebesar 2% pada saat pembayaran dari **Total Amount**.\n• Ketentuan pembayaran: Cash Before Delivery.\n• Pembayaran akan diterima penuh, biaya bunga dan/atau biaya bank bukan merupakan tanggung jawab kami.',
      legal: '**Klausul Hukum:**\nDengan menandatangani secara digital atau dengan cara lain menerima Sales Order ini, Pelanggan setuju bahwa dokumen ini merupakan perjanjian yang sah dan mengikat secara hukum serta dapat diberlakukan berdasarkan hukum yang berlaku di Republik Indonesia.',
      payment: 'Please make direct payment to {company} under the following bank detail. Alternatively, please call our Finance Department on {finance_phone}, if you have any questions.',
    },
    invoice: {
      intro: '',
      terms: '',
      notes: '*\\*Will be received in full amount, interest fee and bank charges is not our responsibility*\n*\\*Period will be calculate after receive payment and handover from Tech Team*',
      legal: '**Legal Clause:**\nBy digitally signing or otherwise accepting this Sales Order, the Customer agrees that this document constitutes a valid and legally binding agreement enforceable under the laws of the Republic of Indonesia.',
      payment: 'Please make direct payment to:\n{company} under the following bank detail. Alternatively, please call our Finance Dept at {finance_phone}, If there’s any question.',
    },
    credit_note: { intro: 'This credit note reduces the amount due on invoice {invoice_ref}.', terms: '', notes: '', legal: '', payment: '' },
    receipt: { intro: '', terms: '', notes: '', legal: '', payment: '' },
    statement: { intro: 'Below is your account summary. Please contact our Finance Department on {finance_phone} if anything does not match your records.', terms: '', notes: '', legal: '', payment: 'Please make direct payment to {company} under the following bank detail.' },
  };

  const TITLES = { sales_order: 'SALES ORDER', invoice: 'INVOICE', credit_note: 'CREDIT NOTE', receipt: 'KWITANSI', statement: 'STATEMENT OF ACCOUNT' };

  /** Full default settings for a layout. Every key the editor exposes lives here. */
  function defaultSettings(layout) {
    layout = LAYOUTS.includes(layout) ? layout : 'milikirumah';
    const columns = {};
    for (const t of Object.keys(COLUMNS)) columns[t] = COLUMNS[t].map(([key, label, show]) => ({ key, label, show }));
    const info = {};
    for (const t of Object.keys(INFO_FIELDS)) info[t] = INFO_FIELDS[t].map(([key, label]) => ({ key, label, show: INFO_DEFAULT[t].includes(key) }));
    return {
      layout,
      accent: layout === 'classic' ? '#3a1114' : '#d91c1a',
      font: layout === 'classic' ? 'serif' : 'sans',
      fontSize: layout === 'compact' ? 7 : layout === 'milikirumah' ? 7.5 : 8.5,
      logoSize: 'm',
      showTitle: layout !== 'milikirumah',
      titles: Object.assign({}, TITLES),
      showSocials: true,
      showNpwp: true,
      party: PARTY_FIELDS.map(([key, label]) => ({ key, label, show: true })),
      info,
      columns,
      minRows: layout === 'milikirumah' ? 2 : 0,
      zeroAsDash: layout === 'milikirumah',
      currencyInAmounts: true,
      dateFormat: 'short', // 12 Oct 2026
      periodFormat: 'month', // Oct 2026
      labels: {
        sales_order: { subtotal: 'Total Amount', total: 'Grand Total', note: 'Note' },
        invoice: { subtotal: 'TOTAL', total: 'Amount Due', note: 'Note' },
        credit_note: { subtotal: 'Subtotal', total: 'Total Credit', note: 'Note' },
      },
      showDiscountLine: true,
      showDpp: false,
      showPph23Info: false,
      showIdrEquivalent: true,
      showTerbilang: false,
      showPaid: true,
      blocks: JSON.parse(JSON.stringify(BLOCKS)),
      signature: {
        sales_order: { ours: true, theirs: true, label: 'Agree & Accepted by,', stampRequired: true, showDate: false },
        invoice: { ours: true, theirs: false, label: 'Agree & Accepted by,', stampRequired: false, showDate: true },
        credit_note: { ours: true, theirs: false, label: 'Authorised by,', stampRequired: false, showDate: true },
        receipt: { ours: true, theirs: false, label: 'Hormat kami,', stampRequired: false, showDate: true },
      },
      signatoryName: '',
      signatureImage: null,
      stampImage: null,
      emeterai: false,
      showPayment: true,
      matchBankCurrency: true,
      footerBand: layout === 'milikirumah' || layout === 'modern',
      footerText: '{address}',
      background: null,
      backgroundOpacity: 0.12,
      watermark: true,
      paper: 'A4',
      margins: 'normal',
      language: 'en',
    };
  }

  /** Merge stored settings over defaults so new options appear for old templates. */
  function resolve(stored, layout) {
    const d = defaultSettings(layout || (stored && stored.layout));
    const s = stored || {};
    const out = Object.assign({}, d, s);
    out.titles = Object.assign({}, d.titles, s.titles || {});
    out.labels = {};
    for (const t of Object.keys(d.labels)) out.labels[t] = Object.assign({}, d.labels[t], (s.labels || {})[t] || {});
    out.blocks = {};
    for (const t of Object.keys(d.blocks)) out.blocks[t] = Object.assign({}, d.blocks[t], (s.blocks || {})[t] || {});
    out.signature = {};
    for (const t of Object.keys(d.signature)) out.signature[t] = Object.assign({}, d.signature[t], (s.signature || {})[t] || {});
    for (const k of ['columns', 'info']) {
      out[k] = {};
      for (const t of Object.keys(d[k])) {
        const saved = (s[k] || {})[t];
        if (!saved) { out[k][t] = d[k][t]; continue; }
        const keys = new Set(saved.map((c) => c.key));
        out[k][t] = saved.concat(d[k][t].filter((c) => !keys.has(c.key)).map((c) => Object.assign({}, c, { show: false })));
      }
    }
    if (!s.party) out.party = d.party;
    return out;
  }

  // ---------------- Formatting helpers ----------------
  const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONTHS_ID_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MONTHS_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function fmtDate(iso, style, lang) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    const mi = Number(m) - 1;
    const short = lang === 'id' ? MONTHS_ID : MONTHS_EN;
    const long = lang === 'id' ? MONTHS_ID_LONG : MONTHS_EN_LONG;
    if (style === 'numeric') return d + '/' + m + '/' + y;
    if (style === 'iso') return iso.slice(0, 10);
    if (style === 'long') return Number(d) + ' ' + long[mi] + ' ' + y;
    if (style === 'month') return short[mi] + ' ' + y;
    if (style === 'monthLong') return long[mi] + ' ' + y;
    return d + ' ' + short[mi] + ' ' + y;
  }

  /** Document money: "IDR 2.000.000" always uses Indonesian grouping like the current documents. */
  function money(minor, cur, dec, s) {
    if ((minor === 0 || minor === null) && s.zeroAsDash) return (s.currencyInAmounts ? cur + ' ' : '') + '-';
    return Buku.money.format(minor || 0, dec, { locale: 'id', code: s.currencyInAmounts ? cur : null });
  }

  function qtyText(q) {
    const v = q / 1000;
    return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
  }

  /** Very small markup for text blocks: **bold**, *italic*, lines starting with • or - become bullets. */
  function markup(text, vars) {
    if (!text) return '';
    let t = String(text);
    // No finance phone set: drop the sentence that asks the customer to call it, instead of printing "on , if".
    if (!vars || !String(vars.finance_phone || '').trim()) t = t.replace(/(^|[.!?]\s+|\n)[^.!?\n]*\{finance_phone\}[^.!?\n]*[.!?]?/g, '$1').replace(/[ \t]+$/gm, '');
    t = t.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
    const lines = t.split('\n');
    let html = '', inList = false;
    const inline = (s) => h(s).replace(/\\\*/g, '&#42;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/__(.+?)__/g, '<u>$1</u>');
    for (const raw of lines) {
      const l = raw.trimEnd();
      const m = l.match(/^\s*[•\-–]\s+(.*)$/);
      if (m) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
      if (inList) { html += '</ul>'; inList = false; }
      if (l.trim() === '') continue;
      html += '<p>' + inline(l) + '</p>';
    }
    if (inList) html += '</ul>';
    return html;
  }

  // ---------------- Data model ----------------
  function companyModel(db, addressId) {
    const c = db.get('SELECT * FROM company WHERE id=1');
    const addr = (addressId && db.get('SELECT * FROM company_addresses WHERE id=?', [addressId])) || db.get('SELECT * FROM company_addresses WHERE is_default=1') || db.get('SELECT * FROM company_addresses ORDER BY id LIMIT 1');
    return { name: c.name, legal_name: c.legal_name || c.name, npwp: c.npwp, phone: c.phone, email: c.email, website: c.website, socials: JSON.parse(c.socials || '{}'), logo: c.logo, address: addr ? addr.address : '' };
  }

  function bankDetails(db, currency, match) {
    const all = db.setting('bank_details') || [];
    if (!match) return all;
    const same = all.filter((b) => !b.currency || b.currency === currency);
    return same.length ? same : all;
  }

  function partyFrom(doc, db) {
    let snap = null;
    try { snap = doc.billing_snapshot ? JSON.parse(doc.billing_snapshot) : null; } catch (e) { snap = null; }
    const c = snap || (doc.contact_id ? db.get('SELECT * FROM contacts WHERE id=?', [doc.contact_id]) : {}) || {};
    return { bill_to: c.name || doc.contact_name || '', pic: doc.pic_name || c.pic_name || '', phone: c.phone || '', address: c.billing_address || '', npwp: c.npwp || '', email: c.email || '' };
  }

  /** Model for a sales order, invoice or credit note. */
  function docModel(db, docId, s) {
    const d = Buku.docs.load(db, docId);
    if (!d) throw new Buku.BukuError('not_found', 'Document not found.');
    const lang = s.language === 'id' ? 'id' : 'en';
    const cur = d.currency, dec = Buku.fx.decimals(db, cur);
    const company = companyModel(db, d.company_address_id);
    const source = d.source_doc_id ? db.get('SELECT number, doc_type FROM documents WHERE id=?', [d.source_doc_id]) : null;
    const rep = d.sales_rep_id ? db.get('SELECT * FROM sales_reps WHERE id=?', [d.sales_rep_id]) : null;
    const info = {
      reference: d.reference || '', number: d.number || 'DRAFT', date: fmtDate(d.date, s.dateFormat, lang),
      so_number: source && source.doc_type === 'sales_order' ? source.number : d.reference || '',
      invoice_ref: source && source.doc_type === 'invoice' ? source.number : d.reference || '',
      payment_term: d.payment_term_text || '', sales_rep: rep ? rep.name : '', currency: cur,
      validity: d.validity_text || (d.valid_until ? fmtDate(d.valid_until, s.dateFormat, lang) : ''),
      due_date: fmtDate(d.due_date, s.dateFormat, lang), terms_days: d.terms_days ? d.terms_days + (lang === 'id' ? ' Hari' : ' Days') : '',
      faktur: d.faktur_no || '',
    };
    const lines = d.lines.map((l, i) => ({
      no: String(i + 1),
      item: l.item_label || l.product_name || '',
      description: l.description || (l.item_label ? '' : l.product_name || ''),
      start: l.start_date ? fmtDate(l.start_date, s.periodFormat, lang) : '',
      end: l.end_date ? fmtDate(l.end_date, s.periodFormat, lang) : '',
      qty: qtyText(l.quantity) + (l.unit ? ' ' + l.unit : ''),
      price: money(l.unit_price, cur, dec, s),
      discount: l.line_discount ? money(l.line_discount, cur, dec, s) : money(0, cur, dec, s),
      amount: money(l.line_net, cur, dec, s),
      note: l.line_note || '',
      tax: l.tax_label || '',
    }));
    const taxes = new Map();
    d.lines.forEach((l) => { if (l.line_tax) { const k = l.tax_label || 'VAT'; taxes.set(k, (taxes.get(k) || 0) + l.line_tax); } });
    const labels = s.labels[d.doc_type] || s.labels.invoice;
    const totals = [];
    if (d.discount_total && s.showDiscountLine) {
      totals.push({ label: lang === 'id' ? 'Subtotal' : 'Subtotal', value: money(d.subtotal, cur, dec, s) });
      totals.push({ label: lang === 'id' ? 'Diskon' : 'Discount', value: '- ' + money(d.discount_total, cur, dec, s) });
    }
    totals.push({ label: labels.subtotal, value: money(d.total - d.tax_total, cur, dec, s), strong: true });
    if (s.showDpp && d.tax_total) {
      const t = d.lines.find((l) => l.tax_id);
      const tax = t ? db.get('SELECT * FROM taxes WHERE id=?', [t.tax_id]) : null;
      if (tax && tax.base_num !== tax.base_den) totals.push({ label: 'DPP (' + tax.base_num + '/' + tax.base_den + ')', value: money(Buku.tax.dpp(d.total - d.tax_total, tax), cur, dec, s) });
    }
    for (const [k, v] of taxes) totals.push({ label: k, value: money(v, cur, dec, s) });
    if (!taxes.size && d.doc_type !== 'sales_order') totals.push({ label: 'VAT', value: money(0, cur, dec, s) });
    totals.push({ label: labels.total, value: money(d.total, cur, dec, s), strong: true, grand: true });
    const extra = [];
    if (s.showPph23Info && d.doc_type !== 'credit_note') {
      const t = db.get("SELECT * FROM taxes WHERE kind='pph23' AND direction='withheld_by_customer' AND is_active=1 ORDER BY id LIMIT 1");
      if (t) extra.push((lang === 'id' ? 'PPh 23 (' + t.rate + '%) dipotong pelanggan: ' : 'PPh 23 (' + t.rate + '%) withheld by customer: ') + money(Buku.tax.amount(d.total - d.tax_total, t), cur, dec, Object.assign({}, s, { zeroAsDash: false })));
    }
    if (s.showIdrEquivalent && cur !== Buku.fx.base(db) && d.rate) {
      extra.push((lang === 'id' ? 'Setara ' : 'Equivalent to ') + 'IDR ' + Buku.money.format(Buku.money.toBase(d.total, dec, d.rate), 0, { locale: 'id' }) + ' (' + (lang === 'id' ? 'kurs ' : 'rate ') + Buku.money.formatRate(d.rate, 'id') + ')');
    }
    if (s.showPaid && d.doc_type === 'invoice' && d.amount_paid) {
      totals.push({ label: lang === 'id' ? 'Sudah dibayar' : 'Paid', value: '- ' + money(d.amount_paid, cur, dec, s) });
      totals.push({ label: lang === 'id' ? 'Sisa tagihan' : 'Balance due', value: money(Buku.docs.balance(d), cur, dec, s), strong: true });
    }
    const vars = {
      company: company.name, customer: partyFrom(d, db).bill_to, number: d.number || '', total: money(d.total, cur, dec, Object.assign({}, s, { zeroAsDash: false })),
      due_date: info.due_date, finance_phone: company.phone || '', invoice_ref: info.invoice_ref, address: company.address,
      pph23_rate: '2%', period: d.lines.filter((l) => l.start_date).map((l) => fmtDate(l.start_date, 'monthLong', lang) + ' – ' + fmtDate(l.end_date, 'monthLong', lang)).join(', '),
    };
    const blocks = Object.assign({}, s.blocks[d.doc_type] || {}, Object.fromEntries(Object.entries(d.text_blocks || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')));
    return {
      kind: d.doc_type, status: d.status, lang, company, party: partyFrom(d, db), info, lines, totals, extra, note: d.note || '', blocks, vars,
      currency: cur, terbilang: s.showTerbilang ? Buku.terbilang.words(d.total, cur, dec, lang) : '',
      signatory: s.signatoryName || (d.doc_type === 'sales_order' && rep ? rep.name : ''),
      signDate: fmtDate(d.approved_at ? d.date : d.date, s.dateFormat, lang),
      banks: bankDetails(db, cur, s.matchBankCurrency),
      voided: d.status === 'void', draft: d.status === 'draft', paid: d.status === 'paid' && d.doc_type === 'invoice',
    };
  }

  // ---------------- Rendering ----------------
  const FONTS = {
    sans: 'Arial, "Liberation Sans", "Helvetica Neue", Helvetica, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    humanist: '"Segoe UI", "Trebuchet MS", Tahoma, sans-serif',
  };

  const SOCIAL_ICONS = {
    website: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 10v7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46M14 3c.5 2.5 2.3 4 5 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  };

  function headerHtml(m, s, docKind) {
    const c = m.company;
    const socials = [];
    if (s.showSocials) {
      if (c.website) socials.push(['website', c.website]);
      ['linkedin', 'instagram', 'tiktok'].forEach((k) => { if (c.socials[k]) socials.push([k, c.socials[k]]); });
    }
    const logo = c.logo ? '<img class="d-logo d-logo-' + s.logoSize + '" src="' + h(c.logo) + '" alt="">' : '<div class="d-wordmark">' + h(c.name) + '</div>';
    return '<header class="d-head">' + '<div class="d-brand">' + logo + '</div>' +
      (socials.length ? '<ul class="d-socials">' + socials.map(([k, v]) => '<li><span class="d-ico">' + SOCIAL_ICONS[k] + '</span>' + h(v) + '</li>').join('') + '</ul>' : '') +
      '</header>' + (s.showTitle ? '<h1 class="d-title">' + h(s.titles[docKind] || '') + '</h1>' : '');
  }

  function companyPartyBox(m, s) {
    const c = m.company;
    const fields = s.party.filter((f) => f.show && (m.party[f.key] || f.key === 'bill_to'));
    return '<div class="d-box d-company">' +
      '<div class="d-co-name">' + h(c.name.toUpperCase()) + '</div>' +
      '<div class="d-co-addr">' + h(c.address).replace(/\n/g, '<br>') + (s.showNpwp && c.npwp ? '<br>NPWP: ' + h(c.npwp) : '') + '</div>' +
      '<table class="d-party">' + fields.map((f) => '<tr><th>' + h(f.label) + '</th><td class="d-colon">:</td><td>' + h(m.party[f.key]).replace(/\n/g, '<br>') + '</td></tr>').join('') + '</table></div>';
  }

  function infoBox(m, s) {
    const fields = (s.info[m.kind] || []).filter((f) => f.show);
    return '<table class="d-box d-info">' + fields.map((f) => '<tr><th>' + h(f.label) + '</th><td>' + h(m.info[f.key]) + '</td></tr>').join('') + '</table>';
  }

  function linesTable(m, s) {
    const cols = (s.columns[m.kind] || s.columns.invoice).filter((c) => c.show);
    const numeric = new Set(['qty', 'price', 'discount', 'amount', 'no']);
    const rows = m.lines.slice();
    while (rows.length < (s.minRows || 0)) rows.push(null);
    const emptyRow = (i) => '<tr class="d-empty">' + cols.map((c) => '<td class="' + (numeric.has(c.key) ? 'n' : '') + '">' +
      (c.key === 'no' ? String(i + 1) : c.key === 'discount' || c.key === 'amount' ? (s.zeroAsDash ? h(m.currency + ' -') : '') : '') + '</td>').join('') + '</tr>';
    const totalsColspan = Math.max(1, cols.length - 2);
    const noteCell = m.note ? '<strong>' + h(s.labels[m.kind] ? s.labels[m.kind].note : 'Note') + ':</strong> ' + h(m.note) : '';
    const totalsRows = m.totals.map((t, i) => '<tr class="d-tot' + (t.grand ? ' d-grand' : '') + '">' +
      (i === 0 ? '<td class="d-note" colspan="' + totalsColspan + '" rowspan="' + m.totals.length + '">' + noteCell + '</td>' : '') +
      '<th>' + h(t.label) + '</th><td class="n">' + h(t.value) + '</td></tr>').join('');
    return '<table class="d-lines"><thead><tr>' + cols.map((c) => '<th class="' + (numeric.has(c.key) ? 'n c-' + c.key : 'c-' + c.key) + '">' + h(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((l, i) => (l ? '<tr>' + cols.map((c) => '<td class="' + (numeric.has(c.key) ? 'n' : '') + ' c-' + c.key + '">' + h(l[c.key]).replace(/\n/g, '<br>') + '</td>').join('') + '</tr>' : emptyRow(i))).join('') +
      '</tbody><tbody class="d-totals">' + totalsRows + '</tbody></table>' +
      (m.extra.length ? '<div class="d-extra">' + m.extra.map((x) => '<div>' + h(x) + '</div>').join('') + '</div>' : '') +
      (m.terbilang ? '<div class="d-terbilang"><em>' + h(m.lang === 'id' ? 'Terbilang' : 'In words') + ':</em> ' + h(m.terbilang) + '</div>' : '');
  }

  function block(m, key, cls) {
    const html = markup(m.blocks[key], m.vars);
    return html ? '<div class="d-block d-' + (cls || key) + '">' + html + '</div>' : '';
  }

  function signatures(m, s) {
    const sig = s.signature[m.kind] || s.signature.invoice;
    if (!sig.ours && !sig.theirs) return '';
    const img = s.signatureImage ? '<img class="d-sig-img" src="' + h(s.signatureImage) + '" alt="">' : '';
    const stamp = s.stampImage ? '<img class="d-stamp-img" src="' + h(s.stampImage) + '" alt="">' : s.emeterai ? '<div class="d-emeterai">e-Meterai</div>' : '';
    const nameLine = (who, org) => '<div class="d-sig-name">' + (m.lang === 'id' ? 'Nama penandatangan' : 'Name of authorised signatory') + ' : ' + h(who || '') + '</div>' +
      '<div class="d-sig-org">' + (m.lang === 'id' ? 'Untuk dan atas nama' : 'For and on behalf of') + ': ' + h(org || '') + '</div>';
    const ours = sig.ours ? '<div class="d-sig">' + '<div class="d-sig-space">' + img + stamp + '</div><div class="d-sig-line"></div>' + nameLine(m.signatory, m.company.name) +
      (sig.showDate ? '<div class="d-sig-date">' + (m.lang === 'id' ? 'Tanggal' : 'Date') + ': ' + h(m.signDate) + '</div>' : '') +
      (sig.stampRequired ? '<div class="d-stamp-req">' + (m.lang === 'id' ? 'Wajib cap perusahaan' : 'Company Stamp Required') + '</div>' : '') + '</div>' : '';
    const theirs = sig.theirs ? '<div class="d-sig">' + '<div class="d-sig-space"></div><div class="d-sig-line"></div>' + nameLine(m.party.pic, m.party.bill_to) + '</div>' : '';
    return '<section class="d-signs"><div class="d-sig-label">' + h(sig.label) + '</div><div class="d-sig-row">' + ours + theirs + '</div></section>';
  }

  function paymentBox(m, s) {
    if (!s.showPayment || !m.banks.length || m.kind === 'credit_note') return '';
    const intro = markup(m.blocks.payment, m.vars);
    const L = m.lang === 'id' ? ['Detail Rekening Bank', 'Nama Rekening', 'Bank / Cabang', 'No. Rekening', 'SWIFT/BIC'] : ['Bank Account Details', 'Account Name', 'Bank / Branch', 'Account No', 'SWIFT/BIC'];
    return '<section class="d-box d-pay">' + intro + m.banks.map((b) => '<div class="d-bank"><strong>' + L[0] + (m.banks.length > 1 && b.currency ? ' (' + h(b.currency) + ')' : '') + ':</strong>' +
      '<table><tr><td>' + L[1] + '</td><td>: ' + h(b.account_name) + '</td></tr><tr><td>' + L[2] + '</td><td>: ' + h(b.bank) + '</td></tr>' +
      '<tr><td>' + L[3] + '</td><td>: ' + h(b.account_no) + '</td></tr>' + (b.swift ? '<tr><td>' + L[4] + '</td><td>: ' + h(b.swift) + '</td></tr>' : '') + '</table></div>').join('') + '</section>';
  }

  function footer(m, s) {
    if (!s.footerBand) return '';
    const text = String(s.footerText || '').replace(/\{(\w+)\}/g, (x, k) => (m.vars && m.vars[k] !== undefined ? m.vars[k] : k === 'address' ? m.company.address : x));
    return '<footer class="d-foot">' + h(text) + '</footer>';
  }

  function watermark(m, s) {
    if (!s.watermark) return '';
    const w = m.voided ? 'VOID' : m.draft ? 'DRAFT' : m.paid ? (m.lang === 'id' ? 'LUNAS' : 'PAID') : '';
    return w ? '<div class="d-watermark">' + w + '</div>' : '';
  }

  function paperStyle(s) {
    const accent = /^#[0-9a-fA-F]{3,8}$/.test(s.accent || '') ? s.accent : '#d91c1a';
    const bg = s.background && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(s.background) ? s.background : null;
    // Escaped once as a whole: font names and data URLs contain quotes.
    return h('--d-accent:' + accent + ';--d-font:' + (FONTS[s.font] || FONTS.sans) + ';--d-size:' + Number(s.fontSize || 8.5) + 'pt;' +
      (bg ? '--d-bg:url("' + bg + '");--d-bg-op:' + Number(s.backgroundOpacity || 0.12) + ';' : ''));
  }

  function wrap(s, inner, kind) {
    return '<article class="doc-paper d-layout-' + h(s.layout) + ' d-paper-' + h(s.paper) + ' d-m-' + h(s.margins) + ' d-kind-' + kind + (s.background && /^data:image\//.test(s.background) ? ' d-has-bg' : '') + '" style="' + paperStyle(s) + '">' +
      '<div class="d-inner">' + inner + '</div></article>';
  }

  /** Render a sales order, invoice or credit note. */
  function renderDoc(m, s) {
    const inner =
      watermark(m, s) + headerHtml(m, s, m.kind) +
      '<div class="d-top">' + companyPartyBox(m, s) + infoBox(m, s) + '</div>' +
      block(m, 'intro') + linesTable(m, s) + block(m, 'terms') + block(m, 'notes') + block(m, 'legal', 'legal d-box') +
      signatures(m, s) + paymentBox(m, s) + footer(m, s);
    return wrap(s, inner, m.kind);
  }

  // ---------------- Receipt (kwitansi) ----------------
  function receiptModel(db, paymentId, s) {
    const p = Buku.payments.load(db, paymentId);
    if (!p) throw new Buku.BukuError('not_found', 'Payment not found.');
    const lang = s.language === 'id' ? 'id' : 'en';
    const dec = Buku.fx.decimals(db, p.currency);
    const company = companyModel(db);
    const contact = p.contact_id ? db.get('SELECT * FROM contacts WHERE id=?', [p.contact_id]) : {};
    // Amount on the receipt: what the customer settled (cash + withholding), per document currency when single.
    const docCurs = new Set(p.allocations.map((a) => a.doc_currency));
    let amount = p.amount + p.fee, cur = p.currency, d2 = dec;
    if (p.allocations.length && docCurs.size === 1) {
      cur = [...docCurs][0];
      d2 = Buku.fx.decimals(db, cur);
      amount = p.allocations.reduce((x, a) => x + a.amount, 0) + (cur === p.currency ? p.unapplied : 0);
    }
    const wt = p.allocations.reduce((x, a) => x + a.withholding, 0);
    const forWhat = p.allocations.map((a) => a.doc_number).join(', ') || p.memo || '';
    return {
      kind: 'receipt', lang, company, number: p.number, date: fmtDate(p.date, s.dateFormat, lang), from: contact.name || '', amount: money(amount, cur, d2, Object.assign({}, s, { zeroAsDash: false })),
      words: Buku.terbilang.words(amount, cur, d2, lang), forWhat, withholding: wt ? money(wt, cur, d2, Object.assign({}, s, { zeroAsDash: false })) : '',
      received: money(p.amount, p.currency, dec, Object.assign({}, s, { zeroAsDash: false })), account: p.account_name, signatory: s.signatoryName, signDate: fmtDate(p.date, s.dateFormat, lang),
      voided: p.status === 'void', vars: { company: company.name, finance_phone: company.phone, address: company.address }, blocks: s.blocks.receipt, banks: [],
      party: { bill_to: contact.name, pic: contact.pic_name },
    };
  }

  function renderReceipt(m, s) {
    const L = m.lang === 'id'
      ? { no: 'No.', from: 'Telah terima dari', amount: 'Uang sejumlah', words: 'Terbilang', for: 'Untuk pembayaran', wt: 'PPh 23 dipotong', via: 'Diterima melalui', recv: 'Jumlah diterima' }
      : { no: 'No.', from: 'Received from', amount: 'The sum of', words: 'In words', for: 'Being payment for', wt: 'PPh 23 withheld', via: 'Received via', recv: 'Amount received' };
    const sigS = Object.assign({}, s, { signature: Object.assign({}, s.signature, { receipt: Object.assign({}, s.signature.receipt, { theirs: false }) }) });
    const inner = (m.voided ? '<div class="d-watermark">VOID</div>' : '') + headerHtml(m, Object.assign({}, s, { showTitle: true }), 'receipt') +
      '<div class="d-receipt">' +
      '<div class="d-r-no">' + L.no + ' ' + h(m.number) + ' · ' + h(m.date) + '</div>' +
      '<table class="d-r-table">' +
      '<tr><th>' + L.from + '</th><td>' + h(m.from) + '</td></tr>' +
      '<tr><th>' + L.words + '</th><td class="d-r-words"><em>' + h(m.words) + '</em></td></tr>' +
      '<tr><th>' + L.for + '</th><td>' + h(m.forWhat) + '</td></tr>' +
      (m.withholding ? '<tr><th>' + L.wt + '</th><td>' + h(m.withholding) + '</td></tr><tr><th>' + L.recv + '</th><td>' + h(m.received) + '</td></tr>' : '') +
      '<tr><th>' + L.via + '</th><td>' + h(m.account) + '</td></tr>' +
      '</table><div class="d-r-amount">' + h(m.amount) + '</div></div>' +
      block(m, 'notes') + signatures(m, sigS) + footer(m, s);
    return wrap(s, inner, 'receipt');
  }

  // ---------------- Statement ----------------
  function statementModel(db, contactId, currency, from, to, s) {
    const lang = s.language === 'id' ? 'id' : 'en';
    const st = Buku.reports2.statement(db, contactId, currency, from, to);
    const company = companyModel(db);
    const c = db.get('SELECT * FROM contacts WHERE id=?', [contactId]);
    const dec = Buku.fx.decimals(db, currency);
    const ms = Object.assign({}, s, { zeroAsDash: false });
    const kindLabel = lang === 'id'
      ? { invoice: 'Invoice', credit_note: 'Nota kredit', payment_in: 'Pembayaran', payment_out: 'Pengembalian', bill: 'Tagihan' }
      : { invoice: 'Invoice', credit_note: 'Credit note', payment_in: 'Payment', payment_out: 'Refund', bill: 'Bill' };
    return {
      kind: 'statement', lang, company, currency, party: { bill_to: c.name, pic: c.pic_name, phone: c.phone, address: c.billing_address, npwp: c.npwp, email: c.email },
      period: fmtDate(from, s.dateFormat, lang) + ' – ' + fmtDate(to, s.dateFormat, lang),
      opening: money(st.opening, currency, dec, ms), closing: money(st.closing, currency, dec, ms),
      rows: st.lines.map((l) => ({ date: fmtDate(l.date, s.dateFormat, lang), type: kindLabel[l.kind] || l.kind, ref: l.ref, due: l.due ? fmtDate(l.due, s.dateFormat, lang) : '',
        debit: l.amount > 0 ? money(l.amount, currency, dec, ms) : '', credit: l.amount < 0 ? money(-l.amount, currency, dec, ms) : '', balance: money(l.balance, currency, dec, ms) })),
      aging: st.aging ? st.buckets.map(([k, label]) => [label, money(st.aging[k], currency, dec, ms)]) : null,
      blocks: s.blocks.statement, vars: { company: company.name, finance_phone: company.phone, address: company.address }, banks: bankDetails(db, currency, s.matchBankCurrency),
      info: {}, signatory: s.signatoryName,
    };
  }

  function renderStatement(m, s) {
    const L = m.lang === 'id' ? ['Tanggal', 'Jenis', 'Referensi', 'Jatuh tempo', 'Tagihan', 'Pembayaran', 'Saldo', 'Saldo awal', 'Saldo akhir', 'Periode', 'Mata uang', 'Umur piutang']
      : ['Date', 'Type', 'Reference', 'Due', 'Charges', 'Payments', 'Balance', 'Opening balance', 'Closing balance', 'Period', 'Currency', 'Aging'];
    const inner = headerHtml(m, Object.assign({}, s, { showTitle: true }), 'statement') +
      '<div class="d-top">' + companyPartyBox(m, s) + '<table class="d-box d-info"><tr><th>' + L[9] + '</th><td>' + h(m.period) + '</td></tr><tr><th>' + L[10] + '</th><td>' + h(m.currency) + '</td></tr><tr><th>' + L[8] + '</th><td><strong>' + h(m.closing) + '</strong></td></tr></table></div>' +
      block(m, 'intro') +
      '<table class="d-lines d-statement"><thead><tr><th>' + L[0] + '</th><th>' + L[1] + '</th><th>' + L[2] + '</th><th>' + L[3] + '</th><th class="n">' + L[4] + '</th><th class="n">' + L[5] + '</th><th class="n">' + L[6] + '</th></tr></thead><tbody>' +
      '<tr class="d-muted"><td colspan="6">' + L[7] + '</td><td class="n">' + h(m.opening) + '</td></tr>' +
      m.rows.map((r) => '<tr><td>' + h(r.date) + '</td><td>' + h(r.type) + '</td><td>' + h(r.ref) + '</td><td>' + h(r.due) + '</td><td class="n">' + h(r.debit) + '</td><td class="n">' + h(r.credit) + '</td><td class="n">' + h(r.balance) + '</td></tr>').join('') +
      '</tbody><tbody class="d-totals"><tr class="d-tot d-grand"><td colspan="5"></td><th>' + L[8] + '</th><td class="n">' + h(m.closing) + '</td></tr></tbody></table>' +
      (m.aging ? '<table class="d-aging"><caption>' + L[11] + '</caption><tr>' + m.aging.map(([l]) => '<th>' + h(l) + '</th>').join('') + '</tr><tr>' + m.aging.map(([, v]) => '<td>' + h(v) + '</td>').join('') + '</tr></table>' : '') +
      paymentBox(Object.assign({}, m, { kind: 'statement' }), s) + footer(m, s);
    return wrap(s, inner, 'statement');
  }

  // ---------------- Template lookup ----------------
  function templateFor(db, kind, explicitId, contactId) {
    let row = null;
    if (explicitId) row = db.get('SELECT * FROM doc_templates WHERE id=?', [explicitId]);
    if (!row && contactId) {
      const cid = db.scalar('SELECT default_template_id FROM contacts WHERE id=?', [contactId]);
      if (cid) row = db.get('SELECT * FROM doc_templates WHERE id=?', [cid]);
    }
    if (!row) row = db.get("SELECT * FROM doc_templates WHERE doc_type=? AND is_default=1 ORDER BY id LIMIT 1", [kind]);
    if (!row) row = db.get("SELECT * FROM doc_templates WHERE doc_type IN (?, 'all') ORDER BY CASE doc_type WHEN ? THEN 0 ELSE 1 END, is_default DESC, id LIMIT 1", [kind, kind]);
    const stored = row ? JSON.parse(row.settings || '{}') : {};
    return { row, settings: resolve(stored, row ? row.layout : 'milikirumah') };
  }

  /** Render a document by id with its template (or an explicit settings object for previews). */
  function renderDocument(db, docId, opts) {
    opts = opts || {};
    const d = db.get('SELECT doc_type, template_id, contact_id FROM documents WHERE id=?', [docId]);
    const s = opts.settings ? resolve(opts.settings, opts.settings.layout) : templateFor(db, d.doc_type, d.template_id, d.contact_id).settings;
    return renderDoc(docModel(db, docId, s), s);
  }

  function renderPaymentReceipt(db, paymentId, opts) {
    opts = opts || {};
    const s = opts.settings ? resolve(opts.settings, opts.settings.layout) : templateFor(db, 'receipt').settings;
    return renderReceipt(receiptModel(db, paymentId, s), s);
  }

  function renderContactStatement(db, contactId, currency, from, to, opts) {
    opts = opts || {};
    const s = opts.settings ? resolve(opts.settings, opts.settings.layout) : templateFor(db, 'statement', null, contactId).settings;
    return renderStatement(statementModel(db, contactId, currency, from, to, s), s);
  }

  /** Sample model for the template editor when no real document exists yet. */
  function sampleModel(db, kind, s) {
    const lang = s.language === 'id' ? 'id' : 'en';
    const company = companyModel(db);
    const ms = Object.assign({}, s);
    const m = {
      kind, status: 'open', lang, company,
      party: { bill_to: 'PT. Tarumanagara Properti Indonesia', pic: 'Heri Arsiti', phone: '08985726325', address: 'Safira Residence Blok A1 No 7, Kel. Palumbonsari, Kec. Karawang Timur, Kab. Karawang', npwp: '32.152.956.1-297.000', email: 'finance@contoh.co.id' },
      info: { reference: 'MRPO-PU-202610-0029', number: kind === 'sales_order' ? 'SO-202610-0029' : kind === 'credit_note' ? 'CN-202610-0003' : 'INV-202610-0177', date: fmtDate('2026-10-12', s.dateFormat, lang),
        so_number: 'SO-202610-0029', invoice_ref: 'INV-202610-0177', payment_term: 'Payment Before Delivery', sales_rep: 'Putri', currency: 'IDR', validity: '1 Month', due_date: fmtDate('2026-10-19', s.dateFormat, lang), terms_days: lang === 'id' ? '7 Hari' : '7 Days', faktur: '' },
      lines: [{ no: '1', item: 'Tasya/Vero', description: kind === 'sales_order' ? 'a system that can help perform BI checking in real time + profiling' : 'SaaS - 6 Months Contract', start: fmtDate('2026-10-01', s.periodFormat, lang), end: fmtDate('2027-04-01', s.periodFormat, lang),
        qty: '6 Months', price: money(2000000, 'IDR', 0, ms), discount: money(0, 'IDR', 0, ms), amount: money(12000000, 'IDR', 0, ms), note: '6', tax: 'VAT – 11%' }],
      totals: [{ label: (s.labels[kind] || s.labels.invoice).subtotal, value: money(12000000, 'IDR', 0, ms), strong: true }, { label: 'VAT – 11%', value: money(1320000, 'IDR', 0, ms) }, { label: (s.labels[kind] || s.labels.invoice).total, value: money(13320000, 'IDR', 0, ms), strong: true, grand: true }],
      extra: s.showPph23Info ? [(lang === 'id' ? 'PPh 23 (2%) dipotong pelanggan: ' : 'PPh 23 (2%) withheld by customer: ') + money(240000, 'IDR', 0, Object.assign({}, s, { zeroAsDash: false }))] : [],
      note: kind === 'sales_order' ? '44 Hit/Month' : 'SaaS 6 Months (October 2026 - April 2027) | 50 hits/month | Total: 300 Tokens', currency: 'IDR',
      blocks: s.blocks[kind] || {}, terbilang: s.showTerbilang ? Buku.terbilang.words(13320000, 'IDR', 0, lang) : '', signatory: s.signatoryName || 'Denny', signDate: fmtDate('2026-10-12', s.dateFormat, lang),
      banks: bankDetails(db, 'IDR', s.matchBankCurrency), voided: false, draft: false, paid: false,
    };
    m.vars = { company: company.name, customer: m.party.bill_to, number: m.info.number, total: 'IDR 13.320.000', due_date: m.info.due_date, finance_phone: company.phone || '', invoice_ref: 'INV-202610-0177', address: company.address, pph23_rate: '2%', period: 'October 2026 – April 2027' };
    return m;
  }

  function renderSample(db, kind, settings) {
    const s = resolve(settings, settings.layout);
    if (kind === 'receipt') {
      const company = companyModel(db);
      const lang = s.language === 'id' ? 'id' : 'en';
      return renderReceipt({ kind: 'receipt', lang, company, number: 'RCV-202610-0042', date: fmtDate('2026-10-15', s.dateFormat, lang), from: 'PT. Tarumanagara Properti Indonesia', amount: 'IDR 13.320.000',
        words: Buku.terbilang.words(13320000, 'IDR', 0, lang), forWhat: 'INV-202610-0177', withholding: 'IDR 240.000', received: 'IDR 13.080.000', account: 'Bank BCA (IDR)', signatory: s.signatoryName || 'Denny',
        signDate: fmtDate('2026-10-15', s.dateFormat, lang), voided: false, vars: { company: company.name, finance_phone: company.phone, address: company.address }, blocks: s.blocks.receipt, banks: [], party: {} }, s);
    }
    if (kind === 'statement') {
      const company = companyModel(db);
      const lang = s.language === 'id' ? 'id' : 'en';
      const ms = Object.assign({}, s, { zeroAsDash: false });
      return renderStatement({ kind: 'statement', lang, company, currency: 'IDR', party: { bill_to: 'PT. Tarumanagara Properti Indonesia', pic: 'Heri Arsiti', phone: '08985726325', address: 'Karawang', npwp: '32.152.956.1-297.000', email: '' },
        period: fmtDate('2026-07-01', s.dateFormat, lang) + ' – ' + fmtDate('2026-10-31', s.dateFormat, lang), opening: money(0, 'IDR', 0, ms), closing: money(13320000, 'IDR', 0, ms),
        rows: [{ date: fmtDate('2026-07-12', s.dateFormat, lang), type: 'Invoice', ref: 'INV-202607-0101', due: fmtDate('2026-07-19', s.dateFormat, lang), debit: money(13320000, 'IDR', 0, ms), credit: '', balance: money(13320000, 'IDR', 0, ms) },
          { date: fmtDate('2026-07-18', s.dateFormat, lang), type: lang === 'id' ? 'Pembayaran' : 'Payment', ref: 'RCV-202607-0040', due: '', debit: '', credit: money(13320000, 'IDR', 0, ms), balance: money(0, 'IDR', 0, ms) },
          { date: fmtDate('2026-10-12', s.dateFormat, lang), type: 'Invoice', ref: 'INV-202610-0177', due: fmtDate('2026-10-19', s.dateFormat, lang), debit: money(13320000, 'IDR', 0, ms), credit: '', balance: money(13320000, 'IDR', 0, ms) }],
        aging: Buku.reports2.BUCKETS.map(([k, l]) => [l, money(k === 'current' ? 13320000 : 0, 'IDR', 0, ms)]), blocks: s.blocks.statement, vars: { company: company.name, finance_phone: company.phone, address: company.address }, banks: bankDetails(db, 'IDR', s.matchBankCurrency), info: {} }, s);
    }
    return renderDoc(sampleModel(db, kind, s), s);
  }

  Buku.templates = {
    LAYOUTS, DOC_TYPES, INFO_FIELDS, COLUMNS, PARTY_FIELDS, BLOCKS, TITLES, defaultSettings, resolve, markup, fmtDate, templateFor,
    docModel, renderDoc, renderDocument, receiptModel, renderReceipt, renderPaymentReceipt, statementModel, renderStatement, renderContactStatement, renderSample, sampleModel,
  };
})();
