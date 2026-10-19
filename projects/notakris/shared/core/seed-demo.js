/* NotaKris — demo dataset (fictional office in Surabaya). All dates are relative to "today",
   so deadlines and calendars always look current. Accounting entries go through NK.acc so
   the books always balance. */
(function () {
  const NK = (window.NK = window.NK || {});

  NK.seed = NK.seed || {};
  NK.seed.demo = function (DB) {
    const F = NK.fmt, T = F.today(), d = (n) => F.addDays(T, n);
    const Y = Number(T.slice(0, 4)), FY = Y - 1;
    const ins = (t, o) => DB.insert(t, o);
    const now = F.nowStamp();

    NK.seed.base(DB, {
      mode: 'demo', city: 'Surabaya', bankOps: 'BCA Operasional', bankOpsNo: '088 1234 5678', bankTrust: 'Mandiri Titipan Klien', bankTrustNo: '142 0045 1234 0451',
      office: { name: 'Kantor Notaris & PPAT Anindya Prameswari', notary_name: 'Anindya Prameswari', notary_title: 'S.H., M.Kn.', roles: 'Notaris & PPAT',
        sk_no: 'AHU-00123.AH.02.01.Tahun 2017', wilayah: 'Kota Surabaya', address: 'Jl. Raya Darmo No. 88', city: 'Surabaya', phone: '(031) 567-8899',
        email: 'kantor@notarisanindya.id', npwp: '09.876.543.2-614.000', bank_name: 'BCA', bank_acc: '088 1234 5678', bank_holder: 'Anindya Prameswari', va_no: '3901 0812 3456 7890' }
    });

    // ---------- users (PIN demo shown on login screen) ----------
    const U = {};
    [['notaris', 'Anindya Prameswari, S.H., M.Kn.', 'Anindya', 'notaris', 'Notaris & PPAT', '1234', 10, '#744C68', '2017-03-12', 0, 0],
     ['dewi', 'Dewi Anggraini, S.H., M.Kn.', 'Dewi', 'staf', 'Staf Senior Notaris', '1111', 6, '#2f5fa8', '2017-03-12', 6500000, 1000000],
     ['rina', 'Rina Puspitasari, S.H.', 'Rina', 'staf', 'Staf Korporasi (PT/CV/Yayasan)', '2222', 6, '#2f7d5b', '2019-07-02', 5200000, 800000],
     ['fajar', 'Fajar Nugroho, S.H.', 'Fajar', 'staf_ppat', 'Staf PPAT', '3333', 6, '#b8892f', '2021-01-15', 4600000, 900000],
     ['siska', 'Siska Maharani, S.E.', 'Siska', 'keuangan', 'Admin Keuangan', '4444', 5, '#8a4fa8', '2022-08-01', 4500000, 500000],
     ['bagus', 'Bagus Setiawan', 'Bagus', 'kurir', 'Kurir & Pengurusan Instansi', '5555', 5, '#b6423a', '2024-05-06', 3400000, 600000]]
      .forEach(([k, name, short, role, title, pin, cap, color, joined, base, allow]) => {
        U[k] = ins('users', { name, short, role, title, email: short.toLowerCase() + '@notarisanindya.id', phone: '0812-3000-' + (1000 + Object.keys(U).length * 111),
          pin_hash: NK.auth.hashPin(pin), capacity: cap, color, joined, screened_date: joined, confidentiality_signed: 1,
          base_salary: base, allowance: allow, created_at: now, perm_override: k === 'dewi' ? '{"biaya":true}' : '{}' });
      });
    DB.setSetting('demo_pins', JSON.stringify({ Anindya: '1234', Dewi: '1111', Rina: '2222', Fajar: '3333', Siska: '4444', Bagus: '5555' }));

    // ---------- clients ----------
    const C = {};
    const cl = (k, o) => (C[k] = ins('clients', Object.assign({ created_at: now, updated_at: now, screening_status: 'bersih', screening_date: d(-20), kyc_status: 'lengkap', met_in_person: d(-20), city: 'Surabaya', nationality: 'WNI' }, o)));
    cl('kevin', { kind: 'perorangan', name: 'Kevin Lazuardi', nik: '3578011203940012', npwp: '81.234.567.8-614.000', birth_place: 'Surabaya', birth_date: '1994-03-12', gender: 'L', address: 'Jl. Raya Darmo Permai III No. 21', phone: '0812-3456-7890', email: 'kevin.lazuardi@arunika.id', occupation: 'Wiraswasta', source_of_funds: 'Usaha jasa digital', purpose: 'Pendirian PT', met_in_person: d(-7) });
    cl('maya', { kind: 'perorangan', name: 'Maya Kartika', nik: '3578014507880003', birth_place: 'Surabaya', birth_date: '1988-07-05', gender: 'P', address: 'Jl. Kenjeran No. 412', phone: '0813-2222-4545', email: 'maya.kartika@gmail.com', occupation: 'Wiraswasta', purpose: 'Pendirian PT usaha katering', kyc_status: 'belum lengkap', screening_status: 'bersih', met_in_person: null });
    cl('chen', { kind: 'perorangan', name: 'Chen Wei Ming', nik: null, birth_place: 'Taichung', birth_date: '1979-11-02', gender: 'L', address: 'Pakuwon Indah, Surabaya', phone: '0811-3030-8899', email: 'chen.wm@twinvest.tw', occupation: 'Investor', nationality: 'WNA (Taiwan)', purpose: 'Pendirian PT PMA', risk_country: 2, risk_service: 2, risk_level: 'menengah', kyc_status: 'belum lengkap', notes: 'Paspor & KITAS diverifikasi; NPWP belum ada' });
    cl('bambang', { kind: 'perorangan', name: 'H. Ir. Bambang Sutrisno', nik: '3578010804650001', birth_place: 'Malang', birth_date: '1965-04-08', gender: 'L', address: 'Jl. Dharmahusada Indah No. 9', phone: '0812-9090-1111', email: 'bambang.s@mail.id', occupation: 'Pensiunan / mantan anggota DPRD Provinsi', source_of_funds: '—', purpose: 'Pembelian tanah Rp 4,2 M', pep: 1, pep_note: 'Anggota DPRD Provinsi 2019–2024', risk_profile: 3, risk_service: 3, risk_level: 'tinggi', kyc_status: 'perlu EDD', notes: 'Wajib identifikasi mendalam: sumber dana & sumber kekayaan' });
    cl('yudi', { kind: 'perorangan', name: 'Yudi Hartono', nik: '3578021505800004', birth_place: 'Surabaya', birth_date: '1980-05-15', gender: 'L', address: 'Jl. Gubeng Kertajaya IX No. 3', phone: '0812-7777-1212', email: 'yudi.hartono@mail.id', occupation: 'Karyawan swasta', purpose: 'Penjualan tanah & bangunan' });
    cl('lanny', { kind: 'perorangan', name: 'Lanny Halim', nik: '3578045609720002', birth_place: 'Surabaya', birth_date: '1972-09-16', gender: 'P', address: 'Jl. Raya Darmo Harapan No. 5', phone: '0812-5656-7878', email: 'lanny.halim@mail.id', occupation: 'Wiraswasta', purpose: 'Hibah saham & PPJB' });
    cl('hartini', { kind: 'perorangan', name: 'Ibu Hartini', nik: '3578034403550001', birth_place: 'Sidoarjo', birth_date: '1955-03-04', gender: 'P', address: 'Jl. Ketintang Baru No. 14', phone: '0813-1111-2020', email: 'hartini55@mail.id', occupation: 'Pensiunan', purpose: 'Akta wasiat' });
    cl('budi', { kind: 'perorangan', name: 'Budi Santoso', nik: '3578010101850009', birth_place: 'Surabaya', birth_date: '1985-01-01', gender: 'L', address: 'Jl. Rungkut Asri Timur No. 8', phone: '0812-4444-9999', email: 'budi.santoso@mail.id', occupation: 'Pedagang', purpose: 'Kredit modal kerja (debitur Bank Jatim)' });
    cl('sugeng', { kind: 'perorangan', name: 'Sugeng Riyadi', nik: '3578062211770003', birth_place: 'Surabaya', birth_date: '1977-11-22', gender: 'L', address: 'Jl. Tambak Rejo No. 30', phone: '0813-3030-5050', email: 'sugeng.sumberrejeki@mail.id', occupation: 'Pedagang', purpose: 'Pendirian CV Sumber Rejeki' });
    const corp = (k, name, rep, email, o) => cl(k, Object.assign({ kind: 'badan', name, representative: rep, email, company_form: 'PT', occupation: null }, o || {}));
    corp('rkd', 'PT Rumah Kopi Darmo', 'Hendra Wijaya (Direktur)', 'hendra@rumahkopidarmo.id', { business_field: 'Kafe & restoran', address: 'Jl. Raya Darmo No. 140', sk_no: 'AHU-0012345.AH.01.01.Tahun 2019' });
    corp('kencana', 'PT Kencana Agro Lestari', 'Ratna Kusuma (Direktur)', 'ratna@kencanaagro.id', { business_field: 'Perdagangan hasil pertanian', address: 'Jl. Margomulyo No. 44' });
    corp('mitra', 'PT Mitra Logistik Perak', 'Agus Salim (Direktur)', 'agus@mitralogistik.id', { business_field: 'Logistik pelabuhan', address: 'Jl. Perak Timur No. 55', risk_country: 2, risk_level: 'menengah', kyc_status: 'belum lengkap', notes: 'Mitra usaha di Singapura; data pemilik manfaat belum lengkap' });
    corp('batik', 'PT Batik Kenjeran Abadi', 'Siti Aminah (Direktur)', 'siti@batikkenjeran.id', { business_field: 'Industri batik', address: 'Jl. Kenjeran No. 210' });
    corp('garam', 'PT Samudra Garam Madura', 'Moh. Fauzi (Direktur)', 'fauzi@samudragaram.id', { business_field: 'Produksi garam', address: 'Jl. Raya Kamal No. 3, Bangkalan', city: 'Bangkalan' });
    corp('sinar', 'PT Sinar Bahari Nusantara', 'Yohanes Tanoto (Direktur)', 'yohanes@sinarbahari.id', { business_field: 'Pelayaran', address: 'Jl. Kalimas Baru No. 20' });
    corp('delta', 'PT Delta Medika Sidoarjo', 'dr. Arief Rahman (Direktur)', 'arief@deltamedika.id', { business_field: 'Klinik kesehatan', address: 'Jl. Raya Waru No. 7', city: 'Sidoarjo' });
    corp('jatim', 'Bank Jatim — Kantor Cabang Surabaya', 'Divisi Kredit', 'kredit.sby@bankjatim-demo.id', { company_form: 'Bank', business_field: 'Perbankan', address: 'Jl. Basuki Rahmat No. 98', portal_enabled: 0 });
    corp('tekno', 'PT Teknologi Rungkut Mandiri', 'Dimas Prakoso (Direktur)', 'dimas@tekrungkut.id', { business_field: 'Perangkat lunak', address: 'Jl. Rungkut Industri No. 12' });
    corp('griya', 'PT Griya Pakuwon Sejahtera', 'Lanny Halim (Direktur)', 'griya@pakuwonsejahtera.id', { business_field: 'Real estat', address: 'Jl. Bukit Darmo Boulevard No. 1' });

    // ---------- companies (PT compliance register) ----------
    const CO = {};
    const co = (k, clientKey, name, o) => (CO[k] = ins('companies', Object.assign({ client_id: C[clientKey], name, form: 'PT', fy_end: '12-31', kbli_version: '2025', created_at: now }, o)));
    co('rkd', 'rkd', 'PT Rumah Kopi Darmo', { director: 'Hendra Wijaya', director_email: 'hendra@rumahkopidarmo.id', sk_no: 'AHU-0012345.AH.01.01.Tahun 2019', founded_date: '2019-03-14', kbli_codes: '56101', modal_dasar: 1000000000, modal_disetor: 250000000 });
    co('kencana', 'kencana', 'PT Kencana Agro Lestari', { director: 'Ratna Kusuma', director_email: 'ratna@kencanaagro.id', founded_date: '2016-08-02', kbli_version: '2020', kbli_codes: '46201', purpose_change_needed: 1, modal_dasar: 2000000000, modal_disetor: 500000000 });
    co('mitra', 'mitra', 'PT Mitra Logistik Perak', { director: 'Agus Salim', director_email: 'agus@mitralogistik.id', founded_date: '2019-02-11', kbli_version: '2020', kbli_codes: '52240', purpose_change_needed: 1, modal_dasar: 5000000000, modal_disetor: 1250000000 });
    co('batik', 'batik', 'PT Batik Kenjeran Abadi', { director: 'Siti Aminah', director_email: 'siti@batikkenjeran.id', founded_date: '2020-05-20', kbli_codes: '13134', modal_dasar: 800000000, modal_disetor: 200000000 });
    co('garam', 'garam', 'PT Samudra Garam Madura', { director: 'Moh. Fauzi', director_email: 'fauzi@samudragaram.id', founded_date: '2018-01-09', fy_end: '03-31', kbli_version: '2020', kbli_codes: '08930', modal_dasar: 1500000000, modal_disetor: 400000000 });
    co('sinar', 'sinar', 'PT Sinar Bahari Nusantara', { director: 'Yohanes Tanoto', director_email: 'yohanes@sinarbahari.id', founded_date: '2012-10-01', kbli_codes: '50131', modal_dasar: 10000000000, modal_disetor: 2500000000 });
    co('tekno', 'tekno', 'PT Teknologi Rungkut Mandiri', { director: 'Dimas Prakoso', director_email: 'dimas@tekrungkut.id', founded_date: '2021-06-30', kbli_codes: '62019', modal_dasar: 500000000, modal_disetor: 125000000 });
    co('griya', 'griya', 'PT Griya Pakuwon Sejahtera', { director: 'Lanny Halim', director_email: 'griya@pakuwonsejahtera.id', founded_date: '2015-04-17', kbli_codes: '68111', modal_dasar: 20000000000, modal_disetor: 5000000000 });
    co('delta', 'delta', 'PT Delta Medika Sidoarjo', { director: 'dr. Arief Rahman', director_email: 'arief@deltamedika.id', founded_date: '2017-09-05', kbli_version: '2020', kbli_codes: '86103', modal_dasar: 3000000000, modal_disetor: 750000000 });
    co('arunika', 'kevin', 'PT Arunika Kreatif Digital', { director: 'Kevin Lazuardi', director_email: 'kevin.lazuardi@arunika.id', founded_date: d(-3), kbli_codes: '62011, 73100', modal_dasar: 1000000000, modal_disetor: 250000000, notes: 'Baru didirikan; laporan tahunan pertama tahun depan' });

    const bo = (k, name, pct, flags) => ins('beneficial_owners', Object.assign({ company_id: CO[k], name, ownership_pct: pct, control_basis: 'Kepemilikan saham > 25%', doc_poa: 1, doc_statement: 1, doc_consent: 1, consent_uploaded_sabh: 1, updated_at: d(-60) }, flags || {}));
    bo('rkd', 'Hendra Wijaya', 70); bo('kencana', 'Ratna Kusuma', 55); bo('mitra', 'Agus Salim', 40, { doc_consent: 0, consent_uploaded_sabh: 0 });
    bo('batik', 'Siti Aminah', 60); bo('garam', 'Moh. Fauzi', 51, { doc_poa: 0 }); bo('sinar', 'Yohanes Tanoto', 65); bo('tekno', 'Dimas Prakoso', 80);
    bo('griya', 'Lanny Halim', 45, { control_basis: 'Pengendali (menunjuk direksi)', updated_at: d(-400) }); bo('delta', 'dr. Arief Rahman', 52); bo('arunika', 'Kevin Lazuardi', 60, { updated_at: d(-3) });

    const ar = (k, o) => ins('annual_reports', Object.assign({ company_id: CO[k], fiscal_year: FY }, o));
    ar('sinar', { rups_date: FY + 1 + '-06-12', deed_date: FY + 1 + '-06-12', sabh_date: FY + 1 + '-07-02', status: 'dilaporkan' });
    ar('tekno', { rups_date: FY + 1 + '-06-24', deed_date: FY + 1 + '-06-24', sabh_date: FY + 1 + '-07-10', status: 'dilaporkan' });
    ar('griya', { rups_date: FY + 1 + '-05-29', deed_date: FY + 1 + '-05-29', sabh_date: FY + 1 + '-06-15', status: 'dilaporkan' });
    ar('delta', { rups_date: FY + 1 + '-06-18', deed_date: FY + 1 + '-06-18', sabh_date: FY + 1 + '-07-01', status: 'dilaporkan' });
    ar('rkd', { rups_date: d(-19), deed_date: d(-19), status: 'akta' });
    ar('kencana', { rups_date: d(5), status: 'dijadwalkan' });
    ar('mitra', { status: 'belum' }); ar('batik', { status: 'belum' }); ar('garam', { status: 'belum' });

    // ---------- jobs ----------
    const svc = {}; DB.all('SELECT id,code,steps,checklist,category FROM services').forEach((s) => (svc[s.code] = s));
    const J = {};
    function job(k, code, title, subtitle, clientKey, picKey, stage, due, o) {
      o = o || {};
      const s = svc[code];
      const created = o.created || d(-10);
      const id = ins('jobs', { no: NK.num.next('JOB', created).no, service_id: s.id, title, subtitle, category: s.category, client_id: C[clientKey], company_id: o.company ? CO[o.company] : null,
        stage, pic_user_id: picKey ? U[picKey] : null, due_date: due, value: o.value || 0, created_at: created + ' 09:00:00', completed_at: stage === 'selesai' ? (o.completed || d(-2)) : null });
      const steps = JSON.parse(s.steps); const doneN = o.stepsDone === undefined ? (stage === 'selesai' ? steps.length : 0) : o.stepsDone;
      steps.forEach((name, i) => ins('job_steps', { job_id: id, seq: i + 1, name, done_date: i < doneN ? F.addDays(created, i * 2 + 1) : null, eta: i >= doneN && o.eta && i === doneN ? o.eta : null }));
      const chk = JSON.parse(s.checklist).concat(o.extraChecklist || []);
      chk.forEach(([name, req, up, ocr], i) => ins('job_checklist', { job_id: id, name, required: req, client_upload: up, ocr: ocr || 0, done: o.checkDone === undefined ? (stage === 'draft' ? 0 : 1) : (o.checkDone.includes(i) ? 1 : 0) }));
      return (J[k] = id);
    }
    job('arunika', 'PT-DIRI', 'Pendirian PT', 'PT Arunika Kreatif Digital', 'kevin', 'rina', 'instansi', d(4), { company: 'arunika', created: d(-7), stepsDone: 3, eta: d(4), value: 6080000,
      checkDone: [0, 1, 2, 3, 4, 5], extraChecklist: [['KTP pemegang saham — Andre Gunawan', 1, 1, 1]] });
    job('kencana', 'PT-RUPST', 'Akta RUPS Tahunan', 'PT Kencana Agro Lestari', 'kencana', 'dewi', 'draft', d(5), { company: 'kencana', stepsDone: 1, checkDone: [0, 1], value: 2500000 });
    job('cv', 'CV', 'Pendirian CV', 'CV Sumber Rejeki', 'sugeng', 'rina', 'draft', d(9), { stepsDone: 1, checkDone: [0, 1, 2], value: 2500000 });
    job('batik', 'PT-RUPST', 'Akta RUPS Tahunan', 'PT Batik Kenjeran Abadi', 'batik', null, 'draft', d(13), { company: 'batik', created: d(-2), stepsDone: 0, checkDone: [], value: 2500000 });
    job('mitra', 'PT-RUPST', 'Akta RUPS Tahunan', 'PT Mitra Logistik Perak · BO belum lengkap', 'mitra', null, 'draft', d(14), { company: 'mitra', created: d(-2), stepsDone: 0, checkDone: [], value: 2500000 });
    job('apht', 'APHT', 'APHT — Bank Jatim', 'a.n. Budi Santoso', 'jatim', 'fajar', 'ttd', d(1), { stepsDone: 1, value: 3550000 });
    job('delta', 'PT-UBAH', 'Perubahan direksi', 'PT Delta Medika Sidoarjo', 'delta', 'dewi', 'ttd', d(2), { company: 'delta', stepsDone: 2, value: 3600000 });
    job('ajbyudi', 'AJB', 'AJB — Yudi Hartono', 'Kel. Gubeng · Rp 1,35 M', 'yudi', 'fajar', 'selesai', d(-1), { created: d(-14), value: 109750000, completed: d(-1) });
    job('bn', 'BN', 'Balik nama SHM 1127', 'BPN Surabaya I · AJB 112', 'yudi', 'bagus', 'instansi', d(13), { created: d(-1), stepsDone: 1, value: 0 });
    job('chen', 'PT-DIRI', 'Pendirian PT PMA', 'Chen Wei Ming · manufaktur', 'chen', 'dewi', 'draft', d(20), { created: d(-6), stepsDone: 0, checkDone: [0, 2, 3], value: 18500000 });
    job('wasiat', 'WASIAT', 'Akta wasiat', 'Ibu Hartini', 'hartini', 'dewi', 'selesai', d(-9), { created: d(-16), completed: d(-9), value: 1500000 });
    job('leg', 'LEG', 'Legalisasi 14 dokumen', 'PT Sinar Bahari Nusantara', 'sinar', 'rina', 'selesai', d(-7), { created: d(-8), completed: d(-7), value: 1400000 });
    job('maya', 'PT-DIRI', 'Pendirian PT', 'Maya Kartika · usaha katering', 'maya', null, 'draft', d(15), { created: d(-1), stepsDone: 0, checkDone: [], value: 7500000 });
    job('bambang', 'AJB', 'AJB — H. Bambang Sutrisno', 'Tanah Rp 4,2 M · PEP (EDD wajib)', 'bambang', 'fajar', 'draft', d(10), { created: d(-3), stepsDone: 0, checkDone: [0, 1], value: 0 });
    DB.run('UPDATE annual_reports SET job_id=? WHERE company_id=?', [J.kencana, CO.kencana]);

    // ---------- deeds (repertorium & klapper) ----------
    const deed = (kind, date, nature, parties, o) => {
      o = o || {};
      const type = kind === 'notaris' ? 'AKTA' : kind === 'ppat' ? 'PPAT' : kind === 'legalisasi' ? 'LEG' : 'WAR';
      const n = NK.num.next(type, date); const rep = NK.num.next('REP', date).seq;
      const id = ins('deeds', { kind, number: n.no, rep_no: rep, deed_date: date, nature, job_id: o.job || null, client_id: o.client || null, value: o.value || null, created_at: now });
      parties.forEach((p) => ins('deed_parties', { deed_id: id, name: p, role: 'penghadap' }));
      if (o.ppat) ins('ppat_details', Object.assign({ deed_id: id }, o.ppat));
      if (o.archive) ins('archive', { deed_id: id, number: n.no, deed_date: date, nature, parties: parties.join(', '), cabinet: 'Lemari 6', box: 'Boks 148', folder: 'Map ' + n.no, source_protocol: 'Protokol sendiri' });
      return id;
    };
    // previous month (a few) and this month
    const pm = F.addMonths(T.slice(0, 7) + '-15', -1);
    deed('notaris', F.addDays(pm, -10), 'Pendirian PT', ['Dimas Prakoso'], { archive: 1 });
    deed('notaris', F.addDays(pm, -4), 'Perjanjian kerja sama', ['Lanny Halim', 'Rudi Setiawan'], { archive: 1 });
    deed('legalisasi', F.addDays(pm, 2), 'Legalisasi surat kuasa', ['Yohanes Tanoto']);
    deed('ppat', F.addDays(pm, 6), 'AJB', ['Hadi Prasetyo', 'Sri Wahyuni'], { ppat: { hak: 'SHM 902', nop: '35.78.010.004.012-0345.0', location: 'Kel. Rungkut Kidul', land_area: 180, building_area: 120, transaction_value: 950000000, njop: 820000000, bphtb: 42500000, pph: 23750000, from_party: 'Sri Wahyuni', to_party: 'Hadi Prasetyo' }, archive: 1 });
    const m0 = T.slice(0, 8);
    const dd = (n) => { const x = m0 + F.pad(Math.max(1, Math.min(n, Number(T.slice(8, 10))))); return x; };
    deed('notaris', dd(2), 'Akta wasiat', ['Hartini'], { job: J.wasiat, client: C.hartini, archive: 1 });
    deed('notaris', dd(6), 'Pernyataan Keputusan RUPS Tahunan', ['Hendra Wijaya'], { client: C.rkd, archive: 1 });
    deed('legalisasi', dd(7), 'Legalisasi 14 dokumen', ['Yohanes Tanoto'], { job: J.leg, client: C.sinar });
    deed('notaris', dd(8), 'Kuasa menjual', ['Yudi Hartono', 'Sri Wahyuni'], { client: C.yudi, archive: 1 });
    deed('notaris', dd(9), 'Perjanjian pengikatan jual beli', ['Lanny Halim', 'Rudi Setiawan'], { client: C.lanny, archive: 1 });
    deed('ppat', dd(10), 'AJB', ['Yudi Hartono', 'Hadi Wibisono'], { job: J.ajbyudi, client: C.yudi, value: 1350000000, ppat: { hak: 'SHM 1127', nop: '35.78.050.002.007-0112.0', location: 'Kel. Gubeng', land_area: 220, building_area: 150, transaction_value: 1350000000, njop: 1250000000, bphtb: 62500000, pph: 33750000, ssp_date: dd(9), ssb_date: dd(9), from_party: 'Yudi Hartono', to_party: 'Hadi Wibisono' }, archive: 1 });
    deed('notaris', dd(12), 'Pendirian PT Arunika Kreatif Digital', ['Kevin Lazuardi', 'Melinda Saraswati', 'Andre Gunawan'], { job: J.arunika, client: C.kevin, archive: 1 });
    deed('waarmerking', dd(12), 'Waarmerking perjanjian sewa', ['Dimas Prakoso']);
    { const rd = DB.get('SELECT id,deed_date FROM deeds WHERE nature LIKE ? ORDER BY id DESC LIMIT 1', ['Pernyataan Keputusan RUPS%']);
      DB.run('UPDATE annual_reports SET deed_id=?, deed_date=?, rups_date=? WHERE company_id=?', [rd.id, rd.deed_date, rd.deed_date, CO.rkd]); }
    // older archive (received protocol)
    ins('archive', { number: '1203', deed_date: '2004-11-05', nature: 'Jual beli (protokol H. Soedarto)', parties: 'Soetomo, Gunadi', cabinet: 'Ruang B', box: 'Rak 4 · Boks S-112', folder: '-', source_protocol: 'Notaris (alm.) H. Soedarto' });
    ins('archive', { number: '88', deed_date: '2016-07-22', nature: 'Wasiat', parties: 'Hartini', cabinet: 'Lemari 2 (brankas)', box: 'Boks 30', folder: 'Map 88', source_protocol: 'Protokol sendiri' });

    // ---------- calendar ----------
    const R = {}; DB.all('SELECT id,code FROM rooms').forEach((r) => (R[r.code] = r.id));
    const dow = F.parse(T).getDay(); const monday = d(-((dow + 6) % 7));
    const ap = (dayOff, s, e, title, user, room, client, o) => ins('appointments', Object.assign({ date: F.addDays(monday, dayOff), start: s, end: e, title, user_id: U[user], room_id: R[room], client_id: client ? C[client] : null, source: 'kantor', created_at: now }, o || {}));
    ap(0, '10:00', '11:30', 'TTD Pendirian PT Arunika', 'rina', 'R1', 'kevin', { job_id: J.arunika });
    ap(0, '13:00', '14:00', 'Konsultasi waris', 'dewi', 'R2', 'hartini');
    ap(1, '09:00', '10:00', 'TTD PPJB Lanny–Rudi', 'fajar', 'R1', 'lanny');
    ap(1, '14:00', '15:00', 'Rapat internal mingguan', 'notaris', 'RR', null);
    ap(2, '09:00', '12:00', 'Pengurusan BPN Surabaya I', 'bagus', 'LK', 'yudi');
    ap(2, '10:00', '11:00', 'Legalisasi 14 dokumen', 'rina', 'R2', 'sinar');
    ap(3, '09:00', '10:00', 'TTD APHT Bank Jatim', 'fajar', 'R1', 'jatim', { job_id: J.apht });
    ap(3, '10:30', '11:30', 'Konsultasi PT PMA (penerjemah)', 'dewi', 'R2', 'chen');
    ap(3, '13:00', '14:00', 'Konsultasi pendirian PT', 'rina', 'R2', 'maya');
    ap(4, '10:00', '11:00', 'TTD Perubahan direksi', 'dewi', 'RR', 'delta', { job_id: J.delta });
    ap(4, '14:00', '15:00', 'Konsultasi dokumen BO', 'dewi', 'R1', 'mitra');
    ap(5, '09:00', '11:00', 'Pelatihan PMPJ internal', 'siska', 'RR', null);
    ap(7, '09:00', '10:00', 'TTD AJB No. 114', 'fajar', 'R1', 'bambang');
    ap(8, '10:00', '12:00', 'RUPS Tahunan PT Kencana', 'dewi', 'RR', 'kencana', { job_id: J.kencana });
    ap(9, '10:00', '11:00', 'Konsultasi CV', 'rina', 'R2', 'sugeng');
    ap(10, '09:00', '10:30', 'RUPS Tahunan PT Batik Kenjeran', 'dewi', 'RR', 'batik');
    ap(11, '13:00', '14:00', 'TTD Pendirian CV Sumber Rejeki', 'rina', 'R1', 'sugeng', { job_id: J.cv });

    // ---------- staff: leave, attendance, training ----------
    ins('leaves', { user_id: U.rina, start_date: d(11), end_date: d(12), kind: 'Cuti tahunan', reason: 'Acara keluarga', status: 'diajukan', created_at: now });
    ins('leaves', { user_id: U.fajar, start_date: d(18), end_date: d(18), kind: 'Cuti tahunan', reason: '-', status: 'diajukan', created_at: now });
    ins('leaves', { user_id: U.dewi, start_date: d(-40), end_date: d(-38), kind: 'Cuti tahunan', status: 'disetujui', decided_by: U.notaris, decided_at: d(-45), created_at: d(-46) });
    [['dewi', '07:52', 'hadir'], ['rina', '08:03', 'hadir'], ['fajar', '07:58', 'hadir'], ['siska', '07:45', 'izin', 'Izin setengah hari'], ['bagus', '08:10', 'dinas', 'Dinas luar — BPN']]
      .forEach(([k, t, st, note]) => ins('attendance', { user_id: U[k], date: T, check_in: t, status: st, note: note || null }));
    ['dewi', 'rina', 'fajar'].forEach((k) => ins('trainings', { user_id: U[k], date: d(-220), topic: 'Penerapan PMPJ bagi Notaris (Permenkum 10/2026)', kind: 'pmpj', provider: 'Pengwil INI Jawa Timur' }));

    // ---------- portal messages ----------
    const msg = (k, sender, body, ago, user) => ins('messages', { client_id: C[k], sender, user_id: user ? U[user] : null, body, created_at: F.addDays(T, -ago) + ' 10:' + F.pad(10 + ago), read_at: sender === 'klien' ? (ago > 0 ? T : null) : null });
    msg('kevin', 'klien', 'Bu, SK PT saya sudah keluar belum ya?', 1);
    msg('kevin', 'kantor', 'Halo Pak Kevin, akta sudah ditandatangani dan sedang proses pengesahan di Kemenkum. Estimasi selesai dalam beberapa hari. Mohon unggah bukti setor modal di menu Dokumen.', 1, 'rina');
    msg('kevin', 'klien', 'Siap, saya unggah hari ini.', 0);
    msg('kencana', 'klien', 'Untuk RUPS nanti, apakah semua pemegang saham harus hadir? Salah satunya sedang di Medan.', 0);

    // ---------- sales ----------
    const quo = (cKey, title, date, valid, status, items, o) => {
      const id = ins('quotations', Object.assign({ no: NK.num.next('QUO', date).no, date, client_id: C[cKey], title, valid_until: valid, status, created_at: now }, o || {}));
      items.forEach(([desc, qty, price, acc]) => ins('quotation_items', { quotation_id: id, description: desc, qty, price, account_code: acc }));
      return id;
    };
    const H = '4-1000', P = '4-2000', JS = '4-3000', TP = '2-1200', TN = '2-1300';
    quo('hartini', 'Akta wasiat', d(-18), d(-4), 'diterima', [['Honorarium akta wasiat', 1, 1500000, H]]);
    quo('kevin', 'Pendirian PT Arunika Kreatif Digital', d(-9), d(5), 'diterima', [['Honorarium akta pendirian PT', 1, 4500000, H], ['PNBP pengesahan & pengumuman (titipan)', 1, 1580000, TN]]);
    quo('mitra', 'RUPS & peralihan saham', d(-8), d(6), 'terkirim', [['Honorarium akta RUPS', 1, 2500000, H], ['Honorarium akta jual beli saham', 1, 3000000, H], ['PNBP perubahan data (titipan)', 1, 500000, TN]]);
    quo('chen', 'Pendirian PT PMA', d(-6), d(8), 'negosiasi', [['Honorarium akta pendirian PT PMA', 1, 12000000, H], ['PNBP pengesahan & pengumuman (estimasi, titipan)', 1, 1580000, TN], ['Penerjemah tersumpah (Mandarin–Indonesia)', 1, 2500000, JS], ['Pengurusan NIB & perizinan PMA', 1, 2420000, JS]]);
    quo('batik', 'Akta RUPS Tahunan', d(-2), d(12), 'disetujui', [['Honorarium akta pernyataan keputusan RUPS Tahunan', 1, 2500000, H]]);
    quo('maya', 'Pendirian PT (usaha katering)', d(-1), d(13), 'terkirim', [['Honorarium akta pendirian PT', 1, 5000000, H], ['PNBP pengesahan & pengumuman (estimasi, titipan)', 1, 1580000, TN], ['Pengurusan NPWP badan & NIB', 1, 750000, JS], ['Pengecekan & pemesanan nama PT', 1, 170000, JS]]);

    const inv = (cKey, jobKey, date, due, items, o) => {
      const id = ins('invoices', Object.assign({ no: NK.num.next('INV', date).no, date, due_date: due, client_id: C[cKey], job_id: jobKey ? J[jobKey] : null, status: 'terbit', created_at: now }, o || {}));
      items.forEach(([desc, qty, price, acc]) => ins('invoice_items', { invoice_id: id, description: desc, qty, price, account_code: acc }));
      NK.acc.postInvoice(id);
      return id;
    };
    const pay = (invId, date, amount, method, cKey, receiptFor) => {
      const pid = ins('payments', { invoice_id: invId, date, amount, method, status: 'terverifikasi', source: 'kantor', created_at: now });
      NK.acc.postPayment(pid);
      const meterai = amount > 5000000 ? 1 : 0;
      ins('receipts', { no: NK.num.next('KW', date).no, date, payment_id: pid, client_id: C[cKey], received_from: DB.val('SELECT name FROM clients WHERE id=?', [C[cKey]]), amount, description: receiptFor, method, meterai, created_at: now });
      const r = NK.acc.receivable(invId); DB.run('UPDATE invoices SET status=? WHERE id=?', [r.due <= 0 ? 'lunas' : 'sebagian', invId]);
      return pid;
    };
    // invoices in date order (numbers follow dates)
    const iJatimOld = inv('jatim', null, d(-28), d(-14), [['Honorarium PPAT — APHT & SKMHT', 1, 6500000, P], ['PNBP Hak Tanggungan (titipan)', 1, 350000, TN]], { client_po_ref: 'KRD/PO/' + Y + '/1102' });
    const iRkd = inv('rkd', null, d(-19), d(-5), [['Honorarium akta pernyataan keputusan RUPS Tahunan', 1, 2500000, H]], { client_po_ref: 'PO-RKD/' + Y + '/09/014' });
    inv('delta', 'delta', d(-17), d(-3), [['Honorarium akta perubahan direksi', 1, 3000000, H], ['PNBP perubahan data (titipan)', 1, 600000, TN]], { client_po_ref: 'DMS-PO-0921' });
    inv('jatim', 'apht', d(-13), d(3), [['Honorarium PPAT — APHT', 1, 3200000, P], ['PNBP Hak Tanggungan (titipan)', 1, 350000, TN]], { client_po_ref: 'KRD/PO/' + Y + '/1187' });
    const iWasiat = inv('hartini', 'wasiat', d(-9), d(5), [['Honorarium akta wasiat', 1, 1500000, H]]);
    const iYudi = inv('yudi', 'ajbyudi', d(-9), d(-2), [['Honorarium PPAT — AJB', 1, 13500000, P], ['BPHTB (titipan, disetor ke Bapenda)', 1, 62500000, TP], ['PPh final penjual (titipan)', 1, 33750000, TP]]);
    const iLeg = inv('sinar', 'leg', d(-7), d(7), [['Legalisasi 14 dokumen', 14, 100000, '4-4000']]);
    const iKevin = inv('kevin', 'arunika', d(-1), d(13), [['Honorarium akta pendirian PT', 1, 4500000, H], ['PNBP pengesahan & pengumuman (titipan)', 1, 1580000, TN]]);
    // payments in date order (receipt numbers follow dates)
    pay(iJatimOld, d(-13), 6850000, 'Transfer', 'jatim', 'APHT & SKMHT');
    NK.acc.postDeposit({ date: d(-12), account: TN, amount: 350000, ref: 'PNBP HT', description: 'Setor PNBP Hak Tanggungan' });
    pay(iWasiat, d(-9), 1500000, 'Tunai', 'hartini', 'Akta wasiat');
    pay(iLeg, d(-7), 1400000, 'Tunai', 'sinar', 'Legalisasi 14 dokumen');
    pay(iRkd, d(-3), 2500000, 'Transfer', 'rkd', 'Akta RUPS Tahunan');
    pay(iYudi, d(-1), 109750000, 'Transfer', 'yudi', 'AJB — honorarium, BPHTB & PPh titipan');
    NK.acc.postDeposit({ date: d(-1), account: TP, amount: 62500000, ref: 'BPHTB AJB', description: 'Setor BPHTB AJB Yudi Hartono ke Bapenda' });
    DB.run("UPDATE quotations SET status='diterima', invoice_id=? WHERE title LIKE 'Pendirian PT Arunika%'", [iKevin]);
    DB.run("UPDATE quotations SET invoice_id=? WHERE title='Akta wasiat'", [iWasiat]);

    // ---------- purchasing ----------
    const V = {};
    [['sinar', 'CV Sinar Kertas Surabaya', 'Jl. Kapasan No. 61, Surabaya'], ['gram', 'Toko Buku Gramedia Surabaya', 'Jl. Basuki Rahmat No. 95, Surabaya'],
     ['arsip', 'PT Arsip Digital Nusantara', 'Jl. Ngagel Jaya Selatan No. 12, Surabaya'], ['surya', 'Elektronika Surya Jaya', 'Jl. Tunjungan No. 44, Surabaya'], ['mebel', 'CV Mebel Jati Rungkut', 'Jl. Rungkut Industri No. 3, Surabaya']]
      .forEach(([k, name, address]) => (V[k] = ins('vendors', { name, address, phone: '(031) 5' + (100000 + Object.keys(V).length * 12345) })));
    const po = (vKey, date, status, items, acc, o) => {
      const id = ins('purchase_orders', Object.assign({ no: NK.num.next('PO', date).no, date, vendor_id: V[vKey], status, expense_account: acc || '5-4000', created_by: U.siska, created_at: now }, o || {}));
      items.forEach(([desc, qty, price]) => ins('po_items', { po_id: id, description: desc, qty, price }));
      if (['disetujui', 'diterima', 'dibayar'].includes(status)) DB.run('UPDATE purchase_orders SET approved_by=?, approved_at=? WHERE id=?', [U.notaris, date, id]);
      if (['diterima', 'dibayar'].includes(status)) { DB.run('UPDATE purchase_orders SET received_at=? WHERE id=?', [F.addDays(date, 2), id]); NK.acc.postPOReceived(id, F.addDays(date, 2)); }
      if (status === 'dibayar') { DB.run('UPDATE purchase_orders SET paid_at=? WHERE id=?', [F.addDays(date, 3), id]); NK.acc.postPOPaid(id, F.addDays(date, 3)); }
      return id;
    };
    po('mebel', d(-23), 'dibayar', [['Lemari arsip besi tahan api', 1, 6200000]], '5-9000');
    po('surya', d(-17), 'diterima', [['Printer A3 inkjet', 1, 4750000], ['Ongkos kirim & instalasi', 1, 150000]], '5-9000');
    po('arsip', d(-10), 'disetujui', [['Jasa pindai minuta, per lembar', 1400, 6000]], '5-9000');
    po('gram', d(-7), 'dibayar', [['ATK kantor (paket bulanan)', 1, 1700000], ['Tinta printer A3 (set 4 warna)', 3, 500000]], '5-4000');
    po('sinar', T, 'menunggu', [['Kertas akta (blanko minuta) A3, per rim', 10, 285000], ['Map arsip protokol tebal', 200, 7500]], '5-4000');

    // ---------- accounting history ----------
    // Opening balance 6 months back, then monthly summary entries up to last month.
    const curM = T.slice(0, 7);
    const openDate = F.addMonths(curM + '-01', -6);
    NK.acc.post({ date: openDate, ref: 'SALDO AWAL', description: 'Saldo awal (data demo)', source: 'saldo-awal', lines: [
      { account: '1-1100', debit: 3000000 }, { account: '1-1200', debit: 95000000 }, { account: '1-1500', debit: 102000000 }, { account: '1-2100', debit: 145000000 },
      { account: '1-2900', credit: 39500000 }, { account: '3-1000', credit: 305500000 }] });
    const rev = [[86, 74], [92, 79], [88, 83], [80, 77], [96, 91], [84, 80]];
    for (let i = 0; i < 6; i++) {
      const m = F.addMonths(openDate, i); const end = F.addDays(F.addMonths(m, 1), -1); const ym = m.slice(0, 7);
      const k = rev[i][0] * 1e6, k2 = rev[i][1];
      const not = Math.round(k * 0.47 / 1000) * 1000, ppat = Math.round(k * 0.37 / 1000) * 1000, jasa = Math.round(k * 0.12 / 1000) * 1000, leg = k - not - ppat - jasa;
      NK.acc.post({ date: end, ref: 'RINGKASAN ' + ym, description: 'Ringkasan pendapatan ' + F.bulanTahun(ym) + ' (data demo)', source: 'ringkasan', lines: [
        { account: '1-1200', debit: k }, { account: '4-1000', credit: not }, { account: '4-2000', credit: ppat }, { account: '4-3000', credit: jasa }, { account: '4-4000', credit: leg }] });
      const isLast = i === 5;
      const lines = [{ account: '5-2000', debit: 8500000 }, { account: '1-1500', credit: 8500000 },
        { account: '5-3000', debit: 2100000 }, { account: '5-4000', debit: 2900000 + (k2 % 5) * 100000 }, { account: '5-5000', debit: 1500000 }, { account: '5-6000', debit: 2300000 },
        { account: '5-8000', debit: 700000 }, { account: '5-7000', debit: 1250000 }, { account: '1-2900', credit: 1250000 }, { account: '3-2000', debit: 9500000 }];
      if (!isLast) lines.push({ account: '5-1000', debit: 28000000 }, { account: '2-1400', credit: 2150000 }, { account: '1-1200', credit: 25850000 });
      const cashOut = lines.filter((l) => ['5-3000', '5-4000', '5-5000', '5-6000', '5-8000', '3-2000'].includes(l.account)).reduce((s, l) => s + l.debit, 0);
      lines.push({ account: '1-1200', credit: cashOut });
      NK.acc.post({ date: end, ref: 'RINGKASAN ' + ym, description: 'Ringkasan beban & prive ' + F.bulanTahun(ym) + ' (data demo)', source: 'ringkasan', lines });
      if (!isLast) NK.acc.post({ date: F.addDays(end, 15 - 31 + 31), ref: 'PPh21 ' + ym, description: 'Setor PPh 21 masa ' + F.bulanTahun(ym), source: 'pajak', lines: [{ account: '2-1400', debit: 2150000 }, { account: '1-1200', credit: 2150000 }] });
    }
    // last month payroll through the payroll module
    const lastM = F.addMonths(curM + '-01', -1).slice(0, 7);
    const run = ins('payroll_runs', { period: lastM, status: 'draft' });
    const pph = { dewi: 700000, rina: 450000, fajar: 400000, siska: 350000, bagus: 250000 };
    ['dewi', 'rina', 'fajar', 'siska', 'bagus'].forEach((k) => {
      const u = DB.get('SELECT * FROM users WHERE id=?', [U[k]]);
      ins('payroll_lines', { run_id: run, user_id: u.id, base: u.base_salary, allowance: u.allowance, overtime: 0, pph21: pph[k], net: u.base_salary + u.allowance - pph[k] });
    });
    NK.acc.postPayroll(run, F.addDays(curM + '-01', -1));
    // this month's routine costs
    NK.acc.post({ date: curM + '-01', ref: 'MEM/' + curM + '/001', description: 'Beban sewa kantor ' + F.bulanTahun(curM), source: 'manual', manual: 1, lines: [{ account: '5-2000', debit: 8500000 }, { account: '1-1500', credit: 8500000 }] });
    NK.acc.post({ date: curM + '-05' > T ? T : curM + '-05', ref: 'BK/' + curM + '/012', description: 'Listrik, internet & telepon', source: 'kas', lines: [{ account: '5-3000', debit: 2100000 }, { account: '1-1200', credit: 2100000 }] });
    NK.acc.post({ date: T, ref: 'PPh21 ' + lastM, description: 'Setor PPh 21 masa ' + F.bulanTahun(lastM), source: 'pajak', lines: [{ account: '2-1400', debit: 2150000 }, { account: '1-1200', credit: 2150000 }] });
    for (let i = 0; i < 6; i++) DB.run('INSERT OR IGNORE INTO periods(month,closed,closed_at,closed_by) VALUES(?,?,?,?)', [F.addMonths(openDate, i).slice(0, 7), i < 5 ? 1 : 0, i < 5 ? now : null, i < 5 ? 'Siska Maharani' : null]);
    DB.run('INSERT OR IGNORE INTO periods(month,closed) VALUES(?,0)', [curM]);
    // payroll draft this month
    const run2 = ins('payroll_runs', { period: curM, status: 'draft' });
    ['dewi', 'rina', 'fajar', 'siska', 'bagus'].forEach((k) => { const u = DB.get('SELECT * FROM users WHERE id=?', [U[k]]); ins('payroll_lines', { run_id: run2, user_id: u.id, base: u.base_salary, allowance: u.allowance, overtime: 0, pph21: pph[k], net: u.base_salary + u.allowance - pph[k] }); });

    // bank statement lines (imported) — one unmatched
    ins('bank_transactions', { bank_account_id: 2, date: d(-2), description: 'TRSF E-BANKING CR NOTARIS AP 3.550.000', amount_in: 3550000, amount_out: 0, imported_at: now });
    ins('bank_transactions', { bank_account_id: 2, date: d(-3), description: 'TRSF CR PT RUMAH KOPI DARMO', amount_in: 2500000, amount_out: 0, imported_at: now });

    // taxes
    const mDue = (ym, day) => F.addMonths(ym + '-01', 1).slice(0, 8) + F.pad(day);
    ins('tax_obligations', { name: 'PPh 21 karyawan (5 staf)', period: lastM, due_pay: mDue(lastM, 15), due_file: mDue(lastM, 20), amount: 2150000, status: 'disetor', paid_date: T });
    ins('tax_obligations', { name: 'PPh 21 karyawan (5 staf)', period: curM, due_pay: mDue(curM, 15), due_file: mDue(curM, 20), amount: 2150000, status: 'terjadwal' });
    ins('tax_obligations', { name: 'PPh 25 angsuran notaris', period: curM, due_pay: mDue(curM, 15), due_file: mDue(curM, 20), amount: 3600000, status: 'terjadwal' });
    ins('tax_obligations', { name: 'SPT Tahunan PPh orang pribadi', period: String(Y), due_pay: (Y + 1) + '-03-31', due_file: (Y + 1) + '-03-31', amount: 0, status: 'terjadwal', notes: 'Draf dari laporan laba rugi' });

    // notifications & outbox samples
    DB.notify('kantor', 'Pesan baru dari PT Kencana Agro Lestari', 'Pertanyaan tentang kehadiran pemegang saham RUPS', { client_id: C.kencana, link: '#/pesan' });
    DB.notify('kantor', 'PO menunggu persetujuan', 'PO kertas akta dari CV Sinar Kertas Surabaya', { link: '#/pembelian' });
    DB.email('kevin.lazuardi@arunika.id', 'Kevin Lazuardi', 'Undangan Portal Klien — Kantor Notaris Anindya Prameswari',
      'Yth. Bapak Kevin Lazuardi,\n\nAnda dapat memantau status pendirian PT Arunika Kreatif Digital melalui Portal Klien.\nMasuk dengan email ini; kode masuk akan dikirim setiap kali Anda login.\n\nSalam,\nKantor Notaris & PPAT Anindya Prameswari', 'undangan', C.kevin);

    DB.log('memuat data demo', 'office', 1, 'Kantor Notaris & PPAT Anindya Prameswari');
  };
})();
