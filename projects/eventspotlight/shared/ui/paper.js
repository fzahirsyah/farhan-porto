/* Event Spotlight — paper engine. Real-size sheets (A4 / half-A4) built in millimetres, shown scaled in a viewer
   (fit width · 100% · two pages), and exported to PDF by reading the positions of the rendered sheet — so the PDF
   is the same page, line for line, as the preview. Also lays out deed text (monospace, dash-filled lines). */
(function () {
  const ES = (window.ES = window.ES || {});
  const PX = 96 / 25.4; // CSS px per mm
  const SIZES = { F4: [215, 330], A4: [210, 297], A5L: [210, 148] };
  const SIZE_LABEL = { F4: 'F4 / Folio (215 × 330 mm)', A4: 'A4 (210 × 297 mm)', A5L: 'Half A4 landscape (210 × 148 mm)' };
  const esc = (s) => ES.fmt.esc(s);

  // ---------- sheets ----------
  function sheet(size, margins, cls) {
    const [w, h] = SIZES[size] || size; const m = margins || { top: 15, right: 15, bottom: 15, left: 15 };
    const el = document.createElement('div'); el.className = 'sheet ' + (cls || '');
    el.style.cssText = `width:${w}mm;height:${h}mm;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
    el.dataset.w = w; el.dataset.h = h;
    const c = document.createElement('div'); c.className = 'sheet-c'; el.appendChild(c);
    return el;
  }

  // ---------- viewer ----------
  /* container gets a toolbar + scaled pages. pages: array of sheet elements. */
  function viewer(container, pages, opts) {
    opts = opts || {};
    let mode = viewer.mode || 'fit';
    container.innerHTML = `<div class="pv-bar no-print">${opts.toolbar || ''}<span class="spacer"></span><span class="small muted">${pages.length} pages · ${esc(opts.label || '')}</span>
      <div class="seg">${[['fit', 'Fit width'], ['100', '100%'], ['two', 'Two pages']].map(([k, l]) => `<button data-z="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div><div class="pv-pages"></div>`;
    const host = container.querySelector('.pv-pages');
    pages.forEach((p, i) => { const slot = document.createElement('div'); slot.className = 'pv-slot'; slot.appendChild(p); const n = document.createElement('div'); n.className = 'pv-n'; n.textContent = (i + 1) + ' / ' + pages.length; slot.appendChild(n); host.appendChild(slot); });
    const apply = () => {
      const w = Number(pages[0] && pages[0].dataset.w) || 210, h = Number(pages[0] && pages[0].dataset.h) || 297;
      const avail = host.clientWidth - 24; const pw = w * PX;
      const z = mode === '100' ? 1 : mode === 'two' ? Math.min(1, (avail - 16) / 2 / pw) : Math.min(1.4, avail / pw);
      host.classList.toggle('two', mode === 'two');
      host.querySelectorAll('.pv-slot').forEach((s) => { s.style.width = w * PX * z + 'px'; s.style.height = h * PX * z + 22 + 'px'; s.firstChild.style.transform = `scale(${z})`; });
    };
    container.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => { mode = viewer.mode = b.dataset.z; container.querySelectorAll('[data-z]').forEach((x) => x.classList.toggle('on', x === b)); apply(); }));
    apply();
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => apply()); ro.observe(host); }
    return { apply };
  }

  // ---------- DOM → PDF ----------
  function rgb(s) { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); const a = p.length > 3 ? p[3] : 1; if (a === 0) return null; return p.slice(0, 3).map((c) => Math.round(c * a + 255 * (1 - a))); }
  async function toPdf(pages, filename) {
    if (!window.jspdf) { ES.ui.toast('PDF library did not load', 'err'); return; }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const w = Number(pages[0].dataset.w), h = Number(pages[0].dataset.h);
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait' });
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-30000px;top:0;z-index:-1'; document.body.appendChild(host);
    pages.forEach((src, i) => {
      if (i) pdf.addPage([w, h], w > h ? 'landscape' : 'portrait');
      const pg = src.cloneNode(true); pg.style.transform = 'none'; host.appendChild(pg);
      const base = pg.getBoundingClientRect(); const mm = (v) => v / PX;
      // boxes: backgrounds & borders
      pg.querySelectorAll('*').forEach((el) => {
        if (el.closest('[data-pdf-skip],[data-pdf-stamp]')) return;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        const x = mm(r.left - base.left), y = mm(r.top - base.top), ww = mm(r.width), hh = mm(r.height);
        const bg = rgb(cs.backgroundColor); if (bg && !(bg[0] === 255 && bg[1] === 255 && bg[2] === 255)) { pdf.setFillColor(...bg); pdf.rect(x, y, ww, hh, 'F'); }
        [['Top', x, y, x + ww, y], ['Bottom', x, y + hh, x + ww, y + hh], ['Left', x, y, x, y + hh], ['Right', x + ww, y, x + ww, y + hh]].forEach(([s, x1, y1, x2, y2]) => {
          const bw = parseFloat(cs['border' + s + 'Width']); const st = cs['border' + s + 'Style']; if (!bw || st === 'none') return;
          const c = rgb(cs['border' + s + 'Color']); if (!c) return; pdf.setDrawColor(...c); pdf.setLineWidth(mm(bw));
          if (st === 'dashed' || st === 'dotted') pdf.setLineDashPattern([1, 1], 0); else pdf.setLineDashPattern([], 0);
          pdf.line(x1, y1, x2, y2);
        });
      });
      pdf.setLineDashPattern([], 0);
      // rotated stamps
      pg.querySelectorAll('[data-pdf-stamp]').forEach((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const c = rgb(cs.color) || [47, 125, 91];
        pdf.setTextColor(...c.map((v) => Math.round(v + (255 - v) * 0.75))); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(parseFloat(cs.fontSize) * 0.75);
        pdf.text(el.textContent.trim(), mm(r.left - base.left + r.width / 2), mm(r.top - base.top + r.height / 2), { align: 'center', baseline: 'middle', angle: Number(el.dataset.pdfStamp) || 0 }); });
      // text runs
      const walker = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT); let node;
      while ((node = walker.nextNode())) {
        const par = node.parentElement; if (!par || par.closest('[data-pdf-stamp],[data-pdf-skip]')) continue;
        if (!node.nodeValue.trim()) continue;
        const cs = getComputedStyle(par); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const mono = /mono|courier|consol|menlo/i.test(cs.fontFamily);
        const fam = mono ? 'courier' : 'helvetica'; const bold = parseInt(cs.fontWeight, 10) >= 600; const ital = cs.fontStyle === 'italic';
        pdf.setFont(fam, bold && ital ? 'bolditalic' : bold ? 'bold' : ital ? 'italic' : 'normal');
        pdf.setFontSize(parseFloat(cs.fontSize) * 0.75); pdf.setTextColor(...(rgb(cs.color) || [0, 0, 0]));
        const cSp = parseFloat(cs.letterSpacing) || 0; const align = cs.textAlign;
        const text = node.nodeValue; const toks = text.match(/\S+|\s+/g) || []; let off = 0; let line = null; const lines = [];
        toks.forEach((t) => {
          const rg = document.createRange(); rg.setStart(node, off); rg.setEnd(node, off + t.length); off += t.length;
          const rects = rg.getClientRects(); const r = rects[rects.length - 1] || rg.getBoundingClientRect(); if (!r || (!r.width && !/\S/.test(t))) { if (line) line.t += t; return; }
          if (!line || Math.abs(r.top - line.top) > 2) { if (line) lines.push(line); if (!/\S/.test(t)) { line = null; return; } line = { t, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }
          else { line.t += t; line.right = Math.max(line.right, r.right); line.bottom = Math.max(line.bottom, r.bottom); }
        });
        if (line) lines.push(line);
        lines.forEach((l) => {
          const s = cs.whiteSpace.startsWith('pre') ? l.t.replace(/\s+$/, '') : l.t.replace(/\s+/g, ' ').trim(); if (!s) return;
          const y = mm((l.top + l.bottom) / 2 - base.top); const o = { baseline: 'middle' }; if (cSp) o.charSpace = mm(cSp);
          if (align === 'right' || align === 'end') pdf.text(s, mm(l.right - base.left), y, Object.assign(o, { align: 'right' }));
          else if (align === 'center' && !mono) pdf.text(s, mm((l.left + l.right) / 2 - base.left), y, Object.assign(o, { align: 'center' }));
          else pdf.text(s, mm(l.left - base.left), y, o);
        });
      }
      host.removeChild(pg);
    });
    host.remove();
    pdf.save(filename || 'document.pdf');
  }

  ES.paper = { PX, SIZES, SIZE_LABEL, sheet, viewer, toPdf };
})();
