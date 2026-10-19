/* Buku 3.1 — property agency deals. All accounting uses Buku.posting; never writes ledger lines directly. */
(function () {
  'use strict';
  const B = window.Buku, U = B.util;
  const E = (code, message) => new B.BukuError(code, message);
  const now = () => U.nowIso();
  const validId = (db, table, id) => !id || !!db.scalar('SELECT 1 FROM ' + table + ' WHERE id=?', [id]);
  const asId = v => v ? Number(v) : null;
  const amount = (value, label) => {
    const v = Number(value);
    if (!Number.isSafeInteger(v) || v < 0) throw E('invalid_amount', 'Invalid ' + label + '. Use whole rupiah.');
    return v;
  };
  const positive = (v,label) => { const n=amount(v,label); if (!n) throw E('invalid_amount',label+' must be greater than zero.'); return n; };
  const inTransaction = (db, callback) => db.tx(callback);
  const base = db => B.fx.base(db);
  const code = (db, c) => {
    const acc = db.get('SELECT * FROM accounts WHERE code=? AND is_active=1 AND is_header=0', [c]);
    if (!acc) throw E('no_account', 'Required account ' + c + ' is not active.');
    return acc.id;
  };
  const subtype = (db, name) => B.docs.accountBySubtype(db,name).id;
  const fetch = (db,id) => { const d=db.get('SELECT * FROM deals WHERE id=?', [id]); if(!d) throw E('not_found','Deal not found.'); return d; };
  const openDeal = d => { if (['closed','cancelled','refunded'].includes(d.status)) throw E('deal_closed','This deal must be reopened before changes.'); };
  const stamp = (date) => { if(!U.isIsoDate(date)) throw E('invalid_date','Choose a valid date.'); return date; };
  const accountBank = (db, id) => {
    const a=db.get('SELECT * FROM accounts WHERE id=?', [id]);
    if(!a || a.is_header || !a.is_active || a.type !== 'asset' || !['cash','bank'].includes(a.subtype) || (a.currency && a.currency!==base(db)))
      throw E('bank_account','Choose an active IDR bank or cash account.');
    return a.id;
  };

  function save(db, input) {
    return inTransaction(db, () => {
      const fields = ['project','cluster','block','unit_no','unit_type','land_area','building_area','certificate_type','property_address','notes'];
      const obj={}; fields.forEach(k => { if(input[k]!==undefined) obj[k]=String(input[k] || '').trim() || null; });
      if (input.deal_date!==undefined) obj.deal_date=stamp(input.deal_date);
      if(input.scheme!==undefined) { if(!['agency','resale','mixed'].includes(input.scheme)) throw E('bad_scheme','Invalid property scheme.'); obj.scheme=input.scheme; }
      ['buyer_id','developer_id','bank_id','sales_rep_id'].forEach(k=>{ if(input[k]!==undefined) obj[k]=asId(input[k]); });
      ['price','booking_fee','dp','kpr_amount'].forEach(k=>{ if(input[k]!==undefined) obj[k]=amount(input[k],k); });
      for(const [k,table] of [['buyer_id','contacts'],['developer_id','contacts'],['bank_id','contacts'],['sales_rep_id','sales_reps']])
        if(!validId(db,table,obj[k])) throw E('bad_contact','Unknown '+k+'.');
      if(input.id) {
        const old=fetch(db,input.id); openDeal(old);
        if(db.scalar('SELECT 1 FROM deal_fund_movements WHERE deal_id=?', [old.id]) &&
          ((obj.buyer_id!==undefined && obj.buyer_id!==old.buyer_id) || (obj.developer_id!==undefined && obj.developer_id!==old.developer_id)))
          throw E('financial_parties_locked','Buyer and developer cannot be changed after titipan movements exist.');
        db.update('deals',old.id,{...obj,updated_at:now()});
        B.posting.audit(db,'update','deals',old.id,'Edited property deal');
        return old.id;
      }
      if(!obj.project || !obj.deal_date) throw E('required','Project and deal date are required.');
      const number=B.numbering.take(db,'deal',obj.deal_date,{},n=>!!db.scalar('SELECT 1 FROM deals WHERE number=?',[n]));
      const id=db.insert('deals', {...obj,number,scheme:obj.scheme || 'agency',status:'prospect',created_at:now(),updated_at:now()});
      B.posting.audit(db,'create','deals',id,number);
      return id;
    });
  }
  function list(db,filters={}) {
    let sql=`SELECT d.*,b.name buyer_name,dev.name developer_name,rep.name rep_name,
      (SELECT coalesce(sum(CASE kind WHEN 'receipt' THEN amount ELSE -amount END),0) FROM deal_fund_movements f WHERE f.deal_id=d.id) +
      (SELECT coalesce(sum(jl.credit_base-jl.debit_base),0) FROM deal_ledger_links z JOIN journal_lines jl ON jl.id=z.journal_line_id JOIN journal_entries e ON e.id=jl.entry_id WHERE z.deal_id=d.id AND e.status='posted') AS titipan,
      (SELECT coalesce(sum(amount),0) FROM deal_commissions c WHERE c.deal_id=d.id) AS expected_commission
      FROM deals d LEFT JOIN contacts b ON b.id=d.buyer_id LEFT JOIN contacts dev ON dev.id=d.developer_id LEFT JOIN sales_reps rep ON rep.id=d.sales_rep_id`;
    const params=[];
    if(filters.status){sql+=' WHERE d.status=?'; params.push(filters.status);}
    return db.all(sql+' ORDER BY d.deal_date DESC,d.id DESC',params);
  }
  function detail(db,id) {
    const d=fetch(db,id);
    return {...d,parties:db.all('SELECT p.*,c.name contact_name FROM deal_parties p JOIN contacts c ON c.id=p.contact_id WHERE p.deal_id=?',[id]),
      milestones:db.all('SELECT * FROM deal_milestones WHERE deal_id=? ORDER BY id',[id]),
      commissions:db.all('SELECT c.*,p.name payer_name,d.number invoice_number,d.status invoice_status,d.amount_paid invoice_paid,d.total invoice_total FROM deal_commissions c JOIN contacts p ON p.id=c.payer_id LEFT JOIN documents d ON d.id=c.invoice_id WHERE c.deal_id=? ORDER BY c.id',[id]),
      funds:db.all('SELECT f.*,e.number journal_number FROM deal_fund_movements f JOIN journal_entries e ON e.id=f.journal_entry_id WHERE f.deal_id=? ORDER BY f.date,f.id',[id]),
      shares:db.all('SELECT s.*,c.name contact_name FROM deal_shares s JOIN contacts c ON c.id=s.contact_id WHERE s.deal_id=?',[id]),
      titipan:balance(db,id)};
  }
  function party(db,dealId,contactId,role,notes) {
    return inTransaction(db,()=>{
      openDeal(fetch(db,dealId));
      if(!['buyer','developer','bank','partner','co_broker','other'].includes(role)) throw E('role','Invalid party role.');
      if(!validId(db,'contacts',contactId) || !contactId) throw E('bad_contact','Choose an existing contact.');
      db.run('INSERT OR IGNORE INTO deal_parties(deal_id,contact_id,role,notes) VALUES(?,?,?,?)',[dealId,contactId,role,notes||null]);
    });
  }
  const statusFor = {booking:'booked',dp:'dp_paid',sp3k:'kpr_approved',akad:'akad',pencairan:'disbursed',handover:'handed_over'};
  const statusRank=['prospect','booked','dp_paid','kpr_approved','akad','disbursed','handed_over'];
  function milestone(db,dealId,input) {
    return inTransaction(db,()=>{
      const d=fetch(db,dealId);openDeal(d);
      if(!['booking','dp','sp3k','akad','pencairan','handover','ajb','confirmation'].includes(input.kind)) throw E('bad_kind','Invalid milestone.');
      if(input.actual_date) stamp(input.actual_date);
      if(input.planned_date) stamp(input.planned_date);
      const a=amount(input.amount||0,'milestone amount');
      const old=db.get('SELECT * FROM deal_milestones WHERE deal_id=? AND kind=?',[dealId,input.kind]);
      if(old && old.actual_date && db.scalar(`SELECT 1 FROM deal_commissions WHERE deal_id=? AND trigger_kind=? AND invoice_id IS NOT NULL`,[dealId,input.kind])
        && (old.actual_date!==input.actual_date)) throw E('milestone_locked','The earning milestone is locked after an invoice was generated.');
      const data={deal_id:dealId,kind:input.kind,actual_date:input.actual_date||null,planned_date:input.planned_date||null,
        amount:a,through_us:input.through_us?1:0,reference:input.reference||null,notes:input.notes||null};
      if(old) db.update('deal_milestones',old.id,data); else db.insert('deal_milestones',data);
      if(input.actual_date && statusFor[input.kind] && statusRank.indexOf(statusFor[input.kind])>statusRank.indexOf(d.status))
        db.run('UPDATE deals SET status=?,updated_at=? WHERE id=?',[statusFor[input.kind],now(),dealId]);
      B.posting.audit(db,'milestone','deals',dealId,input.kind+' '+(input.actual_date||'planned'));
    });
  }
  function addCommission(db,dealId,input) {
    return inTransaction(db,()=>{
      const d=fetch(db,dealId);openDeal(d);
      if(d.scheme==='resale') throw E('bad_scheme','Commissions apply to agency deals. Units you own are sold from Property Inventory.');
      const payer=asId(input.payer_id);
      if(!payer || !validId(db,'contacts',payer)) throw E('bad_contact','Choose commission payer.');
      if(!['developer','bank','buyer'].includes(input.payer_role)) throw E('bad_payer','Choose payer type.');
      if(!['akad','pencairan','confirmation'].includes(input.trigger_kind)) throw E('bad_trigger','Choose commission recognition milestone.');
      const basis=input.basis||'fixed'; let a;
      if(basis==='percent') {
        const rate=Number(input.rate);if(!Number.isFinite(rate)||rate<=0||rate>100) throw E('bad_rate','Commission percentage must be 0–100.');
        a=Number(B.money.divRound(BigInt(d.price)*BigInt(Math.round(rate*10000)),1000000n));
      } else if(basis==='fixed') a=positive(input.amount,'commission');
      else throw E('bad_basis','Unsupported basis.');
      if(!a) throw E('invalid_amount','Commission is zero.');
      if(input.tax_id && !db.scalar('SELECT 1 FROM taxes WHERE id=? AND is_active=1',[input.tax_id])) throw E('bad_tax','Unknown tax code.');
      return db.insert('deal_commissions',{deal_id:dealId,payer_id:payer,payer_role:input.payer_role,basis,rate:basis==='percent'?String(input.rate):null,
        amount:a,trigger_kind:input.trigger_kind,tax_id:asId(input.tax_id),created_at:now(),updated_at:now()});
    });
  }
  function generateInvoice(db,commissionId,date) {
    return inTransaction(db,()=>{
      const c=db.get('SELECT * FROM deal_commissions WHERE id=?',[commissionId]);
      if(!c) throw E('not_found','Commission not found.');
      const d=fetch(db,c.deal_id);openDeal(d);
      if(c.invoice_id) throw E('duplicate_invoice','This commission already has an invoice.');
      const m=db.get('SELECT actual_date FROM deal_milestones WHERE deal_id=? AND kind=?',[d.id,c.trigger_kind]);
      if(!m || !m.actual_date) throw E('milestone_required','Record '+c.trigger_kind+' before billing commission.');
      date=stamp(date||m.actual_date);
      if(date<m.actual_date)throw E('invoice_before_milestone','Commission invoice must not predate the earning milestone.');
      const codes={developer:'KOM-DEV',bank:'KOM-BANK',buyer:'KOM-KONS'};
      const prod=db.get('SELECT id,income_account_id FROM products WHERE code=?',[codes[c.payer_role]]);
      const account=prod && prod.income_account_id || code(db,{developer:'4-2100',bank:'4-2200',buyer:'4-2300'}[c.payer_role]);
      const id=B.docs.save(db,'invoice',{
        date,deal_id:d.id,contact_id:c.payer_id,reference:d.number,subject:'Commission '+d.number,
        currency:base(db),lines:[{product_id:prod?prod.id:null,item_label:'Commission '+d.number,description:d.project+' / '+(d.unit_no||'-'),
          quantity:1000,unit_price:c.amount,tax_id:c.tax_id,account_id:account}],
      });
      db.run("UPDATE deal_commissions SET invoice_id=?,status='invoiced',updated_at=? WHERE id=?",[id,now(),commissionId]);
      return id;
    });
  }
  function validateCommissionInvoice(db,d) {
    if(d.doc_type!=='invoice')return;
    const c=db.get('SELECT * FROM deal_commissions WHERE invoice_id=?',[d.id]);
    if(!c)return;
    const d0=fetch(db,c.deal_id);
    if(d0.status==='closed' || d0.status==='cancelled')throw E('deal_closed','Reopen the deal before posting a commission invoice.');
    if(d.deal_id!==c.deal_id || d.contact_id!==c.payer_id || d.currency!==base(db) ||
       d.lines.length!==1 || d.lines[0].line_net!==c.amount || (d.lines[0].tax_id||null)!==(c.tax_id||null))
      throw E('commission_invoice_mismatch','Commission invoice payer, amount, PPN or deal reference does not match the agreement.');
  }
  function balance(db,dealId) {
    const transactions=db.scalar(`SELECT coalesce(sum(CASE WHEN kind='receipt' THEN amount ELSE -amount END),0)
      FROM deal_fund_movements WHERE deal_id=?`,[dealId])||0;
    const linked=db.scalar(`SELECT coalesce(sum(jl.credit_base-jl.debit_base),0) FROM deal_ledger_links l
      JOIN journal_lines jl ON jl.id=l.journal_line_id JOIN journal_entries e ON e.id=jl.entry_id
      WHERE l.deal_id=? AND e.status='posted'`,[dealId])||0;
    return transactions+linked;
  }
  function moveFund(db,input) {
    return inTransaction(db,()=>{
      const deal=fetch(db,input.deal_id); openDeal(deal);
      if(!['receipt','remit','refund'].includes(input.kind)) throw E('bad_kind','Use receipt, remit or refund.');
      const a=positive(input.amount,'titipan amount'),date=stamp(input.date);
      const bank=accountBank(db,input.bank_account_id);
      if(input.kind!=='receipt' && balance(db,deal.id)<a) throw E('insufficient_titipan','Insufficient customer funds held for this deal.');
      const liability=subtype(db,'customer_funds_held');
      let importId=null;
      if(input.bank_import_line_id) {
        const line=db.get('SELECT * FROM bank_import_lines WHERE id=?',[input.bank_import_line_id]);
        if(!line || line.status!=='new' || line.account_id!==bank || line.date!==date || line.amount!==(input.kind==='receipt'?a:-a))
          throw E('bank_import_mismatch','Bank statement item must be new and match date, bank, direction and amount.');
        importId=line.id;
      }
      const incoming=input.kind==='receipt';
      const lines=incoming?[{account_id:bank,debit:a},{account_id:liability,credit:a}]:
        [{account_id:liability,debit:a},{account_id:bank,credit:a}];
      const journal=B.posting.post(db,{date,currency:base(db),deal_id:deal.id,source_type:'deal_fund',
        reference:input.reference||deal.number,memo:input.kind.toUpperCase()+' customer funds held · '+deal.number,lines});
      const fid=db.insert('deal_fund_movements',{deal_id:deal.id,kind:input.kind,date,amount:a,
        contact_id:asId(input.contact_id)|| (incoming?deal.buyer_id:deal.developer_id), bank_account_id:bank,
        reference:input.reference||null,memo:input.memo||null,journal_entry_id:journal.id,bank_import_line_id:importId,created_at:now()});
      db.run('UPDATE journal_entries SET source_id=? WHERE id=?',[fid,journal.id]);
      if(importId) db.run("UPDATE bank_import_lines SET status='created',journal_entry_id=? WHERE id=?",[journal.id,importId]);
      B.posting.audit(db,'fund_'+input.kind,'deals',deal.id,journal.number);
      return {id:fid,journal_id:journal.id,number:journal.number,balance:balance(db,deal.id)};
    });
  }
  function offset(db,input) {
    return inTransaction(db,()=>{
      const d=fetch(db,input.deal_id); openDeal(d);
      const inv=db.get('SELECT * FROM documents WHERE id=?',[input.invoice_id]);
      if(!inv || inv.deal_id!==d.id || inv.doc_type!=='invoice' || !['open','partial'].includes(inv.status))
        throw E('invoice_required','Choose an open commission invoice for this deal.');
      if(inv.currency!==base(db)) throw E('currency_mismatch','Only IDR commission invoices support titipan offsets.');
      const gross=positive(input.amount,'offset amount'), withholding=amount(input.withholding||0,'withholding');
      const used=gross-withholding;
      if(used<=0 || gross>B.docs.balance(inv)) throw E('over_offset','Offset exceeds the open invoice balance.');
      if(used>balance(db,d.id)) throw E('insufficient_titipan','Not enough titipan to offset the commission.');
      if(withholding) {
        const tax=db.get("SELECT * FROM taxes WHERE kind='pph23' AND direction='withheld_by_customer' AND is_active=1 AND account_id IS NOT NULL ORDER BY id LIMIT 1");
        if(!tax) throw E('tax_no_account','Configure customer PPh 23 withholding before using offsets.');
      }
      const cleared=B.docs.clearBase(inv,gross);
      const lines=[{account_id:subtype(db,'customer_funds_held'),debit:used}];
      if(withholding) {
        const t=db.get("SELECT * FROM taxes WHERE kind='pph23' AND direction='withheld_by_customer' AND is_active=1 ORDER BY id LIMIT 1");
        lines.push({account_id:t.account_id,debit:withholding});
      }
      lines.push({account_id:B.docs.controlAccount(db,'ar',inv.currency).id,credit:gross,contact_id:inv.contact_id});
      const date=stamp(input.date);
      const journal=B.posting.post(db,{date,currency:base(db),deal_id:d.id,source_type:'deal_offset',source_id:inv.id,
        memo:'Titipan offset '+d.number+' / '+inv.number,lines});
      const movementId=db.insert('deal_fund_movements',{deal_id:d.id,kind:'offset',date,amount:used,
        contact_id:inv.contact_id,reference:inv.number,memo:input.memo||null,journal_entry_id:journal.id,created_at:now()});
      db.insert('deal_settlement_allocations',{deal_id:d.id,movement_id:movementId,invoice_id:inv.id,amount:gross,withholding,ar_base:cleared,created_at:now()});
      db.run('UPDATE documents SET base_cleared=base_cleared+? WHERE id=?',[cleared,inv.id]);
      B.docs.refreshPaid(db,inv.id);
      B.posting.audit(db,'offset','deals',d.id,inv.number+' '+gross);
      return {id:movementId,journal_id:journal.id,balance:balance(db,d.id)};
    });
  }
  function addShare(db,dealId,input) {
    return inTransaction(db,()=>{
      const d=fetch(db,dealId);openDeal(d);
      if(!input.contact_id || !validId(db,'contacts',input.contact_id)) throw E('bad_contact','Choose a partner.');
      const treatment=input.treatment||'principal';if(!['principal','agent'].includes(treatment))throw E('bad_treatment','Unsupported share treatment.');
      // 3.1 safely accrues principal share. Agent net-revenue recognition requires confirmed contracts.
      const a=positive(input.amount,'partner share');
      return db.insert('deal_shares',{deal_id:dealId,contact_id:asId(input.contact_id),treatment,amount:a,
        percentage:input.percentage||null,status:'agreed',reference:input.reference||null,created_at:now(),updated_at:now()});
    });
  }
  function accrueShare(db,id,date) {
    return inTransaction(db,()=>{
      const s=db.get('SELECT * FROM deal_shares WHERE id=?',[id]);
      if(!s || s.status!=='agreed') throw E('bad_status','Share is already accrued or missing.');
      const d=fetch(db,s.deal_id);openDeal(d);
      if(s.treatment==='agent') throw E('agent_treatment_pending','Agency-share accounting requires a verified contractual net-revenue treatment; do not post as an expense.');
      const journal=B.posting.post(db,{date:stamp(date),currency:base(db),deal_id:d.id,source_type:'deal_partner',source_id:id,
        memo:'Partner share '+d.number,
        lines:[{account_id:code(db,'5-4000'),debit:s.amount},{account_id:subtype(db,'partner_payable'),credit:s.amount}]});
      db.run("UPDATE deal_shares SET status='accrued',journal_entry_id=?,updated_at=? WHERE id=?",[journal.id,now(),id]);
      return journal;
    });
  }
  function payoutShare(db,id,date,bankId) {
    return inTransaction(db,()=>{
      const s=db.get('SELECT * FROM deal_shares WHERE id=?',[id]);
      if(!s || s.status!=='accrued') throw E('bad_status','Accrue the partner liability first.');
      const bank=accountBank(db,bankId);
      const journal=B.posting.post(db,{date:stamp(date),currency:base(db),deal_id:s.deal_id,source_type:'deal_partner_payment',source_id:id,
        memo:'Payout partner share #'+id,lines:[{account_id:subtype(db,'partner_payable'),debit:s.amount},{account_id:bank,credit:s.amount}]});
      db.run("UPDATE deal_shares SET status='paid',payout_entry_id=?,updated_at=? WHERE id=?",[journal.id,now(),id]);
      return journal;
    });
  }
  function close(db,id) {
    return inTransaction(db,()=>{
      const d=fetch(db,id);if(d.status==='closed') throw E('bad_status','Deal is already closed.');
      if(balance(db,id)!==0)throw E('titipan_outstanding','Settle customer funds held before closing.');
      if(db.scalar("SELECT count(*) FROM deal_commissions WHERE deal_id=? AND invoice_id IS NULL",[id])) throw E('commission_pending','Commission agreements must be invoiced or explicitly resolved.');
      if(db.scalar("SELECT count(*) FROM deal_shares WHERE deal_id=? AND status='agreed'",[id])) throw E('partner_pending','Resolve unaccrued partner agreements before closing.');
      if(db.scalar("SELECT count(*) FROM deal_commissions c JOIN documents doc ON doc.id=c.invoice_id WHERE c.deal_id=? AND doc.status IN ('draft','void')",[id]))
        throw E('commission_pending','Approve linked commission invoices before closing.');
      if(db.scalar("SELECT count(*) FROM deal_commissions c JOIN documents doc ON doc.id=c.invoice_id WHERE c.deal_id=? AND doc.status IN ('open','partial')",[id]))
        throw E('commission_unpaid','A commission invoice for this deal is not fully paid. Collect it, or settle the difference with a credit note, before closing.');
      if(db.scalar("SELECT count(*) FROM deal_shares WHERE deal_id=? AND status='accrued'",[id]))
        throw E('partner_unpaid','Pay the accrued partner shares before closing.');
      db.run("UPDATE deals SET status='closed',updated_at=? WHERE id=?",[now(),id]);
      B.posting.audit(db,'close','deals',id,d.number);
    });
  }
  function cancelDeal(db,id,reason) {
    return inTransaction(db,()=>{
      const d=fetch(db,id);openDeal(d);
      if(balance(db,id)!==0)throw E('titipan_outstanding','Refund or remit all customer funds before cancelling.');
      if(db.scalar('SELECT count(*) FROM deal_commissions WHERE deal_id=? AND invoice_id IS NOT NULL',[id]))
        throw E('linked_commission','Commission invoices exist. Settle or correct them before cancelling.');
      db.run("UPDATE deals SET status='cancelled',notes=?,updated_at=? WHERE id=?",
        [(d.notes||'')+(reason?'\nCancellation: '+reason:''),now(),id]);
      B.posting.audit(db,'cancel','deals',id,reason||d.number);
    });
  }
  function reopen(db,id) {
    return inTransaction(db,()=>{
      const d=fetch(db,id);if(d.status!=='closed')throw E('bad_status','Only closed deals can reopen.');
      db.run("UPDATE deals SET status='handed_over',updated_at=? WHERE id=?",[now(),id]);
      B.posting.audit(db,'reopen','deals',id,d.number);
    });
  }
  function legacyUnassigned(db) {
    return db.all(`SELECT l.id line_id,l.debit_base,l.credit_base,e.number,e.date,e.memo
      FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
      LEFT JOIN deal_ledger_links z ON z.journal_line_id=l.id
      WHERE e.status='posted' AND e.deal_id IS NULL AND a.subtype='customer_funds_held' AND z.id IS NULL
      ORDER BY e.date,e.id,l.id`);
  }
  function linkLegacy(db,dealId,lineId,notes) {
    return inTransaction(db,()=>{
      const d=fetch(db,dealId);openDeal(d);
      const line=legacyUnassigned(db).find(l=>l.line_id===Number(lineId));
      if(!line)throw E('legacy_link_unavailable','Choose a posted, unassigned customer-funds ledger line.');
      if(balance(db,dealId)+line.credit_base-line.debit_base<0)
        throw E('insufficient_titipan','Cannot link a withdrawal that makes the deal funds balance negative. Link receipts first.');
      const lid=db.insert('deal_ledger_links',{deal_id:dealId,journal_line_id:line.line_id,notes:notes||null,created_at:now()});
      B.posting.audit(db,'link_legacy_titipan','deals',dealId,line.number);
      return lid;
    });
  }
  function receipt(db, movementId) {
    const f=db.get(`SELECT m.*,d.number deal_number,d.project,d.unit_no,d.developer_id,
      c.name from_name,bank.name bank_name FROM deal_fund_movements m
      JOIN deals d ON d.id=m.deal_id LEFT JOIN contacts c ON c.id=m.contact_id
      LEFT JOIN accounts bank ON bank.id=m.bank_account_id WHERE m.id=?`,[movementId]);
    if(!f||f.kind!=='receipt')throw E('bad_receipt','Receipt is available only for money received.');
    const settings=B.templates.templateFor(db,'receipt',null,f.contact_id).settings;
    const invSample=B.templates.sampleModel(db,'invoice',settings);
    const developer=db.scalar('SELECT name FROM contacts WHERE id=?',[f.developer_id])||'developer';
    const model={kind:'receipt',lang:B.i18n.lang,company:invSample.company,
      number:'TIT-'+f.deal_number+'-'+f.id,date:B.templates.fmtDate(f.date,settings.dateFormat,B.i18n.lang),
      from:f.from_name||'Buyer',amount:B.money.format(f.amount,0,{code:'IDR'}),
      words:B.terbilang.words(f.amount,'IDR',0,B.i18n.lang),
      forWhat:'Titipan booking / DP '+f.project+' '+(f.unit_no||'')+' — diterima atas nama '+developer,
      withholding:'',received:B.money.format(f.amount,0,{code:'IDR'}),account:f.bank_name||'IDR bank',
      signatory:settings.signatoryName||'',signDate:B.templates.fmtDate(f.date,settings.dateFormat,B.i18n.lang),
      voided:false,vars:{company:invSample.company.name,customer:f.from_name,number:f.deal_number},
      blocks:settings.blocks.receipt,banks:[],party:{}};
    return B.templates.renderReceipt(model,settings);
  }
  function fundReport(db) { return list(db).filter(d=>d.titipan!==0); }
  function commissionReport(db) {return db.all(`SELECT c.*,d.number deal_number,d.project,p.name payer_name,
    i.number invoice_number,i.total invoice_total,i.amount_paid,i.status invoice_status
    FROM deal_commissions c JOIN deals d ON d.id=c.deal_id JOIN contacts p ON p.id=c.payer_id
    LEFT JOIN documents i ON i.id=c.invoice_id ORDER BY d.deal_date DESC,c.id`);}
  function trial(db) {
    const movementTotal=db.scalar("SELECT coalesce(sum(CASE WHEN kind='receipt' THEN amount ELSE -amount END),0) FROM deal_fund_movements")||0;
    const legacyTotal=db.scalar(`SELECT coalesce(sum(l.credit_base-l.debit_base),0) FROM deal_ledger_links z
      JOIN journal_lines l ON l.id=z.journal_line_id JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted'`)||0;
    const allocated=movementTotal+legacyTotal;
    const liability=subtype(db,'customer_funds_held');
    const actual=db.scalar(`SELECT coalesce(sum(l.credit_base-l.debit_base),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
       WHERE e.status='posted' AND l.account_id=?`,[liability])||0;
    return {allocated,ledger:actual,unassigned:actual-allocated};
  }
  B.deals={save,list,detail,party,milestone,addCommission,generateInvoice,balance,moveFund,offset,addShare,accrueShare,payoutShare,close,reopen,cancelDeal,fundReport,commissionReport,trial,legacyUnassigned,linkLegacy,receipt,validateCommissionInvoice};
})();
