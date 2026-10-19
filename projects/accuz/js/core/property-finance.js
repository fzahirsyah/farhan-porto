/* Buku 3.2: owned-property accounting. Amounts are whole IDR, never silent GL edits. */
(function(){
  'use strict';
  const B=window.Buku, E=(c,m)=>new B.BukuError(c,m),now=()=>B.util.nowIso();
  const pos=(v,name)=>{v=Number(v);if(!Number.isSafeInteger(v)||v<=0)throw E('amount','Invalid '+name);return v;};
  const date=v=>{if(!B.util.isIsoDate(v))throw E('date','Invalid transaction date');return v;};
  const ac=(db,c)=>{const a=db.get('SELECT * FROM accounts WHERE code=? AND is_header=0 AND is_active=1',[c]);if(!a)throw E('account','Missing active account '+c);return a.id;};
  const bank=(db,id)=>{const a=db.get('SELECT * FROM accounts WHERE id=?',[id]);if(!a||!['bank','cash'].includes(a.subtype)||(a.currency&&a.currency!=='IDR'))throw E('bank','Select an IDR bank/cash account');return a.id;};
  const unit=(db,id)=>{const x=db.get('SELECT * FROM property_units WHERE id=?',[id]);if(!x)throw E('unit','Unit not found');return x;};
  function addUnit(db,x){return db.tx(()=>{if(!String(x.code||'').trim()||!String(x.project||'').trim())throw E('required','Unit code and project are required');
    const id=db.insert('property_units',{code:String(x.code).trim(),project:String(x.project).trim(),address:x.address||null,
      deal_id:x.deal_id||null,seller_id:x.seller_id||null,sales_rep_id:x.sales_rep_id||null,status:'planned',notes:x.notes||null,created_at:now(),updated_at:now()});
    B.posting.audit(db,'create','property_units',id,x.code);return id;});}
  function capitalize(db,x){return db.tx(()=>{const u=unit(db,x.unit_id);if(u.status==='sold')throw E('sold','Sold unit costs cannot be edited');
    if(!['acquisition','notary','tax','renovation','improvement','other_capitalized'].includes(x.kind))throw E('kind','Invalid capital cost');
    const a=pos(x.amount,'cost'),d=date(x.date),b=bank(db,x.bank_account_id);
    const j=B.posting.post(db,{date:d,currency:'IDR',source_type:'property_cost',reference:x.reference||u.code,
      memo:'Capitalized '+x.kind+' / '+u.code,lines:[{account_id:ac(db,'1-1600'),debit:a},{account_id:b,credit:a}]});
    const id=db.insert('property_unit_costs',{unit_id:u.id,date:d,kind:x.kind,amount:a,bank_account_id:b,journal_entry_id:j.id,reference:x.reference||null,created_at:now()});
    db.run("UPDATE property_units SET cost=cost+?,status='owned',acquired_at=coalesce(acquired_at,?),updated_at=? WHERE id=?",[a,d,now(),u.id]);
    B.posting.audit(db,'capitalize','property_units',u.id,String(a));return id;});}
  function sell(db,x){return db.tx(()=>{const u=unit(db,x.unit_id);if(u.status!=='owned'&&u.status!=='reserved')throw E('status','Only owned units can be sold');
    if(!u.cost)throw E('inventory','Unit has no capitalized acquisition cost');const p=pos(x.price,'sale price'),d=date(x.date);
    if(!db.scalar('SELECT 1 FROM contacts WHERE id=?',[x.buyer_id]))throw E('buyer','Choose a buyer');
    const inv=B.docs.save(db,'invoice',{date:d,contact_id:x.buyer_id,deal_id:u.deal_id,currency:'IDR',
      subject:'Property sale '+u.code,reference:x.reference||u.code,
      lines:[{item_label:'Property '+u.code,description:u.project+' '+(u.address||''),quantity:1000,unit_price:p,
        account_id:ac(db,'4-3000'),tax_id:x.tax_id||null}]});
    B.docs.approve(db,inv);
    const j=B.posting.post(db,{date:d,currency:'IDR',source_type:'property_hpp',source_id:u.id,reference:u.code,
      memo:'Cost of property sold '+u.code,lines:[{account_id:ac(db,'5-2000'),debit:u.cost},{account_id:ac(db,'1-1600'),credit:u.cost}]});
    const id=db.insert('property_sales',{unit_id:u.id,buyer_id:Number(x.buyer_id),sale_date:d,price:p,tax_id:x.tax_id||null,
      invoice_id:inv,hpp_journal_id:j.id,recognized_at:now()});
    db.run("UPDATE property_units SET status='sold',buyer_id=?,sold_at=?,updated_at=? WHERE id=?",[x.buyer_id,d,now(),u.id]);
    B.posting.audit(db,'property_sale','property_units',u.id,String(p));return {id,invoice_id:inv,hpp_journal_id:j.id,margin:p-u.cost};});}
  const months=(d,n)=>{const x=new Date(d+'T12:00:00Z'),day=x.getUTCDate();x.setUTCDate(1);x.setUTCMonth(x.getUTCMonth()+n);const last=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate();x.setUTCDate(Math.min(day,last));return x.toISOString().slice(0,10);};
  function plan(db,x){return db.tx(()=>{const s=db.get('SELECT * FROM property_sales WHERE id=?',[x.sale_id]);if(!s)throw E('sale','Sale not found');
    const inv=db.get('SELECT * FROM documents WHERE id=?',[s.invoice_id]);if(!inv||inv.status==='void')throw E('invoice','Sale invoice is not valid');
    const principal=pos(x.principal,'principal'),n=Number(x.months),d=date(x.start_date);
    if(!Number.isInteger(n)||n<1||n>360||principal>B.docs.balance(inv))throw E('plan','Invalid instalment schedule or amount exceeds outstanding invoice');
    const id=db.insert('instalment_plans',{sale_id:s.id,invoice_id:s.invoice_id,start_date:d,principal,months:n,created_at:now()});
    for(let i=0;i<n;i++)db.insert('instalment_lines',{plan_id:id,due_date:months(d,i),amount:Math.floor(principal/n)+(i<principal%n?1:0)});
    return id;});}
  function collect(db,x){return db.tx(()=>{const line=db.get('SELECT l.*,p.invoice_id FROM instalment_lines l JOIN instalment_plans p ON p.id=l.plan_id WHERE l.id=?',[x.line_id]);
    if(!line||line.paid===line.amount)throw E('instalment','Instalment already settled or missing');
    const a=pos(x.amount,'collection');if(a>line.amount-line.paid)throw E('overpay','Payment exceeds scheduled balance');
    const inv=db.get('SELECT * FROM documents WHERE id=?',[line.invoice_id]);if(a>B.docs.balance(inv))throw E('overpay','Payment exceeds outstanding invoice');
    const p=B.payments.post(db,{direction:'in',instalment_collection:true,contact_id:inv.contact_id,date:date(x.date),account_id:bank(db,x.bank_account_id),amount:a,
      reference:x.reference||'Instalment '+line.id,allocations:[{document_id:inv.id,amount:a}]});
    const pid=p.id||p.payment_id||p;db.insert('instalment_allocations',{line_id:line.id,payment_id:pid,amount:a,created_at:now()});
    db.run('UPDATE instalment_lines SET paid=paid+? WHERE id=?',[a,line.id]);
    db.run("UPDATE instalment_plans SET status='settled' WHERE id=? AND NOT EXISTS(SELECT 1 FROM instalment_lines WHERE plan_id=? AND paid<amount)",[line.plan_id,line.plan_id]);
    return pid;});}
  function kprDisbursement(db,x){return db.tx(()=>{const s=db.get('SELECT * FROM property_sales WHERE id=?',[x.sale_id]);if(!s)throw E('sale','Property sale not found');
    if(db.scalar("SELECT 1 FROM instalment_plans WHERE sale_id=? AND status='active'",[s.id]))throw E('instalment_active','Do not mix in-house instalment allocations and bank disbursements');
    const d=date(x.date),a=pos(x.amount,'bank disbursement'),invoice=db.get('SELECT * FROM documents WHERE id=?',[s.invoice_id]);
    if(!invoice||a>B.docs.balance(invoice))throw E('disbursement','Disbursement exceeds unpaid invoice');
    const p=B.payments.post(db,{direction:'in',contact_id:invoice.contact_id,date:d,account_id:bank(db,x.bank_account_id),
      amount:a,reference:x.reference||'KPR disbursement',allocations:[{document_id:invoice.id,amount:a}]});
    return db.insert('property_disbursements',{sale_id:s.id,date:d,amount:a,payment_id:p.id,reference:x.reference||null,created_at:now()});});}
  function recordPropertyTax(db,x){return db.tx(()=>{if(!db.scalar('SELECT 1 FROM property_sales WHERE id=?',[x.sale_id]))throw E('sale','Sale not found');
    if(!['pph_final','other_property_tax'].includes(x.tax_kind))throw E('tax','Invalid property tax classification');
    const amount=pos(x.amount,'tax'),d=date(x.date),b=bank(db,x.bank_account_id);
    const j=B.posting.post(db,{date:d,currency:'IDR',source_type:'property_tax',source_id:x.sale_id,
      memo:'Paid property tax '+x.tax_kind,reference:x.ntpn||'',lines:[{account_id:ac(db,'8-1000'),debit:amount},{account_id:b,credit:amount}]});
    return db.insert('property_tax_payments',{sale_id:x.sale_id,date:d,tax_kind:x.tax_kind,amount,bank_account_id:b,
      journal_entry_id:j.id,ntpn:x.ntpn||null,created_at:now()});});}
  function jvCreate(db,name,contactId){return db.tx(()=>db.insert('jv_investments',{name, counterparty_id:contactId||null,created_at:now()}));}
  function jvMove(db,x){return db.tx(()=>{const inv=db.get('SELECT * FROM jv_investments WHERE id=?',[x.investment_id]);if(!inv)throw E('jv','JV not found');
    if(!['contribution','capital_return','distribution'].includes(x.kind))throw E('jv','Invalid JV movement');
    const a=pos(x.amount,'JV amount'),b=bank(db,x.bank_account_id),d=date(x.date);
    const invested=db.scalar(`SELECT COALESCE(SUM(CASE WHEN kind='contribution' THEN amount WHEN kind='capital_return' THEN -amount ELSE 0 END),0) FROM jv_movements WHERE investment_id=?`,[inv.id]);
    if(x.kind==='capital_return'&&a>invested)throw E('jv_balance','Capital return exceeds investment book value');
    const asset=ac(db,'1-2200'),income=ac(db,'7-1100');const l=x.kind==='contribution'?[{account_id:asset,debit:a},{account_id:b,credit:a}]:
      [{account_id:b,debit:a},{account_id:x.kind==='capital_return'?asset:income,credit:a}];
    const j=B.posting.post(db,{date:d,currency:'IDR',source_type:'jv_'+x.kind,source_id:inv.id,reference:x.reference||inv.name,memo:inv.name,lines:l});
    return db.insert('jv_movements',{investment_id:inv.id,kind:x.kind,date:d,amount:a,bank_account_id:b,journal_entry_id:j.id,reference:x.reference||null,created_at:now()});});}
  function trial(db){const inventory=db.scalar("SELECT COALESCE(SUM(cost),0) FROM property_units WHERE status IN ('owned','reserved')");
    const gl=db.scalar("SELECT COALESCE(SUM(l.debit_base-l.credit_base),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id WHERE a.code='1-1600' AND e.status='posted'");
    return {inventory,gl,ok:inventory===gl};}
  B.property={addUnit,capitalize,sell,plan,collect,kprDisbursement,recordPropertyTax,jvCreate,jvMove,trial,unit,months};
})();
