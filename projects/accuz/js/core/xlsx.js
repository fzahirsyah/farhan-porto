/* Buku — minimal .xlsx reader and writer (no library). Reads every sheet as rows of plain values;
   writes simple workbooks (inline strings, numbers, dates, a bold header row). */
(function () {
  'use strict';
  const Buku = window.Buku;
  const E = (code, message) => new Buku.BukuError(code, message);

  // ---------- zip ----------
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  async function inflate(data) {
    if (typeof DecompressionStream === 'undefined') throw E('xlsx_browser', 'This browser cannot open .xlsx files. Use a recent Chrome, Edge, Firefox or Safari.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Map of file name → Uint8Array for every file in a zip. */
  async function unzip(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw E('xlsx_format', 'This file is not an .xlsx workbook. In Excel, use File → Save As → Excel Workbook (.xlsx).');
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    const dec = new TextDecoder();
    const files = {};
    for (let n = 0; n < count; n++) {
      if (u32(b, p) !== 0x02014b50) throw E('xlsx_format', 'The .xlsx file is damaged.');
      const method = u16(b, p + 10), csize = u32(b, p + 20), nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), off = u32(b, p + 42);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const start = off + 30 + u16(b, off + 26) + u16(b, off + 28);
      const raw = b.subarray(start, start + csize);
      if (method === 0) files[name] = raw;
      else if (method === 8) files[name] = await inflate(raw);
      else throw E('xlsx_format', 'Unsupported compression in the .xlsx file.');
    }
    return files;
  }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  /** Store-only zip from [{name, data:string|Uint8Array}]. */
  function zip(entries) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const le = (n, bytes) => { const a = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) a[i] = (n >>> (8 * i)) & 0xff; return a; };
    for (const e of entries) {
      const name = enc.encode(e.name);
      const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
      const crc = crc32(data);
      const head = [le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), name];
      const cen = [le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), name];
      head.forEach((x) => parts.push(x)); parts.push(data);
      offset += head.reduce((s, x) => s + x.length, 0) + data.length;
      cen.forEach((x) => central.push(x));
    }
    const csize = central.reduce((s, x) => s + x.length, 0);
    const end = [le(0x06054b50, 4), le(0, 2), le(0, 2), le(entries.length, 2), le(entries.length, 2), le(csize, 4), le(offset, 4), le(0, 2)];
    const all = parts.concat(central, end);
    const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
    let o = 0; for (const x of all) { out.set(x, o); o += x.length; }
    return out;
  }

  // ---------- read ----------
  const xml = (bytes) => new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  const kids = (el, local) => Array.from(el.getElementsByTagNameNS('*', local));
  const textOf = (el) => kids(el, 't').map((t) => t.textContent).join('');

  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  /** Date number formats (built-in ids and custom codes) so date cells come back as YYYY-MM-DD. */
  function dateStyles(files) {
    const f = files['xl/styles.xml'];
    if (!f) return new Set();
    const doc = xml(f);
    const custom = {};
    kids(doc, 'numFmt').forEach((n) => { custom[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
    const isDate = (id) => { const n = Number(id); if ((n >= 14 && n <= 22) || (n >= 45 && n <= 47)) return true; const code = (custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''); return /[dmy]/i.test(code) && !/^[#0.,% ]*$/.test(code); };
    const out = new Set();
    const xfs = kids(doc, 'cellXfs')[0];
    if (xfs) kids(xfs, 'xf').forEach((x, i) => { if (isDate(x.getAttribute('numFmtId'))) out.add(i); });
    return out;
  }

  function serialToIso(v) {
    const ms = Math.round((Number(v) - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }

  /** Read a workbook: { sheets: [{ name, rows: [[value,...]] }] }. Values are strings, numbers, booleans or ISO dates. */
  async function read(buf) {
    const files = await unzip(buf);
    if (!files['xl/workbook.xml']) throw E('xlsx_format', 'This file is not an .xlsx workbook. In Excel, use File → Save As → Excel Workbook (.xlsx).');
    const wb = xml(files['xl/workbook.xml']);
    const rels = {};
    if (files['xl/_rels/workbook.xml.rels']) kids(xml(files['xl/_rels/workbook.xml.rels']), 'Relationship').forEach((r) => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const shared = files['xl/sharedStrings.xml'] ? kids(xml(files['xl/sharedStrings.xml']), 'si').map(textOf) : [];
    const dates = dateStyles(files);
    const sheets = [];
    for (const s of kids(wb, 'sheet')) {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const f = files[target];
      if (!f) continue;
      const doc = xml(f);
      const rows = [];
      kids(doc, 'row').forEach((r, ri) => {
        const rn = Number(r.getAttribute('r')) || ri + 1;
        const row = [];
        kids(r, 'c').forEach((c, ci) => {
          const idx = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : ci;
          const tp = c.getAttribute('t');
          const vEl = kids(c, 'v')[0];
          const v = vEl ? vEl.textContent : null;
          let val = null;
          if (tp === 's') val = v === null ? null : shared[Number(v)];
          else if (tp === 'inlineStr') val = textOf(c);
          else if (tp === 'b') val = v === '1';
          else if (tp === 'str' || tp === 'e') val = v;
          else if (tp === 'd') val = v ? v.slice(0, 10) : null;
          else if (v !== null && v !== '') { const n = Number(v); val = dates.has(Number(c.getAttribute('s') || 0)) && n > 0 && n < 2958466 ? serialToIso(n) : n; }
          row[idx] = val;
        });
        rows[rn - 1] = row;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      sheets.push({ name: s.getAttribute('name'), rows });
    }
    return { sheets };
  }

  // ---------- write ----------
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const isoToSerial = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000 + 25569;

  /**
   * sheets: [{ name, rows: [[...]], widths?: [n], header?: true }]. Cell values: string, number, boolean, null,
   * or { date: 'YYYY-MM-DD' } / { money: n } / { text: s, bold: true }. Returns a Uint8Array .xlsx.
   */
  function write(sheets) {
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    const files = [];
    sheets.forEach((sh, si) => {
      const header = sh.header !== false;
      const rowsXml = sh.rows.map((row, ri) => '<row r="' + (ri + 1) + '">' + row.map((v, ci) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = colName(ci) + (ri + 1);
        const hs = header && ri === 0 ? ' s="1"' : '';
        if (typeof v === 'object' && v.date) return '<c r="' + ref + '" s="2"><v>' + isoToSerial(v.date) + '</v></c>';
        if (typeof v === 'object' && v.money !== undefined) return '<c r="' + ref + '" s="3"><v>' + Number(v.money) + '</v></c>';
        if (typeof v === 'object' && v.wrap !== undefined) return '<c r="' + ref + '" s="4" t="inlineStr"><is><t xml:space="preserve">' + esc(v.wrap) + '</t></is></c>';
        if (typeof v === 'number') return '<c r="' + ref + '"' + hs + '><v>' + v + '</v></c>';
        if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"' + hs + '><v>' + (v ? 1 : 0) + '</v></c>';
        return '<c r="' + ref + '"' + hs + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('') + '</row>').join('');
      const cols = (sh.widths || []).length ? '<cols>' + sh.widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' : '';
      const pane = header ? '<sheetViews><sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '/></sheetViews>';
      files.push({ name: 'xl/worksheets/sheet' + (si + 1) + '.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + pane + cols + '<sheetData>' + rowsXml + '</sheetData></worksheet>' });
    });
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => '<sheet name="' + esc(String(s.name).slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>';
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    return zip([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rootRels }, { name: 'xl/workbook.xml', data: wb }, { name: 'xl/_rels/workbook.xml.rels', data: wbRels }, { name: 'xl/styles.xml', data: styles }].concat(files));
  }

  Buku.xlsx = { read, write, unzip, zip, crc32, serialToIso };
})();
