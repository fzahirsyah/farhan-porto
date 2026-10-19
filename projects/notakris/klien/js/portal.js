/* NotaKris — client portal. Phase 2: connection monitor proving live two-tab sync.
   The full portal (login, status, documents, appointments, invoices, messages) arrives in Phase 6. */
(function () {
  const NK = window.NK; const { esc, toast } = NK.ui; const DB = NK.db;

  async function boot() {
    document.body.innerHTML = '<div class="portal-wrap"><div class="portal" id="p"><div class="card" style="text-align:center"><span class="spin"></span><p class="muted small" style="margin-top:8px">Menghubungkan…</p></div></div></div>';
    try { await DB.init('klien'); } catch (e) { document.getElementById('p').innerHTML = `<div class="card"><h2>Portal tidak bisa dimulai</h2><p class="muted">${esc(e.message)}</p></div>`; return; }
    DB.onChange((m) => { render(m); if (m.remote) toast('Kantor: ' + m.label); });
    render();
  }

  function render(lastMsg) {
    const el = document.getElementById('p');
    if (DB.state !== 'ready') {
      el.innerHTML = `<div class="head"><img src="../assets/logo-plum.png" alt="NotaKris"><span class="live" style="margin-left:auto;color:var(--amber)"><span class="dot"></span> Menunggu kantor</span></div>
        <div class="card"><h2>Portal belum aktif</h2><p class="muted" style="margin-top:6px">Kantor notaris belum menyiapkan database. Buka <b>notaris/index.html</b> di tab lain lalu pilih <b>Database demo</b> atau <b>Database kosong</b>. Halaman ini akan aktif otomatis.</p></div>`;
      return;
    }
    const off = DB.get('SELECT * FROM office WHERE id=1') || {};
    const log = DB.all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 10');
    el.innerHTML = `<div class="head"><img src="../assets/logo-plum.png" alt="NotaKris"><div class="small muted">${esc(off.name || '')}</div>
        <span class="live" style="margin-left:auto"><span class="dot"></span> Terhubung · v${DB.version}</span></div>
      <div class="card" style="margin-bottom:14px"><span class="tag p">Fase 2 · uji koneksi</span><h2 style="margin:8px 0 4px">Portal Klien</h2>
        <p class="small muted">Login klien, status pekerjaan, unggah dokumen, janji temu, tagihan, dan pesan dibangun di Fase 6. Halaman ini membuktikan kedua tab membaca database yang sama dan saling memberi kabar secara langsung.</p>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="ping">Kirim sinyal uji ke kantor</button>${lastMsg ? `<span class="small muted">Terakhir: ${esc(lastMsg.label || lastMsg.type)}</span>` : ''}</div></div>
      <div class="card"><h3>Aktivitas terbaru (langsung)</h3><div class="list feed small">${log.map((l, i) => `<div class="it" ${i === 0 && lastMsg ? '' : 'style="animation:none"'}><div style="flex:1"><b>${esc(l.actor)}</b> ${esc(l.action)}${l.detail ? ' · <span class="muted">' + esc(l.detail) + '</span>' : ''}<div class="tiny muted">${esc(l.at)}</div></div></div>`).join('') || '<div class="muted">Belum ada aktivitas.</div>'}</div></div>`;
    document.getElementById('ping').onclick = async () => {
      await DB.write('sinyal uji dari portal', () => { DB.log('mengirim sinyal uji dari portal'); DB.notify('kantor', 'Sinyal uji dari Portal Klien', 'Koneksi antar-tab berfungsi', { link: '#/notifikasi' }); });
      toast('Terkirim ke kantor', 'ok');
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
