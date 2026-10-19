/* Event Spotlight — business rules for documents, purchasing, artists, proposals, approvals and settlement.
   Every function that writes must be called inside ES.db.write(). */
(function () {
  const ES = (window.ES = window.ES || {});
  const F = () => ES.fmt, DB = () => ES.db;
  const who = () => (ES.session && ES.session.name) || 'System';
  const nowIso = () => F().nowStamp();
  const cfg = (k, eventId) => ES.cfg.get(k, { eventId });

  // ---------- accounting documents ----------
  const TYPE_CODE = { quotation: 'QUO', contract: 'CON', invoice: 'INV', receipt: 'KW' };
  function totals(lines, vat, eventId) {
    const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);
    const tax = vat ? Math.round(subtotal * cfg('tax.ppn_rate', eventId) / 100) : 0;
    return { subtotal, tax_amount: tax, total: subtotal + tax };
  }
  const stampFor = (total, eventId) => (total > cfg('tax.stamp_threshold', eventId) ? cfg('tax.stamp_amount', eventId) : 0);
  const DEFAULT_CLAUSES = [
    'The Sponsor will pay the contract value in the instalments set out in the invoice. Late payment of more than 14 days allows the Organiser to release the booth.',
    'The Organiser will deliver the benefits listed in the quotation. Changes to the layout or schedule will be notified at least 7 days in advance.',
    'Booth visitor counts are measured by camera head-count. They are estimates with a stated margin of error and are not a guarantee of attendance.',
    'If the event is cancelled by the Organiser, the deposit is refunded in full within 30 days. If the event is cancelled by force majeure, both parties will agree a credit towards a later event.',
    'Either party may end this contract in writing. Deposits are not refundable after 30 days before the event date, except as stated above.',
    'This contract is governed by the laws of the Republic of Indonesia.'
  ];
  function createDoc(o) {
    const lines = o.lines || []; const t = totals(lines, o.vat, o.eventId);
    const date = o.issue_date || F().today();
    const stamp = (o.type === 'contract' || o.type === 'receipt') ? stampFor(t.total, o.eventId) : 0;
    const no = ES.num.next(TYPE_CODE[o.type], date);
    const id = DB().insert('documents', { event_id: o.eventId, type: o.type, no, party_kind: o.party_kind || 'sponsor', party_id: o.party_id || null, party_name: o.party_name, party_address: o.party_address || '',
      issue_date: date, due_date: o.due_date || null, lines: JSON.stringify(lines), subtotal: t.subtotal, tax_amount: t.tax_amount, stamp, total: t.total, paid: o.paid || 0, status: o.status || 'draft',
      ref_doc_id: o.ref_doc_id || null, deal_id: o.deal_id || null, proposal_id: o.proposal_id || null, terms: o.terms || '', notes: o.notes || '', created_by: who(), created_at: nowIso() });
    DB().log('document created', 'documents', id, o.type + ' ' + no + ' · ' + o.party_name);
    return DB().get('SELECT * FROM documents WHERE id=?', [id]);
  }
  function quotationFor(deal, extra) {
    const pkg = DB().get('SELECT * FROM sponsor_packages WHERE id=?', [deal.package_id]) || { name: 'Sponsorship', price: deal.value };
    const ev = DB().get('SELECT * FROM events WHERE id=?', [deal.event_id]);
    return createDoc(Object.assign({ eventId: deal.event_id, type: 'quotation', party_kind: 'sponsor', party_id: deal.id, party_name: deal.company, party_address: deal.contact_name ? 'Attn. ' + deal.contact_name : '',
      lines: [{ desc: pkg.name + ' sponsorship package · ' + ev.name, qty: 1, price: deal.value || pkg.price }], vat: true, deal_id: deal.id, due_date: F().addDays(F().today(), 14), terms: 'Valid for 14 days.\nPrices exclude VAT unless shown.' }, extra || {}));
  }
  function contractFrom(q) {
    const deal = q.deal_id ? DB().get('SELECT * FROM sponsor_deals WHERE id=?', [q.deal_id]) : null;
    const c = createDoc({ eventId: q.event_id, type: 'contract', party_kind: q.party_kind, party_id: q.party_id, party_name: q.party_name, party_address: q.party_address, lines: JSON.parse(q.lines), vat: q.tax_amount > 0,
      ref_doc_id: q.id, deal_id: q.deal_id, proposal_id: q.proposal_id, status: 'issued', notes: JSON.stringify({ preamble: 'This contract is made between the Organiser and the Sponsor for the event named below.', clauses: DEFAULT_CLAUSES }) });
    DB().update('documents', q.id, { status: 'accepted' });
    if (deal) DB().update('sponsor_deals', deal.id, { stage: 'signed', signed_at: nowIso(), booth_code: deal.booth_code || nextBooth(deal.event_id) });
    return DB().get('SELECT * FROM documents WHERE id=?', [c.id]);
  }
  function nextBooth(eventId) { return 'B' + String((DB().val("SELECT COUNT(*) FROM sponsor_deals WHERE event_id=? AND booth_code IS NOT NULL", [eventId]) || 0) + 1).padStart(2, '0'); }
  function invoiceFrom(c, o) {
    o = o || {};
    const inv = createDoc({ eventId: c.event_id, type: 'invoice', party_kind: c.party_kind, party_id: c.party_id, party_name: c.party_name, party_address: c.party_address, lines: o.lines || JSON.parse(c.lines), vat: c.tax_amount > 0,
      ref_doc_id: c.id, deal_id: c.deal_id, due_date: o.due_date || F().addDays(F().today(), 14), status: 'issued', terms: o.terms || 'Payment within 14 days of the invoice date.' });
    const le = ES.ledger.invoiceIssued(inv); DB().update('documents', inv.id, { ledger_entry_id: le });
    return DB().get('SELECT * FROM documents WHERE id=?', [inv.id]);
  }
  /* Record money received against an invoice; when it is fully paid, issue the receipt (kwitansi). */
  function recordPayment(docId, o) {
    const d = DB().get('SELECT * FROM documents WHERE id=?', [docId]); if (!d || d.type !== 'invoice') throw new Error('Choose an invoice');
    const amt = Math.round(o.amount); const bal = d.total - d.paid; if (amt <= 0) throw new Error('Enter an amount'); if (amt > bal) throw new Error('That is more than the balance of ' + F().rp(bal));
    const date = o.date || F().today();
    const pid = DB().insert('payments', { event_id: d.event_id, direction: 'in', doc_id: d.id, amount: amt, date, method: o.method || 'Bank transfer', reference: o.reference || '', note: o.note || '', created_by: who() });
    const le = ES.ledger.paymentIn({ event_id: d.event_id, date, amount: amt, memo: 'Payment ' + d.no + ' ' + d.party_name, id: pid });
    const paid = d.paid + amt; const status = paid >= d.total ? 'paid' : 'partial';
    DB().update('documents', d.id, { paid, status }); DB().update('payments', pid, { ledger_entry_id: le });
    const rc = createDoc({ eventId: d.event_id, type: 'receipt', party_kind: d.party_kind, party_id: d.party_id, party_name: d.party_name, issue_date: date, status: 'issued', ref_doc_id: d.id,
      lines: [{ desc: 'Payment of ' + d.no + (status === 'partial' ? ' (instalment)' : ''), qty: 1, price: amt }], vat: false, notes: JSON.stringify({ method: o.method || 'Bank transfer' }) });
    DB().update('payments', pid, { receipt_doc_id: rc.id });
    DB().log('payment received', 'documents', d.id, d.no + ' · ' + F().rp(amt));
    return { paymentId: pid, receipt: DB().get('SELECT * FROM documents WHERE id=?', [rc.id]), status };
  }

  // ---------- purchasing ----------
  function createPO(o) {
    const date = F().today(); const no = ES.num.next('PO', date);
    const id = DB().insert('purchase_orders', { event_id: o.eventId, vendor_id: o.vendor_id || null, no, category: o.category, description: o.description, amount: Math.round(o.amount), tax_code: o.tax_code || 'none',
      budget_line_id: o.budget_line_id || null, status: o.status || 'draft', pic_id: o.pic_id || null, order_date: date, due_date: o.due_date || null, source: o.source || null, source_id: o.source_id || null, quote_amount: o.quote_amount || null });
    DB().log('purchase order', 'purchase_orders', id, no + ' · ' + o.description);
    return DB().get('SELECT * FROM purchase_orders WHERE id=?', [id]);
  }
  function orderPO(id) { const p = DB().get('SELECT * FROM purchase_orders WHERE id=?', [id]); if (p.status !== 'draft') throw new Error('Only a draft can be ordered'); DB().update('purchase_orders', id, { status: 'ordered', approved_by: who(), approved_at: nowIso() }); }
  function confirmDelivery(id, note) { const p = DB().get('SELECT * FROM purchase_orders WHERE id=?', [id]); if (!['ordered', 'invoiced'].includes(p.status)) throw new Error('This order is not waiting for delivery'); DB().update('purchase_orders', id, { delivered_at: nowIso(), delivered_by: who() + (note ? ' · ' + note : '') }); DB().log('delivery confirmed', 'purchase_orders', id, p.no); }
  function recordVendorInvoice(id, o) {
    const p = DB().get('SELECT * FROM purchase_orders WHERE id=?', [id]); if (!['ordered', 'invoiced'].includes(p.status)) throw new Error('Order must be placed first');
    DB().update('purchase_orders', id, { invoice_no: o.no, invoice_amount: Math.round(o.amount), invoice_date: o.date || F().today(), status: 'invoiced' });
  }
  /* Three-way match: order amount, PIC delivery confirmation, vendor invoice. */
  function match(p) {
    const reasons = []; const ctx = { eventId: p.event_id };
    if (p.invoice_amount === null || p.invoice_amount === undefined) reasons.push('No vendor invoice yet');
    if (ES.cfg.get('finance.require_delivery', ctx) && !p.delivered_at) reasons.push('Delivery not confirmed by the PIC');
    if (p.invoice_amount !== null && p.invoice_amount !== undefined) {
      const tol = ES.cfg.get('finance.match_tolerance_pct', ctx); const diff = Math.abs(p.invoice_amount - p.amount) / (p.amount || 1) * 100;
      if (diff > tol) reasons.push('Invoice ' + F().rp(p.invoice_amount) + ' differs from the order ' + F().rp(p.amount) + ' (' + diff.toFixed(1) + '%, tolerance ' + tol + '%)');
    }
    return { ok: reasons.length === 0, reasons };
  }
  function taxesFor(p) {
    const base = p.invoice_amount === null || p.invoice_amount === undefined ? p.amount : p.invoice_amount; const code = p.tax_code || 'none'; const ctx = { eventId: p.event_id };
    return { base, ppn: /PPN/.test(code) ? Math.round(base * ES.cfg.get('tax.ppn_rate', ctx) / 100) : 0, pph: /PPh23/.test(code) ? Math.round(base * ES.cfg.get('tax.pph23_rate', ctx) / 100) : 0 };
  }
  /* Approve and pay. Posts the vendor bill (expense, VAT input, withholding) and the payment. Exceptions need a note. */
  function approvePayment(id, o) {
    o = o || {}; const p = DB().get('SELECT * FROM purchase_orders WHERE id=?', [id]); if (p.status === 'paid') throw new Error('Already paid');
    const m = match(p); if (!m.ok && !o.exception) throw new Error('Cannot pay: ' + m.reasons.join('; '));
    if (!m.ok && !o.note) throw new Error('Write a note explaining the exception');
    const t = taxesFor(p); const date = o.date || F().today();
    const v = DB().get('SELECT name FROM vendors WHERE id=?', [p.vendor_id]);
    const bill = ES.ledger.vendorBill({ event_id: p.event_id, date, category: p.category, amount: t.base, ppn: t.ppn, pph: t.pph, memo: 'Bill ' + (p.invoice_no || p.no) + ' · ' + (v ? v.name : p.description), id: p.id });
    const net = t.base + t.ppn - t.pph;
    const pid = DB().insert('payments', { event_id: p.event_id, direction: 'out', po_id: p.id, amount: net, date, method: o.method || 'Bank transfer', reference: p.invoice_no || '', note: o.note || '', created_by: who() });
    const le = ES.ledger.vendorPayment({ event_id: p.event_id, date, amount: net, memo: 'Payment ' + p.no + (v ? ' · ' + v.name : ''), id: pid });
    DB().update('payments', pid, { ledger_entry_id: le });
    DB().update('purchase_orders', id, { status: 'paid', paid_at: nowIso(), payment_id: pid, approved_by: who() });
    DB().log('vendor payment', 'purchase_orders', id, p.no + ' · ' + F().rp(net) + (m.ok ? '' : ' · exception: ' + o.note));
    void bill; return { paymentId: pid, net };
  }

  // ---------- artists ----------
  const REQ_FLOW = ['requested', 'costed', 'approved', 'confirmed'];
  function addArtistRequest(artistId, o) {
    return DB().insert('artist_requests', { artist_id: artistId, category: o.category, request: o.request, qty: Number(o.qty) || 1, est_cost: Math.round(o.est_cost || 0), status: o.est_cost ? 'costed' : 'requested', created_at: nowIso(), by: o.by || who() });
  }
  function costArtistRequest(id, cost) { DB().update('artist_requests', id, { est_cost: Math.round(cost), status: 'costed' }); }
  /* Approving creates an order so the cost lands in the budget immediately. */
  function decideArtistRequest(id, approve, note) {
    const r = DB().get('SELECT r.*, a.event_id, a.name artist FROM artist_requests r JOIN artists a ON a.id=r.artist_id WHERE r.id=?', [id]);
    if (r.status !== 'costed') throw new Error('Cost the request before deciding');
    if (!approve) { DB().update('artist_requests', id, { status: 'declined', decided_by: who(), decided_at: nowIso(), note: note || '' }); return null; }
    const line = DB().get("SELECT id FROM budget_lines WHERE event_id=? AND category='Artists'", [r.event_id]);
    const po = createPO({ eventId: r.event_id, category: 'Artists', description: r.artist + ': ' + r.request + (r.qty > 1 ? ' × ' + r.qty : ''), amount: r.est_cost, budget_line_id: line ? line.id : null, status: 'ordered', source: 'artist_request', source_id: r.id });
    DB().update('artist_requests', id, { status: 'approved', approved_cost: r.est_cost, decided_by: who(), decided_at: nowIso(), po_id: po.id, note: note || '' });
    DB().notify('role:producer', 'Artist request approved', r.artist + ': ' + r.request, { link: '#/artists' });
    return po;
  }
  function confirmArtistRequest(id) { DB().update('artist_requests', id, { status: 'confirmed' }); }

  // ---------- proposals ----------
  const PROPOSAL_TYPES = { sponsor: 'Sponsor proposal', rac: 'Investor RAC proposal', rfq: 'Vendor request for quotation', promotor: 'Promotor agreement' };
  function eventFacts(eventId) {
    const ev = DB().get('SELECT * FROM events WHERE id=?', [eventId]); const types = DB().all('SELECT * FROM ticket_types WHERE event_id=?', [eventId]);
    const cap = types.reduce((s, t) => s + t.quota, 0); const avg = cap ? types.reduce((s, t) => s + t.price * t.quota, 0) / cap : 0;
    const planned = DB().val('SELECT COALESCE(SUM(planned),0) FROM budget_lines WHERE event_id=?', [eventId]) || 0;
    const signed = DB().val("SELECT COALESCE(SUM(value),0) FROM sponsor_deals WHERE event_id=? AND stage='signed'", [eventId]) || 0;
    const pipeline = DB().val("SELECT COALESCE(SUM(value),0) FROM sponsor_deals WHERE event_id=? AND stage IN ('proposal','negotiating')", [eventId]) || 0;
    const artists = DB().all("SELECT name FROM artists WHERE event_id=? AND status IN ('confirmed','contracted') ORDER BY CASE role WHEN 'headliner' THEN 0 ELSE 1 END", [eventId]).map((a) => a.name);
    return { ev, types, capacity: cap || ev.capacity, avgPrice: Math.round(avg), planned, signed, pipeline, artists, org: DB().get('SELECT * FROM org WHERE id=1') };
  }
  // The break-even maths used by the investor RAC. Scenarios are estimates, never promises.
  function racModel(facts, a) {
    a = Object.assign({ sell: { low: 70, base: 85, high: 95 }, sponsorShare: { low: 0, base: 50, high: 100 }, investment: 0, profitShare: 0 }, a || {});
    const out = ['low', 'base', 'high'].map((k) => {
      const tickets = Math.round(facts.capacity * a.sell[k] / 100); const ticketRev = tickets * facts.avgPrice;
      const sponsor = Math.round(facts.signed + facts.pipeline * a.sponsorShare[k] / 100); const revenue = ticketRev + sponsor; const profit = revenue - facts.planned;
      return { key: k, sell: a.sell[k], tickets, ticketRev, sponsor, revenue, cost: facts.planned, profit, margin: revenue ? profit / revenue * 100 : 0, investorReturn: Math.round(Math.max(profit, 0) * a.profitShare / 100) };
    });
    const be = facts.avgPrice ? Math.ceil(Math.max(0, facts.planned - facts.signed) / facts.avgPrice) : 0;
    return { assumptions: a, scenarios: out, breakEvenTickets: be, breakEvenPct: facts.capacity ? be / facts.capacity * 100 : 0 };
  }
  function createProposal(o) {
    const date = F().today(); const no = ES.num.next('PRO', date);
    const id = DB().insert('proposals', { event_id: o.eventId, type: o.type, doc_no: no, title: o.title, recipient: o.recipient, recipient_ref: o.recipient_ref || null, data: JSON.stringify(o.data || {}), status: 'draft', version: 1, created_by: who(), created_at: nowIso() });
    DB().log('proposal created', 'proposals', id, no + ' · ' + o.title); return DB().get('SELECT * FROM proposals WHERE id=?', [id]);
  }
  function saveProposal(id, data, title) {
    const p = DB().get('SELECT * FROM proposals WHERE id=?', [id]); if (p.locked_at) throw new Error('This version was sent and its numbers are locked. Create a new version to change it.');
    DB().update('proposals', id, { data: JSON.stringify(data), title: title || p.title });
  }
  // Sending locks the numbers (a snapshot of the event facts) and creates a tracked share link.
  function sendProposal(id, email) {
    const p = DB().get('SELECT * FROM proposals WHERE id=?', [id]); const d = JSON.parse(p.data || '{}'); const facts = eventFacts(p.event_id);
    d.snapshot = { at: nowIso(), capacity: facts.capacity, avgPrice: facts.avgPrice, planned: facts.planned, signed: facts.signed, date: facts.ev.date };
    const token = ES.tix.rand(6);
    DB().update('proposals', id, { data: JSON.stringify(d), status: 'sent', locked_at: nowIso(), share_token: token, approved_by: who() });
    if (email) DB().email(email, p.recipient, p.title + ' (' + p.doc_no + ')', 'Hello,\n\nPlease find our ' + PROPOSAL_TYPES[p.type].toLowerCase() + ' for ' + facts.ev.name + '.\nView it here: share/' + token + '\n\n' + (facts.org.name || ''), 'proposal');
    if (p.type === 'sponsor' && p.recipient_ref) DB().run("UPDATE sponsor_deals SET stage='proposal' WHERE id=? AND stage='lead'", [p.recipient_ref]);
    DB().log('proposal sent', 'proposals', id, p.doc_no + ' → ' + p.recipient); return token;
  }
  function newProposalVersion(id) {
    const p = DB().get('SELECT * FROM proposals WHERE id=?', [id]); const nid = DB().insert('proposals', { event_id: p.event_id, type: p.type, doc_no: p.doc_no, title: p.title, recipient: p.recipient, recipient_ref: p.recipient_ref, data: p.data, status: 'draft', version: p.version + 1, created_by: who(), created_at: nowIso() });
    DB().update('proposals', id, { status: p.status === 'accepted' ? 'accepted' : 'superseded' }); return nid;
  }
  function markProposalViewed(token) { const p = DB().get('SELECT * FROM proposals WHERE share_token=?', [token]); if (!p) return null; DB().update('proposals', p.id, { views: p.views + 1, last_viewed: nowIso(), status: p.status === 'sent' ? 'viewed' : p.status }); return p; }
  /* Accepting a sponsor proposal creates the quotation, contract and first invoice in one step. */
  function acceptSponsorProposal(id) {
    const p = DB().get('SELECT * FROM proposals WHERE id=?', [id]); if (p.type !== 'sponsor') throw new Error('Only sponsor proposals create sponsor documents');
    const deal = DB().get('SELECT * FROM sponsor_deals WHERE id=?', [p.recipient_ref]); if (!deal) throw new Error('Link this proposal to a sponsor deal first');
    const d = JSON.parse(p.data || '{}'); if (d.packageId) { const pk = DB().get('SELECT * FROM sponsor_packages WHERE id=?', [d.packageId]); DB().update('sponsor_deals', deal.id, { package_id: pk.id, value: d.price || pk.price }); }
    const fresh = DB().get('SELECT * FROM sponsor_deals WHERE id=?', [deal.id]);
    const q = quotationFor(fresh, { proposal_id: p.id, status: 'accepted' }); const c = contractFrom(q); const inv = invoiceFrom(c);
    DB().update('proposals', id, { status: 'accepted' });
    DB().notify('role:finance', 'Sponsor signed: ' + fresh.company, 'Invoice ' + inv.no + ' issued for ' + F().rp(inv.total), { link: '#/accounting' });
    return { quotation: q, contract: c, invoice: inv };
  }

  // ---------- approvals ----------
  function requestApproval(o) {
    return DB().insert('approvals', { event_id: o.eventId, kind: o.kind, title: o.title, detail: o.detail || '', needs_role: o.needs_role || 'second_person', ref_kind: o.ref_kind || null, ref_id: o.ref_id || null, payload: JSON.stringify(o.payload || {}),
      requested_by: who(), requested_by_id: ES.session ? ES.session.id : null, created_at: nowIso() });
  }
  // A second person must decide: the requester cannot approve their own request.
  function decideApproval(id, approve, note) {
    const a = DB().get('SELECT * FROM approvals WHERE id=?', [id]); if (a.status !== 'pending') throw new Error('Already decided');
    if (a.needs_role === 'second_person' && ES.session && a.requested_by_id === ES.session.id) throw new Error('A second person must decide this. You made the request.');
    DB().update('approvals', id, { status: approve ? 'approved' : 'rejected', decided_by: who(), decided_at: nowIso(), note: note || '' });
    if (a.kind === 'rule_change') { if (approve) ES.cfg.applyApproved(a.ref_id); else ES.cfg.rejectPending(a.ref_id); }
    if (a.kind === 'proposal_send') { const p = JSON.parse(a.payload || '{}'); if (approve) sendProposal(a.ref_id, p.email); }
    DB().log('approval ' + (approve ? 'approved' : 'rejected'), 'approvals', id, a.title);
    return a;
  }
  const exportAllowed = (eventId) => !!DB().get("SELECT id FROM approvals WHERE kind='data_export' AND status='approved' AND event_id=? AND (note IS NULL OR note NOT LIKE 'used%') ORDER BY id DESC", [eventId]);
  function consumeExport(eventId) { const a = DB().get("SELECT id FROM approvals WHERE kind='data_export' AND status='approved' AND event_id=? AND (note IS NULL OR note NOT LIKE 'used%') ORDER BY id DESC", [eventId]); if (a) DB().update('approvals', a.id, { note: 'used ' + nowIso() }); }

  // ---------- settlement ----------
  function commissionStatement(eventId) {
    return DB().all('SELECT * FROM promotors WHERE event_id=? ORDER BY name', [eventId]).map((p) => {
      const sold = DB().val("SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.promotor_id=? AND t.status IN ('valid','used','void') AND t.transferred_from IS NULL", [p.id]) || 0;
      const scanned = DB().val("SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.promotor_id=? AND t.status='used'", [p.id]) || 0;
      const paid = DB().val("SELECT COALESCE(SUM(amount),0) FROM payments WHERE direction='out' AND note=?", ['commission:' + p.id]) || 0;
      return Object.assign(p, { sold, scanned, due: scanned * p.commission, paid, open: Math.max(0, scanned * p.commission - paid) });
    });
  }
  function settleCommission(promotorId) {
    const p = DB().get('SELECT * FROM promotors WHERE id=?', [promotorId]); const st = commissionStatement(p.event_id).find((x) => x.id === promotorId);
    if (!st || st.open <= 0) throw new Error('Nothing to settle');
    ES.ledger.commission({ event_id: p.event_id, date: F().today(), amount: st.open, memo: 'Commission ' + p.name + ' · ' + st.scanned + ' scanned', id: p.id });
    const pid = DB().insert('payments', { event_id: p.event_id, direction: 'out', amount: st.open, date: F().today(), method: 'Bank transfer', note: 'commission:' + p.id, created_by: who() });
    ES.ledger.commissionPaid({ event_id: p.event_id, date: F().today(), amount: st.open, memo: 'Paid commission ' + p.name, id: pid });
    return st.open;
  }
  function recogniseRevenue(eventId) {
    if (DB().setting('recognised.' + eventId, '')) throw new Error('Revenue was already recognised for this event');
    const dep = ES.ledger.trial(eventId).find((r) => r.code === '2100'), sp = ES.ledger.trial(eventId).find((r) => r.code === '2110');
    const tickets = Math.max(0, dep ? dep.net : 0), sponsors = Math.max(0, sp ? sp.net : 0);
    const ev = DB().get('SELECT date FROM events WHERE id=?', [eventId]); const date = ev && ev.date && ev.date <= F().today() ? ev.date : F().today();
    const id = ES.ledger.recognise({ event_id: eventId, date, tickets, sponsors });
    DB().setSetting('recognised.' + eventId, F().today()); DB().update('events', eventId, { status: 'closed' });
    return { id, tickets, sponsors };
  }

  // ---------- live numbers ----------
  function liveStats(eventId) {
    const q = (sql, p) => DB().val(sql, p || [eventId]) || 0;
    const sold = q("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status IN ('valid','used') AND rescue=0");
    const entered = q("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='used'");
    const dup = q("SELECT COUNT(*) FROM scans WHERE event_id=? AND result='duplicate'");
    const expired = q("SELECT COUNT(*) FROM scans WHERE event_id=? AND result='expired'");
    const invalid = q("SELECT COUNT(*) FROM scans WHERE event_id=? AND result IN ('invalid','void','wrong_event','refunded')");
    const open = q("SELECT COUNT(*) FROM disputes WHERE event_id=? AND status NOT IN ('resolved')");
    const resolved = q("SELECT COUNT(*) FROM disputes WHERE event_id=? AND status='resolved'");
    const inc = q("SELECT COUNT(*) FROM incidents WHERE event_id=? AND status='open'");
    const last5 = q("SELECT COUNT(*) FROM scans WHERE event_id=? AND result='valid' AND at>=?", [eventId, new Date(Date.now() - 5 * 60000).toISOString().slice(0, 10) + ' ' + new Date(Date.now() - 5 * 60000).toTimeString().slice(0, 8)]);
    return { sold, entered, dup, expired, invalid, openDisputes: open, resolvedDisputes: resolved, openIncidents: inc, last5, pool: q("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='pool'") };
  }
  function salesSummary(eventId) {
    const rev = DB().val("SELECT COALESCE(SUM(subtotal),0) FROM orders WHERE event_id=? AND status='paid'", [eventId]) || 0;
    const byDay = DB().all("SELECT substr(created_at,1,10) d, COUNT(t.id) n, wave_kind w FROM orders o JOIN tickets t ON t.order_id=o.id WHERE o.event_id=? AND t.transferred_from IS NULL AND t.rescue=0 GROUP BY d, w ORDER BY d", [eventId]);
    return { revenue: rev, byDay };
  }

  ES.biz = { totals, stampFor, DEFAULT_CLAUSES, createDoc, quotationFor, contractFrom, invoiceFrom, recordPayment, nextBooth, createPO, orderPO, confirmDelivery, recordVendorInvoice, match, taxesFor, approvePayment,
    REQ_FLOW, addArtistRequest, costArtistRequest, decideArtistRequest, confirmArtistRequest, PROPOSAL_TYPES, eventFacts, racModel, createProposal, saveProposal, sendProposal, newProposalVersion, markProposalViewed, acceptSponsorProposal,
    requestApproval, decideApproval, exportAllowed, consumeExport, commissionStatement, settleCommission, recogniseRevenue, liveStats, salesSummary };
})();
