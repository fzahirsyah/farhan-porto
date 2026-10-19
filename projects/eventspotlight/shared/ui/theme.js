/* Event Spotlight — theme switcher (day, night, contrast). Saved in localStorage; applied before first paint where possible. */
(function () {
  const ES = (window.ES = window.ES || {});
  const KEY = 'es-theme', ORDER = ['day', 'night', 'contrast'];
  function get() { try { return localStorage.getItem(KEY) || 'day'; } catch (e) { return 'day'; } }
  function set(t) { try { localStorage.setItem(KEY, t); } catch (e) { /* ignore */ } document.documentElement.dataset.theme = t; document.querySelectorAll('.themes button').forEach((b) => b.classList.toggle('on', b.dataset.th === t)); }
  function control() {
    const t = get();
    return `<span class="themes" role="group" aria-label="Theme">${ORDER.map((k) => `<button data-th="${k}" class="${k === t ? 'on' : ''}" title="${k} theme">${k === 'day' ? 'Day' : k === 'night' ? 'Night' : 'Contrast'}</button>`).join('')}</span>`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('.themes button'); if (b) set(b.dataset.th); });
  document.documentElement.dataset.theme = get();
  window.addEventListener('storage', (e) => { if (e.key === KEY) document.documentElement.dataset.theme = get(); });
  ES.theme = { get, set, control };
})();
