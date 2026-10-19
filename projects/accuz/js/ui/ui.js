/* Buku — UI toolkit: router, page chrome, modals, toasts, formatting helpers, form inputs. */
(function () {
  'use strict';
  const Buku = window.Buku;
  const { h } = Buku.util;
  const t = (k, v) => Buku.i18n.t(k, v);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---------- Formatting ----------
  function curDecimals(code) {
    if (!Buku.db) return code === 'IDR' ? 0 : 2;
    const d = Buku.db.scalar('SELECT decimals FROM currencies WHERE code=?', [code]);
    return d === null ? 0 : d;
  }

  /** Format base-currency (IDR) minor units. */
  function idr(minor, opts) {
    const o = Object.assign({}, opts || {});
    o.code = o.code ? 'IDR' : null;
    return Buku.money.format(minor, 0, o);
  }

  function money(minor, code, opts) {
    return Buku.money.format(minor, curDecimals(code), Object.assign({ code }, opts || {}));
  }

  /** Report-style amount: brackets for negatives, dash for zero. */
  function amt(minor, opts) {
    return Buku.money.format(minor, 0, Object.assign({ parens: true, dashZero: true }, opts || {}));
  }

  function date(iso, style) {
    return Buku.i18n.formatDate(iso, style);
  }

  // ---------- Toasts ----------
  function toast(message, kind) {
    let host = $('#toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), kind === 'error' ? 6000 : 3200);
    setTimeout(() => el.remove(), kind === 'error' ? 6400 : 3600);
  }

  function errorText(e) {
    return Buku.i18n.err(e);
  }

  function showError(e) {
    console.error(e);
    toast(errorText(e), 'error');
  }

  // ---------- Modal ----------
  /**
   * opts: { title, body (html), actions: [{ label, kind:'primary'|'danger'|'ghost', onClick(modal) -> false keeps open }], wide, onOpen(modal) }
   */
  function modal(opts) {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<header><h2 id="modal-title">' + h(opts.title) + '</h2><button type="button" class="icon-btn close" aria-label="' + h(t('Close')) + '">✕</button></header>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      '<footer></footer></div>';
    const footer = $('footer', wrap);
    const api = {
      el: wrap,
      body: $('.modal-body', wrap),
      close() {
        wrap.remove();
        document.removeEventListener('keydown', onKey);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
      },
    };
    (opts.actions || [{ label: t('Close'), kind: 'ghost' }]).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.kind || 'ghost');
      b.textContent = a.label;
      b.addEventListener('click', async () => {
        if (!a.onClick) return api.close();
        try {
          b.disabled = true;
          const r = await a.onClick(api);
          if (r !== false) api.close();
        } catch (e) {
          showError(e);
        } finally {
          b.disabled = false;
        }
      });
      footer.appendChild(b);
    });
    function onKey(e) {
      if (e.key === 'Escape') api.close();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const primary = $('footer .btn.primary', wrap);
        if (primary) primary.click();
      }
    }
    $('.close', wrap).addEventListener('click', api.close);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) api.close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    const first = $('input:not([type=hidden]), select, textarea', api.body) || $('footer .btn.primary', wrap);
    if (first) first.focus();
    if (opts.onOpen) opts.onOpen(api);
    bindInputs(api.body);
    return api;
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let answered = false;
      const m = modal({
        title: opts.title || t('Are you sure?'),
        body: '<p class="confirm-text">' + h(message) + '</p>',
        actions: [
          { label: opts.cancelLabel || t('Cancel'), kind: 'ghost', onClick: () => { answered = true; resolve(false); } },
          { label: opts.okLabel || t('Continue'), kind: opts.danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
        ],
      });
      const origClose = m.close;
      m.close = () => { origClose(); if (!answered) resolve(false); };
      $('.close', m.el).onclick = m.close;
    });
  }

  // ---------- Form helpers ----------
  function field(label, control, opts) {
    opts = opts || {};
    return '<label class="field' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '') + '"><span class="label">' + h(label) +
      (opts.optional ? ' <em>' + h(t('optional')) + '</em>' : '') + '</span>' + control +
      (opts.hint ? '<span class="hint">' + h(opts.hint) + '</span>' : '') + '</label>';
  }

  function input(name, value, opts) {
    opts = opts || {};
    return '<input name="' + h(name) + '" type="' + (opts.type || 'text') + '" value="' + h(value === null || value === undefined ? '' : value) + '"' +
      (opts.placeholder ? ' placeholder="' + h(opts.placeholder) + '"' : '') +
      (opts.required ? ' required' : '') + (opts.readonly ? ' readonly' : '') + (opts.attrs ? ' ' + opts.attrs : '') + '>';
  }

  function select(name, options, value, opts) {
    opts = opts || {};
    return '<select name="' + h(name) + '"' + (opts.attrs ? ' ' + opts.attrs : '') + '>' +
      options.map((o) => {
        if (o.group) return '<optgroup label="' + h(o.group) + '">' + o.options.map((x) => opt(x, value)).join('') + '</optgroup>';
        return opt(o, value);
      }).join('') + '</select>';
  }
  function opt(o, value) {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return '<option value="' + h(v) + '"' + (String(v) === String(value ?? '') ? ' selected' : '') + (o.disabled ? ' disabled' : '') + '>' + h(l) + '</option>';
  }

  /** Money input: shows formatted text, data-decimals controls parsing. */
  function moneyInput(name, minor, decimals, opts) {
    opts = opts || {};
    const v = minor === null || minor === undefined || (minor === 0 && opts.blankZero) ? '' : Buku.money.format(minor, decimals);
    return '<input class="num" inputmode="decimal" autocomplete="off" name="' + h(name) + '" data-money data-decimals="' + decimals + '" value="' + h(v) + '"' +
      (opts.placeholder !== undefined ? ' placeholder="' + h(opts.placeholder) + '"' : '') + (opts.attrs ? ' ' + opts.attrs : '') + '>';
  }

  /** Read a money input as minor units (null if empty). Marks the field invalid on error. */
  function readMoney(el) {
    if (!el) return null;
    try {
      el.classList.remove('invalid');
      return Buku.money.parse(el.value, Number(el.dataset.decimals || 0));
    } catch (e) {
      el.classList.add('invalid');
      throw e;
    }
  }

  function bindInputs(root) {
    $$('input[data-money]', root).forEach((el) => {
      if (el._bound) return;
      el._bound = true;
      el.addEventListener('blur', () => {
        try {
          const v = Buku.money.parse(el.value, Number(el.dataset.decimals || 0));
          el.value = v === null ? '' : Buku.money.format(v, Number(el.dataset.decimals || 0));
          el.classList.remove('invalid');
        } catch (e) {
          el.classList.add('invalid');
        }
      });
      el.addEventListener('focus', () => el.select());
    });
  }

  /** Collect named form values into an object (strings; checkboxes as booleans). */
  function formData(root) {
    const out = {};
    $$('input[name], select[name], textarea[name]', root).forEach((el) => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value.trim();
    });
    return out;
  }

  /** Account options for selects, grouped by type. */
  function accountOptions(opts) {
    opts = opts || {};
    const L = Buku.i18n;
    const accs = Buku.db.all('SELECT * FROM accounts ' + (opts.all ? '' : 'WHERE is_active=1 ') + 'ORDER BY code');
    const groups = ['asset', 'liability', 'equity', 'income', 'expense'].map((type) => ({
      group: L.t(L.TYPE_LABEL[type]),
      options: accs.filter((a) => a.type === type && (opts.headers || !a.is_header)).map((a) => ({
        value: a.id,
        label: a.code + ' · ' + L.accName(a) + (a.currency && a.currency !== 'IDR' ? ' [' + a.currency + ']' : ''),
        disabled: a.is_header && !opts.headersSelectable,
      })),
    })).filter((g) => g.options.length);
    return (opts.empty ? [{ value: '', label: opts.empty }] : []).concat(groups);
  }

  // ---------- Page chrome ----------
  /** Nav link is active when the current path equals it or sits beneath it (#/journal/5 → Journal). */
  function isActive(href) {
    const [hp, hq] = href.split('?');
    const [path, q] = location.hash.split('?');
    if (hq) {
      // Links with a query (payments in/out) are active only when the query matches too.
      const want = new URLSearchParams(hq), have = new URLSearchParams(q || '');
      let dir = have.get('direction');
      if (!dir && /^#\/payments\/\d+/.test(path) && Buku.db) {
        dir = Buku.db.scalar('SELECT direction FROM payments WHERE id=?', [Number(path.split('/')[2])]);
      }
      return (path === hp || path.startsWith(hp + '/')) && [...want].every(([k, v]) => (k === 'direction' ? dir === v : have.get(k) === v));
    }
    return path === hp || path.startsWith(hp + '/');
  }
  function page(opts) {
    document.title = (opts.title ? opts.title + ' · ' : '') + 'Accu-Z Accounting';
    $('#page-title').textContent = opts.title || '';
    $('#page-actions').innerHTML = opts.actions || '';
    $$('.nav a').forEach((a) => a.classList.toggle('active', 'nav' in a.dataset && (opts.nav ? a.getAttribute('href') === opts.nav : isActive(a.getAttribute('href')))));
    const main = $('#main');
    main.className = opts.cls || '';
    main.innerHTML = opts.body || '';
    bindInputs(main);
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    return main;
  }

  function empty(message, action) {
    return '<div class="empty"><p>' + h(message) + '</p>' + (action || '') + '</div>';
  }

  // ---------- Router ----------
  const routes = [];
  function route(pattern, view) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ re, keys, view });
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const query = {};
    new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
    return { path, query };
  }

  let guard = null; // function returning a message when leaving should be confirmed
  function setLeaveGuard(fn) { guard = fn; }

  async function dispatch() {
    const { path, query } = parseHash();
    document.body.classList.remove('nav-open');
    if (!Buku.db) {
      if (path !== '/' && path !== '/setup') { location.hash = '#/'; return; }
    }
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        try {
          guard = null;
          await r.view(params, query);
        } catch (e) {
          showError(e);
          page({ title: t('Something went wrong'), body: empty(errorText(e), '<a class="btn" href="#/home">' + h(t('Go to overview')) + '</a>') });
        }
        return;
      }
    }
    location.hash = Buku.db ? '#/home' : '#/';
  }

  let lastHash = location.hash;
  window.addEventListener('hashchange', async () => {
    if (guard) {
      const msg = guard();
      if (msg && !window.confirm(msg)) {
        history.replaceState(null, '', lastHash || '#/home');
        return;
      }
    }
    lastHash = location.hash;
    dispatch();
  });

  function go(hash) {
    if (location.hash === hash) dispatch();
    else location.hash = hash;
  }

  function qs(obj) {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') p.set(k, v); });
    const s = p.toString();
    return s ? '?' + s : '';
  }

  Buku.ui = {
    $, $$, idr, money, amt, date, curDecimals, toast, showError, errorText, modal, confirm, field, input, select,
    moneyInput, readMoney, bindInputs, formData, accountOptions, page, empty, route, dispatch, go, qs, setLeaveGuard, parseHash, isActive,
  };
})();
