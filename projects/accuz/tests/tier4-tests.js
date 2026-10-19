/* P12–P15 engine acceptance tests. Executes entirely in memory. */
(async function(){'use strict';const B=window.Buku,rs=[];
 const ok=(name,test)=>{rs.push({name,pass:!!test});if(!test)throw Error('Check failed: '+name);};
 const throws=(name,fn,code)=>{let actual='';try{fn();}catch(e){actual=e.code||e.message;}ok(name,actual===code);};
 const db=await B.dbm.create();
 try{
  B.schema.migrate(db);
  B.seed.initCompany(db,{company:{name:'Buku 3.5 Test'},addresses:[{label:'HQ',address:'Jakarta',is_default:true}],reps:[],coaTemplate:'saas_property',currencies:['IDR']});
  ok('migration chain ends at version 8',B.schema.currentVersion(db)===8);
  const now=B.util.nowIso(),a=c=>db.scalar('SELECT id FROM accounts WHERE code=?',[c]),bank=a('1-1200');
  const person=n=>db.insert('contacts',{name:n,tags:'[]',created_at:now,updated_at:now});
  const buyer=person('Owned-unit Buyer'),seller=person('Old Property Seller');
  B.posting.post(db,{date:'2026-10-01',currency:'IDR',memo:'Capital',lines:[{account_id:bank,debit:900000000},{account_id:a('3-1000'),credit:900000000}]});
  const unit=B.property.addUnit(db,{code:'RES-2026-A01',project:'Buku Resale',address:'Tigaraksa',seller_id:seller});
  ok('unit created',db.scalar('SELECT status FROM property_units WHERE id=?',[unit])==='planned');
  B.property.capitalize(db,{unit_id:unit,date:'2026-10-02',kind:'acquisition',amount:300000000,bank_account_id:bank});
  B.property.capitalize(db,{unit_id:unit,date:'2026-10-03',kind:'renovation',amount:35000000,bank_account_id:bank});
  ok('owned property capitalized',B.property.unit(db,unit).cost===335000000);
  ok('property inventory reconciles to ledger',B.property.trial(db).ok);
  const sale=B.property.sell(db,{unit_id:unit,buyer_id:buyer,date:'2026-10-04',price:420000000});
  ok('sale recognizes gross margin',sale.margin===85000000);
  ok('sold inventory removed from inventory GL',B.property.trial(db).ok&&B.property.trial(db).gl===0);
  throws('unit cannot be sold twice',()=>B.property.sell(db,{unit_id:unit,buyer_id:buyer,date:'2026-10-05',price:410000000}),'status');
  throws('cannot void invoice that owns HPP',()=>B.docs.unpost(db,sale.invoice_id,'void'),'property_sale_locked');
  throws('cannot reverse HPP directly',()=>B.posting.reverse(db,sale.hpp_journal_id,'2026-10-06'),'property_event_locked');
  const p=B.property.plan(db,{sale_id:sale.id,start_date:'2026-11-10',months:3,principal:6000000});
  const l=db.all('SELECT * FROM instalment_lines WHERE plan_id=? ORDER BY id',[p]);
  ok('instalment schedule preserves principal',l.length===3&&l.reduce((s,x)=>s+x.amount,0)===6000000);
  throws('managed instalment payment cannot bypass schedule',()=>B.payments.post(db,{direction:'in',contact_id:buyer,
    date:'2026-11-10',account_id:bank,amount:1000,allocations:[{document_id:sale.invoice_id,amount:1000}]}),'instalment_allocation_required');
  const payment=B.property.collect(db,{line_id:l[0].id,date:'2026-11-10',amount:2000000,bank_account_id:bank});
  ok('collection clears invoice and instalment line',db.scalar('SELECT paid FROM instalment_lines WHERE id=?',[l[0].id])===2000000&&
    db.scalar('SELECT amount_paid FROM documents WHERE id=?',[sale.invoice_id])===2000000);
  throws('cannot void linked instalment payment silently',()=>B.payments.voidPayment(db,payment,'2026-11-11'),'instalment_payment_locked');
  const jv=B.property.jvCreate(db,'JV Test Co',seller);
  B.property.jvMove(db,{investment_id:jv,kind:'contribution',date:'2026-10-09',bank_account_id:bank,amount:20000000});
  B.property.jvMove(db,{investment_id:jv,kind:'capital_return',date:'2026-10-10',bank_account_id:bank,amount:3000000});
  throws('JV cannot return excess capital',()=>B.property.jvMove(db,{investment_id:jv,kind:'capital_return',date:'2026-10-11',bank_account_id:bank,amount:30000000}),'jv_balance');
  ok('JV investment book value reconciles',db.scalar("SELECT COALESCE(SUM(l.debit_base-l.credit_base),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=? AND e.status='posted'",[a('1-2200')])===17000000);
  const tax=db.scalar("SELECT id FROM taxes WHERE code='PPN11'");
  const q=B.commercial.createQuote(db,{date:'2026-10-15',valid_until:'2026-11-15',contact_id:buyer,
    lines:[{description:'Consulting',amount:2000000,tax_id:tax}]});
  ok('quote includes configured tax',db.scalar('SELECT total FROM quotations WHERE id=?',[q])===2220000);
  const so=B.commercial.accept(db,q,'2026-10-17');
  ok('accepted quotation converted to confirmed SO',db.scalar('SELECT status FROM documents WHERE id=?',[so])==='confirmed'&&
    db.scalar('SELECT sales_order_id FROM quotations WHERE id=?',[q])===so);
  throws('same quotation cannot convert twice',()=>B.commercial.accept(db,q,'2026-10-18'),'quote');
  const dash=B.commercial.dashboard(db,'2026-11-30');
  ok('dashboard bank reflects cash movements',dash.bank===900000000-335000000-20000000+3000000+2000000);
  ok('dashboard property margin agrees',dash.resale_margin===85000000);
  ok('dashboard AR reflects original sale invoice',dash.ar===418000000);
  const rep=db.insert('sales_reps',{code:'TESTREP',name:'Resale sales rep',commission_rate:'0',created_at:now,updated_at:now});
  const second=B.property.addUnit(db,{code:'RES-2026-B02',project:'Resale JV',sales_rep_id:rep});
  B.property.capitalize(db,{unit_id:second,kind:'acquisition',date:'2026-11-03',bank_account_id:bank,amount:100000000});
  const sale2=B.property.sell(db,{unit_id:second,buyer_id:buyer,date:'2026-11-04',price:150000000});
  const kpr=B.property.kprDisbursement(db,{sale_id:sale2.id,date:'2026-11-06',bank_account_id:bank,amount:120000000});
  ok('KPR disbursement clears same property invoice',db.scalar('SELECT amount_paid FROM documents WHERE id=?',[sale2.invoice_id])===120000000);
  throws('cannot reverse KPR payment without property correction',()=>B.payments.voidPayment(db,
    db.scalar('SELECT payment_id FROM property_disbursements WHERE id=?',[kpr]),'2026-11-07'),'kpr_disbursement_locked');
  B.property.recordPropertyTax(db,{sale_id:sale2.id,date:'2026-11-07',tax_kind:'pph_final',amount:2500000,bank_account_id:bank,ntpn:'TAX-1'});
  ok('property final-tax payment posted',db.scalar('SELECT sum(amount) FROM property_tax_payments')===2500000);
  B.commercial.commissionRule(db,rep,'resale_margin','10');
  ok('sales commission uses recognized resale margin',B.commercial.commissionReport(db)[0].commission===5000000);
  ok('second property sale and inventory still reconcile',B.property.trial(db).ok);
  const check=B.period.check(db,'2026-10');ok('trial balance is balanced',check.balanced&&check.inventory_ok);
  const closed=B.period.close(db,'2026-10',true);ok('month can be closed',closed.balanced&&B.period.month(db,'2026-10').status==='closed');
  throws('closed accounting period blocks journal posting',()=>B.posting.post(db,{date:'2026-10-20',currency:'IDR',
    lines:[{account_id:bank,debit:100},{account_id:a('3-1000'),credit:100}]}),'period_closed');
  throws('closed accounting period blocks reversal',()=>B.posting.reverse(db,db.scalar("SELECT id FROM journal_entries WHERE memo='Capital'"),'2026-10-20'),'period_closed');
  throws('reopen requires reason',()=>B.period.reopen(db,'2026-10',''),'reason');
  B.period.reopen(db,'2026-10','Correct bank import');ok('reopen writes audit state',B.period.month(db,'2026-10').status==='reopened');
  B.period.budget(db,'2026-11',a('6-3000'),2000000);
  ok('budget report shows period and account',B.period.budgetReport(db,'2026-11')[0].amount===2000000);
  B.period.fiscal(db,{period:'2026-11',kind:'positive',amount:120000,memo:'Non-deductible cost'});
  ok('fiscal adjustment stored',db.scalar('SELECT count(*) FROM fiscal_adjustments')===1);
  const sched=B.finishing.recurringAdd(db,{name:'Monthly accrual',cadence:'monthly',next_date:'2026-11-01',currency:'IDR',
    lines:[{account_id:a('6-2000'),debit:1250000},{account_id:a('2-1700'),credit:1250000}]});
  const draft=B.finishing.generate(db,sched,'2026-11-05');
  ok('recurring creates draft, not posted entry',db.scalar('SELECT status FROM journal_entries WHERE id=?',[draft])==='draft');
  throws('recurring schedule cannot run twice same due date',()=>B.finishing.generate(db,sched,'2026-11-05'),'recurring');
  const bytes=new Uint8Array([1,2,3,4,5]);const att=B.finishing.addAttachment(db,{entity:'property_units',entity_id:unit,name:'sample.pdf',mime:'application/pdf',bytes});
  ok('attachment persists byte-for-byte',Array.from(B.finishing.attachment(db,att).bytes).join(',')==='1,2,3,4,5');
  ok('global search locates unit',B.finishing.search(db,'RES-2026').some(x=>x.type==='unit'&&x.id===unit));
  const imp=B.finishing.contactImport(db,'name,email\nNew Contact,new@example.test\nOwned-unit Buyer,repeat@example.test');
  ok('atomic contact import skips duplicate',imp.created===1&&imp.skipped===1);
  B.finishing.trace(db,{entity:'property_units',id:unit,action:'review',before:{x:1},after:{x:2},reason:'test'});
  ok('audit stores before and after snapshots',!!db.scalar("SELECT before_json FROM audit_changes WHERE action='review'"));
  const reopened=await B.dbm.create(db.export());ok('v8 exports and reopens with attachment intact',reopened.scalar('SELECT count(*) FROM attachments')===1);reopened.close();
  db.run("UPDATE currencies SET is_enabled=1 WHERE code='USD'");db.run("UPDATE accounts SET is_active=1 WHERE code='1-1210'");
  B.fx.set(db,'USD','2026-11-01','16000');B.fx.set(db,'USD','2026-11-30','16500');
  B.posting.post(db,{date:'2026-11-01',currency:'IDR',memo:'Deposit 100 USD',lines:[
    {account_id:a('1-1210'),currency:'USD',rate:'16000',debit:10000},{account_id:bank,credit:1600000}]});
  const reval=B.period.fxRevalue(db,'2026-11','USD');
  ok('FX revaluation creates base-only journal',reval.amount===50000);
  throws('cannot revalue same FX month twice',()=>B.period.fxRevalue(db,'2026-11','USD'),'fx_exists');
  const reverse=B.period.reverseFx(db,'2026-11','USD');
  ok('FX revaluation reverses in next open month',db.scalar('SELECT date FROM journal_entries WHERE id=?',[reverse.id])==='2026-12-01');
  const year=B.period.yearEnd(db,'2026-12-31');
  ok('year-end closes nominal accounts with retained earnings',!!year.journal.id&&db.scalar('SELECT count(*) FROM year_end_closings')===1);
  throws('year-end cannot be posted twice',()=>B.period.yearEnd(db,'2026-12-31'),'year_closed');
  if(crypto&&crypto.subtle){const enc=await B.finishing.encryptBackup(db.export(),'test passphrase 123');const restored=await B.finishing.decryptBackup(enc,'test passphrase 123');
    ok('encrypted backup restores original sqlite header',new TextDecoder().decode(restored.slice(0,6))==='SQLite');}
 }catch(e){rs.push({name:'TEST RUN CRASH',pass:false,detail:e.stack||String(e)});}
 window.__tier4Results={total:rs.length,failed:rs.filter(r=>!r.pass)};
 const summary=document&&document.getElementById&&document.getElementById('summary');if(summary){summary.textContent=(rs.length-window.__tier4Results.failed.length)+' / '+rs.length+' passed';
   const out=document.getElementById('out');if(out)out.innerHTML=rs.map(x=>'<p>'+ (x.pass?'✓':'✗')+' '+x.name+(x.detail?'<pre>'+x.detail+'</pre>':'')+'</p>').join('');}
})();
