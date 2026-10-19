/* Buku 3.1 — Property Deals UI. All actions call the tested deal core. */
(function () {
  'use strict';
  const B=window.Buku,ui=B.ui,h=B.util.h,t=(s,v)=>B.i18n.t(s,v),D=()=>B.db;
  const idr=v=>ui.idr(v||0,{code:true});
  const date=v=>v?ui.date(v):'—';
  const ctrl=(name,v='',opts={})=>ui.input(name,v,opts);
  const field=(name,x)=>ui.field(t(name),x);
  const form=root=>ui.formData(root);
  const money=(name,v=0)=>ui.moneyInput(name,v,0);
  const readMoney=(root,name)=>ui.readMoney(ui.$('[name="'+name+'"]',root))||0;
  const contacts=(empty=true)=> (empty?[{value:'',label:t('— Choose contact —')}]:[]).concat(D().all('SELECT id,name FROM contacts WHERE is_active=1 ORDER BY name').map(r=>({value:r.id,label:r.name})));
  const reps=()=>[{value:'',label:t('— Sales rep —')}].concat(D().all('SELECT id,name FROM sales_reps WHERE is_active=1 ORDER BY name').map(r=>({value:r.id,label:r.name})));
  const banks=()=> D().all("SELECT id,code,name FROM accounts WHERE type='asset' AND subtype IN ('cash','bank') AND is_header=0 AND is_active=1 AND (currency IS NULL OR currency='IDR') ORDER BY code").map(r=>({value:r.id,label:r.code+' · '+r.name}));
  const taxes=()=> [{value:'',label:t('No tax')}].concat(D().all("SELECT id,name FROM taxes WHERE kind='ppn_out' AND is_active=1 ORDER BY id").map(r=>({value:r.id,label:r.name})));
  // Raw keys (statuses, milestone kinds, treatments) shown to people.
  const LABELS={prospect:'Prospect',booked:'Booked',dp_paid:'DP paid',kpr_approved:'KPR approved',akad:'Akad',disbursed:'Disbursed',handed_over:'Handed over',closed:'Closed',cancelled:'Cancelled',refunded:'Refunded',
    booking:'Booking',dp:'Down payment',sp3k:'SP3K',pencairan:'KPR disbursement',handover:'Handover',ajb:'AJB',confirmation:'Developer confirmation',
    developer:'Developer',bank:'Bank',buyer:'Buyer',receipt:'Received from buyer',remit:'Remitted to developer',refund:'Refunded to buyer',offset:'Offset against invoice',legacy:'Linked history',
    principal:'Principal',agent:'Agent',agreed:'Agreed',accrued:'Accrued',paid:'Paid',agency:'Agency',fixed:'Fixed',percent:'Percentage',open:'Unpaid',partial:'Partly paid',draft:'Draft',void:'Void','not invoiced':'Not invoiced'};
  const lbl=k=>k===null||k===undefined?'':t(LABELS[k]||String(k).replaceAll('_',' '));
  const go=id=>ui.go('#/deals/'+id);
  const choice=(name,options,value)=>ui.select(name,options.map(o=>typeof o==='object'?Object.assign({},o,{label:t(o.label)}):{value:o,label:lbl(o)}),value);
  const btn=(action,label,extra='')=>'<button class="btn '+extra+'" data-deal-action="'+h(action)+'">'+h(t(label))+'</button>';
  function redraw(){ui.dispatch();B.app.renderNav();}
  const modal=(title,body,submit,callback)=>ui.modal({title:t(title),body,wide:true,actions:[{label:t('Cancel'),kind:'ghost'},{label:t(submit),kind:'primary',onClick:m=>{const r=callback(m);if(r!==false){ui.toast(t('Saved'));redraw();} return r;}}]});
  const note=text=>'<p class="note">'+h(t(text))+'</p>';
  const link=(href,label)=>'<a href="'+h(href)+'">'+h(t(label))+'</a>';
  function list(params,q) {
    const rows=B.deals.list(D(),{status:q.status||null});
    const all=B.deals.list(D());const open=all.filter(d=>!['closed','cancelled','refunded'].includes(d.status));
    const sum=arr=>arr.reduce((a,d)=>a+d,0);
    ui.page({title:t('Property Deals'),actions:btn('new','New deal','primary')+' <a class="btn ghost" href="#/deal-reports">'+h(t('Deal reports'))+'</a>',
      body:'<div class="kpis kpis-3"><div class="kpi"><span class=\"kpi-label\">'+h(t('Open deals'))+'</span><span class="kpi-value">'+open.length+'</span></div>'+
        '<div class="kpi"><span class=\"kpi-label\">'+h(t('Expected commission'))+'</span><span class="kpi-value num">'+h(idr(sum(open.map(d=>d.expected_commission||0))))+'</span></div>'+
        '<div class="kpi"><span class=\"kpi-label\">'+h(t('Customer funds held'))+'</span><span class="kpi-value num">'+h(idr(sum(all.map(d=>d.titipan||0))))+'</span></div></div>'+
        '<div class="toolbar"><a class="btn ghost" href="#/deals">'+h(t('All'))+'</a>'+['prospect','booked','dp_paid','kpr_approved','akad','disbursed','handed_over','closed'].map(s=>' <a class="btn ghost" href="#/deals?status='+s+'">'+h(lbl(s))+'</a>').join('')+'</div>'+
        (rows.length?'<div class="table-wrap"><table class="data"><thead><tr><th>'+h(t('Deal'))+'</th><th>'+h(t('Project / Unit'))+'</th><th>'+h(t('Buyer'))+'</th><th>'+h(t('Status'))+'</th><th class="num">'+h(t('Price'))+'</th><th class="num">'+h(t('Titipan'))+'</th></tr></thead><tbody>'+rows.map(d=>'<tr class="link" data-deal="'+d.id+'"><td><strong>'+link('#/deals/'+d.id,d.number)+'</strong></td><td>'+h(d.project)+'<div class="sub">'+h([d.cluster,d.block,d.unit_no].filter(Boolean).join(' / '))+'</div></td><td>'+h(d.buyer_name||'—')+'</td><td>'+h(lbl(d.status))+'</td><td class="num">'+h(idr(d.price))+'</td><td class="num">'+h(idr(d.titipan))+'</td></tr>').join('')+'</tbody></table></div>':ui.empty(t('No property deals yet. Add a deal to track milestones, commission and titipan.')))});
    ui.$$('#main [data-deal]').forEach(tr=>tr.addEventListener('click',e=>{if(e.target.closest('a'))return;go(Number(tr.dataset.deal));}));
    ui.$('#page-actions [data-deal-action="new"]').onclick=()=>editDeal();
  }
  function editDeal(d) {
    d=d||{};
    const body='<div class="form-grid">'+
      field('Deal date',ctrl('deal_date',d.deal_date||B.util.today(),{type:'date'}))+
      field('Project',ctrl('project',d.project||'',{required:true}))+
      field('Cluster',ctrl('cluster',d.cluster||''))+
      field('Block / unit number',ctrl('unit_no',d.unit_no||''))+
      field('Property type',ctrl('unit_type',d.unit_type||''))+
      field('Land area (m²)',ctrl('land_area',d.land_area||''))+
      field('Building area (m²)',ctrl('building_area',d.building_area||''))+
      field('Certificate',ctrl('certificate_type',d.certificate_type||''))+
      field('Buyer',choice('buyer_id',contacts(),d.buyer_id||''))+
      field('Developer',choice('developer_id',contacts(),d.developer_id||''))+
      field('KPR bank',choice('bank_id',contacts(),d.bank_id||''))+
      field('Sales representative',choice('sales_rep_id',reps(),d.sales_rep_id||''))+
      field('Selling price · IDR',money('price',d.price||0))+
      field('Booking fee · IDR',money('booking_fee',d.booking_fee||0))+
      field('Down payment · IDR',money('dp',d.dp||0))+
      field('KPR amount · IDR',money('kpr_amount',d.kpr_amount||0))+
      field('Notes',ctrl('notes',d.notes||''))+'</div>'+
      note('Deals track agency commissions and money held for others. Units you own and resell are managed in Property Inventory.');
    modal(d.id?'Edit '+d.number:'New Property Deal',body,d.id?'Save':'Create deal',m=>{
      const f=form(m.body);['price','booking_fee','dp','kpr_amount'].forEach(k=>f[k]=readMoney(m.body,k));
      f.id=d.id||null;f.scheme='agency';const id=B.deals.save(D(),f);setTimeout(()=>go(id),0);
    });
  }
  function detail(params) {
    const id=Number(params.id),d=B.deals.detail(D(),id);
    const invoiceLink=c=>c.invoice_id?link('#/doc/'+c.invoice_id,c.invoice_number||'#'+c.invoice_id):'—';
    const journalLink=f=>link('#/journal/'+f.journal_entry_id,f.journal_number);
    const fieldRow=(label,value)=>'<div><dt>'+h(t(label))+'</dt><dd>'+h(value||'—')+'</dd></div>';
    ui.page({title:t('Property')+' · '+d.number,nav:'#/deals',actions:'<a class="btn ghost" href="#/deals">← '+h(t('Deals'))+'</a> '+btn('edit','Edit')+' '+(d.status==='closed'?btn('reopen','Reopen'):(['cancelled','refunded'].includes(d.status)?'':btn('close','Close deal')+' '+btn('cancel','Cancel deal','ghost'))),
      body:'<div class="kpis kpis-3"><div class="kpi"><span class=\"kpi-label\">'+h(t('Status'))+'</span><span class="kpi-value">'+h(lbl(d.status))+'</span></div><div class="kpi"><span class=\"kpi-label\">'+h(t('Price'))+'</span><span class="kpi-value num">'+h(idr(d.price))+'</span></div><div class="kpi"><span class=\"kpi-label\">'+h(t('Titipan outstanding'))+'</span><span class="kpi-value num">'+h(idr(d.titipan))+'</span></div></div>'+
      '<h3 class="section-title">'+h(t('Property & parties'))+'</h3><dl class="facts">'+[
        fieldRow('Project',d.project),fieldRow('Cluster',d.cluster),fieldRow('Block / Unit',[d.block,d.unit_no].filter(Boolean).join(' / ')),fieldRow('Property type',d.unit_type),
        fieldRow('Buyer',D().scalar('SELECT name FROM contacts WHERE id=?',[d.buyer_id])),fieldRow('Developer',D().scalar('SELECT name FROM contacts WHERE id=?',[d.developer_id])),
        fieldRow('Bank',D().scalar('SELECT name FROM contacts WHERE id=?',[d.bank_id])),fieldRow('Scheme',lbl(d.scheme)),fieldRow('KPR amount',idr(d.kpr_amount)),fieldRow('Notes',d.notes)
      ].join('')+'</dl>'+
      '<h3 class="section-title">'+h(t('Milestones'))+' '+btn('milestone','Add / update','ghost')+'</h3>'+table(['Milestone','Planned','Actual','Amount','Payment route'],d.milestones.map(m=>[h(lbl(m.kind)),date(m.planned_date),date(m.actual_date),idr(m.amount),m.through_us?t('Through us'):t('Direct / no cash')]))+
      '<h3 class="section-title">'+h(t('Commissions'))+' '+btn('commission','Add commission','ghost')+'</h3>'+table(['Payer','Trigger','Commission','Invoice',''],d.commissions.map(c=>[h(c.payer_name),h(lbl(c.trigger_kind)),idr(c.amount),invoiceLink(c),c.invoice_id?'':btn('invoice:'+c.id,'Prepare invoice')]))+
      '<h3 class="section-title">'+h(t('Titipan · receipts, remittances, offsets'))+' '+btn('fund','Record funds','ghost')+' '+btn('offset','Offset against invoice','ghost')+' '+btn('legacy','Link legacy titipan','ghost')+'</h3>'+table(['Date','Event','Amount','Journal','Receipt'],d.funds.map(f=>[date(f.date),h(lbl(f.kind)),idr(f.amount),journalLink(f),f.kind==='receipt'?btn('receipt:'+f.id,'Kwitansi'):'—']))+
      '<h3 class="section-title">'+h(t('Partners'))+' '+btn('share','Add partner share','ghost')+'</h3>'+table(['Partner','Treatment','Amount','Status',''],d.shares.map(s=>[h(s.contact_name),h(lbl(s.treatment)),idr(s.amount),h(lbl(s.status)),s.status==='agreed'?btn('accrue:'+s.id,'Accrue'):s.status==='accrued'?btn('payout:'+s.id,'Pay out'):'']))+
      note('Payments direct to a developer are recorded only as milestones. They do not create bank journal entries. All titipan is a liability, not revenue.')});
    ui.$$('#main [data-deal-action],#page-actions [data-deal-action]').forEach(el=>el.onclick=()=>action(el.dataset.dealAction,id,d));
  }
  function table(columns,rows){return rows.length?'<div class="table-wrap"><table class="data"><thead><tr>'+columns.map(c=>'<th>'+h(t(c))+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':note('No records yet.');}
  function action(act,id,d){
    if(act==='edit')return editDeal(d);
    if(act==='cancel')return modal('Cancel property deal',note('Customer funds must be fully refunded or remitted; posted commission invoices must be corrected first.')+
      field('Reason',ctrl('reason')),'Cancel deal',m=>{const f=form(m.body);B.deals.cancelDeal(D(),id,f.reason);});
    if(act==='close'||act==='reopen'){
      return ui.confirm(act==='close'?t('Close this deal? Titipan must be zero.'):t('Reopen this deal?'),{okLabel:act==='close'?t('Close deal'):t('Reopen')}).then(ok=>{if(!ok)return;try{B.deals[act](D(),id);redraw();}catch(e){ui.showError(e);}});
    }
    if(act==='milestone')return modal('Record property milestone','<div class="form-grid">'+
      field('Milestone',choice('kind',['booking','dp','sp3k','akad','pencairan','handover','ajb','confirmation']))+
      field('Planned date',ctrl('planned_date','',{type:'date'}))+
      field('Actual date',ctrl('actual_date',B.util.today(),{type:'date'}))+
      field('Amount IDR',money('amount'))+
      field('Paid through our company?',choice('through_us',[{value:'0',label:'No — paid directly / no cash'},{value:'1',label:'Yes — record cash separately'}]))+
      field('Reference',ctrl('reference'))+field('Notes',ctrl('notes'))+'</div>',
      'Save milestone',m=>{const f=form(m.body);f.amount=readMoney(m.body,'amount');f.through_us=f.through_us==='1';B.deals.milestone(D(),id,f);});
    if(act==='commission')return modal('Commission agreement','<div class="form-grid">'+
      field('Payer',choice('payer_id',contacts()))+
      field('Payer role',choice('payer_role',['developer','bank','buyer']))+
      field('Earning milestone',choice('trigger_kind',['akad','pencairan','confirmation']))+
      field('Calculation basis',choice('basis',[{value:'fixed',label:'Fixed IDR amount'},{value:'percent',label:'Percentage of deal price'}]))+
      field('Fixed amount IDR',money('amount'))+
      field('Percentage (if selected)',ctrl('rate','',''))+
      field('PPN',choice('tax_id',taxes()))+'</div>',
      'Add commission',m=>{const f=form(m.body);f.amount=readMoney(m.body,'amount');B.deals.addCommission(D(),id,f);});
    if(act.startsWith('invoice:'))return ui.confirm(t('Prepare a linked draft commission invoice? The milestone must already be recorded.'),{okLabel:t('Prepare invoice')}).then(ok=>{if(!ok)return;try{const doc=B.deals.generateInvoice(D(),Number(act.split(':')[1]),B.util.today());goDoc(doc);}catch(e){ui.showError(e);}});
    if(act==='fund')return modal('Record buyer funds held','<div class="form-grid">'+
      field('Movement',choice('kind',[{value:'receipt',label:'Received from buyer'},{value:'remit',label:'Remit to developer'},{value:'refund',label:'Refund buyer'}]))+
      field('Date',ctrl('date',B.util.today(),{type:'date'}))+
      field('Amount IDR',money('amount'))+
      field('Bank / Cash IDR',choice('bank_account_id',banks()))+
      field('Bank statement line (optional)',choice('bank_import_line_id',[{value:'',label:'Manual entry — no statement line'}].concat(D().all("SELECT id,date,amount,description FROM bank_import_lines WHERE status='new' ORDER BY date DESC LIMIT 100").map(r=>({value:r.id,label:r.date+' · '+idr(r.amount)+' · '+(r.description||'').slice(0,50)})))))+
      field('Reference',ctrl('reference'))+field('Memo',ctrl('memo'))+'</div>',
      'Post movement',m=>{const f=form(m.body);f.deal_id=id;f.amount=readMoney(m.body,'amount');B.deals.moveFund(D(),f);});
    if(act==='legacy') {
      const rows=B.deals.legacyUnassigned(D());
      if(!rows.length){ui.toast(t('No unassigned historical titipan journal lines.'));return;}
      return modal('Link existing titipan journal (no reposting)',note('Select an original posted ledger line. This links history to the deal without moving money again.')+
        field('Journal line',choice('line_id',rows.map(r=>({value:r.line_id,label:r.date+' · '+r.number+' · '+idr(r.credit_base-r.debit_base)}))))+
        field('Notes',ctrl('notes')),'Link transaction',m=>{const f=form(m.body);B.deals.linkLegacy(D(),id,Number(f.line_id),f.notes);});
    }
    if(act.startsWith('receipt:')) {
      try {
        const html=B.deals.receipt(D(),Number(act.split(':')[1]));
        return ui.modal({title:t('Kwitansi Titipan'),wide:true,body:'<div id="deal-receipt-paper"></div>',
          onOpen:m=>B.ui2.showPaper(ui.$('#deal-receipt-paper',m.body),html),
          actions:[{label:'Close',kind:'ghost'},{label:'Print',kind:'primary',onClick:m=>{B.ui2.printPaper(ui.$('#deal-receipt-paper',m.body),'Kwitansi Titipan');return false;}}]});
      } catch(e){ui.showError(e);return;}
    }
    if(act==='offset')return modal('Offset commission against titipan',note('Only use when the written agreement authorizes offset. PPh withheld is recorded as prepaid PPh, not cash.')+'<div class="form-grid">'+
      field('Commission invoice',choice('invoice_id',d.commissions.filter(c=>c.invoice_id && ['open','partial'].includes(c.invoice_status)).map(c=>({value:c.invoice_id,label:c.invoice_number+' · '+idr(c.invoice_total-c.invoice_paid)}))))+
      field('Date',ctrl('date',B.util.today(),{type:'date'}))+
      field('Gross invoice cleared IDR',money('amount'))+
      field('PPh 23 withheld IDR',money('withholding'))+
      field('Reference / memo',ctrl('memo'))+'</div>',
      'Post offset',m=>{const f=form(m.body);f.deal_id=id;f.amount=readMoney(m.body,'amount');f.withholding=readMoney(m.body,'withholding');B.deals.offset(D(),f);});
    if(act==='share')return modal('Record partner/co-broke share','<div class="form-grid">'+
      field('Partner',choice('contact_id',contacts()))+
      field('Treatment',choice('treatment',[{value:'principal',label:'Principal (gross revenue + partner expense)'},{value:'agent',label:'Agent — contract review required before posting'}]))+
      field('Agreed amount IDR',money('amount'))+
      field('Share percentage (optional)',ctrl('percentage'))+field('Reference',ctrl('reference'))+'</div>',
      'Save agreement',m=>{const f=form(m.body);f.amount=readMoney(m.body,'amount');B.deals.addShare(D(),id,f);});
    if(act.startsWith('accrue:'))return ui.confirm(t('Accrue the partner amount as an expense and partner payable?'),{okLabel:t('Post accrual')}).then(ok=>{if(!ok)return;try{B.deals.accrueShare(D(),Number(act.split(':')[1]),B.util.today());redraw();}catch(e){ui.showError(e);}});
    if(act.startsWith('payout:'))return modal('Pay partner share',field('Date',ctrl('date',B.util.today(),{type:'date'}))+field('Bank',choice('bank',banks())),
      'Post payout',m=>{const f=form(m.body);B.deals.payoutShare(D(),Number(act.split(':')[1]),f.date,Number(f.bank));});
  }
  function goDoc(doc){ui.go('#/doc/'+doc);}
  function reports(){
    const d=D(),trial=B.deals.trial(d),funds=B.deals.fundReport(d),comm=B.deals.commissionReport(d);
    ui.page({title:t('Property Deal Reports'),nav:'#/deal-reports',actions:'<a class="btn ghost" href="#/deals">'+h(t('View deals'))+'</a>',body:
      '<div class="kpis kpis-3"><div class="kpi"><span class=\"kpi-label\">'+h(t('Allocated titipan'))+'</span><span class="kpi-value num">'+h(idr(trial.allocated))+'</span></div><div class="kpi"><span class=\"kpi-label\">'+h(t('Ledger liability balance'))+'</span><span class="kpi-value num">'+h(idr(trial.ledger))+'</span></div><div class="kpi"><span class=\"kpi-label\">'+h(t('Unassigned historical balance'))+'</span><span class="kpi-value num">'+h(idr(trial.unassigned))+'</span></div></div>'+note('Unassigned means legacy or manual customer funds cannot yet be attributed to a Deal. Do not treat this as settled.')+
      '<h3 class="section-title">'+h(t('Deals with unsettled customer funds'))+'</h3>'+table(['Deal','Project','Buyer','Balance'],funds.map(f=>[link('#/deals/'+f.id,f.number),h(f.project),h(f.buyer_name||'—'),idr(f.titipan)]))+
      '<h3 class="section-title">'+h(t('Commission pipeline'))+'</h3>'+table(['Deal','Payer','Agreed','Invoice','Paid','Status'],comm.map(c=>[link('#/deals/'+c.deal_id,c.deal_number),h(c.payer_name),idr(c.amount),h(c.invoice_number||'—'),idr(c.amount_paid||0),h(lbl(c.invoice_status||'not invoiced'))]))});
  }
  ui.route('/deals',list);ui.route('/deals/:id',detail);ui.route('/deal-reports',reports);
  B.dealsUI={list,detail,reports};
})();
