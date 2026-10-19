/* Event Spotlight booth counter. A device at a sponsor booth counts visitors crossing a line.
   Counting source: the camera (simple motion tracking) or a built-in walk-by simulator for rehearsal. Counts are saved per minute. */
(function () {
  const ES = window.ES, F = ES.fmt, DB = () => ES.db, { $, $$, esc, toast } = ES.ui;
  const SS = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  let step = 'setup', run = null; // run: {mode, in, out, trueIn, trueOut, raf, stream, people, acc, lastFlush, unsavedIn, unsavedOut}
  const dev = () => { const id = Number(SS.get('es-booth-dev')); return id ? DB().get('SELECT * FROM booth_devices WHERE id=?', [id]) : null; };
  const deal = (d) => DB().get('SELECT d.*, p.name pname FROM sponsor_deals d LEFT JOIN sponsor_packages p ON p.id=d.package_id WHERE d.id=?', [d.deal_id]);

  async function boot() {
    document.body.innerHTML = '<div class="screen"><div class="box" style="text-align:center"><div class="logo">Event Spotlight</div><div class="strip logo-s"></div><p class="muted"><span class="spin"></span> Loading…</p></div></div>';
    try { await ES.db.init('booth'); } catch (e) { document.body.innerHTML = `<div class="screen"><div class="card"><h2>The counter could not start</h2><p class="muted">${esc(e.message)}</p></div></div>`; return; }
    ES.db.onChange((m) => { if (m && !m.remote) return; if (!dev()) { const a = document.activeElement; if (!(a && a.matches('input'))) route(); } }); route();
  }
  function route() {
    if (ES.db.state !== 'ready') { document.body.innerHTML = `<div class="screen"><div class="box card" style="max-width:480px;text-align:center"><div class="logo" style="font-size:32px">Booth counter</div><div class="strip logo-s"></div><p class="muted" style="margin:10px 0">No database in this browser yet. Open erp/index.html in this same browser first.</p><button class="btn primary" onclick="location.reload()">Check again</button></div></div>`; return; }
    const d = dev(); if (!d) return pair(); main(d);
  }
  function pair() {
    const ev = DB().get("SELECT * FROM events WHERE status IN ('on_sale','live') ORDER BY date LIMIT 1") || DB().get('SELECT * FROM events ORDER BY date DESC LIMIT 1');
    const ds = DB().all("SELECT b.*, d.company, d.booth_code FROM booth_devices b JOIN sponsor_deals d ON d.id=b.deal_id WHERE b.event_id=? AND d.stage='signed' ORDER BY d.company", [ev.id]);
    document.body.innerHTML = `<div class="screen"><div class="box" style="max-width:520px"><div class="logo" style="font-size:36px">Booth counter</div><div class="strip logo-s"></div><p class="muted" style="text-align:center">${esc(ev.name)} · pick your booth and enter the booth code from your sponsor pack.</p><div class="card" style="margin-top:14px">${ds.length ? `<label class="field"><span>Booth</span><select class="input" id="bd" style="min-height:48px">${ds.map((d) => `<option value="${d.id}">${esc(d.company)} · booth ${esc(d.booth_code || '?')}</option>`).join('')}</select></label><label class="field" style="margin-top:12px"><span>Booth code</span><input class="input" id="bc" placeholder="e.g. B01" autocapitalize="characters" style="min-height:48px"></label><button class="btn primary" id="go" style="margin-top:14px;min-height:52px;width:100%">Pair this device</button><div class="demo" id="dm" style="background:var(--yellow-soft);border:1px dashed var(--line);padding:10px;margin-top:12px;font-size:14px"></div>` : '<div class="muted">No signed sponsors with a booth yet.</div>'}</div></div></div>`;
    if (!ds.length) return; const hint = () => { const d = ds.find((x) => x.id === Number($('#bd').value)); $('#dm').innerHTML = '<b>Demo only.</b> Booth code for this sponsor: <b>' + esc(d.booth_code) + '</b>'; }; $('#bd').onchange = hint; hint();
    $('#go').onclick = () => { const d = ds.find((x) => x.id === Number($('#bd').value)); if ($('#bc').value.trim().toUpperCase() !== String(d.booth_code).toUpperCase()) return toast('That booth code is not right', 'err'); SS.set('es-booth-dev', String(d.id)); step = d.calibrated ? 'live' : 'setup'; route(); };
  }

  // ---------- main ----------
  function stopRun() { if (run) { cancelAnimationFrame(run.raf); clearInterval(run.timer); if (run.stream) run.stream.getTracks().forEach((t) => t.stop()); } run = null; }
  function main(d) {
    const dl = deal(d); const hasCalib = !!d.calibrated;
    document.body.innerHTML = `<div class="bh"><div style="flex:1"><b>${esc(dl.company)}</b><div style="color:#A3AECB;font-size:14px">Booth ${esc(dl.booth_code || '')} · ${esc(dl.pname || '')}</div></div><span class="tag ${d.status === 'live' ? 'g' : 'a'}">${esc(d.status)}</span><button class="btn sm" id="unp" style="background:transparent;color:#fff;border-color:#8896B8">Unpair</button></div><div class="bw"><div class="steps"><span class="${step === 'setup' ? 'on' : 'done'}">1 Place the line</span><span class="${step === 'calib' ? 'on' : hasCalib ? 'done' : ''}">2 Check accuracy</span><span class="${step === 'live' ? 'on' : ''}">3 Count</span></div><div id="st"></div></div>`;
    $('#unp').onclick = () => { stopRun(); SS.set('es-booth-dev', null); route(); };
    $$('.steps span').forEach((s, i) => (s.style.cursor = 'pointer', s.onclick = () => { const to = ['setup', 'calib', 'live'][i]; if (to === 'live' && !hasCalib) return toast('Check the accuracy first', 'err'); stopRun(); step = to; main(dev()); }));
    ({ setup, calib, live })[step]($('#st'), d, dl);
  }
  function stageHTML() { return '<div class="stage-c" id="sc"><canvas id="cv" width="400" height="500"></canvas></div>'; }

  // counting engine (simulator and camera share the crossing logic)
  function startEngine(d, { mode, onTick }) {
    const cv = $('#cv'), ctx = cv.getContext('2d'); const W = cv.width, H = cv.height; run = { mode, in: 0, out: 0, trueIn: 0, trueOut: 0, people: [], last: performance.now(), traffic: 50, line: d.line_y, dir: d.direction, sens: d.sensitivity, unsIn: 0, unsOut: 0, lastFlush: Date.now(), stream: null, vid: null, prev: null, ly: null, cool: 0 };
    const detectP = () => 0.55 + run.sens / 100 * 0.45; // chance a crossing is noticed
    const spawn = () => { const down = Math.random() < 0.6; run.people.push({ x: 40 + Math.random() * (W - 80), y: down ? -10 : H + 10, vy: (down ? 1 : -1) * (40 + Math.random() * 60), r: 9 + Math.random() * 3, c: down ? 1 : 0, was: null }); };
    const crossed = (isDownward) => { const into = run.dir === 'down' ? isDownward : !isDownward; if (into) run.in++, run.unsIn++; else run.out++, run.unsOut++; };
    const frame = (t) => { const dt = Math.min(0.5, (t - run.last) / 1000); run.last = t; ctx.fillStyle = '#0B1226'; ctx.fillRect(0, 0, W, H);
      if (run.mode === 'cam' && run.vid && run.vid.readyState >= 2) { ctx.drawImage(run.vid, 0, 0, W, H); camStep(); }
      if (run.mode === 'sim') { if (Math.random() < dt * run.traffic / 25) spawn(); const ly = run.line * H; run.people.forEach((p) => { const y0 = p.y; p.y += p.vy * dt; const down = p.vy > 0; if ((y0 < ly && p.y >= ly) || (y0 > ly && p.y <= ly)) { if (down) run.trueIn += run.dir === 'down' ? 1 : 0, run.trueOut += run.dir === 'down' ? 0 : 1; else run.trueOut += run.dir === 'down' ? 1 : 0, run.trueIn += run.dir === 'down' ? 0 : 1; if (Math.random() < detectP()) crossed(down); }
          ctx.fillStyle = p.c ? '#7FA2FF' : '#FFC93C'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }); run.people = run.people.filter((p) => p.y > -30 && p.y < H + 30); }
      const ly = run.line * H; ctx.strokeStyle = '#FFC93C'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#FFC93C'; ctx.font = '700 18px sans-serif'; ctx.fillText(run.dir === 'down' ? '↓ in' : '↑ in', 10, ly - 8);
      onTick && onTick(run); run.raf = requestAnimationFrame(frame); };
    const camStep = () => { const w = 64, h = 80; const c = camStep.c || (camStep.c = document.createElement('canvas')); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(run.vid, 0, 0, w, h); const img = x.getImageData(0, 0, w, h).data; const g = new Uint8Array(w * h); for (let i = 0; i < g.length; i++) g[i] = (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]) / 3;
      if (run.prev) { let sy = 0, n = 0; const th = 40 - run.sens * 0.3; for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - run.prev[i]) > th) { sy += Math.floor(i / w); n++; } if (n > 60) { const cy = sy / n / h; const ly = run.line; if (run.ly !== null && ((run.ly < ly && cy >= ly) || (run.ly > ly && cy <= ly)) && performance.now() > run.cool) { crossed(cy >= ly); run.cool = performance.now() + 700; } run.ly = cy; } else run.ly = null; } run.prev = g; };
    run.raf = requestAnimationFrame(frame); return run;
  }
  async function useCamera() { try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.srcObject = s; await v.play(); run.stream = s; run.vid = v; run.mode = 'cam'; return true; } catch (e) { toast('Camera not available. Using the simulator.', 'err'); return false; } }
  function flush(d, force) { if (!run) return; if (!force && Date.now() - run.lastFlush < 10000) return; if (!run.unsIn && !run.unsOut) { run.lastFlush = Date.now(); return; } const i = run.unsIn, o = run.unsOut, src = run.mode === 'cam' ? 'ai' : 'sim'; run.unsIn = run.unsOut = 0; run.lastFlush = Date.now(); const ts = F.nowStamp(); ES.db.write('booth counts', () => { DB().insert('booth_counts', { event_id: d.event_id, deal_id: d.deal_id, device_id: d.id, ts, hour: ts.slice(11, 13) + ':00', in_count: i, out_count: o, source: src }); DB().update('booth_devices', d.id, { last_seen: ts, status: 'live' }); }).catch(() => {}); }

  // ---------- step 1: place the line ----------
  function setup(el, d) {
    el.innerHTML = `<div class="card">${stageHTML()}<div class="stack" style="margin-top:14px"><label class="field"><span>Counting line position</span><input type="range" id="ly" min="15" max="85" value="${Math.round(d.line_y * 100)}"></label><div class="row" style="gap:8px"><label class="field" style="flex:1"><span>Which way is “in”?</span><select class="input" id="dr"><option value="down" ${d.direction === 'down' ? 'selected' : ''}>Moving down the screen</option><option value="up" ${d.direction === 'up' ? 'selected' : ''}>Moving up the screen</option></select></label><label class="field" style="flex:1"><span>Sensitivity ${d.sensitivity}</span><input type="range" id="se" min="10" max="100" value="${d.sensitivity}"></label></div>
      <div class="row" style="gap:8px"><button class="btn" id="cam" style="min-height:48px">Use camera</button><button class="btn" id="sim" style="min-height:48px">Use simulator</button><span class="muted" style="flex:1">Put the line across the walkway in front of your booth. Visitors who cross it are counted.</span></div><button class="btn primary" id="nx" style="min-height:52px">Save and check accuracy →</button></div></div>`;
    const eng = startEngine(d, { mode: 'sim' }); const sync = () => { eng.line = $('#ly').value / 100; eng.dir = $('#dr').value; eng.sens = Number($('#se').value); $('#se').previousElementSibling.textContent = 'Sensitivity ' + eng.sens; }; ['ly', 'dr', 'se'].forEach((i) => ($('#' + i).oninput = sync));
    $('#cam').onclick = async () => { if (await useCamera()) toast('Camera on', 'ok'); }; $('#sim').onclick = () => { if (run.stream) run.stream.getTracks().forEach((t) => t.stop()); run.stream = null; run.vid = null; run.mode = 'sim'; };
    $('#nx').onclick = async () => { const v = { line_y: eng.line, direction: eng.dir, sensitivity: eng.sens }; const mode = run.mode; stopRun(); await ES.db.write('booth setup', () => DB().update('booth_devices', d.id, Object.assign({ status: d.calibrated ? 'live' : 'setup', calibrated: 0 }, v))); SS.set('es-booth-mode', mode); step = 'calib'; main(dev()); };
  }

  // ---------- step 2: accuracy ----------
  function calib(el, d) {
    el.innerHTML = `<div class="card"><div class="notice" style="margin-bottom:10px">Count by hand for a few minutes while the device counts. Press <b>Start</b>, tally the visitors who walk in with your own eyes, then press <b>Stop</b> and type your number. We compare the two.</div>${stageHTML()}<div class="row" style="gap:12px;margin-top:12px"><div class="bigcount" style="font-size:64px;flex:1" id="ai">0<small>device counted (in)</small></div><div style="flex:1;text-align:center"><div class="muted">Time</div><div style="font:700 44px var(--display)" id="tm">0:00</div></div></div><div class="row" style="gap:8px;margin-top:10px"><button class="btn go" id="go1" style="min-height:52px;flex:1">Start</button><button class="btn" id="sp" style="min-height:52px;flex:1" disabled>Stop</button></div><div id="res" style="margin-top:14px"></div></div>`;
    let t0 = 0, running = false; const eng = startEngine(d, { mode: SS.get('es-booth-mode') === 'cam' ? 'sim' : 'sim', onTick: (r) => { $('#ai').firstChild.textContent = r.in; if (running) { const s = Math.floor((Date.now() - t0) / 1000); $('#tm').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); } } });
    const camp = SS.get('es-booth-mode') === 'cam'; if (camp) useCamera().then((ok) => { if (!ok) eng.mode = 'sim'; });
    eng.traffic = 80; $("#go1").onclick = () => { eng.in = eng.out = eng.trueIn = eng.trueOut = 0; running = true; t0 = Date.now(); $("#go1").disabled = true; $('#sp').disabled = false; };
    $('#sp').onclick = () => { running = false; $('#sp').disabled = true; const ai = eng.in; const tr = eng.trueIn; const camMode = eng.mode === 'cam'; cancelAnimationFrame(eng.raf);
      $('#res').innerHTML = `<label class="field"><span>How many did you count by hand?</span><input class="input" id="hc" type="number" min="1" style="min-height:52px;font-size:22px;max-width:200px"></label>${!camMode ? `<div class="demo" style="background:var(--yellow-soft);border:1px dashed var(--line);padding:10px;margin-top:8px;font-size:14px"><b>Demo only.</b> The simulator knows the true number: ${tr}. <button class="btn sm" id="ft">Use it</button></div>` : ''}<button class="btn primary" id="ck" style="margin-top:10px;min-height:52px;width:100%">Compare and save</button>`;
      if ($('#ft')) $('#ft').onclick = () => ($('#hc').value = tr); $('#ck').onclick = async () => { const hc = Number($('#hc').value); if (!hc || hc < 1) return toast('Type your hand count', 'err'); const acc = Math.round(Math.min(ai, hc) / Math.max(ai, hc) * 100); const ok = acc >= 85; const d2 = dev();
        await ES.db.write('booth calibration', () => DB().update('booth_devices', d2.id, { calib_ai: ai, calib_hand: hc, calibrated: ok ? 1 : 0, status: ok ? 'live' : 'setup' }));
        $('#res').innerHTML = `<div class="notice ${ok ? 'ok' : 'err'}"><b>Accuracy ${acc}%.</b> The device counted ${ai}, you counted ${hc}. ${ok ? 'Good enough. The sponsor report will show this accuracy next to the numbers.' : 'Below 85%. Raise the sensitivity, move the line, or move the camera, then try again.'}</div><button class="btn primary" id="gl" style="margin-top:10px;min-height:52px;width:100%">${ok ? 'Start counting →' : 'Back to line setup'}</button>`; $('#gl').onclick = () => { stopRun(); step = ok ? 'live' : 'setup'; main(dev()); }; }; };
  }

  // ---------- step 3: live ----------
  function live(el, d, dl) {
    const today = F.today(); const tot = () => DB().val('SELECT COALESCE(SUM(in_count),0) FROM booth_counts WHERE device_id=? AND substr(ts,1,10)=?', [d.id, today]) || 0;
    const hours = () => DB().all('SELECT hour, SUM(in_count) n FROM booth_counts WHERE device_id=? AND substr(ts,1,10)=? GROUP BY hour ORDER BY hour', [d.id, today]);
    el.innerHTML = `<div class="card">${stageHTML()}<div class="bigcount" id="big">0<small>visitors today · this device is ${d.calib_hand ? Math.round(Math.min(d.calib_ai, d.calib_hand) / Math.max(d.calib_ai, d.calib_hand) * 100) : '?'}% accurate</small></div><div class="hbar" id="hb"></div><div class="row" style="gap:8px;margin-top:34px;flex-wrap:wrap"><button class="btn" id="mode" style="min-height:48px">Rehearse with simulator</button><button class="btn" id="csv" style="min-height:48px">Download CSV</button><button class="btn" id="rc" style="min-height:48px">Check accuracy again</button></div><div class="muted" style="margin-top:8px" id="note"></div></div>`;
    const base = tot(); let started = false; const draw = () => { const hs = hours(); const mx = Math.max(1, ...hs.map((h) => h.n)); $('#hb').innerHTML = hs.map((h) => `<div style="height:${h.n / mx * 100}%"><span>${h.hour.slice(0, 2)}</span></div>`).join(''); };
    const eng = startEngine(d, { mode: 'sim', onTick: (r) => { if (!started) return; $('#big').firstChild.textContent = F.num(base + r.in); flush(d); } }); eng.traffic = 30; $('#big').firstChild.textContent = F.num(base); draw();
    $('#note').textContent = 'Counting. Numbers are saved every few seconds. Source: simulator (rehearsal).'; started = true;
    const redraw = setInterval(() => { if (!document.getElementById('hb')) return clearInterval(redraw); draw(); }, 5000); run.timer = redraw;
    $('#mode').onclick = async () => { if (run.mode === 'sim') { if (await useCamera()) { run.mode = 'cam'; $('#mode').textContent = 'Back to simulator'; $('#note').textContent = 'Counting with the camera.'; } } else { if (run.stream) run.stream.getTracks().forEach((t) => t.stop()); run.stream = null; run.vid = null; run.mode = 'sim'; $('#mode').textContent = 'Use camera'; $('#note').textContent = 'Simulator (rehearsal).'; } };
    $('#csv').onclick = () => { flush(d, true); setTimeout(() => { const rows = DB().all('SELECT ts,hour,in_count,out_count,source FROM booth_counts WHERE device_id=? ORDER BY id', [d.id]); const csv = 'time,hour,in,out,source\n' + rows.map((r) => [r.ts, r.hour, r.in_count, r.out_count, r.source].join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'booth-' + dl.company.replace(/\W+/g, '-') + '.csv'; a.click(); }, 400); };
    $('#rc').onclick = () => { flush(d, true); stopRun(); step = 'calib'; main(dev()); };
    window.addEventListener('beforeunload', () => flush(d, true), { once: true });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
