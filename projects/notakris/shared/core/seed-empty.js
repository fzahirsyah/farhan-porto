/* NotaKris — base data for every new database (empty or demo):
   chart of accounts, rooms, bank accounts, service templates, default settings. */
(function () {
  const NK = (window.NK = window.NK || {});

  const ACCOUNTS = [
    ['1-1100', 'Kas kecil', 'aset'], ['1-1200', 'Bank operasional', 'aset'],
    ['1-1300', 'Bank titipan klien', 'aset', 1, 'Rekening terpisah, hanya untuk dana klien (BPHTB, PPh, PNBP)'],
    ['1-1400', 'Piutang usaha', 'aset'], ['1-1500', 'Biaya dibayar dimuka', 'aset'],
    ['1-2100', 'Peralatan & inventaris kantor', 'aset'], ['1-2900', 'Akumulasi penyusutan', 'aset', 0, 'Saldo normal kredit (pengurang aset)'],
    ['2-1100', 'Utang usaha', 'kewajiban'],
    ['2-1200', 'Titipan pajak klien (BPHTB/PPh)', 'kewajiban', 1, 'Uang klien, bukan pendapatan — disetor ke Bapenda/DJP'],
    ['2-1300', 'Titipan PNBP klien', 'kewajiban', 1, 'PNBP AHU/BPN yang dibayar klien'],
    ['2-1400', 'Utang PPh 21 karyawan', 'kewajiban'],
    ['3-1000', 'Modal notaris', 'ekuitas'], ['3-2000', 'Prive notaris', 'ekuitas', 0, 'Pengambilan pribadi notaris'], ['3-3000', 'Laba ditahan', 'ekuitas'],
    ['4-1000', 'Honorarium akta notaris', 'pendapatan', 0, 'Sesuai batas honorarium Pasal 36 UUJN'],
    ['4-2000', 'Honorarium akta PPAT', 'pendapatan'], ['4-3000', 'Jasa pengurusan', 'pendapatan'],
    ['4-4000', 'Legalisasi & waarmerking', 'pendapatan'], ['4-9000', 'Pendapatan lain-lain', 'pendapatan'],
    ['5-1000', 'Gaji & tunjangan staf', 'beban'], ['5-2000', 'Sewa kantor', 'beban'], ['5-3000', 'Listrik, internet & telepon', 'beban'],
    ['5-4000', 'ATK & cetak akta', 'beban'], ['5-5000', 'Iuran organisasi & pelatihan', 'beban'], ['5-6000', 'Transport & pengurusan', 'beban'],
    ['5-7000', 'Penyusutan', 'beban'], ['5-8000', 'Langganan software', 'beban'], ['5-9000', 'Beban lain-lain', 'beban']
  ];

  const ROOMS = [['R1', 'Ruang Tanda Tangan 1', '#2f5fa8', 'ruang'], ['R2', 'Ruang Tanda Tangan 2', '#2f7d5b', 'ruang'], ['RR', 'Ruang Rapat', '#b8892f', 'ruang'], ['LK', 'Luar kantor', '#8a8e99', 'luar']];

  // [code, name, category, fee, sla, steps[], checklist[[name, required, clientUpload, ocr]]]
  const SERVICES = [
    ['PT-DIRI', 'Pendirian PT', 'N', 5000000, 14,
      ['Data & dokumen diterima', 'Draft akta disetujui', 'Penandatanganan akta', 'Pengesahan Kemenkum', 'NPWP badan & NIB', 'Penyerahan salinan & SK'],
      [['KTP semua pendiri', 1, 1, 1], ['NPWP semua pendiri', 1, 1, 0], ['Usulan 3 nama PT', 1, 1, 0], ['Bidang usaha (KBLI 2025)', 1, 1, 0], ['Surat pernyataan pemilik manfaat', 1, 1, 0], ['Surat persetujuan pemilik manfaat', 1, 1, 0], ['Bukti setor modal', 1, 1, 0]]],
    ['PT-RUPST', 'Akta RUPS Tahunan', 'N', 2500000, 7,
      ['Laporan tahunan diterima', 'Draft akta', 'Penandatanganan akta', 'Lapor ke SABH (maks. 30 hari)', 'Selesai'],
      [['Laporan tahunan', 1, 1, 0], ['Laporan keuangan', 1, 1, 0], ['Risalah/notulen RUPS', 1, 1, 0], ['Surat kuasa pemegang saham (jika diwakili)', 0, 1, 0]]],
    ['PT-UBAH', 'Perubahan data / anggaran dasar PT', 'N', 3000000, 10,
      ['Dokumen diterima', 'Draft akta', 'Penandatanganan akta', 'Pemberitahuan/persetujuan Kemenkum', 'Selesai'],
      [['Risalah RUPS / keputusan sirkuler', 1, 1, 0], ['KTP pengurus baru', 1, 1, 1], ['Data pemilik manfaat terbaru', 1, 1, 0], ['Bukti laporan tahunan terakhir', 1, 1, 0]]],
    ['CV', 'Pendirian CV', 'N', 2500000, 10, ['Dokumen diterima', 'Draft akta', 'Penandatanganan akta', 'Pendaftaran SABU', 'Selesai'], [['KTP semua sekutu', 1, 1, 1], ['NPWP semua sekutu', 1, 1, 0], ['Usulan nama CV', 1, 1, 0]]],
    ['YYS', 'Pendirian Yayasan', 'N', 4000000, 14, ['Dokumen diterima', 'Draft akta', 'Penandatanganan akta', 'Pengesahan Kemenkum', 'Selesai'], [['KTP pendiri & pengurus', 1, 1, 1], ['Usulan nama yayasan', 1, 1, 0]]],
    ['WASIAT', 'Akta wasiat', 'N', 1500000, 7, ['Konsultasi', 'Penandatanganan akta', 'Lapor Daftar Pusat Wasiat', 'Selesai'], [['KTP pemberi wasiat', 1, 1, 1]]],
    ['KUASA', 'Akta kuasa menjual', 'N', 1000000, 5, ['Dokumen diterima', 'Penandatanganan akta', 'Selesai'], [['KTP para pihak', 1, 1, 1], ['Sertipikat (salinan)', 1, 1, 0]]],
    ['PPJB', 'Perjanjian pengikatan jual beli', 'N', 2000000, 7, ['Dokumen diterima', 'Draft akta', 'Penandatanganan akta', 'Selesai'], [['KTP & KK para pihak', 1, 1, 1], ['Sertipikat (salinan)', 1, 1, 0], ['Bukti pembayaran uang muka', 0, 1, 0]]],
    ['AJB', 'Akta jual beli (AJB)', 'P', 0, 21, ['Cek sertipikat di BPN', 'Validasi BPHTB & PPh', 'Penandatanganan AJB', 'Pendaftaran balik nama', 'Sertipikat selesai'],
      [['KTP & KK penjual dan pembeli', 1, 1, 1], ['NPWP para pihak', 1, 1, 0], ['Sertipikat asli', 1, 0, 0], ['SPPT PBB 5 tahun terakhir', 1, 1, 0], ['Persetujuan suami/istri', 1, 1, 0]]],
    ['APHT', 'Akta pemberian hak tanggungan (APHT)', 'P', 3200000, 7, ['Dokumen dari bank diterima', 'Penandatanganan APHT', 'Pendaftaran HT elektronik', 'Selesai'], [['Perjanjian kredit', 1, 1, 0], ['Sertipikat', 1, 0, 0], ['KTP debitur', 1, 1, 1]]],
    ['HIBAH', 'Akta hibah', 'P', 0, 21, ['Dokumen diterima', 'Validasi pajak', 'Penandatanganan akta', 'Balik nama', 'Selesai'], [['KTP & KK para pihak', 1, 1, 1], ['Sertipikat asli', 1, 0, 0]]],
    ['LEG', 'Legalisasi', 'N', 100000, 1, ['Dokumen diterima', 'Selesai'], [['Dokumen yang dilegalisasi', 1, 1, 0]]],
    ['WAR', 'Waarmerking', 'N', 100000, 1, ['Dokumen diterima', 'Selesai'], [['Dokumen yang didaftarkan', 1, 1, 0]]],
    ['BN', 'Pengurusan balik nama sertipikat', 'U', 1500000, 30, ['Berkas diserahkan ke BPN', 'Proses BPN', 'Sertipikat selesai', 'Diserahkan ke klien'], [['Sertipikat asli', 1, 0, 0], ['AJB', 1, 0, 0]]],
    ['FID', 'Akta fidusia', 'N', 500000, 3, ['Data diterima', 'Penandatanganan akta', 'Pendaftaran fidusia online', 'Selesai'], [['Perjanjian pembiayaan', 1, 1, 0]]]
  ];

  function base(DB, opt) {
    opt = opt || {};
    ACCOUNTS.forEach(([code, name, type, cf, note]) => DB.insert('accounts', { code, name, type, client_fund: cf || 0, note: note || null }));
    ROOMS.forEach(([code, name, color, kind]) => DB.insert('rooms', { code, name, color, kind }));
    DB.insert('bank_accounts', { name: 'Kas kecil', number: '-', account_code: '1-1100', kind: 'kas' });
    DB.insert('bank_accounts', { name: opt.bankOps || 'Bank operasional', number: opt.bankOpsNo || '-', account_code: '1-1200', kind: 'operasional' });
    DB.insert('bank_accounts', { name: opt.bankTrust || 'Rekening titipan klien', number: opt.bankTrustNo || '-', account_code: '1-1300', kind: 'titipan' });
    SERVICES.forEach(([code, name, category, fee, sla, steps, checklist]) =>
      DB.insert('services', { code, name, category, default_fee: fee, sla_days: sla, steps: JSON.stringify(steps), checklist: JSON.stringify(checklist) }));
    [['jam_buka', '08:00'], ['jam_tutup', '16:00'], ['batas_meterai', '5000000'], ['tarif_meterai', '10000'], ['mode', opt.mode || 'kosong'], ['kota_default', opt.city || '']]
      .forEach(([k, v]) => DB.setSetting(k, v));
    [['CONTOH — Nama Terduga A', '0000000000000001', 'DTTOT (contoh)'], ['CONTOH — Organisasi B', '', 'Daftar pendanaan proliferasi (contoh)']]
      .forEach(([name, nik, list]) => DB.insert('sanctions', { name, nik: nik || null, list_name: list, note: 'Data contoh — ganti dengan daftar resmi terbaru dari PPATK/Kemenkum', added_at: NK.fmt.today() }));
    if (opt.office) DB.insert('office', Object.assign({ id: 1 }, opt.office));
    if (opt.admin) {
      DB.insert('users', { name: opt.admin.name, short: opt.admin.short || opt.admin.name.split(' ')[0], role: 'notaris', title: 'Notaris & PPAT', email: opt.admin.email || null,
        pin_hash: NK.auth.hashPin(opt.admin.pin), capacity: 10, color: '#744C68', joined: NK.fmt.today(), confidentiality_signed: 1, created_at: NK.fmt.nowStamp() });
    }
  }

  NK.seed = NK.seed || {};
  NK.seed.ACCOUNTS = ACCOUNTS; NK.seed.SERVICES = SERVICES;
  NK.seed.base = base;
  NK.seed.empty = function (DB, form) {
    base(DB, {
      mode: 'kosong', city: form.city,
      office: { name: form.officeName, notary_name: form.notaryName, notary_title: form.notaryTitle || '', roles: form.roles || 'Notaris & PPAT', sk_no: form.skNo || '', wilayah: form.wilayah || form.city,
        address: form.address || '', city: form.city || '', phone: form.phone || '', email: form.email || '', npwp: form.npwp || '' },
      admin: { name: form.notaryName + (form.notaryTitle ? ', ' + form.notaryTitle : ''), short: form.notaryName.split(' ')[0], pin: form.pin, email: form.email }
    });
    DB.insert('periods', { month: NK.fmt.today().slice(0, 7), closed: 0 });
    DB.log('membuat database kosong', 'office', 1, form.officeName);
  };
})();
