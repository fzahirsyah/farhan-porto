/* Event Spotlight — business documents (quotation, contract, invoice, receipt, PO, proposal, report) laid out on real A4 sheets
   (receipt: half A4 landscape). Long tables continue on the next page with a short header. Preview and PDF come from the same sheets
   (ES.paper), so they match page for page.
   doc = { kind:'standard'|'receipt', title, no, meta:[[k,v]], to:{label, lines:[]}, blocks:[...], sign:{city,date,name,title}, stamp, paper, cover:{title,sub},
           kw:{from,amount,for,method}, notes:[] }
   blocks: {t:'h2',text} {t:'p',text} {t:'clause',n,text} {t:'table',head,rows,numCols,colW} {t:'totals',rows:[[label,value,bold]]} {t:'words',text} {t:'spacer',mm} */
(function () {
  const ES = (window.ES = window.ES || {});
  const esc = (s) => ES.fmt.esc(s);
  const org = () => ES.db.get('SELECT * FROM org WHERE id=1') || {};

  function headHTML(doc, o, cont, page) {
    return `<div class="dv-head"><div><b class="dv-name">${esc(o.name || '')}</b>
      ${cont ? '' : `<div>${esc(o.legal_name || '')}</div><div>${esc([o.address, o.city].filter(Boolean).join(', '))}</div><div>${esc([o.phone, o.email].filter(Boolean).join(' · '))}${o.npwp ? ' · NPWP ' + esc(o.npwp) : ''}</div>`}</div>
      <div class="dv-title"><b>${esc(doc.title)}</b><div>${esc(doc.no || '')}</div>${cont ? `<div class="dv-cont">continued · page ${page}</div>` : ''}</div></div>`;
  }
  function signHTML(doc, o) {
    if (!doc.sign) return '';
    const two = doc.sign.counter ? `<div class="dv-sign"><br>${esc(doc.sign.counterTitle || '')}<div class="dv-space"></div><b>${esc(doc.sign.counter)}</b></div>` : '';
    return `${two}<div class="dv-sign">${esc(doc.sign.city || o.city || '')}, ${ES.fmt.date(doc.sign.date || ES.fmt.today(), 'long')}<br>${esc(doc.sign.title || '')}
      ${doc.meterai ? '<div class="dv-meterai">Stamp duty<br>' + esc(doc.meterai) + '</div>' : '<div class="dv-space"></div>'}<b>${esc(doc.sign.name || o.signatory || '')}</b></div>`;
  }

  function build(doc) {
    const o = org(); const P = ES.paper;
    const paper = doc.paper || (doc.kind === 'receipt' ? 'A5L' : 'A4');
    const margins = doc.kind === 'receipt' ? { top: 12, right: 14, bottom: 12, left: 14 } : { top: 16, right: 16, bottom: 16, left: 18 };
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-30000px;top:0;visibility:hidden'; document.body.appendChild(host);
    const pages = []; let c, tbody;
    const fits = () => c.scrollHeight <= c.clientHeight + 1;
    const newPage = (cont) => {
      const sh = P.sheet(paper, margins, 'biz'); host.appendChild(sh); pages.push(sh); c = sh.firstChild;
      c.innerHTML = headHTML(doc, o, cont, pages.length);
      if (!cont && doc.kind !== 'receipt') c.insertAdjacentHTML('beforeend', `<div class="dv-meta"><div>${doc.to ? `<div class="dv-lbl">${esc(doc.to.label || 'To')}</div>${doc.to.lines.filter(Boolean).map((l, i) => (i ? `<div>${esc(l)}</div>` : `<b>${esc(l)}</b>`)).join('')}` : ''}</div>
        <table>${(doc.meta || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table></div>`);
      tbody = null;
    };
    const addBlock = (html) => { c.insertAdjacentHTML('beforeend', html); if (!fits() && c.children.length > 2) { c.lastElementChild.remove(); newPage(true); c.insertAdjacentHTML('beforeend', html); } };
    const tableHTML = (b) => {
      const nc = new Set(b.numCols || []);
      return `<table class="dv-items"><colgroup>${(b.colW || b.head.map((h, i) => (i === 0 && /^no$/i.test(h) ? 6 : /^qty$/i.test(h) ? 8 : nc.has(i) ? 16 : ''))).map((w) => `<col${w ? ` style="width:${w}%"` : ''}>`).join('')}</colgroup>
      <thead><tr>${b.head.map((h, i) => `<th class="${nc.has(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
    };
    newPage(false);
    if (doc.cover) addBlock(`<div class="dv-cover"><h1>${esc(doc.cover.title)}</h1><div class="sub">${esc(doc.cover.sub || '')}</div></div>`);
    if (doc.kind === 'receipt') {
      const k = doc.kw;
      c.insertAdjacentHTML('beforeend', `<table class="dv-kw"><tr><td>Received from</td><td>:</td><td><b>${esc(k.from)}</b></td></tr>
        <tr><td>Amount in words</td><td>:</td><td><i class="dv-wordsbox">${esc(ES.fmt.rupiahWords(k.amount))}</i></td></tr>
        <tr><td>For payment of</td><td>:</td><td>${esc(k.for)}</td></tr><tr><td>Method</td><td>:</td><td>${esc(k.method || '-')}</td></tr></table>
        <div class="dv-foot"><div><div class="dv-amount">${esc(ES.fmt.rp(k.amount))}</div>${(doc.notes || []).map((n) => `<div class="dv-notes">${esc(n)}</div>`).join('')}</div>${signHTML(doc, o)}</div>`);
    } else {
      (doc.blocks || []).forEach((b) => {
        if (b.t === 'h2') addBlock(`<div class="dv-h2">${esc(b.text)}</div>`);
        else if (b.t === 'p') addBlock(`<div class="dv-p">${esc(b.text).replace(/\n/g, '<br>')}</div>`);
        else if (b.t === 'clause') addBlock(`<div class="dv-clause"><b>${esc(b.n)}</b>${esc(b.text)}</div>`);
        else if (b.t === 'spacer') addBlock(`<div style="height:${b.mm || 4}mm"></div>`);
        else if (b.t === 'words') addBlock(`<div class="dv-words">${esc(b.label || 'Amount in words')}: <i>${esc(b.text)}</i></div>`);
        else if (b.t === 'totals') addBlock(`<table class="dv-tot">${b.rows.map(([k, v, bold]) => `<tr class="${bold ? 'b' : ''}"><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`);
        else if (b.t === 'table') {
          const nc = new Set(b.numCols || []); tbody = null;
          b.rows.forEach((r) => {
            const tr = `<tr>${r.map((v, i) => `<td class="${nc.has(i) ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`;
            if (!tbody) { c.insertAdjacentHTML('beforeend', tableHTML(b)); tbody = c.querySelector('.dv-items:last-of-type tbody'); }
            tbody.insertAdjacentHTML('beforeend', tr);
            if (!fits() && tbody.children.length > 1) { tbody.lastElementChild.remove(); newPage(true); c.insertAdjacentHTML('beforeend', tableHTML(b)); tbody = c.querySelector('.dv-items:last-of-type tbody'); tbody.insertAdjacentHTML('beforeend', tr); }
          });
          tbody = null;
        }
      });
      addBlock(`<div class="dv-foot"><div class="dv-notes">${(doc.notes || []).map((n) => `<div>${esc(n)}</div>`).join('')}</div>${signHTML(doc, o)}</div>`);
    }
    if (doc.stamp) pages[pages.length - 1].insertAdjacentHTML('beforeend', `<div class="dv-stamp" data-pdf-stamp="16">${esc(doc.stamp)}</div>`);
    pages.forEach((p) => host.removeChild(p)); host.remove();
    return pages;
  }
  const fname = (doc) => ES.exp.fileName(doc.title + ' ' + (doc.no || ''), 'pdf');
  async function pdf(doc, filename) { await ES.paper.toPdf(build(doc), filename || fname(doc)); }
  function show(doc, filename) {
    let v = document.querySelector('.docview');
    if (!v) { v = document.createElement('div'); v.className = 'docview'; document.body.appendChild(v); }
    v.innerHTML = `<div class="dv-wrap"><div class="dv-bar no-print"><b>${esc(doc.title)} ${esc(doc.no || '')}</b><span class="spacer"></span><button class="btn" data-dv="pdf">⬇ PDF</button><button class="btn" data-dv="print">Print</button><button class="btn primary" data-dv="close">Close</button></div><div class="dv-view"></div></div>`;
    v.classList.add('open'); document.body.classList.add('dv-open');
    const pages = build(doc);
    const key = Object.keys(ES.paper.SIZES).find((k) => String(ES.paper.SIZES[k]) === [pages[0].dataset.w, pages[0].dataset.h].join(','));
    ES.paper.viewer(v.querySelector('.dv-view'), pages, { label: ES.paper.SIZE_LABEL[key] || '' });
    v.onclick = (e) => { const b = e.target.closest('[data-dv]'); if (!b) return; if (b.dataset.dv === 'pdf') ES.paper.toPdf(pages, filename || fname(doc)); else if (b.dataset.dv === 'print') window.print(); else close(); };
  }
  function close() { const v = document.querySelector('.docview'); if (v) v.classList.remove('open'); document.body.classList.remove('dv-open'); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.docview.open')) { e.stopImmediatePropagation(); close(); } }, true);

  // ---- document models from database rows ----
  function terms(doc) { return doc.terms ? doc.terms.split('\n').filter(Boolean) : []; }
  function fromDocument(d) {
    const lines = JSON.parse(d.lines || '[]'); const o = org(); const party = d.party_name;
    const kindLabel = { quotation: 'Quotation', contract: 'Contract', invoice: 'Invoice', receipt: 'Receipt' }[d.type] || d.type;
    if (d.type === 'receipt') {
      return { kind: 'receipt', title: 'Receipt', no: d.no, sign: { city: o.city, date: d.issue_date, title: o.name, name: o.signatory }, meterai: d.stamp ? ES.fmt.rp(d.stamp) : null,
        kw: { from: party, amount: d.total, for: (lines[0] && lines[0].desc) || 'Payment', method: (JSON.parse(d.notes || '{}').method) || 'Bank transfer' }, notes: terms(d), stamp: 'PAID' };
    }
    if (d.type === 'contract') {
      const t = JSON.parse(d.notes || '{}');
      const ev = ES.db.get('SELECT * FROM events WHERE id=?', [d.event_id]) || {};
      const cl = (t.clauses || []).map((x, i) => ({ t: 'clause', n: 'Article ' + (i + 1) + '.', text: x }));
      return { title: 'Contract', no: d.no, to: { label: 'Between', lines: [o.legal_name || o.name, 'and', party, d.party_address] }, meta: [['Date', ES.fmt.date(d.issue_date, 'long')], ['Event', ev.name || ''], ['Value', ES.fmt.rp(d.total)]],
        blocks: [{ t: 'p', text: t.preamble || 'The parties agree as follows.' }].concat(cl, [{ t: 'table', head: ['No', 'Item', 'Amount'], rows: lines.map((l, i) => [i + 1, l.desc, ES.fmt.rp(l.qty * l.price)]), numCols: [2], colW: [8, 62, 30] }, { t: 'totals', rows: [['Total', ES.fmt.rp(d.total), true]] }]),
        sign: { city: o.city, date: d.issue_date, title: o.name, name: o.signatory, counter: party, counterTitle: 'For the other party' }, meterai: d.stamp ? ES.fmt.rp(d.stamp) : null, notes: [] };
    }
    const rows = lines.map((l, i) => [i + 1, l.desc, l.qty, ES.fmt.rp(l.price), ES.fmt.rp(l.qty * l.price)]);
    const tot = [['Subtotal', ES.fmt.rp(d.subtotal)]]; if (d.tax_amount) tot.push(['VAT', ES.fmt.rp(d.tax_amount)]); if (d.stamp) tot.push(['Stamp duty', ES.fmt.rp(d.stamp)]); tot.push([d.type === 'invoice' ? 'Total due' : 'Total', ES.fmt.rp(d.total), true]);
    if (d.paid && d.type === 'invoice') tot.push(['Paid', ES.fmt.rp(d.paid)], ['Balance', ES.fmt.rp(d.total - d.paid), true]);
    const bank = [o.bank_name, o.bank_acc, o.bank_holder].filter(Boolean).join(' · ');
    return { title: kindLabel, no: d.no, to: { label: 'Bill to', lines: [party, d.party_address] }, meta: [['Date', ES.fmt.date(d.issue_date)], d.due_date ? ['Due', ES.fmt.date(d.due_date)] : null].filter(Boolean),
      blocks: [{ t: 'table', head: ['No', 'Description', 'Qty', 'Unit price', 'Amount'], rows, numCols: [2, 3, 4], colW: [6, 44, 8, 20, 22] }, { t: 'totals', rows: tot }, { t: 'words', text: ES.fmt.rupiahWords(d.total) }],
      notes: terms(d).concat(d.type === 'invoice' && bank ? ['Pay to: ' + bank] : []), sign: { city: o.city, date: d.issue_date, title: o.name, name: o.signatory }, stamp: d.type === 'invoice' && d.status === 'paid' ? 'PAID' : null };
  }

  ES.docs = { build, pdf, show, close, fromDocument };
})();
