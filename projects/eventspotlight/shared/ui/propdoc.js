/* Event Spotlight - proposal document model (shared by the ERP editor and the partner portal). */
(function () {
  const ES = window.ES, F = ES.fmt, DB = () => ES.db; const TYPES = ES.biz.PROPOSAL_TYPES;
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  function factsFor(p, d) { const f = ES.biz.eventFacts(p.event_id); if (d.snapshot) { f.capacity = d.snapshot.capacity; f.avgPrice = d.snapshot.avgPrice; f.planned = d.snapshot.planned; f.signed = d.snapshot.signed; } return f; }
  function model(p, d) {
    const f = factsFor(p, d); const o = f.org; const ev = f.ev; const sec = d.sections || {}; const b = [];
    const when = F.date(ev.date, 'long') + (ev.doors ? ', doors ' + ev.doors : ''); const where = [ev.venue, ev.city].filter(Boolean).join(', ');
    const base = { title: TYPES[p.type], no: p.doc_no + (p.version > 1 ? ' v' + p.version : ''), to: { label: 'Prepared for', lines: [p.recipient || '—'] }, meta: [['Event', ev.name], ['Date', when], ['Venue', where || 'To be confirmed']], notes: [], sign: { city: o.city, date: F.today(), title: o.name, name: o.signatory } };
    if (p.type === 'sponsor') {
      const pk = DB().get('SELECT * FROM sponsor_packages WHERE id=?', [d.packageId]) || { name: 'Package', price: d.price || 0, benefits: '' };
      if (sec.cover) base.cover = { title: ev.name, sub: pk.name + ' sponsorship proposal for ' + (p.recipient || '') };
      if (d.intro) b.push({ t: 'p', text: d.intro });
      if (sec.audience) { b.push({ t: 'h2', text: 'The audience' }); b.push({ t: 'p', text: `${ev.name} is a ${(ev.type || 'concert').toLowerCase()} at ${where || 'a venue in ' + (ev.city || 'Indonesia')} on ${when}. We plan for ${F.num(f.capacity)} guests. ${f.artists.length ? 'Confirmed artists: ' + f.artists.join(', ') + '.' : ''}` });
        b.push({ t: 'table', head: ['Ticket type', 'Price', 'Seats'], rows: f.types.map((t) => [t.name, F.rp(t.price), F.num(t.quota)]), numCols: [1, 2], colW: [50, 25, 25] }); }
      if (sec.package) { b.push({ t: 'h2', text: pk.name + ' package' }); b.push({ t: 'table', head: ['No', 'What you receive'], rows: String(pk.benefits || '').split('|').filter(Boolean).map((x, i) => [i + 1, x]), colW: [8, 92] }); }
      if (sec.booth) { b.push({ t: 'h2', text: 'Your booth' }); b.push({ t: 'p', text: (d.boothSize ? 'Booth size: ' + d.boothSize + '. ' : '') + 'Your booth is placed on the event layout and fitted with a camera head-count so you receive a visitor report after the show. Counts are estimates with a stated margin of error, not a guarantee.' }); }
      if (sec.numbers) { b.push({ t: 'h2', text: 'Investment' }); const price = d.price || pk.price; const vat = Math.round(price * ES.cfg.get('tax.ppn_rate', { eventId: ev.id }) / 100); b.push({ t: 'totals', rows: [[pk.name + ' package', F.rp(price)], ['VAT (PPN) ' + ES.cfg.get('tax.ppn_rate', { eventId: ev.id }) + '%', F.rp(vat)], ['Total', F.rp(price + vat), true]] }); }
      if (sec.terms) { b.push({ t: 'h2', text: 'How it works' }); b.push({ t: 'p', text: d.paymentTerms || 'Accepting this proposal creates a quotation, a contract and an invoice. We ask for payment within 14 days of the invoice date.' }); }
      if (d.extra) b.push({ t: 'p', text: d.extra });
    } else if (p.type === 'rac') {
      const m = ES.biz.racModel(f, d.assumptions); const a = m.assumptions;
      if (sec.summary) { b.push({ t: 'h2', text: 'Summary' }); b.push({ t: 'p', text: `${ev.name} plans ${F.num(f.capacity)} tickets at an average of ${F.rp(f.avgPrice)}. The planned cost is ${F.rp(f.planned)}. ${a.investment ? 'We ask for ' + F.rp(a.investment) + ' of investment against ' + a.profitShare + '% of profit.' : ''} Signed sponsors today: ${F.rp(f.signed)}. The event breaks even at ${F.num(m.breakEvenTickets)} tickets (${m.breakEvenPct.toFixed(0)}% of capacity), counting signed sponsors only.` }); }
      if (sec.budget) { b.push({ t: 'h2', text: 'Budget' }); const bl = ES.ledger.budgetStatus(f.ev.id); const cats = {}; bl.forEach((x) => (cats[x.category] = (cats[x.category] || 0) + x.planned)); b.push({ t: 'table', head: ['Category', 'Planned', 'Share'], rows: Object.entries(cats).map(([k, v]) => [k, F.rp(v), (f.planned ? v / f.planned * 100 : 0).toFixed(0) + '%']).concat([['Total', F.rp(f.planned), '100%']]), numCols: [1, 2], colW: [50, 30, 20] }); }
      if (sec.scenarios) { b.push({ t: 'h2', text: 'Scenarios' }); b.push({ t: 'p', text: 'These are estimates, not promises. Sell-through is the share of seats sold. Sponsor income uses signed deals plus a share of the pipeline.' });
        b.push({ t: 'table', head: ['', 'Low', 'Base', 'High'], rows: [['Sell-through', ...m.scenarios.map((s) => s.sell + '%')], ['Tickets sold', ...m.scenarios.map((s) => F.num(s.tickets))], ['Ticket revenue', ...m.scenarios.map((s) => F.rp(s.ticketRev))], ['Sponsor income', ...m.scenarios.map((s) => F.rp(s.sponsor))], ['Total revenue', ...m.scenarios.map((s) => F.rp(s.revenue))], ['Planned cost', ...m.scenarios.map((s) => F.rp(s.cost))], ['Profit or loss', ...m.scenarios.map((s) => F.rp(s.profit))], ['Margin', ...m.scenarios.map((s) => s.margin.toFixed(1) + '%')]].concat(a.investment ? [['Investor return (' + a.profitShare + '% of profit)', ...m.scenarios.map((s) => F.rp(s.investorReturn))]] : []), numCols: [1, 2, 3], colW: [40, 20, 20, 20] }); }
      if (sec.risks) { b.push({ t: 'h2', text: 'Risks' }); lines(d.risks).forEach((r) => b.push({ t: 'clause', n: '•', text: r })); }
      base.title = 'Investment proposal (RAC)';
    } else if (p.type === 'rfq') {
      b.push({ t: 'h2', text: 'Request for quotation: ' + (d.category || '') }); b.push({ t: 'p', text: 'We invite you to quote for the event above. Please reply with your price, delivery plan and terms by ' + (d.deadline ? F.date(d.deadline, 'long') : 'the date agreed') + '.' });
      b.push({ t: 'h2', text: 'Scope' }); b.push({ t: 'p', text: d.scope || '—' });
      if (lines(d.items).length) b.push({ t: 'table', head: ['No', 'Item', 'Qty'], rows: lines(d.items).map((x, i) => { const [n, q] = x.split('|'); return [i + 1, n.trim(), (q || '1').trim()]; }), colW: [8, 80, 12] });
      b.push({ t: 'h2', text: 'How we choose' }); b.push({ t: 'p', text: d.criteria || '' });
    } else {
      b.push({ t: 'h2', text: 'Promotor agreement' }); b.push({ t: 'p', text: `${p.recipient} will sell tickets for ${ev.name} through its own code and receive a commission for each ticket that is scanned at the gate.` });
      b.push({ t: 'table', head: ['Term', 'Value'], rows: [['Commission per scanned ticket', F.rp(d.commission || 0)], ['Allocation', F.num(d.quota || 0) + ' tickets'], ['Paid', 'After the show, from scanned tickets only']], colW: [50, 50] });
      b.push({ t: 'h2', text: 'Rules' }); lines(d.rules).forEach((r, i) => b.push({ t: 'clause', n: (i + 1) + '.', text: r }));
      base.sign.counter = p.recipient; base.sign.counterTitle = 'For the promotor';
    }
    base.blocks = b; return base;
  }

  // ---------- editor ----------
  ES.propDoc = { model, factsFor, lines };
})();
