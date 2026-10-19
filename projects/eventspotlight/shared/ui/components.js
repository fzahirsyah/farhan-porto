/* Event Spotlight — reusable UI components (vanilla JS): toast, drawer, confirm, tabs, forms, data table. */
(function () {
  const ES = (window.ES = window.ES || {});
  const esc = (s) => ES.fmt.esc(s);
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  // ---------- toast ----------
  function toast(msg, kind) {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg;
    box.appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 5000 : 3000);
  }

  // ---------- scrim / drawer / modal ----------
  function scrim() {
    let s = $('.scrim');
    if (!s) { s = document.createElement('div'); s.className = 'scrim'; document.body.appendChild(s); s.onclick = () => { if (!$('.modal.open')) drawer.close(); }; }
    return s;
  }
  const drawer = {
    dirty: false,
    open(o) {
      let d = $('.drawer');
      if (!d) { d = document.createElement('aside'); d.className = 'drawer'; document.body.appendChild(d); }
      d.className = 'drawer' + (o.wide ? ' wide' : '');
      d.innerHTML = `<div class="d-head"><h2>${esc(o.title || '')}</h2>${o.headExtra || ''}<button class="icon-btn" data-close style="margin-left:auto" title="Close" aria-label="Close">✕</button></div>
        <div class="d-body">${o.body || ''}</div>${o.footer ? `<div class="d-foot">${o.footer}</div>` : ''}`;
      requestAnimationFrame(() => { d.classList.add('open'); scrim().classList.add('show'); });
      d.querySelector('[data-close]').onclick = () => drawer.close();
      this.dirty = false;
      d.addEventListener('input', () => (this.dirty = true), { once: true });
      if (o.onMount) o.onMount(d.querySelector('.d-body'), d);
      return d;
    },
    close() { const d = $('.drawer'); if (d) d.classList.remove('open'); if (!$('.modal.open')) scrim().classList.remove('show'); this.dirty = false; },
    isOpen() { const d = $('.drawer'); return !!(d && d.classList.contains('open')); },
    el() { return $('.drawer'); }
  };
  function confirmBox(title, text, opt) {
    opt = opt || {};
    return new Promise((res) => {
      let m = $('.modal');
      if (!m) { m = document.createElement('div'); m.className = 'modal'; document.body.appendChild(m); }
      m.innerHTML = `<h2>${esc(title)}</h2><div class="muted">${text}</div>${opt.typeToConfirm ? `<input class="input" style="margin-top:12px" placeholder="Type: ${esc(opt.typeToConfirm)}">` : ''}
        <div class="m-foot"><button class="btn" data-no>Cancel</button><button class="btn ${opt.danger ? 'danger' : 'primary'}" data-yes>${esc(opt.ok || 'Yes, continue')}</button></div>`;
      scrim().classList.add('show'); m.classList.add('open');
      const inp = m.querySelector('input'); const yes = m.querySelector('[data-yes]');
      if (inp) { yes.disabled = true; inp.oninput = () => (yes.disabled = inp.value.trim() !== opt.typeToConfirm); inp.focus(); }
      const done = (v) => { m.classList.remove('open'); if (!drawer.isOpen()) scrim().classList.remove('show'); res(v); };
      m.querySelector('[data-no]').onclick = () => done(false); yes.onclick = () => done(true);
    });
  }

  // ---------- tabs ----------
  function tabs(container, items, active, onChange) {
    container.innerHTML = items.map((t) => `<button class="tab ${t.id === active ? 'on' : ''}" data-tab="${t.id}">${esc(t.label)}${t.count !== undefined && t.count !== null ? `<span class="tag ${t.countClass || ''}">${t.count}</span>` : ''}</button>`).join('');
    container.onclick = (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; $$('.tab', container).forEach((x) => x.classList.toggle('on', x === b)); onChange(b.dataset.tab); };
  }

  // ---------- forms ----------
  /* field: {name,label,type,options:[[v,l]],required,full,help,placeholder,min,max,step,section,readonly} */
  function formHTML(fields, values) {
    values = values || {};
    return '<div class="form">' + fields.map((f) => {
      if (f.section) return `<div class="section-t">${esc(f.section)}</div>`;
      const v = values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : (f.default !== undefined ? f.default : '');
      const req = f.required ? ' <span style="color:var(--red)">*</span>' : '';
      const ro = f.readonly ? ' readonly' : '';
      let input;
      if (f.type === 'select') input = `<select class="input" name="${f.name}"${f.readonly ? ' disabled' : ''}>${(f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : '') + f.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
      else if (f.type === 'textarea') input = `<textarea class="input" name="${f.name}" placeholder="${esc(f.placeholder || '')}"${ro} rows="${f.rows || 3}">${esc(v)}</textarea>`;
      else if (f.type === 'checkbox') return `<div class="f ${f.full ? 'full' : ''}"><label class="check-row" style="color:var(--ink);font-weight:500"><input type="checkbox" name="${f.name}" ${v && v !== '0' ? 'checked' : ''}${f.readonly ? ' disabled' : ''}> ${esc(f.label)}</label>${f.help ? `<div class="help">${f.help}</div>` : ''}</div>`;
      else if (f.type === 'money') input = `<input class="input" name="${f.name}" data-money inputmode="numeric" value="${v === '' ? '' : ES.fmt.num(v)}" placeholder="${esc(f.placeholder || '0')}"${ro}>`;
      else input = `<input class="input" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}${f.maxlength ? ` maxlength="${f.maxlength}"` : ''}${ro}${f.type === 'password' ? ' autocomplete="new-password"' : ''}>`;
      return `<div class="f ${f.full ? 'full' : ''}" data-f="${f.name}"><label>${esc(f.label)}${req}</label>${input}${f.help ? `<div class="help">${f.help}</div>` : ''}<div class="err hidden"></div></div>`;
    }).join('') + '</div>';
  }
  function bindMoney(root) {
    $$('[data-money]', root).forEach((i) => {
      i.addEventListener('blur', () => { const n = ES.fmt.parseNum(i.value); i.value = i.value.trim() === '' ? '' : ES.fmt.num(n); });
    });
  }
  function readForm(root, fields) {
    const out = {};
    (fields || []).forEach((f) => {
      if (f.section) return;
      const el = root.querySelector(`[name="${f.name}"]`); if (!el) return;
      if (f.type === 'checkbox') out[f.name] = el.checked ? 1 : 0;
      else if (f.type === 'money' || f.type === 'number') out[f.name] = el.value.trim() === '' ? null : (f.type === 'money' ? ES.fmt.parseNum(el.value) : Number(el.value));
      else out[f.name] = el.value.trim();
    });
    return out;
  }
  function validate(root, fields, extra) {
    let ok = true;
    $$('.f', root).forEach((x) => { x.classList.remove('invalid'); const e = x.querySelector('.err'); if (e) { e.classList.add('hidden'); e.textContent = ''; } });
    const fail = (name, msg) => {
      ok = false; const f = root.querySelector(`[data-f="${name}"]`);
      if (f) { f.classList.add('invalid'); const e = f.querySelector('.err'); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }
    };
    const v = readForm(root, fields);
    fields.forEach((f) => {
      if (f.section) return;
      if (f.required && (v[f.name] === '' || v[f.name] === null || v[f.name] === undefined)) fail(f.name, 'Required');
      else if (f.type === 'email' && v[f.name] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v[f.name])) fail(f.name, 'Enter a valid email address');
      else if (f.pattern && v[f.name] && !f.pattern.test(v[f.name])) fail(f.name, f.patternMsg || 'Invalid format');
    });
    if (extra) extra(v, fail);
    if (!ok) { const first = root.querySelector('.f.invalid .input'); if (first) first.focus(); }
    return ok ? v : null;
  }

  // ---------- data table ----------
  /* opts: {columns:[{key,label,render(row),value(row),num,sortable,width,hideExport}], rows, searchKeys, filters:[{key,label,options:[[v,l]],test(row,v)}],
            pageSize, exportName, exportTitle, emptyText, onRow(row), toolbar(html), rowClass(row), initialSort:{key,dir}} */
  function dataTable(container, opts) {
    const st = { q: '', filters: {}, sort: opts.initialSort || null, page: 0, rows: opts.rows || [] };
    const ps = opts.pageSize || 25;
    const val = (c, r) => (c.value ? c.value(r) : r[c.key]);
    function filtered() {
      let rows = st.rows;
      const q = st.q.trim().toLowerCase();
      if (q) {
        const keys = opts.searchKeys || opts.columns.map((c) => c.key);
        rows = rows.filter((r) => keys.some((k) => String(typeof k === 'function' ? k(r) : r[k] === null || r[k] === undefined ? '' : r[k]).toLowerCase().includes(q)));
      }
      (opts.filters || []).forEach((f) => {
        const fv = st.filters[f.key];
        if (fv !== undefined && fv !== '') rows = rows.filter((r) => (f.test ? f.test(r, fv) : String(r[f.key]) === String(fv)));
      });
      if (st.sort) {
        const c = opts.columns.find((x) => x.key === st.sort.key);
        if (c) rows = rows.slice().sort((a, b) => {
          let x = val(c, a), y = val(c, b);
          if (x === null || x === undefined) x = ''; if (y === null || y === undefined) y = '';
          const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
          return st.sort.dir === 'desc' ? -r : r;
        });
      }
      return rows;
    }
    function render() {
      const rows = filtered(); const pages = Math.max(1, Math.ceil(rows.length / ps));
      st.page = Math.min(st.page, pages - 1);
      const view = rows.slice(st.page * ps, st.page * ps + ps);
      const cols = opts.columns.filter((c) => !c.hidden);
      container.innerHTML = `
        <div class="tbl-toolbar">
          ${opts.noSearch ? '' : `<input class="input search" placeholder="Search…" value="${esc(st.q)}" data-q style="max-width:280px">`}
          ${(opts.filters || []).map((f) => `<select class="input" data-filter="${f.key}" style="width:auto"><option value="">${esc(f.label)}: all</option>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(st.filters[f.key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
          ${opts.toolbar || ''}
          ${opts.exportName ? `<div style="margin-left:auto;position:relative"><button class="btn sm" data-exp>⬇ Download ▾</button></div>` : ''}
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''} ${c.sortable === false ? '' : 'sortable'}" data-sort="${c.key}" style="${c.width ? 'width:' + c.width : ''}">${esc(c.label)}${st.sort && st.sort.key === c.key ? (st.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${view.length ? view.map((r, i) => `<tr data-i="${st.page * ps + i}" class="${opts.onRow ? 'click' : ''} ${opts.rowClass ? opts.rowClass(r) : ''}">${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key] === null || r[c.key] === undefined ? '' : r[c.key])}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${cols.length}"><div class="empty"><b>${esc(opts.emptyTitle || 'Nothing here yet')}</b>${opts.emptyText || ''}</div></td></tr>`}</tbody></table></div>
        <div class="tbl-foot"><span>${rows.length} rows${rows.length !== st.rows.length ? ' (of ' + st.rows.length + ')' : ''}</span>
          ${pages > 1 ? `<span class="spacer"></span><button class="btn sm" data-pg="-1" ${st.page === 0 ? 'disabled' : ''}>‹</button><span>Page ${st.page + 1} / ${pages}</span><button class="btn sm" data-pg="1" ${st.page >= pages - 1 ? 'disabled' : ''}>›</button>` : ''}</div>`;
      const q = $('[data-q]', container);
      if (q) q.oninput = () => { st.q = q.value; st.page = 0; const pos = q.selectionStart; render(); const nq = $('[data-q]', container); nq.focus(); nq.setSelectionRange(pos, pos); };
      $$('[data-filter]', container).forEach((s) => (s.onchange = () => { st.filters[s.dataset.filter] = s.value; st.page = 0; render(); }));
      $$('[data-sort]', container).forEach((th) => (th.onclick = () => {
        const c = opts.columns.find((x) => x.key === th.dataset.sort); if (!c || c.sortable === false) return;
        st.sort = st.sort && st.sort.key === c.key ? { key: c.key, dir: st.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.num ? 'desc' : 'asc' }; render();
      }));
      $$('[data-pg]', container).forEach((b) => (b.onclick = () => { st.page += Number(b.dataset.pg); render(); }));
      if (opts.onRow) $$('tbody tr[data-i]', container).forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('button,a,input,select,label')) return; opts.onRow(rows[Number(tr.dataset.i)]); }));
      const eb = $('[data-exp]', container);
      if (eb) eb.onclick = (e) => {
        e.stopPropagation();
        exportMenu(eb, (fmt) => {
          const ec = opts.columns.filter((c) => !c.hideExport && c.label);
          ES.exp.download(fmt, opts.exportName, ec.map((c) => c.label), filtered().map((r) => ec.map((c) => { const v = c.exportValue ? c.exportValue(r) : val(c, r); return v === null || v === undefined ? '' : v; })), { title: opts.exportTitle || opts.exportName, numCols: ec.map((c) => !!c.num) });
        });
      };
      if (opts.afterRender) opts.afterRender(container, view);
    }
    render();
    return { update(rows) { st.rows = rows; render(); }, rows: () => filtered(), render };
  }

  function exportMenu(anchor, cb) {
    closePops();
    const m = document.createElement('div'); m.className = 'menu-pop'; m.dataset.pop = '1';
    m.innerHTML = `<button data-f="csv"><span class="ft" style="background:#2f7d5b">CSV</span>CSV (.csv)</button>
      <button data-f="xlsx"><span class="ft" style="background:#1d6f42">XLSX</span>Excel (.xlsx)</button>
      <button data-f="pdf"><span class="ft" style="background:#b6423a">PDF</span>PDF (.pdf)</button>`;
    anchor.parentElement.appendChild(m); m.style.right = '0'; m.style.top = 'calc(100% + 4px)';
    m.onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { closePops(); cb(b.dataset.f); } };
  }
  function closePops() { $$('[data-pop]').forEach((x) => x.remove()); }
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-pop]') && !e.target.closest('[data-exp]') && !e.target.closest('[data-popbtn]')) closePops(); });

  function popMenu(anchor, items) {
    closePops();
    const m = document.createElement('div'); m.className = 'menu-pop'; m.dataset.pop = '1';
    m.innerHTML = items.map((it, i) => (it === '-' ? '<hr style="border:0;border-top:1px solid var(--line);margin:4px 0">' : `<button data-mi="${i}">${it.icon || ''}${esc(it.label)}</button>`)).join('');
    const r = anchor.getBoundingClientRect();
    m.style.position = 'fixed'; m.style.top = r.bottom + 6 + 'px'; m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    document.body.appendChild(m);
    m.onclick = (e) => { const b = e.target.closest('[data-mi]'); if (b) { closePops(); items[Number(b.dataset.mi)].onClick(); } };
    return m;
  }

  const tag = (text, cls) => `<span class="tag ${cls || ''}">${esc(text)}</span>`;
  const avatar = (name, color, size) => `<span class="avatar" style="background:${color || 'var(--blue)'};${size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px` : ''}">${esc(ES.fmt.initials(name))}</span>`;
  const empty = (title, text) => `<div class="empty"><b>${esc(title)}</b>${text || ''}</div>`;
  const dueTag = (date) => {
    if (!date) return '';
    const n = ES.fmt.daysFromToday(date);
    if (n < 0) return tag(-n + ' days overdue', 'r');
    if (n === 0) return tag('today', 'r');
    if (n === 1) return tag('tomorrow', 'r');
    if (n <= 5) return tag('in ' + n + ' days', 'a');
    return tag('in ' + n + ' days');
  };

  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || $('.modal.open')) return; if (drawer.isOpen()) { closePops(); drawer.close(); } });
  ES.ui = { $, $$, toast, drawer, confirm: confirmBox, tabs, formHTML, readForm, validate, bindMoney, dataTable, exportMenu, popMenu, closePops, tag, avatar, empty, dueTag, esc };
})();
