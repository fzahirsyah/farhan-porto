/* Buku 3.3 — durable quotations, conversion to SO, reconciled operational dashboard. */
(function(){'use strict';const B=window.Buku,E=(c,m)=>new B.BukuError(c,m),now=()=>B.util.nowIso();
  function createQuote(db,x){return db.tx(()=>{
    if(!B.util.isIsoDate(x.date)||!B.util.isIsoDate(x.valid_until)||x.valid_until<x.date)throw E('date','Valid-until must not precede quotation date');
    if(!db.scalar('SELECT 1 FROM contacts WHERE id=?',[x.contact_id]))throw E('customer','Select a customer');
    const lines=(x.lines||[]).map((l,i)=>({description:String(l.description||'').trim(),amount:Number(l.amount),tax_id:l.tax_id||null,account_id:l.account_id||null,line_no:i+1}));
    if(!lines.length||lines.some(l=>!l.description||!Number.isSafeInteger(l.amount)||l.amount<=0))throw E('lines','Add positive quotation items');
    let total=B.docs.compute(db,{discount_type:'none'},lines.map(l=>({quantity:1000,unit_price:l.amount,tax_id:l.tax_id}))).total;
    if(!Number.isSafeInteger(total))throw E('total','Amount too large');
    const id=db.insert('quotations',{number:'PENDING-'+B.util.uuid(),contact_id:Number(x.contact_id),deal_id:x.deal_id||null,
      date:x.date,valid_until:x.valid_until,currency:'IDR',note:x.note||null,total,created_at:now(),updated_at:now()});
    db.run('UPDATE quotations SET number=? WHERE id=?',['Q-'+x.date.slice(0,4)+'-'+String(id).padStart(5,'0'),id]);
    lines.forEach(l=>db.insert('quotation_lines',{...l,quotation_id:id}));return id;
  });}
  function status(db,id,status){return db.tx(()=>{const q=db.get('SELECT * FROM quotations WHERE id=?',[id]);if(!q||q.sales_order_id)throw E('quote','Quotation is already converted or missing');
    if(!['draft','sent'].includes(q.status))throw E('status','Quotation cannot be changed now');
    if(!['sent','rejected'].includes(status))throw E('status','Use sent or rejected');
    db.update('quotations',id,{status,updated_at:now()});return id;
  });}
  function accept(db,id,date){return db.tx(()=>{const q=db.get('SELECT * FROM quotations WHERE id=?',[id]);if(!q||!['sent','draft'].includes(q.status)||q.sales_order_id)throw E('quote','Cannot convert this quotation');
    date=date||B.util.today();if(!B.util.isIsoDate(date)||date>q.valid_until)throw E('expired','Quotation expired — issue a new quotation');
    const ls=db.all('SELECT * FROM quotation_lines WHERE quotation_id=? ORDER BY line_no',[id]);
    const so=B.docs.save(db,'sales_order',{date,valid_until:q.valid_until,contact_id:q.contact_id,deal_id:q.deal_id,currency:'IDR',reference:q.number,note:q.note,
      subject:'Quotation '+q.number,lines:ls.map(l=>({description:l.description,quantity:1000,unit_price:l.amount,tax_id:l.tax_id,account_id:l.account_id}))});
    B.docs.confirm(db,so);db.update('quotations',id,{status:'accepted',accepted_at:now(),sales_order_id:so,updated_at:now()});
    B.posting.audit(db,'convert','quotations',id,'SO '+so);return so;});}
  function dashboard(db,asOf){asOf=asOf||B.util.today();if(!B.util.isIsoDate(asOf))throw E('date','Invalid dashboard date');
    const sum=(subtype)=>db.scalar(`SELECT coalesce(sum(CASE WHEN a.type IN ('asset','expense') THEN l.debit_base-l.credit_base ELSE l.credit_base-l.debit_base END),0)
      FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
      WHERE e.status='posted' AND e.date<=? AND a.subtype=?`,[asOf,subtype])||0;
    const deals=db.scalar("SELECT count(*) FROM deals WHERE deal_date<=? AND status NOT IN ('closed','cancelled','refunded')",[asOf])||0;
    const expected=db.scalar(`SELECT coalesce(sum(c.amount),0) FROM deal_commissions c JOIN deals d ON d.id=c.deal_id WHERE d.deal_date<=? AND d.status NOT IN ('cancelled','refunded')`,[asOf])||0;
    const inventory=db.scalar("SELECT coalesce(sum(cost),0) FROM property_units WHERE status IN ('owned','reserved')")||0;
    const resale=db.get(`SELECT coalesce(sum(s.price),0) revenue,coalesce(sum(u.cost),0) cogs FROM property_sales s JOIN property_units u ON u.id=s.unit_id WHERE s.sale_date<=?`,[asOf]);
    const overdue=db.scalar(`SELECT coalesce(sum(l.amount-l.paid),0) FROM instalment_lines l JOIN instalment_plans p ON p.id=l.plan_id
      WHERE l.due_date<? AND p.status='active'`,[asOf])||0;
    return {asOf,bank:sum('bank')+sum('cash'),ar:sum('ar'),ap:sum('ap'),deferred:sum('deferred_revenue'),titipan:sum('customer_funds_held'),
      deals,expected,inventory,resale_revenue:resale.revenue,resale_cogs:resale.cogs,resale_margin:resale.revenue-resale.cogs,
      overdue_instalments:overdue,commission_collected:db.scalar(`SELECT coalesce(sum(a.amount),0) FROM payment_allocations a
      JOIN documents d ON d.id=a.document_id WHERE d.deal_id IS NOT NULL AND d.doc_type='invoice'`)||0};}
  function commissionRule(db,rep,basis,percent){return db.tx(()=>{if(!db.scalar('SELECT 1 FROM sales_reps WHERE id=?',[rep]))throw E('rep','Select an existing sales representative');
    if(!['commission_collected','resale_margin'].includes(basis))throw E('basis','Invalid commission basis');
    const pct=String(percent||'').replace(',','.');if(!/^(?:[0-9]{1,2}(?:\.[0-9]{1,4})?|100(?:\.0{1,4})?)$/.test(pct)||Number(pct)<=0)
      throw E('percent','Choose a percentage above zero, up to 100');
    db.run('UPDATE sales_commission_rules SET is_active=0 WHERE sales_rep_id=? AND basis=?',[rep,basis]);
    return db.insert('sales_commission_rules',{sales_rep_id:Number(rep),basis,percent:pct,is_active:1,created_at:now()});});}
  function commissionReport(db){return db.all(`SELECT r.*,s.name rep_name FROM sales_commission_rules r JOIN sales_reps s ON s.id=r.sales_rep_id
    WHERE r.is_active=1 ORDER BY s.name,r.basis`).map(r=>{
      if(r.basis==='commission_collected'){
        const items=db.all(`SELECT c.amount,d.total,d.amount_paid FROM deal_commissions c
          JOIN deals x ON x.id=c.deal_id JOIN documents d ON d.id=c.invoice_id WHERE x.sales_rep_id=? AND d.status IN ('open','partial','paid')`,[r.sales_rep_id]);
        r.eligible=items.reduce((sum,x)=>sum+(x.total?Number(BigInt(x.amount)*BigInt(x.amount_paid)/BigInt(x.total)):0),0);
      }else{
        const v=db.get(`SELECT coalesce(sum(s.price-u.cost),0) amount FROM property_sales s JOIN property_units u ON u.id=s.unit_id WHERE u.sales_rep_id=?`,[r.sales_rep_id]);
        r.eligible=v.amount;
      }
      r.commission=B.money.percentOf(Math.max(0,r.eligible),r.percent);return r;
    });}
  B.commercial={createQuote,status,accept,dashboard,commissionRule,commissionReport};
})();
