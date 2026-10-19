/* NotaKris — Dasbor: live figures and deadlines computed from the database. */
(function () {
  const NK = window.NK; const F = NK.fmt; const { esc, tag, dueTag } = NK.ui;
  const DB = NK.db;

  // Annual report deadline (RUPS) = fiscal-year end + 6 months
  // (a fiscal year ending e.g. 31 March 2026 is treated as fiscal year 2025)
  function rupsDeadline(fyEnd, fy) {
    const m = Number((fyEnd || '12-31').split('-')[0]);
    const y = m === 12 ? fy : fy + 1;
    const dm = m + 6; const yy = y + Math.floor((dm - 1) / 12); const mm = ((dm - 1) % 12) + 1;
    return yy + '-' + F.pad(mm) + '-' + F.pad(new Date(yy, mm, 0).getDate());
  }
  NK.rupsDeadline = rupsDeadline;

  function deadlines() {
    const T = F.today(), lim = F.addDays(T, 14), out = [];
    DB.all(`SELECT j.id,j.title,j.subtitle,j.due_date,u.short pic FROM jobs j LEFT JOIN users u ON u.id=j.pic_user_id
            WHERE j.stage NOT IN ('selesai','batal') AND j.due_date IS NOT NULL AND j.due_date<=? ORDER BY j.due_date`, [lim])
      .forEach((j) => out.push({ date: j.due_date, kind: 'Pekerjaan', text: j.title + (j.subtitle ? ' — ' + j.subtitle : ''), sub: j.pic ? 'PIC ' + j.pic : 'Belum ditugaskan', link: '#/pekerjaan' }));
    DB.all(`SELECT a.deed_date, c.name FROM annual_reports a JOIN companies c ON c.id=a.company_id WHERE a.deed_date IS NOT NULL AND a.sabh_date IS NULL`)
      .forEach((a) => out.push({ date: F.addDays(a.deed_date, 30), kind: 'SABH', text: 'Laporan tahunan ' + a.name + ' ke SABH', sub: 'Maks. 30 hari sejak akta', link: '#/kepatuhan', hot: 1 }));
    DB.all(`SELECT name, period, due_pay FROM tax_obligations WHERE status='terjadwal' AND due_pay<=?`, [lim])
      .forEach((t) => out.push({ date: t.due_pay, kind: 'Pajak', text: t.name + ' — ' + t.period, sub: 'Batas setor', link: '#/pajak' }));
    DB.all(`SELECT l.start_date, l.kind, u.short FROM leaves l JOIN users u ON u.id=l.user_id WHERE l.status='diajukan'`)
      .forEach((l) => out.push({ date: l.start_date, kind: 'Cuti', text: 'Pengajuan cuti ' + l.short, sub: l.kind + ' · perlu persetujuan', link: '#/karyawan' }));
    DB.all(`SELECT l.deadline, c.name FROM ltkm l JOIN clients c ON c.id=l.client_id WHERE l.status='draft'`)
      .forEach((l) => out.push({ date: l.deadline, kind: 'LTKM', text: 'Laporan transaksi mencurigakan: ' + l.name, sub: 'Batas 3 hari kerja ke PPATK', link: '#/klien', hot: 1 }));
    return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 12);
  }

  function render(el) {
    const T = F.today(), FY = Number(T.slice(0, 4)) - 1, s = NK.session;
    const jobs = DB.all("SELECT category, COUNT(*) n FROM jobs WHERE stage NOT IN ('selesai','batal') GROUP BY category");
    const jc = (c) => (jobs.find((x) => x.category === c) || { n: 0 }).n;
    const jTotal = jobs.reduce((a, b) => a + b.n, 0);
    const unassigned = DB.val("SELECT COUNT(*) FROM jobs WHERE stage NOT IN ('selesai','batal') AND pic_user_id IS NULL");
    const companies = DB.all('SELECT c.id,c.name,c.fy_end,a.status FROM companies c LEFT JOIN annual_reports a ON a.company_id=c.id AND a.fiscal_year=?', [FY]);
    const subject = companies.filter((c) => c.status); // companies with a report obligation for FY
    const reported = subject.filter((c) => c.status === 'dilaporkan').length;
    const overdueRups = subject.filter((c) => c.status !== 'dilaporkan' && rupsDeadline(c.fy_end, FY) < T).length;
    const risk = DB.get("SELECT SUM(risk_level='tinggi') hi, SUM(pep=1) pep, SUM(kyc_status='perlu EDD') edd FROM clients");
    const ar = DB.all("SELECT i.id FROM invoices i WHERE i.status NOT IN ('batal','lunas')").map((i) => NK.acc.receivable(i.id));
    const piutang = ar.reduce((a, b) => a + b.due, 0);
    const unread = DB.val("SELECT COUNT(*) FROM messages WHERE sender='klien' AND read_at IS NULL");
    const poWait = DB.val("SELECT COUNT(*) FROM purchase_orders WHERE status='menunggu'");
    const appts = DB.all(`SELECT a.*, r.name room, r.color, u.short pic, c.name client FROM appointments a LEFT JOIN rooms r ON r.id=a.room_id
                          LEFT JOIN users u ON u.id=a.user_id LEFT JOIN clients c ON c.id=a.client_id WHERE a.date=? ORDER BY a.start`, [T]);
    const dl = deadlines();
    const log = DB.all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 8');
    const hr = new Date().getHours();
    const greet = hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam';
    const rupsSoon = subject.filter((c) => c.status !== 'dilaporkan').length;

    el.innerHTML = NK.app.pageHead(greet + ', ' + (s.short || s.name), F.tgl(T, 'day'), '') +
      (rupsSoon ? `<div class="card" style="background:linear-gradient(100deg,#3b2236,#62405a);color:#f4e7ef;border:0;margin-bottom:16px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div style="font-size:40px;font-weight:800;color:#ffd27a;line-height:1">${rupsSoon}</div>
        <div><b style="color:#fff;font-size:15px">PT klien belum menyampaikan laporan tahunan TB ${FY}</b><div class="small" style="opacity:.85">${overdueRups} sudah lewat batas RUPS (6 bulan setelah tahun buku). Sanksi teguran & blokir akses SABH (Permenkum 49/2025).</div></div>
        <a class="btn gold" style="margin-left:auto" href="#/kepatuhan">Lihat register →</a></div>` : '') +
      `<div class="grid g4" style="margin-bottom:16px">
        <a class="card kpi link" href="#/pekerjaan" style="text-decoration:none;color:inherit"><div class="l">Pekerjaan aktif</div><div class="n">${jTotal}</div><div class="d">Notaris ${jc('N')} · PPAT ${jc('P')} · Pengurusan ${jc('U')}${unassigned ? ` · <span style="color:var(--red)">${unassigned} belum ditugaskan</span>` : ''}</div></a>
        <a class="card kpi link" href="#/kepatuhan" style="text-decoration:none;color:inherit"><div class="l">Laporan tahunan TB ${FY}</div><div class="n">${reported}/${subject.length}</div><div class="bar" style="margin-top:8px"><i style="width:${subject.length ? (reported / subject.length) * 100 : 0}%"></i></div></a>
        <a class="card kpi link" href="#/klien" style="text-decoration:none;color:inherit"><div class="l">Klien risiko tinggi (PMPJ)</div><div class="n">${risk.hi || 0}</div><div class="d">PEP ${risk.pep || 0} · perlu EDD ${risk.edd || 0}</div></a>
        <a class="card kpi link" href="#/penjualan" style="text-decoration:none;color:inherit"><div class="l">Piutang</div><div class="n">${NK.auth.can('biaya') ? F.rpShort(piutang) : '•••'}</div><div class="d">${ar.filter((x) => x.due > 0).length} invoice belum lunas</div></a>
      </div>
      <div class="grid g21">
        <div class="card"><div class="card-h"><h3>Tenggat terdekat</h3><span class="hint">14 hari ke depan & yang terlewat</span></div>
          <div class="list deadline">${dl.length ? dl.map((x) => {
            const n = F.daysFromToday(x.date); const cls = n < 0 || x.hot && n <= 3 ? 'red' : n <= 3 ? 'amber' : 'blue';
            return `<a class="it" href="${x.link}" style="text-decoration:none;color:inherit"><div class="ic" style="background:var(--${cls}-soft);color:var(--${cls})">${n < 0 ? '!' : n + 'h'}</div>
              <div style="flex:1;min-width:0"><b>${esc(x.text)}</b><div class="small muted">${F.tgl(x.date, 'day')} · ${esc(x.kind)} · ${esc(x.sub)}</div></div>${dueTag(x.date)}</a>`;
          }).join('') : NK.ui.empty('Tidak ada tenggat', 'Semua aman untuk 14 hari ke depan.')}</div></div>
        <div>
          <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Jadwal hari ini</h3><a class="hint" href="#/kalender">Kalender →</a></div>
            <div class="list">${appts.length ? appts.map((a) => `<div class="it"><div class="ic" style="background:${a.color || '#888'}22;color:${a.color || '#555'}">${a.start}</div><div><b style="font-size:13px">${esc(a.title)}</b><div class="small muted">${esc(a.client || '')}${a.client ? ' · ' : ''}${esc(a.room || '')} · ${esc(a.pic || '')}${a.source === 'portal' ? ' · ' + tag('dari portal', 'p') : ''}</div></div></div>`).join('') : '<div class="small muted">Tidak ada jadwal hari ini.</div>'}</div></div>
          <div class="card" style="margin-bottom:16px"><h3>Perlu perhatian</h3><div class="list small">
            <a class="it" href="#/pesan" style="text-decoration:none;color:inherit">${tag(unread, unread ? 'r' : '')} Pesan klien belum dibaca</a>
            <a class="it" href="#/pembelian" style="text-decoration:none;color:inherit">${tag(poWait, poWait ? 'a' : '')} PO menunggu persetujuan</a>
            <a class="it" href="#/pekerjaan" style="text-decoration:none;color:inherit">${tag(unassigned, unassigned ? 'r' : '')} Pekerjaan belum ditugaskan</a>
            <a class="it" href="#/klien" style="text-decoration:none;color:inherit">${tag(risk.edd || 0, risk.edd ? 'a' : '')} Klien perlu identifikasi mendalam (EDD)</a></div></div>
          <div class="card"><div class="card-h"><h3>Aktivitas terbaru</h3>${NK.auth.can('pengaturan') ? '<a class="hint" href="#/log">Semua →</a>' : ''}</div>
            <div class="list small">${log.map((l) => `<div class="it"><div style="flex:1"><b>${esc(l.actor)}</b> ${esc(l.action)}${l.detail ? ' · <span class="muted">' + esc(l.detail) + '</span>' : ''}<div class="tiny muted">${esc(l.at)}${l.actor_kind === 'klien' ? ' · ' + tag('portal klien', 'p') : ''}</div></div></div>`).join('') || '<div class="muted">Belum ada aktivitas.</div>'}</div></div>
        </div></div>`;
  }

  NK.app.register('dashboard', { label: 'Dasbor', icon: 'dash', perm: 'dashboard', section: 'Utama', render });
})();
