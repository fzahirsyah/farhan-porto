/* Buku Tier 3.2–3.5 — local-first forms for property finance and operations. */
(function(){'use strict';const B=window.Buku,ui=B.ui,h=B.util.h,D=()=>B.db,day=()=>B.util.today(),t=(k,v)=>B.i18n.t(k,v);
 const fmt=v=>ui.idr(v||0),input=(n,v='',o={})=>ui.input(n,v,o),field=(n,x)=>ui.field(t(n),x),select=(n,arr)=>ui.select(n,arr.map(o=>typeof o==='object'?Object.assign({},o,{label:t(o.label)}):{value:o,label:lbl(o)})),fdata=m=>ui.formData(m.body),mny=(n,v=0)=>ui.moneyInput(n,v,0);
 const rm=(m,n)=>ui.readMoney(m.body.querySelector('[name="'+n+'"]'))||0;
 const contact=()=>D().all('SELECT id,name FROM contacts WHERE is_active=1 ORDER BY name').map(x=>({value:x.id,label:x.name}));
 const banks=()=>D().all("SELECT id,code,name FROM accounts WHERE subtype IN ('bank','cash') AND is_active=1 AND (currency IS NULL OR currency='IDR')").map(x=>({value:x.id,label:x.code+' · '+x.name}));
 const taxes=()=>[{value:'',label:t('No PPN')}].concat(D().all("SELECT id,name FROM taxes WHERE kind='ppn_out' AND is_active=1").map(x=>({value:x.id,label:x.name})));
 const account=()=>D().all('SELECT id,code,name FROM accounts WHERE is_header=0 AND is_active=1 ORDER BY code').map(x=>({value:x.id,label:x.code+' '+x.name}));
 const table=(cols,rows)=>rows.length?'<div class="table-wrap"><table class="data"><thead><tr>'+cols.map(c=>'<th>'+h(t(c))+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':ui.empty(t('No records yet.'));
 const link=(url,label)=>'<a href="'+h(url)+'">'+h(t(label))+'</a>';
 const btn=(act,label,style='')=>'<button class="btn '+style+'" data-ract="'+h(act)+'">'+h(t(label))+'</button>';
 const LABELS={owned:'Owned',sold:'Sold',acquisition:'Acquisition',notary:'Notary',tax:'Tax (BPHTB etc.)',renovation:'Renovation',improvement:'Improvement',other_capitalized:'Other capitalized cost',
   pph_final:'PPh final 4(2)',other_property_tax:'Other property tax',draft:'Draft',sent:'Sent',accepted:'Accepted',rejected:'Rejected',expired:'Expired',converted:'Converted',
   contribution:'Capital contribution',capital_return:'Capital return',distribution:'Profit distribution',dividend:'Dividend',share_of_profit:'Share of profit',share_of_loss:'Share of loss',intercompany:'Intercompany',
   positive:'Positive correction',negative:'Negative correction',final_income:'Final-taxed income',credit:'Tax credit',commission_collected:'Commission collected',resale_margin:'Resale margin',
   monthly:'Monthly',quarterly:'Quarterly',yearly:'Yearly',open:'Open',closed:'Closed',reopened:'Reopened',deal:'Deal',document:'Document',contact:'Contact',unit:'Unit'};
 const lbl=k=>k===null||k===undefined?'':t(LABELS[k]||String(k).replaceAll('_',' '));
 const note=s=>'<p class="note">'+h(t(s))+'</p>';
 function refresh(){setTimeout(()=>ui.dispatch(),0);}
 function modal(title,html,fn,label='Save') {return ui.modal({title:t(title),wide:true,body:'<div class="form-grid">'+html+'</div>',actions:[{label:t('Cancel'),kind:'ghost'},
   {label:t(label),kind:'primary',onClick:m=>{fn(m);refresh();ui.toast(t('Saved'));}}]});}
 function events(actions){ui.$$('#main [data-ract],#page-actions [data-ract]').forEach(el=>el.addEventListener('click',()=>{
   try{const name=el.dataset.ract;const a=actions[name];if(a)a();}catch(e){ui.showError(e);}
 }));}
 function inventory(){const rows=D().all('SELECT u.*,c.name buyer_name FROM property_units u LEFT JOIN contacts c ON c.id=u.buyer_id ORDER BY u.id DESC');
   const trial=B.property.trial(D());ui.page({title:t('Property Inventory'),actions:btn('new','Add owned unit','primary'),body:
    '<div class="kpis kpis-3"><div class="kpi"><span class=\"kpi-label\">'+h(t('Unsold unit costs'))+'</span><span class="kpi-value">'+h(fmt(trial.inventory))+'</span></div>'+ 
    '<div class="kpi"><span class=\"kpi-label\">'+h(t('Property inventory ledger'))+'</span><span class="kpi-value">'+h(fmt(trial.gl))+'</span></div>'+ 
    '<div class="kpi"><span class=\"kpi-label\">'+h(t('Reconciliation'))+'</span><span class="kpi-value">'+h(t(trial.ok?'Matched':'Needs review'))+'</span></div></div>'+ 
    note('Resale inventory is for owned units, not agency transactions. Costs are capitalized only through reviewed IDR bank entries.')+
    table(['Unit','Project','Status','Cost','Actions'],rows.map(u=>[link('#/inventory/'+u.id,u.code),h(u.project),h(lbl(u.status)),h(fmt(u.cost)),link('#/inventory/'+u.id,'Open')]))});
    events({new:()=>modal('Add property unit',field('Unit code',input('code','',{required:true}))+field('Project',input('project','',{required:true}))+field('Address',input('address'))+field('Sales representative',select('sales_rep_id',[{value:'',label:'—'}].concat(D().all('SELECT id,name FROM sales_reps WHERE is_active=1').map(x=>({value:x.id,label:x.name})))))+field('Notes',input('notes')),
      m=>B.property.addUnit(D(),fdata(m)),'Create')});}
 function unitDetail(p){const u=B.property.unit(D(),Number(p.id)),costs=D().all('SELECT * FROM property_unit_costs WHERE unit_id=? ORDER BY date,id',[u.id]);
   const sale=D().get('SELECT * FROM property_sales WHERE unit_id=?',[u.id]);const plan=sale&&D().get('SELECT * FROM instalment_plans WHERE sale_id=?',[sale.id]);
   const lines=plan?D().all('SELECT * FROM instalment_lines WHERE plan_id=? ORDER BY due_date',[plan.id]):[];
   const files=D().all("SELECT id,file_name,size FROM attachments WHERE entity_type='property_units' AND entity_id=?",[u.id]);
   ui.page({title:t('Owned property')+' · '+u.code,actions:link('#/inventory','← Inventory')+' '+btn('cost','Capitalize cost','primary')+' '+(u.status!=='sold'?btn('sale','Recognize sale'):'')+' '+(sale?btn('kpr','Record KPR disbursement')+' '+btn('propertytax','Pay property tax'):'')+' '+btn('attach','Attach document'),body:
     '<div class="kpis kpis-3"><div class="kpi"><span class=\"kpi-label\">'+h(t('Carrying cost'))+'</span><span class="kpi-value">'+h(fmt(u.cost))+'</span></div><div class="kpi"><span class=\"kpi-label\">'+h(t('Status'))+'</span><span class="kpi-value">'+h(lbl(u.status))+'</span></div><div class="kpi"><span class=\"kpi-label\">'+h(t('Project'))+'</span><span class="kpi-value">'+h(u.project)+'</span></div></div>'+ 
     '<h3 class=\"section-title\">'+h(t('Cost capitalization'))+'</h3>'+table(['Date','Type','Amount','Journal'],costs.map(c=>[h(c.date),h(lbl(c.kind)),h(fmt(c.amount)),link('#/journal/'+c.journal_entry_id,'Journal')]))+
     (sale?'<h3 class=\"section-title\">'+h(t('Sale'))+'</h3>'+note(t('Sale invoice {n} · selling price {p} · gross margin {m}',{n:B.db.scalar('SELECT number FROM documents WHERE id=?',[sale.invoice_id])||('#'+sale.invoice_id),p:fmt(sale.price),m:fmt(sale.price-u.cost)}))+' '+link('#/doc/'+sale.invoice_id,'Open sale invoice')+
       (plan?'<h3 class=\"section-title\">'+h(t('Instalment schedule'))+'</h3>'+table(['Due date','Scheduled','Paid','Remaining',''],lines.map(l=>[h(l.due_date),h(fmt(l.amount)),h(fmt(l.paid)),h(fmt(l.amount-l.paid)),l.amount>l.paid?btn('collect:'+l.id,'Collect'):h(t('Paid'))])):
        btn('plan','Add instalment schedule')+' '+note('Payment schedule only. Initial sale invoice already records the receivable.')):'')+
     '<h3 class=\"section-title\">'+h(t('Attachments'))+'</h3>'+table(['Filename','Size',''],files.map(a=>[h(a.file_name),h(String(a.size)+' bytes'),btn('download:'+a.id,'Save file')]))});
   const actions={cost:()=>modal('Capitalized property cost',field('Date',input('date',day(),{type:'date'}))+
       field('Type',select('kind',['acquisition','notary','tax','renovation','improvement','other_capitalized']))+
       field('Cost · IDR',mny('amount'))+field('Bank',select('bank_account_id',banks()))+field('Reference',input('reference')),
       m=>B.property.capitalize(D(),{...fdata(m),amount:rm(m,'amount'),unit_id:u.id}),'Post cost'),
     sale:()=>modal('Recognize property sale',note('Approves a sale invoice and posts HPP atomically. Sale date must reflect the transfer of control under the contract.')+
       field('Date',input('date',day(),{type:'date'}))+field('Buyer',select('buyer_id',contact()))+
       field('Selling price · IDR',mny('price'))+field('PPN (if applicable)',select('tax_id',taxes()))+
       field('Reference',input('reference')),m=>B.property.sell(D(),{...fdata(m),unit_id:u.id,price:rm(m,'price')}),'Post sale'),
     kpr:()=>modal('Record KPR disbursement',note('Only use for standard bank KPR, without an active in-house instalment plan.')+
       field('Date',input('date',day(),{type:'date'}))+field('Amount received · IDR',mny('amount'))+
       field('Bank',select('bank_account_id',banks()))+field('Reference',input('reference')),
       m=>B.property.kprDisbursement(D(),{...fdata(m),sale_id:sale.id,amount:rm(m,'amount')}),'Post receipt'),
     propertytax:()=>modal('Record property tax payment',note('Verify the correct property-tax amount and treatment against the actual transaction; Buku does not infer a legal rate.')+
       field('Date',input('date',day(),{type:'date'}))+field('Kind',select('tax_kind',['pph_final','other_property_tax']))+
       field('Amount paid · IDR',mny('amount'))+field('Bank',select('bank_account_id',banks()))+
       field('NTPN/reference',input('ntpn')),
       m=>B.property.recordPropertyTax(D(),{...fdata(m),sale_id:sale.id,amount:rm(m,'amount')}),'Post tax'),
     plan:()=>modal('Instalment schedule',note('Does not generate another receivable or interest margin.')+
       field('First due date',input('start_date',day(),{type:'date'}))+
       field('Number of monthly payments',input('months','12',{type:'number'}))+field('Principal · IDR',mny('principal')),
       m=>B.property.plan(D(),{...fdata(m),sale_id:sale.id,principal:rm(m,'principal')}),'Create schedule'),
     attach:()=>ui.modal({title:t('Attach document'),body:field('File (maximum 5 MiB)', '<input type="file" name="file">'),actions:[{label:t('Cancel')},
       {label:t('Save attachment'),kind:'primary',onClick:async m=>{const file=m.body.querySelector('[name=file]').files[0];if(!file)throw Error('Select a file');
         B.finishing.addAttachment(D(),{entity:'property_units',entity_id:u.id,name:file.name,mime:file.type,bytes:new Uint8Array(await file.arrayBuffer())});refresh();}}]})};
   lines.forEach(l=>{actions['collect:'+l.id]=()=>modal('Collect instalment',field('Date',input('date',day(),{type:'date'}))+
     field('Amount · IDR',mny('amount',l.amount-l.paid))+field('Bank',select('bank_account_id',banks()))+field('Reference',input('reference')),
     m=>B.property.collect(D(),{...fdata(m),line_id:l.id,amount:rm(m,'amount')}),'Post payment');});
   files.forEach(a=>{actions['download:'+a.id]=()=>{const data=B.finishing.attachment(D(),a.id);B.util.download(data.file_name,new Blob([data.bytes],{type:data.mime_type}));};});
   events(actions);
 }
 function jv(){const rows=D().all(`SELECT j.*,coalesce((SELECT sum(CASE WHEN kind='contribution' THEN amount WHEN kind='capital_return' THEN -amount ELSE 0 END)
     FROM jv_movements WHERE investment_id=j.id),0) book_value FROM jv_investments j ORDER BY id DESC`);
   ui.page({title:t('JV Investments'),actions:btn('new','Add JV','primary'),body:note('Separate JV legal entities use their own Accu-Z Accounting company files. This page tracks parent-company capital, returns and distributions only.')+
     table(['Joint venture','Investment carrying value','Actions'],rows.map(r=>[h(r.name),h(fmt(r.book_value)),btn('move:'+r.id,'Record transaction')]))});
   const actions={new:()=>modal('New joint venture',field('JV name',input('name','',{required:true}))+field('Counterparty (optional)',select('contact_id',[{value:'',label:'—'}].concat(contact()))),
     m=>{const f=fdata(m);B.property.jvCreate(D(),f.name,f.contact_id);},'Create')};
   rows.forEach(r=>actions['move:'+r.id]=()=>modal(t('JV movement')+' · '+r.name,field('Date',input('date',day(),{type:'date'}))+
     field('Movement',select('kind',['contribution','capital_return','distribution']))+field('Amount · IDR',mny('amount'))+
     field('Bank',select('bank_account_id',banks()))+field('Reference',input('reference')),
     m=>B.property.jvMove(D(),{...fdata(m),investment_id:r.id,amount:rm(m,'amount')}),'Post'));events(actions);
 }
 function quotations(){const rows=D().all('SELECT q.*,c.name customer FROM quotations q JOIN contacts c ON c.id=q.contact_id ORDER BY q.id DESC');
   ui.page({title:t('Quotations'),actions:btn('new','New quotation','primary'),body:note('Quotations are non-posting documents. Conversion creates one confirmed sales order.')+
     table(['Quote','Customer','Valid until','Total','Status',''],rows.map(q=>[h(q.number),h(q.customer),h(q.valid_until),h(fmt(q.total)),h(lbl(q.status)),
     q.sales_order_id?link('#/doc/'+q.sales_order_id,'Sales order'):btn('accept:'+q.id,'Convert to SO')]))});
   const actions={new:()=>modal('New quotation',field('Date',input('date',day(),{type:'date'}))+field('Valid until',input('valid_until',B.util.addDays(day(),14),{type:'date'}))+
      field('Customer',select('contact_id',contact()))+field('Item description',input('description','',{required:true}))+
      field('Amount IDR',mny('amount'))+field('Tax',select('tax_id',taxes()))+field('Account',select('account_id',[{value:'',label:'Default'}].concat(account())))+
      field('Note',input('note')),m=>{const x=fdata(m);B.commercial.createQuote(D(),{...x,lines:[{description:x.description,amount:rm(m,'amount'),tax_id:x.tax_id,account_id:x.account_id}]});},'Create')};
   rows.filter(q=>!q.sales_order_id).forEach(q=>actions['accept:'+q.id]=()=>ui.confirm(t('Convert quotation {n} to a confirmed sales order?',{n:q.number}),{okLabel:t('Convert')}).then(ok=>{
     if(!ok)return;try{B.commercial.accept(D(),q.id,day());refresh();}catch(e){ui.showError(e);}}));events(actions);
 }
 function dashboard(p,q){const data=B.commercial.dashboard(D(),q.asof||day());const items=[['Bank & Cash',data.bank],['Accounts Receivable',data.ar],
   ['Accounts Payable',data.ap],['Deferred Revenue',data.deferred],['Customer funds held',data.titipan],['Property Inventory',data.inventory],
   ['Expected Commission',data.expected],['Recognized Resale Margin',data.resale_margin],['Overdue Instalments',data.overdue_instalments]];
   ui.page({title:t('Executive Dashboard'),actions:link('#/reports/pl','Profit & loss'),body:
     '<div class="toolbar"><form id="dash-range">'+field('As of date',input('asof',data.asOf,{type:'date'}))+' <button class="btn" type="submit">'+h(t('Show'))+'</button></form></div>'+ 
     '<div class="kpis kpis-3">'+items.map(([label,value])=>'<div class="kpi"><span class="kpi-label">'+h(t(label))+'</span><span class="kpi-value num">'+h(label==='Overdue Instalments'?String(value||0):fmt(value))+'</span></div>').join('')+'</div>'+ 
     note('As-of ledger controls are derived from posted journal lines. Pipeline counts and expected commissions are operational indicators, not earned revenue.')+
     '<h3 class=\"section-title\">'+h(t('Property pipeline'))+'</h3>'+table(['Open deals','Expected commission','Resale revenue','Cost of sales'],[[String(data.deals),h(fmt(data.expected)),h(fmt(data.resale_revenue)),h(fmt(data.resale_cogs))]])});
   ui.$('#dash-range').onsubmit=e=>{e.preventDefault();location.hash='#/dashboard?asof='+ui.formData(e.target).asof;};}
 function closePage(p,q){const period=q.period||day().slice(0,7),r=B.period.check(D(),period);const cur=B.period.month(D(),period);
   ui.page({title:t('Accounting Period Close'),actions:btn('close','Close month','primary')+' '+btn('reopen','Reopen')+' '+btn('fx','FX revaluation')+' '+btn('fxreverse','Reverse FX')+' '+btn('year','Year-end close'),body:
     '<div class="toolbar"><form id="close-range">'+field('Period',input('period',period))+' <button class="btn">'+h(t('Show'))+'</button></form></div>'+ 
     '<div class="kpis kpis-3"><div class="kpi"><span class=\"kpi-label\">'+h(t('Period status'))+'</span><span class="kpi-value">'+h(lbl(cur?cur.status:'open'))+'</span></div>'+ 
     '<div class="kpi"><span class=\"kpi-label\">'+h(t('Trial balance'))+'</span><span class="kpi-value">'+h(t(r.balanced?'Balanced':'Mismatch'))+'</span></div>'+ 
     '<div class="kpi"><span class=\"kpi-label\">'+h(t('Draft entries'))+'</span><span class="kpi-value">'+r.draft_journals+'</span></div></div>'+ 
     table(['Validation','Result'],[[t('Journal debits'),h(fmt(r.debit))],[t('Journal credits'),h(fmt(r.credit))],[t('Unposted documents'),String(r.draft_documents)],
       [t('Property inventory GL'),t(r.inventory_ok?'Matched':'Mismatch')],[t('Unassigned titipan reviewed'),t(r.titipan_ok?'Matched':'Review needed')]])+
     note('Closing blocks ALL new dated postings in the month. Reopen with a mandatory reason before corrections. Tax closure remains independent.')});
    ui.$('#close-range').onsubmit=e=>{e.preventDefault();location.hash='#/period-close?period='+encodeURIComponent(ui.formData(e.target).period);};
    events({fx:()=>modal('Revalue monetary FX balances',note('Sets IDR valuation at the closing exchange rate without changing original currency amounts.')+
        field('Currency',select('currency',D().all("SELECT code FROM currencies WHERE is_enabled=1 AND code<>'IDR'").map(x=>x.code))),
        m=>B.period.fxRevalue(D(),period,fdata(m).currency),'Post FX valuation'),
      fxreverse:()=>modal('Reverse FX valuation',field('Currency',select('currency',D().all('SELECT currency FROM fx_revaluations WHERE period=? AND reversal_entry_id IS NULL',[period]).map(x=>x.currency))),
        m=>B.period.reverseFx(D(),period,fdata(m).currency),'Post reversal'),
      year:()=>modal('Fiscal year-end close',note('Post a closing journal transferring nominal balances into retained earnings. Review financial statements and make sure the fiscal year-end date is correct.')+
        field('Fiscal year-end date',input('end_date',period+'-'+B.util.monthEnd(period+'-01').slice(-2),{type:'date'})),
        m=>B.period.yearEnd(D(),fdata(m).end_date),'Post year-end closing'),
      close:()=>ui.confirm(t('Confirm bank, AR/AP, taxes, property, JV and deferred balances have been reviewed and close {p}?',{p:period}),{okLabel:t('Close month')}).then(ok=>{if(!ok)return;try{B.period.close(D(),period,true);refresh();}catch(e){ui.showError(e);}}),
      reopen:()=>modal(t('Reopen')+' '+period,field('Reason',input('reason','',{required:true})),m=>B.period.reopen(D(),period,fdata(m).reason),'Reopen')});}
 function budgetPage(p,q){const period=q.period||day().slice(0,7),rows=B.period.budgetReport(D(),period);
   ui.page({title:t('Budgets & Fiscal Working Papers'),actions:btn('budget','Budget amount','primary')+' '+btn('fiscal','Fiscal adjustment'),body:
      '<div class="toolbar"><form id="bud-range">'+field('Month YYYY-MM',input('period',period))+' <button class="btn">'+h(t('Show'))+'</button></form></div>'+ 
      table(['Account','Budget','Actual','Variance'],rows.map(r=>[h(r.code+' '+r.name),h(fmt(r.amount)),h(fmt(r.actual)),h(fmt(r.actual-r.amount))]))+
      '<h3 class=\"section-title\">'+h(t('Fiscal adjustments'))+'</h3>'+table(['Type','Amount','Notes'],D().all('SELECT * FROM fiscal_adjustments WHERE period=? ORDER BY id',[period]).map(r=>[h(lbl(r.kind)),h(fmt(r.amount)),h(r.memo||'')]))});
   ui.$('#bud-range').onsubmit=e=>{e.preventDefault();location.hash='#/budgets?period='+ui.formData(e.target).period;};
   events({budget:()=>modal('Edit monthly budget',field('Account',select('account_id',account()))+field('Budget · IDR',mny('amount')),
     m=>B.period.budget(D(),period,Number(fdata(m).account_id),rm(m,'amount'))),
     fiscal:()=>modal('Fiscal adjustment',field('Type',select('kind',['positive','negative','final_income','credit']))+
       field('Amount · IDR',mny('amount'))+field('Notes',input('memo')),
       m=>B.period.fiscal(D(),{...fdata(m),period,amount:rm(m,'amount')}))});}
 function automation(){const sched=D().all('SELECT * FROM recurring_schedules ORDER BY id DESC');
   ui.page({title:t('Automation & Tools'),actions:btn('new','New recurring journal','primary'),body:
     note('Offline recurring transactions generate reviewable journal DRAFTS only when Buku is open and you run the schedule.')+
     table(['Schedule','Next due','Frequency',''],sched.map(r=>[h(r.name),h(r.next_date),h(lbl(r.cadence)),btn('run:'+r.id,'Generate draft')]))+
     '<h3 class=\"section-title\">'+h(t('Import contacts from CSV'))+'</h3><p class="note">'+h(t('CSV headers: name,email,phone,npwp. Duplicate contact names are skipped. The import is atomic.'))+'</p>'+ 
     '<input type="file" accept=".csv,text/csv" id="contacts-file"> '+btn('import','Import CSV')+
     '<h3 class=\"section-title\">'+h(t('Encrypted backup export'))+'</h3>'+note('AES-GCM protects the downloaded backup only. The opened IndexedDB working copy is NOT encrypted.')+
     btn('encrypt','Export encrypted .bke backup')+' '+btn('decrypt','Decrypt .bke to SQLite')});
   const actions={new:()=>modal('Recurring journal template',field('Name',input('name','',{required:true}))+field('Next date',input('next_date',day(),{type:'date'}))+
     field('Cadence',select('cadence',['monthly','quarterly','yearly']))+field('Debit account',select('debit_account',account()))+
     field('Credit account',select('credit_account',account()))+field('Amount · IDR',mny('amount'))+field('Memo',input('memo')),
     m=>{const v=fdata(m),amount=rm(m,'amount');B.finishing.recurringAdd(D(),{...v,lines:[{account_id:Number(v.debit_account),debit:amount},{account_id:Number(v.credit_account),credit:amount}]});},'Create'),
    import:async()=>{try{const file=ui.$('#contacts-file').files[0];if(!file)throw Error('Select a CSV file');const result=B.finishing.contactImport(D(),await file.text());
      ui.toast('Created '+result.created+'; skipped '+result.skipped);refresh();}catch(e){ui.showError(e);}},
    decrypt:async()=>{try{const picker=document.createElement('input');picker.type='file';picker.accept='.bke';
      picker.onchange=async()=>{try{const file=picker.files[0];if(!file)return;const password=prompt('Enter passphrase for encrypted Accu-Z Accounting backup');if(!password)return;
        const bytes=await B.finishing.decryptBackup(new Uint8Array(await file.arrayBuffer()),password);
        const candidate=await B.dbm.create(bytes);try{if(candidate.meta('app')!=='Buku')throw Error('Decrypted data is not a compatible Accu-Z Accounting company file');}
        finally{candidate.close();}
        B.util.download('accuz-accounting-decrypted-'+day()+'.sqlite',new Blob([bytes],{type:'application/vnd.sqlite3'}));
        ui.toast(t('Decrypted file saved. Open it through Data & backup after making a safety copy.'));}catch(e){ui.showError(e);}};picker.click();
      }catch(e){ui.showError(e);}},
    encrypt:async()=>{try{const pass=prompt('Enter a NEW passphrase (minimum 12 characters). The browser working copy will remain unencrypted.');if(!pass)return;
      const bytes=await B.finishing.encryptBackup(D().export(),pass);B.util.download('accuz-accounting-backup-'+day()+'.bke',new Blob([bytes],{type:'application/octet-stream'}));
      ui.toast(t('Encrypted export saved. Keep the passphrase securely.'));}catch(e){ui.showError(e);}}};
   sched.forEach(r=>actions['run:'+r.id]=()=>{try{const id=B.finishing.generate(D(),r.id,day());ui.go('#/journal/'+id);}catch(e){ui.showError(e);}});events(actions);
 }
 function internalSales(){const data=B.commercial.commissionReport(D()),rules=D().all('SELECT * FROM sales_commission_rules');
   ui.page({title:t('Internal Sales Commissions'),actions:btn('rule','Add commission rule','primary'),body:
     note('Non-posting estimates. Eligible commissions are based on collected agency revenue or recognized resale gross margin, according to each rule.')+
     table(['Sales rep','Basis','Rate','Eligible basis','Calculated commission'],data.map(r=>[
       h(r.rep_name),h(lbl(r.basis)),h(r.percent+'%'),h(fmt(r.eligible)),h(fmt(r.commission))]))});
   events({rule:()=>modal('Commission rule',field('Sales representative',select('sales_rep_id',D().all('SELECT id,name FROM sales_reps WHERE is_active=1').map(x=>({value:x.id,label:x.name}))))+
     field('Basis',select('basis',['commission_collected','resale_margin']))+field('Rate (%)',input('percent','1')),
     m=>{const x=fdata(m);B.commercial.commissionRule(D(),Number(x.sales_rep_id),x.basis,x.percent);},'Create rule')});}
 function search(p,q){const term=q.q||'',results=B.finishing.search(D(),term);ui.page({title:t('Global Search'),body:
   '<form id="global-search" class="toolbar">'+field('Search',input('q',term,{placeholder:t('Search contacts, documents, deals, units…')}))+
   '<button class="btn primary">'+h(t('Search'))+'</button></form>'+table(['Type','Record','Description'],results.map(r=>{
     const path={deal:'#/deals/',document:'#/doc/',contact:'#/contacts',unit:'#/inventory/'}[r.type];return [h(lbl(r.type)),link(path+(r.type==='contact'?'':r.id),r.title),h(r.description||'')];}))});
   ui.$('#global-search').onsubmit=e=>{e.preventDefault();location.hash='#/search?q='+encodeURIComponent(ui.formData(e.target).q);};}
 ui.route('/inventory',inventory);ui.route('/inventory/:id',unitDetail);ui.route('/jv',jv);ui.route('/quotations',quotations);
 ui.route('/dashboard',dashboard);ui.route('/internal-commissions',internalSales);ui.route('/period-close',closePage);ui.route('/budgets',budgetPage);ui.route('/automation',automation);ui.route('/search',search);
})();
