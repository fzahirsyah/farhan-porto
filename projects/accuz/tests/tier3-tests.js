/* Buku release 2.1 / 3.1 additional accounting regression suite. Runs offline. */
(async function () {
  const B=window.Buku, results=[];
  function assert(name,check){results.push({name,pass:!!check});if(!check)throw Error('Check failed: '+name);}
  function error(name,fn,code){let caught='';try{fn();}catch(e){caught=e.code||e.message;}assert(name,caught===code);}
  function acc(db,code){return db.scalar('SELECT id FROM accounts WHERE code=?',[code]);}
  const db=await B.dbm.create();
  try {
    B.schema.migrate(db);
    B.seed.initCompany(db,{company:{name:'Test Buku Tier 3',fiscal_year_start_month:1},addresses:[{label:'HQ',address:'Jakarta',is_default:true}],reps:[{code:'PU',name:'Putri'}],coaTemplate:'saas_property',currencies:['IDR']});
    assert('schema migrated to version 8',Number(db.meta('schema_version'))===8);
    const now=B.util.nowIso();
    const buyer=db.insert('contacts',{name:'Buyer A',tags:'["customer"]',created_at:now,updated_at:now});
    const developer=db.insert('contacts',{name:'Developer A',tags:'["customer","developer"]',created_at:now,updated_at:now});
    const partner=db.insert('contacts',{name:'Co-broker A',tags:'["partner"]',created_at:now,updated_at:now});
    const bank=acc(db,'1-1200'),tax=db.scalar("SELECT id FROM taxes WHERE code='PPN11'"),saas=db.scalar("SELECT id FROM products WHERE code='SAAS-BI'");
    // Subscription payment gate and daily allocation
    const inv=B.docs.save(db,'invoice',{contact_id:buyer,date:'2026-10-01',currency:'IDR',lines:[{product_id:saas,quantity:6000,unit_price:2000000,tax_id:tax}]});
    B.docs.approve(db,inv);
    const sub=db.get('SELECT * FROM subscriptions WHERE invoice_id=?',[inv]);
    error('unpaid subscription cannot start',()=>B.subscriptions.handover(db,sub.id,'2026-11-15','BAST'), 'payment_required');
    const total=db.scalar('SELECT total FROM documents WHERE id=?',[inv]);
    B.payments.post(db,{direction:'in',date:'2026-10-05',contact_id:buyer,account_id:bank,amount:total,allocations:[{document_id:inv,amount:total}]});
    B.subscriptions.handover(db,sub.id,'2026-11-15','BAST','daily');
    const sched=db.all('SELECT * FROM revenue_schedules WHERE subscription_id=? ORDER BY period',[sub.id]);
    assert('daily proration crosses seven months',sched.length===7);
    assert('daily allocations sum exactly to invoiced amount',sched.reduce((a,r)=>a+r.amount,0)===12000000);
    B.subscriptions.recognize(db,'2026-12');
    const deferredBefore=B.subscriptions.expectedDeferred(db);
    const out=B.subscriptions.cancel(db,sub.id,'refund','Stopped','2027-01-10');
    assert('refund generates an exact linked credit note',!!out.credit_note_id && out.amount>0);
    assert('draft credit retains remaining schedules',db.scalar('SELECT count(*) FROM revenue_schedules WHERE subscription_id=? AND recognized=0',[sub.id])>0);
    assert('draft credit keeps deferred schedule intact',B.subscriptions.expectedDeferred(db)===deferredBefore);
    const refund=B.docs.load(db,out.credit_note_id);
    assert('refund net matches unused service',refund.lines[0].line_net===out.amount);
    B.docs.approve(db,out.credit_note_id);
    assert('approved credit releases deferred schedules',db.scalar('SELECT count(*) FROM revenue_schedules WHERE subscription_id=? AND recognized=0',[sub.id])===0);
    assert('cancellation marked credited',db.scalar('SELECT status FROM subscription_cancellations WHERE subscription_id=?',[sub.id])==='credited');
    error('cancellation credit cannot be silently voided',()=>B.docs.unpost(db,out.credit_note_id,'void'),'cancellation_credit_locked');
    // PPN lock: use 2026-10 after tax close
    B.taxops.closePPN(db,'2026-10');
    const bad=B.docs.save(db,'invoice',{contact_id:buyer,date:'2026-10-20',currency:'IDR',lines:[{quantity:1000,unit_price:1000000,tax_id:tax,account_id:acc(db,'4-2100')}]});
    error('closed VAT period blocks new taxable invoice',()=>B.docs.approve(db,bad),'tax_period_closed');
    const nov=B.docs.save(db,'invoice',{contact_id:buyer,date:'2026-11-20',currency:'IDR',lines:[{quantity:1000,unit_price:1000000,tax_id:tax,account_id:acc(db,'4-2100')}]});
    B.docs.approve(db,nov);
    assert('open VAT period accepts invoice',db.scalar('SELECT status FROM documents WHERE id=?',[nov])==='open');
    // Property deal: milestone -> invoice, held funds -> offset -> remittance
    const deal=B.deals.save(db,{deal_date:'2026-11-01',project:'Grand Tenjo',unit_no:'A-03',price:300000000,buyer_id:buyer,developer_id:developer});
    assert('deal created with unique number',!!db.scalar('SELECT number FROM deals WHERE id=?',[deal]));
    B.deals.milestone(db,deal,{kind:'booking',actual_date:'2026-11-02',amount:5000000,through_us:1});
    B.deals.milestone(db,deal,{kind:'akad',actual_date:'2026-11-05'});
    const c=B.deals.addCommission(db,deal,{payer_id:developer,payer_role:'developer',basis:'percent',rate:'1',trigger_kind:'akad',tax_id:tax});
    error('titipan cannot become negative',()=>B.deals.moveFund(db,{deal_id:deal,kind:'remit',date:'2026-11-03',bank_account_id:bank,amount:1}),'insufficient_titipan');
    const paid=B.deals.moveFund(db,{deal_id:deal,kind:'receipt',date:'2026-11-03',bank_account_id:bank,amount:5000000});
    assert('titipan receipt debits bank and increases held-funds liability',B.deals.balance(db,deal)===5000000 && paid.journal_id>0);
    const receipt=B.deals.receipt(db,paid.id);
    assert('property receipt prints through standard template',receipt.includes('Developer A') && receipt.includes('Grand Tenjo'));
    const commissionInv=B.deals.generateInvoice(db,c,'2026-11-05');
    error('commission cannot generate duplicate invoice',()=>B.deals.generateInvoice(db,c,'2026-11-05'),'duplicate_invoice');
    B.docs.approve(db,commissionInv);
    assert('commission invoice is 3 million plus configured VAT',db.scalar('SELECT total FROM documents WHERE id=?',[commissionInv])===3330000);
    const setoff=B.deals.offset(db,{deal_id:deal,date:'2026-11-07',invoice_id:commissionInv,amount:3330000,withholding:60000});
    assert('offset clears receivable including PPh 23',db.scalar('SELECT status FROM documents WHERE id=?',[commissionInv])==='paid');
    assert('offset uses net customer funds',B.deals.balance(db,deal)===1730000 && setoff.journal_id>0);
    error('cannot offset invoice twice',()=>B.deals.offset(db,{deal_id:deal,date:'2026-11-07',invoice_id:commissionInv,amount:10000}),'invoice_required');
    const share=B.deals.addShare(db,deal,{contact_id:partner,treatment:'principal',amount:500000});
    B.deals.accrueShare(db,share,'2026-11-08');
    B.deals.payoutShare(db,share,'2026-11-09',bank);
    assert('partner share can accrue and pay',db.scalar('SELECT status FROM deal_shares WHERE id=?',[share])==='paid');
    error('deal cannot close with outstanding funds',()=>B.deals.close(db,deal),'titipan_outstanding');
    B.deals.moveFund(db,{deal_id:deal,kind:'remit',date:'2026-11-10',bank_account_id:bank,amount:1730000});
    B.deals.close(db,deal);
    assert('deal closes after complete titipan settlement',B.deals.balance(db,deal)===0 && db.scalar('SELECT status FROM deals WHERE id=?',[deal])==='closed');
    const report=B.deals.trial(db);
    assert('deal titipan reconciles against current ledger',report.unassigned===0);
    // Existing manually posted funds can be linked without reposting their journals.
    const legacyDeal=B.deals.save(db,{deal_date:'2026-11-12',project:'Legacy Developer',price:150000000,buyer_id:buyer,developer_id:developer});
    const oldEntry=B.posting.post(db,{date:'2026-11-12',currency:'IDR',memo:'Old booking money',
      lines:[{account_id:bank,debit:800000},{account_id:acc(db,'2-1300'),credit:800000}]});
    assert('old manual funds first show as unassigned',B.deals.trial(db).unassigned===800000);
    const legacyLine=db.scalar('SELECT id FROM journal_lines WHERE entry_id=? AND credit_base=800000',[oldEntry.id]);
    B.deals.linkLegacy(db,legacyDeal,legacyLine,'Historic receipt');
    assert('linking legacy funds adds no accounting posting',B.deals.balance(db,legacyDeal)===800000 && B.deals.trial(db).unassigned===0);
    error('same legacy line cannot be allocated twice',()=>B.deals.linkLegacy(db,legacyDeal,legacyLine,'duplicate'),'legacy_link_unavailable');
    // Imported bank movement: statement line must match bank, date, amount and direction.
    const impDeal=B.deals.save(db,{deal_date:'2026-11-14',project:'Import Bank Demo',price:300000000,buyer_id:buyer,developer_id:developer});
    const imp=B.banking.importRows(db,bank,[{date:'2026-11-15',description:'BOOKING PROPERTY DEMO',amount:1000000}],{preset:'generic'});
    const stmt=db.get("SELECT * FROM bank_import_lines WHERE description='BOOKING PROPERTY DEMO'");
    assert('bank statement row imported',!!stmt && imp.added===1);
    error('mismatched bank amount rejected',()=>B.deals.moveFund(db,{deal_id:impDeal,kind:'receipt',date:'2026-11-15',bank_account_id:bank,amount:200000,bank_import_line_id:stmt.id}),'bank_import_mismatch');
    B.deals.moveFund(db,{deal_id:impDeal,kind:'receipt',date:'2026-11-15',bank_account_id:bank,amount:1000000,bank_import_line_id:stmt.id});
    assert('bank statement line linked to property receipt',db.scalar('SELECT status FROM bank_import_lines WHERE id=?',[stmt.id])==='created');
    error('journal reversal cannot orphan deal fund records',()=>B.posting.reverse(db,paid.journal_id,'2026-11-20'),'deal_event_locked');
    const fk=db.scalar('PRAGMA foreign_key_check');assert('foreign keys still valid',!fk);
    const bytes=db.export(),reloaded=await B.dbm.create(bytes);
    assert('v4 export reopens with closed deal preserved',reloaded.scalar('SELECT count(*) FROM deals WHERE status=\'closed\'')===1);
    reloaded.close();
  }catch(e){results.push({name:'RUN CRASH',pass:false,detail:e.stack||String(e)});}
  const failed=results.filter(r=>!r.pass);
  if(typeof document!=='undefined'&&document.getElementById('summary')){
    document.getElementById('summary').textContent=(results.length-failed.length)+' / '+results.length+' passed';
    const el=document.getElementById('out');if(el)el.innerHTML=results.map(r=>'<p>'+ (r.pass?'✓ ':'✗ ')+r.name+(r.detail?'<pre>'+r.detail+'</pre>':'')+'</p>').join('');
  }
  window.__tier3Results={total:results.length,failed};
})();
